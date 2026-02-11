
import { sizeData } from '../data/sizeData';

// Helper: Convert degrees to radians
function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

// Helper: Calculate distance between two coordinates in km
function calculateDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

// ==================================================================================
// MAIN FILTERING FUNCTION
// ==================================================================================
// This function takes a deal object and the filters object and returns true/false
// It is intended to be used inside .filter()
// ==================================================================================
export const applyDealsFilters = (deal, filters) => {

    // 1. Stage Filter (e.g. "Open", "Quote", "Negotiation")
    // ------------------------------------------------------------------------------
    if (filters.stage && filters.stage.length > 0) {
        const dealStatus = deal.status?.lookup_value || deal.status;
        if (!filters.stage.includes(dealStatus)) return false;
    }

    // 2. Category Filter (e.g. "Residential", "Commercial")
    // ------------------------------------------------------------------------------
    if (filters.category && filters.category.length > 0) {
        const pType = deal.propertyType?.lookup_value || deal.propertyType || '';
        const catMatch = filters.category.some(cat => pType.includes(cat));
        if (!catMatch) return false;
    }

    // 3. Sub-Category Filter (e.g. "Plot", "Flat")
    // ------------------------------------------------------------------------------
    if (filters.subCategory && filters.subCategory.length > 0) {
        const subCatMatch = filters.subCategory.some(sc => {
            const subCat = sc.toLowerCase();
            const pType = (deal.propertyType?.lookup_value || deal.propertyType || '').toLowerCase();
            return pType.includes(subCat);
        });
        if (!subCatMatch) return false;
    }

    // 4. Size Type Filter (e.g. "4 Marla", "1 Kanal")
    // ------------------------------------------------------------------------------
    const isTypeMode = !filters.sizeMode || filters.sizeMode === 'type';
    if (isTypeMode && filters.sizeType && filters.sizeType.length > 0) {
        const sizeTypeMatch = filters.sizeType.some(st => {
            const dealSize = (deal.size || '').toLowerCase();
            const dealType = (deal.type || '').toLowerCase();
            const targetLabel = st.toLowerCase();

            // Direct label match
            if (dealSize.includes(targetLabel) || dealType.includes(targetLabel)) return true;

            // Value match via sizeData lookup
            const sizeDef = sizeData.find(s => s.label === st);
            if (sizeDef && sizeDef.value) {
                const targetValue = sizeDef.value.toLowerCase();
                if (dealSize.includes(targetValue)) return true;
            }
            return false;
        });
        if (!sizeTypeMatch) return false;
    }

    // 5. Size Range Filter (Min/Max)
    // ------------------------------------------------------------------------------
    const isRangeMode = filters.sizeMode === 'range' || filters.minSize || filters.maxSize;
    if (isRangeMode && (filters.minSize || filters.maxSize)) {
        const sizeMatch = deal.size ? deal.size.match(/[\d.]+/) : null;
        const sizeVal = sizeMatch ? parseFloat(sizeMatch[0]) : 0;

        if (filters.minSize) {
            const minVal = parseFloat(filters.minSize);
            if (!isNaN(minVal) && sizeVal < minVal) return false;
        }
        if (filters.maxSize) {
            const maxVal = parseFloat(filters.maxSize);
            if (!isNaN(maxVal) && sizeVal > maxVal) return false;
        }
    }

    // 6. Location & Distance Filter
    // ------------------------------------------------------------------------------
    if (filters.location) {
        let matchFound = false;
        const searchLocation = filters.location.toLowerCase();
        const range = filters.range || 'Exact';
        const dealLocation = (deal.location?.lookup_value || deal.location || '').toLowerCase();

        const textMatch = dealLocation.includes(searchLocation);

        // Check Distance Match
        if (range !== 'Exact' && filters.locationCoords && deal.lat && deal.lng) {
            const rangeKm = parseInt(range.replace(/\D/g, ''), 10);
            if (!isNaN(rangeKm)) {
                const dist = calculateDistance(
                    filters.locationCoords.lat, filters.locationCoords.lng,
                    deal.lat, deal.lng
                );
                if (dist !== null && dist <= rangeKm) matchFound = true;
            }
        }

        // Fallback to text match if needed
        if (!matchFound) {
            if (range === 'Exact' || !filters.locationCoords || !deal.lat) {
                if (textMatch) matchFound = true;
            }
        }

        if (!matchFound) return false;
    }

    // 7. Project Name Filter
    // ------------------------------------------------------------------------------
    if (filters.project) {
        const projSearch = filters.project.toLowerCase();
        if (!deal.projectName?.toLowerCase().includes(projSearch) &&
            !deal.location?.toLowerCase().includes(projSearch)) return false;
    }

    // 8. Orientation Filters
    // ------------------------------------------------------------------------------
    if (filters.facing && filters.facing.length > 0) {
        if (!filters.facing.includes(deal.facing)) return false;
    }
    if (filters.direction && filters.direction.length > 0) {
        if (!filters.direction.includes(deal.direction)) return false;
    }
    if (filters.roadWidth && filters.roadWidth.length > 0) {
        if (!filters.roadWidth.includes(deal.road)) return false;
    }

    // 9. Intent Filter (Sell/Rent/Lease)
    // ------------------------------------------------------------------------------
    if (filters.intent) {
        const dealIntent = deal.intent?.lookup_value || deal.intent;
        if (dealIntent !== filters.intent) return false;
    }

    // 10. Price Filter
    // ------------------------------------------------------------------------------
    if (filters.minPrice || filters.maxPrice) {
        const dealPriceStr = String(deal.price || '0').replace(/,/g, '');
        const dealPrice = parseFloat(dealPriceStr) || 0;

        if (filters.minPrice) {
            const minP = parseFloat(String(filters.minPrice).replace(/,/g, ''));
            if (!isNaN(minP) && dealPrice < minP) return false;
        }
        if (filters.maxPrice) {
            const maxP = parseFloat(String(filters.maxPrice).replace(/,/g, ''));
            if (!isNaN(maxP) && dealPrice > maxP) return false;
        }
    }

    // 11. Match Count & High Match
    // ------------------------------------------------------------------------------
    if (filters.matches && filters.matches.length > 0) {
        const m = deal.matched;
        const matchesCriteria = filters.matches.some(crit => {
            if (crit === '0') return m === 0;
            if (crit === '1-2') return m >= 1 && m <= 2;
            if (crit === '3-5') return m >= 3 && m <= 5;
            if (crit === '5+') return m > 5;
            return false;
        });
        if (!matchesCriteria) return false;
    }

    if (filters.highMatchOnly) {
        if (deal.score.val < 80) return false;
    }

    return true;
};
