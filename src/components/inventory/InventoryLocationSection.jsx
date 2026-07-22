import React, { useCallback, useState } from 'react';
import AddressDetailsForm from '../common/AddressDetailsForm';

const InventoryLocationSection = ({
    formData,
    setFormData,
    mapRef,
    searchInputRef,
    disabledAddressFields,
    inputStyle,
    sectionStyle,
    clearPolygon,
    activateDrawing,
    finishDrawing,
    drawingPointsCount,
    autoDetectLandmarks,
    isDetectingLandmarks
}) => {
    const [isDrawingMode, setIsDrawingMode] = useState(false);

    const handleActivateDrawing = () => {
        activateDrawing();
        setIsDrawingMode(true);
    };

    const handleFinishDrawing = () => {
        finishDrawing();
        setIsDrawingMode(false);
    };

    const handleClearPolygon = () => {
        clearPolygon();
        setIsDrawingMode(false);
    };

    const handleExportKML = () => {
        if (!formData.geoPolygon || !formData.geoPolygon.coordinates || !formData.geoPolygon.coordinates[0]) return;
        const coords = formData.geoPolygon.coordinates[0];
        const kmlString = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Property Boundary</name>
    <Placemark>
      <name>Boundary Polygon</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
${coords.map(c => `${c[0]},${c[1]},0`).join('\n')}
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`;
        const blob = new Blob([kmlString], { type: 'application/vnd.google-earth.kml+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Property_Boundary_${Date.now()}.kml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const onAddressChange = useCallback((newAddr) => {
        setFormData(prev => ({ ...prev, address: newAddr }));
    }, [setFormData]);

    const hasPolygon = !!formData.geoPolygon;
    const hasLocation = !!(formData.latitude && formData.longitude);
    const canFinish = drawingPointsCount >= 3;

    return (
        <div className="tab-content fade-in">
            <div style={sectionStyle}>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fas fa-map-marked-alt" style={{ color: '#ef4444' }}></i> Map Location
                </h4>

                {/* Search Input */}
                <div style={{ marginBottom: '14px', position: 'relative' }}>
                    <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', zIndex: 10 }}></i>
                    <input
                        ref={searchInputRef}
                        type="text"
                        style={{ ...inputStyle, paddingLeft: '36px' }}
                        placeholder="Search location on map..."
                        value={formData.locationSearch || ''}
                        onChange={e => setFormData(prev => ({ ...prev, locationSearch: e.target.value }))}
                    />
                </div>

                {/* ---- Custom Map Toolbar ---- */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'center' }}>

                    {/* PHASE 1: No polygon, not drawing — show "Draw" button */}
                    {!hasPolygon && !isDrawingMode && (
                        <button type="button" onClick={handleActivateDrawing}
                            style={{ padding: '8px 14px', background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
                            <i className="fas fa-draw-polygon"></i> Draw Land Boundary
                        </button>
                    )}

                    {/* PHASE 2: Drawing mode active */}
                    {isDrawingMode && !hasPolygon && (
                        <>
                            {/* Point counter */}
                            <div style={{ padding: '7px 12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, color: '#c2410c', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i className="fas fa-map-pin"></i>
                                {drawingPointsCount} point{drawingPointsCount !== 1 ? 's' : ''} placed
                            </div>

                            {/* Finish button — enabled only after 3+ points */}
                            <button type="button" onClick={handleFinishDrawing} disabled={!canFinish}
                                style={{ padding: '8px 14px', background: canFinish ? 'linear-gradient(135deg,#10b981,#059669)' : '#e2e8f0', color: canFinish ? '#fff' : '#94a3b8', border: 'none', borderRadius: '8px', cursor: canFinish ? 'pointer' : 'not-allowed', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', boxShadow: canFinish ? '0 2px 8px rgba(16,185,129,0.3)' : 'none' }}>
                                <i className="fas fa-check-circle"></i> Finish &amp; Calculate Area
                            </button>

                            {/* Cancel drawing */}
                            <button type="button" onClick={handleClearPolygon}
                                style={{ padding: '8px 12px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                                <i className="fas fa-times"></i> Cancel
                            </button>
                        </>
                    )}

                    {/* PHASE 3: Polygon drawn — show area badge + actions */}
                    {hasPolygon && (
                        <>
                            <div style={{ padding: '7px 14px', background: 'linear-gradient(135deg,#ecfdf5,#d1fae5)', border: '1px solid #6ee7b7', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 700, color: '#065f46', display: 'flex', alignItems: 'center', gap: '7px' }}>
                                <i className="fas fa-check-circle" style={{ color: '#10b981' }}></i>
                                {formData.gpsAreaAcres || 0}A &nbsp;{formData.gpsAreaKanals || 0}K &nbsp;{formData.gpsAreaMarlas || 0}M
                                {formData.gpsPerimeter && (
                                    <span style={{ fontWeight: 400, color: '#047857', marginLeft: '4px' }}>
                                        &nbsp;| {parseFloat(formData.gpsPerimeter).toFixed(0)} m perimeter
                                    </span>
                                )}
                            </div>
                            <button type="button" onClick={handleClearPolygon}
                                style={{ padding: '7px 12px', background: '#fef2f2', color: '#ef4444', border: '1px solid #f87171', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <i className="fas fa-redo-alt"></i> Redraw
                            </button>
                            <button type="button" onClick={handleExportKML}
                                style={{ padding: '7px 12px', background: '#ecfdf5', color: '#10b981', border: '1px solid #34d399', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <i className="fas fa-download"></i> Export KML
                            </button>
                        </>
                    )}

                    {/* Spacer */}
                    <div style={{ flex: 1 }} />

                    {/* AI Detect Button */}
                    <button type="button" onClick={autoDetectLandmarks} disabled={isDetectingLandmarks || !hasLocation}
                        style={{ padding: '7px 14px', background: 'linear-gradient(135deg,#8b5cf6,#d946ef)', color: '#fff', border: 'none', borderRadius: '8px', cursor: (isDetectingLandmarks || !hasLocation) ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', opacity: (isDetectingLandmarks || !hasLocation) ? 0.55 : 1, boxShadow: '0 2px 8px rgba(139,92,246,0.25)' }}>
                        {isDetectingLandmarks ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-robot"></i>}
                        {isDetectingLandmarks ? 'Detecting...' : 'AI Detect Amenities'}
                    </button>
                </div>

                {/* Drawing instruction banner */}
                {isDrawingMode && !hasPolygon && (
                    <div style={{ padding: '10px 14px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', marginBottom: '8px', fontSize: '0.82rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <i className="fas fa-info-circle" style={{ color: '#f59e0b', fontSize: '1rem', flexShrink: 0 }}></i>
                        <span>
                            <b>Click on the map</b> to place boundary points of the land.
                            {drawingPointsCount === 0 && ' Place the first point anywhere on the map.'}
                            {drawingPointsCount === 1 && ' Place at least 2 more points.'}
                            {drawingPointsCount === 2 && ' Place 1 more point, then click "Finish".'}
                            {drawingPointsCount >= 3 && ` ${drawingPointsCount} points placed. Click "Finish & Calculate Area" to complete.`}
                        </span>
                    </div>
                )}

                {/* Google Map Container */}
                <div
                    ref={mapRef}
                    style={{
                        background: '#f1f5f9',
                        borderRadius: '12px',
                        border: isDrawingMode ? '2px solid #f59e0b' : '1px solid #e2e8f0',
                        height: '400px',
                        width: '100%',
                        marginBottom: '12px',
                        overflow: 'hidden',
                        cursor: isDrawingMode ? 'crosshair' : 'default',
                        transition: 'border-color 0.2s'
                    }}
                >
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: '10px' }}>
                        <i className="fas fa-map" style={{ fontSize: '2.5rem', opacity: 0.3 }}></i>
                        <span style={{ fontSize: '0.9rem' }}>Loading Google Maps...</span>
                    </div>
                </div>

                {/* Coordinates row */}
                {hasLocation && (
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                        <div style={{ flex: 1, padding: '7px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.78rem', color: '#64748b', fontFamily: 'monospace' }}>
                            <span style={{ fontWeight: 700, color: '#334155' }}>LAT</span>&nbsp; {formData.latitude}
                        </div>
                        <div style={{ flex: 1, padding: '7px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.78rem', color: '#64748b', fontFamily: 'monospace' }}>
                            <span style={{ fontWeight: 700, color: '#334155' }}>LNG</span>&nbsp; {formData.longitude}
                        </div>
                    </div>
                )}

                {/* Detected Amenities */}
                {formData.nearbyLandmarks && formData.nearbyLandmarks.length > 0 && (
                    <div style={{ marginBottom: '20px', background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <h5 style={{ margin: '0 0 12px 0', fontSize: '0.88rem', color: '#334155', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                            <i className="fas fa-map-pin" style={{ color: '#8b5cf6' }}></i> Detected Nearby Amenities
                        </h5>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: '8px' }}>
                            {formData.nearbyLandmarks.map((lm, idx) => {
                                const iconMap = { hospital: 'fa-hospital', school: 'fa-school', transit_station: 'fa-train', shopping_mall: 'fa-shopping-bag' };
                                const colorMap = { hospital: '#ef4444', school: '#eab308', transit_station: '#3b82f6', shopping_mall: '#f97316' };
                                return (
                                    <div key={idx} style={{ background: '#fff', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: `${colorMap[lm.type] || '#64748b'}15`, color: colorMap[lm.type] || '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.8rem' }}>
                                            <i className={`fas ${iconMap[lm.type] || 'fa-map-marker'}`}></i>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1e293b', lineHeight: 1.3 }}>{lm.name}</div>
                                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                                                {lm.distance < 1000 ? `${lm.distance}m` : `${(lm.distance / 1000).toFixed(1)}km`} away
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Tip */}
                {!isDrawingMode && !hasPolygon && (
                    <div style={{ padding: '10px 14px', background: '#eff6ff', borderRadius: '8px', marginBottom: '20px', border: '1px solid #bfdbfe', fontSize: '0.81rem', color: '#1e40af' }}>
                        <i className="fas fa-lightbulb" style={{ marginRight: '6px', color: '#3b82f6' }}></i>
                        <b>Tip:</b> Drag the pin to set property location. Use <b>Satellite</b> (top-right of map) for better accuracy. Click <b>"Draw Land Boundary"</b> to trace the plot.
                    </div>
                )}

                {/* Address Fields */}
                <AddressDetailsForm
                    title=""
                    address={formData.address}
                    onChange={onAddressChange}
                    disabledFields={disabledAddressFields}
                />
            </div>
        </div>
    );
};

export default React.memo(InventoryLocationSection);
