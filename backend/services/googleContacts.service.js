import { getPeopleService } from '../utils/googleAuth.js';

/**
 * Google Contacts Service
 * Syncs CRM contacts to Google People API
 */

export const createGoogleContact = async (contact) => {
    const people = await getPeopleService();
    if (!people) return null;

    try {
        const response = await people.people.createContact({
            requestBody: {
                names: [{ givenName: contact.name, familyName: contact.surname || '' }],
                phoneNumbers: contact.phones?.map(p => ({ value: p.number, type: p.type || 'mobile' })) || [],
                emailAddresses: contact.emails?.map(e => ({ value: e.address, type: e.type || 'home' })) || [],
                userDefined: [
                    { key: 'CRM_ID', value: contact._id.toString() }
                ]
            }
        });
        return response.data.resourceName; // This is the Google ID
    } catch (error) {
        console.error('Error creating Google Contact:', error.message);
        return null;
    }
};

export const updateGoogleContact = async (googleContactId, contact) => {
    const people = await getPeopleService();
    if (!people) return null;

    try {
        // Fetch current person to get etag
        const current = await people.people.get({
            resourceName: googleContactId,
            personFields: 'names,phoneNumbers,emailAddresses,metadata'
        });

        await people.people.updateContact({
            resourceName: googleContactId,
            updatePersonFields: 'names,phoneNumbers,emailAddresses',
            requestBody: {
                etag: current.data.etag,
                names: [{ givenName: contact.name, familyName: contact.surname || '' }],
                phoneNumbers: contact.phones?.map(p => ({ value: p.number, type: p.type || 'mobile' })) || [],
                emailAddresses: contact.emails?.map(e => ({ value: e.address, type: e.type || 'home' })) || []
            }
        });
        return true;
    } catch (error) {
        console.error('Error updating Google Contact:', error.message);
        return false;
    }
};

export const deleteGoogleContact = async (googleContactId) => {
    const people = await getPeopleService();
    if (!people) return null;

    try {
        await people.people.deleteContact({ resourceName: googleContactId });
        return true;
    } catch (error) {
        console.error('Error deleting Google Contact:', error.message);
        return false;
    }
};
