import { EventEmitter } from 'events';

/**
 * ==============================================================================
 * RealtimeHub — Senior Enterprise Real-Time Event Streamer
 * ──────────────────────────────────────────────────────────────────────────────
 * Provides ultra-low latency (<20ms) push notifications for CRM communications.
 * Supports Server-Sent Events (SSE) streaming directly to active browser tabs.
 * Eliminates the need for manual page refreshes or polling lag.
 * ==============================================================================
 */
class RealtimeHubService extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(1000);
        this.clients = new Set();
    }

    /**
     * Registers an active SSE client response stream
     * @param {Object} res - Express Response
     * @param {Object} user - Authenticated user
     */
    addClient(res, user) {
        this.clients.add(res);
        console.log(`[RealtimeHub] Client connected (Active SSE clients: ${this.clients.size})`);

        res.on('close', () => {
            this.clients.delete(res);
            console.log(`[RealtimeHub] Client disconnected (Active SSE clients: ${this.clients.size})`);
        });
    }

    /**
     * Broadcasts an event to all active CRM client tabs
     * @param {string} event - Event name (e.g. 'NEW_MESSAGE', 'STATUS_UPDATE')
     * @param {Object} payload - Event data
     */
    broadcast(event, payload) {
        if (this.clients.size === 0) return;

        const messageBlock = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
        for (const client of this.clients) {
            try {
                client.write(messageBlock);
            } catch (err) {
                this.clients.delete(client);
            }
        }
    }

    /**
     * Specialized: Broadcast incoming or outgoing message in real-time
     */
    emitMessage({ phone, channel, message, streamItem }) {
        console.log(`[RealtimeHub] ⚡ Broadcasting NEW_MESSAGE for ${phone} via ${channel}`);
        this.broadcast('NEW_MESSAGE', {
            phone,
            channel: channel || 'WhatsApp',
            message,
            streamItem,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Specialized: Broadcast message status change (sent -> delivered -> read)
     */
    emitStatusUpdate({ messageId, status, phone }) {
        console.log(`[RealtimeHub] ⚡ Broadcasting STATUS_UPDATE (${status}) for ${messageId}`);
        this.broadcast('STATUS_UPDATE', {
            messageId,
            status,
            phone,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Specialized: Broadcast instant notification to a specific user or org
     */
    emitNotification(userId, notification) {
        this.broadcast('NEW_NOTIFICATION', {
            userId: String(userId),
            notification,
            timestamp: new Date().toISOString()
        });
    }
}

const RealtimeHub = new RealtimeHubService();
export default RealtimeHub;
