/**
 * Simple In-memory storage for Mock Mode
 */
class MockStore {
    constructor() {
        this.leads = [];
        this.contacts = [];
        this.inventory = [];
    }

    // Lead Methods
    getLeads(query, page, limit) {
        const start = (page - 1) * limit;
        const end = start + limit;
        return {
            docs: this.leads.slice(start, end),
            totalDocs: this.leads.length,
            limit,
            totalPages: Math.ceil(this.leads.length / limit),
            page
        };
    }

    addLead(lead) {
        const newLead = { ...lead, _id: Date.now().toString(), createdAt: new Date() };
        this.leads.unshift(newLead);
        return newLead;
    }

    // Contact Methods
    getContacts(query, page, limit) {
        const start = (page - 1) * limit;
        const end = start + limit;
        return {
            docs: this.contacts.slice(start, end),
            totalDocs: this.contacts.length,
            limit,
            totalPages: Math.ceil(this.contacts.length / limit),
            page
        };
    }

    addContact(contact) {
        const newContact = { ...contact, _id: Date.now().toString(), createdAt: new Date() };
        this.contacts.unshift(newContact);
        return newContact;
    }
}

const mockStore = new MockStore();
export default mockStore;
