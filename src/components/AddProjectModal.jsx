import React, { useState, useEffect, useRef } from 'react';
import { companyData } from '../data/companyData';
import { INDIAN_ADDRESS_DATA } from '../data/locationData';
import { usePropertyConfig } from '../context/PropertyConfigContext';
import AddressDetailsForm from './common/AddressDetailsForm';

// Mock Permission Hook
const usePermission = (permission) => {
    return true;
};

// Helper: Get YouTube Thumbnail
const getYouTubeThumbnail = (url) => {
    if (!url) return null;
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) {
        return `https://img.youtube.com/vi/${match[2]}/mqdefault.jpg`;
    }
    return null;
};

// --- Helper: Reusable MultiSelect Dropdown ---
const MultiSelect = ({ options, selected, onChange, placeholder = "Select..." }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (option) => {
        const newSelected = selected.includes(option)
            ? selected.filter(item => item !== option)
            : [...selected, option];
        onChange(newSelected);
    };

    return (
        <div ref={containerRef} style={{ position: 'relative' }}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    width: '100%', minHeight: '42px', padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0',
                    fontSize: '0.9rem', color: '#1e293b', backgroundColor: '#fff', boxSizing: 'border-box',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px',
                    backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23475569%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
                    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '12px', paddingRight: '32px'
                }}
            >
                {selected.length === 0 ? (
                    <span style={{ color: '#94a3b8' }}>{placeholder}</span>
                ) : (
                    selected.map(item => (
                        <span key={item} style={{ background: '#e0f2fe', color: '#0284c7', fontSize: '0.8rem', padding: '2px 8px', borderRadius: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {item}
                            <i
                                className="fas fa-times"
                                style={{ cursor: 'pointer', fontSize: '0.75rem' }}
                                onClick={(e) => { e.stopPropagation(); toggleOption(item); }}
                            ></i>
                        </span>
                    ))
                )}
            </div>

            {isOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', zIndex: 50, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    {options.map(option => (
                        <div
                            key={option}
                            onClick={() => toggleOption(option)}
                            style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                            onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
                            onMouseOut={(e) => e.currentTarget.style.background = '#fff'}
                        >
                            <input
                                type="checkbox"
                                checked={selected.includes(option)}
                                readOnly
                                style={{ width: '16px', height: '16px', accentColor: '#3b82f6', cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: '0.9rem', color: '#334155' }}>{option}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};



const DEFAULT_FORM_DATA = {
    // Basic Info
    name: '',
    developerName: '',
    isJointVenture: false,
    secondaryDeveloper: '',
    reraNumber: '',
    description: '',

    // Multi-select Fields
    category: ['Residential'],
    subCategory: ['Flat/Apartment'],

    // System Details (Multi-select)
    assign: ['Suraj Keshwar'],
    team: ['Sales'],

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

    // System Details
    visibleTo: 'All Users',

    // Location
    locationSearch: '',
    latitude: '',
    longitude: '',
    // Updated Address Schema
    address: {
        hNo: '',
        street: '',
        locality: '',
        location: '',
        area: '',
        country: 'India',
        state: '',
        city: '',
        tehsil: '',
        postOffice: '',
        pincode: ''
    },

    // Documents & Approvals (Dynamic)
    projectDocuments: [{ documentName: '', approvalAuthority: '', registrationNo: '', date: '', file: null }],

    // Media Management (Structured)
    projectImages: [{ title: '', category: 'Main', file: null }],
    projectVideos: [{ title: '', type: 'YouTube', url: '', file: null }],

    // Amenities (Booleans)
    amenities: {},

    // Project Blocks
    blocks: [],

    // Pricing & Master Charges
    pricing: {
        pricingType: 'Standard',
        unitPrices: [],
        basePrice: { amount: '', unit: 'sqft' },
        masterCharges: [
            { id: 'edc', name: 'EDC (External Development Charges)', category: 'Development', basis: 'Per SqFt', amount: '', gstEnabled: true },
            { id: 'idc', name: 'IDC (Infrastructure Development Charges)', category: 'Development', basis: 'Per SqFt', amount: '', gstEnabled: true },
            { id: 'stamp', name: 'Stamp Duty', category: 'Statutory', basis: '% of Total', amount: '5', gstEnabled: false },
            { id: 'reg', name: 'Registration Charges', category: 'Statutory', basis: '% of Total', amount: '1', gstEnabled: false },
            { id: 'ifms', name: 'IFMS (Maintenance Security)', category: 'Maintenance', basis: 'Per SqFt', amount: '', gstEnabled: false }
        ],
        paymentPlans: [
            {
                name: 'Construction Linked Plan (CLP)',
                type: 'CLP',
                milestones: [
                    { name: 'At the time of Booking', percentage: '10', stage: 'Booking' },
                    { name: 'Within 30 days of booking', percentage: '10', stage: 'Allotment' }
                ]
            }
        ]
    }
};

function AddProjectModal({ isOpen, onClose, onSave, initialTab = 'Basic', projectToEdit = null }) {
    const { projectMasterFields: masterFieldsFromContext, projectAmenities, sizes } = usePropertyConfig();

    if (!companyData) {
        console.error('companyData is undefined!');
    }

    const projectMasterFieldsSafe = masterFieldsFromContext || {};
    const [isLoading, setIsLoading] = useState(true);
    const [hasPermission, setHasPermission] = useState(false);
    const [activeTab, setActiveTab] = useState(initialTab || 'Basic');
    const [currentTime, setCurrentTime] = useState(new Date());

    // Helper: Fetch Address from Lat/Lng
    const fetchAddressFromCoordinates = (lat, lng) => {
        if (!window.google || !window.google.maps) return;
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
            if (status === "OK" && results[0]) {
                const place = results[0];
                let newState = '';
                let newCity = '';
                let newZip = '';
                let newStreet = '';
                let newLocation = '';

                place.address_components.forEach(component => {
                    const types = component.types;
                    if (types.includes('administrative_area_level_1')) newState = component.long_name;
                    if (types.includes('administrative_area_level_2') || types.includes('locality')) newCity = component.long_name;
                    if (types.includes('postal_code')) newZip = component.long_name;
                    if (types.includes('sublocality') || types.includes('neighborhood')) newLocation = component.long_name;
                    if (types.includes('route') || types.includes('street_number')) newStreet += component.long_name + ' ';
                });

                setFormData(prev => ({
                    ...prev,
                    locationSearch: place.formatted_address,
                    address: {
                        ...prev.address,
                        state: newState || prev.address.state,
                        city: newCity || prev.address.city,
                        country: 'India',
                        pincode: newZip || prev.address.pincode,
                        street: newStreet.trim() || prev.address.street,
                        location: newLocation || prev.address.location
                    }
                }));
            }
        });
    };
    const [amenityTab, setAmenityTab] = useState('Basic');
    const [amenitySearch, setAmenitySearch] = useState('');

    // Current Time for Header


    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Safe access to projectAmenities
    const amenitiesSafe = projectAmenities || {};

    // Derived Amenity Lists from Context
    const basicAmenities = (amenitiesSafe['Basic'] || []).map(a => a.name);
    const featuredAmenities = (amenitiesSafe['Featured'] || []).map(a => a.name);
    const nearbyAmenities = (amenitiesSafe['Nearby'] || []).map(a => a.name);

    // Create a lookup for icons for rendering
    const AMENITY_ICON_LOOKUP = {};
    if (projectAmenities) {
        Object.values(projectAmenities).flat().forEach(a => {
            if (a && a.name) {
                AMENITY_ICON_LOOKUP[a.name] = a.icon;
            }
        });
    }

    // Comprehensive State
    const [formData, setFormData] = useState(DEFAULT_FORM_DATA);

    const [showBlockForm, setShowBlockForm] = useState(false);
    const [editingBlockIndex, setEditingBlockIndex] = useState(null);
    const [blockFormData, setBlockFormData] = useState({
        name: '',
        floors: '',
        units: '',
        status: 'Upcoming',
        landArea: '',
        landAreaUnit: 'Acres',
        parkingType: 'Open Parking',
        launchDate: '',
        expectedCompletionDate: '',
        possessionDate: ''
    });

    // --- Price Tab State & Handlers (Moved to Top Level) ---
    const [newPriceRow, setNewPriceRow] = useState({
        block: '',
        subCategory: '',
        areaType: '',
        size: '',
        price: ''
    });

    // Helper to get Area Types (Moved to Top Level)
    const getAreaTypes = (subCat) => {
        if (!subCat) return [];
        const lower = subCat.toLowerCase();
        if (lower.includes('plot') || lower.includes('land') || lower.includes('sco') || lower.includes('agricultural')) {
            return ['Total Area', 'Plot Area', 'Gaj'];
        }
        if (lower.includes('flat') || lower.includes('apartment') || lower.includes('floor') || lower.includes('penthouse')) {
            return ['Super Area', 'Carpet Area', 'Built-up Area'];
        }
        if (lower.includes('villa') || lower.includes('house')) {
            return ['Plot Area', 'Built-up Area', 'Carpet Area'];
        }
        if (lower.includes('shop') || lower.includes('office')) {
            return ['Super Area', 'Carpet Area'];
        }
        return ['Area', 'Super Area', 'Carpet Area'];
    };

    const handleAddPriceRow = () => {
        if (newPriceRow.subCategory && newPriceRow.size && newPriceRow.price) {
            const newRow = { ...newPriceRow, id: Date.now() };
            const currentUnitPrices = formData.pricing?.unitPrices || [];

            setFormData(prev => ({
                ...prev,
                pricing: { ...prev.pricing, unitPrices: [...currentUnitPrices, newRow] }
            }));

            setNewPriceRow({ block: '', subCategory: '', areaType: '', size: '', price: '' });
        }
    };

    const removePriceRow = (id) => {
        const currentUnitPrices = formData.pricing?.unitPrices || [];
        const newRows = currentUnitPrices.filter(r => r.id !== id);
        setFormData(prev => ({
            ...prev,
            pricing: { ...prev.pricing, unitPrices: newRows }
        }));
    };



    const modalRef = useRef(null);
    const searchInputRef = useRef(null);
    const mapRef = useRef(null);
    const googleMapRef = useRef(null);
    const markerRef = useRef(null);
    const canCreateProject = usePermission('create_project');


    const categories = ['Residential', 'Commercial', 'Agricultural', 'Industrial', 'Institutional'];
    const subCategories = ['Plot', 'House', 'Flat/Apartment', 'Builder Floor', 'Villa', 'Penthouse', 'SCO', 'Office Space', 'Shop'];
    const teams = ['Sales', 'Marketing', 'Post Sales', 'Pre Sales', 'Finance', 'HR'];
    const users = ['Suraj Keshwar', 'Demo User', 'Admin', 'Manager'];
    const developers = companyData.map(c => c.name).sort();

    // Cascading Address Logic handled by AddressDetailsForm

    useEffect(() => {
        if (isOpen) {
            setIsLoading(true);
            setTimeout(() => {
                setHasPermission(canCreateProject);
                setIsLoading(false);
            }, 10);
            document.body.style.overflow = 'hidden';

            if (projectToEdit) {
                // Normalize Blocks: Ensure they are objects { name: '...' }
                let normalizedBlocks = projectToEdit.blocks || [];
                if (normalizedBlocks.length > 0 && typeof normalizedBlocks[0] === 'string') {
                    normalizedBlocks = normalizedBlocks.map(b => ({ name: b }));
                }

                // Normalize Categories: Split legacy 'category' into 'category' and 'subCategory'
                let normalizedCategory = projectToEdit.category || [];
                let normalizedSubCategory = projectToEdit.subCategory || [];

                if ((!projectToEdit.subCategory || projectToEdit.subCategory.length === 0) && normalizedCategory.length > 0) {
                    const mainCategories = ['Residential', 'Commercial', 'Agricultural', 'Industrial', 'Institutional'];
                    const actualCategories = normalizedCategory.filter(c => mainCategories.includes(c));
                    const actualSubCategories = normalizedCategory.filter(c => !mainCategories.includes(c));

                    // If we found split, use it. Otherwise keep as is (safer).
                    if (actualCategories.length > 0 || actualSubCategories.length > 0) {
                        normalizedCategory = actualCategories;
                        normalizedSubCategory = actualSubCategories;
                    }
                }

                setFormData(prev => ({
                    ...prev,
                    ...projectToEdit,
                    blocks: normalizedBlocks,
                    category: normalizedCategory,
                    subCategory: normalizedSubCategory
                }));
            } else {
                setFormData(DEFAULT_FORM_DATA);
            }
            setActiveTab(initialTab || 'Basic');
        } else {
            document.body.style.overflow = 'unset';
            setIsLoading(true);
            setActiveTab('Basic');
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [isOpen, canCreateProject, projectToEdit, initialTab]);

    // Google Maps Integration (Interactive)
    useEffect(() => {
        if (!isOpen || activeTab !== 'Location') return;

        const timer = setTimeout(() => {
            if (window.google && mapRef.current) {
                const defaultCenter = {
                    lat: formData.latitude ? parseFloat(formData.latitude) : 28.6139,
                    lng: formData.longitude ? parseFloat(formData.longitude) : 77.2090
                };

                if (!googleMapRef.current) {
                    googleMapRef.current = new window.google.maps.Map(mapRef.current, {
                        center: defaultCenter,
                        zoom: 13,
                        mapTypeControl: false,
                        fullscreenControl: false,
                        streetViewControl: false
                    });
                } else {
                    googleMapRef.current.setCenter(defaultCenter);
                }

                if (!markerRef.current) {
                    markerRef.current = new window.google.maps.Marker({
                        position: defaultCenter,
                        map: googleMapRef.current,
                        draggable: true,
                        animation: window.google.maps.Animation.DROP,
                        title: "Project Location"
                    });

                    markerRef.current.addListener('dragend', (event) => {
                        const newLat = event.latLng.lat();
                        const newLng = event.latLng.lng();
                        setFormData(prev => ({
                            ...prev,
                            latitude: newLat.toFixed(6),
                            longitude: newLng.toFixed(6)
                        }));
                        fetchAddressFromCoordinates(newLat, newLng);
                    });
                } else {
                    markerRef.current.setPosition(defaultCenter);
                }

                if (searchInputRef.current) {
                    const autocomplete = new window.google.maps.places.Autocomplete(searchInputRef.current, {
                        types: ['geocode'],
                        componentRestrictions: { country: 'in' },
                        fields: ['address_components', 'geometry', 'formatted_address']
                    });

                    autocomplete.bindTo("bounds", googleMapRef.current);

                    autocomplete.addListener('place_changed', () => {
                        const place = autocomplete.getPlace();
                        if (!place.geometry || !place.geometry.location) return;

                        if (place.geometry.viewport) {
                            googleMapRef.current.fitBounds(place.geometry.viewport);
                        } else {
                            googleMapRef.current.setCenter(place.geometry.location);
                            googleMapRef.current.setZoom(17);
                        }

                        markerRef.current.setPosition(place.geometry.location);

                        setFormData(prev => ({
                            ...prev,
                            locationSearch: place.formatted_address,
                            latitude: place.geometry.location.lat().toFixed(6),
                            longitude: place.geometry.location.lng().toFixed(6)
                        }));
                        fetchAddressFromCoordinates(place.geometry.location.lat(), place.geometry.location.lng());
                    });
                }
            }
        }, 100);

        return () => clearTimeout(timer);
    }, [isOpen, activeTab]);

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

    const TABS = ['Basic', 'Location', 'Block', 'Amenities', 'Price', 'Upload'];

    const handleNext = () => {
        const currentIndex = TABS.indexOf(activeTab);
        if (currentIndex < TABS.length - 1) {
            setActiveTab(TABS[currentIndex + 1]);
        }
    };

    const handlePrev = () => {
        const currentIndex = TABS.indexOf(activeTab);
        if (currentIndex > 0) {
            setActiveTab(TABS[currentIndex - 1]);
        }
    };

    const handleSave = () => {
        console.log("Saving Consolidated Project Data:", formData);
        onSave(formData);
    };

    if (!isOpen) return null;

    const buttonStyle = {
        cancel: { padding: '10px 24px', borderRadius: '8px', border: '1px solid #fecaca', background: '#fff', color: '#ef4444', fontWeight: 600, cursor: 'pointer' },
        secondary: { padding: '10px 24px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, cursor: 'pointer' },
        primary: { padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer' },
        success: { padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#22c55e', color: '#fff', fontWeight: 600, cursor: 'pointer' }
    };

    // --- Design System Constants ---
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
    const customSelectStyleDisabled = { ...customSelectStyle, background: '#f1f5f9', cursor: 'not-allowed', color: '#94a3b8' };

    const sectionStyle = {
        background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)', marginBottom: '24px'
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

                <div style={{ marginTop: '20px' }} className="grid-2-col gap-24">
                    <div>
                        <label style={labelStyle}>Category (Multi-Select)</label>
                        <MultiSelect
                            options={categories}
                            selected={formData.category}
                            onChange={(val) => setFormData({ ...formData, category: val })}
                            placeholder="Select Categories"
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>Sub Category (Multi-Select)</label>
                        <MultiSelect
                            options={subCategories}
                            selected={formData.subCategory}
                            onChange={(val) => setFormData({ ...formData, subCategory: val })}
                            placeholder="Select Sub Categories"
                        />
                    </div>
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
                            {(projectMasterFieldsSafe.projectStatuses || []).map(status => (
                                <option key={status} value={status}>{status}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Parking Type</label>
                        <select style={customSelectStyle} value={formData.parkingType} onChange={e => setFormData({ ...formData, parkingType: e.target.value })}>
                            <option value="">---Select Parking---</option>
                            {(projectMasterFieldsSafe.parkingTypes || []).map(type => (
                                <option key={type} value={type}>{type}</option>
                            ))}
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

            {/* System Details (Updated with MultiSelect & Assign) */}
            <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fas fa-cogs" style={{ color: '#10b981' }}></i> System Details
                </h4>
                <div className="grid-3-col gap-24">
                    <div>
                        <label style={labelStyle}>Assign</label>
                        <MultiSelect
                            options={users}
                            selected={formData.assign}
                            onChange={(val) => setFormData({ ...formData, assign: val })}
                            placeholder="Assign User(s)"
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>Team</label>
                        <MultiSelect
                            options={teams}
                            selected={formData.team}
                            onChange={(val) => setFormData({ ...formData, team: val })}
                            placeholder="Select Team(s)"
                        />
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
            <div style={{ flex: 1, marginBottom: '16px' }}>
                <label style={labelStyle}>Search Location</label>
                <div style={{ position: 'relative' }}>
                    <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}></i>
                    <input
                        ref={searchInputRef}
                        style={{ ...inputStyle, paddingLeft: '36px' }}
                        placeholder="Type to search google maps..."
                        value={formData.locationSearch}
                        onChange={e => setFormData({ ...formData, locationSearch: e.target.value })}
                    />
                </div>
            </div>

            {/* Google Map Container */}
            <div style={{
                height: '350px',
                width: '100%',
                borderRadius: '12px',
                overflow: 'hidden',
                border: '1px solid #e2e8f0',
                marginBottom: '24px',
                position: 'relative'
            }}>
                <div ref={mapRef} style={{ width: '100%', height: '100%' }}></div>
                <div style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    background: 'rgba(255, 255, 255, 0.9)',
                    backdropFilter: 'blur(4px)',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: '#334155',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    border: '1px solid #fff'
                }}>
                    <i className="fas fa-map-marker-alt" style={{ color: '#ef4444' }}></i>
                    Drag Pin to Auto-Fill Address
                </div>
            </div>

            {/* Coordinates (Read Only) */}
            <div className="grid-2-col gap-24" style={{ marginBottom: '24px' }}>
                <div>
                    <label style={labelStyle}>Latitude</label>
                    <input style={{ ...inputStyle, background: '#f8fafc', color: '#64748b' }} readOnly value={formData.latitude} placeholder="Latitude" />
                </div>
                <div>
                    <label style={labelStyle}>Longitude</label>
                    <input style={{ ...inputStyle, background: '#f8fafc', color: '#64748b' }} readOnly value={formData.longitude} placeholder="Longitude" />
                </div>
            </div>

            {/* Cascading Address Details Section */}
            <div style={{ marginBottom: '24px' }}>
                <AddressDetailsForm
                    title="Address Details"
                    address={formData.address}
                    onChange={(newAddress) => setFormData(prev => ({ ...prev, address: newAddress }))}
                />
            </div>
        </div >
    );

    const renderAmenitiesTab = () => {
        const rawList = amenityTab === 'Basic' ? basicAmenities : amenityTab === 'Featured' ? featuredAmenities : nearbyAmenities;
        const list = rawList.filter(a => a.toLowerCase().includes(amenitySearch.toLowerCase()));
        const selectedCount = Object.values(formData.amenities).filter(Boolean).length;

        return (
            <div className="tab-content fade-in">
                {/* Search and Summary Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '20px' }}>
                    <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                        <i className="fas fa-search" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}></i>
                        <input
                            style={{ ...inputStyle, paddingLeft: '40px' }}
                            placeholder="Search amenities (e.g. Gym, Power...)"
                            value={amenitySearch}
                            onChange={e => setAmenitySearch(e.target.value)}
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>TOTAL SELECTED</span>
                            <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#3b82f6' }}>{selectedCount}</span>
                        </div>
                        <div style={{ width: '40px', height: '40px', background: '#eff6ff', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
                            <i className="fas fa-check-double"></i>
                        </div>
                    </div>
                </div>

                {/* Sub Tabs */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', gap: '8px', background: '#f1f5f9', padding: '4px', borderRadius: '12px' }}>
                        {['Basic', 'Featured', 'Nearby'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setAmenityTab(tab)}
                                style={{
                                    padding: '8px 24px', borderRadius: '10px', border: 'none',
                                    background: amenityTab === tab ? '#fff' : 'transparent',
                                    color: amenityTab === tab ? '#1e293b' : '#64748b',
                                    fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s',
                                    boxShadow: amenityTab === tab ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                }}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => toggleAllAmenities(rawList)}
                        style={{
                            padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0',
                            background: '#fff', color: '#3b82f6', fontSize: '0.8rem', fontWeight: 600,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
                        }}
                    >
                        <i className={`fas ${rawList.every(a => formData.amenities[a]) ? 'fa-minus-square' : 'fa-plus-square'}`}></i>
                        {rawList.every(a => formData.amenities[a]) ? 'Deselect All' : 'Select All'}
                    </button>
                </div>

                {/* Grid of Cards */}
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                    gap: '16px', maxHeight: '500px', overflowY: 'auto', padding: '4px'
                }}>
                    {list.map(amenity => {
                        const isSelected = !!formData.amenities[amenity];
                        return (
                            <div
                                key={amenity}
                                onClick={() => handleAmenityChange(amenity)}
                                style={{
                                    padding: '16px',
                                    border: `2px solid ${isSelected ? '#3b82f6' : '#e2e8f0'}`,
                                    borderRadius: '12px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '12px',
                                    cursor: 'pointer',
                                    background: isSelected ? '#eff6ff' : '#fff',
                                    transition: 'all 0.2s ease',
                                    textAlign: 'center',
                                    position: 'relative'
                                }}
                                onMouseOver={e => !isSelected && (e.currentTarget.style.borderColor = '#cbd5e1')}
                                onMouseOut={e => !isSelected && (e.currentTarget.style.borderColor = '#e2e8f0')}
                            >
                                {isSelected && (
                                    <div style={{ position: 'absolute', top: '8px', right: '8px', color: '#3b82f6', fontSize: '0.8rem' }}>
                                        <i className="fas fa-check-circle"></i>
                                    </div>
                                )}
                                <div style={{
                                    width: '44px', height: '44px', borderRadius: '10px',
                                    background: isSelected ? '#3b82f6' : '#f8fafc',
                                    color: isSelected ? '#fff' : '#64748b',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '1.2rem', transition: 'all 0.2s'
                                }}>
                                    <i className={`fas ${AMENITY_ICON_LOOKUP[amenity] || 'fa-star'}`}></i>
                                </div>
                                <span style={{
                                    fontSize: '0.85rem', fontWeight: 600,
                                    color: isSelected ? '#1e40af' : '#475569',
                                    lineHeight: 1.2
                                }}>
                                    {amenity}
                                </span>
                            </div>
                        );
                    })}
                    {list.length === 0 && (
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
                            <i className="fas fa-search-minus" style={{ fontSize: '2.5rem', marginBottom: '16px' }}></i>
                            <p>No amenities match your search "<b>{amenitySearch}</b>"</p>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderBlockTab = () => {
        const handleAddBlock = () => {
            if (!blockFormData.name) return;
            if (editingBlockIndex !== null) {
                const updatedBlocks = [...formData.blocks];
                updatedBlocks[editingBlockIndex] = blockFormData;
                setFormData({ ...formData, blocks: updatedBlocks });
                setEditingBlockIndex(null);
            } else {
                setFormData({ ...formData, blocks: [...formData.blocks, blockFormData] });
            }
            setBlockFormData({
                name: '',
                floors: '',
                units: '',
                status: 'Upcoming',
                landArea: '',
                landAreaUnit: 'Acres',
                parkingType: 'Open Parking',
                launchDate: '',
                expectedCompletionDate: '',
                possessionDate: ''
            });
            setShowBlockForm(false);
        };

        const handleEditBlock = (index) => {
            setBlockFormData(formData.blocks[index]);
            setEditingBlockIndex(index);
            setShowBlockForm(true);
        };

        const handleDeleteBlock = (index) => {
            const updatedBlocks = formData.blocks.filter((_, i) => i !== index);
            setFormData({ ...formData, blocks: updatedBlocks });
        };

        return (
            <div className="tab-content fade-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                        <i className="fas fa-th-large" style={{ color: '#3b82f6', marginRight: '10px' }}></i>
                        Project Blocks ({formData.blocks.length})
                    </h4>
                    {!showBlockForm && (
                        <button
                            onClick={() => setShowBlockForm(true)}
                            style={{
                                padding: '10px 20px', borderRadius: '8px', background: '#3b82f6', color: '#fff',
                                border: 'none', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                                boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.2)'
                            }}
                        >
                            <i className="fas fa-plus"></i> Add New Block
                        </button>
                    )}
                </div>

                {showBlockForm && (
                    <div style={{ ...sectionStyle, border: '2px solid #3b82f6', background: '#f8fafc' }} className="animate-slideIn">
                        <h5 style={{ margin: '0 0 20px 0', fontSize: '0.95rem', fontWeight: 700, color: '#334155' }}>
                            {editingBlockIndex !== null ? 'Edit Block' : 'Add New Block Configuration'}
                        </h5>
                        <div style={{ display: 'grid', gap: '20px' }}>
                            {/* Basic Config */}
                            <div className="grid-4-col gap-16">
                                <div>
                                    <label style={labelStyle}>Block Name</label>
                                    <input
                                        style={inputStyle}
                                        placeholder="e.g. Block A"
                                        value={blockFormData.name}
                                        onChange={e => setBlockFormData({ ...blockFormData, name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Total Floors</label>
                                    <input
                                        type="number"
                                        style={inputStyle}
                                        placeholder="0"
                                        value={blockFormData.floors}
                                        onChange={e => setBlockFormData({ ...blockFormData, floors: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Total Units</label>
                                    <input
                                        type="number"
                                        style={inputStyle}
                                        placeholder="0"
                                        value={blockFormData.units}
                                        onChange={e => setBlockFormData({ ...blockFormData, units: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Status</label>
                                    <select
                                        style={customSelectStyle}
                                        value={blockFormData.status}
                                        onChange={e => setBlockFormData({ ...blockFormData, status: e.target.value })}
                                    >
                                        <option value="">Status</option>
                                        {(projectMasterFieldsSafe.projectStatuses || []).map(status => (
                                            <option key={status} value={status}>{status}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Land & Parking */}
                            <div className="grid-2-col gap-24">
                                <div>
                                    <label style={labelStyle}>Land Area (Allocated)</label>
                                    <div style={{ display: 'flex' }}>
                                        <input
                                            style={{ ...inputStyle, borderRight: 'none', borderRadius: '8px 0 0 8px' }}
                                            placeholder="0"
                                            value={blockFormData.landArea}
                                            onChange={e => setBlockFormData({ ...blockFormData, landArea: e.target.value })}
                                        />
                                        <select
                                            style={{ ...customSelectStyle, width: '100px', borderRadius: '0 8px 8px 0', borderLeft: '1px solid #e2e8f0', background: '#f8fafc' }}
                                            value={blockFormData.landAreaUnit}
                                            onChange={e => setBlockFormData({ ...blockFormData, landAreaUnit: e.target.value })}
                                        >
                                            <option>Acres</option>
                                            <option>Hectares</option>
                                            <option>Sq Yards</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label style={labelStyle}>Parking Type</label>
                                    <select
                                        style={customSelectStyle}
                                        value={blockFormData.parkingType}
                                        onChange={e => setBlockFormData({ ...blockFormData, parkingType: e.target.value })}
                                    >
                                        <option value="">Parking</option>
                                        {(projectMasterFieldsSafe.parkingTypes || []).map(type => (
                                            <option key={type} value={type}>{type}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Timeline Details */}
                            <div className="grid-3-col gap-24">
                                <div>
                                    <label style={labelStyle}>Block Launch Date</label>
                                    <input
                                        type="date"
                                        style={inputStyle}
                                        value={blockFormData.launchDate}
                                        onChange={e => setBlockFormData({ ...blockFormData, launchDate: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Expected Completion</label>
                                    <input
                                        type="date"
                                        style={inputStyle}
                                        value={blockFormData.expectedCompletionDate}
                                        onChange={e => setBlockFormData({ ...blockFormData, expectedCompletionDate: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Possession Date</label>
                                    <input
                                        type="date"
                                        style={inputStyle}
                                        value={blockFormData.possessionDate}
                                        onChange={e => setBlockFormData({ ...blockFormData, possessionDate: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>
                        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button
                                onClick={() => { setShowBlockForm(false); setEditingBlockIndex(null); }}
                                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddBlock}
                                style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#3b82f6', color: '#fff', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                            >
                                {editingBlockIndex !== null ? 'Update Block' : 'Add Block'}
                            </button>
                        </div>
                    </div>
                )}

                {formData.blocks.length === 0 ? (
                    <div style={{ ...sectionStyle, textAlign: 'center', padding: '60px 0', border: '2px dashed #e2e8f0', background: 'transparent' }}>
                        <div style={{ width: '64px', height: '64px', background: '#f1f5f9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                            <i className="fas fa-cubes" style={{ fontSize: '1.5rem', color: '#94a3b8' }}></i>
                        </div>
                        <h5 style={{ margin: '0 0 8px 0', color: '#475569', fontWeight: 600 }}>No Blocks Added Yet</h5>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>Click the button above to start adding blocks to this project.</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '12px' }}>
                        {formData.blocks.map((block, index) => (
                            <div
                                key={index}
                                style={{
                                    ...sectionStyle, margin: 0, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    transition: 'all 0.2s', borderLeft: '4px solid #3b82f6'
                                }}
                                onMouseOver={e => e.currentTarget.style.borderColor = '#2563eb'}
                                onMouseOut={e => e.currentTarget.style.borderColor = '#3b82f6'}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flex: 1 }}>
                                    <div style={{ width: '40px', height: '40px', background: '#eff6ff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
                                        <b style={{ fontSize: '0.9rem' }}>{block.name.charAt(0)}</b>
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>{block.name}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                                            <span style={{ marginRight: '12px' }}><i className="fas fa-layer-group" style={{ marginRight: '4px' }}></i> {block.floors} Floors</span>
                                            <span><i className="fas fa-home" style={{ marginRight: '4px' }}></i> {block.units} Units</span>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <span style={{
                                        padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
                                        background: '#f1f5f9', color: '#475569'
                                    }}>
                                        <i className="fas fa-parking" style={{ marginRight: '6px' }}></i> {block.parkingType}
                                    </span>
                                    {block.expectedCompletionDate && (
                                        <span style={{
                                            padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
                                            background: '#eff6ff', color: '#1e40af'
                                        }}>
                                            <i className="fas fa-calendar-check" style={{ marginRight: '6px' }}></i> {block.expectedCompletionDate}
                                        </span>
                                    )}
                                    <span style={{
                                        padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
                                        background: block.status === 'Completed' ? '#dcfce7' : block.status === 'In Progress' ? '#fef9c3' : '#f1f5f9',
                                        color: block.status === 'Completed' ? '#166534' : block.status === 'In Progress' ? '#854d0e' : '#475569'
                                    }}>
                                        {block.status}
                                    </span>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            onClick={() => handleEditBlock(index)}
                                            style={{ width: '32px', height: '32px', borderRadius: '6px', border: 'none', background: '#f8fafc', color: '#64748b', cursor: 'pointer', transition: 'all 0.2s' }}
                                            onMouseOver={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.color = '#3b82f6'; }}
                                            onMouseOut={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#64748b'; }}
                                        >
                                            <i className="fas fa-edit"></i>
                                        </button>
                                        <button
                                            onClick={() => handleDeleteBlock(index)}
                                            style={{ width: '32px', height: '32px', borderRadius: '6px', border: 'none', background: '#f8fafc', color: '#64748b', cursor: 'pointer', transition: 'all 0.2s' }}
                                            onMouseOver={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#ef4444'; }}
                                            onMouseOut={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#64748b'; }}
                                        >
                                            <i className="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const renderPriceTab = () => {
        const updatePricing = (key, value) => {
            setFormData(prev => ({
                ...prev,
                pricing: { ...prev.pricing, [key]: value }
            }));
        };

        const addMasterCharge = (preset = null) => {
            const defaults = {
                'EDC': { name: 'EDC (External Development Charges)', category: 'Development', basis: 'Per SqFt', amount: '', gstEnabled: true },
                'IDC': { name: 'IDC (Infrastructure Development Charges)', category: 'Development', basis: 'Per SqFt', amount: '', gstEnabled: true },
                'PLC': { name: 'Corner/Park Facing PLC', category: 'PLC', basis: 'Per SqFt', amount: '', gstEnabled: true },
                'STAMP': { name: 'Stamp Duty', category: 'Statutory', basis: '% of Total', amount: '5', gstEnabled: false },
                'REG': { name: 'Registration Charges', category: 'Statutory', basis: '% of Total', amount: '1', gstEnabled: false },
                'IFMS': { name: 'IFMS (Maintenance Security)', category: 'Per SqFt', amount: '', gstEnabled: false }
            };

            const currentCharges = formData.pricing?.masterCharges || [];
            const newCharge = preset ? { ...defaults[preset], id: Date.now() } : { id: Date.now(), name: '', category: 'Other', basis: 'Fixed', amount: '', gstEnabled: true };
            updatePricing('masterCharges', [...currentCharges, newCharge]);
        };

        const removeMasterCharge = (id) => {
            const currentCharges = formData.pricing?.masterCharges || [];
            const newCharges = currentCharges.filter(c => c.id !== id);
            updatePricing('masterCharges', newCharges);
        };

        const updateMasterCharge = (id, field, value) => {
            const currentCharges = formData.pricing?.masterCharges || [];
            const newCharges = currentCharges.map(c => c.id === id ? { ...c, [field]: value } : c);
            updatePricing('masterCharges', newCharges);
        };

        const applyPlanPreset = (type) => {
            let milestones = [];
            if (type === 'CLP') {
                milestones = [
                    { name: 'At the time of Booking', percentage: '10', stage: 'Booking' },
                    { name: 'Within 30 days of Booking', percentage: '10', stage: 'Allotment' },
                    { name: 'On start of Foundation', percentage: '10', stage: 'Excavation' },
                    { name: 'On casting of Ground Floor Slab', percentage: '10', stage: 'Slab' },
                    { name: 'On casting of 2nd Floor Slab', percentage: '10', stage: 'Slab' },
                    { name: 'On casting of Top Floor Slab', percentage: '10', stage: 'Slab' },
                    { name: 'On completion of Internal Plaster', percentage: '10', stage: 'Finishing' },
                    { name: 'On completion of External Plaster', percentage: '10', stage: 'Finishing' },
                    { name: 'On offer of Possession', percentage: '20', stage: 'Possession' }
                ];
            } else if (type === 'DPP') {
                milestones = [
                    { name: 'At the time of Booking', percentage: '10', stage: 'Booking' },
                    { name: 'Within 45 days of Booking', percentage: '85', stage: 'Allotment' },
                    { name: 'On offer of Possession', percentage: '5', stage: 'Possession' }
                ];
            } else if (type === 'PLP') {
                milestones = [
                    { name: 'At the time of Booking', percentage: '10', stage: 'Booking' },
                    { name: 'Within 60 days of Booking', percentage: '20', stage: 'Allotment' },
                    { name: 'On completion of Super Structure', percentage: '30', stage: 'Slab' },
                    { name: 'On offer of Possession', percentage: '40', stage: 'Possession' }
                ];
            }

            const currentPlans = formData.pricing?.paymentPlans || [];
            const newPlans = [...currentPlans];
            if (newPlans.length > 0) {
                newPlans[0] = {
                    ...newPlans[0],
                    type,
                    milestones,
                    name: type === 'CLP' ? 'Construction Linked Plan' : type === 'DPP' ? 'Down Payment Plan' : 'Possession Linked Plan'
                };
                updatePricing('paymentPlans', newPlans);
            }
        };

        // Top-level guard to prevent white screen if pricing data is missing
        if (!formData.pricing) {
            return (
                <div className="tab-content fade-in">
                    <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                        <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', marginBottom: '16px' }}></i>
                        <p>Initializing Pricing Module...</p>
                    </div>
                </div>
            );
        }

        return (
            <div className="tab-content fade-in">

                {/* Section 1: Unit Base Price Configuration */}
                <div style={sectionStyle}>
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <i className="fas fa-tags" style={{ color: '#2563eb' }}></i> 1. Unit Base Price Configuration
                    </h4>
                    <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                        <div className="grid-3-col mb-24" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
                            <div>
                                <label style={labelStyle}>Block</label>
                                <select
                                    style={customSelectStyle}
                                    value={newPriceRow.block}
                                    onChange={e => setNewPriceRow({ ...newPriceRow, block: e.target.value })}
                                >
                                    <option value="">All Blocks</option>
                                    {(formData.blocks || []).map((b, i) => <option key={i} value={b.name}>{b.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Sub Category</label>
                                <select
                                    style={customSelectStyle}
                                    value={newPriceRow.subCategory}
                                    onChange={e => setNewPriceRow({ ...newPriceRow, subCategory: e.target.value, areaType: '' })}
                                >
                                    <option value="">Select</option>
                                    {(formData.subCategory || []).map(sc => <option key={sc} value={sc}>{sc}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Area Type</label>
                                <select
                                    style={!newPriceRow.subCategory ? customSelectStyleDisabled : customSelectStyle}
                                    value={newPriceRow.areaType}
                                    disabled={!newPriceRow.subCategory}
                                    onChange={e => setNewPriceRow({ ...newPriceRow, areaType: e.target.value })}
                                >
                                    <option value="">Select Type</option>
                                    {getAreaTypes(newPriceRow.subCategory).map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Size</label>
                                <select
                                    style={!newPriceRow.subCategory ? customSelectStyleDisabled : customSelectStyle}
                                    value={newPriceRow.size}
                                    disabled={!newPriceRow.subCategory}
                                    onChange={e => setNewPriceRow({ ...newPriceRow, size: e.target.value })}
                                >
                                    <option value="">Select Size</option>
                                    {sizes.filter(s =>
                                        (!s.project || s.project === formData.name) &&
                                        (!newPriceRow.block || s.block === newPriceRow.block) &&
                                        (!newPriceRow.subCategory || s.subCategory === newPriceRow.subCategory)
                                    ).map(s => (
                                        <option key={s.id} value={s.saleableArea || s.totalArea}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Base Price</label>
                                <input
                                    type="number"
                                    style={inputStyle}
                                    placeholder="₹ Price"
                                    value={newPriceRow.price}
                                    onChange={e => setNewPriceRow({ ...newPriceRow, price: e.target.value })}
                                />
                            </div>
                            <button
                                onClick={handleAddPriceRow}
                                disabled={!newPriceRow.subCategory || !newPriceRow.size || !newPriceRow.price}
                                style={{
                                    height: '42px', padding: '0 20px', background: (!newPriceRow.subCategory || !newPriceRow.size || !newPriceRow.price) ? '#cbd5e1' : '#3b82f6',
                                    color: '#fff', border: 'none', borderRadius: '8px', cursor: (!newPriceRow.subCategory || !newPriceRow.size || !newPriceRow.price) ? 'not-allowed' : 'pointer', fontWeight: 600
                                }}
                            >
                                <i className="fas fa-plus"></i>
                            </button>
                        </div>

                        {/* Price List Table */}
                        <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 50px', padding: '10px 16px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                                <div>Block</div>
                                <div>Sub Category</div>
                                <div>Area Type</div>
                                <div>Size</div>
                                <div>Base Price</div>
                                <div></div>
                            </div>
                            {(formData.pricing?.unitPrices || []).length === 0 ? (
                                <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>No price configurations added.</div>
                            ) : (
                                (formData.pricing?.unitPrices || []).map((row, idx) => (
                                    <div key={row.id || idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 50px', padding: '12px 16px', borderBottom: '1px solid #f1f5f9', alignItems: 'center', fontSize: '0.9rem', color: '#334155' }}>
                                        <div>{row.block || 'All Blocks'}</div>
                                        <div>{row.subCategory}</div>
                                        <div>{row.areaType}</div>
                                        <div>{row.size}</div>
                                        <div style={{ fontWeight: 600 }}>₹ {row.price}</div>
                                        <button onClick={() => removePriceRow(row.id)} style={{ color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer' }}><i className="fas fa-trash"></i></button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Section 2: Global BSP (Fallback) */}
                <div style={sectionStyle}>
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <i className="fas fa-coins" style={{ color: '#f59e0b' }}></i> 2. Global Basic Sales Price (Optional Fallback)
                    </h4>
                    <div style={{ maxWidth: '400px' }}>
                        <label style={labelStyle}>Base Price Amount</label>
                        <div style={{ display: 'flex' }}>
                            <input
                                type="number"
                                style={{ ...inputStyle, borderRight: 'none', borderRadius: '8px 0 0 8px' }}
                                placeholder="0.00"
                                value={formData.pricing?.basePrice?.amount || ''}
                                onChange={e => {
                                    const currentBasePrice = formData.pricing?.basePrice || { amount: '', unit: 'sqft' };
                                    updatePricing('basePrice', { ...currentBasePrice, amount: e.target.value });
                                }}
                            />
                            <select
                                style={{ ...customSelectStyle, width: '120px', borderRadius: '0 8px 8px 0', borderLeft: '1px solid #e2e8f0', background: '#f8fafc' }}
                                value={formData.pricing?.basePrice?.unit || 'sqft'}
                                onChange={e => {
                                    const currentBasePrice = formData.pricing?.basePrice || { amount: '', unit: 'sqft' };
                                    updatePricing('basePrice', { ...currentBasePrice, unit: e.target.value });
                                }}
                            >
                                <option value="sqft">Per SqFt</option>
                                <option value="sqyd">Per SqYd</option>
                                <option value="fixed">Fixed Price</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Section 3: Master Charge Builder */}
                <div style={sectionStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <i className="fas fa-layer-group" style={{ color: '#6366f1' }}></i> 3. Master Charge Solutions
                        </h4>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => addMasterCharge()} style={{ padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-plus"></i> Add Custom Charge
                            </button>
                        </div>
                    </div>

                    {/* Presets Bar */}
                    <div style={{ marginBottom: '24px', padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '12px' }}>Professional Presets (One-Click Add)</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {[
                                { id: 'EDC', label: 'EDC', color: '#eff6ff', textColor: '#3b82f6' },
                                { id: 'IDC', label: 'IDC', color: '#eff6ff', textColor: '#3b82f6' },
                                { id: 'PLC', label: 'Add PLC', color: '#fdf2f8', textColor: '#db2777' },
                                { id: 'STAMP', label: 'Stamp Duty', color: '#f0fdf4', textColor: '#16a34a' },
                                { id: 'REG', label: 'Registration', color: '#f0fdf4', textColor: '#16a34a' },
                                { id: 'IFMS', label: 'IFMS Security', color: '#fff7ed', textColor: '#ea580c' }
                            ].map(p => (
                                <button key={p.id} onClick={() => addMasterCharge(p.id)} style={{ padding: '6px 12px', background: p.color, color: p.textColor, border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', transition: 'transform 0.2s' }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                                    <i className="fas fa-plus mr-1"></i> {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Unified Charge Table */}
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 2fr) 1.2fr 1fr 1.5fr 1fr 40px', gap: '16px', padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>
                            <span>Charge Description</span>
                            <span>Category</span>
                            <span>Basis</span>
                            <span>Value/Rate</span>
                            <span>GST</span>
                            <span></span>
                        </div>
                        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                            {formData.pricing.masterCharges.length === 0 ? (
                                <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                                    <i className="fas fa-receipt" style={{ fontSize: '2rem', marginBottom: '12px', color: '#e2e8f0' }}></i>
                                    <p>No charges added yet. Use presets above to start.</p>
                                </div>
                            ) : (
                                formData.pricing.masterCharges.map((charge, idx) => (
                                    <div key={charge.id || idx} style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 2fr) 1.2fr 1fr 1.5fr 1fr 40px', gap: '16px', padding: '16px 20px', borderBottom: '1px solid #f1f5f9', alignItems: 'center' }}>
                                        <input
                                            style={{ ...inputStyle, fontWeight: 600 }}
                                            value={charge.name}
                                            placeholder="Charge Name"
                                            onChange={e => updateMasterCharge(charge.id, 'name', e.target.value)}
                                        />
                                        <select
                                            style={customSelectStyle}
                                            value={charge.category}
                                            onChange={e => updateMasterCharge(charge.id, 'category', e.target.value)}
                                        >
                                            <option>Development</option>
                                            <option>Statutory</option>
                                            <option>PLC</option>
                                            <option>Maintenance</option>
                                            <option>Facility</option>
                                            <option>Other</option>
                                        </select>
                                        <select
                                            style={customSelectStyle}
                                            value={charge.basis}
                                            onChange={e => updateMasterCharge(charge.id, 'basis', e.target.value)}
                                        >
                                            <option>Per SqFt</option>
                                            <option>% of BSP</option>
                                            <option>% of Total</option>
                                            <option>Fixed</option>
                                        </select>
                                        <div style={{ display: 'flex' }}>
                                            <input
                                                type="number"
                                                style={{ ...inputStyle, borderRight: 'none', borderRadius: '8px 0 0 8px' }}
                                                value={charge.amount}
                                                placeholder="0.00"
                                                onChange={e => updateMasterCharge(charge.id, 'amount', e.target.value)}
                                            />
                                            <div style={{ width: '50px', background: '#f8fafc', border: '1px solid #e2e8f0', borderLeft: 'none', borderRadius: '0 8px 8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#64748b', fontSize: '0.85rem' }}>
                                                {charge.basis.includes('%') ? '%' : charge.basis === 'Per SqFt' ? '/ft' : '₹'}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <button
                                                onClick={() => updateMasterCharge(charge.id, 'gstEnabled', !charge.gstEnabled)}
                                                style={{
                                                    width: '44px',
                                                    height: '24px',
                                                    borderRadius: '12px',
                                                    background: charge.gstEnabled ? '#10b981' : '#cbd5e1',
                                                    border: 'none',
                                                    position: 'relative',
                                                    cursor: 'pointer',
                                                    transition: 'background 0.3s'
                                                }}
                                            >
                                                <div style={{
                                                    width: '18px',
                                                    height: '18px',
                                                    background: '#fff',
                                                    borderRadius: '50%',
                                                    position: 'absolute',
                                                    top: '3px',
                                                    left: charge.gstEnabled ? '23px' : '3px',
                                                    transition: 'left 0.3s'
                                                }}></div>
                                            </button>
                                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: charge.gstEnabled ? '#059669' : '#64748b' }}>
                                                {charge.gstEnabled ? 'GST' : 'Excl'}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => removeMasterCharge(charge.id)}
                                            style={{ border: 'none', background: 'transparent', color: '#cbd5e1', cursor: 'pointer' }}
                                            onMouseOver={e => e.currentTarget.style.color = '#ef4444'}
                                            onMouseOut={e => e.currentTarget.style.color = '#cbd5e1'}
                                        >
                                            <i className="fas fa-trash"></i>
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Section 4: Payment Plan Builder */}
                <div style={sectionStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <i className="fas fa-calendar-alt" style={{ color: '#ec4899' }}></i> 4. Payment Plan Strategy
                        </h4>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => applyPlanPreset('CLP')} style={{ fontSize: '0.75rem', padding: '6px 12px', background: '#eff6ff', color: '#3b82f6', border: '1px solid #bfdbfe', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Standard CLP</button>
                            <button onClick={() => applyPlanPreset('DPP')} style={{ fontSize: '0.75rem', padding: '6px 12px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Down Payment</button>
                            <button onClick={() => applyPlanPreset('PLP')} style={{ fontSize: '0.75rem', padding: '6px 12px', background: '#fff7ed', color: '#ea580c', border: '1px solid #ffedd5', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>PLP Preset</button>
                        </div>
                    </div>

                    {formData.pricing.paymentPlans.map((plan, pIdx) => (
                        <div key={pIdx} style={{ background: '#f8fafc', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', alignItems: 'center' }}>
                                <input
                                    style={{ ...inputStyle, background: 'transparent', border: 'none', borderBottom: '2px solid #6366f1', borderRadius: 0, width: '300px', fontWeight: 700, fontSize: '1.1rem' }}
                                    value={plan.name}
                                    onChange={e => {
                                        const newPlans = [...formData.pricing.paymentPlans];
                                        newPlans[pIdx].name = e.target.value;
                                        updatePricing('paymentPlans', newPlans);
                                    }}
                                />
                                <button
                                    onClick={() => {
                                        const newPlans = [...formData.pricing.paymentPlans];
                                        newPlans[pIdx].milestones.push({ name: '', percentage: '', stage: 'Slab' });
                                        updatePricing('paymentPlans', newPlans);
                                    }}
                                    style={{ padding: '8px 16px', borderRadius: '8px', background: '#fff', border: '1px solid #e2e8f0', color: '#6366f1', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                                >
                                    + Milestone
                                </button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr 40px', gap: '16px', marginBottom: '12px', padding: '0 8px', fontWeight: 700, fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>
                                <span>Milestone Description</span>
                                <span>Pay %</span>
                                <span>Construction Stage</span>
                                <span></span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {plan.milestones.map((m, mIdx) => (
                                    <div key={mIdx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr 40px', gap: '16px', alignItems: 'center' }}>
                                        <input
                                            style={inputStyle}
                                            value={m.name}
                                            placeholder="e.g. On start of Foundation"
                                            onChange={e => {
                                                const newPlans = [...formData.pricing.paymentPlans];
                                                newPlans[pIdx].milestones[mIdx].name = e.target.value;
                                                updatePricing('paymentPlans', newPlans);
                                            }}
                                        />
                                        <div style={{ display: 'flex' }}>
                                            <input
                                                type="number"
                                                style={{ ...inputStyle, borderRight: 'none', borderRadius: '8px 0 0 8px' }}
                                                value={m.percentage}
                                                placeholder="0"
                                                onChange={e => {
                                                    const newPlans = [...formData.pricing.paymentPlans];
                                                    newPlans[pIdx].milestones[mIdx].percentage = e.target.value;
                                                    updatePricing('paymentPlans', newPlans);
                                                }}
                                            />
                                            <div style={{ width: '40px', background: '#f8fafc', border: '1px solid #e2e8f0', borderLeft: 'none', borderRadius: '0 8px 8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#64748b' }}>%</div>
                                        </div>
                                        <select
                                            style={customSelectStyle}
                                            value={m.stage}
                                            onChange={e => {
                                                const newPlans = [...formData.pricing.paymentPlans];
                                                newPlans[pIdx].milestones[mIdx].stage = e.target.value;
                                                updatePricing('paymentPlans', newPlans);
                                            }}
                                        >
                                            <option value="Booking">Booking</option>
                                            <option value="Allotment">Allotment</option>
                                            <option value="Excavation">Excavation</option>
                                            <option value="Slab">Slab Casting</option>
                                            <option value="Finishing">Finishing</option>
                                            <option value="Possession">Possession</option>
                                        </select>
                                        <button
                                            onClick={() => {
                                                const newPlans = [...formData.pricing.paymentPlans];
                                                newPlans[pIdx].milestones = newPlans[pIdx].milestones.filter((_, i) => i !== mIdx);
                                                updatePricing('paymentPlans', newPlans);
                                            }}
                                            style={{ border: 'none', background: 'transparent', color: '#cbd5e1', cursor: 'pointer' }}
                                            onMouseOver={e => e.currentTarget.style.color = '#ef4444'}
                                            onMouseOut={e => e.currentTarget.style.color = '#cbd5e1'}
                                        >
                                            <i className="fas fa-times"></i>
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <div style={{ marginTop: '20px', padding: '12px 16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.9rem', color: '#64748b' }}>Total Percentage Distributed:</span>
                                <span style={{
                                    fontSize: '1rem',
                                    fontWeight: 800,
                                    color: plan.milestones.reduce((acc, m) => acc + (parseFloat(m.percentage) || 0), 0) === 100 ? '#22c55e' : '#ef4444'
                                }}>
                                    {plan.milestones.reduce((acc, m) => acc + (parseFloat(m.percentage) || 0), 0)}%
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderUploadTab = () => (
        <div className="tab-content fade-in">
            {/* Section 1: Documents & Approvals (Relocated) */}
            <div style={sectionStyle}>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fas fa-file-contract" style={{ color: '#6366f1' }}></i> Documents & Approvals
                </h4>
                {formData.projectDocuments.map((doc, index) => (
                    <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) minmax(140px, 1fr) 1fr 110px 110px 40px', gap: '12px', marginBottom: '16px', alignItems: 'end' }}>
                        <div>
                            <label style={labelStyle}>Document Name</label>
                            <select
                                value={doc.documentName}
                                onChange={(e) => {
                                    const newDocs = [...formData.projectDocuments];
                                    newDocs[index].documentName = e.target.value;
                                    setFormData({ ...formData, projectDocuments: newDocs });
                                }}
                                style={customSelectStyle}
                            >
                                <option value="">Select Name</option>
                                {(projectMasterFieldsSafe.approvals || []).map(app => (
                                    <option key={app} value={app}>{app}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Approval Authority</label>
                            <select
                                value={doc.approvalAuthority}
                                onChange={(e) => {
                                    const newDocs = [...formData.projectDocuments];
                                    newDocs[index].approvalAuthority = e.target.value;
                                    setFormData({ ...formData, projectDocuments: newDocs });
                                }}
                                style={customSelectStyle}
                            >
                                <option value="">Select Authority</option>
                                {(projectMasterFieldsSafe.approvalAuthorities || []).map(auth => (
                                    <option key={auth} value={auth}>{auth}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Registration No.</label>
                            <input
                                type="text"
                                value={doc.registrationNo}
                                placeholder="Reg No."
                                onChange={(e) => {
                                    const newDocs = [...formData.projectDocuments];
                                    newDocs[index].registrationNo = e.target.value;
                                    setFormData({ ...formData, projectDocuments: newDocs });
                                }}
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Approval Date</label>
                            <input
                                type="date"
                                value={doc.date}
                                onChange={(e) => {
                                    const newDocs = [...formData.projectDocuments];
                                    newDocs[index].date = e.target.value;
                                    setFormData({ ...formData, projectDocuments: newDocs });
                                }}
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>File</label>
                            <label style={{
                                width: '100%',
                                height: '42px',
                                background: '#f8fafc',
                                border: '1px dashed #cbd5e1',
                                borderRadius: '8px',
                                fontSize: '0.8rem',
                                color: '#64748b',
                                textAlign: 'center',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                padding: '0 8px'
                            }}>
                                {doc.file ? (doc.file.name || 'File Selected') : 'Upload'}
                                <input
                                    type="file"
                                    accept="image/*,application/pdf"
                                    style={{ display: 'none' }}
                                    onChange={(e) => {
                                        const file = e.target.files[0];
                                        if (file) {
                                            const newDocs = [...formData.projectDocuments];
                                            newDocs[index].file = file;
                                            setFormData({ ...formData, projectDocuments: newDocs });
                                        }
                                    }}
                                />
                            </label>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                if (index === 0) {
                                    setFormData({
                                        ...formData,
                                        projectDocuments: [...formData.projectDocuments, { documentName: '', approvalAuthority: '', registrationNo: '', date: '', file: null }]
                                    });
                                } else {
                                    const newDocs = formData.projectDocuments.filter((_, i) => i !== index);
                                    setFormData({ ...formData, projectDocuments: newDocs });
                                }
                            }}
                            style={{
                                height: '42px',
                                width: '40px',
                                borderRadius: '8px',
                                border: 'none',
                                background: index === 0 ? '#eff6ff' : '#fef2f2',
                                color: index === 0 ? '#3b82f6' : '#ef4444',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <i className={`fas ${index === 0 ? 'fa-plus' : 'fa-trash'}`}></i>
                        </button>
                    </div>
                ))}
            </div>

            {/* Section 2: Project Images (Structured) */}
            <div style={sectionStyle}>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fas fa-images" style={{ color: '#3b82f6' }}></i> Project Images
                </h4>
                {formData.projectImages.map((img, index) => (
                    <div key={index} style={{ display: 'grid', gridTemplateColumns: '80px 2fr 1.5fr minmax(120px, 1fr) 40px', gap: '16px', marginBottom: '16px', alignItems: 'end' }}>
                        <div style={{ width: '80px', height: '60px', background: '#f1f5f9', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {img.previewUrl ? (
                                <img src={img.previewUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <i className="fas fa-image" style={{ color: '#cbd5e1', fontSize: '1.2rem' }}></i>
                            )}
                        </div>
                        <div>
                            <label style={labelStyle}>Image Title</label>
                            <input
                                type="text"
                                style={inputStyle}
                                placeholder="e.g. Living Room, Exterior"
                                value={img.title}
                                onChange={(e) => {
                                    const newImages = [...formData.projectImages];
                                    newImages[index].title = e.target.value;
                                    setFormData({ ...formData, projectImages: newImages });
                                }}
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Category</label>
                            <select
                                style={customSelectStyle}
                                value={img.category}
                                onChange={(e) => {
                                    const newImages = [...formData.projectImages];
                                    newImages[index].category = e.target.value;
                                    setFormData({ ...formData, projectImages: newImages });
                                }}
                            >
                                <option>Main</option>
                                <option>Bedroom</option>
                                <option>Kitchen</option>
                                <option>Bathroom</option>
                                <option>Exterior</option>
                                <option>Layout Plan</option>
                                <option>Other</option>
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>File</label>
                            <label style={{
                                width: '100%',
                                height: '42px',
                                background: '#f8fafc',
                                border: '1px dashed #cbd5e1',
                                borderRadius: '8px',
                                fontSize: '0.8rem',
                                color: '#64748b',
                                textAlign: 'center',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                padding: '0 8px'
                            }}>
                                {img.file ? (img.file.name || 'File Selected') : 'Upload Image'}
                                <input
                                    type="file"
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    onChange={(e) => {
                                        const file = e.target.files[0];
                                        if (file) {
                                            const newImages = [...formData.projectImages];
                                            newImages[index].file = file;
                                            newImages[index].previewUrl = URL.createObjectURL(file);
                                            setFormData({ ...formData, projectImages: newImages });
                                        }
                                    }}
                                />
                            </label>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                if (index === 0) {
                                    setFormData({
                                        ...formData,
                                        projectImages: [...formData.projectImages, { title: '', category: 'Main', file: null }]
                                    });
                                } else {
                                    const newImages = formData.projectImages.filter((_, i) => i !== index);
                                    setFormData({ ...formData, projectImages: newImages });
                                }
                            }}
                            style={{
                                height: '42px',
                                width: '40px',
                                borderRadius: '8px',
                                border: 'none',
                                background: index === 0 ? '#eff6ff' : '#fef2f2',
                                color: index === 0 ? '#3b82f6' : '#ef4444',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <i className={`fas ${index === 0 ? 'fa-plus' : 'fa-trash'}`}></i>
                        </button>
                    </div>
                ))}
            </div>

            {/* Section 3: Project Videos (Structured + YouTube Support) */}
            <div style={sectionStyle}>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fas fa-video" style={{ color: '#ef4444' }}></i> Project Videos & YouTube Links
                </h4>
                {formData.projectVideos.map((vid, index) => (
                    <div key={index} style={{ display: 'grid', gridTemplateColumns: '80px 1.5fr 1fr 2fr 40px', gap: '16px', marginBottom: '16px', alignItems: 'end' }}>
                        <div style={{ width: '80px', height: '60px', background: '#f1f5f9', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {vid.type === 'YouTube' && getYouTubeThumbnail(vid.url) ? (
                                <img src={getYouTubeThumbnail(vid.url)} alt="Thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : vid.file ? (
                                <div style={{ fontSize: '0.6rem', color: '#64748b', textAlign: 'center' }}>Video File</div>
                            ) : (
                                <i className="fas fa-video" style={{ color: '#cbd5e1', fontSize: '1.2rem' }}></i>
                            )}
                        </div>
                        <div>
                            <label style={labelStyle}>Video Title</label>
                            <input
                                type="text"
                                style={inputStyle}
                                placeholder="e.g. Tour, Feature"
                                value={vid.title}
                                onChange={(e) => {
                                    const newVideos = [...formData.projectVideos];
                                    newVideos[index].title = e.target.value;
                                    setFormData({ ...formData, projectVideos: newVideos });
                                }}
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Type</label>
                            <select
                                style={customSelectStyle}
                                value={vid.type}
                                onChange={(e) => {
                                    const newVideos = [...formData.projectVideos];
                                    newVideos[index].type = e.target.value;
                                    newVideos[index].url = '';
                                    newVideos[index].file = null;
                                    setFormData({ ...formData, projectVideos: newVideos });
                                }}
                            >
                                <option value="YouTube">YouTube Link</option>
                                <option value="Upload">File Upload</option>
                            </select>
                        </div>
                        <div>
                            {vid.type === 'YouTube' ? (
                                <>
                                    <label style={labelStyle}>YouTube URL</label>
                                    <input
                                        type="text"
                                        style={inputStyle}
                                        placeholder="https://youtube.com/watch?v=..."
                                        value={vid.url}
                                        onChange={(e) => {
                                            const newVideos = [...formData.projectVideos];
                                            newVideos[index].url = e.target.value;
                                            setFormData({ ...formData, projectVideos: newVideos });
                                        }}
                                    />
                                </>
                            ) : (
                                <>
                                    <label style={labelStyle}>Video File</label>
                                    <label style={{
                                        width: '100%',
                                        height: '42px',
                                        background: '#f8fafc',
                                        border: '1px dashed #cbd5e1',
                                        borderRadius: '8px',
                                        fontSize: '0.8rem',
                                        color: '#64748b',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        padding: '0 8px'
                                    }}>
                                        {vid.file ? (vid.file.name || 'File Selected') : 'Upload Video'}
                                        <input
                                            type="file"
                                            accept="video/*"
                                            style={{ display: 'none' }}
                                            onChange={(e) => {
                                                const file = e.target.files[0];
                                                if (file) {
                                                    const newVideos = [...formData.projectVideos];
                                                    newVideos[index].file = file;
                                                    setFormData({ ...formData, projectVideos: newVideos });
                                                }
                                            }}
                                        />
                                    </label>
                                </>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                if (index === 0) {
                                    setFormData({
                                        ...formData,
                                        projectVideos: [...formData.projectVideos, { title: '', type: 'YouTube', url: '', file: null }]
                                    });
                                } else {
                                    const newVideos = formData.projectVideos.filter((_, i) => i !== index);
                                    setFormData({ ...formData, projectVideos: newVideos });
                                }
                            }}
                            style={{
                                height: '42px',
                                width: '40px',
                                borderRadius: '8px',
                                border: 'none',
                                background: index === 0 ? '#eff6ff' : '#fef2f2',
                                color: index === 0 ? '#3b82f6' : '#ef4444',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <i className={`fas ${index === 0 ? 'fa-plus' : 'fa-trash'}`}></i>
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)' }}>
            <div style={{ background: '#fff', width: '95%', maxWidth: '1200px', height: '90vh', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #e2e8f0' }} ref={modalRef} className="animate-slideIn">

                {/* Header aligned with AddCompanyModal */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to right, #ffffff, #f8fafc)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '32px', height: '32px', background: '#eff6ff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <i className="fas fa-building" style={{ color: '#2563eb' }}></i>
                            </div>
                            Add New Project
                        </h2>
                        <span style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px', fontWeight: 500, marginLeft: '42px' }}>
                            {currentTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} | {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                        </span>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ padding: '0 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '30px', background: '#fff' }}>
                    {['Basic', 'Location', 'Block', 'Amenities', 'Price', 'Upload'].map(tab => (
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
                        <div style={{ width: '100%', margin: '0 auto' }}>
                            {activeTab === 'Basic' && renderBasicTab()}
                            {activeTab === 'Location' && renderLocationTab()}
                            {activeTab === 'Block' && renderBlockTab()}
                            {activeTab === 'Amenities' && renderAmenitiesTab()}
                            {activeTab === 'Price' && renderPriceTab()}
                            {activeTab === 'Upload' && renderUploadTab()}
                            {!['Basic', 'Location', 'Block', 'Amenities', 'Price', 'Upload'].includes(activeTab) && (
                                <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
                                    <i className="fas fa-tools" style={{ fontSize: '3rem', marginBottom: '16px', color: '#cbd5e1' }}></i>
                                    <p>Section <b>{activeTab}</b> is under development.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button onClick={onClose} style={buttonStyle.cancel}>Cancel</button>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        {activeTab !== 'Basic' && (
                            <button onClick={handlePrev} style={buttonStyle.secondary}>Previous</button>
                        )}
                        {activeTab !== 'Upload' ? (
                            <button onClick={handleNext} style={buttonStyle.primary}>Next</button>
                        ) : (
                            <button onClick={handleSave} disabled={isLoading || !hasPermission} style={buttonStyle.success}>Save Project</button>
                        )}
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
        </div>
    );
}

export default AddProjectModal;
