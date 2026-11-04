import test from 'node:test';
import assert from 'node:assert/strict';

import {
    convertArea,
    parseSizeAndUnit,
    evaluateSizeFilter,
    SUPPORTED_AREA_UNITS
} from '../services/discovery/DiscoveryFilterEngine.js';

test('--- TDD: AREA-UNIT CONVERSION & REGIONAL STANDARDS SUITE ---', async (t) => {

    await t.test('1. Standard units and bidirectional conversion math', () => {
        // Sqft <-> Sqyd (1 sqyd = 9 sqft)
        assert.equal(convertArea(100, 'sqyd', 'sqft'), 900);
        assert.equal(convertArea(900, 'sqft', 'sqyd'), 100);

        // HSVP / Urban Haryana standard: 1 marla = 25 sqyd = 225 sqft
        assert.equal(convertArea(1, 'marla', 'sqyd'), 25);
        assert.equal(convertArea(25, 'sqyd', 'marla'), 1);
        assert.equal(convertArea(1, 'marla', 'sqft'), 225);
        assert.equal(convertArea(225, 'sqft', 'marla'), 1);

        // HSVP / Urban Haryana standard: 1 kanal = 20 marlas = 500 sqyd = 4500 sqft
        assert.equal(convertArea(1, 'kanal', 'marla'), 20);
        assert.equal(convertArea(20, 'marla', 'kanal'), 1);
        assert.equal(convertArea(1, 'kanal', 'sqyd'), 500);
        assert.equal(convertArea(500, 'sqyd', 'kanal'), 1);
        assert.equal(convertArea(1, 'kanal', 'sqft'), 4500);
        assert.equal(convertArea(4500, 'sqft', 'kanal'), 1);

        // Acre <-> Sqyd (1 acre = 4840 sqyd = 43560 sqft)
        assert.equal(convertArea(1, 'acre', 'sqyd'), 4840);
        assert.equal(convertArea(4840, 'sqyd', 'acre'), 1);
        assert.equal(convertArea(1, 'acre', 'sqft'), 43560);
        assert.equal(convertArea(43560, 'sqft', 'acre'), 1);
    });

    await t.test('2. Round-trip conversion tolerance with decimal values', () => {
        const testValues = [0.5, 2.75, 12.345, 150.25, 1000.123];
        const units = ['sqft', 'sqyd', 'marla', 'kanal', 'acre'];

        for (const u1 of units) {
            for (const u2 of units) {
                for (const val of testValues) {
                    const forward = convertArea(val, u1, u2);
                    assert.ok(forward !== null, `Forward conversion ${val} ${u1} -> ${u2} failed`);
                    const backward = convertArea(forward, u2, u1);
                    assert.ok(backward !== null, `Reverse conversion ${forward} ${u2} -> ${u1} failed`);
                    
                    const delta = Math.abs(backward - val);
                    assert.ok(delta < 1e-9, `Round-trip delta ${delta} exceeded tolerance for ${val} ${u1} -> ${u2} -> ${u1}`);
                }
            }
        }
    });

    await t.test('3. Zero and boundary values handling', () => {
        // Zero must convert to 0, not null or undefined
        assert.equal(convertArea(0, 'sqyd', 'sqft'), 0);
        assert.equal(convertArea(0, 'sqft', 'marla'), 0);
        assert.equal(convertArea(0, 'marla', 'kanal'), 0);

        // Negative numbers must be rejected
        assert.equal(convertArea(-10, 'sqyd', 'sqft'), null);
        assert.equal(convertArea(-0.01, 'sqft', 'sqyd'), null);

        // Non-numeric or NaN
        assert.equal(convertArea(NaN, 'sqyd', 'sqft'), null);
        assert.equal(convertArea('100', 'sqyd', 'sqft'), null);
        assert.equal(convertArea(null, 'sqyd', 'sqft'), null);
        assert.equal(convertArea(undefined, 'sqyd', 'sqft'), null);
    });

    await t.test('4. Bigha Regional Ambiguity Protection (Requirement 2)', () => {
        // Cross-unit conversion involving bigha MUST return null because bigha has no single universal definition
        assert.equal(convertArea(1, 'bigha', 'sqft'), null, 'Cross-conversion from bigha to sqft must return null due to regional variance');
        assert.equal(convertArea(1, 'bigha', 'sqyd'), null, 'Cross-conversion from bigha to sqyd must return null');
        assert.equal(convertArea(1000, 'sqyd', 'bigha'), null, 'Cross-conversion from sqyd to bigha must return null');
        assert.equal(convertArea(1, 'bigha', 'kanal'), null, 'Cross-conversion from bigha to kanal must return null');

        // Exact same unit conversion (bigha -> bigha) remains valid
        assert.equal(convertArea(5, 'bigha', 'bigha'), 5, 'Identity conversion for bigha must succeed');

        // In evaluateSizeFilter: when listing is in bigha and target is sqyd, it must flag ambiguous_regional_unit_conversion
        const evalResult = evaluateSizeFilter('4 bigha', 500, 2000, 'sqyd');
        assert.equal(evalResult.passed, null, 'Must be flagged as unverified (null), not rejected or silently converted');
        assert.equal(evalResult.reason, 'ambiguous_regional_unit_conversion');
        assert.equal(evalResult.isMissingData, true);
    });

    await t.test('5. Common Indian Unit Aliases in parseSizeAndUnit', () => {
        // Gaz / Gaj aliases for sqyd
        const s1 = parseSizeAndUnit('250 gaz');
        assert.equal(s1.value, 250);
        assert.equal(s1.unit, 'sqyd');

        const s2 = parseSizeAndUnit('150 gaj');
        assert.equal(s2.value, 150);
        assert.equal(s2.unit, 'sqyd');

        const s3 = parseSizeAndUnit('200 sq.yd');
        assert.equal(s3.value, 200);
        assert.equal(s3.unit, 'sqyd');

        // Sqft aliases
        const s4 = parseSizeAndUnit('1800 sq.ft.');
        assert.equal(s4.value, 1800);
        assert.equal(s4.unit, 'sqft');

        const s5 = parseSizeAndUnit('1500 sft');
        assert.equal(s5.value, 1500);
        assert.equal(s5.unit, 'sqft');

        // Kanal and Marla plurals
        const s6 = parseSizeAndUnit('2 kanals');
        assert.equal(s6.value, 2);
        assert.equal(s6.unit, 'kanal');

        const s7 = parseSizeAndUnit('10 marlas');
        assert.equal(s7.value, 10);
        assert.equal(s7.unit, 'marla');
    });
});
