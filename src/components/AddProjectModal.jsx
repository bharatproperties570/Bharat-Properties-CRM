import React, { useState, useEffect, useRef, useMemo } from 'react';
import { PROPERTY_CATEGORIES } from '../constants/propertyConstants';
import { usePropertyConfig } from '../context/PropertyConfigContext';
import { renderValue } from '../utils/renderUtils';
import { useTheme } from '../context/ThemeContext';

import { useUserContext } from '../context/UserContext';
import AddressDetailsForm from './common/AddressDetailsForm';
import { api } from '../utils/api';
import toast from 'react-hot-toast';
import { useAddProjectMutation, useUpdateProjectMutation, useUsers, useTeams } from '../utils/crmHooks';

// --- Helper: Reusable MultiSelect Dropdown ---
const MultiSelect = ({ options = [], selected = [], onChange, placeholder = "Select...", isDark = false }) => {
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

    const safeSelected = Array.isArray(selected) ? selected : (selected ? [selected] : []);
    const safeOptions = Array.isArray(options) ? options : [];

    const toggleOption = (optionValue) => {
        const newSelected = safeSelected.includes(optionValue)
            ? safeSelected.filter(item => item !== optionValue)
            : [...safeSelected, optionValue];
        onChange && onChange(newSelected);
    };

    const getOptVal = (o) => {
        if (!o) return '';
        if (typeof o === 'object') return o.value ?? o.lookup_value ?? o.name ?? o.label ?? o._id ?? '';
        return String(o);
    };
    const getOptLabel = (o) => {
        if (!o) return '';
        if (typeof o === 'object') return o.label ?? o.lookup_value ?? o.name ?? o.value ?? '';
        return String(o);
    };

    const getLabel = (value) => {
        const strVal = getOptVal(value);
        const option = safeOptions.find(o => o && getOptVal(o) === strVal);
        return option ? getOptLabel(option) : getOptLabel(value);
    };

    return (
        <div ref={containerRef} style={{ position: 'relative' }}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    width: '100%', minHeight: '40px', padding: '6px 12px', borderRadius: '10px',
                    border: isDark ? '1.5px solid rgba(255, 255, 255, 0.12)' : '1.5px solid #e2e8f0',
                    fontSize: '0.86rem', color: isDark ? '#f1f5f9' : '#1e293b',
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#fff', boxSizing: 'border-box',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px',
                    backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2364748b%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
                    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '10px', paddingRight: '32px'
                }}
            >
                {safeSelected.length === 0 ? (
                    <span style={{ color: isDark ? '#64748b' : '#94a3b8' }}>{placeholder}</span>
                ) : (
                    safeSelected.map((val, idx) => {
                        const vKey = getOptVal(val) || idx;
                        return (
                            <span key={vKey} style={{
                                background: isDark ? 'rgba(59, 130, 246, 0.2)' : '#e0f2fe',
                                color: isDark ? '#60a5fa' : '#0284c7',
                                fontSize: '0.78rem', padding: '2px 8px', borderRadius: '8px',
                                fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px'
                            }}>
                                {getLabel(val)}
                                <i
                                    className="fas fa-times"
                                    style={{ cursor: 'pointer', fontSize: '0.75rem' }}
                                    onClick={(e) => { e.stopPropagation(); toggleOption(val); }}
                                ></i>
                            </span>
                        );
                    })
                )}
            </div>

            {isOpen && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px',
                    background: isDark ? '#1e293b' : '#fff',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #e2e8f0',
                    borderRadius: '10px', zIndex: 100, maxHeight: '200px', overflowY: 'auto',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.2)'
                }}>
                    {safeOptions.map((option, idx) => {
                        const val = getOptVal(option);
                        const label = getOptLabel(option);
                        return (
                            <div
                                key={val || idx}
                                onClick={() => toggleOption(val)}
                                style={{
                                    padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px',
                                    cursor: 'pointer', borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid #f1f5f9'
                                }}
                                onMouseOver={(e) => e.currentTarget.style.background = isDark ? 'rgba(255, 255, 255, 0.05)' : '#f8fafc'}
                                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                                <input
                                    type="checkbox"
                                    checked={safeSelected.map(getOptVal).includes(val)}
                                    readOnly
                                    style={{ width: '16px', height: '16px', accentColor: '#4f46e5', cursor: 'pointer' }}
                                />
                                <span style={{ fontSize: '0.86rem', color: isDark ? '#f1f5f9' : '#334155', fontWeight: 500 }}>{label}</span>
                            </div>
                        );
                    })}
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
    assign: [],
    team: [],

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
    zoneName: '',
    approvedBank: 'Punjab & Sind Bank',

    // System Details
    visibleTo: 'Team',
    owner: '',

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
    const { isDark } = useTheme();
    const {
        propertyConfig: propertyConfigFromContext,
        projectMasterFields: masterFieldsFromContext,
        projectAmenities,
        masterFields,
        lookups,
        getLookupId,
        getLookupValue: getLookupValueFromContext
    } = usePropertyConfig();
    const { data: usersData = [] } = useUsers();
    const { data: teamsData = [] } = useTeams();
    const [duplicateWarning, setDuplicateWarning] = useState(false);
    const [isBlocked, setIsBlocked] = useState(false);
    const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);

    const addMutation = useAddProjectMutation();
    const updateMutation = useUpdateProjectMutation();


    // Real-time Duplicate Check

    // Comprehensive State
    const [formData, setFormData] = useState(DEFAULT_FORM_DATA);

    const projectMasterFieldsSafe = masterFieldsFromContext || {};

    const isAgriculture = useMemo(() => {
        if (!formData.category) return false;
        if (Array.isArray(formData.category)) {
            return formData.category.some(cat => {
                const s = String(cat).toLowerCase();
                return s === 'agriculture' || s === 'agricultural';
            });
        }
        const s = String(formData.category).toLowerCase();
        return s === 'agriculture' || s === 'agricultural';
    }, [formData.category]);

    const hasNonAgriculture = useMemo(() => {
        if (!formData.category || formData.category.length === 0) return true;
        if (Array.isArray(formData.category)) {
            return formData.category.some(cat => {
                const s = String(cat).toLowerCase();
                return s !== 'agriculture' && s !== 'agricultural';
            });
        }
        const s = String(formData.category).toLowerCase();
        return s !== 'agriculture' && s !== 'agricultural';
    }, [formData.category]);


    const zoneOptions = useMemo(() => {
        if (masterFields && masterFields.zoneNames && masterFields.zoneNames.length > 0) {
            return masterFields.zoneNames;
        }
        if (projectMasterFieldsSafe && projectMasterFieldsSafe.zoneNames && projectMasterFieldsSafe.zoneNames.length > 0) {
            return projectMasterFieldsSafe.zoneNames;
        }
        if (lookups && lookups.ZoneName) {
            return lookups.ZoneName.map(l => l.lookup_value);
        }
        return [];
    }, [masterFields, projectMasterFieldsSafe, lookups]);

    const [companies, setCompanies] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState(initialTab || 'Basic');
    const [currentTime, setCurrentTime] = useState(new Date());
    const [amenityTab, setAmenityTab] = useState('Basic');
    const [amenitySearch, setAmenitySearch] = useState('');

    // Fetch Companies
    useEffect(() => {
        const fetchCompanies = async () => {
            try {
                const response = await api.get('/companies?limit=500');
                if (response.data && response.data.success) {
                    setCompanies(response.data.records || response.data.data || []);
                }
            } catch (error) {
                console.error("Failed to fetch companies:", error);
                toast.error("Failed to load developers list");
            }
        };
        if (isOpen) {
            fetchCompanies();
        }
    }, [isOpen]);

    // Helper: Fetch Address from Lat/Lng
    const fetchAddressFromCoordinates = (lat, lng) => {
        if (!window.google || !window.google.maps) return;
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: { lat, lng } }, async (results, status) => {
            if (status === "OK" && results[0]) {
                const place = results[0];
                let newStateName = '';
                let newCityName = '';
                let newZip = '';
                let newStreet = '';
                let newLocationName = '';

                place.address_components.forEach(component => {
                    const types = component.types;
                    if (types.includes('administrative_area_level_1')) newStateName = component.long_name;
                    if (types.includes('administrative_area_level_2') || types.includes('locality')) newCityName = component.long_name;
                    if (types.includes('postal_code')) newZip = component.long_name;
                    if (types.includes('sublocality') || types.includes('neighborhood')) newLocationName = component.long_name;
                    if (types.includes('route') || types.includes('street_number')) newStreet += component.long_name + ' ';
                });

                let resolvedCountryId = '';
                let resolvedStateId = '';
                let resolvedCityId = '';
                let resolvedLocId = '';

                try {
                    const countryRes = await api.get("/lookups?lookup_type=Country&limit=10");
                    const countryObj = (countryRes.data.data || []).find(c => c.lookup_value === 'India');
                    if (countryObj) {
                        resolvedCountryId = countryObj._id;
                        
                        if (newStateName) {
                            const stateRes = await api.get(`/lookups?lookup_type=State&parent_lookup_id=${resolvedCountryId}&limit=100`);
                            const stateObj = (stateRes.data.data || []).find(s => s.lookup_value.toLowerCase() === newStateName.toLowerCase());
                            if (stateObj) {
                                resolvedStateId = stateObj._id;

                                if (newCityName) {
                                    const cityRes = await api.get(`/lookups?lookup_type=City&parent_lookup_id=${resolvedStateId}&limit=100`);
                                    const cityObj = (cityRes.data.data || []).find(c => c.lookup_value.toLowerCase() === newCityName.toLowerCase());
                                    if (cityObj) {
                                        resolvedCityId = cityObj._id;

                                        if (newLocationName) {
                                            const locRes = await api.get(`/lookups?lookup_type=Location&parent_lookup_id=${resolvedCityId}&limit=200`);
                                            const locObj = (locRes.data.data || []).find(l => l.lookup_value.toLowerCase() === newLocationName.toLowerCase() || newLocationName.toLowerCase().includes(l.lookup_value.toLowerCase()));
                                            if (locObj) {
                                                resolvedLocId = locObj._id;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error("Error resolving address IDs:", err);
                }

                setFormData(prev => ({
                    ...prev,
                    locationSearch: place.formatted_address,
                    address: {
                        ...prev.address,
                        state: resolvedStateId || newStateName || prev.address.state,
                        city: resolvedCityId || newCityName || prev.address.city,
                        country: resolvedCountryId || 'India',
                        pincode: newZip || prev.address.pincode,
                        street: newStreet.trim() || prev.address.street,
                        location: resolvedLocId || newLocationName || prev.address.location
                    }
                }));
            }
        });
    };

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



    // Real-time Duplicate Check
    useEffect(() => {
        const checkDuplicate = async () => {
            if (formData.name && !projectToEdit) {
                setIsCheckingDuplicate(true);
                try {
                    const response = await api.post('duplication-rules/check', {
                        entityType: 'Project',
                        data: formData
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
    }, [formData, formData.name, formData.reraNumber, projectToEdit]);

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






    const modalRef = useRef(null);
    const searchInputRef = useRef(null);
    const mapRef = useRef(null);
    const googleMapRef = useRef(null);
    const markerRef = useRef(null);



    const categories = Object.keys(PROPERTY_CATEGORIES);

    // Dynamic Subcategories based on selected Categories (Uses dynamic config from context)
    const getSubCategories = () => {
        if (!formData.category || formData.category.length === 0) return [];

        const currentConfig = propertyConfigFromContext || projectMasterFieldsSafe?.propertyConfig || PROPERTY_CATEGORIES;
        let allSubCats = [];

        formData.category.forEach(cat => {
            const catConfig = currentConfig[cat];
            if (catConfig && catConfig.subCategories) {
                const subNames = catConfig.subCategories.map(sc => sc.name || sc);
                allSubCats = [...allSubCats, ...subNames];
            }
        });

        return [...new Set(allSubCats)]; // Unique subcategories
    };

    const subCategories = getSubCategories();
    // const categories = ['Residential', 'Commercial', 'Agricultural', 'Industrial', 'Institutional'];
    // const subCategories = ['Plot', 'House', 'Flat/Apartment', 'Builder Floor', 'Villa', 'Penthouse', 'SCO', 'Office Space', 'Shop'];

    // Fetch Teams & Users
    const teams = useMemo(() => {
        return Array.isArray(teamsData) ? teamsData : (teamsData?.data || []);
    }, [teamsData]);

    const users = useMemo(() => {
        return Array.isArray(usersData) ? usersData : (usersData?.data || []);
    }, [usersData]);

    const selectedTeamId = Array.isArray(formData.team)
        ? (formData.team[0] || '')
        : (formData.team || (Array.isArray(formData.teams) ? (formData.teams[0] || '') : ''));

    const selectedAssignId = Array.isArray(formData.assign)
        ? (formData.assign[0] || formData.owner || '')
        : (formData.assign || formData.owner || '');

    // Calculate User Options filtered by selected team
    const filteredUsers = useMemo(() => {
        if (!selectedTeamId) return users;
        const sTeam = String(selectedTeamId);
        return users.filter(u => {
            const userTeamId = (u?.team && typeof u.team === 'object') ? (u.team._id || u.team.id) : u?.team;
            if (userTeamId && String(userTeamId) === sTeam) return true;
            if (Array.isArray(u?.teams)) {
                return u.teams.some(t => {
                    const tid = (t && typeof t === 'object') ? (t._id || t.id) : t;
                    return String(tid) === sTeam;
                });
            }
            return false;
        });
    }, [users, selectedTeamId]);

    const displayUsers = useMemo(() => {
        if (!selectedAssignId) return filteredUsers;
        const exists = filteredUsers.some(u => String(u._id || u.id) === String(selectedAssignId));
        if (exists) return filteredUsers;
        const assignedUser = users.find(u => String(u._id || u.id) === String(selectedAssignId));
        return assignedUser ? [assignedUser, ...filteredUsers] : filteredUsers;
    }, [filteredUsers, users, selectedAssignId]);


    const getLookupValue = (field) => {
        if (!field) return '';
        if (typeof field === 'object' && field.lookup_value) return field.lookup_value;
        if (typeof field === 'string') return field;
        return String(field);
    };

    const developers = (Array.isArray(companies) ? companies : [])
        .filter(c => {
            const typeValue = getLookupValue(c.companyType || c.type || c.company_type);
            const industryValue = getLookupValue(c.industry || c.category);

            // Filter by "Private Ltd", "Public Ltd" and "Real Estate"
            const typeMatch = [
                'private ltd', 'pvt ltd', 'private limited',
                'public ltd', 'public limited'
            ].includes(typeValue.toLowerCase());
            const industryMatch = industryValue.toLowerCase() === 'real estate';

            return typeMatch && industryMatch;
        })
        .map(c => c.name)
        .filter(Boolean)
        .sort();

    // Cascading Address Logic handled by AddressDetailsForm

    useEffect(() => {
        if (isOpen) {
            setIsLoading(true);
            setTimeout(() => {
                setIsLoading(false);
            }, 10);
            document.body.style.overflow = 'hidden';

            if (projectToEdit) {
                try {
                    // Normalize Blocks: Ensure they are objects { name: '...' }
                    let normalizedBlocks = projectToEdit.blocks || [];
                    if (normalizedBlocks.length > 0 && typeof normalizedBlocks[0] === 'string') {
                        normalizedBlocks = normalizedBlocks.map(b => ({ name: b }));
                    }

                    // Normalize Categories: Split legacy 'category' into 'category' and 'subCategory'
                    let normalizedCategory = projectToEdit.category || [];
                    if (!Array.isArray(normalizedCategory)) normalizedCategory = [normalizedCategory].filter(Boolean);
                    
                    let normalizedSubCategory = projectToEdit.subCategory || [];
                    if (!Array.isArray(normalizedSubCategory)) normalizedSubCategory = [normalizedSubCategory].filter(Boolean);

                    if (normalizedSubCategory.length === 0 && normalizedCategory.length > 0) {
                        const mainCategories = ['Residential', 'Commercial', 'Agricultural', 'Industrial', 'Institutional'];
                        const actualCategories = normalizedCategory.filter(c => mainCategories.includes(c));
                        const actualSubCategories = normalizedCategory.filter(c => !mainCategories.includes(c));

                        // If we found split, use it. Otherwise keep as is (safer).
                        if (actualCategories.length > 0 || actualSubCategories.length > 0) {
                            normalizedCategory = actualCategories;
                            normalizedSubCategory = actualSubCategories;
                        }
                    }

                    // Helper to ensure we get a string value from a lookup or object
                    const safeString = (type, val) => {
                        if (!val) return '';
                        if (typeof val === 'string') return val;
                        try {
                            const result = getLookupValueFromContext ? getLookupValueFromContext(type, val) : null;
                            if (result && typeof result === 'object') {
                                return result.lookup_value || result.name || result.label || result.value || String(result);
                            }
                            if (result && typeof result === 'string') return result;
                            if (typeof val === 'object') {
                                return val.lookup_value || val.name || val.label || val.value || val._id || val.id || String(val);
                            }
                        } catch (e) {
                            console.warn("safeString lookup error:", e);
                        }
                        return String(val || '');
                    };

                    const toArray = (val) => {
                        if (!val) return [];
                        if (Array.isArray(val)) return val;
                        return [val];
                    };

                    const catArr = toArray(projectToEdit.category)
                        .map(c => safeString('Category', c)).filter(v => v && typeof v === 'string');
                    const subCatArr = toArray(projectToEdit.subCategory)
                        .map(s => safeString('SubCategory', s)).filter(v => v && typeof v === 'string');

                    setFormData(() => ({
                        ...DEFAULT_FORM_DATA, // Use defaults for missing fields
                        ...projectToEdit,
                        category: catArr.length > 0 ? catArr : ['Residential'],
                        subCategory: subCatArr,
                        status: safeString('ProjectStatus', projectToEdit.status),
                        parkingType: safeString('ParkingType', projectToEdit.parkingType),
                        zoneName: safeString('ZoneName', projectToEdit.zoneName) || projectToEdit.zoneName || '',
                        blocks: normalizedBlocks.map(b => ({
                            ...(typeof b === 'object' ? b : { name: String(b) }),
                            name: (b && typeof b === 'object') ? (b.name || '') : String(b || '')
                        })),
                        assign: (Array.isArray(projectToEdit.assign) ? projectToEdit.assign : [])
                            .map(u => (u && typeof u === 'object') ? (u._id || u.id) : u).filter(Boolean),
                        team: (Array.isArray(projectToEdit.team) && projectToEdit.team.length ? projectToEdit.team : (Array.isArray(projectToEdit.teams) ? projectToEdit.teams : []))
                            .map(t => (t && typeof t === 'object') ? (t._id || t.id) : t).filter(Boolean),
                        visibleTo: (projectToEdit.visibleTo === 'All Users' || projectToEdit.visibleTo === 'Public') ? 'Everyone' : (projectToEdit.visibleTo || 'Team'),
                        owner: (projectToEdit.owner && typeof projectToEdit.owner === 'object') ? (projectToEdit.owner._id || projectToEdit.owner.id) : (projectToEdit.owner || '')
                    }));
                } catch (err) {
                    console.error("Critical error mapping project to edit form:", err, projectToEdit);
                    setFormData({ ...DEFAULT_FORM_DATA, ...projectToEdit });
                }
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
    }, [isOpen, projectToEdit, initialTab, getLookupValueFromContext]);

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
    }, [isOpen, activeTab, formData.latitude, formData.longitude]);

    const handleAmenityChange = (name) => {
        setFormData(prev => ({
            ...prev, amenities: { ...prev.amenities, [name]: !prev.amenities[name] }
        }));
    };

    const onAddressChange = React.useCallback((newAddress) => {
        setFormData(prev => ({ ...prev, address: newAddress }));
    }, []);

    const toggleAllAmenities = (list) => {
        const allSelected = list.every(a => formData.amenities[a]);
        const newAmenities = { ...formData.amenities };
        list.forEach(a => { newAmenities[a] = !allSelected; });
        setFormData(prev => ({ ...prev, amenities: newAmenities }));
    };

    const TABS = [
        { id: 'Basic', label: 'Basic Info', icon: 'fas fa-info-circle', color: '#3b82f6' },
        { id: 'Location', label: 'Location & Map', icon: 'fas fa-map-marker-alt', color: '#10b981' },
        { id: 'Block', label: 'Blocks & Towers', icon: 'fas fa-cubes', color: '#8b5cf6' },
        { id: 'Amenities', label: 'Amenities', icon: 'fas fa-wifi', color: '#f59e0b' }
    ];

    const handleNext = () => {
        const currentIndex = TABS.findIndex(t => t.id === activeTab);
        if (currentIndex < TABS.length - 1) {
            setActiveTab(TABS[currentIndex + 1].id);
        }
    };

    const handlePrev = () => {
        const currentIndex = TABS.findIndex(t => t.id === activeTab);
        if (currentIndex > 0) {
            setActiveTab(TABS[currentIndex - 1].id);
        }
    };

    const handleSave = async () => {
        const toastId = toast.loading(projectToEdit ? 'Updating project...' : 'Creating project...');
        try {
            // Transform names to IDs for Lookup fields and synchronize RBAC fields
            const safeTeamArray = Array.isArray(formData.team) ? formData.team : (formData.team ? [formData.team] : []);
            const safeAssignArray = Array.isArray(formData.assign) ? formData.assign : (formData.assign ? [formData.assign] : (formData.owner ? [formData.owner] : []));
            const primaryOwner = safeAssignArray[0] || formData.owner || undefined;
            const transformedData = {
                ...formData,
                team: safeTeamArray,
                teams: safeTeamArray,
                assign: safeAssignArray,
                owner: primaryOwner,
                visibleTo: (formData.visibleTo === 'All Users' || formData.visibleTo === 'Public') ? 'Everyone' : (formData.visibleTo || 'Team'),
                category: formData.category.map(c => getLookupId('Category', c)).filter(Boolean),
                subCategory: formData.subCategory.map(s => getLookupId('SubCategory', s)).filter(Boolean),
                status: getLookupId('ProjectStatus', formData.status) || formData.status,
                parkingType: getLookupId('ParkingType', formData.parkingType) || formData.parkingType,
                zoneName: getLookupId('ZoneName', formData.zoneName) || formData.zoneName
            };

            
            let response;
            if (projectToEdit && projectToEdit._id) {
                response = await updateMutation.mutateAsync({ id: projectToEdit._id, data: transformedData });
            } else {
                response = await addMutation.mutateAsync(transformedData);
            }

            if (response && response.success) {
                toast.success(projectToEdit ? 'Project updated!' : 'Project created!', { id: toastId });
                onSave && onSave(response.data);
                onClose();
            } else {
                throw new Error(response?.error || 'Failed to save project');
            }

        } catch (error) {
            console.error("Save Error:", error);
            const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message || "Failed to save project";
            toast.error(errorMsg, { id: toastId });
        }
    };

    if (!isOpen) return null;

    const buttonStyle = {
        cancel: {
            padding: '9px 20px', borderRadius: '10px',
            border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1',
            background: isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
            color: isDark ? '#cbd5e1' : '#475569',
            fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer', transition: 'all 0.15s'
        },
        secondary: {
            padding: '9px 20px', borderRadius: '10px',
            border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1.5px solid #e2e8f0',
            background: isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
            color: isDark ? '#cbd5e1' : '#475569',
            fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer', transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', gap: '6px'
        },
        primary: {
            padding: '9px 22px', borderRadius: '10px', border: 'none',
            background: isDark ? 'rgba(99, 102, 241, 0.2)' : '#eff6ff',
            color: isDark ? '#818cf8' : '#4f46e5',
            fontWeight: 800, fontSize: '0.84rem', cursor: 'pointer', transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', gap: '6px'
        },
        success: {
            padding: '9px 24px', borderRadius: '10px', border: 'none',
            background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
            color: '#ffffff', fontWeight: 800, fontSize: '0.84rem', cursor: 'pointer',
            transition: 'all 0.15s', boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
            display: 'flex', alignItems: 'center', gap: '6px'
        }
    };

    // --- Enterprise Broadcast Design System Constants ---
    const labelStyle = {
        fontSize: '0.71rem', fontWeight: 800,
        color: isDark ? '#94a3b8' : '#64748b',
        marginBottom: '6px', display: 'block',
        textTransform: 'uppercase', letterSpacing: '0.45px'
    };
    const inputStyle = {
        width: '100%', padding: '9px 12px', borderRadius: '10px',
        border: isDark ? '1.5px solid rgba(255, 255, 255, 0.12)' : '1.5px solid #e2e8f0',
        fontSize: '0.84rem', fontWeight: 500, outline: 'none',
        color: isDark ? '#f1f5f9' : '#1e293b', transition: 'all 0.15s ease',
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#ffffff',
        height: '40px', boxSizing: 'border-box'
    };
    const customSelectStyle = {
        ...inputStyle,
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        appearance: 'none',
        WebkitAppearance: 'none',
        MozAppearance: 'none',
        backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2364748b%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
        backgroundSize: '10px', paddingRight: '32px', cursor: 'pointer'
    };

    const sectionStyle = {
        background: isDark ? '#1e293b' : '#ffffff',
        padding: '20px 24px', borderRadius: '16px',
        border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
        boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.03)',
        marginBottom: '20px'
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
                        <input
                            style={{ ...inputStyle, borderColor: duplicateWarning ? '#ef4444' : '#e2e8f0' }}
                            placeholder="e.g. Green Valley Heights"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
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
                                        A project with this name or RERA number already exists!
                                    </p>
                                </div>
                            </div>
                        )}
                        {isCheckingDuplicate && <p style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '6px' }}>Checking for duplicates...</p>}
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
                            isDark={isDark}
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>Sub Category (Multi-Select)</label>
                        <MultiSelect
                            options={subCategories}
                            selected={formData.subCategory}
                            onChange={(val) => setFormData({ ...formData, subCategory: val })}
                            placeholder="Select Sub Categories"
                            isDark={isDark}
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
                                <option>Marla</option>
                                <option>Kanal</option>
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
                    {hasNonAgriculture && (
                        <div>
                            <label style={labelStyle}>Total Floors</label>
                            <select style={customSelectStyle} value={formData.totalFloors} onChange={e => setFormData({ ...formData, totalFloors: e.target.value })}>
                                {[0, 1, 2, 3, 4, 5, 10, 15, 20, 30, 50].map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </div>
                    )}
                    <div>
                        <label style={labelStyle}>Total Units</label>
                        <select style={customSelectStyle} value={formData.totalUnits} onChange={e => setFormData({ ...formData, totalUnits: e.target.value })}>
                            {[0, 10, 50, 100, 200, 500, 1000].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                    </div>
                    {isAgriculture && (
                        <div>
                            <label style={labelStyle}>Zone</label>
                            <select style={customSelectStyle} value={formData.zoneName || ''} onChange={e => setFormData({ ...formData, zoneName: e.target.value })}>
                                <option value="">---Select Zone---</option>
                                {zoneOptions.map(zone => (
                                    <option key={typeof zone === 'object' ? (zone._id || zone.id) : zone} value={typeof zone === 'object' ? (zone._id || zone.id) : zone}>
                                        {renderValue(zone)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {hasNonAgriculture && (
                    <div className="grid-2-col gap-24 mt-24">
                        <div>
                            <label style={labelStyle}>Current Status</label>
                            <select style={customSelectStyle} value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                                <option value="">---Select Status---</option>
                                {(projectMasterFieldsSafe.projectStatuses || []).map(status => (
                                    <option key={typeof status === 'object' ? (status._id || status.id) : status} value={typeof status === 'object' ? (status._id || status.id) : status}>
                                        {renderValue(status)}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Parking Type</label>
                            <select style={customSelectStyle} value={formData.parkingType} onChange={e => setFormData({ ...formData, parkingType: e.target.value })}>
                                <option value="">---Select Parking---</option>
                                {(projectMasterFieldsSafe.parkingTypes || []).map(type => (
                                    <option key={typeof type === 'object' ? (type._id || type.id) : type} value={typeof type === 'object' ? (type._id || type.id) : type}>
                                        {renderValue(type)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}
            </div>

            {/* Timeline */}
            {hasNonAgriculture && (
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
            )}

            {/* System Details */}
            <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f8fafc', padding: '24px', borderRadius: '16px', border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0', marginBottom: '24px' }}>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: isDark ? '#f8fafc' : '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fas fa-layer-group" style={{ color: '#10b981' }}></i> System Assignment
                </h4>
                <div className="grid-3-col gap-24">
                    <div>
                        <label style={labelStyle}>Team</label>
                        <select
                            style={customSelectStyle}
                            value={selectedTeamId}
                            onChange={e => {
                                const newTeam = e.target.value;
                                setFormData(prev => ({
                                    ...prev,
                                    team: newTeam ? [newTeam] : [],
                                    teams: newTeam ? [newTeam] : [],
                                    assign: [],
                                    owner: ''
                                }));
                            }}
                        >
                            <option value="">Select Team</option>
                            {teams.map(t => (
                                <option key={t._id || t.id} value={t._id || t.id}>
                                    {t.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Assign</label>
                        <select
                            style={customSelectStyle}
                            value={selectedAssignId}
                            onChange={e => {
                                const newAssign = e.target.value;
                                setFormData(prev => ({
                                    ...prev,
                                    assign: newAssign ? [newAssign] : [],
                                    owner: newAssign || ''
                                }));
                            }}
                        >
                            <option value="">Select User</option>
                            {displayUsers.map(u => (
                                <option key={u._id || u.id} value={u._id || u.id}>
                                    {u.fullName || u.name || u.email}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Visibility</label>
                        <select
                            style={customSelectStyle}
                            value={formData.visibleTo || 'Team'}
                            onChange={e => setFormData(prev => ({ ...prev, visibleTo: e.target.value }))}
                        >
                            <option value="">Select Visibility</option>
                            <option value="Private">Private</option>
                            <option value="Team">Team</option>
                            <option value="Everyone">Everyone</option>
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
                    onChange={onAddressChange}
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
                                            <option key={typeof status === 'object' ? (status._id || status.id) : status} value={typeof status === 'object' ? (status._id || status.id) : status}>
                                                {renderValue(status)}
                                            </option>
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
                                        {(projectMasterFieldsSafe.parkingTypes || []).map((type, idx) => {
                                            const tVal = renderValue(type);
                                            return (
                                                <option key={tVal || idx} value={tVal}>{tVal}</option>
                                            );
                                        })}
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
                                        <b style={{ fontSize: '0.9rem' }}>{(renderValue(block.name) || 'B').charAt(0)}</b>
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>{renderValue(block.name)}</div>
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
                                        <i className="fas fa-parking" style={{ marginRight: '6px' }}></i> {renderValue(block.parkingType)}
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
                                        background: renderValue(block.status) === 'Completed' ? '#dcfce7' : renderValue(block.status) === 'In Progress' ? '#fef9c3' : '#f1f5f9',
                                        color: renderValue(block.status) === 'Completed' ? '#166534' : renderValue(block.status) === 'In Progress' ? '#854d0e' : '#475569'
                                    }}>
                                        {renderValue(block.status)}
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.65)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(8px)', padding: '16px' }} onClick={onClose}>
            <div style={{
                background: isDark ? '#0f172a' : '#ffffff',
                width: '96%', maxWidth: '1160px', height: '90vh', maxHeight: '90vh',
                borderRadius: '18px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0'
            }} ref={modalRef} className="animate-slideIn" onClick={e => e.stopPropagation()}>

                {/* Header aligned with Enterprise Hub design */}
                <div style={{
                    padding: '18px 24px',
                    borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #f1f5f9',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: isDark ? 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)' : 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
                    flexShrink: 0
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{
                            width: '44px', height: '44px', borderRadius: '12px',
                            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(79, 70, 229, 0.35)', color: '#fff',
                            flexShrink: 0
                        }}>
                            <i className="fas fa-building" style={{ fontSize: '18px' }}></i>
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a', margin: 0, letterSpacing: '-0.01em' }}>
                                    {projectToEdit ? 'Update Project' : 'Create New Project'}
                                </h2>
                                <span style={{
                                    fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px',
                                    background: projectToEdit ? (isDark ? 'rgba(245, 158, 11, 0.2)' : '#fef3c7') : (isDark ? 'rgba(99, 102, 241, 0.2)' : '#e0e7ff'),
                                    color: projectToEdit ? '#f59e0b' : '#6366f1',
                                    border: projectToEdit ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(99, 102, 241, 0.3)'
                                }}>
                                    {projectToEdit ? 'EDIT MODE' : 'NEW RECORD'}
                                </span>
                                {formData.name && (
                                    <span style={{
                                        fontSize: '0.72rem', fontWeight: 700,
                                        color: isDark ? '#93c5fd' : '#2563eb',
                                        background: isDark ? 'rgba(37,99,235,0.15)' : '#eff6ff',
                                        padding: '2px 8px', borderRadius: '6px', border: '1px solid #bfdbfe'
                                    }}>
                                        {renderValue(formData.name)}
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.73rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600, marginTop: '3px' }}>
                                <i className="far fa-clock" style={{ color: '#6366f1', fontSize: '11px' }}></i>
                                <span>{currentTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                                <span style={{ opacity: 0.4 }}>•</span>
                                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: isDark ? '#e2e8f0' : '#1e293b' }}>
                                    {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                                </span>
                                <span style={{ opacity: 0.3 }}>•</span>
                                <span>Master Project Database</span>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                width: '36px', height: '36px', borderRadius: '10px',
                                border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0',
                                background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f8fafc',
                                color: isDark ? '#94a3b8' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', transition: 'all 0.15s ease', fontSize: '14px'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = isDark ? '#94a3b8' : '#64748b'; }}
                            title="Close"
                        >
                            <i className="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                {/* Tab Navigation Bar - Enterprise Pill Design */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 24px',
                    background: isDark ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc',
                    borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid #e2e8f0',
                    overflowX: 'auto', flexShrink: 0
                }} className="no-scrollbar">
                    {TABS.map(tab => {
                        const active = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px',
                                    borderRadius: '10px', border: 'none',
                                    background: active ? (isDark ? 'rgba(99, 102, 241, 0.2)' : '#ffffff') : 'transparent',
                                    color: active ? (isDark ? '#818cf8' : '#4f46e5') : (isDark ? '#94a3b8' : '#64748b'),
                                    boxShadow: active ? (isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.08)') : 'none',
                                    fontWeight: active ? 800 : 600, fontSize: '0.82rem', cursor: 'pointer',
                                    whiteSpace: 'nowrap', transition: 'all 0.15s ease'
                                }}
                            >
                                <i className={tab.icon} style={{ color: active ? tab.color : 'inherit', fontSize: '13px' }}></i>
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Body */}
                <div className="no-scrollbar" style={{
                    flex: 1, overflowY: 'auto',
                    background: isDark ? '#0b1329' : '#f8fafc',
                    padding: '24px', scrollbarWidth: 'none', msOverflowStyle: 'none'
                }}>
                    {isLoading ? (
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ height: '120px', background: isDark ? 'rgba(255,255,255,0.05)' : '#e2e8f0', borderRadius: '12px', animation: 'pulse 1.5s infinite' }}></div>
                        </div>
                    ) : (
                        <div style={{ width: '100%', margin: '0 auto' }}>
                            {activeTab === 'Basic' && renderBasicTab()}
                            {activeTab === 'Location' && renderLocationTab()}
                            {activeTab === 'Block' && renderBlockTab()}
                            {activeTab === 'Amenities' && renderAmenitiesTab()}
                            {!['Basic', 'Location', 'Block', 'Amenities'].includes(activeTab) && (
                                <div style={{ textAlign: 'center', padding: '60px 0', color: isDark ? '#64748b' : '#94a3b8' }}>
                                    <i className="fas fa-tools" style={{ fontSize: '3rem', marginBottom: '16px', color: isDark ? '#334155' : '#cbd5e1' }}></i>
                                    <p>Section <b>{activeTab}</b> is under development.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer fixed at bottom */}
                <div style={{
                    padding: '14px 24px',
                    borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #f1f5f9',
                    background: isDark ? '#0f172a' : '#ffffff',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {formData.name && (
                            <span style={{ fontSize: '0.76rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>
                                <i className="fas fa-check-circle" style={{ color: '#10b981', marginRight: '6px' }}></i>
                                {formData.name} {formData.category?.length ? `• ${Array.isArray(formData.category) ? formData.category.join(', ') : formData.category}` : ''}
                            </span>
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button type="button" onClick={onClose} style={buttonStyle.cancel}>Cancel</button>

                        {activeTab !== 'Basic' && (
                            <button type="button" onClick={handlePrev} style={buttonStyle.secondary}>
                                <i className="fas fa-arrow-left" style={{ marginRight: '6px' }}></i>
                                Previous
                            </button>
                        )}

                        {activeTab !== 'Amenities' ? (
                            <button type="button" onClick={handleNext} style={buttonStyle.primary}>
                                Next
                                <i className="fas fa-arrow-right" style={{ marginLeft: '6px' }}></i>
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={isBlocked}
                                style={{
                                    ...buttonStyle.success,
                                    opacity: isBlocked ? 0.7 : 1,
                                    cursor: isBlocked ? 'not-allowed' : 'pointer'
                                }}
                            >
                                <i className="fas fa-check" style={{ marginRight: '6px' }}></i>
                                {projectToEdit ? 'Update Project' : 'Create Project'}
                            </button>
                        )}
                    </div>
                </div>

                <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
                .no-scrollbar { -ms-overflow-style: none !important; scrollbar-width: none !important; }
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
