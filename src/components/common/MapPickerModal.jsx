import React, { useEffect, useRef, useState } from 'react';
import { MAP_CENTER } from '../../utils/mapUtils';

const MapPickerModal = ({ isOpen, onClose, onConfirm, initialLat, initialLng }) => {
    const mapRef = useRef(null);
    const googleMapRef = useRef(null);
    const markerRef = useRef(null);
    const [selectedPos, setSelectedPos] = useState(null);

    useEffect(() => {
        if (!isOpen) return;

        // Reset selected position based on initial inputs or default
        const initialPos = (initialLat && initialLng) 
            ? { lat: parseFloat(initialLat), lng: parseFloat(initialLng) }
            : MAP_CENTER;
        
        setSelectedPos(initialPos);

        if (!window.google || !window.google.maps) {
            console.error("Google Maps API not loaded");
            return;
        }

        // Initialize Map
        if (!googleMapRef.current && mapRef.current) {
            googleMapRef.current = new window.google.maps.Map(mapRef.current, {
                center: initialPos,
                zoom: 16,
                mapTypeControl: true,
                streetViewControl: false,
                fullscreenControl: true,
                styles: [
                    { "featureType": "poi", "elementType": "labels", "stylers": [{ "visibility": "off" }] }
                ]
            });

            // Click listener
            googleMapRef.current.addListener("click", (e) => {
                const lat = e.latLng.lat();
                const lng = e.latLng.lng();
                setSelectedPos({ lat, lng });

                if (!markerRef.current) {
                    markerRef.current = new window.google.maps.Marker({
                        position: { lat, lng },
                        map: googleMapRef.current,
                        animation: window.google.maps.Animation.DROP
                    });
                } else {
                    markerRef.current.setPosition({ lat, lng });
                }
            });

            // Initial Marker if we have initial coordinates
            if (initialLat && initialLng) {
                markerRef.current = new window.google.maps.Marker({
                    position: initialPos,
                    map: googleMapRef.current
                });
            }
        }
    }, [isOpen, initialLat, initialLng]);

    if (!isOpen) return null;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', width: '90%', maxWidth: '800px', height: '80vh', borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                {/* Header */}
                <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                        <i className="fas fa-map-marker-alt" style={{ color: '#ef4444', marginRight: '8px' }}></i>
                        Pick Location on Map
                    </h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>&times;</button>
                </div>

                {/* Map Area */}
                <div style={{ flex: 1, position: 'relative' }}>
                    <div ref={mapRef} style={{ width: '100%', height: '100%' }}></div>
                    {!selectedPos && (
                        <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', background: '#3b82f6', color: '#fff', padding: '8px 16px', borderRadius: '20px', fontWeight: 700, fontSize: '0.85rem', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', pointerEvents: 'none' }}>
                            Click anywhere on the map to drop a pin
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <div style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
                        {selectedPos ? (
                            <>
                                <span style={{ color: '#0f172a' }}>Lat:</span> {selectedPos.lat.toFixed(6)} <span style={{ color: '#0f172a', marginLeft: '12px' }}>Lng:</span> {selectedPos.lng.toFixed(6)}
                            </>
                        ) : (
                            "No location selected"
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                        <button 
                            onClick={() => {
                                if (selectedPos) {
                                    onConfirm(selectedPos.lat, selectedPos.lng);
                                    onClose();
                                }
                            }} 
                            disabled={!selectedPos}
                            style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: selectedPos ? '#2563eb' : '#94a3b8', color: '#fff', fontWeight: 700, cursor: selectedPos ? 'pointer' : 'not-allowed' }}
                        >
                            Confirm Location
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MapPickerModal;
