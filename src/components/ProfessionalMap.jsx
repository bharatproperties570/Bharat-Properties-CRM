import { useEffect, useRef } from 'react';
import { MAP_CENTER } from '../utils/mapUtils';

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
                {
                    "featureType": "all",
                    "elementType": "geometry.fill",
                    "stylers": [{ "weight": "2.00" }]
                },
                {
                    "featureType": "all",
                    "elementType": "geometry.stroke",
                    "stylers": [{ "color": "#9c9c9c" }]
                },
                {
                    "featureType": "all",
                    "elementType": "labels.text",
                    "stylers": [{ "visibility": "on" }]
                },
                {
                    "featureType": "landscape",
                    "elementType": "all",
                    "stylers": [{ "color": "#f2f2f2" }]
                },
                {
                    "featureType": "landscape",
                    "elementType": "geometry.fill",
                    "stylers": [{ "color": "#ffffff" }]
                },
                {
                    "featureType": "landscape.man_made",
                    "elementType": "geometry.fill",
                    "stylers": [{ "color": "#ffffff" }]
                },
                {
                    "featureType": "poi",
                    "elementType": "all",
                    "stylers": [{ "visibility": "off" }]
                },
                {
                    "featureType": "road",
                    "elementType": "all",
                    "stylers": [{ "saturation": -100 }, { "lightness": 45 }]
                },
                {
                    "featureType": "road",
                    "elementType": "geometry.fill",
                    "stylers": [{ "color": "#eeeeee" }]
                },
                {
                    "featureType": "road",
                    "elementType": "labels.text.fill",
                    "stylers": [{ "color": "#7b7b7b" }]
                },
                {
                    "featureType": "road",
                    "elementType": "labels.text.stroke",
                    "stylers": [{ "color": "#ffffff" }]
                },
                {
                    "featureType": "road.highway",
                    "elementType": "all",
                    "stylers": [{ "visibility": "simplified" }]
                },
                {
                    "featureType": "road.arterial",
                    "elementType": "labels.icon",
                    "stylers": [{ "visibility": "off" }]
                },
                {
                    "featureType": "transit",
                    "elementType": "all",
                    "stylers": [{ "visibility": "off" }]
                },
                {
                    "featureType": "water",
                    "elementType": "all",
                    "stylers": [{ "color": "#46bcec" }, { "visibility": "on" }]
                },
                {
                    "featureType": "water",
                    "elementType": "geometry.fill",
                    "stylers": [{ "color": "#c8d7d4" }]
                },
                {
                    "featureType": "water",
                    "elementType": "labels.text.fill",
                    "stylers": [{ "color": "#070707" }]
                },
                {
                    "featureType": "water",
                    "elementType": "labels.text.stroke",
                    "stylers": [{ "color": "#ffffff" }]
                }
            ]
        });

        return () => {
            // Cleanup markers
            markersRef.current.forEach(marker => marker.setMap(null));
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!googleMapRef.current || !window.google) return;

        // Clear existing markers
        markersRef.current.forEach(marker => marker.setMap(null));
        markersRef.current = [];

        const bounds = new window.google.maps.LatLngBounds();
        let validCoords = 0;

        items.forEach((item, index) => {
            const lat = parseFloat(item.latitude || item.lat || (item.inventoryId && (item.inventoryId.latitude || item.inventoryId.lat)));
            const lng = parseFloat(item.longitude || item.lng || (item.inventoryId && (item.inventoryId.longitude || item.inventoryId.lng)));

            if (!isNaN(lat) && !isNaN(lng)) {
                validCoords++;
                const position = { lat, lng };

                const marker = new window.google.maps.Marker({
                    position,
                    map: googleMapRef.current,
                    title: `${item.projectName || ''} ${item.block ? 'Block ' + item.block : ''} - Unit ${item.unitNo || item.unitNumber || ''}`.trim() || `Item ${index + 1}`,
                    icon: {
                        path: 'M12,2C8.1,2,5,5.1,5,9c0,5.2,7,13,7,13s7-7.8,7-13C19,5.1,15.9,2,12,2z M12,11.5c-1.4,0-2.5-1.1-2.5-2.5s1.1-2.5,2.5-2.5s2.5,1.1,2.5,2.5S13.4,11.5,12,11.5z',
                        fillColor: item.status === 'Active' || (item.status && item.status.lookup_value === 'Active') ? '#10b981' : '#ef4444',
                        fillOpacity: 1,
                        strokeWeight: 1.5,
                        strokeColor: '#FFFFFF',
                        scale: 1.8,
                        anchor: new window.google.maps.Point(12, 22),
                        labelOrigin: new window.google.maps.Point(12, 9)
                    }
                });

                if (onMarkerClick) {
                    marker.addListener('click', () => {
                        onMarkerClick(item);
                    });
                }

                markersRef.current.push(marker);
                bounds.extend(position);
            }
        });

        // Auto-fit if multiple markers
        if (validCoords > 1) {
            googleMapRef.current.fitBounds(bounds);
        } else if (validCoords === 1) {
            googleMapRef.current.setCenter(bounds.getCenter());
            googleMapRef.current.setZoom(15);
        } else {
            googleMapRef.current.setCenter(center);
            googleMapRef.current.setZoom(zoom);
        }
    }, [items, center, zoom, onMarkerClick]);

    return <div ref={mapRef} style={style} className="professional-map-container" />;
};

export default ProfessionalMap;
