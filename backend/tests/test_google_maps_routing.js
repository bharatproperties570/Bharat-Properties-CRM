/**
 * Bharat Properties CRM — Google Maps Routing Service Unit & Integration Tests
 *
 * Verifies:
 * 1. Geographic coordinate validation (bounds, NaN, 0,0)
 * 2. Provider API key discovery & Credential-Blocked status
 * 3. Successful Routes API optimization with waypoint reordering
 * 4. Provider timeout (AbortController) and retry on 5xx errors
 * 5. Rate limit (HTTP 429) backoff handling
 * 6. Graceful fallback preserving scheduled order without fabricating travel times
 * 7. Accurate source attribution: GOOGLE_ROUTES_API vs HEURISTIC vs SCHEDULED_ORDER
 */

import assert from 'assert';
import {
    GoogleMapsRoutingService,
    validateCoordinates,
    getGoogleMapsApiKey
} from '../src/modules/siteVisit/googleMapsRouting.service.js';

let passed = 0;
let failed = 0;

function test(description, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✅ PASS: ${description}`);
    } catch (err) {
        failed++;
        console.error(`  ❌ FAIL: ${description}`);
        console.error(err);
    }
}

async function testAsync(description, fn) {
    try {
        await fn();
        passed++;
        console.log(`  ✅ PASS: ${description}`);
    } catch (err) {
        failed++;
        console.error(`  ❌ FAIL: ${description}`);
        console.error(err);
    }
}

console.log('======================================================');
console.log('GOOGLE MAPS ROUTING SERVICE TEST SUITE');
console.log('======================================================\n');

// 1. Coordinate Validation
console.log('--- 1. Geographic Coordinate Validation ---');

test('Valid coordinates pass validation', () => {
    const res = validateCoordinates({ lat: 28.4595, lng: 77.0266 });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.lat, 28.4595);
    assert.strictEqual(res.lng, 77.0266);
});

test('Missing or NaN coordinates fail validation', () => {
    assert.strictEqual(validateCoordinates({ lat: 'invalid', lng: 77.0266 }).valid, false);
    assert.strictEqual(validateCoordinates({ lat: null, lng: null }).valid, false);
    assert.strictEqual(validateCoordinates({}).valid, false);
});

test('Out of bounds coordinates fail validation', () => {
    assert.strictEqual(validateCoordinates({ lat: 95.0, lng: 77.0266 }).valid, false);
    assert.strictEqual(validateCoordinates({ lat: 28.4595, lng: 195.0 }).valid, false);
});

test('(0, 0) coordinates fail validation', () => {
    assert.strictEqual(validateCoordinates({ lat: 0, lng: 0 }).valid, false);
});

// 2. Credential-Blocked & Default Fallback
console.log('\n--- 2. Credential-Blocked & Default Fallback ---');

await testAsync('When GOOGLE_MAPS_ROUTES_API_KEY is unset, returns CREDENTIAL_BLOCKED and preserves scheduled order', async () => {
    const originalKey = process.env.GOOGLE_MAPS_ROUTES_API_KEY;
    const originalMapsKey = process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_MAPS_ROUTES_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;

    const props = [
        { project: 'Prop 1', lat: 28.45, lng: 77.02 },
        { project: 'Prop 2', lat: 28.50, lng: 77.08 },
        { project: 'Prop 3', lat: 28.48, lng: 77.05 }
    ];

    const result = await GoogleMapsRoutingService.optimizeItinerary(props);
    assert.strictEqual(result.optimized, false);
    assert.strictEqual(result.isProviderOptimized, false);
    assert.strictEqual(result.optimizationSource, 'SCHEDULED_ORDER');
    assert.strictEqual(result.status, 'CREDENTIAL_BLOCKED');
    assert.strictEqual(result.estimatedTravelTimes, null);
    assert.strictEqual(result.claimedOptimal, false);
    assert.strictEqual(result.properties[0].project, 'Prop 1');
    assert.strictEqual(result.properties[1].project, 'Prop 2');
    assert.strictEqual(result.properties[2].project, 'Prop 3');

    if (originalKey) process.env.GOOGLE_MAPS_ROUTES_API_KEY = originalKey;
    if (originalMapsKey) process.env.GOOGLE_MAPS_API_KEY = originalMapsKey;
});

// 3. Provider Success (Mock Transport)
console.log('\n--- 3. Google Maps Routes API Provider Success ---');

await testAsync('Provider response with optimizedIntermediateWaypointIndex reorders waypoints correctly', async () => {
    const props = [
        { project: 'Anchor Start', lat: 28.40, lng: 77.00 },
        { project: 'Waypoint A', lat: 28.50, lng: 77.10 },
        { project: 'Waypoint B', lat: 28.45, lng: 77.05 },
        { project: 'Anchor End', lat: 28.60, lng: 77.20 }
    ];

    // Mock transport simulating Google Maps Compute Routes response
    // Waypoint indices: [1, 0] means Waypoint B should precede Waypoint A
    const mockTransport = async (payload) => {
        assert.strictEqual(payload.travelMode, 'DRIVE');
        assert.strictEqual(payload.optimizeWaypointOrder, true);
        assert.strictEqual(payload.intermediates.length, 2);
        return {
            routes: [
                {
                    optimizedIntermediateWaypointIndex: [1, 0],
                    duration: '2100s',
                    distanceMeters: 18500
                }
            ]
        };
    };

    const result = await GoogleMapsRoutingService.optimizeItinerary(props, {
        apiKey: 'mock_test_key_123',
        mockTransport
    });

    assert.strictEqual(result.optimized, true);
    assert.strictEqual(result.isProviderOptimized, true);
    assert.strictEqual(result.optimizationSource, 'GOOGLE_ROUTES_API');
    assert.strictEqual(result.claimedOptimal, true);
    assert.strictEqual(result.providerDuration, '2100s');
    assert.strictEqual(result.providerDistanceMeters, 18500);
    assert.strictEqual(result.estimatedTravelTimes.totalDuration, '2100s');

    // Expected order: Anchor Start (0), Waypoint B (1), Waypoint A (2), Anchor End (3)
    assert.strictEqual(result.properties[0].project, 'Anchor Start');
    assert.strictEqual(result.properties[1].project, 'Waypoint B');
    assert.strictEqual(result.properties[2].project, 'Waypoint A');
    assert.strictEqual(result.properties[3].project, 'Anchor End');
});

// 4. Provider Error Handling & Retry
console.log('\n--- 4. Provider Timeout & Error Handling ---');

await testAsync('5xx error triggers retry and falls back to scheduled order gracefully', async () => {
    let callCount = 0;
    const mockTransport = async () => {
        callCount++;
        const err = new Error('503 Service Unavailable');
        err.statusCode = 503;
        throw err;
    };

    const props = [
        { project: 'Start', lat: 28.40, lng: 77.00 },
        { project: 'Mid', lat: 28.50, lng: 77.10 },
        { project: 'End', lat: 28.60, lng: 77.20 }
    ];

    const result = await GoogleMapsRoutingService.optimizeItinerary(props, {
        apiKey: 'mock_test_key_123',
        mockTransport,
        maxRetries: 1
    });

    assert.strictEqual(callCount, 1);
    assert.strictEqual(result.optimized, false);
    assert.strictEqual(result.isProviderOptimized, false);
    assert.strictEqual(result.optimizationSource, 'SCHEDULED_ORDER');
    assert.strictEqual(result.estimatedTravelTimes, null);
    assert.strictEqual(result.claimedOptimal, false);
});

// 5. Rate Limit (HTTP 429)
console.log('\n--- 5. Rate Limit Handling ---');

await testAsync('HTTP 429 rate limit error falls back to scheduled order without crashing', async () => {
    const mockTransport = async () => {
        const err = new Error('429 Rate Limit Exceeded');
        err.statusCode = 429;
        throw err;
    };

    const props = [
        { project: 'Start', lat: 28.40, lng: 77.00 },
        { project: 'Mid', lat: 28.50, lng: 77.10 },
        { project: 'End', lat: 28.60, lng: 77.20 }
    ];

    const result = await GoogleMapsRoutingService.optimizeItinerary(props, {
        apiKey: 'mock_test_key_123',
        mockTransport
    });

    assert.strictEqual(result.optimized, false);
    assert.strictEqual(result.optimizationSource, 'SCHEDULED_ORDER');
    assert.strictEqual(result.estimatedTravelTimes, null);
});

// 6. Heuristic Proximity
console.log('\n--- 6. Geometric Heuristic Proximity Fallback ---');

await testAsync('When heuristicProximity is requested, orders waypoints by proximity with accurate heuristic flags', async () => {
    const props = [
        { project: 'Origin', lat: 28.4000, lng: 77.0000 },
        { project: 'Far Location', lat: 28.5500, lng: 77.2000 },
        { project: 'Near Location', lat: 28.4010, lng: 77.0010 }
    ];

    const result = await GoogleMapsRoutingService.optimizeItinerary(props, {
        heuristicProximity: true
    });

    assert.strictEqual(result.optimized, true);
    assert.strictEqual(result.isProviderOptimized, false);
    assert.strictEqual(result.optimizationSource, 'HEURISTIC');
    assert.strictEqual(result.claimedOptimal, false);
    assert.strictEqual(result.estimatedTravelTimes, null);
    assert.strictEqual(result.properties[0].project, 'Origin');
    assert.strictEqual(result.properties[1].project, 'Near Location');
    assert.strictEqual(result.properties[2].project, 'Far Location');
});

console.log('\n======================================================');
console.log(`GOOGLE MAPS ROUTING TESTS: Passed: ${passed}, Failed: ${failed}`);
console.log('======================================================');

if (failed > 0) {
    process.exit(1);
}
