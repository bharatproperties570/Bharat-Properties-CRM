/**
 * Shared Map Utilities for Inventory, Projects, and Deals
 */

// Default center for Mohali region
export const MAP_CENTER = {
    lat: 30.6985,
    lng: 76.7112
};

// Scaling factor for mapping coordinates to pixels (hacky but consistent)
export const MAP_SCALE = 3000;

/**
 * Extracts coordinates from an item or its associated project
 * @param {Object} item - Inventory, Project, or Deal item
 * @returns {Object|null} { lat, lng } or null
 */
export const getCoordinates = (item) => {
    if (!item) return null;

    // Direct lat/lng (e.g. on Project or customized inventory)
    const lat = item.latitude || item.lat;
    const lng = item.longitude || item.lng;

    if (lat && lng) {
        return { lat: parseFloat(lat), lng: parseFloat(lng) };
    }

    // From populated projectId
    if (item.projectId && typeof item.projectId === 'object') {
        const pLat = item.projectId.latitude || item.projectId.lat;
        const pLng = item.projectId.longitude || item.projectId.lng;
        if (pLat && pLng) {
            return { lat: parseFloat(pLat), lng: parseFloat(pLng) };
        }
    }

    return null;
};

/**
 * Calculates absolute pixel position relative to map center
 * @param {number} lat 
 * @param {number} lng 
 * @returns {Object} { top, left } CSS strings
 */
export const getPinPosition = (lat, lng) => {
    const latDiff = (lat - MAP_CENTER.lat) * MAP_SCALE;
    const lngDiff = (lng - MAP_CENTER.lng) * MAP_SCALE;

    return {
        left: `calc(50% + ${lngDiff}px)`,
        top: `calc(50% - ${latDiff}px)`
    };
};
