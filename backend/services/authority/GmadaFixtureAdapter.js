/**
 * ============================================================================
 *  BHARAT PROPERTIES CRM — GMADA FIXTURE ADAPTER
 *  Phase 3A: Isolated Fixture-Only Adapter Contract for GMADA
 * ============================================================================
 * 
 *  Consumes synthetic test fixtures for Greater Mohali Area Development Authority.
 *  Disambiguates combined 'Sector / Phase' and 'Scheme / Phase' field labels.
 *  Strictly fixture-based, zero outbound networking.
 * 
 *  @module GmadaFixtureAdapter
 *  @version 3.0.0-phase3a
 */

import BaseFixtureAdapter from './BaseFixtureAdapter.js';
import { classifyLocationComponent } from './authorityNormalizer.js';

export default class GmadaFixtureAdapter extends BaseFixtureAdapter {
    constructor(options = {}) {
        super('GMADA', 'Greater Mohali Area Development Authority', options);
    }

    /**
     * Authority-specific custom parsing hook for GMADA.
     * GMADA portal templates frequently combine "Sector / Phase" into a single column.
     * This hook classifies whether the input represents a Sector or Phase.
     * 
     * @protected
     * @param {object} sanitizedData
     * @param {object} parsedRecord
     * @returns {object}
     */
    _customParse(sanitizedData, parsedRecord) {
        const rawSectorPhase = sanitizedData['Sector / Phase'] || sanitizedData['Sector/Phase'];

        if (rawSectorPhase && typeof rawSectorPhase === 'string') {
            const classification = classifyLocationComponent(rawSectorPhase);
            const typeUpper = (classification.type || '').toUpperCase();

            if (typeUpper === 'PHASE') {
                // Populate the source mapping label for phaseCode so normalizeAuthorityRecord extracts it
                parsedRecord['(may be extracted from Sector / Phase)'] = classification.raw || rawSectorPhase;
            } else if (typeUpper === 'MIXED' || typeUpper === 'AMBIGUOUS') {
                parsedRecord._locationClassificationWarning = `Ambiguous GMADA location string: "${rawSectorPhase}"`;
            }
        }

        return parsedRecord;
    }
}
