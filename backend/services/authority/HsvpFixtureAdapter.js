/**
 * ============================================================================
 *  BHARAT PROPERTIES CRM — HSVP FIXTURE ADAPTER
 *  Phase 3A: Isolated Fixture-Only Adapter Contract for HSVP
 * ============================================================================
 * 
 *  Consumes synthetic test fixtures for Haryana Shehri Vikas Pradhikaran (HSVP).
 *  Strictly fixture-based, zero outbound networking.
 * 
 *  @module HsvpFixtureAdapter
 *  @version 3.0.0-phase3a
 */

import BaseFixtureAdapter from './BaseFixtureAdapter.js';

export default class HsvpFixtureAdapter extends BaseFixtureAdapter {
    constructor(options = {}) {
        super('HSVP', 'Haryana Shehri Vikas Pradhikaran', options);
    }
}
