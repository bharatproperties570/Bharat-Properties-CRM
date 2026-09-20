import OutboxEvent from '../models/OutboxEvent.js';
import { domainEventQueue } from '../src/queues/domainEventQueue.js';
import { v4 as uuidv4 } from 'uuid';

const PUBLISHER_ID = `pub-${uuidv4()}`;
const LEASE_DURATION_MS = 30000; // 30 seconds
const MAX_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 2000;

class OutboxPublisher {
    constructor() {
        this.isRunning = false;
        this.interval = null;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.interval = setInterval(() => this.poll(), POLL_INTERVAL_MS);
        console.log(`[OutboxPublisher] Started publisher ${PUBLISHER_ID}`);
    }

    stop() {
        this.isRunning = false;
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        console.log(`[OutboxPublisher] Stopped publisher ${PUBLISHER_ID}`);
    }

    async poll() {
        if (!this.isRunning) return;
        
        try {
            const event = await this.claimEvent();
            if (event) {
                await this.publishEvent(event);
            }
        } catch (err) {
            console.error(`[OutboxPublisher] Error during poll: ${err.message}`);
        }
    }

    async claimEvent() {
        const now = new Date();
        const lockedUntilTime = new Date(now.getTime() + LEASE_DURATION_MS);

        // Atomic claim: either PENDING and ready, or PROCESSING and stale lease
        const event = await OutboxEvent.findOneAndUpdate(
            {
                $or: [
                    { status: 'PENDING', availableAt: { $lte: now } },
                    { status: 'PROCESSING', lockedUntil: { $lte: now } }
                ]
            },
            {
                $set: {
                    status: 'PROCESSING',
                    lockedBy: PUBLISHER_ID,
                    lockedUntil: lockedUntilTime
                },
                $inc: { attempts: 1 }
            },
            { new: true, sort: { availableAt: 1 } }
        );

        return event;
    }

    async publishEvent(event) {
        try {
            if (event.attempts > MAX_ATTEMPTS) {
                await this.markTerminalFailure(event, 'Exceeded maximum publication attempts');
                return;
            }

            // Publish to BullMQ
            const jobPayload = {
                eventId: event.eventId,
                eventType: event.eventType,
                aggregateType: event.aggregateType,
                aggregateId: event.aggregateId,
                payload: event.payload,
                correlationId: event.correlationId
            };

            await domainEventQueue.add(event.eventType, jobPayload, {
                jobId: event.eventId, // Native deduplication
                removeOnComplete: true,
                removeOnFail: false
            });

            // Mark PUBLISHED
            await OutboxEvent.updateOne(
                { _id: event._id },
                {
                    $set: {
                        status: 'PUBLISHED',
                        publishedAt: new Date(),
                        lockedBy: null,
                        lockedUntil: null,
                        lastError: null
                    }
                }
            );

            console.log(`[OutboxPublisher] Successfully published ${event.eventType} for ${event.aggregateType} ${event.aggregateId} (eventId: ${event.eventId})`);

        } catch (err) {
            console.error(`[OutboxPublisher] Transient publication failure for event ${event.eventId}: ${err.message}`);
            
            // Calculate deterministic exponential backoff
            const backoffMs = Math.pow(2, event.attempts) * 1000; 
            const nextAvailable = new Date(Date.now() + backoffMs);

            await OutboxEvent.updateOne(
                { _id: event._id },
                {
                    $set: {
                        status: 'PENDING',
                        availableAt: nextAvailable,
                        lockedBy: null,
                        lockedUntil: null,
                        lastError: err.message
                    }
                }
            );
        }
    }

    async markTerminalFailure(event, reason) {
        console.error(`[OutboxPublisher] Terminal failure for event ${event.eventId}: ${reason}`);
        await OutboxEvent.updateOne(
            { _id: event._id },
            {
                $set: {
                    status: 'FAILED',
                    lockedBy: null,
                    lockedUntil: null,
                    lastError: reason
                }
            }
        );
    }
}

export const outboxPublisher = new OutboxPublisher();
