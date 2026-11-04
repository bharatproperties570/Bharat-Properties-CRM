/**
 * Bharat Properties CRM — Google Maps Routes API Adapter
 *
 * Implements real provider request/response handling for Google Maps Routes API
 * (Directions v2 computeRoutes), strict coordinate validation, timeout with retry,
 * rate-limit handling, and graceful fallback to scheduled order.
 *
 * Guarantees:
 * - 0% fabricated travel times, distances, or traffic information.
 * - Accurate optimizationSource: GOOGLE_ROUTES_API, HEURISTIC, or SCHEDULED_ORDER.
 * - Credential-blocked state explicitly recorded when GOOGLE_MAPS_ROUTES_API_KEY is missing.
 */

export function validateCoordinates(prop) {
    if (!prop || typeof prop !== 'object') {
        return { valid: false, error: 'Property object is missing' };
    }
    const lat = Number(prop.lat ?? prop.latitude ?? prop.location?.lat);
    const lng = Number(prop.lng ?? prop.longitude ?? prop.location?.lng);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
        return { valid: false, error: 'Coordinates are missing or NaN' };
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return { valid: false, error: `Coordinates out of geographic range: (${lat}, ${lng})` };
    }
    if (lat === 0 && lng === 0) {
        return { valid: false, error: 'Coordinates are (0, 0) - location not set' };
    }
    return { valid: true, lat, lng };
}

export function getGoogleMapsApiKey() {
    return process.env.GOOGLE_MAPS_ROUTES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || null;
}

export class GoogleMapsRoutingService {
    /**
     * Call Google Maps computeRoutes API with timeout, retry and error handling.
     */
    static async callComputeRoutes(payload, apiKey, options = {}) {
        const timeoutMs = options.timeoutMs || 5000;
        const maxRetries = typeof options.maxRetries === 'number' ? options.maxRetries : 2;
        const endpoint = options.endpoint || 'https://routes.googleapis.com/directions/v2:computeRoutes';

        // Support mock transport injection for deterministic testing
        if (typeof options.mockTransport === 'function') {
            return await options.mockTransport(payload, { apiKey, options });
        }

        let attempt = 0;
        let lastError = null;

        while (attempt <= maxRetries) {
            attempt++;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': apiKey,
                        'X-Goog-FieldMask': 'routes.optimizedIntermediateWaypointIndex,routes.duration,routes.distanceMeters'
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (response.status === 429) {
                    // Rate limit: back off exponentially if retries remain
                    if (attempt <= maxRetries) {
                        const backoff = Math.pow(2, attempt) * 200;
                        await new Promise(r => setTimeout(r, backoff));
                        continue;
                    }
                    const err = new Error('Google Maps Routes API rate limit exceeded (HTTP 429)');
                    err.statusCode = 429;
                    throw err;
                }

                if (!response.ok) {
                    const errorText = await response.text().catch(() => '');
                    // Only retry on 5xx server errors
                    if (response.status >= 500 && attempt <= maxRetries) {
                        await new Promise(r => setTimeout(r, 200 * attempt));
                        continue;
                    }
                    const err = new Error(`Google Maps Routes API error (HTTP ${response.status}): ${errorText}`);
                    err.statusCode = response.status;
                    throw err;
                }

                return await response.json();
            } catch (err) {
                clearTimeout(timeoutId);
                lastError = err;
                if (err.name === 'AbortError') {
                    lastError = new Error(`Google Maps Routes API request timed out after ${timeoutMs}ms`);
                }
                if (attempt <= maxRetries && (!err.statusCode || err.statusCode >= 500 || err.name === 'AbortError')) {
                    await new Promise(r => setTimeout(r, 200 * attempt));
                    continue;
                }
                throw lastError;
            }
        }

        throw lastError || new Error('Google Maps Routes API request failed');
    }

    /**
     * Optimize multi-property site visit itinerary.
     * Enforces strict fallback without fabricating travel times.
     */
    static async optimizeItinerary(properties, options = {}) {
        if (!Array.isArray(properties) || properties.length <= 1) {
            return {
                optimized: false,
                isProviderOptimized: false,
                optimizationSource: 'SCHEDULED_ORDER',
                claimedOptimal: false,
                estimatedTravelTimes: null,
                status: 'SINGLE_PROPERTY_NOOP',
                reason: 'Itinerary contains one or zero properties; no optimization applicable',
                properties: Array.isArray(properties) ? properties : []
            };
        }

        // Two-property no-op: origin and destination are fixed; no intermediate waypoints to optimize
        if (properties.length === 2) {
            return {
                optimized: false,
                isProviderOptimized: false,
                optimizationSource: 'SCHEDULED_ORDER',
                claimedOptimal: false,
                estimatedTravelTimes: null,
                status: 'NO_OPTIMIZATION_REQUIRED',
                reason: 'Itinerary contains two properties; no intermediate waypoints to optimize',
                properties
            };
        }

        // 1. Validate Coordinates across all properties
        const validatedCoords = [];
        for (let i = 0; i < properties.length; i++) {
            const val = validateCoordinates(properties[i]);
            if (!val.valid) {
                return {
                    optimized: false,
                    isProviderOptimized: false,
                    optimizationSource: 'SCHEDULED_ORDER',
                    claimedOptimal: false,
                    estimatedTravelTimes: null,
                    status: 'INVALID_COORDINATES',
                    error: `Property at index ${i} (${properties[i]?.project || 'Unknown'}) has invalid coordinates: ${val.error}`,
                    properties
                };
            }
            validatedCoords.push({ lat: val.lat, lng: val.lng });
        }

        const apiKey = options.apiKey || getGoogleMapsApiKey();

        // 2. Provider Execution for 3 or more properties (Live API or Mock Transport)
        if (apiKey || typeof options.mockTransport === 'function') {
            try {
                // Origin is property 0 (starting visit)
                // Destination is property N-1 (final scheduled anchor)
                // Intermediates are properties 1 through N-2
                const origin = {
                    location: {
                        latLng: {
                            latitude: validatedCoords[0].lat,
                            longitude: validatedCoords[0].lng
                        }
                    }
                };

                const destIdx = validatedCoords.length - 1;
                const destination = {
                    location: {
                        latLng: {
                            latitude: validatedCoords[destIdx].lat,
                            longitude: validatedCoords[destIdx].lng
                        }
                    }
                };

                const intermediates = [];
                for (let k = 1; k < destIdx; k++) {
                    intermediates.push({
                        location: {
                            latLng: {
                                latitude: validatedCoords[k].lat,
                                longitude: validatedCoords[k].lng
                            }
                        },
                        via: false
                    });
                }

                const requestPayload = {
                    origin,
                    destination,
                    intermediates,
                    travelMode: 'DRIVE',
                    optimizeWaypointOrder: true
                };

                const providerResponse = await this.callComputeRoutes(requestPayload, apiKey, options);

                const route = providerResponse?.routes?.[0];
                const optimizedIndices = route?.optimizedIntermediateWaypointIndex;
                const N = intermediates.length;

                // Validate optimized waypoint indices: must be an array of length N, all integers in [0, N-1], unique complete permutation
                const isValidPermutation = (
                    Array.isArray(optimizedIndices) &&
                    optimizedIndices.length === N &&
                    new Set(optimizedIndices).size === N &&
                    optimizedIndices.every(idx => Number.isInteger(idx) && idx >= 0 && idx < N)
                );

                if (route && isValidPermutation) {
                    // Reorder the intermediate properties according to provider's validated optimized indices
                    const reorderedIntermediates = optimizedIndices.map(newIdx => properties[1 + newIdx]);
                    const optimizedProperties = [
                        properties[0],
                        ...reorderedIntermediates,
                        properties[destIdx]
                    ].map((p, idx) => ({ ...p, order: idx }));

                    return {
                        optimized: true,
                        isProviderOptimized: true,
                        optimizationSource: 'GOOGLE_ROUTES_API',
                        claimedOptimal: true,
                        providerDuration: route.duration || null,
                        providerDistanceMeters: route.distanceMeters || null,
                        estimatedTravelTimes: route.duration ? {
                            totalDuration: route.duration,
                            distanceMeters: route.distanceMeters || null
                        } : null,
                        properties: optimizedProperties
                    };
                } else {
                    console.warn('[GoogleMapsRoutingService] Provider returned invalid route or malformed waypoint permutation:', {
                        hasRoute: Boolean(route),
                        optimizedIndices,
                        expectedLength: N
                    });
                }
            } catch (providerErr) {
                console.warn('[GoogleMapsRoutingService] Provider execution failed, falling back cleanly:', providerErr.message);
                if (options.failFast) {
                    throw providerErr;
                }
            }
        }

        // 3. Fallback: Local Geometric Heuristic (if explicitly requested)
        if (options.heuristicProximity === true) {
            const remaining = [...properties];
            const sorted = [remaining.shift()];
            while (remaining.length > 0) {
                const current = sorted[sorted.length - 1];
                const cVal = validateCoordinates(current);

                let closestIdx = 0;
                let minSqDist = Infinity;
                for (let i = 0; i < remaining.length; i++) {
                    const rVal = validateCoordinates(remaining[i]);
                    const dist = Math.pow(rVal.lat - cVal.lat, 2) + Math.pow(rVal.lng - cVal.lng, 2);
                    if (dist < minSqDist) {
                        minSqDist = dist;
                        closestIdx = i;
                    }
                }
                sorted.push(remaining.splice(closestIdx, 1)[0]);
            }

            return {
                optimized: true,
                isProviderOptimized: false,
                optimizationSource: 'HEURISTIC',
                claimedOptimal: false, // Never claim optimal for local heuristic
                estimatedTravelTimes: null, // Strictly null: never fabricate travel times
                properties: sorted.map((p, idx) => ({ ...p, order: idx }))
            };
        }

        // 4. Default Fallback: Preserve Scheduled Order
        return {
            optimized: false,
            isProviderOptimized: false,
            optimizationSource: 'SCHEDULED_ORDER',
            claimedOptimal: false,
            estimatedTravelTimes: null,
            status: !apiKey ? 'CREDENTIAL_BLOCKED' : 'PROVIDER_FALLBACK',
            reason: !apiKey ? 'Google Maps Routes API key not configured in environment (GOOGLE_MAPS_ROUTES_API_KEY)' : 'Provider request unsuccessful; scheduled order preserved',
            properties
        };
    }
}

export default GoogleMapsRoutingService;
