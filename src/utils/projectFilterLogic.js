
// ==================================================================================
// PROJECT FILTERING LOGIC
// ==================================================================================

import { calculateDistance } from './inventoryFilterLogic';

export const applyProjectFilters = (projects, filters) => {
    if (!projects) return [];

    return projects.filter(project => {
        // 1. Project Category (Multi-Select)
        if (filters.category && filters.category.length > 0) {
            const projectCats = project.category || [];
            const hasMatch = filters.category.some(cat => projectCats.includes(cat));
            if (!hasMatch) return false;
        }

        // 2. Sub Category (Multi-Select)
        // Checks if project.category (which mixes types) contains the selected sub-categories
        if (filters.subCategory && filters.subCategory.length > 0) {
            const projectCats = project.category || [];
            // If project tags contain ANY of the selected sub-categories
            const hasSubMatch = filters.subCategory.some(sub => projectCats.includes(sub));
            if (!hasSubMatch) return false;
        }

        // 3. Status (Multi-Select/Single)
        // Note: Project data might simulate status or default to 'Under Construction' if missing
        if (filters.status && filters.status.length > 0) {
            const projectStatus = project.status || 'Under Construction'; // Default assumption based on UI
            // Handle if filters.status is string (single) or array (multi) logic from UI might pass string if simple button
            if (Array.isArray(filters.status)) {
                if (!filters.status.includes(projectStatus)) return false;
            } else {
                if (filters.status !== projectStatus) return false;
            }
        }

        // 4. Amenities (Multi-Select)
        if (filters.amenities && filters.amenities.length > 0) {
            const projectAmenities = project.amenities || [];
            // Basic logic: PROJECT MUST HAVE ALL SELECTED AMENITIES? Or ANY?
            // Usually "Filter by Amenities" means "Project must have Gym AND Pool" (AND logic)
            // But side panels often do OR logic. Let's do AND for stronger filtering.
            // Let's stick to standard "some" (OR) to show more results unless "All" is standard.
            // Real Estate portals often use AND for must-haves. 
            // Let's go with OR for now (matches any selected).
            const hasAmenityMatch = filters.amenities.some(am => projectAmenities.includes(am));
            // If strict needed: const hasAll = filters.amenities.every(am => projectAmenities.includes(am));
            if (!hasAmenityMatch && projectAmenities.length > 0) return false; // If project has amenities but none match. 
            // If project has NO amenities data, should we exclude? Yes.
            if (filters.amenities.length > 0 && projectAmenities.length === 0) return false;
        }

        // 5. City (Multi-Select)
        if (filters.city && filters.city.length > 0) {
            const projectLoc = (project.location || "").toLowerCase();
            const hasCityMatch = filters.city.some(city => projectLoc.includes(city.toLowerCase()));
            if (!hasCityMatch) return false;
        }

        // 6. Location Search (Distance or Text)
        if (filters.location) {
            if (filters.locationCoords && project.lat && project.lng) {
                const dist = calculateDistance(filters.locationCoords.lat, filters.locationCoords.lng, project.lat, project.lng);
                // If specific range filter exists, use it. Else default radius 5km for "Search near"
                const maxDist = filters.range ? parseInt(filters.range) : 5;
                if (dist === null || dist > maxDist) return false;
            } else {
                // Fallback to text match
                if (!project.location.toLowerCase().includes(filters.location.toLowerCase())) {
                    // Try name match as well
                    if (!project.name.toLowerCase().includes(filters.location.toLowerCase())) return false;
                }
            }
        }

        // 7. Blocks
        if (filters.hasBlocks) {
            if (!project.blocks || project.blocks.length === 0) return false;
        }

        // 8. User
        if (filters.user) {
            if (!project.user || !project.user.toLowerCase().includes(filters.user.toLowerCase())) return false;
        }

        return true;
    });
};
