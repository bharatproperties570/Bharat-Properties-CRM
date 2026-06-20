import { useEffect, useRef, useState } from 'react';
import { MAP_CENTER } from '../utils/mapUtils';
import { MarkerClusterer } from '@googlemaps/markerclusterer';

const ProfessionalMap = ({
    items = [],
    dealScores = {},
    center = MAP_CENTER,
    zoom = 13,
    onMarkerClick = null,
    onVisibleItemsChange = null,
    activeDealId = null,
    isInventory = false,
    sizes = [],
    style = { width: '100%', height: '100%' }
}) => {
    const mapRef = useRef(null);
    const googleMapRef = useRef(null);
    const markersRef = useRef([]);
    const clustererRef = useRef(null);
    const infoWindowRef = useRef(null);
    
    const drawnPolygonRef = useRef(null);
    const finishDrawingRef = useRef(null);
    const transitLayerRef = useRef(null);
    const trafficLayerRef = useRef(null);
    const activeCircleRef = useRef(null);
    const [layerStates, setLayerStates] = useState({
        transit: false,
        traffic: false,
        drawing: false
    });

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
        infoWindowRef.current.addListener('closeclick', () => {
            if (activeCircleRef.current) {
                activeCircleRef.current.setMap(null);
                activeCircleRef.current = null;
            }
        });

        // Attach global click handler for InfoWindow button
        window.handleInfoWindowClick = (itemId) => {
            const item = items.find(i => i._id === itemId || i.id === itemId);
            if (item && onMarkerClick) {
                onMarkerClick(item);
            }
        };

        // Enterprise Setup Layers
        transitLayerRef.current = new window.google.maps.TransitLayer();
        trafficLayerRef.current = new window.google.maps.TrafficLayer();



        const filterByPolygon = (polygon) => {
            if (!polygon || !onVisibleItemsChange || !window.google.maps.geometry) return;
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
                return window.google.maps.geometry.poly.containsLocation(position, polygon);
            }).map(item => item._id || item.id);
            onVisibleItemsChange(visibleIds);
        };



        const idleListener = googleMapRef.current.addListener('idle', () => {
            if (!googleMapRef.current || !onVisibleItemsChange) return;
            
            if (drawnPolygonRef.current) {
                filterByPolygon(drawnPolygonRef.current);
                return;
            }

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
            if (activeCircleRef.current) {
                activeCircleRef.current.setMap(null);
                activeCircleRef.current = null;
            }
            if (clustererRef.current) clustererRef.current.clearMarkers();
            markersRef.current.forEach(marker => marker.setMap(null));
            if (drawnPolygonRef.current) drawnPolygonRef.current.setMap(null);
            if (window.handleInfoWindowClick) delete window.handleInfoWindowClick;
            window.google.maps.event.removeListener(idleListener);
            if (finishDrawingRef.current) finishDrawingRef.current();
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

                const scoreData = dealScores[item._id || item.id] || {};
                const gapPct = scoreData.marketGapPct;
                const orientationScore = item.orientationScore || scoreData.orientationScore || null;

                const intentStr = String(item.intent?.lookup_value || item.intent || item.primaryDealIntent || '').toLowerCase();
                const isDemand = intentStr === 'buy' || intentStr === 'rent';

                const getMarkerColor = () => {
                    // Investor Map Priority Override
                    if (gapPct !== undefined && gapPct !== null) {
                        if (gapPct < -10) return '#10b981'; // Green: Undervalued
                        if (gapPct > 15) return '#ef4444'; // Red: Overpriced
                        return '#eab308'; // Yellow: Fair
                    }
                    if (intentStr === 'sell') return '#ec4899'; // Pink
                    if (intentStr === 'rent') return '#f59e0b'; // Yellow
                    if (intentStr === 'lease') return '#3b82f6'; // Blue
                    if (intentStr === 'buy') return '#8b5cf6'; // Purple
                    return item.status === 'Active' || (item.status && item.status.lookup_value === 'Active') ? '#10b981' : '#ef4444';
                };

                const itemColor = getMarkerColor();
                
                const getUnitBg = () => {
                    if (intentStr === 'sell') return '#fdf2f8';
                    if (intentStr === 'rent') return '#fef3c7';
                    if (intentStr === 'lease') return '#eff6ff';
                    if (intentStr === 'buy') return '#f3e8ff';
                    return '#f1f5f9';
                };
                
                const getUnitColor = () => {
                    if (intentStr === 'sell') return '#db2777';
                    if (intentStr === 'rent') return '#d97706';
                    if (intentStr === 'lease') return '#2563eb';
                    if (intentStr === 'buy') return '#7e22ce';
                    return '#475569';
                };

                // Render standard pin for all deals (Sell, Lease, Rent, Buy)
                const marker = new window.google.maps.Marker({
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

                // InfoWindow Content logic
                const handleOpenInfo = () => {
                    const priceFormatted = item.price ? `₹${item.price.toLocaleString('en-IN')}` : 'Price on Request';
                    const stage = item.stage || 'New';
                    
                    const ownerName = item.owner?.name || item.partyStructure?.buyer?.name || item.ownerName || item.owners?.[0]?.name;
                    const associateName = item.associatedContact?.name || item.associateName || item.associates?.[0]?.contact?.name || item.associates?.[0]?.name;
                    const clientName = ownerName || associateName || 'Unknown Client';
                    
                    const ownerPhoneRaw = item.owner?.phones?.[0]?.number || item.owner?.phone || item.ownerPhone || item.owners?.[0]?.phones?.[0]?.number;
                    const associatePhoneRaw = item.associatedContact?.phones?.[0]?.number || item.associatedContact?.mobile || item.associatedContact?.phone || item.associatePhone || item.associates?.[0]?.contact?.phones?.[0]?.number || item.associates?.[0]?.contact?.mobile;
                    const ownerPhone = ownerPhoneRaw || associatePhoneRaw || '';
                    
                    const whatsappLink = ownerPhone ? `https://wa.me/${ownerPhone.replace(/\D/g,'')}` : '#';
                    const telLink = ownerPhone ? `tel:${ownerPhone.replace(/\D/g,'')}` : '#';

                    let footerTitle = 'Latest Feedback';
                    let footerText = 'No feedback yet';

                    if (isInventory) {
                        if (item.history && Array.isArray(item.history)) {
                            const feedbacks = item.history.filter(h => h.type === 'Feedback' || h.note).sort((a, b) => new Date(b.date) - new Date(a.date));
                            if (feedbacks.length > 0) {
                                const lf = feedbacks[0];
                                const dateStr = new Date(lf.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: '2-digit' });
                                footerText = `<span style="color:#1e293b; font-weight:600;">${lf.note || lf.details || 'Updated'}</span> <span style="color:#94a3b8;">(${dateStr})</span>`;
                            }
                        }
                    } else {
                        footerTitle = 'Latest Interaction';
                        footerText = 'No recent interaction';
                        if (item.lastActivity) {
                            const type = item.lastActivity.type?.lookup_value || item.lastActivity.type || 'Activity';
                            const content = item.lastActivity.content || '';
                            const dateStr = item.lastActivity.performedAt ? new Date(item.lastActivity.performedAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : '';
                            footerText = `<span style="color:#6366f1; font-weight:700;">[${type}]</span> <span style="color:#1e293b; font-weight:600;">${content}</span> <span style="color:#94a3b8;">(${dateStr})</span>`;
                        } else if (item.remarks) {
                            footerText = `<span style="color:#1e293b; font-weight:600;">${item.remarks}</span>`;
                        }
                    }

                    const statusDisplay = item.status?.lookup_value || item.status || 'Active';
                    let pricingHtml = '';
                    let rpuHtml = '';
                    if (!isInventory && item.price) {
                        const sizeId = typeof item.sizeConfig === 'object' ? (item.sizeConfig._id || item.sizeConfig.id) : item.sizeConfig;
                        const sizeLookup = sizeId ? sizes?.find(size => size.id === sizeId) : null;
                        const calcArea = sizeLookup && sizeLookup.totalArea ? parseFloat(sizeLookup.totalArea) : item.size;
                        const calcUnit = sizeLookup && sizeLookup.resultMetric ? sizeLookup.resultMetric : item.sizeUnit || 'sq.ft.';
                        
                        if (calcArea && calcArea > 0) {
                            const rpu = Math.round(item.price / calcArea).toLocaleString('en-IN');
                            rpuHtml = `<div style="font-size: 11px; color: #16a34a; font-weight: 700; text-align: right; line-height: 1.1; margin-top: 2px;">₹${rpu}/${String(calcUnit).replace(/\s+/g, '').toLowerCase()}</div>`;
                        }
                    }

                    if (gapPct !== undefined && gapPct !== null) {
                        const isUnder = gapPct < -10;
                        const isOver = gapPct > 15;
                        const badgeColor = isUnder ? '#10b981' : isOver ? '#ef4444' : '#eab308';
                        const badgeText = isUnder ? 'Undervalued' : isOver ? 'Overpriced' : 'Fair';
                        pricingHtml = `
                        <div style="margin-top: 8px; padding: 6px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-size: 11px; color: #475569; font-weight: 600;">Market Gap:</span>
                            <span style="font-size: 11px; font-weight: 700; color: ${badgeColor}; display:flex; align-items:center; gap: 4px;">
                                ${gapPct > 0 ? '+' : ''}${gapPct}% 
                                <span style="background: ${badgeColor}22; padding: 2px 4px; border-radius: 3px; font-size: 9px; text-transform: uppercase;">${badgeText}</span>
                            </span>
                        </div>
                        `;
                    }

                    const contentString = `
                        <div style="font-family: inherit; min-width: 210px; padding: 4px;">
                            <h4 style="margin: 0 0 2px 0; font-size: 14px; font-weight: 700; color: #1e293b; display: flex; align-items: center; justify-content: flex-start; gap: 8px;">
                                ${item.unitNo ? `<span style="background: ${getUnitBg()}; color: ${getUnitColor()}; font-size: 10px; padding: 2px 6px; border-radius: 4px; border: 1px solid ${getUnitColor()}33; white-space: nowrap;">${item.unitNo}</span>` : ''}
                                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;">${item.projectName || item.location || 'Property Requirement'}</span>
                                ${orientationScore >= 80 ? '<i class="fas fa-gem" style="color:#8b5cf6; font-size:12px;" title="Prime Asset"></i>' : ''}
                            </h4>
                            ${item.block ? `<div style="font-size: 11px; color: #64748b; margin-bottom: 8px; font-weight: 500;">Block: <span style="color: #475569; font-weight: 700;">${item.block}</span></div>` : '<div style="margin-bottom: 8px;"></div>'}
                            
                            <div style="display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #475569;">
                                <div style="display: flex; justify-content: space-between;">
                                    <span><strong>Client:</strong> ${clientName}</span>
                                    ${(!isInventory && intentStr) ? `<span style="color: ${itemColor}; font-weight: 600;">${intentStr.toUpperCase()}</span>` : ''}
                                </div>
                                ${!isInventory ? `
                                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                    <span><strong>Status:</strong> ${statusDisplay}</span>
                                    <div style="display: flex; flex-direction: column; align-items: flex-end;">
                                        <span style="color: #10b981; font-weight: 600;">${priceFormatted}</span>
                                        ${rpuHtml}
                                    </div>
                                </div>
                                ` : ''}
                                ${pricingHtml}
                                <div style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed #e2e8f0;">
                                    <span style="display:block; font-size:10px; text-transform:uppercase; font-weight:700; color:#94a3b8; margin-bottom:2px;">${footerTitle}</span>
                                    <div style="font-size:11.5px; display: flex; justify-content: space-between;">
                                        <span>${footerText}</span>
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
                                <button onclick="window.open('http://maps.google.com/maps?q=&layer=c&cbll=${lat},${lng}', '_blank')" style="background: #f59e0b; color: white; border: none; border-radius: 4px; padding: 6px 10px; font-size: 11px; cursor: pointer;" title="Street View">
                                    <i class="fas fa-street-view"></i>
                                </button>
                            </div>
                        </div>
                    `;

                    // Clear any previously active demand circle
                    if (activeCircleRef.current) {
                        activeCircleRef.current.setMap(null);
                        activeCircleRef.current = null;
                    }

                    // If it is a demand deal (Buy/Rent), draw its 500m search radius circle
                    if (isDemand) {
                        activeCircleRef.current = new window.google.maps.Circle({
                            strokeColor: itemColor,
                            strokeOpacity: 0.6,
                            strokeWeight: 1.5,
                            fillColor: itemColor,
                            fillOpacity: 0.15,
                            map: googleMapRef.current,
                            center: position,
                            radius: 500,
                        });
                    }

                    infoWindowRef.current.setContent(contentString);
                    infoWindowRef.current.open(googleMapRef.current, marker);
                };

                marker.addListener('click', handleOpenInfo);

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

    const startDrawing = () => {
        if (!googleMapRef.current) return null;
        if (drawnPolygonRef.current) {
            drawnPolygonRef.current.setMap(null);
            drawnPolygonRef.current = null;
            window.google.maps.event.trigger(googleMapRef.current, 'idle');
        }
        
        const drawPath = [];
        googleMapRef.current.setOptions({ draggableCursor: 'crosshair', draggable: false, disableDoubleClickZoom: true });
        
        const tempPolyline = new window.google.maps.Polyline({
            map: googleMapRef.current,
            path: [],
            strokeColor: '#2563eb',
            strokeWeight: 2,
            strokeOpacity: 0.8,
            clickable: false
        });

        const tempPolygon = new window.google.maps.Polygon({
            map: googleMapRef.current,
            paths: [],
            fillColor: '#3b82f6',
            fillOpacity: 0.2,
            strokeWeight: 0,
            clickable: false
        });
        
        const clickListener = googleMapRef.current.addListener('click', (e) => {
            drawPath.push(e.latLng);
            tempPolyline.setPath(drawPath);
            tempPolygon.setPaths(drawPath);
        });

        const finish = () => {
            if (drawPath.length >= 3) {
                const finalPolygon = new window.google.maps.Polygon({
                    map: googleMapRef.current,
                    paths: drawPath,
                    fillColor: '#3b82f6',
                    fillOpacity: 0.2,
                    strokeWeight: 2,
                    strokeColor: '#2563eb',
                    clickable: false,
                    editable: false,
                    zIndex: 1
                });
                drawnPolygonRef.current = finalPolygon;
                
                // Trigger filter calculation inside the existing component scope
                window.google.maps.event.trigger(googleMapRef.current, 'idle');
            }
            
            window.google.maps.event.removeListener(clickListener);
            window.google.maps.event.removeListener(dblClickListener);
            tempPolyline.setMap(null);
            tempPolygon.setMap(null);
            
            googleMapRef.current.setOptions({ draggableCursor: null, draggable: true, disableDoubleClickZoom: false });
            setLayerStates(prev => ({ ...prev, drawing: false }));
            finishDrawingRef.current = null;
        };

        const dblClickListener = googleMapRef.current.addListener('dblclick', finish);
        return finish;
    };

    const toggleLayer = (layer) => {
        setLayerStates(prev => {
            const next = { ...prev, [layer]: !prev[layer] };
            if (layer === 'transit' && transitLayerRef.current) transitLayerRef.current.setMap(next.transit ? googleMapRef.current : null);
            if (layer === 'traffic' && trafficLayerRef.current) trafficLayerRef.current.setMap(next.traffic ? googleMapRef.current : null);
            if (layer === 'drawing') {
                if (next.drawing) {
                    finishDrawingRef.current = startDrawing();
                } else {
                    if (finishDrawingRef.current) finishDrawingRef.current();
                }
            }
            return next;
        });
    };

    const clearPolygon = () => {
        if (drawnPolygonRef.current) {
            drawnPolygonRef.current.setMap(null);
            drawnPolygonRef.current = null;
            setLayerStates(prev => ({ ...prev, drawing: false }));
            if (googleMapRef.current) window.google.maps.event.trigger(googleMapRef.current, 'idle');
        }
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div ref={mapRef} style={style} className="professional-map-container" />
            
            {/* Map Control Panel */}
            <div style={{ position: 'absolute', bottom: '60px', right: '20px', background: 'white', padding: '10px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 10, minWidth: '130px' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '2px', letterSpacing: '0.5px' }}>Map Controls</div>
                
                <button onClick={() => toggleLayer('transit')} style={{ background: layerStates.transit ? '#eff6ff' : '#f8fafc', color: layerStates.transit ? '#2563eb' : '#475569', border: `1px solid ${layerStates.transit ? '#bfdbfe' : '#e2e8f0'}`, padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}>
                    <i className="fas fa-subway" style={{ width: '16px', textAlign: 'center' }}></i> Transit
                </button>
                
                <button onClick={() => toggleLayer('traffic')} style={{ background: layerStates.traffic ? '#fef2f2' : '#f8fafc', color: layerStates.traffic ? '#dc2626' : '#475569', border: `1px solid ${layerStates.traffic ? '#fecaca' : '#e2e8f0'}`, padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}>
                    <i className="fas fa-car" style={{ width: '16px', textAlign: 'center' }}></i> Traffic
                </button>
                
                <div style={{ borderTop: '1px dashed #cbd5e1', margin: '4px 0' }}></div>
                
                <button onClick={() => toggleLayer('drawing')} style={{ background: layerStates.drawing ? '#eef2ff' : '#f8fafc', color: layerStates.drawing ? '#4f46e5' : '#475569', border: `1px solid ${layerStates.drawing ? '#c7d2fe' : '#e2e8f0'}`, padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}>
                    <i className="fas fa-draw-polygon" style={{ width: '16px', textAlign: 'center' }}></i> Draw Area
                </button>
                
                {drawnPolygonRef.current && (
                    <button onClick={clearPolygon} style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s', marginTop: '4px' }}>
                        <i className="fas fa-times" style={{ width: '16px', textAlign: 'center' }}></i> Clear Area
                    </button>
                )}
            </div>
        </div>
    );
};

export default ProfessionalMap;
