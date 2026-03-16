import { Worker } from 'bullmq';
import redisConnection from '../config/redis.js';
import Contact from '../../models/Contact.js';
import Activity from '../../models/Activity.js';
import { createGoogleContact, updateGoogleContact, deleteGoogleContact } from '../../services/googleContacts.service.js';
import { createGoogleCalendarEvent, updateGoogleCalendarEvent, deleteGoogleCalendarEvent } from '../../services/googleCalendar.service.js';

/**
 * Google Sync Worker
 * Processes background synchronization jobs for Google Contacts and Calendar
 */

const worker = new Worker('googleSyncQueue', async (job) => {
    const type = job.name;
    const data = job.data;
    console.log(`[GoogleSyncWorker] Processing job ${job.id} of type ${type}`);

    try {
        switch (type) {
            case 'syncContact': {
                const contact = await Contact.findById(data.contactId);
                if (!contact) return;

                if (contact.googleContactId) {
                    await updateGoogleContact(contact.googleContactId, contact);
                } else {
                    const googleContactId = await createGoogleContact(contact);
                    if (googleContactId) {
                        await Contact.findByIdAndUpdate(contact._id, { googleContactId });
                    }
                }
                break;
            }

            case 'deleteContact': {
                if (data.googleContactId) {
                    await deleteGoogleContact(data.googleContactId);
                }
                break;
            }

            case 'syncEvent': {
                const activity = await Activity.findById(data.activityId);
                if (!activity) return;

                // Only sync specific types to calendar
                const syncableTypes = ['Meeting', 'Site Visit', 'Call', 'Task'];
                if (!syncableTypes.includes(activity.type)) return;

                if (activity.googleEventId) {
                    await updateGoogleCalendarEvent(activity.googleEventId, activity);
                } else {
                    const googleEventId = await createGoogleCalendarEvent(activity);
                    if (googleEventId) {
                        await Activity.findByIdAndUpdate(activity._id, { googleEventId });
                    }
                }
                break;
            }

            case 'deleteEvent': {
                if (data.googleEventId) {
                    await deleteGoogleCalendarEvent(data.googleEventId);
                }
                break;
            }

            default:
                console.warn(`[GoogleSyncWorker] Unknown job type: ${type}`);
        }
    } catch (error) {
        console.error(`[GoogleSyncWorker] Job ${job.id} failed:`, error.message);
        throw error; // Let BullMQ handle retries
    }
}, { connection: redisConnection });

worker.on('completed', (job) => {
    console.log(`[GoogleSyncWorker] Job ${job.id} completed successfully`);
});

worker.on('failed', (job, err) => {
    console.error(`[GoogleSyncWorker] Job ${job.id} failed with error:`, err.message);
});

export default worker;
