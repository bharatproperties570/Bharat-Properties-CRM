import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    ROAD_BASE_PRICE_ADJUSTMENTS,
    DIRECTION_BASE_PRICE_ADJUSTMENTS,
    FACING_BASE_PRICE_ADJUSTMENTS,
    resolveOrientationAdjustments,
    calculateBasePriceFromRate,
    calculateAdjustedUnitPrice
} from '../utils/pricingUtils.js';

describe('Orientation Base Price Engine: Authoritative Multiplier & Normalization Suite', () => {

    test('Table 1 (Road) Verification: exact percentages match user specification', () => {
        assert.equal(ROAD_BASE_PRICE_ADJUSTMENTS['9 Mtr (30 Feet) Wide'], 0);
        assert.equal(ROAD_BASE_PRICE_ADJUSTMENTS['10 Mtr (32.8 Feet) Wide'], 0.5);
        assert.equal(ROAD_BASE_PRICE_ADJUSTMENTS['12 Mtr (40 Feet) Wide'], 7.5);
        assert.equal(ROAD_BASE_PRICE_ADJUSTMENTS['15 Mtr (49.2 Feet) Wide'], 9.5);
        assert.equal(ROAD_BASE_PRICE_ADJUSTMENTS['18 Mtr (60 Feet) Wide'], 10.5);
        assert.equal(ROAD_BASE_PRICE_ADJUSTMENTS['24 Mtr (80 Feet) Wide'], 24.5);
        assert.equal(ROAD_BASE_PRICE_ADJUSTMENTS['30 Mtr (100 Feet) Wide'], 25.5);
        assert.equal(ROAD_BASE_PRICE_ADJUSTMENTS['50 Mtr (164 Feet) Wide'], 30);
        assert.equal(ROAD_BASE_PRICE_ADJUSTMENTS['60 Mtr (200 Feet) Wide'], 31);
        assert.equal(ROAD_BASE_PRICE_ADJUSTMENTS['90 Mtr (300 Feet) Wide'], 35);
    });

    test('Table 2 (Direction) Verification: exact percentages match user specification', () => {
        assert.equal(DIRECTION_BASE_PRICE_ADJUSTMENTS['East'], 5);
        assert.equal(DIRECTION_BASE_PRICE_ADJUSTMENTS['North'], 4);
        assert.equal(DIRECTION_BASE_PRICE_ADJUSTMENTS['North-East'], 5);
        assert.equal(DIRECTION_BASE_PRICE_ADJUSTMENTS['North-West'], 0);
        assert.equal(DIRECTION_BASE_PRICE_ADJUSTMENTS['South'], -12);
        assert.equal(DIRECTION_BASE_PRICE_ADJUSTMENTS['South-East'], -3);
        assert.equal(DIRECTION_BASE_PRICE_ADJUSTMENTS['South-West'], -5);
        assert.equal(DIRECTION_BASE_PRICE_ADJUSTMENTS['West'], 0);
    });

    test('Table 3 (Facing) Verification: key positive and negative adjustments', () => {
        assert.equal(FACING_BASE_PRICE_ADJUSTMENTS['Park'], 16);
        assert.equal(FACING_BASE_PRICE_ADJUSTMENTS['Green Belt'], 16);
        assert.equal(FACING_BASE_PRICE_ADJUSTMENTS['Main Road Facing'], 15);
        assert.equal(FACING_BASE_PRICE_ADJUSTMENTS['Commercial'], 15);
        assert.equal(FACING_BASE_PRICE_ADJUSTMENTS['Dividing Road'], 12);
        assert.equal(FACING_BASE_PRICE_ADJUSTMENTS['Shop'], 10);
        assert.equal(FACING_BASE_PRICE_ADJUSTMENTS['1 Kanal'], 5);
        assert.equal(FACING_BASE_PRICE_ADJUSTMENTS['10 Marla'], 2);
        assert.equal(FACING_BASE_PRICE_ADJUSTMENTS['14 Marla'], 0);
        assert.equal(FACING_BASE_PRICE_ADJUSTMENTS['EWS'], -20);
        assert.equal(FACING_BASE_PRICE_ADJUSTMENTS['High Tension Lines'], -18);
        assert.equal(FACING_BASE_PRICE_ADJUSTMENTS['Power Line'], -16);
        assert.equal(FACING_BASE_PRICE_ADJUSTMENTS['Hospital'], -15);
        assert.equal(FACING_BASE_PRICE_ADJUSTMENTS['Railway Station'], -14);
        assert.equal(FACING_BASE_PRICE_ADJUSTMENTS['T Point'], -12);
        assert.equal(FACING_BASE_PRICE_ADJUSTMENTS['Water Works'], -12);
        assert.equal(FACING_BASE_PRICE_ADJUSTMENTS['School'], -10);
        assert.equal(FACING_BASE_PRICE_ADJUSTMENTS['Dispensary'], -10);
    });

    test('Composite Multiplier Calculation: 24m road + East + Park', () => {
        const adj = resolveOrientationAdjustments({
            roadWidth: '24 Mtr (80 Feet) Wide',
            direction: 'East',
            facing: 'Park'
        });

        assert.equal(adj.roadAdjustmentPct, 24.5);
        assert.equal(adj.directionAdjustmentPct, 5);
        assert.equal(adj.facingAdjustmentPct, 16);
        assert.equal(adj.totalAdjustmentPct, 45.5);
        assert.equal(adj.multiplier, 1.455);
    });

    test('Base Price Derivation (De-normalization): 1,00,000 / Sq.Yd on 24m road + East + Park yields exact baseline', () => {
        const actualRate = 100000;
        const basePrice = calculateBasePriceFromRate(actualRate, {
            roadWidth: '24 Mtr (80 Feet) Wide',
            direction: 'East',
            facing: 'Park'
        });

        // 100000 / 1.455 = 68728.52
        assert.equal(Math.round(basePrice), 68729);
    });

    test('Symmetric Reversibility: Base Price -> Unit Price -> Base Price preserves value', () => {
        const originalBase = 75000;
        const orientation = {
            roadWidth: '18 Mtr (60 Feet) Wide', // +10.5%
            direction: 'North',                 // +4.0%
            facing: 'Club Facing'               // +4.0%
        }; // total = +18.5%, multiplier = 1.185

        const unitPrice = calculateAdjustedUnitPrice(originalBase, orientation);
        assert.equal(Math.round(unitPrice), Math.round(75000 * 1.185));

        const derivedBase = calculateBasePriceFromRate(unitPrice, orientation);
        assert.equal(Math.round(derivedBase), originalBase);
    });

    test('Mix-Shift Elimination: Two different plots in same project yield identical base rate', () => {
        // Plot A: Prime 24m road, East facing, Park facing transacted at 1,45,500 / Gaj
        const plotA = {
            rate: 145500,
            roadWidth: '24 Mtr (80 Feet) Wide',
            direction: 'East',
            facing: 'Park'
        };

        // Plot B: Standard 9m road, West facing, 6 Marla facing transacted at 1,00,000 / Gaj
        const plotB = {
            rate: 100000,
            roadWidth: '9 Mtr (30 Feet) Wide',
            direction: 'West',
            facing: '6 Marla'
        };

        const baseA = calculateBasePriceFromRate(plotA.rate, plotA);
        const baseB = calculateBasePriceFromRate(plotB.rate, plotB);

        // Plot A: 145500 / 1.455 = 100000
        // Plot B: 100000 / 1.000 = 100000
        assert.equal(Math.round(baseA), 100000);
        assert.equal(Math.round(baseB), 100000);
        assert.equal(Math.round(baseA), Math.round(baseB));
    });

    test('Negative Adjustment Handling: South facing (-12%) + EWS (-20%) on 9m road', () => {
        const adj = resolveOrientationAdjustments({
            roadWidth: '9 Mtr (30 Feet) Wide', // 0%
            direction: 'South',                 // -12%
            facing: 'EWS'                       // -20%
        });

        assert.equal(adj.totalAdjustmentPct, -32);
        assert.equal(Math.round(adj.multiplier * 1000) / 1000, 0.68);

        // If actual deal rate is 68,000, base price should be 68,000 / 0.68 = 100,000
        const basePrice = calculateBasePriceFromRate(68000, {
            roadWidth: '9 Mtr (30 Feet) Wide',
            direction: 'South',
            facing: 'EWS'
        });
        assert.equal(Math.round(basePrice), 100000);
    });

});
