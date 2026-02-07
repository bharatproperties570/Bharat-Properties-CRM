export const calculateMatchScore = (lead, inventory) => {
    let score = 0;

    // Budget Match (30 points)
    if (inventory.price >= lead.budgetMin && inventory.price <= lead.budgetMax) {
        score += 30;
    }

    // Type Match (30 points)
    if (lead.req && inventory.propertyType && lead.req.toLowerCase().includes(inventory.propertyType.toLowerCase())) {
        score += 30;
    }

    // Location Match (40 points)
    if (lead.location && inventory.city && lead.location.toLowerCase().includes(inventory.city.toLowerCase())) {
        score += 40;
    }

    return score;
};
