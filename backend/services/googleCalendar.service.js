import { getCalendarService } from '../utils/googleAuth.js';

/**
 * Google Calendar Service
 * Syncs CRM activities to Google Calendar API
 */

export const createGoogleCalendarEvent = async (activity) => {
    const calendar = await getCalendarService();
    if (!calendar) return null;

    try {
        // Construct start and end dates
        const start = new Date(activity.dueDate);
        if (activity.dueTime) {
            const [hours, minutes] = activity.dueTime.split(':');
            start.setHours(parseInt(hours), parseInt(minutes));
        }
        
        const end = new Date(start.getTime() + 60 * 60 * 1000); // Default 1 hour duration

        const event = {
            summary: `${activity.type}: ${activity.subject}`,
            description: activity.description || '',
            start: {
                dateTime: start.toISOString(),
                timeZone: 'Asia/Kolkata', // Default to India time
            },
            end: {
                dateTime: end.toISOString(),
                timeZone: 'Asia/Kolkata',
            },
            attendees: activity.participants?.map(p => ({
                displayName: p.name,
                email: p.email,
                comment: `Mobile: ${p.mobile}`
            })).filter(a => a.email) || [],
            extendedProperties: {
                private: {
                    crmActivityId: activity._id.toString(),
                    entityType: activity.entityType,
                    entityId: activity.entityId?.toString() || ''
                }
            },
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'popup', minutes: 30 },
                    { method: 'email', minutes: 60 }
                ]
            }
        };

        const response = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: event,
        });

        return response.data.id;
    } catch (error) {
        console.error('Error creating Google Calendar Event:', error.message);
        return null;
    }
};

export const updateGoogleCalendarEvent = async (googleEventId, activity) => {
    const calendar = await getCalendarService();
    if (!calendar) return null;

    try {
        const start = new Date(activity.dueDate);
        if (activity.dueTime) {
            const [hours, minutes] = activity.dueTime.split(':');
            start.setHours(parseInt(hours), parseInt(minutes));
        }
        const end = new Date(start.getTime() + 60 * 60 * 1000);

        await calendar.events.update({
            calendarId: 'primary',
            eventId: googleEventId,
            requestBody: {
                summary: `${activity.type}: ${activity.subject}`,
                description: activity.description || '',
                start: { dateTime: start.toISOString(), timeZone: 'Asia/Kolkata' },
                end: { dateTime: end.toISOString(), timeZone: 'Asia/Kolkata' },
                attendees: activity.participants?.map(p => ({
                    displayName: p.name,
                    email: p.email
                })).filter(a => a.email) || []
            }
        });
        return true;
    } catch (error) {
        console.error('Error updating Google Calendar Event:', error.message);
        return false;
    }
};

export const deleteGoogleCalendarEvent = async (googleEventId) => {
    const calendar = await getCalendarService();
    if (!calendar) return null;

    try {
        await calendar.events.delete({
            calendarId: 'primary',
            eventId: googleEventId
        });
        return true;
    } catch (error) {
        console.error('Error deleting Google Calendar Event:', error.message);
        return false;
    }
};
