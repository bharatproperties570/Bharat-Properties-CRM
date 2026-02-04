import { dealsData, inventoryData } from '../data/mockData';

export const parsePrice = (priceStr) => {
    if (!priceStr) return 0;
    if (typeof priceStr === 'number') return priceStr;
    return parseFloat(priceStr.replace(/,/g, '').replace(/[^\d.]/g, '')) || 0;
};

export const parseBudget = (budgetStr) => {
    if (!budgetStr) return { min: 0, max: 0 };
    const numbers = budgetStr.replace(/[^\d-]/g, '').split('-').map(n => parseFloat(n) || 0);
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

// PRE-PROCESS DATA ONCE
export const ALL_ITEMS_NORMALIZED = [
    ...dealsData.map(d => ({ ...d, itemType: 'Deal' })),
    ...(inventoryData || []).map(i => ({ ...i, itemType: 'Inventory' }))
].map(item => ({
    ...item,
    _normalizedPrice: parsePrice(item.price),
    _normalizedSize: parseSizeSqYard(item.size),
    _lowerLocation: (item.location || '').toLowerCase(),
    _lowerProject: (item.projectName || '').toLowerCase(),
    _lowerType: (item.propertyType || '').toLowerCase()
}));

export const calculateMatch = (lead, leadContext, weights, options = { includeNearby: true, minMatchScore: 20 }) => {
    if (!lead || !leadContext) return [];

    const { baseBudget, leadSize, leadType, leadLocation, leadLocationSectors } = leadContext;
    const budgetFlexibility = options.budgetFlexibility || 10;

    const flexibleBudget = {
        min: baseBudget.min * (1 - budgetFlexibility / 100),
        max: baseBudget.max * (1 + budgetFlexibility / 100)
    };

    const totalPossibleScore = (weights.location || 0) + (weights.type || 0) + (weights.budget || 0) + (weights.size || 0);

    return ALL_ITEMS_NORMALIZED.map((item, index) => {
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
        } else {
            gaps.push(`${item.propertyType} vs ${lead.req?.type}`);
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
        if (leadSize > 0 && itemSize > 0) {
            const diff = Math.abs(itemSize - leadSize);
            const proximity = Math.max(0, weights.size - (diff / leadSize) * (weights.size * 4));
            score += proximity;
            if (proximity > (weights.size * 0.8)) details.size = 'match';
            else if (proximity > (weights.size * 0.4)) details.size = 'partial';
            else gaps.push('Size significantly different');
        } else if (itemSize > 0 || leadSize > 0) {
            score += (weights.size * 0.4);
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
            thumbnail: `https://picsum.photos/seed/${item.id || item.unitNo}/200/150`
        };
    }).filter(Boolean)
        .sort((a, b) => b.matchPercentage - a.matchPercentage);
};
