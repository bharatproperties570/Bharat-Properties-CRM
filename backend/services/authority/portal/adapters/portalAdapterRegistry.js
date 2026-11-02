/**
 * Portal Adapter Registry
 *
 * Provides source-specific form adapters for all supported authority portals.
 */

import { hsvpPortalAdapter } from './hsvpPortalAdapter.js';
import { gmadaPortalAdapter } from './gmadaPortalAdapter.js';
import { chdPortalAdapter } from './chdPortalAdapter.js';

export const PORTAL_ADAPTERS = Object.freeze({
    HSVP: hsvpPortalAdapter,
    GMADA: gmadaPortalAdapter,
    CHD: chdPortalAdapter
});

export function getPortalAdapter(authorityCode) {
    const code = String(authorityCode || '').trim().toUpperCase();
    const adapter = PORTAL_ADAPTERS[code];
    if (!adapter) {
        const error = new Error(`UNKNOWN_PORTAL_ADAPTER: No form adapter for authority "${authorityCode}".`);
        error.code = 'UNKNOWN_PORTAL_ADAPTER';
        throw error;
    }
    return adapter;
}

export default PORTAL_ADAPTERS;
