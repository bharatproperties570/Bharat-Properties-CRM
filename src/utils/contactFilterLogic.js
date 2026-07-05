
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

        // 3. Professional Fields (Multi-Select)
        if (filters.professionCategory?.length > 0) {
            if (!filters.professionCategory.includes(contact.professionCategory?.lookup_value || contact.professionCategory)) return false;
        }
        if (filters.professionSubCategory?.length > 0) {
            if (!filters.professionSubCategory.includes(contact.professionSubCategory?.lookup_value || contact.professionSubCategory)) return false;
        }
        if (filters.designation?.length > 0) {
            if (!filters.designation.includes(contact.designation?.lookup_value || contact.designation)) return false;
        }

        // 4. Company (Text Search)
        if (filters.company) {
            const companyName = contact.company || "";
            if (!companyName.toLowerCase().includes(filters.company.toLowerCase())) return false;
        }

        // 5. Address Fields (Multi-Select - Check Personal)
        if (filters.country?.length > 0 && !filters.country.includes(contact.personalAddress?.country?.lookup_value || contact.personalAddress?.country)) return false;
        if (filters.state?.length > 0 && !filters.state.includes(contact.personalAddress?.state?.lookup_value || contact.personalAddress?.state)) return false;
        if (filters.city?.length > 0 && !filters.city.includes(contact.personalAddress?.city?.lookup_value || contact.personalAddress?.city)) return false;
        if (filters.location?.length > 0 && !filters.location.includes(contact.personalAddress?.location?.lookup_value || contact.personalAddress?.location)) return false;
        if (filters.tehsil?.length > 0 && !filters.tehsil.includes(contact.personalAddress?.tehsil?.lookup_value || contact.personalAddress?.tehsil)) return false;
        if (filters.postOffice?.length > 0 && !filters.postOffice.includes(contact.personalAddress?.postOffice?.lookup_value || contact.personalAddress?.postOffice)) return false;
        if (filters.pinCode?.length > 0 && !filters.pinCode.includes(contact.personalAddress?.pinCode?.lookup_value || contact.personalAddress?.pinCode)) return false;

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
