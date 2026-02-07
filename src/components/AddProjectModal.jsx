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

    const TABS = ['Basic', 'Location', 'Block', 'Amenities'];
    const TAB_ICONS = {
        'Basic': 'fa-info-circle',
        'Location': 'fa-map-marker-alt',
        'Block': 'fa-cubes',
        'Amenities': 'fa-wifi'
    };

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
                            {projectToEdit ? 'Update Project' : 'Add New Project'}
                        </h2>
                        <span style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px', fontWeight: 500, marginLeft: '42px' }}>
                            {currentTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} | {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                        </span>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ padding: '0 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '30px', background: '#fff' }}>
                    {TABS.map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                padding: '16px 0', fontSize: '0.9rem', fontWeight: 600, color: activeTab === tab ? '#2563eb' : '#64748b',
                                border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: `2px solid ${activeTab === tab ? '#2563eb' : 'transparent'}`, transition: 'all 0.2s',
                                display: 'flex', alignItems: 'center', gap: '8px'
                            }}
                        >
                            <i className={`fas ${TAB_ICONS[tab]}`}></i> {tab}
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
                            {!['Basic', 'Location', 'Block', 'Amenities'].includes(activeTab) && (
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
                        {activeTab !== TABS[TABS.length - 1] ? (
                            <button onClick={handleNext} style={buttonStyle.primary}>Next</button>
                        ) : (
                            <button onClick={handleSave} disabled={isLoading || !hasPermission} style={buttonStyle.success}>{projectToEdit ? 'Update Project' : 'Save Project'}</button>
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
