/**
 * ============================================================================
 *  BHARAT PROPERTIES CRM — CHANDIGARH ESTATE OFFICE FIXTURE ADAPTER
 *  Phase 3A: Isolated Fixture-Only Adapter Contract for Chandigarh (CHD)
 * ============================================================================
 * 
 *  Consumes synthetic test fixtures for Chandigarh Estate Office.
 *  Handles freehold vs. leasehold tenure distinctions and ground rent status.
 *  Strictly fixture-based, zero outbound networking.
 * 
 *  @module ChandigarhFixtureAdapter
 *  @version 3.0.0-phase3a
 */

import BaseFixtureAdapter from './BaseFixtureAdapter.js';

export default class ChandigarhFixtureAdapter extends BaseFixtureAdapter {
    constructor(options = {}) {
        super('CHD', 'Estate Office Chandigarh', options);
    }

    /**
     * Authority-specific custom parsing hook for Chandigarh.
     * Evaluates tenure type from Mode of Allotment or Status field.
     * 
     * @protected
     * @param {object} sanitizedData
     * @param {object} parsedRecord
     * @returns {object}
     */
    _customParse(sanitizedData, parsedRecord) {
        // Tag explicit tenure if provided in raw Mode of Allotment
        const mode = sanitizedData['Mode of Allotment'] || sanitizedData['Mode'];
        if (mode && typeof mode === 'string') {
            if (/freehold/i.test(mode)) {
                parsedRecord._tenureTypeHint = 'FREEHOLD';
            } else if (/leasehold/i.test(mode)) {
                parsedRecord._tenureTypeHint = 'LEASEHOLD';
            }
        }

        return parsedRecord;
    }
}
