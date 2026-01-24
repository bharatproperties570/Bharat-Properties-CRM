import React, { useState, useEffect, useRef } from 'react';
import { companyData } from '../data/companyData'; // Import real company data

// Mock Permission Hook
const usePermission = (permission) => {
    return true;
};

function AddProjectModal({ isOpen, onClose, onSave }) {
    const [isLoading, setIsLoading] = useState(true);
    const [hasPermission, setHasPermission] = useState(false);
    const [activeTab, setActiveTab] = useState('Basic');
    const [amenityTab, setAmenityTab] = useState('Basic');

    // Comprehensive State
    const [formData, setFormData] = useState({
        // Basic Info
        name: '',
        developerName: '',
        isJointVenture: false,
        secondaryDeveloper: '',
        reraNumber: '',
        description: '',
        category: 'Residential',
        subCategory: 'Plot, House, Flat/Apartment, Builder Floor',

        // Project Stats
        landArea: '',
        landAreaUnit: 'Acres',
        totalBlocks: '0',
        totalFloors: '0',
        totalUnits: '0',
        status: '',

        // Dates
        launchDate: '',
        expectedCompletionDate: '',
        possessionDate: '',

        // Bank & Approvals
        parkingType: 'Open Parking',
        approvedBank: 'Punjab & Sind Bank',
        approvalAuthority: '',
        registrationNo: '',
        approvalDate: '',

        // System Details
        owner: 'Suraj Keshwar',
        team: 'Sales, Marketing, Post Sales, Pre Sales',
        visibleTo: 'All Users',

        // Location
        locationSearch: '',
        latitude: '',
        longitude: '',
        address: {
            addressLine: '',
            street: '',
            locality: '',
            city: '',
            zip: '',
            state: '',
            country: ''
        },

        // Amenities (Booleans)
        amenities: {}
    });

    const modalRef = useRef(null);
    const canCreateProject = usePermission('create_project');

    const basicAmenities = [
        'Car Parking', 'Intercom', 'Multi-Purpose Hall', '24x7 Water Supply',
        'Municipal Water Supply', 'Garbage Management System', 'Fire Fighting System',
        'Visitor Car Parking', 'Earthquake Resistance', 'Lift', 'Maintenance Staff',
        'Power Supply', 'Air Condition', 'Security', 'Bike Parking', 'Others'
    ];
    const featuredAmenities = [
        'Senior Citizen Corner', 'Worship Place', 'HAVC System', 'Cricket Pitch',
        'Two Tier Security', 'Cafeteria', 'Car Washing Area', 'No Common Wall',
        'Driver Dormitory', 'EPABX System', 'CCTV', 'Gymnasium', 'Garden',
        'Power Back Up', 'Party Lawn', 'Gazebo', 'Cold Storage', 'Solar Water Heater',
        'Jogging Track', 'DTH Connection', 'Three Tier Security', 'Smoking Area',
        'Spa & Saloon', 'Solar Power', 'Video Door Phone', 'Utility Shop', 'Steam Room',
        'Amphi Theatre', 'Private Car Parking', 'Guest Room', 'Internet', 'Kids Play Area',
        'Barbeque Facility', 'Basket Ball Court', 'Skating Rink', 'Society Office',
        'Squash Court', 'Waiting Lounge', 'Yoga And Meditation Center', 'Water Softener',
        'Swipe Card Entry', 'Health Facilities', 'Library', 'Day Care Center', 'Reception'
    ];
    const nearbyAmenities = ['School', 'Hospital', 'Metro Station', 'Shopping Mall', 'Market'];
    const categories = ['Residential', 'Commercial', 'Agricultural', 'Industrial', 'Institutional'];

    // Filter Companies for Developer List
    const developers = companyData.map(c => c.name).sort();

    useEffect(() => {
        if (isOpen) {
            setIsLoading(true);
            setTimeout(() => {
                setHasPermission(canCreateProject);
                setIsLoading(false);
            }, 500);
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
            setIsLoading(true);
            setActiveTab('Basic');
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [isOpen, canCreateProject]);

    const handleAmenityChange = (name) => {
        setFormData(prev => ({
            ...prev, amenities: { ...prev.amenities, [name]: !prev.amenities[name] }
        }));
    };

    const toggleAllAmenities = (list) => {
        const allSelected = list.every(a => formData.amenities[a]);
        const newAmenities = { ...formData.amenities };
        list.forEach(a => { newAmenities[a] = !allSelected; });
        setFormData(prev => ({ ...prev, amenities: newAmenities }));
    };

    const handleSave = () => {
        console.log("Saving Consolidated Project Data:", formData);
        onSave(formData);
    };

    if (!isOpen) return null;

    // --- Design System Constants (Extracted from AddCompanyModal/AddActivities) ---
    const labelStyle = {
        fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px', display: 'block'
    };
    const inputStyle = {
        width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0',
        fontSize: '0.9rem', outline: 'none', color: '#1e293b', transition: 'all 0.2s',
        backgroundColor: '#fff', height: '42px', boxSizing: 'border-box'
    };
    const customSelectStyle = {
        ...inputStyle,
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23475569%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '12px', paddingRight: '32px'
    };

    // INCREASED WIDTH STYLE: Using 100% width but keeping padding
    const sectionStyle = {
        background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)', marginBottom: '24px' // Gap between sections
    };

    const renderBasicTab = () => (
        <div className="tab-content fade-in">
            {/* Project Identity */}
            <div style={sectionStyle}>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fas fa-info-circle" style={{ color: '#3b82f6' }}></i> Project Identity
                </h4>
                <div className="grid-2-col gap-24">
                    <div>
                        <label style={labelStyle}>Project Name <span style={{ color: '#ef4444' }}>*</span></label>
                        <input style={inputStyle} placeholder="e.g. Green Valley Heights" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                    </div>
                    <div>
                        <label style={labelStyle}>RERA Number</label>
                        <input style={inputStyle} placeholder="e.g. PBRERA-SAS81-PR0123" value={formData.reraNumber} onChange={e => setFormData({ ...formData, reraNumber: e.target.value })} />
                    </div>
                </div>

                <div style={{ marginTop: '20px' }}>
                    <label style={labelStyle}>Category</label>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setFormData({ ...formData, category: cat })}
                                style={{
                                    padding: '8px 16px', borderRadius: '8px', border: `1.5px solid ${formData.category === cat ? '#10b981' : '#e2e8f0'}`,
                                    background: formData.category === cat ? '#ecfdf5' : '#fff', color: formData.category === cat ? '#047857' : '#64748b',
                                    fontWeight: formData.category === cat ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s'
                                }}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label style={labelStyle}>Sub Category</label>
                    <select style={customSelectStyle} value={formData.subCategory} onChange={e => setFormData({ ...formData, subCategory: e.target.value })}>
                        <option>Plot, House, Flat/Apartment, Builder Floor</option>
                        <option>Villa</option>
                        <option>Penthouse</option>
                        <option>SCO</option>
                    </select>
                </div>
            </div>

            {/* Development */}
            <div style={sectionStyle}>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fas fa-hard-hat" style={{ color: '#f59e0b' }}></i> Development Details
                </h4>
                <div className="grid-2-col gap-24">
                    <div>
                        <label style={labelStyle}>Developer Name</label>
                        <select style={customSelectStyle} value={formData.developerName} onChange={e => setFormData({ ...formData, developerName: e.target.value })}>
                            <option value="">---Select Developer---</option>
                            {developers.map(dev => <option key={dev} value={dev}>{dev}</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', height: '42px', marginTop: '22px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.9rem', color: '#334155' }}>
                            <input type="checkbox" checked={formData.isJointVenture} onChange={e => setFormData({ ...formData, isJointVenture: e.target.checked })} style={{ width: '16px', height: '16px', accentColor: '#10b981' }} />
                            Is this a Joint Venture?
                        </label>
                    </div>
                </div>
                {formData.isJointVenture && (
                    <div style={{ marginTop: '20px', width: '50%' }}>
                        <label style={labelStyle}>Secondary Developer</label>
                        <select style={customSelectStyle} value={formData.secondaryDeveloper} onChange={e => setFormData({ ...formData, secondaryDeveloper: e.target.value })}>
                            <option value="">---Select Partner---</option>
                            {developers.map(dev => <option key={dev} value={dev}>{dev}</option>)}
                        </select>
                    </div>
                )}
            </div>

            {/* Config & Stats */}
            <div style={sectionStyle}>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fas fa-chart-pie" style={{ color: '#8b5cf6' }}></i> Configuration
                </h4>
                <div className="grid-4-col gap-16">
                    <div>
                        <label style={labelStyle}>Land Area</label>
                        <div style={{ display: 'flex' }}>
                            <input style={{ ...inputStyle, borderRight: 'none', borderRadius: '8px 0 0 8px' }} placeholder="0" value={formData.landArea} onChange={e => setFormData({ ...formData, landArea: e.target.value })} />
                            <select style={{ ...customSelectStyle, width: '100px', borderRadius: '0 8px 8px 0', borderLeft: '1px solid #e2e8f0', background: '#f8fafc' }} value={formData.landAreaUnit} onChange={e => setFormData({ ...formData, landAreaUnit: e.target.value })}>
                                <option>Acres</option>
                                <option>Hectares</option>
                                <option>Sq Yards</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label style={labelStyle}>Total Blocks</label>
                        <select style={customSelectStyle} value={formData.totalBlocks} onChange={e => setFormData({ ...formData, totalBlocks: e.target.value })}>
                            {[0, 1, 2, 3, 4, 5, 10, 15, 20, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Total Floors</label>
                        <select style={customSelectStyle} value={formData.totalFloors} onChange={e => setFormData({ ...formData, totalFloors: e.target.value })}>
                            {[0, 1, 2, 3, 4, 5, 10, 15, 20, 30, 50].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Total Units</label>
                        <select style={customSelectStyle} value={formData.totalUnits} onChange={e => setFormData({ ...formData, totalUnits: e.target.value })}>
                            {[0, 10, 50, 100, 200, 500, 1000].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                    </div>
                </div>

                <div className="grid-2-col gap-24 mt-24">
                    <div>
                        <label style={labelStyle}>Current Status</label>
                        <select style={customSelectStyle} value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                            <option value="">---Select Status---</option>
                            <option value="New Launch">New Launch</option>
                            <option value="Under Construction">Under Construction</option>
                            <option value="Ready to Move">Ready to Move</option>
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Parking Type</label>
                        <select style={customSelectStyle} value={formData.parkingType} onChange={e => setFormData({ ...formData, parkingType: e.target.value })}>
                            <option>Open Parking</option>
                            <option>Covered Parking</option>
                            <option>Basement Parking</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Timeline */}
            <div style={sectionStyle}>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fas fa-calendar-alt" style={{ color: '#ec4899' }}></i> Timeline
                </h4>
                <div className="grid-3-col gap-24">
                    <div>
                        <label style={labelStyle}>Launch Date</label>
                        <input type="date" style={inputStyle} value={formData.launchDate || '2026-01-24'} onChange={(e) => setFormData({ ...formData, launchDate: e.target.value })} />
                    </div>
                    <div>
                        <label style={labelStyle}>Expected Completion</label>
                        <input type="date" style={inputStyle} value={formData.expectedCompletionDate || '2026-01-24'} onChange={(e) => setFormData({ ...formData, expectedCompletionDate: e.target.value })} />
                    </div>
                    <div>
                        <label style={labelStyle}>Possession Date</label>
                        <input type="date" style={inputStyle} value={formData.possessionDate || '2026-01-24'} onChange={(e) => setFormData({ ...formData, possessionDate: e.target.value })} />
                    </div>
                </div>
            </div>

            {/* System Details (Identical to AddCompany) */}
            <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fas fa-cogs" style={{ color: '#10b981' }}></i> System Details
                </h4>
                <div className="grid-3-col gap-24">
                    <div>
                        <label style={labelStyle}>Owner</label>
                        <select style={customSelectStyle} value={formData.owner} onChange={e => setFormData({ ...formData, owner: e.target.value })}>
                            <option>Suraj Keshwar</option>
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Team</label>
                        <select style={customSelectStyle} value={formData.team} onChange={e => setFormData({ ...formData, team: e.target.value })}>
                            <option>Sales, Marketing, Post Sales...</option>
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Visible to</label>
                        <select style={customSelectStyle} value={formData.visibleTo} onChange={e => setFormData({ ...formData, visibleTo: e.target.value })}>
                            <option>All Users</option>
                            <option>Only Me</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderLocationTab = () => (
        <div className="tab-content fade-in space-y-6">
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'end' }}>
                <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Search Location</label>
                    <div style={{ position: 'relative' }}>
                        <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}></i>
                        <input style={{ ...inputStyle, paddingLeft: '36px' }} placeholder="Type to search google maps..." value={formData.locationSearch} onChange={e => setFormData({ ...formData, locationSearch: e.target.value })} />
                    </div>
                </div>
                <button style={{ padding: '0 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', height: '42px' }}>
                    <i className="fas fa-map-marker-alt"></i> Get Co-ords
                </button>
            </div>

            <div style={sectionStyle}>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fas fa-map-pin" style={{ color: '#ef4444' }}></i> Coordinates
                </h4>
                <div className="grid-2-col gap-24">
                    <div>
                        <label style={labelStyle}>Latitude</label>
                        <input style={{ ...inputStyle, background: '#f8fafc' }} readOnly value={formData.latitude} placeholder="0.000000" />
                    </div>
                    <div>
                        <label style={labelStyle}>Longitude</label>
                        <input style={{ ...inputStyle, background: '#f8fafc' }} readOnly value={formData.longitude} placeholder="0.000000" />
                    </div>
                </div>
            </div>

            <div style={sectionStyle}>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fas fa-envelope-open-text" style={{ color: '#6366f1' }}></i> Address Details
                </h4>
                <div className="grid-2-col gap-24 mb-24">
                    <div>
                        <label style={labelStyle}>Flat / House No.</label>
                        <input style={inputStyle} value={formData.address.addressLine} onChange={e => setFormData({ ...formData, address: { ...formData.address, addressLine: e.target.value } })} />
                    </div>
                    <div>
                        <label style={labelStyle}>Street / Colony</label>
                        <input style={inputStyle} value={formData.address.street} onChange={e => setFormData({ ...formData, address: { ...formData.address, street: e.target.value } })} />
                    </div>
                </div>
                <div className="grid-3-col gap-24 mb-24">
                    <div>
                        <label style={labelStyle}>Locality / Sector</label>
                        <input style={inputStyle} value={formData.address.locality} onChange={e => setFormData({ ...formData, address: { ...formData.address, locality: e.target.value } })} />
                    </div>
                    <div>
                        <label style={labelStyle}>City</label>
                        <select style={customSelectStyle} value={formData.address.city} onChange={e => setFormData({ ...formData, address: { ...formData.address, city: e.target.value } })}>
                            <option>---Select---</option>
                            <option>Chandigarh</option>
                            <option>Mohali</option>
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Zip Code</label>
                        <input style={inputStyle} value={formData.address.zip} onChange={e => setFormData({ ...formData, address: { ...formData.address, zip: e.target.value } })} />
                    </div>
                </div>
                <div className="grid-2-col gap-24">
                    <div>
                        <label style={labelStyle}>State</label>
                        <select style={customSelectStyle} value={formData.address.state} onChange={e => setFormData({ ...formData, address: { ...formData.address, state: e.target.value } })}>
                            <option>---Select---</option>
                            <option>Punjab</option>
                            <option>Haryana</option>
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Country</label>
                        <select style={customSelectStyle} value={formData.address.country} onChange={e => setFormData({ ...formData, address: { ...formData.address, country: e.target.value } })}>
                            <option>India</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderAmenitiesTab = () => {
        const list = amenityTab === 'Basic' ? basicAmenities : amenityTab === 'Featured' ? featuredAmenities : nearbyAmenities;
        return (
            <div className="tab-content fade-in">
                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                    {['Basic', 'Featured', 'Nearby'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setAmenityTab(tab)}
                            style={{
                                padding: '8px 20px', borderRadius: '20px', border: '1px solid #e2e8f0',
                                background: amenityTab === tab ? '#334155' : '#fff', color: amenityTab === tab ? '#fff' : '#64748b',
                                fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s'
                            }}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '8px 16px', background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '6px', marginBottom: '20px' }}>
                    <input type="checkbox" checked={list.every(a => formData.amenities[a])} onChange={() => toggleAllAmenities(list)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.75rem', fontWeight: 700, color: '#2563eb', lineHeight: 1.1 }}>
                        <span>Select All</span><span>{amenityTab}</span>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', maxHeight: '400px', overflowY: 'auto' }}>
                    {list.map(amenity => (
                        <div key={amenity} onClick={() => handleAmenityChange(amenity)} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', background: '#fff' }}>
                            <input type="checkbox" checked={!!formData.amenities[amenity]} onChange={() => handleAmenityChange(amenity)} onClick={e => e.stopPropagation()} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                            <span style={{ fontSize: '0.85rem', color: '#334155' }}>{amenity}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)' }}>
            <div style={{ background: '#fff', width: '95%', maxWidth: '1200px', height: '90vh', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #e2e8f0' }} ref={modalRef} className="animate-slideIn">

                {/* Header aligned with AddCompanyModal */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to right, #ffffff, #f8fafc)' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '32px', height: '32px', background: '#eff6ff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-building" style={{ color: '#2563eb' }}></i>
                        </div>
                        Add New Project
                    </h2>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', background: '#fff', padding: '6px 12px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        {new Date().toDateString()}
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ padding: '0 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '30px', background: '#fff' }}>
                    {['Basic', 'Location', 'Block', 'Amenities', 'Price'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                padding: '16px 0', fontSize: '0.9rem', fontWeight: 600, color: activeTab === tab ? '#2563eb' : '#64748b',
                                border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: `2px solid ${activeTab === tab ? '#2563eb' : 'transparent'}`, transition: 'all 0.2s'
                            }}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', background: '#F8F9FB', padding: '24px' }}>
                    {isLoading ? (
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ height: '120px', background: '#e2e8f0', borderRadius: '12px', animation: 'pulse 1.5s infinite' }}></div>
                        </div>
                    ) : (
                        // MAX WIDTH REMOVED TO ALLOW SECTIONS TO EXPAND
                        <div style={{ width: '100%', margin: '0 auto' }}>
                            {activeTab === 'Basic' && renderBasicTab()}
                            {activeTab === 'Location' && renderLocationTab()}
                            {activeTab === 'Amenities' && renderAmenitiesTab()}
                            {!['Basic', 'Location', 'Amenities'].includes(activeTab) && (
                                <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
                                    <i className="fas fa-tools" style={{ fontSize: '3rem', marginBottom: '16px', color: '#cbd5e1' }}></i>
                                    <p>Section <b>{activeTab}</b> is under development.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#fff', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button onClick={onClose} style={{ padding: '10px 24px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} disabled={isLoading || !hasPermission} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.2)' }}>Save Project</button>
                </div>
            </div>

            <style>{`
                .grid-2-col { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
                .grid-3-col { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
                .grid-4-col { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
                .mt-24 { margin-top: 24px; }
                .mb-24 { margin-bottom: 24px; }
                 @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
                 @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                 .animate-slideIn { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
                 .fade-in { animation: fadeIn 0.3s ease-out; }
                 @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            `}</style>
        </div>
    );
}

export default AddProjectModal;
