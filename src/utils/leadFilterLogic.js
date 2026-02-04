
import { calculateDistance } from './inventoryFilterLogic';
import { PROJECTS_LIST } from '../data/projectData';

// ==================================================================================
// LEAD FILTERING LOGIC
// ==================================================================================

export const applyLeadFilters = (leads, filters) => {
    if (!leads) return [];

    return leads.filter(lead => {
        // 1. Requirement Intent (Buy/Rent)
        if (filters.intent) {
            // Intent in lead.req.type or lead.requirement
            const reqType = lead.req?.type || lead.requirement || "";
            // Normalizing: "Buy Residential" -> includes "Buy", "Rent Commercial" -> includes "Rent"
            if (!reqType.toLowerCase().includes(filters.intent.toLowerCase())) return false;
        }

        // 2. Lead Status (Multi-Select)
        if (filters.status && filters.status.length > 0) {
            const leadStatus = lead.status?.label || lead.status;
            if (!filters.status.includes(leadStatus)) return false;
        }

        // 3. Lead Source (Multi-Select)
        if (filters.source && filters.source.length > 0) {
            if (!filters.source.includes(lead.source)) return false;
        }

        // 4. Property Category (Multi-Select)
        if (filters.category && filters.category.length > 0) {
            const reqType = lead.req?.type || lead.propertyType || "";
            // Check if ANY selected category is present in the requirement string
            const hasCategory = filters.category.some(cat => reqType.includes(cat));
            if (!hasCategory) return false;
        }

        // 5. Sub Category (Multi-Select)
        if (filters.subCategory && filters.subCategory.length > 0) {
            const reqType = lead.req?.type || lead.propertyType || "";
            const hasSub = filters.subCategory.some(sub => reqType.includes(sub));
            if (!hasSub) return false;
        }

        // 6. Size Filtering (Type or Range)
        if (filters.sizeMode === 'type' && filters.sizeType && filters.sizeType.length > 0) {
            // Check if Size Type (e.g., 2 BHK, 250 SqYd) is in requirement description
            // Ideally, leads should have specific size fields. Using req description or existing 'size' field.
            const leadSize = lead.req?.size || lead.reqDisplay?.size || "";
            const hasSizeType = filters.sizeType.some(type => leadSize.includes(type) || (lead.req?.type || "").includes(type));
            if (!hasSizeType) return false;
        } else if ((filters.minSize || filters.maxSize) && (!filters.sizeMode || filters.sizeMode === 'range')) {
            // Size Range Parsing (Complex due to units, assuming SqYd/SqFt normalization if needed)
            // For now, simple numeric check if lead has numeric size fields
            const leadMin = parseFloat(lead.areaMin || lead.req?.minSize || 0);
            const leadMax = parseFloat(lead.areaMax || lead.req?.maxSize || 0);
            const filterMin = parseFloat(filters.minSize || 0);
            const filterMax = parseFloat(filters.maxSize || Infinity);

            // If lead has no size, maybe include? Or exclude. Let's exclude if completely missing.
            if (leadMin === 0 && leadMax === 0) {
                // Return true if filter is not set, false if strict range needed?
                // Let's be lenient: if checks are active, and data missing, exclude.
                if (filters.minSize || filters.maxSize) return false;
            } else {
                // Check overlap? 
                // If Lead is 200-300, Filter is > 250.
                // We accept overlap.
                if (filterMin > 0 && leadMax > 0 && leadMax < filterMin) return false;
                if (filterMax < Infinity && leadMin > 0 && leadMin > filterMax) return false;
            }
        }

        // 7. Budget Range
        if (filters.budgetMin || filters.budgetMax) {
            let leadMin = parseFloat(lead.budgetMin || 0);
            let leadMax = parseFloat(lead.budgetMax || 0);
            // If fields are missing but budget string exists (e.g. "50L - 1Cr") - Parsing is hard.
            // Rely on prepared data.

            const filterMin = parseFloat(filters.budgetMin || 0);
            const filterMax = parseFloat(filters.budgetMax || Infinity);

            if (leadMin === 0 && leadMax === 0) return true; // Skip if no budget data

            if (filterMin > 0 && leadMax > 0 && leadMax < filterMin) return false;
            if (filterMax < Infinity && leadMin > 0 && leadMin > filterMax) return false;
        }

        // 8. Location (Text Search & Geometry)
        if (filters.location) {
            const leadLoc = Array.isArray(lead.location) ? lead.location.join(" ") : (lead.location || "");

            // Geo Filter
            if (filters.locationCoords && filters.range && filters.range !== 'Exact') {
                // Convert lead parsed location to coords? Not possible client side easily without geocoding all leads.
                // HOWEVER, usually leads are linked to PROJECTS.
                // If lead matches a PROJECT, use project coords.
                const project = PROJECTS_LIST.find(p => leadLoc.includes(p.name));
                if (project) {
                    const rangeKm = parseInt(filters.range.replace(/\D/g, ''), 10);
                    if (!isNaN(rangeKm)) {
                        const dist = calculateDistance(filters.locationCoords.lat, filters.locationCoords.lng, project.lat, project.lng);
                        if (dist === null || dist > rangeKm) return false;
                    }
                } else {
                    // Fallback to text match if not linked to project, OR exclude?
                    // Let's fallback to text match if Geo fails, but typically "Filtered by Location" implies strictness.
                    // But for Leads, location data is messy. 
                    // Let's stick to Text Match as primary filter unless Project Match found.
                    if (!leadLoc.toLowerCase().includes(filters.location.toLowerCase())) return false;
                }
            } else {
                // Simple Text Match
                if (!leadLoc.toLowerCase().includes(filters.location.toLowerCase())) return false;
            }
        }

        // 9. Project Filter
        if (filters.project) {
            const leadLoc = Array.isArray(lead.location) ? lead.location.join(" ") : (lead.location || "");
            if (!leadLoc.includes(filters.project)) return false;
        }

        // 10. Orientation (Direction, Road, Facing)
        if (filters.direction && filters.direction.length > 0) {
            // Check lead.req specs
            if (!filters.direction.some(dir => (lead.req?.direction || "").includes(dir))) return false; // Loose check
        }
        // ... Similar for other minor fields if data exists

        return true;
    });
};
