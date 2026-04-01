import React from 'react';
import AddressDetailsForm from '../common/AddressDetailsForm';

const InventoryLocationSection = ({
    formData,
    setFormData,
    mapRef,
    searchInputRef,
    disabledAddressFields,
    inputStyle,
    sectionStyle
}) => {
    return (
        <div className="tab-content fade-in">
            <div style={sectionStyle}>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fas fa-map-marked-alt" style={{ color: '#ef4444' }}></i> Map Location
                </h4>

                {/* Search Input for Map */}
                <div style={{ marginBottom: '16px', position: 'relative' }}>
                    <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', zIndex: 10 }}></i>
                    <input
                        ref={searchInputRef}
                        type="text"
                        style={{ ...inputStyle, paddingLeft: '36px' }}
                        placeholder="Search location on map..."
                        value={formData.locationSearch}
                        onChange={e => setFormData(prev => ({ ...prev, locationSearch: e.target.value }))}
                    />
                </div>

                {/* Live Google Map Container */}
                <div
                    ref={mapRef}
                    style={{ background: '#f1f5f9', borderRadius: '12px', border: '1px solid #e2e8f0', height: '400px', width: '100%', marginBottom: '24px', overflow: 'hidden' }}
                >
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                        Loading Google Maps...
                    </div>
                </div>

                <div style={{ padding: '12px', background: '#eff6ff', borderRadius: '8px', marginBottom: '24px', border: '1px solid #bfdbfe', display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{ width: '32px', height: '32px', background: '#3b82f6', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                        <i className="fas fa-info"></i>
                    </div>
                    <span style={{ fontSize: '0.85rem', color: '#1e40af' }}>
                        <b>Tip:</b> Drag the pin on the map to set the exact property location. The coordinates will be saved automatically.
                    </span>
                </div>

                {/* Cascading Address Fields */}
                <AddressDetailsForm
                    title=""
                    address={formData.address}
                    onChange={(newAddr) => setFormData(prev => ({ ...prev, address: newAddr }))}
                    disabledFields={disabledAddressFields}
                />
            </div>
        </div>
    );
};

export default React.memo(InventoryLocationSection);
