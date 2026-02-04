
// ==================================================================================
// CONTACT FILTERING LOGIC
// ==================================================================================

export const applyContactFilters = (contacts, filters) => {
    if (!contacts) return [];

    return contacts.filter(contact => {
        // 1. Status Filter (Multi-Select)
        if (filters.status && filters.status.length > 0) {
            const contactStatus = contact.status || 'Active'; // Default to Active? Or check what's in data
            if (!filters.status.includes(contactStatus)) return false;
        }

        // 2. Source Filter (Multi-Select)
        if (filters.source && filters.source.length > 0) {
            if (!filters.source.includes(contact.source)) return false;
        }

        // 3. Profession Category (Multi-Select)
        if (filters.professionCategory && filters.professionCategory.length > 0) {
            if (!filters.professionCategory.includes(contact.professionCategory)) return false;
        }

        // 4. Company (Text Search)
        if (filters.company) {
            const companyName = contact.company || "";
            if (!companyName.toLowerCase().includes(filters.company.toLowerCase())) return false;
        }

        // 5. City (Text Search - Check Personal & Correspondence)
        if (filters.city) {
            const pCity = contact.personalAddress?.city || "";
            const cCity = contact.correspondenceAddress?.city || "";
            const term = filters.city.toLowerCase();

            if (!pCity.toLowerCase().includes(term) && !cCity.toLowerCase().includes(term)) return false;
        }

        // 6. Tags (Multi-Select - Match ANY tag)
        if (filters.tags && filters.tags.length > 0) {
            const contactTags = contact.tags || [];
            // Check if contact has AT LEAST ONE of the selected tags
            const hasTag = filters.tags.some(tag => contactTags.includes(tag));
            if (!hasTag) return false;
        }

        // 7. Owner (Text Match)
        if (filters.owner) {
            const ownerName = contact.owner || ""; // Assuming owner name or ID string
            if (!ownerName.toLowerCase().includes(filters.owner.toLowerCase())) return false;
        }

        return true;
    });
};
