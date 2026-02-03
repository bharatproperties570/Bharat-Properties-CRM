
// ==================================================================================
// LEAD FILTERING LOGIC
// ==================================================================================

export const applyLeadFilters = (leads, filters) => {
    if (!leads) return [];

    return leads.filter(lead => {
        // 1. Status Filter (Multi-Select)
        if (filters.status && filters.status.length > 0) {
            const leadStatus = lead.status?.label || lead.status; // Handle object or string
            if (!filters.status.includes(leadStatus)) return false;
        }

        // 2. Stage Filter (Multi-Select)
        // Assuming lead has a 'stage' field, or we infer it from somewhere. 
        // Based on analysis, 'status' seems to often cover stage-like things (New, Working), 
        // but real CRM usually has a distinct Stage. We'll check 'stage' if it exists.
        if (filters.stage && filters.stage.length > 0) {
            // Check implicit stage from status if stage not explicit
            // Or check actual stage field
            const leadStage = lead.stage || (lead.status?.label || lead.status);
            if (!filters.stage.includes(leadStage)) return false;
        }

        // 3. Source Filter (Multi-Select)
        if (filters.source && filters.source.length > 0) {
            if (!filters.source.includes(lead.source)) return false;
        }

        // 4. Requirement Intent (Buy/Rent)
        if (filters.intent) {
            // Intent is usually inside lead.req.type (e.g., "Buy Residential")
            // or lead.requirement field directly. 
            // We'll normalize to check availability.
            const reqType = lead.req?.type || lead.requirement || "";
            if (!reqType.toLowerCase().includes(filters.intent.toLowerCase())) return false;
        }

        // 5. Property Category (Residential, Commercial, etc.)
        if (filters.category && filters.category.length > 0) {
            const reqType = lead.req?.type || lead.propertyType || "";
            // Check if ANY selected category is present in the requirement string
            const hasCategory = filters.category.some(cat => reqType.includes(cat));
            if (!hasCategory) return false;
        }

        // 6. Budget Range
        // Budget in lead might be string "₹50 Lakh - ₹1 Cr" or numeric fields budgetMin/budgetMax
        // We'll try to parse or use raw values if available
        if (filters.budgetMin || filters.budgetMax) {
            // Attempt to get a numeric representative value for the lead
            // If lead has raw numbers:
            let leadBudget = 0;
            if (lead.budgetMin) leadBudget = parseFloat(lead.budgetMin);
            else if (lead.budgetMax) leadBudget = parseFloat(lead.budgetMax);
            else {
                // Try to parse from string if numbers missing (fallback)
                // This is complex, so we might skip strict parsing if raw data isn't clean.
                // Ideally, we depend on raw numbers being present.
            }

            // Simplification: Only filter if we have valid numeric data on lead
            if (leadBudget > 0) {
                if (filters.budgetMin && leadBudget < parseFloat(filters.budgetMin)) return false;
                if (filters.budgetMax && leadBudget > parseFloat(filters.budgetMax)) return false;
            }
        }

        // 7. Location (Text Search)
        if (filters.location) {
            const locationStr = lead.location || "";
            // Simple case-insensitive match
            if (!locationStr.toLowerCase().includes(filters.location.toLowerCase())) return false;
        }

        // 8. Owner/Team
        if (filters.owner && filters.owner.length > 0) {
            if (!filters.owner.includes(lead.owner)) return false;
        }

        if (filters.team && filters.team.length > 0) {
            if (!filters.team.includes(lead.team)) return false;
        }

        return true;
    });
};
