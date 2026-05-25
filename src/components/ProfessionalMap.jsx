import { useEffect, useRef } from 'react';
import { MAP_CENTER } from '../utils/mapUtils';
import { MarkerClusterer } from '@googlemaps/markerclusterer';

const ProfessionalMap = ({
    items = [],
    center = MAP_CENTER,
    zoom = 13,
    onMarkerClick = null,
    onVisibleItemsChange = null,
    activeDealId = null,
    style = { width: '100%', height: '100%' }
}) => {
    const mapRef = useRef(null);
    const googleMapRef = useRef(null);
    const markersRef = useRef([]);
    const clustererRef = useRef(null);
    const infoWindowRef = useRef(null);

    useEffect(() => {
        if (!window.google || !window.google.maps || !mapRef.current) return;

        // Initialize Map
        googleMapRef.current = new window.google.maps.Map(mapRef.current, {
            center: center,
            zoom: zoom,
            mapTypeControl: true,
            streetViewControl: false,
            fullscreenControl: true,
            styles: [
                { "featureType": "all", "elementType": "geometry.fill", "stylers": [{ "weight": "2.00" }] },
                { "featureType": "all", "elementType": "geometry.stroke", "stylers": [{ "color": "#9c9c9c" }] },
                { "featureType": "all", "elementType": "labels.text", "stylers": [{ "visibility": "on" }] },
                { "featureType": "landscape", "elementType": "all", "stylers": [{ "color": "#f2f2f2" }] },
                { "featureType": "landscape", "elementType": "geometry.fill", "stylers": [{ "color": "#ffffff" }] },
                { "featureType": "landscape.man_made", "elementType": "geometry.fill", "stylers": [{ "color": "#ffffff" }] },
                { "featureType": "poi", "elementType": "all", "stylers": [{ "visibility": "off" }] },
                { "featureType": "road", "elementType": "all", "stylers": [{ "saturation": -100 }, { "lightness": 45 }] },
                { "featureType": "road", "elementType": "geometry.fill", "stylers": [{ "color": "#eeeeee" }] },
                { "featureType": "road", "elementType": "labels.text.fill", "stylers": [{ "color": "#7b7b7b" }] },
                { "featureType": "road", "elementType": "labels.text.stroke", "stylers": [{ "color": "#ffffff" }] },
                { "featureType": "road.highway", "elementType": "all", "stylers": [{ "visibility": "simplified" }] },
                { "featureType": "road.arterial", "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
                { "featureType": "transit", "elementType": "all", "stylers": [{ "visibility": "off" }] },
                { "featureType": "water", "elementType": "all", "stylers": [{ "color": "#46bcec" }, { "visibility": "on" }] },
                { "featureType": "water", "elementType": "geometry.fill", "stylers": [{ "color": "#c8d7d4" }] },
                { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#070707" }] },
                { "featureType": "water", "elementType": "labels.text.stroke", "stylers": [{ "color": "#ffffff" }] }
            ]
        });

        infoWindowRef.current = new window.google.maps.InfoWindow();

        // Attach global click handler for InfoWindow button
        window.handleInfoWindowClick = (itemId) => {
            const item = items.find(i => i._id === itemId || i.id === itemId);
            if (item && onMarkerClick) {
                onMarkerClick(item);
            }
        };

        const idleListener = googleMapRef.current.addListener('idle', () => {
            if (!googleMapRef.current || !onVisibleItemsChange) return;
            const bounds = googleMapRef.current.getBounds();
            if (!bounds) return;

            const visibleIds = items.filter(item => {
                let lat = parseFloat(item.latitude || item.lat);
                let lng = parseFloat(item.longitude || item.lng);

                if (isNaN(lat) && item.inventoryId && typeof item.inventoryId === 'object') {
                    lat = parseFloat(item.inventoryId.latitude || item.inventoryId.lat);
                    lng = parseFloat(item.inventoryId.longitude || item.inventoryId.lng);
                }

                if (isNaN(lat) && item.projectId && typeof item.projectId === 'object') {
                    lat = parseFloat(item.projectId.latitude || item.projectId.lat);
                    lng = parseFloat(item.projectId.longitude || item.projectId.lng);
                }

                if (isNaN(lat) && item.locationCoords && typeof item.locationCoords === 'object') {
                    lat = parseFloat(item.locationCoords.lat);
                    lng = parseFloat(item.locationCoords.lng);
                }

                if (isNaN(lat) || isNaN(lng)) return false;

                const position = new window.google.maps.LatLng(lat, lng);
                return bounds.contains(position);
            }).map(item => item._id || item.id);

            onVisibleItemsChange(visibleIds);
        });

        return () => {
            if (clustererRef.current) clustererRef.current.clearMarkers();
            markersRef.current.forEach(marker => marker.setMap(null));
            if (window.handleInfoWindowClick) delete window.handleInfoWindowClick;
            window.google.maps.event.removeListener(idleListener);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items, onVisibleItemsChange]);

    useEffect(() => {
        if (!googleMapRef.current || !window.google) return;

        // Clear existing markers and clusters
        if (clustererRef.current) clustererRef.current.clearMarkers();
        markersRef.current.forEach(marker => marker.setMap(null));
        markersRef.current = [];

        const bounds = new window.google.maps.LatLngBounds();
        let validCoords = 0;

        items.forEach((item) => {
            let lat = parseFloat(item.latitude || item.lat);
            let lng = parseFloat(item.longitude || item.lng);

            if (isNaN(lat) && item.inventoryId && typeof item.inventoryId === 'object') {
                lat = parseFloat(item.inventoryId.latitude || item.inventoryId.lat);
                lng = parseFloat(item.inventoryId.longitude || item.inventoryId.lng);
            }

            if (isNaN(lat) && item.projectId && typeof item.projectId === 'object') {
                lat = parseFloat(item.projectId.latitude || item.projectId.lat);
                lng = parseFloat(item.projectId.longitude || item.projectId.lng);
            }

            if (isNaN(lat) && item.locationCoords && typeof item.locationCoords === 'object') {
                lat = parseFloat(item.locationCoords.lat);
                lng = parseFloat(item.locationCoords.lng);
            }

            if (!isNaN(lat) && !isNaN(lng)) {
                validCoords++;
                const position = { lat, lng };

                const intentStr = String(item.intent?.lookup_value || item.intent || item.primaryDealIntent || '').toLowerCase();
                const isDemand = intentStr === 'buy' || intentStr === 'rent';

                const getMarkerColor = () => {
                    if (intentStr === 'sell') return '#ec4899'; // Pink
                    if (intentStr === 'rent') return '#f59e0b'; // Yellow
                    if (intentStr === 'lease') return '#3b82f6'; // Blue
                    if (intentStr === 'buy') return '#8b5cf6'; // Purple
                    return item.status === 'Active' || (item.status && item.status.lookup_value === 'Active') ? '#10b981' : '#ef4444';
                };

                const itemColor = getMarkerColor();

                let marker;
                if (isDemand) {
                    // Render Circle for Buy/Rent representing search radius
                    marker = new window.google.maps.Circle({
                        strokeColor: itemColor,
                        strokeOpacity: 0.8,
                        strokeWeight: 2,
                        fillColor: itemColor,
                        fillOpacity: 0.35,
                        map: googleMapRef.current,
                        center: position,
                        radius: 500, // 500 meters search zone
                    });
                } else {
                    // Render standard pin for Supply (Sell/Lease)
                    marker = new window.google.maps.Marker({
                        position,
                        map: googleMapRef.current,
                        icon: {
                            path: 'M12,2C8.1,2,5,5.1,5,9c0,5.2,7,13,7,13s7-7.8,7-13C19,5.1,15.9,2,12,2z M12,11.5c-1.4,0-2.5-1.1-2.5-2.5s1.1-2.5,2.5-2.5s2.5,1.1,2.5,2.5S13.4,11.5,12,11.5z',
                            fillColor: itemColor,
                            fillOpacity: 1,
                            strokeWeight: 1.5,
                            strokeColor: '#FFFFFF',
                            scale: 1.8,
                            anchor: new window.google.maps.Point(12, 22),
                        }
                    });
                }

                // InfoWindow Content logic
                const handleOpenInfo = () => {
                    const priceFormatted = item.price ? `₹${item.price.toLocaleString('en-IN')}` : 'Price on Request';
                    const stage = item.stage || 'New';
                    const clientName = item.owner?.name || item.partyStructure?.buyer?.name || 'Unknown Client';
                    
                    const ownerPhone = item.owner?.phones?.[0]?.number || item.ownerPhone || '';
                    const whatsappLink = ownerPhone ? `https://wa.me/${ownerPhone.replace(/\D/g,'')}` : '#';
                    const telLink = ownerPhone ? `tel:${ownerPhone.replace(/\D/g,'')}` : '#';

                    let latestFeedbackText = 'No feedback yet';
                    if (item.history && Array.isArray(item.history)) {
                        const feedbacks = item.history.filter(h => h.type === 'Feedback' || h.note).sort((a, b) => new Date(b.date) - new Date(a.date));
                        if (feedbacks.length > 0) {
                            const lf = feedbacks[0];
                            const dateStr = new Date(lf.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: '2-digit' });
                            latestFeedbackText = `<span style="color:#1e293b; font-weight:600;">${lf.note || lf.details || 'Updated'}</span> <span style="color:#94a3b8;">(${dateStr})</span>`;
                        }
                    }

                    const statusDisplay = item.status?.lookup_value || item.status || 'Active';

                    const contentString = `
                        <div style="font-family: inherit; min-width: 200px; padding: 4px;">
                            <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 700; color: #1e293b;">
                                ${item.projectName || item.location || 'Property Requirement'}
                            </h4>
                            <div style="display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #475569;">
                                <div style="display: flex; justify-content: space-between;">
                                    <span><strong>Client:</strong> ${clientName}</span>
                                    <span style="color: ${itemColor}; font-weight: 600;">${intentStr.toUpperCase() || 'DEAL'}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between;">
                                    <span><strong>Status:</strong> ${statusDisplay}</span>
                                    <span style="color: #10b981; font-weight: 600;">${priceFormatted}</span>
                                </div>
                                <div style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed #e2e8f0;">
                                    <span style="display:block; font-size:10px; text-transform:uppercase; font-weight:700; color:#94a3b8; margin-bottom:2px;">Latest Feedback</span>
                                    <div style="font-size:11.5px; display: flex; justify-content: space-between;">
                                        <span>${latestFeedbackText}</span>
                                        <span style="font-weight:700; color:${statusDisplay.toLowerCase() === 'active' ? '#10b981' : '#f59e0b'}; margin-left:8px;">${statusDisplay}</span>
                                    </div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 6px; margin-top: 10px;">
                                <button 
                                    onclick="window.handleInfoWindowClick('${item._id || item.id}')"
                                    style="flex: 1; background: #0f172a; color: white; border: none; border-radius: 4px; padding: 6px; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;"
                                >
                                    <i class="fas fa-external-link-alt"></i> Details
                                </button>
                                ${ownerPhone ? `
                                <button onclick="window.open('${whatsappLink}', '_blank')" style="background: #25D366; color: white; border: none; border-radius: 4px; padding: 6px 10px; font-size: 11px; cursor: pointer;" title="WhatsApp Client">
                                    <i class="fab fa-whatsapp"></i>
                                </button>
                                <button onclick="window.location.href='${telLink}'" style="background: #3b82f6; color: white; border: none; border-radius: 4px; padding: 6px 10px; font-size: 11px; cursor: pointer;" title="Call Client">
                                    <i class="fas fa-phone-alt"></i>
                                </button>
                                ` : ''}
                            </div>
                        </div>
                    `;

                    infoWindowRef.current.setContent(contentString);
                    if (isDemand) {
                        infoWindowRef.current.setPosition(position);
                        infoWindowRef.current.open(googleMapRef.current);
                    } else {
                        infoWindowRef.current.open(googleMapRef.current, marker);
                    }
                };

                if (isDemand) {
                    marker.addListener('click', handleOpenInfo);
                } else {
                    marker.addListener('click', handleOpenInfo);
                }

                // Store metadata for active tracking
                marker._dealId = item._id || item.id;
                marker._isDemand = isDemand;
                marker._position = position;
                marker._handleOpenInfo = handleOpenInfo;

                markersRef.current.push(marker);
                bounds.extend(position);
            }
        });

        // Add Clustering for Markers only (not circles)
        const pointMarkers = markersRef.current.filter(m => m instanceof window.google.maps.Marker);
        if (pointMarkers.length > 0) {
            clustererRef.current = new MarkerClusterer({
                map: googleMapRef.current,
                markers: pointMarkers
            });
        }

        // Auto-fit
        if (validCoords > 1) {
            googleMapRef.current.fitBounds(bounds);
        } else if (validCoords === 1) {
            googleMapRef.current.setCenter(bounds.getCenter());
            googleMapRef.current.setZoom(15);
        } else {
            googleMapRef.current.setCenter(center);
            googleMapRef.current.setZoom(zoom);
        }
    }, [items, center, zoom]);

    // Handle Active Deal Selection Animation
    useEffect(() => {
        if (!googleMapRef.current || !window.google || !activeDealId) return;

        const activeMarker = markersRef.current.find(m => m._dealId === activeDealId);
        if (activeMarker) {
            googleMapRef.current.panTo(activeMarker._position || (activeMarker.getPosition && activeMarker.getPosition()));
            googleMapRef.current.setZoom(16);

            if (!activeMarker._isDemand && activeMarker.setAnimation) {
                activeMarker.setAnimation(window.google.maps.Animation.BOUNCE);
                setTimeout(() => {
                    if (activeMarker.setAnimation) activeMarker.setAnimation(null);
                }, 2100); // Stop bouncing after 3 bounces
            }

            if (activeMarker._handleOpenInfo) {
                activeMarker._handleOpenInfo();
            }
        }
    }, [activeDealId]);

    return <div ref={mapRef} style={style} className="professional-map-container" />;
};

export default ProfessionalMap;
