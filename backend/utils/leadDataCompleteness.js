/**
 * Calculates if a Lead has 80% or more of its Requirement and Location data filled.
 */
export const checkLeadQualifiedStatus = (lead) => {
    if (!lead) return false;

    // Define the core fields that represent Requirement and Location pages
    const coreFields = [
        'requirement',
        'subRequirement',
        'budget',
        'propertyType',
        'subType',
        'unitType',
        'sizeType',
        'purpose',
        'timeline',
        'location',
        'locCity',
        'locArea'
    ];

    let filledCount = 0;

    for (const field of coreFields) {
        const value = lead[field];
        if (value !== undefined && value !== null && value !== '') {
            if (Array.isArray(value)) {
                if (value.length > 0) filledCount++;
            } else {
                filledCount++;
            }
        }
    }

    const percentage = (filledCount / coreFields.length) * 100;
    return percentage >= 80;
};
