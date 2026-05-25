import { useEffect, useRef } from 'react';
import { MAP_CENTER } from '../utils/mapUtils';
import { MarkerClusterer } from '@googlemaps/markerclusterer';

const ProfessionalMap = ({
    items = [],
    center = MAP_CENTER,
    zoom = 13,
    onMarkerClick = null,
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

        return () => {
            if (clustererRef.current) clustererRef.current.clearMarkers();
            markersRef.current.forEach(marker => marker.setMap(null));
            if (window.handleInfoWindowClick) delete window.handleInfoWindowClick;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!googleMapRef.current || !window.google) return;

        // Clear existing markers and clusters
        if (clustererRef.current) clustererRef.current.clearMarkers();
        markersRef.current.forEach(marker => marker.setMap(null));
        markersRef.current = [];

        const bounds = new window.google.maps.LatLngBounds();
        let validCoords = 0;

        items.forEach((item) => {
            const lat = parseFloat(item.latitude || item.lat || (item.inventoryId && (item.inventoryId.latitude || item.inventoryId.lat)));
            const lng = parseFloat(item.longitude || item.lng || (item.inventoryId && (item.inventoryId.longitude || item.inventoryId.lng)));

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
                    const priceFormatted = item.price ? \`₹\${item.price.toLocaleString('en-IN')}\` : 'Price on Request';
                    const stage = item.stage || 'New';
                    const clientName = item.owner?.name || item.partyStructure?.buyer?.name || 'Unknown Client';
                    
                    const contentString = \`
                        <div style="font-family: inherit; min-width: 200px; padding: 4px;">
                            <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 700; color: #1e293b;">
                                \${item.projectName || item.location || 'Property Requirement'}
                            </h4>
                            <div style="display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #475569;">
                                <div style="display: flex; justify-content: space-between;">
                                    <span><strong>Client:</strong> \${clientName}</span>
                                    <span style="color: \${itemColor}; font-weight: 600;">\${intentStr.toUpperCase() || 'DEAL'}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between;">
                                    <span><strong>Stage:</strong> \${stage}</span>
                                    <span style="color: #10b981; font-weight: 600;">\${priceFormatted}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                    <span><strong>Prob:</strong> \${item.dealProbability || 50}%</span>
                                    <span><strong>Score:</strong> \${item.dealScore || 0}</span>
                                </div>
                            </div>
                            <button 
                                onclick="window.handleInfoWindowClick('\${item._id || item.id}')"
                                style="width: 100%; background: #0f172a; color: white; border: none; border-radius: 4px; padding: 6px; font-size: 12px; font-weight: 600; cursor: pointer;"
                            >
                                View Deal Details
                            </button>
                        </div>
                    \`;

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

    return <div ref={mapRef} style={style} className="professional-map-container" />;
};

export default ProfessionalMap;
