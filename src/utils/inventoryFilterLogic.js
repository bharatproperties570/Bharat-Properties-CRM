
// Helper: Calculate distance between two coordinates in km
export function calculateDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

// Helper: Parse numerical size from string (e.g. "10 Marla" -> 10)
const parseSize = (sizeStr) => {
    if (!sizeStr) return 0;
    const num = parseFloat(sizeStr.replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
};

// ==================================================================================
// MAIN FILTERING FUNCTION
// ==================================================================================
// This function takes the full list of inventory items and the active filters object
// and returns the filtered list.
// ==================================================================================
export const applyInventoryFilters = (items, filters, PROJECTS_LIST) => {
    if (!items) return [];

    return items.filter(item => {

        // 1. Status Filter
        // ------------------------------------------------------------------------------
        if (filters.status && item.status !== filters.status) return false;

        // 2. Category Filter (e.g., "Residential", "Commercial")
        // ------------------------------------------------------------------------------
        if (filters.category && filters.category.length > 0) {
            // Check if any selected category matches the item type string
            const categoryMatch = filters.category.some(cat => item.type && item.type.includes(cat));
            if (!categoryMatch) return false;
        }

        // 3. Sub-Category Filter (e.g., "Plot", "Flat", "SCO")
        // ------------------------------------------------------------------------------
        if (filters.subCategory && filters.subCategory.length > 0) {
            const subMatch = filters.subCategory.some(sub => item.type && item.type.includes(sub));
            if (!subMatch) return false;
        }

        // 4. Size Type Filter (e.g. "1 Kanal", "10 Marla")
        // ------------------------------------------------------------------------------
        if (filters.sizeType && filters.sizeType.length > 0) {
            const sizeTypeMatch = filters.sizeType.some(st => item.size && item.size.toLowerCase().includes(st.toLowerCase()));
            if (!sizeTypeMatch) return false;
        }

        // 5. Size Range Filter (Min/Max numeric values)
        // ------------------------------------------------------------------------------
        if (filters.minSize || filters.maxSize) {
            const itemSizeVal = parseSize(item.size);
            if (filters.minSize && itemSizeVal < parseFloat(filters.minSize)) return false;
            if (filters.maxSize && itemSizeVal > parseFloat(filters.maxSize)) return false;
        }

        // 6. Location & Distance Filter
        // ------------------------------------------------------------------------------
        if (filters.locationCoords && filters.range && filters.range !== 'Exact' && item.lat && item.lng) {
            const rangeKm = parseInt(filters.range.replace(/\D/g, ''), 10);
            if (!isNaN(rangeKm)) {
                const dist = calculateDistance(filters.locationCoords.lat, filters.locationCoords.lng, item.lat, item.lng);
                // If distance is too far, exclude it
                if (dist === null || dist > rangeKm) return false;
            }
        } else if (filters.location && !filters.locationCoords) {
            // Text search fallback if needed
            if (item.area && !item.area.toLowerCase().includes(filters.location.toLowerCase())) return false;
        }

        // 7. Project Name Filter
        // ------------------------------------------------------------------------------
        if (filters.project) {
            // Loose matching: check if item project matches or if area string contains the project name
            if (item.project && item.project !== filters.project) return false;
            if (!item.project && !item.area.includes(filters.project)) return false;
        }

        // 8. Orientation Filters (Facing, Direction, Road Width)
        // ------------------------------------------------------------------------------
        if (filters.facing && filters.facing.length > 0) {
            if (!filters.facing.includes(item.facing)) return false;
        }
        if (filters.direction && filters.direction.length > 0) {
            if (!filters.direction.includes(item.direction)) return false;
        }
        if (filters.roadWidth && filters.roadWidth.length > 0) {
            const itemRoad = item.road || item.roadWidth;
            if (!filters.roadWidth.includes(itemRoad)) return false;
        }

        // 9. Feedback Outcome Filter (e.g. "Interested", "Not Interested")
        // ------------------------------------------------------------------------------
        if (filters.feedbackOutcome) {
            // Check latest history
            const latestHistory = item.history && item.history.length > 0 ? item.history[0] : null;
            const latestOutcome = latestHistory ? latestHistory.result : null;

            // Check remarks as fallback
            const remarksMatch = item.remarks && item.remarks.includes(filters.feedbackOutcome);

            if (latestOutcome !== filters.feedbackOutcome && !remarksMatch) return false;
        }

        // 10. Specific Reason Filter (Dependent on Outcome)
        // ------------------------------------------------------------------------------
        if (filters.feedbackReason && filters.feedbackReason.length > 0) {
            const latestHistory = item.history && item.history.length > 0 ? item.history[0] : null;
            const latestReason = latestHistory ? latestHistory.reason : null;

            // Fallback: Check if ANY of the selected reasons are in the note or remarks
            const noteMatch = latestHistory && latestHistory.note && filters.feedbackReason.some(r => latestHistory.note.includes(r));
            const remarksMatch = item.remarks && filters.feedbackReason.some(r => item.remarks.includes(r));
            const reasonMatch = latestReason && filters.feedbackReason.includes(latestReason);

            if (!reasonMatch && !noteMatch && !remarksMatch) return false;
        }

        // 11. Follow-up Date Range Filter
        // ------------------------------------------------------------------------------
        if (filters.followUpFrom || filters.followUpTo) {
            const latestHistory = item.history && item.history.length > 0 ? item.history[0] : null;
            let foundDate = null;

            // Try to find a date in the latest note if it follows pattern "on DD/MM/YYYY"
            if (latestHistory && latestHistory.note) {
                const match = latestHistory.note.match(/on (\d{2}\/\d{2}\/\d{4})/);
                if (match) {
                    const parts = match[1].split('/');
                    if (parts.length === 3) foundDate = new Date(parts[2], parts[1] - 1, parts[0]);
                }
            }

            if (foundDate) {
                foundDate.setHours(0, 0, 0, 0); // Normalize time

                if (filters.followUpFrom) {
                    const fromDate = new Date(filters.followUpFrom);
                    fromDate.setHours(0, 0, 0, 0);
                    if (foundDate < fromDate) return false;
                }
                if (filters.followUpTo) {
                    const toDate = new Date(filters.followUpTo);
                    toDate.setHours(23, 59, 59, 999);
                    if (foundDate > toDate) return false;
                }
            } else {
                // If filter is active but no date found, exclude item
                return false;
            }
        }

        // If all checks pass, include the item
        return true;
    });
};
