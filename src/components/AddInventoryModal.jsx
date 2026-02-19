import React, { useState, useEffect, useRef } from 'react';
import { usePropertyConfig } from '../context/PropertyConfigContext';
import { useUserContext } from '../context/UserContext';
import { useContactConfig } from '../context/ContactConfigContext';
import { useFieldRules } from '../context/FieldRulesContext';
import { INDIAN_ADDRESS_DATA } from '../data/locationData';
import AddressDetailsForm from './common/AddressDetailsForm';
import { useTriggers } from '../context/TriggersContext';
import { useDistribution } from '../context/DistributionContext';
import { useSequences } from '../context/SequenceContext';
import { api } from '../utils/api';
import toast from 'react-hot-toast';

import AddSizeModal from './modals/AddSizeModal';
import { contactData } from '../data/mockData';

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

const AddInventoryModal = ({ isOpen, onClose, onAdd, onSave, initialProject = null, property = null }) => {
    // 1. Get projects from PropertyConfigContext
    const {
        projects: allProjects,
        masterFields = {},
        propertyConfig,
        sizes,
        getLookupId,
        getLookupValue
    } = usePropertyConfig();
    const { users, teams } = useUserContext();
    const { profileConfig = {} } = useContactConfig();
    const { validateAsync } = useFieldRules();
    const { fireEvent } = useTriggers();
    const { executeDistribution } = useDistribution();
    const { evaluateAndEnroll } = useSequences();
    const [searchResults, setSearchResults] = useState([]);
    const [activeTab, setActiveTab] = useState('Unit');
    const [isLoading, setIsLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [isSaving, setIsSaving] = useState(false);
    const [isAddSizeModalOpen, setIsAddSizeModalOpen] = useState(false);

    const [formData, setFormData] = useState({
        // Unit Details
        projectName: initialProject || '',
        projectId: '',
        unitNo: '',
        unitType: '', // From settings (Ordinary, Corner, etc.)
        category: 'Residential',
        subCategory: '', // Lifted out
        builtupType: '', // Lifted out

        block: '',
        size: '',
        direction: '',
        facing: '',
        roadWidth: '',
        ownership: '',

        // Built-up Details (Rows only contain dimensions now)
        builtupDetails: [
            {
                floor: 'Ground Floor',
                cluster: '',
                length: '',
                width: '',
                totalArea: ''
                // Area units calculated automatically
            }
        ],
        occupationDate: '',
        ageOfConstruction: '',
        possessionStatus: '', // Task 18
        furnishType: '',
        furnishedItems: '',

        // Location
        locationSearch: '',
        latitude: '',
        longitude: '',
        address: {
            country: 'India',
            state: '',
            city: '',
            tehsil: '',
            postOffice: '',
            zip: '',
            hNo: '',
            street: '',
            location: '',
            area: ''
        },

        // Owner Details (List of Linked Contacts)
        owners: [], // { ...contact, role, relationship }

        // System Assignment
        assignedTo: '',
        team: '',
        status: 'Active',
        intent: 'Sell',
        visibleTo: 'Public',

        // Uploads
        inventoryDocuments: [{ documentName: '', documentType: '', linkedContactMobile: '', file: null }],
        inventoryImages: [{ title: '', category: 'Main', file: null }],
        inventoryVideos: [{ title: '', type: 'YouTube', url: '', file: null }]
    });

    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, [isOpen]);


    // Initial project setup
    useEffect(() => {
        if (initialProject) {
            setFormData(prev => ({ ...prev, projectName: initialProject }));
        }
    }, [initialProject]);

    // Pre-fill form data if editing
    useEffect(() => {
        if (property) {
            setFormData(prev => ({
                ...prev,
                projectName: property.projectName || property.project || '',
                projectId: property.projectId || '',
                unitNo: property.unitNo || property.unitNumber || '',
                unitType: property.unitType || '',
                category: property.category || property.type || 'Residential',
                block: property.block || '',
                size: property.size || '',
                locationSearch: property.locationSearch || property.location || '',
                status: getLookupValue('InventoryStatus', property.status),
                intent: getLookupValue('Intent', property.intent || 'Sell'),
                category: getLookupValue('Category', property.category),
                subCategory: getLookupValue('SubCategory', property.subCategory),
                facing: getLookupValue('Facing', property.facing),
            }));
        }
    }, [property, isOpen]);
    const [duplicateWarning, setDuplicateWarning] = useState(false);
    const [isBlocked, setIsBlocked] = useState(false);
    const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);

    // Real-time Duplicate Check
    useEffect(() => {
        const checkDuplicate = async () => {
            if (formData.projectName && formData.unitNo && !property) {
                setIsCheckingDuplicate(true);
                try {
                    const response = await api.post('duplication-rules/check', {
                        entityType: 'Inventory',
                        data: { ...formData, project: formData.projectName } // Ensure 'project' matches rule field
                    });
                    if (response.data && response.data.success) {
                        setDuplicateWarning(response.data.data.length > 0);
                        setIsBlocked(response.data.blockAction === true && response.data.data.length > 0);
                    }
                } catch (err) {
                    console.error("Duplicate check error:", err);
                } finally {
                    setIsCheckingDuplicate(false);
                }
            } else {
                setDuplicateWarning(false);
                setIsBlocked(false);
            }
        };

        const timer = setTimeout(checkDuplicate, 800);
        return () => clearTimeout(timer);
    }, [formData.projectName, formData.block, formData.unitNo, property]);


    // Owner / Associate Search State
    const [ownerSearch, setOwnerSearch] = useState('');
    const [showOwnerResults, setShowOwnerResults] = useState(false);
    const hiddenFields = propertyConfig?.hiddenFields || [];

    // Debounced Search for Contacts
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (ownerSearch.length > 1) {
                try {
                    const response = await api.get(`/contacts?search=${ownerSearch}&limit=10`);
                    if (response.data && response.data.success) {
                        setSearchResults(response.data.records || []);
                    }
                } catch (error) {
                    console.error("Contact search error:", error);
                }
            } else {
                setSearchResults([]);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [ownerSearch]);
    const [selectedContactToLink, setSelectedContactToLink] = useState(null);
    const [linkData, setLinkData] = useState({ role: 'Property Owner', relationship: '' }); // role: 'Property Owner' | 'Associate'

    // Additional state for Owner tab
    const [showProjectDropdown, setShowProjectDropdown] = useState(false);

    // Address Auto-fill State
    const [disabledAddressFields, setDisabledAddressFields] = useState([]);

    const handleProjectChange = async (e) => {
        const name = e.target.value;
        const project = allProjects.find(p => p.name === name);
        const projectId = project?._id || project?.id || '';

        setFormData(prev => ({ ...prev, projectName: name, projectId, block: "", size: "" }));

        // Auto-assign agent based on distribution rules
        const result = executeDistribution('inventory', { ...formData, projectName: name, projectId });
        if (result && result.success) {
            setFormData(prev => ({
                ...prev,
                projectName: name,
                assignedTo: result.assignedTo,
                team: result.team || prev.team,
                // Also prepopulate location search with project location if variable available
                locationSearch: project?.location || prev.locationSearch
            }));
            toast.success(`Inventory automatically assigned to ${result.assignedTo}`);
        }

        // Auto-fill City/Location Logic
        if (project) {
            let targetState = '';
            let targetCity = '';

            // Simple string matching based on project location content
            const locLower = (project.location || '').toLowerCase();
            if (locLower.includes('mohali')) { targetState = 'Punjab'; targetCity = 'Mohali'; }
            else if (locLower.includes('chandigarh')) { targetState = 'Chandigarh'; targetCity = 'Chandigarh'; }
            else if (locLower.includes('kurukshetra')) { targetState = 'Haryana'; targetCity = 'Kurukshetra'; }
            else if (locLower.includes('panchkula')) { targetState = 'Haryana'; targetCity = 'Panchkula'; }
            else if (locLower.includes('zirakpur')) { targetState = 'Punjab'; targetCity = 'Zirakpur'; }

            if (targetState && targetCity) {
                try {
                    // 1. Fetch Country (India)
                    const countryRes = await api.get("/lookups?lookup_type=Country&limit=10");
                    const countryObj = (countryRes.data.data || []).find(c => c.lookup_value === 'India');

                    if (countryObj) {
                        // 2. Fetch State
                        const stateRes = await api.get(`/lookups?lookup_type=State&parent_lookup_id=${countryObj._id}&limit=100`);
                        const stateObj = (stateRes.data.data || []).find(s => s.lookup_value.toLowerCase() === targetState.toLowerCase());

                        if (stateObj) {
                            // 3. Fetch City
                            const cityRes = await api.get(`/lookups?lookup_type=City&parent_lookup_id=${stateObj._id}&limit=100`);
                            const cityObj = (cityRes.data.data || []).find(c => c.lookup_value.toLowerCase() === targetCity.toLowerCase());

                            if (cityObj) {
                                let newAddress = {
                                    ...prev.address,
                                    country: countryObj._id,
                                    state: stateObj._id,
                                    city: cityObj._id,
                                    // Default values, will try to refine below
                                    location: '', tehsil: '', postOffice: '', pinCode: ''
                                };
                                let disabled = ['country', 'state', 'city'];

                                // Optional: Try to match Location if possible (Project "Sector 71" -> Location "Sector 71")
                                if (project.name) {
                                    // fetching locations for the city
                                    const locRes = await api.get(`/lookups?lookup_type=Location&parent_lookup_id=${cityObj._id}&limit=200`);
                                    const locations = locRes.data.data || [];

                                    // Try to find a location that is contained in project name
                                    const matchedLoc = locations.find(l => project.name.toLowerCase().includes(l.lookup_value.toLowerCase()));
                                    if (matchedLoc) {
                                        newAddress.location = matchedLoc._id; // Store ID for backend
                                        // Also store the human readable location name in locationSearch or area for UI display fallback
                                        setFormData(prev => ({
                                            ...prev,
                                            locationSearch: matchedLoc.lookup_value + ", " + cityObj.lookup_value,
                                            // Ensure top-level location/area fields are also populated for the list view
                                            address: newAddress
                                        }));
                                        disabled.push('location');
                                    } else {
                                        // Fallback: Use project location string if no lookup match
                                        setFormData(prev => ({
                                            ...prev,
                                            locationSearch: project.location || '',
                                            address: newAddress
                                        }));
                                    }
                                } else {
                                    setFormData(prev => ({ ...prev, address: newAddress }));
                                }
                                setDisabledAddressFields(disabled);
                            }
                        }
                    }
                } catch (err) {
                    console.error("Error auto-filling location:", err);
                }
            } else {
                setDisabledAddressFields([]);
            }
        } else {
            setDisabledAddressFields([]);
        }
    };


    // Helper function to update form data
    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    // --- Furnished Items Chip Logic ---
    const [currentFurnishedItem, setCurrentFurnishedItem] = useState('');

    const handleFurnishedItemKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = currentFurnishedItem.trim();
            if (val) {
                const currentItems = formData.furnishedItems ? formData.furnishedItems.split(',').map(s => s.trim()).filter(Boolean) : [];
                if (!currentItems.includes(val)) {
                    const newItems = [...currentItems, val];
                    setFormData({ ...formData, furnishedItems: newItems.join(', ') });
                }
                setCurrentFurnishedItem('');
            }
        }
    };

    const removeFurnishedItem = (itemToRemove) => {
        const currentItems = formData.furnishedItems ? formData.furnishedItems.split(',').map(s => s.trim()).filter(Boolean) : [];
        const newItems = currentItems.filter(item => item !== itemToRemove);
        setFormData({ ...formData, furnishedItems: newItems.join(', ') });
    };


    // Derived Data for Cascading Address
    const countryData = INDIAN_ADDRESS_DATA['India'];
    const states = formData.address.country === 'India' && countryData ? Object.keys(countryData) : [];
    const cityData = formData.address.state && countryData && countryData[formData.address.state] ? countryData[formData.address.state] : null;
    const cities = cityData ? Object.keys(cityData) : [];
    const selectedCityObj = cityData && formData.address.city ? cityData[formData.address.city] : null;
    const tehsils = selectedCityObj ? selectedCityObj.tehsils : [];
    const postOffices = selectedCityObj ? selectedCityObj.postOffices.filter(po => !formData.address.tehsil || po.tehsil === formData.address.tehsil) : [];

    // Derived Data for Sub Categories and Built-up Types
    const currentCategoryConfig = propertyConfig[formData.category] || {};
    const subCategories = (currentCategoryConfig.subCategories || []).map(sc => sc.name);

    // Dynamic Built-up Types: Aggregate ALL builtupTypes from ALL types in the selected Sub Category
    const builtUpTypes = (() => {
        if (!formData.subCategory) return [];

        const subCatConfig = (currentCategoryConfig.subCategories || []).find(sc => sc.name === formData.subCategory);
        if (!subCatConfig) return [];

        // Professional Aggregation: Collect unique built-up types from all size variants
        const allBuiltUpTypes = new Set();
        (subCatConfig.types || []).forEach(type => {
            (type.builtupTypes || []).forEach(bt => allBuiltUpTypes.add(bt));
        });

        return Array.from(allBuiltUpTypes);
    })();

    const modalRef = useRef(null);
    const mapRef = useRef(null);
    const searchInputRef = useRef(null);
    const googleMapRef = useRef(null);
    const markerRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            setIsLoading(true);
            setTimeout(() => setIsLoading(false), 10);
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
            setActiveTab('Unit');
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [isOpen]);

    // Auto-calculate Age of Construction
    useEffect(() => {
        if (formData.occupationDate) {
            const occDate = new Date(formData.occupationDate);
            const today = new Date();
            let age = today.getFullYear() - occDate.getFullYear();
            const m = today.getMonth() - occDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < occDate.getDate())) {
                age--;
            }
            const ageStr = age >= 0 ? `${age} Years` : 'New';
            setFormData(prev => ({ ...prev, ageOfConstruction: ageStr }));
        }
    }, [formData.occupationDate]);

    // Google Maps Integration
    useEffect(() => {
        if (!isOpen || activeTab !== 'Location') return;

        // Geocoding Helper
        const fetchAddressFromCoordinates = (lat, lng) => {
            if (!window.google || !window.google.maps) return;
            const geocoder = new window.google.maps.Geocoder();
            geocoder.geocode({ location: { lat, lng } }, (results, status) => {
                if (status === "OK" && results[0]) {
                    const addressComponents = results[0].address_components;
                    const getComponent = (type) => {
                        const comp = addressComponents.find(c => c.types.includes(type));
                        return comp ? comp.long_name : '';
                    };

                    const newState = getComponent('administrative_area_level_1');
                    const newCity = getComponent('administrative_area_level_2');
                    const newZip = getComponent('postal_code');
                    const newStreet = `${getComponent('route')} ${getComponent('street_number')}`.trim();
                    const newLocation = getComponent('sublocality') || getComponent('neighborhood');
                    const newArea = getComponent('sublocality_level_1') || getComponent('sublocality_level_2');

                    setFormData(prev => ({
                        ...prev,
                        address: {
                            ...prev.address,
                            state: newState || prev.address.state,
                            city: newCity || prev.address.city,
                            country: 'India', // Default
                            zip: newZip || prev.address.zip,
                            street: newStreet || prev.address.street,
                            location: newLocation || prev.address.location,
                            area: newArea || prev.address.area
                        }
                    }));
                }
            });
        };

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
                        title: "Property Location"
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


    // --- Styling Constants ---
    const labelStyle = {
        fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '10px', display: 'block'
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

    const buttonStyle = {
        cancel: { padding: '10px 24px', borderRadius: '8px', border: '1px solid #fecaca', background: '#fff', color: '#ef4444', fontWeight: 600, cursor: 'pointer' },
        secondary: { padding: '10px 24px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, cursor: 'pointer' },
        primary: { padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer' },
        success: { padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#22c55e', color: '#fff', fontWeight: 600, cursor: 'pointer' }
    };


    const handleAddBuiltupRow = () => {
        setFormData(prev => ({
            ...prev,
            builtupDetails: [...prev.builtupDetails, { floor: '', cluster: '', length: '', width: '', totalArea: '' }]
        }));
    };

    const handleRemoveBuiltupRow = (index) => {
        setFormData(prev => ({
            ...prev,
            builtupDetails: prev.builtupDetails.filter((_, i) => i !== index)
        }));
    };

    const updateBuiltupRow = (index, field, value) => {
        const newRows = [...formData.builtupDetails];
        newRows[index] = { ...newRows[index], [field]: value };

        // Auto Calculate Area
        if (field === 'length' || field === 'width') {
            const l = parseFloat(newRows[index].length) || 0;
            const w = parseFloat(newRows[index].width) || 0;
            newRows[index].totalArea = (l * w).toString();
        }

        setFormData(prev => ({ ...prev, builtupDetails: newRows }));
    };

    const TABS = ['Unit', 'Location', 'Owner'];

    const TAB_ICONS = {
        'Unit': 'fa-home',
        'Location': 'fa-map-marker-alt',
        'Owner': 'fa-user-tag'
    };
    const handleNext = () => {
        const currentIndex = TABS.indexOf(activeTab);
        if (currentIndex < TABS.length - 1) setActiveTab(TABS[currentIndex + 1]);
    };
    const handlePrev = () => {
        const currentIndex = TABS.indexOf(activeTab);
        if (currentIndex > 0) setActiveTab(TABS[currentIndex - 1]);
    };


    // --- Renderers ---

    const renderUnitTab = () => (
        <div className="tab-content fade-in">
            <div style={sectionStyle}>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fas fa-home" style={{ color: '#3b82f6' }}></i> Basic Unit Details
                </h4>

                <div className="grid-2-col">
                    <div>
                        <label style={labelStyle}>Category</label>
                        <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '8px', width: 'fit-content', border: '1px solid #e2e8f0' }}>
                            {['Residential', 'Commercial', 'Industrial', 'Agricultural', 'Institutional'].map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setFormData({
                                        ...formData,
                                        category: cat,
                                        subCategory: '',
                                        builtupType: '',
                                        builtupDetails: [{ floor: '', cluster: '', length: '', width: '', totalArea: '' }]
                                    })}
                                    style={{
                                        padding: '8px 16px', borderRadius: '6px', border: 'none', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                                        background: formData.category === cat ? '#fff' : 'transparent',
                                        color: formData.category === cat ? '#2563eb' : '#64748b',
                                        boxShadow: formData.category === cat ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label style={labelStyle}>Sub Category</label>
                        <select
                            style={customSelectStyle}
                            value={formData.subCategory}
                            onChange={e => setFormData({ ...formData, subCategory: e.target.value, builtupType: '' })}
                        >
                            <option value="">Select Sub-Category</option>
                            {subCategories.map(sc => <option key={sc} value={sc}>{sc}</option>)}
                        </select>
                    </div>
                </div>

                {/* Row 1: Unit Number + Unit Type */}
                <div className="grid-2-col" style={{ marginTop: '32px' }}>
                    <div>
                        <label style={labelStyle}>Unit Number</label>
                        <input
                            type="text"
                            style={{ ...inputStyle, borderColor: duplicateWarning ? '#ef4444' : '#e2e8f0' }}
                            value={formData.unitNo}
                            onChange={e => setFormData({ ...formData, unitNo: e.target.value })}
                            placeholder="Enter Unit No."
                        />
                        {duplicateWarning && (
                            <div style={{
                                marginTop: '8px',
                                padding: '8px',
                                background: isBlocked ? '#fef2f2' : '#fff7ed',
                                border: `1px solid ${isBlocked ? '#fca5a5' : '#fed7aa'}`,
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '8px'
                            }}>
                                <i className={`fas ${isBlocked ? 'fa-ban' : 'fa-exclamation-triangle'}`} style={{ color: isBlocked ? '#dc2626' : '#ea580c', marginTop: '3px' }}></i>
                                <div>
                                    <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 600, color: isBlocked ? '#b91c1c' : '#9a3412' }}>
                                        {isBlocked ? 'Action Blocked: Duplicate Found' : 'Warning: Duplicate Found'}
                                    </p>
                                    <p style={{ margin: '2px 0 0 0', fontSize: '0.7rem', color: isBlocked ? '#ef4444' : '#c2410c' }}>
                                        Unit {formData.unitNo} already exists in {formData.block}.
                                    </p>
                                </div>
                            </div>
                        )}
                        {isCheckingDuplicate && <p style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '6px' }}>Checking for duplicates...</p>}
                    </div>
                    <div>
                        <label style={labelStyle}>Unit Type (Orientation)</label>
                        <select
                            style={customSelectStyle}
                            value={formData.unitType}
                            onChange={e => setFormData({ ...formData, unitType: e.target.value })}
                        >
                            <option value="">Select Type</option>
                            {(masterFields?.unitTypes || []).map(t => <option key={t}>{t}</option>)}
                        </select>
                    </div>
                </div>

                {/* Row 2: Project Name + Block + Size */}
                <div className="grid-3-col" style={{ marginTop: '32px' }}>
                    <div>
                        <label style={labelStyle}>Project Name</label>
                        <select
                            style={customSelectStyle}
                            value={formData.projectName}
                            onChange={handleProjectChange}

                        >
                            <option value="">Select Project</option>
                            {allProjects.map(proj => (
                                <option key={proj.id} value={proj.name}>{proj.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Block</label>
                        <select
                            style={!formData.projectName ? customSelectStyleDisabled : customSelectStyle}
                            value={formData.block}
                            disabled={!formData.projectName}
                            onChange={e => setFormData({ ...formData, block: e.target.value })}
                        >
                            <option value="">{formData.projectName ? "Select Block" : "Select Project First"}</option>
                            {(() => {
                                const selectedProj = allProjects.find(p => p.name === formData.projectName || p._id === formData.projectId || p.id === formData.projectId);
                                if (!selectedProj) return null;
                                const blocks = selectedProj.blocks || [];
                                return blocks.length > 0 ? (
                                    blocks.map((b, idx) => {
                                        const blockName = typeof b === 'object' ? b.name : b;
                                        return <option key={blockName || idx} value={blockName}>{blockName}</option>;
                                    })
                                ) : (
                                    <option value="Open">Open Campus</option>
                                );
                            })()}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Size</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <select
                                style={{ ...((!formData.projectName || !formData.block) ? customSelectStyleDisabled : customSelectStyle), flex: 1 }}
                                value={formData.size}
                                disabled={!formData.projectName || !formData.block}
                                onChange={e => setFormData({ ...formData, size: e.target.value })}
                            >
                                <option value="">
                                    {(!formData.projectName || !formData.block) ? "Select Project & Block first" : "Select Size"}
                                </option>
                                {(() => {
                                    if (!formData.projectName || !formData.block) return null;
                                    const availableSizes = sizes || [];
                                    const filteredSizes = availableSizes.filter(s =>
                                        (s.project === formData.projectName || s.projectId === formData.projectId) &&
                                        (s.block === formData.block)
                                    );
                                    return filteredSizes.map(sz => <option key={sz.id || sz._id} value={sz.name}>{sz.name}</option>);
                                })()}
                            </select>
                            <button
                                onClick={() => setIsAddSizeModalOpen(true)}
                                disabled={!formData.projectName || !formData.block}
                                style={{
                                    padding: '0 12px',
                                    borderRadius: '8px',
                                    border: '1px solid #3b82f6',
                                    background: '#eff6ff',
                                    color: '#3b82f6',
                                    cursor: (!formData.projectName || !formData.block) ? 'not-allowed' : 'pointer',
                                    opacity: (!formData.projectName || !formData.block) ? 0.5 : 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                title="Add New Size"
                            >
                                <i className="fas fa-plus"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div style={sectionStyle}>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fas fa-compass" style={{ color: '#10b981' }}></i> Orientation & Features
                </h4>
                <div className="grid-4-col gap-16">
                    <div>
                        <label style={labelStyle}>Direction</label>
                        <select style={customSelectStyle} value={formData.direction} onChange={e => setFormData({ ...formData, direction: e.target.value })}>
                            <option value="">Select</option>
                            {(masterFields?.directions || []).map(d => <option key={d}>{d}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Facing</label>
                        <select style={customSelectStyle} value={formData.facing} onChange={e => setFormData({ ...formData, facing: e.target.value })}>
                            <option value="">Select</option>
                            {(masterFields?.facings || []).map(f => <option key={f}>{f}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Road Width</label>
                        <select style={customSelectStyle} value={formData.roadWidth} onChange={e => setFormData({ ...formData, roadWidth: e.target.value })}>
                            <option value="">Select</option>
                            {(masterFields?.roadWidths || []).map(r => <option key={r}>{r}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Ownership</label>
                        <select style={customSelectStyle} value={formData.ownership} onChange={e => setFormData({ ...formData, ownership: e.target.value })}>
                            <option value="">Select Ownership</option>
                            <option>Freehold</option>
                            <option>Leasehold</option>
                            <option>Co-operative Society</option>
                            <option>Power of Attorney</option>
                        </select>
                    </div>
                </div>
            </div>

            <div style={sectionStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <i className="fas fa-layer-group" style={{ color: '#8b5cf6' }}></i> Builtup Details
                    </h4>
                    <button onClick={handleAddBuiltupRow} style={{ padding: '6px 12px', background: '#eff6ff', color: '#3b82f6', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                        <i className="fas fa-plus mr-1"></i> Add Row
                    </button>
                </div>

                {/* Global Built-up Type Selection (Sub Category moved to Unit Tab) */}
                <div style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px dashed #e2e8f0' }}>
                    <div>
                        <label style={labelStyle}>Built-up Type (Dependent on Sub Category)</label>
                        <select
                            style={!formData.subCategory ? customSelectStyleDisabled : customSelectStyle}
                            value={formData.builtupType}
                            disabled={!formData.subCategory}
                            onChange={e => setFormData({ ...formData, builtupType: e.target.value })}
                        >
                            <option value="">{formData.subCategory ? "Select Type" : "Select Sub-Category in Unit Details First"}</option>
                            {builtUpTypes.map(t => <option key={t}>{t}</option>)}
                        </select>
                    </div>
                </div>

                {/* Dynamic Dimension Rows */}
                {formData.builtupDetails.map((row, idx) => (
                    <div key={idx} style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 1fr 1fr 0.9fr 40px', gap: '12px', alignItems: 'end' }}>
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px', display: 'block' }}>Floor</label>
                                <select style={customSelectStyle} value={row.floor} onChange={e => updateBuiltupRow(idx, 'floor', e.target.value)}>
                                    <option>Ground</option>
                                    <option>First</option>
                                    <option>Second</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px', display: 'block' }}>Plan</label>
                                <select style={customSelectStyle} value={row.cluster} onChange={e => updateBuiltupRow(idx, 'cluster', e.target.value)}>
                                    <option value="">Select</option>
                                    <option>Type A</option>
                                    <option>Type B</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px', display: 'block' }}>Width</label>
                                <input type="number" style={inputStyle} placeholder="W" value={row.width} onChange={e => updateBuiltupRow(idx, 'width', e.target.value)} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px', display: 'block' }}>Length</label>
                                <input type="number" style={inputStyle} placeholder="L" value={row.length} onChange={e => updateBuiltupRow(idx, 'length', e.target.value)} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px', display: 'block' }}>Total Area</label>
                                <div style={{ fontSize: '0.75rem', background: '#e2e8f0', padding: '8px', borderRadius: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {row.totalArea ? (
                                        <>
                                            <b>{row.totalArea}</b> SqFt <br />
                                            <span style={{ color: '#64748b', fontSize: '0.7rem' }}>
                                                {(row.totalArea / 9).toFixed(1)} SqYd | {(row.totalArea / 10.764).toFixed(1)} SqM
                                            </span>
                                        </>
                                    ) : '-'}
                                </div>
                            </div>
                            <button onClick={() => handleRemoveBuiltupRow(idx)} style={{ width: '42px', height: '42px', background: '#fee2e2', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <i className="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <div style={sectionStyle}>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fas fa-couch" style={{ color: '#f59e0b' }}></i> Furnishing & Dates
                </h4>
                {/* Single Row for Dates & Furnish Status */}
                <div className="grid-3-col gap-24">
                    <div>
                        <label style={labelStyle}>Occupation Date</label>
                        <input type="date" style={inputStyle} value={formData.occupationDate} onChange={e => setFormData({ ...formData, occupationDate: e.target.value })} />
                    </div>
                    <div>
                        <label style={labelStyle}>Age of Construction</label>
                        <input type="text" style={inputStyle} placeholder="e.g. 5 Years" value={formData.ageOfConstruction} onChange={e => setFormData({ ...formData, ageOfConstruction: e.target.value })} />
                    </div>
                    <div>
                        <label style={labelStyle}>Possession Status</label>
                        <select
                            style={customSelectStyle}
                            value={formData.possessionStatus}
                            onChange={e => setFormData({ ...formData, possessionStatus: e.target.value })}
                        >
                            <option value="">Select Status</option>
                            <option value="Ready to Move">Ready to Move</option>
                            <option value="Under Construction">Under Construction</option>
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Furnish Status</label>
                        <select style={customSelectStyle} value={formData.furnishType} onChange={e => setFormData({ ...formData, furnishType: e.target.value })}>
                            <option value="">Select</option>
                            <option>Fully Furnished</option>
                            <option>Semi Furnished</option>
                            <option>Unfurnished</option>
                        </select>
                    </div>
                </div>
                <div className="mt-24">
                    {formData.furnishType !== 'Unfurnished' && (
                        <div>
                            <label style={labelStyle}>Furnished Items</label>
                            <div style={{
                                minHeight: '42px', padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0',
                                background: '#fff', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center'
                            }}>
                                {(formData.furnishedItems ? formData.furnishedItems.split(',').map(s => s.trim()).filter(Boolean) : []).map((item, idx) => (
                                    <span key={idx} style={{
                                        background: '#eff6ff', color: '#3b82f6', padding: '4px 10px', borderRadius: '20px',
                                        fontSize: '0.85rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px'
                                    }}>
                                        {item}
                                        <i className="fas fa-times"
                                            onClick={() => removeFurnishedItem(item)}
                                            style={{ cursor: 'pointer', fontSize: '0.8rem', opacity: 0.7 }}
                                        ></i>
                                    </span>
                                ))}
                                <input
                                    type="text"
                                    style={{ border: 'none', outline: 'none', fontSize: '0.9rem', flex: 1, minWidth: '120px', background: 'transparent', height: '100%' }}
                                    placeholder="Type & Press Enter..."
                                    value={currentFurnishedItem}
                                    onChange={e => setCurrentFurnishedItem(e.target.value)}
                                    onKeyDown={handleFurnishedItemKeyDown}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div >
    );

    const renderLocationTab = () => (
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
                        onChange={e => setFormData({ ...formData, locationSearch: e.target.value })}
                    />
                </div>

                {/* Live Google Map Container */}
                <div
                    ref={mapRef}
                    style={{ background: '#f1f5f9', borderRadius: '12px', border: '1px solid #e2e8f0', height: '400px', width: '100%', marginBottom: '24px', overflow: 'hidden' }}
                >
                    {/* Map will be mounted here */}
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

    const filteredOwners = searchResults.filter(c => !formData.owners.some(o => o.mobile === c.mobile));

    const handleLinkOwner = () => {
        if (!selectedContactToLink || (linkData.role === 'Associate' && !linkData.relationship)) return;

        const newOwner = {
            id: selectedContactToLink._id,
            name: selectedContactToLink.name,
            mobile: selectedContactToLink.mobile,
            role: linkData.role,
            relationship: linkData.role === 'Property Owner' ? 'Owner' : linkData.relationship
        };

        // Append new owner to existing list instead of replacing or checking for duplicates here (duplicates filtered in search)
        setFormData(prev => ({
            ...prev,
            owners: [newOwner, ...prev.owners]
        }));

        setSelectedContactToLink(null);
        setLinkData({ role: 'Property Owner', relationship: '' });
        setOwnerSearch('');
    };

    const renderOwnerTab = () => (
        <div className="tab-content fade-in">
            {/* Search Section */}
            {!selectedContactToLink ? (
                <div style={sectionStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                        <div style={{ width: '40px', height: '40px', background: '#ecfdf5', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-user-plus" style={{ color: '#10b981' }}></i>
                        </div>
                        <div>
                            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>Add Property Owners</h4>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Search and link owners or associates to this property</p>
                        </div>
                    </div>

                    <div style={{ position: 'relative' }}>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <div style={{ flex: 1, position: 'relative' }}>
                                <i className="fas fa-search" style={{ position: 'absolute', left: '14px', top: '13px', color: '#94a3b8', fontSize: '0.9rem' }}></i>
                                <input
                                    style={{ ...inputStyle, paddingLeft: '40px', background: '#f8fafc' }}
                                    placeholder="Search by name or mobile number..."
                                    value={ownerSearch}
                                    onChange={(e) => {
                                        setOwnerSearch(e.target.value);
                                        setShowOwnerResults(true);
                                    }}
                                    onFocus={() => setShowOwnerResults(true)}
                                />
                            </div>
                        </div>

                        {showOwnerResults && filteredOwners.length > 0 && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', marginTop: '8px', zIndex: 100, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', maxHeight: '300px', overflowY: 'auto' }}>
                                {filteredOwners.map(contact => (
                                    <div
                                        key={contact.mobile}
                                        onClick={() => {
                                            setSelectedContactToLink(contact);
                                            setShowOwnerResults(false);
                                        }}
                                        style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '2px' }}
                                        className="hover:bg-slate-50"
                                    >
                                        <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9rem' }}>{contact.fullName || contact.name || `${contact.firstName} ${contact.lastName}`}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                            <i className="fas fa-phone-alt" style={{ marginRight: '6px' }}></i>
                                            {contact.phones?.[0]?.number || contact.mobile || 'No mobile'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div style={{ ...sectionStyle, border: '1.5px solid #3b82f6', background: '#eff6ff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px' }}>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <div style={{ width: '48px', height: '48px', background: '#fff', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', color: '#3b82f6', fontWeight: 700 }}>
                                {selectedContactToLink.name.charAt(0)}
                            </div>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>{selectedContactToLink.name}</h4>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>{selectedContactToLink.mobile}</p>
                            </div>
                        </div>
                        <button onClick={() => setSelectedContactToLink(null)} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                            <i className="fas fa-times"></i>
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <div>
                            <label style={labelStyle}>Role</label>
                            <select
                                style={{ ...customSelectStyle, background: '#fff' }}
                                value={linkData.role}
                                onChange={e => setLinkData({ ...linkData, role: e.target.value, relationship: '' })}
                            >
                                <option>Property Owner</option>
                                <option>Associate</option>
                            </select>
                        </div>
                        {linkData.role === 'Associate' && (
                            <div>
                                <label style={labelStyle}>Relationship to Owner</label>
                                <select
                                    style={{ ...customSelectStyle, background: '#fff' }}
                                    value={linkData.relationship}
                                    onChange={e => setLinkData({ ...linkData, relationship: e.target.value })}
                                >
                                    <option value="">Select Relationship</option>
                                    <option>Husband</option>
                                    <option>Wife</option>
                                    <option>Father</option>
                                    <option>Mother</option>
                                    <option>Brother</option>
                                    <option>Sister</option>
                                    <option>Son</option>
                                    <option>Daughter</option>
                                    <option>Partner</option>
                                    <option>Broker</option>
                                    <option>Other</option>
                                </select>
                            </div>
                        )}
                    </div>

                    <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            onClick={handleLinkOwner}
                            disabled={linkData.role === 'Associate' && !linkData.relationship}
                            style={{
                                ...buttonStyle.primary,
                                opacity: (linkData.role === 'Associate' && !linkData.relationship) ? 0.6 : 1,
                                cursor: (linkData.role === 'Associate' && !linkData.relationship) ? 'not-allowed' : 'pointer'
                            }}
                        >
                            Confirm & Add
                        </button>
                    </div>
                </div>
            )}

            {/* List of Added Owners */}
            {formData.owners.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Linked People</h4>
                    {formData.owners.map((owner, idx) => (
                        <div key={idx} style={{ background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '40px', height: '40px', background: owner.role === 'Property Owner' ? '#eff6ff' : '#fefce8', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: owner.role === 'Property Owner' ? '#3b82f6' : '#ca8a04', fontWeight: 700 }}>
                                    {owner.name.charAt(0)}
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1e293b' }}>{owner.name}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                        {owner.role === 'Property Owner' ? 'Owner' : `Associate (${owner.relationship})`} • {owner.mobile}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setFormData(prev => ({ ...prev, owners: prev.owners.filter((_, i) => i !== idx) }))}
                                style={{ width: '32px', height: '32px', borderRadius: '8px', border: 'none', background: '#fef2f2', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                <i className="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* System Assignment & Visibility */}
            <div style={{ ...sectionStyle, marginTop: '32px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fas fa-layer-group" style={{ color: '#6366f1' }}></i> System Assignment
                </h4>
                <div className="grid-3-col">
                    <div>
                        <label style={labelStyle}>Team</label>
                        <select
                            style={customSelectStyle}
                            value={formData.team}
                            onChange={e => {
                                const newTeam = e.target.value;
                                setFormData(prev => ({
                                    ...prev,
                                    team: newTeam,
                                    assignedTo: '' // Reset assigned user when team changes
                                }));
                            }}
                        >
                            <option value="">Select Team</option>
                            {teams?.map(team => (
                                <option key={team._id} value={team._id}>{team.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Assign</label>
                        <select
                            style={customSelectStyle}
                            value={formData.assignedTo}
                            onChange={e => handleInputChange('assignedTo', e.target.value)}
                        >
                            <option value="">Select Salesperson</option>
                            {users
                                .filter(user => !formData.team || (user.team && user.team === formData.team) || (user.team?._id === formData.team))
                                .map(user => (
                                    <option key={user._id || user.id} value={user._id || user.id}>{user.name}</option>
                                ))
                            }
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Visibility</label>
                        <select
                            style={customSelectStyle}
                            value={formData.visibleTo}
                            onChange={e => handleInputChange('visibleTo', e.target.value)}
                        >
                            <option value="Private">Private</option>
                            <option value="Team">Team</option>
                            <option value="Everyone">Everyone</option>
                        </select>
                    </div>
                </div>
                <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '12px', fontStyle: 'italic' }}>
                    <i className="fas fa-info-circle mr-1"></i> Assignment is derived automatically based on Project selection but can be manually overridden.
                </p>
            </div>
        </div>
    );


    const handleSave = async () => {
        setIsSaving(true);
        const toastId = toast.loading('Saving inventory...');

        try {
            // --- FIELD RULES ENGINE VALIDATION (ASYNC) ---
            if (validateAsync) {
                const validationResult = await validateAsync('inventory', formData);

                if (!validationResult.isValid) {
                    const errorMessages = Object.values(validationResult.errors).join(', ');
                    toast.error(`Validation Failed: ${errorMessages}`, { id: toastId });
                    setIsSaving(false);
                    return;
                }
            }

            // Sanitize payload: Strip File objects and empty fields
            const payload = { ...formData };

            // Ensure owners/associates only send IDs to backend
            if (payload.owners && Array.isArray(payload.owners)) {
                payload.owners = payload.owners.map(o => (typeof o === 'object' && o !== null) ? (o.id || o._id) : o).filter(Boolean);
            }

            // Clean up files which shouldn't be in JSON
            if (payload.inventoryDocuments) {
                payload.inventoryDocuments = await Promise.all(payload.inventoryDocuments.map(async (doc) => {
                    if (doc.file) {
                        try {
                            const uploadData = new FormData();
                            uploadData.append('file', doc.file);
                            const res = await api.post('/upload', uploadData, { headers: { 'Content-Type': 'multipart/form-data' } });
                            if (res.data && res.data.success) {
                                return { ...doc, url: res.data.url, file: null };
                            }
                        } catch (err) {
                            console.error("Document upload error:", err);
                        }
                    }
                    const { file, ...rest } = doc;
                    return rest;
                }));
            }
            if (payload.inventoryImages) {
                payload.inventoryImages = await Promise.all(payload.inventoryImages.map(async (img) => {
                    if (img.file) {
                        try {
                            const uploadData = new FormData();
                            uploadData.append('file', img.file);
                            const res = await api.post('/upload', uploadData, { headers: { 'Content-Type': 'multipart/form-data' } });
                            if (res.data && res.data.success) {
                                return { ...img, url: res.data.url, file: null };
                            }
                        } catch (err) {
                            console.error("Image upload error:", err);
                        }
                    }
                    const { file, ...rest } = img;
                    return rest;
                }));
            }
            if (payload.inventoryVideos) {
                payload.inventoryVideos = await Promise.all(payload.inventoryVideos.map(async (vid) => {
                    if (vid.file) {
                        try {
                            const uploadData = new FormData();
                            uploadData.append('file', vid.file);
                            const res = await api.post('/upload', uploadData, { headers: { 'Content-Type': 'multipart/form-data' } });
                            if (res.data && res.data.success) {
                                return { ...vid, url: res.data.url, file: null };
                            }
                        } catch (err) {
                            console.error("Video upload error:", err);
                        }
                    }
                    const { file, ...rest } = vid;
                    return rest;
                }));
            }

            // Transform names to IDs for Lookup fields
            const transformedData = {
                ...formData,
                category: getLookupId('Category', formData.category),
                subCategory: getLookupId('SubCategory', formData.subCategory),
                status: getLookupId('InventoryStatus', formData.status),
                intent: getLookupId('Intent', formData.intent),
                facing: getLookupId('Facing', formData.facing)
            };

            // Real API call
            let response;
            if (property && property._id) {
                response = await api.put(`/inventory/${property._id}`, transformedData);
            } else {
                response = await api.post('/inventory', transformedData);
            }

            if (!response.data || !response.data.success) {
                throw new Error(response.data?.error || 'Failed to save inventory');
            }

            const savedData = response.data.data;

            toast.success('Inventory Saved!', { id: toastId });

            // Fire Global Triggers
            if (property) {
                // Update
                fireEvent('inventory_updated', savedData, {
                    entityType: 'inventory',
                    previousEntity: property
                });
            } else {
                // New
                fireEvent('inventory_created', savedData, { entityType: 'inventory' });

                // Trigger lead matching search
                fireEvent('inventory_matching_requested', savedData, {
                    entityType: 'inventory',
                    recommendation_depth: 'high'
                });

                // Enroll linked Owners/Associates into Sequences
                if (formData.owners && formData.owners.length > 0) {
                    formData.owners.forEach(owner => {
                        // Use mobile as entityId for enrollment
                        evaluateAndEnroll(owner, 'contacts');
                    });
                }
            }

            onSave && onSave(savedData);
            onClose();

        } catch (error) {
            console.error("Save Error:", error);
            const errMsg = error.response?.data?.error || error.message || "Failed to save inventory";
            toast.error(errMsg, { id: toastId });
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)' }}>
            <div style={{ background: '#fff', width: '95%', maxWidth: '1200px', height: '90vh', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #e2e8f0' }} ref={modalRef} className="animate-slideIn">
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to right, #ffffff, #f8fafc)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '32px', height: '32px', background: '#eff6ff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <i className="fas fa-boxes" style={{ color: '#2563eb' }}></i>
                            </div>
                            {property ? 'Update Inventory' : 'Add Inventory'}
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
                            {activeTab === 'Unit' && renderUnitTab()}
                            {activeTab === 'Location' && renderLocationTab()}
                            {activeTab === 'Owner' && renderOwnerTab()}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

                    {/* Left: Cancel Button */}
                    <div>
                        <button onClick={onClose} style={buttonStyle.cancel}>Cancel</button>
                    </div>

                    {/* Right: Back + Next/Save */}
                    <div style={{ display: 'flex', gap: '12px' }}>
                        {activeTab !== 'Unit' && (
                            <button onClick={handlePrev} style={buttonStyle.secondary}>Back</button>
                        )}
                        {activeTab !== 'Owner' ? (
                            <button onClick={handleNext} style={buttonStyle.primary}>Next</button>
                        ) : (
                            <button
                                onClick={handleSave}
                                disabled={isSaving || isBlocked}
                                style={{
                                    ...buttonStyle.success,
                                    opacity: (isSaving || isBlocked) ? 0.7 : 1,
                                    cursor: (isSaving || isBlocked) ? 'not-allowed' : 'pointer',
                                    background: isBlocked ? '#94a3b8' : '#22c55e'
                                }}
                            >
                                {isSaving ? 'Saving...' : (property ? 'Update Inventory' : 'Save Inventory')}
                            </button>
                        )}
                    </div>
                </div>
                <AddSizeModal
                    isOpen={isAddSizeModalOpen}
                    projectName={formData.projectName}
                    block={formData.block}
                    category={formData.category}
                    subCategory={formData.subCategory}
                    onClose={() => setIsAddSizeModalOpen(false)}
                    onSave={(sizeName) => {
                        setFormData(prev => ({ ...prev, size: sizeName }));
                    }}
                />
                <style>{`
                 .grid-2-col { display: grid; grid-template-columns: repeat(2, 1fr); gap: 32px; }
                .grid-3-col { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; }
                .grid-4-col { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
                  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
                  @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                  .animate-slideIn { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
                  .fade-in { animation: fadeIn 0.3s ease-out; }
                  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            `}</style>
            </div>
        </div>
    );
};

export default AddInventoryModal;
