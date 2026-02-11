import { dealsData, inventoryData } from '../data/mockData';

export const parsePrice = (priceStr) => {
    if (!priceStr && priceStr !== 0) return 0;
    if (typeof priceStr === 'number') return priceStr;
    return parseFloat(String(priceStr).replace(/,/g, '').replace(/[^\d.]/g, '')) || 0;
};

export const parseBudget = (budgetStr) => {
    if (!budgetStr && budgetStr !== 0) return { min: 0, max: 0 };
    if (typeof budgetStr === 'number') return { min: budgetStr, max: budgetStr };
    const numbers = String(budgetStr).replace(/[^\d-]/g, '').split('-').map(n => parseFloat(n) || 0);
    if (numbers.length === 1) return { min: numbers[0], max: numbers[0] };
    return { min: numbers[0], max: numbers[1] };
};

export const parseSizeSqYard = (sizeStr) => {
    if (!sizeStr) return 0;
    if (typeof sizeStr === 'number') return sizeStr;
    const match = sizeStr.match(/\(([\d.]+)\s*Sq Yard\)/);
    if (match) return parseFloat(match[1]);
    const marlaMatch = sizeStr.match(/([\d.]+)\s*Marla/);
    if (marlaMatch) return parseFloat(marlaMatch[1]) * 30.25;
    return parseFloat(sizeStr.replace(/[^\d.]/g, '')) || 0;
};

// Utility to normalize items for matching
export const normalizeCandidate = (item) => ({
    ...item,
    _normalizedPrice: parsePrice(item.price),
    _normalizedSize: parseSizeSqYard(item.size),
    _lowerLocation: (item.location?.lookup_value || item.location || '').toLowerCase(),
    _lowerProject: (item.projectName || item.project?.name || '').toLowerCase(),
    _lowerType: (item.propertyType?.lookup_value || item.propertyType || item.type?.lookup_value || item.type || '').toLowerCase()
});

export const calculateMatch = (lead, leadContext, weights, options = { includeNearby: true, minMatchScore: 20 }, candidates = []) => {
    if (!lead || !leadContext) return [];

    const normalizedCandidates = candidates.map(normalizeCandidate);

    const { baseBudget, leadSize, leadType, leadLocation, leadLocationSectors } = leadContext;
    const budgetFlexibility = options.budgetFlexibility || 10;

    const flexibleBudget = {
        min: baseBudget.min * (1 - budgetFlexibility / 100),
        max: baseBudget.max * (1 + budgetFlexibility / 100)
    };

    const totalPossibleScore = (weights.location || 0) + (weights.type || 0) + (weights.budget || 0) + (weights.size || 0);

    return normalizedCandidates.map((item, index) => {
        let score = 0;
        const details = { location: 'mismatch', type: 'mismatch', budget: 'mismatch', size: 'mismatch' };
        const gaps = [];

        // Location Match
        const itemLocation = item._lowerLocation;
        const itemProject = item._lowerProject;

        if ((itemLocation && leadLocation.includes(itemLocation)) || (itemProject && leadLocation.includes(itemProject))) {
            score += weights.location;
            details.location = 'match';
        } else if (options.includeNearby && itemLocation && leadLocationSectors.some(loc => itemLocation.includes(loc) || loc.includes(itemLocation))) {
            score += (weights.location * 0.66);
            details.location = 'partial';
        } else {
            gaps.push('Location mismatch');
        }

        // Type Match
        if (leadType && item._lowerType && (leadType.includes(item._lowerType) || item._lowerType.includes(leadType))) {
            score += weights.type;
            details.type = 'match';
        } else if (options.isTypeFlexible) {
            score += (weights.type * 0.5); // 50% score for type flexibility
            details.type = 'partial';
            gaps.push(`${item.propertyType?.lookup_value || item.propertyType || item.type} (Type Flex)`);
        } else {
            const itemTypeName = item.propertyType?.lookup_value || item.propertyType || item.type?.lookup_value || item.type;
            const leadTypeName = lead.req?.type?.lookup_value || lead.req?.type;
            gaps.push(`${itemTypeName} vs ${leadTypeName}`);
        }

        // Price/Budget Match
        const itemPrice = item._normalizedPrice;
        if (itemPrice >= flexibleBudget.min && itemPrice <= flexibleBudget.max) {
            score += weights.budget;
            details.budget = 'match';
        } else if (itemPrice > 0 && flexibleBudget.max > 0) {
            const avg = (flexibleBudget.min + flexibleBudget.max) / 2;
            const diff = Math.abs(itemPrice - avg);
            const proximity = Math.max(0, weights.budget - (diff / avg) * (weights.budget * 2));
            score += proximity;
            if (proximity > (weights.budget * 0.6)) details.budget = 'partial';
            else gaps.push(`₹${Math.round(Math.abs(itemPrice - baseBudget.max) / 100000)}L over budget`);
        }

        // Size Match
        const itemSize = item._normalizedSize;
        const sizeFlexPercent = options.sizeFlexibility || 0;
        const flexibleSize = {
            min: leadSize * (1 - sizeFlexPercent / 100),
            max: leadSize * (1 + sizeFlexPercent / 100)
        };

        if (leadSize > 0 && itemSize > 0) {
            if (itemSize >= flexibleSize.min && itemSize <= flexibleSize.max) {
                score += weights.size;
                details.size = 'match';
            } else {
                const diff = Math.abs(itemSize - leadSize);
                const proximity = Math.max(0, weights.size - (diff / leadSize) * (weights.size * 4));
                score += proximity;
                if (proximity > (weights.size * 0.4)) details.size = 'partial';
                else gaps.push('Size significant diff');
            }
        } else if (itemSize > 0 || leadSize > 0) {
            score += (weights.size * (options.isSizeFlexible ? 0.6 : 0.4));
            details.size = 'partial';
        }

        const matchPercentage = Math.round((score / totalPossibleScore) * 100);

        if (matchPercentage < options.minMatchScore) return null;

        return {
            ...item,
            matchPercentage,
            matchDetails: details,
            gaps,
            marketStatus: score > (totalPossibleScore * 0.6) ? (index % 3 === 0 ? 'Below Market' : 'Fair Price') : 'Premium',
            thumbnail: `https://picsum.photos/seed/${item._id || item.id || item.unitNo}/200/150`
        };
    }).filter(Boolean)
        .sort((a, b) => b.matchPercentage - a.matchPercentage);
};
