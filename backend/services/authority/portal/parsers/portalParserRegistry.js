/**
 * Portal Parser Registry
 * 
 * Provides versioned parsers for all supported authority portals.
 * Ensures verified parsers are accessible by authorityCode.
 */

import { hsvpPortalParser, HSVP_PARSER_VERSION } from './hsvpPortalParser.js';
import { gmadaPortalParser, GMADA_PARSER_VERSION } from './gmadaPortalParser.js';
import { chdPortalParser, CHD_PARSER_VERSION } from './chdPortalParser.js';

export const PORTAL_PARSERS = Object.freeze({
    HSVP: hsvpPortalParser,
    GMADA: gmadaPortalParser,
    CHD: chdPortalParser
});

export const PORTAL_PARSER_VERSIONS = Object.freeze({
    HSVP: HSVP_PARSER_VERSION,
    GMADA: GMADA_PARSER_VERSION,
    CHD: CHD_PARSER_VERSION
});

export function getPortalParser(authorityCode) {
    const code = String(authorityCode || '').trim().toUpperCase();
    const parser = PORTAL_PARSERS[code];
    if (!parser) {
        const error = new Error(`UNKNOWN_PORTAL_PARSER: No verified parser for authority "${authorityCode}".`);
        error.code = 'UNKNOWN_PORTAL_PARSER';
        throw error;
    }
    return parser;
}

export default PORTAL_PARSERS;
