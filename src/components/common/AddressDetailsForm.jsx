import React, { useState, useEffect } from 'react';
import { useContactConfig } from '../../context/ContactConfigContext';

// Helper to get dropdown style
const getDropdownStyle = (disabled) => ({
    width: '100%',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '0.9rem',
    outline: 'none',
    color: '#1e293b',
    backgroundColor: disabled ? '#f1f5f9' : '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    appearance: 'none',
    backgroundImage: disabled ? 'none' : `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23475569%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    backgroundSize: '12px'
});

const getDisabledStyle = () => ({
    ...getDropdownStyle(true),
    color: '#94a3b8'
});

const AddressDetailsForm = ({ address, onChange, title = "Personal Address" }) => {
    const { addressConfig } = useContactConfig();

    // Derived Data Lookups
    const countryData = addressConfig[address.country];
    const states = countryData ? countryData.subCategories.map(s => s.name) : [];

    const stateNode = countryData?.subCategories?.find(s => s.name === address.state);
    const cities = stateNode ? stateNode.subCategories.map(s => s.name) : [];

    const cityNode = stateNode?.subCategories?.find(s => s.name === address.city);
    const locations = cityNode ? cityNode.subCategories.map(s => s.name) : [];

    const locationNode = cityNode?.subCategories?.find(s => s.name === address.location);
    const tehsils = locationNode ? locationNode.subCategories.map(s => s.name) : [];

    const tehsilNode = locationNode?.subCategories?.find(s => s.name === address.tehsil);
    const postOffices = tehsilNode ? tehsilNode.subCategories.map(s => s.name) : [];

    const postOfficeNode = tehsilNode?.subCategories?.find(s => s.name === address.postOffice);
    const pincodes = postOfficeNode ? postOfficeNode.types : [];

    const handleAddressChange = (updates) => {
        onChange({ ...address, ...updates });
    };

    return (
        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                <i className="fas fa-map-marker-alt" style={{ color: '#ef4444' }}></i> {title}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Row 1: Country, State, City */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Country</label>
                        <select
                            value={address.country}
                            onChange={(e) => handleAddressChange({ country: e.target.value, state: '', city: '', location: '', tehsil: '', postOffice: '', pinCode: '' })}
                            style={getDropdownStyle(false)}
                        >
                            <option value="">Select Country</option>
                            {Object.keys(addressConfig).map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>State</label>
                        <select
                            value={address.state}
                            onChange={(e) => handleAddressChange({ state: e.target.value, city: '', location: '', tehsil: '', postOffice: '', pinCode: '' })}
                            disabled={!address.country}
                            style={!address.country ? getDisabledStyle() : getDropdownStyle(false)}
                        >
                            <option value="">Select State</option>
                            {states.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>City</label>
                        <select
                            value={address.city}
                            onChange={(e) => handleAddressChange({ city: e.target.value, location: '', tehsil: '', postOffice: '', pinCode: '' })}
                            disabled={!address.state}
                            style={!address.state ? getDisabledStyle() : getDropdownStyle(false)}
                        >
                            <option value="">Select City</option>
                            {cities.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                </div>

                {/* Row 2: Location, Tehsil, Post Office, Pin Code */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: '20px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Location/Sector</label>
                        <select
                            value={address.location}
                            onChange={(e) => handleAddressChange({ location: e.target.value, tehsil: '', postOffice: '', pinCode: '' })}
                            disabled={!address.city}
                            style={!address.city ? getDisabledStyle() : getDropdownStyle(false)}
                        >
                            <option value="">Select Location</option>
                            {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Tehsil</label>
                        <select
                            value={address.tehsil}
                            onChange={(e) => handleAddressChange({ tehsil: e.target.value, postOffice: '', pinCode: '' })}
                            disabled={!address.location}
                            style={!address.location ? getDisabledStyle() : getDropdownStyle(false)}
                        >
                            <option value="">Select Tehsil</option>
                            {tehsils.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Post Office</label>
                        <select
                            value={address.postOffice}
                            onChange={(e) => {
                                // Logic to auto-select pinCode
                                const selectedPO = tehsilNode?.subCategories?.find(s => s.name === e.target.value);
                                const availablePins = selectedPO?.types || [];
                                const autoPin = availablePins.length === 1 ? availablePins[0] : '';
                                handleAddressChange({ postOffice: e.target.value, pinCode: autoPin });
                            }}
                            disabled={!address.tehsil}
                            style={!address.tehsil ? getDisabledStyle() : getDropdownStyle(false)}
                        >
                            <option value="">Select PO</option>
                            {postOffices.map(po => <option key={po} value={po}>{po}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Pin Code</label>
                        <input
                            type="text"
                            placeholder="Pin Code"
                            value={address.pinCode || ''}
                            onChange={(e) => handleAddressChange({ pinCode: e.target.value })}
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.9rem',
                                outline: 'none',
                                background: '#fff',
                                color: '#1e293b'
                            }}
                        />
                    </div>
                </div>

                {/* Row 3: House No, Street, Area */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, 120px) 2fr 1fr', gap: '20px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>House Number</label>
                        <input
                            type="text"
                            placeholder="House No"
                            value={address.hNo || ''}
                            onChange={(e) => handleAddressChange({ hNo: e.target.value })}
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.9rem',
                                outline: 'none',
                                background: '#fff',
                                color: '#1e293b'
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Street / Road / Landmark</label>
                        <input
                            type="text"
                            placeholder="Enter Street, Road or Landmark"
                            value={address.street || ''}
                            onChange={(e) => handleAddressChange({ street: e.target.value })}
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.9rem',
                                outline: 'none',
                                background: '#fff',
                                color: '#1e293b'
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Area</label>
                        <input
                            type="text"
                            placeholder="Enter Area"
                            value={address.area || ''}
                            onChange={(e) => handleAddressChange({ area: e.target.value })}
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.9rem',
                                outline: 'none',
                                background: '#fff',
                                color: '#1e293b'
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AddressDetailsForm;
