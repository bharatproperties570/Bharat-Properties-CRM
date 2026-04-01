import React from 'react';
import { renderValue } from '../../utils/renderUtils';
import ProfessionalMap from '../../components/ProfessionalMap';
import { getCoordinates, MAP_CENTER } from '../../utils/mapUtils';

const DealGeography = ({ deal, getLookupValue }) => {
    const cardStyle = {
        background: '#fff',
        borderRadius: '20px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
        marginBottom: '24px',
        overflow: 'hidden'
    };

    const inventory = deal?.inventoryId || {};
    const address = inventory.address || {};
    
    // Correctly extract coordinates
    const rawCoords = getCoordinates(inventory);
    const hasValidCoords = rawCoords !== null;
    const coords = rawCoords || MAP_CENTER;

    const renderSpec = (label, icon, value) => (
        <div style={{ 
            padding: '12px 14px', 
            background: 'rgba(248, 250, 252, 0.5)', 
            borderRadius: '14px', 
            border: '1px solid #f1f5f9',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
        }}>
            <p style={{ margin: 0, fontSize: '0.6rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className={`fas fa-${icon}`} style={{ fontSize: '0.55rem', color: '#cbd5e1' }}></i>
                {label}
            </p>
            <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 800, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {renderValue(value) || '-'}
            </p>
        </div>
    );

    // Full Address Calculation
    const fullAddressParts = [
        renderValue(getLookupValue('Tehsil', address.tehsil)),
        renderValue(getLookupValue('PostOffice', address.postOffice) || address.postOffice),
        renderValue(getLookupValue('City', address.city)),
        renderValue(getLookupValue('State', address.state))
    ].filter(p => p && p !== '-');
    
    const fullAddress = fullAddressParts.length > 0 
        ? fullAddressParts.join(', ') + ` (${renderValue(getLookupValue('Country', address.country) || address.country || 'India')})`
        : 'Full address details not specified';

    return (
        <div style={cardStyle}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '12px', background: 'linear-gradient(to right, #fff, #f8fafc)' }}>
                <div style={{ width: '40px', height: '40px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fas fa-map-marker-alt" style={{ color: '#ef4444' }}></i>
                </div>
                <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.3px' }}>Location Intelligence</h3>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Geospatial data & verified address</p>
                </div>
            </div>

            <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: 'minmax(380px, 450px) 1fr', gap: '32px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Primary Specs Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                        {renderSpec('Country', 'globe-asia', getLookupValue('Country', address.country) || address.country || 'India')}
                        {renderSpec('State', 'map', getLookupValue('State', address.state))}
                        {renderSpec('City', 'city', getLookupValue('City', address.city))}
                        
                        {renderSpec('Location', 'thumbtack', getLookupValue('Area', address.location))}
                        {renderSpec('Tehsil', 'landmark', getLookupValue('Tehsil', address.tehsil))}
                        {renderSpec('Post Office', 'mail-bulk', getLookupValue('PostOffice', address.postOffice) || address.postOffice)}
                        
                        {renderSpec('Pin Code', 'map-pin', address.pincode)}
                        {renderSpec('House Number', 'home', address.hNo || address.houseNo)}
                        {renderSpec('Street / Road', 'road', address.street || address.landmark)}
                        
                        {renderSpec('Area', 'vector-square', getLookupValue('Area', address.area || address.locality))}
                    </div>

                    {/* Full Address Block */}
                    <div style={{ 
                        padding: '18px 24px', 
                        background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.07), rgba(79, 70, 229, 0.03))', 
                        borderRadius: '20px', 
                        border: '1px solid rgba(79, 70, 229, 0.12)',
                        boxShadow: '0 4px 15px -3px rgba(79, 70, 229, 0.05)'
                    }}>
                        <p style={{ margin: '0 0 8px 0', fontSize: '0.65rem', fontWeight: 900, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                            <i className="fas fa-file-alt" style={{ marginRight: '8px' }}></i> FULL OFFICIAL ADDRESS
                        </p>
                        <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1e293b', lineHeight: '1.6' }}>
                            {fullAddress}
                        </p>
                    </div>
                </div>

                <div style={{ height: '320px', borderRadius: '24px', overflow: 'hidden', border: '1px solid #e2e8f0', position: 'relative', boxShadow: '0 8px 30px rgba(0,0,0,0.06)' }}>
                    <ProfessionalMap
                        items={hasValidCoords ? [inventory] : []}
                        center={coords}
                        zoom={15}
                        style={{ width: '100%', height: '100%' }}
                    />
                    
                    {hasValidCoords && (
                        <div style={{
                            position: 'absolute', top: '16px', right: '16px',
                            background: '#10b981', 
                            padding: '8px 14px', borderRadius: '10px', 
                            display: 'flex', alignItems: 'center', gap: '8px', color: '#fff',
                            fontSize: '0.65rem', fontWeight: 900, boxShadow: '0 10px 20px rgba(16, 185, 129, 0.2)',
                            zIndex: 10
                        }}>
                            <i className="fas fa-check-circle"></i>
                            GEOSPATIAL VERIFIED
                        </div>
                    )}

                    <div style={{
                        position: 'absolute', bottom: '16px', right: '16px',
                        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)',
                        padding: '10px 18px', borderRadius: '14px', border: '1px solid #fff',
                        fontSize: '0.65rem', fontWeight: 900, color: '#1e293b',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '8px',
                        textTransform: 'uppercase', letterSpacing: '0.5px'
                    }}>
                        <i className="fas fa-satellite" style={{ color: '#4f46e5' }}></i>
                        Interactive Map
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DealGeography;
