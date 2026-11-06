import { BASE_BACKEND_URL } from './api';

export function getInitials(name) {
    if (!name) return '';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}

export function getSourceBadgeClass(source) {
    if (!source) return 'source-default';
    const s = source.toLowerCase();
    if (s.includes('google')) return 'source-google';
    if (s.includes('fb') || s.includes('facebook')) return 'source-fb';
    if (s.includes('ig') || s.includes('instagram')) return 'source-ig';
    if (s.includes('whatsapp')) return 'source-whatsapp';
    return 'source-default';
}

export function fixDriveUrl(url) {
    if (!url) return url;
    if (typeof url !== 'string') return url;
    if (url.startsWith('/uploads/') || url.startsWith('uploads/')) {
        const normalized = url.startsWith('/') ? url : `/${url}`;
        return `${BASE_BACKEND_URL}${normalized}`;
    }
    if (url.includes('drive.google.com')) {
        const fileIdMatch = url.match(/\/file\/d\/([^/]+)/) || url.match(/[?&]id=([^&]+)/);
        if (fileIdMatch && fileIdMatch[1]) {
            // Use Google Drive's standard uc?export=view which is reliable for embedding images
            return `https://drive.google.com/uc?export=view&id=${fileIdMatch[1]}`;
        }
    }
    return url;
}

export function getYoutubeId(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

/**
 * Resolves a human-readable location string from an entity (Project, Deal, Inventory).
 * Strictly filters out raw MongoDB ObjectIds (24-char hex strings) so user-facing UI
 * always displays real sectors, cities, or addresses.
 */
export function getReadableLocation(entity) {
    if (!entity) return 'Kurukshetra, Haryana';

    // 1. Check if locationSearch is a clean human-readable string
    if (entity.locationSearch && typeof entity.locationSearch === 'string') {
        const trimmed = entity.locationSearch.trim();
        if (trimmed && !/^[0-9a-fA-F]{24}$/.test(trimmed)) {
            return trimmed;
        }
    }

    // 2. Check if address?.location or location is populated object
    const loc = entity.address?.location || entity.location;
    if (loc && typeof loc === 'object') {
        if (loc.lookup_value && typeof loc.lookup_value === 'string') return loc.lookup_value;
        if (loc.name && typeof loc.name === 'string') return loc.name;
    }

    // 3. Check if location is string and NOT an ObjectId
    if (typeof loc === 'string') {
        const trimmed = loc.trim();
        if (trimmed && !/^[0-9a-fA-F]{24}$/.test(trimmed)) {
            return trimmed;
        }
    }

    // 4. Assemble readable address parts (excluding hex ObjectIds)
    const addr = entity.address;
    if (addr && typeof addr === 'object') {
        const parts = [
            addr.sector,
            addr.locality,
            addr.subLocality,
            addr.area,
            addr.street,
            addr.city,
            addr.state
        ].filter(p => typeof p === 'string' && p.trim() && !/^[0-9a-fA-F]{24}$/.test(p.trim()));

        if (parts.length > 0) {
            return parts.join(', ');
        }
    }

    // 5. Default fallback
    return 'Kurukshetra, Haryana';
}

