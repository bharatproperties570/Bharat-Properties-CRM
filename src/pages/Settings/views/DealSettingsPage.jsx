import { useState, useEffect, useCallback } from 'react';
import { api, lookupsAPI } from '../../../utils/api';
import toast from 'react-hot-toast';
import CreateGlobalConfigModal from '../../../components/CreateGlobalConfigModal';
import { PROPERTY_CATEGORIES, ROAD_WIDTH_OPTIONS } from '../../../constants/propertyConstants';

// --- Helper Components ---
const LiveClock = () => {
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#64748b', background: '#f8fafc', padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <i className="fas fa-calendar-alt" style={{ color: '#94a3b8' }}></i>
            <span>{time.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            <span style={{ width: '1px', height: '12px', background: '#cbd5e1', margin: '0 4px' }}></span>
            <i className="fas fa-clock" style={{ color: '#94a3b8' }}></i>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>
    );
};

const DealSettingsPage = () => {
    // Modes: 'list', 'add'
    const [viewMode, setViewMode] = useState('list');

    // --- State ---

    const [saving, setSaving] = useState(false);
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

    // Global Config State
    const [config, setConfig] = useState({
        stampDutyMale: 7,
        stampDutyFemale: 5,
        stampDutyJoint: 6,
        registrationPercent: 1,
        registrationMode: 'percent', // 'percent' or 'slab'
        registrationSlabs: [],
        legalFees: 15000,
        brokeragePercent: 1,
        coveredAreaPriceSqYds: 0,
        coveredAreaPriceSqFt: 0,
        useCollectorRateDefault: true
    });

    const [activeTab, setActiveTab] = useState('collector'); // 'collector' or 'global'
    const [registrationCharges, setRegistrationCharges] = useState([]);

    // Collector Rate Data State (for Form)
    const [rateForm, setRateForm] = useState({
        state: '',
        district: '',
        tehsil: '',
        location: '',
        category: '',
        subCategory: '',
        rate: '',
        rateApplyOn: 'Land Area',
        rateUnit: 'Sq Yard',
        roadMultipliers: [], // [{ roadType: '', multiplier: 0 }]
        floorMultipliers: [], // [{ floorType: '', multiplier: 0 }]
        effectiveFrom: '',
        effectiveTo: '',
        versionNo: '',
        configName: '',
        constructionRateSqFt: '',
        constructionRateSqYard: '',
        queuedRates: [] // To store multiple configurations before saving
    });

    const [collectorRates, setCollectorRates] = useState([]);

    // Lookups
    const [states, setStates] = useState([]);
    const [districts, setDistricts] = useState([]);
    const [tehsils, setTehsils] = useState([]);
    const [locations, setLocations] = useState([]);

    // Pagination & Search States
    const [collectorSearch, setCollectorSearch] = useState('');
    const [collectorPagination, setCollectorPagination] = useState({ page: 1, limit: 10, totalPages: 1, totalDocs: 0 });

    const [registrationSearch, setRegistrationSearch] = useState(''); // Renamed from globalSearch
    const [registrationPagination, setRegistrationPagination] = useState({ page: 1, limit: 10, totalDocs: 0, totalPages: 1 }); // Renamed from globalPagination

    // --- Advanced Filtering State ---
    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
    const [collectorFilters, setCollectorFilters] = useState({
        state: '',
        district: '',
        tehsil: '',
        location: '',
        category: '',
        subCategory: ''
    });
    const [registrationFilters, setRegistrationFilters] = useState({ // Renamed from globalFilters
        configName: ''
    });



    // --- Fetch Data ---
    const fetchData = useCallback(async () => {
        try {
            // 1. Fetch Collector Rates
            const rateParams = new URLSearchParams({
                page: collectorPagination.page,
                limit: collectorPagination.limit,
                search: collectorSearch,
                ...collectorFilters
            });
            const ratesRes = await api.get(`/collector-rates?${rateParams.toString()}`);
            console.log("Collector Rates Response:", ratesRes);

            if (ratesRes.data?.status === 'success') {
                const result = ratesRes.data.data;
                setCollectorRates(result.docs || []);
                setCollectorPagination(prev => ({
                    ...prev,
                    totalPages: result.totalPages || 1,
                    totalDocs: result.totalDocs || 0
                }));
            } else {
                console.error("Collector Rates API failed:", ratesRes);
                toast.error("Failed to load Collector Rates: " + (ratesRes.data?.message || "Unknown error"));
            }

            // 2. Fetch Registration Charges (formerly Global Settings)
            const globalRes = await api.get('/system-settings', {
                params: {
                    category: 'govt_charges_config',
                    search: registrationSearch,
                    page: registrationPagination.page,
                    limit: registrationPagination.limit,
                    configName: registrationFilters.configName
                }
            });
            if (globalRes.data?.status === "success" || globalRes.data?.success) {
                const result = globalRes.data.data || globalRes.data;
                setRegistrationCharges(Array.isArray(result.docs) ? result.docs : (Array.isArray(result) ? result : []));
                setRegistrationPagination(prev => ({
                    ...prev,
                    totalDocs: result.totalDocs || 0,
                    totalPages: result.totalPages || 1
                }));
            } else {
                console.error("Registration Charges API failed:", globalRes);
                toast.error("Failed to load Registration Charges: " + (globalRes.data?.message || "Unknown error"));
            }


        } catch (error) {
            console.error("DealSettingsPage Error:", error);
            console.error("Error Details:", error.response || error.message);
            toast.error("Failed to load settings: " + (error.response?.data?.message || error.message));
        }
    }, [collectorPagination.page, collectorPagination.limit, collectorSearch, collectorFilters, registrationPagination.page, registrationPagination.limit, registrationSearch, registrationFilters]);

    // Initial Load & States
    useEffect(() => {
        fetchData();
        fetchStates();
    }, [fetchData]);

    const fetchStates = async () => {
        try {
            const res = await lookupsAPI.getStates();
            if (res.status === 'success') setStates(res.data);
        } catch (e) { console.error(e); }
    };

    // Dependent Lookups for Form & Filters
    useEffect(() => {
        const stateId = rateForm.state || collectorFilters.state;
        if (stateId) {
            fetchDistricts(stateId);
        } else {
            setDistricts([]);
            setTehsils([]);
            setLocations([]);
        }
    }, [rateForm.state, collectorFilters.state]);

    useEffect(() => {
        const districtId = rateForm.district || collectorFilters.district;
        if (districtId) {
            fetchTehsilsAndLocations(districtId);
        } else {
            setTehsils([]);
            setLocations([]);
        }
    }, [rateForm.district, collectorFilters.district]);

    // Search & Pagination Logic
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchData();
        }, 500);
        return () => clearTimeout(timer);
    }, [fetchData, collectorPagination.page, collectorPagination.limit, registrationPagination.page, registrationPagination.limit, collectorSearch, registrationSearch, collectorFilters, registrationFilters]);

    // --- Filter Handlers ---
    const handleCollectorFilterChange = (field, value) => {
        setCollectorFilters(prev => ({ ...prev, [field]: value }));
        setCollectorPagination(prev => ({ ...prev, page: 1 }));
    };

    const handleRegistrationFilterChange = (field, value) => { // Renamed from handleGlobalFilterChange
        setRegistrationFilters(prev => ({ ...prev, [field]: value }));
        setRegistrationPagination(prev => ({ ...prev, page: 1 }));
    };

    const clearFilters = () => {
        if (activeTab === 'collector') {
            setCollectorFilters({ state: '', district: '', tehsil: '', location: '', category: '', subCategory: '' });
            setCollectorSearch('');
        } else {
            setRegistrationFilters({ configName: '' }); // Renamed from globalFilters
            setRegistrationSearch(''); // Renamed from globalSearch
        }
        setIsFilterPanelOpen(false);
    };

    // Reset page on search or tab change
    useEffect(() => {
        setCollectorPagination(prev => ({ ...prev, page: 1 }));
    }, [collectorSearch]);

    useEffect(() => {
        setRegistrationPagination(prev => ({ ...prev, page: 1 })); // Renamed from setGlobalPagination
    }, [registrationSearch]); // Renamed from globalSearch

    const fetchDistricts = async (stateId) => {
        try {
            const res = await lookupsAPI.getCities(stateId);
            if (res.status === 'success') setDistricts(res.data);
        } catch (e) { console.error(e); }
    };

    const fetchTehsilsAndLocations = async (cityId) => {
        try {
            const res = await lookupsAPI.getLocations(cityId);
            if (res.status === 'success') {
                const fetched = res.data || [];
                setTehsils(fetched.filter(i => i.lookup_type === 'Tehsil'));
                setLocations(fetched.filter(i => i.lookup_type === 'Location'));
            }
        } catch (e) { console.error(e); }
    };

    // --- Handlers ---
    const handleRateChange = (field, value) => {
        setRateForm(prev => {
            const updated = { ...prev, [field]: value };

            // Auto-selection Logic
            if (field === 'subCategory' || field === 'category') {
                const cat = field === 'category' ? value : prev.category;
                const sub = field === 'subCategory' ? value : prev.subCategory;

                if (cat === 'Agricultural' && sub === 'Land') {
                    updated.rateApplyOn = 'Land Area';
                    updated.rateUnit = 'Acre';
                } else if (sub.includes('Plot')) {
                    updated.rateApplyOn = 'Land Area';
                    updated.rateUnit = 'Sq Yard';
                } else if (sub.includes('Independent House')) {
                    updated.rateApplyOn = 'Land + Built-up';
                    updated.rateUnit = 'Sq Ft';
                } else if (sub.includes('Flat') || sub.includes('Builder Floor') || sub.includes('Apartment')) {
                    updated.rateApplyOn = 'Built-up Area';
                    updated.rateUnit = 'Sq Ft';
                }
            }

            return updated;
        });
    };

    const handleMultiplierChange = (type, index, field, value) => {
        const fieldName = type === 'road' ? 'roadMultipliers' : 'floorMultipliers';
        const newMultipliers = [...rateForm[fieldName]];
        newMultipliers[index] = { ...newMultipliers[index], [field]: value };
        setRateForm(prev => ({ ...prev, [fieldName]: newMultipliers }));
    };

    const addMultiplier = (type) => {
        const fieldName = type === 'road' ? 'roadMultipliers' : 'floorMultipliers';
        setRateForm(prev => ({
            ...prev,
            [fieldName]: [...prev[fieldName], { [type === 'road' ? 'roadType' : 'floorType']: '', multiplier: 0 }]
        }));
    };

    const removeMultiplier = (type, index) => {
        const fieldName = type === 'road' ? 'roadMultipliers' : 'floorMultipliers';
        const newMultipliers = rateForm[fieldName].filter((_, i) => i !== index);
        setRateForm(prev => ({ ...prev, [fieldName]: newMultipliers }));
    };

    const addToQueue = () => {
        if (!rateForm.category || !rateForm.subCategory || !rateForm.rate) {
            toast.error("Please fill Category, Sub-category, and Rate before adding to list");
            return;
        }

        // Check if already in queue
        const isDuplicateInQueue = rateForm.queuedRates.some(r =>
            r.category === rateForm.category && r.subCategory === rateForm.subCategory
        );
        if (isDuplicateInQueue) {
            toast.error("This property type is already in your current list below");
            return;
        }

        // Check if already exists in database (using local list for efficiency)
        const isDuplicateInDB = collectorRates.some(r =>
            r.state?._id === rateForm.state &&
            r.district?._id === rateForm.district &&
            r.tehsil?._id === (rateForm.tehsil || undefined) &&
            r.location?._id === (rateForm.location || undefined) &&
            r.category === rateForm.category &&
            r.subCategory === rateForm.subCategory &&
            r.configName === rateForm.configName
            // Note: effectiveFrom check could be added if needed
        );

        if (isDuplicateInDB) {
            toast.error("A rate for this property type already exists for this location. Please edit the existing one instead of adding a new one.");
            return;
        }

        const newEntry = {
            category: rateForm.category,
            subCategory: rateForm.subCategory,
            rate: rateForm.rate,
            rateApplyOn: rateForm.rateApplyOn,
            rateUnit: rateForm.rateUnit,
            roadMultipliers: [...rateForm.roadMultipliers],
            floorMultipliers: [...rateForm.floorMultipliers]
        };

        setRateForm(prev => ({
            ...prev,
            queuedRates: [...prev.queuedRates, newEntry],
            // Reset granular fields but keep geographic info
            category: '',
            subCategory: '',
            rate: '',
            roadMultipliers: [],
            floorMultipliers: []
        }));
    };

    const removeFromQueue = (index) => {
        setRateForm(prev => ({
            ...prev,
            queuedRates: prev.queuedRates.filter((_, i) => i !== index)
        }));
    };

    // Main Save Handler (for Collector Rate Modal)
    const handleSaveAll = async () => {
        if (!rateForm.state || !rateForm.district || !rateForm.configName) {
            toast.error("Geographic details and Target Configuration are required");
            return;
        }

        // If something is in the form but not in queue, ask if they want to add it or ignore it
        // For now, we strictly require items to be in queuedRates OR use the current form if queue is empty
        const finalRates = rateForm.queuedRates.length > 0
            ? rateForm.queuedRates
            : (rateForm.category && rateForm.rate ? [{
                category: rateForm.category,
                subCategory: rateForm.subCategory,
                rate: rateForm.rate,
                rateApplyOn: rateForm.rateApplyOn,
                rateUnit: rateForm.rateUnit,
                roadMultipliers: rateForm.roadMultipliers,
                floorMultipliers: rateForm.floorMultipliers
            }] : []);

        if (finalRates.length === 0) {
            toast.error("No rate configurations added to the list");
            return;
        }

        setSaving(true);
        try {
            // Sequential save (can be parallelized but sequential is safer for error handling)
            for (const item of finalRates) {
                const payload = {
                    state: rateForm.state,
                    district: rateForm.district,
                    tehsil: rateForm.tehsil,
                    location: rateForm.location,
                    category: item.category,
                    subCategory: item.subCategory,
                    rate: parseFloat(item.rate) || 0,
                    rateApplyOn: item.rateApplyOn,
                    rateUnit: item.rateUnit,
                    roadMultipliers: item.roadMultipliers,
                    floorMultipliers: item.floorMultipliers,
                    effectiveFrom: rateForm.effectiveFrom || new Date(),
                    effectiveTo: rateForm.effectiveTo,
                    versionNo: rateForm.versionNo,
                    configName: rateForm.configName,
                };
                await api.post('/collector-rates', payload);
            }

            toast.success(`Successfully saved ${finalRates.length} rate configurations`);
            setViewMode('list');
            fetchData();
            // Reset form
            setRateForm({
                state: '',
                district: '',
                tehsil: '',
                location: '',
                category: '',
                subCategory: '',
                rate: '',
                rateApplyOn: 'Land Area',
                rateUnit: 'Sq Yard',
                roadMultipliers: [],
                floorMultipliers: [],
                effectiveFrom: '',
                effectiveTo: '',
                versionNo: '',
                configName: '',
                constructionRateSqFt: '',
                constructionRateSqYard: '',
                queuedRates: [],
                stampDuty: '',
                registrationFee: '',
                courtFee: '',
                otherCharges: '',
                notes: ''
            });
        } catch (error) {
            console.error('Error saving rates:', error);
            toast.error(error.response?.data?.message || 'Failed to save some or all rates');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveConfig = async (newConfig) => {
        setSaving(true);
        try {
            const configName = newConfig.configName;
            const key = `govt_charges_${configName.toLowerCase().replace(/\s+/g, '_')}`;

            const payload = {
                key,
                category: 'govt_charges_config',
                value: {
                    ...newConfig,
                    updatedAt: new Date().toISOString()
                }
            };

            const response = await api.post('/system-settings/upsert', payload);

            if (response.data.status === "success") {
                toast.success('Configuration saved successfully');
                setIsConfigModalOpen(false);
                fetchData();
            }
        } catch (error) {
            console.error(error);
            toast.error("Failed to save configuration");
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteRegistrationCharge = async (key) => { // Renamed from handleDeleteConfig
        if (!window.confirm("Delete this registration charge?")) return;
        try {
            await api.delete(`/system-settings/${key}`);
            toast.success("Registration charge deleted");
            fetchData();
        } catch (e) {
            toast.error("Failed to delete");
        }
    };

    const handleDeleteRate = async (id) => {
        if (!window.confirm("Delete this rate?")) return;
        try {
            await api.delete(`/collector-rates/${id}`);
            toast.success("Rate deleted");
            fetchData();
        } catch (e) {
            toast.error("Failed to delete");
        }
    };

    // --- Styles ---


    const labelStyle = {
        display: 'block',
        fontSize: '0.85rem',
        fontWeight: 600,
        color: '#64748b',
        marginBottom: '8px'
    };

    const inputStyle = {
        width: '100%',
        padding: '10px 12px',
        borderRadius: '8px',
        border: '1px solid #cbd5e1',
        fontSize: '0.9rem',
        outline: 'none',
        transition: 'border-color 0.2s'
    };

    const selectStyle = {
        ...inputStyle,
        appearance: 'none',
        cursor: 'pointer',
        backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23475569%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
        backgroundSize: '12px',
        paddingRight: '32px'
    };

    const btnPrimaryStyle = {
        background: '#2563eb',
        color: '#fff',
        border: 'none',
        padding: '10px 20px',
        borderRadius: '8px',
        fontSize: '0.9rem',
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'all 0.2s',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
    };

    const btnOutlineStyle = {
        background: 'transparent',
        color: '#64748b',
        border: '1px solid #cbd5e1',
        padding: '10px 20px',
        borderRadius: '8px',
        fontSize: '0.9rem',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s'
    };

    const tableHeaderStyle = {
        background: '#f8fafc',
        padding: '12px 24px',
        textAlign: 'left',
        fontSize: '0.75rem',
        fontWeight: 700,
        color: '#64748b',
        textTransform: 'uppercase',
        borderBottom: '1px solid #e2e8f0'
    };

    const tableCellStyle = {
        padding: '16px 24px',
        borderBottom: '1px solid #f1f5f9',
        fontSize: '0.9rem',
        color: '#1e293b'
    };

    return (
        <div style={{ padding: '24px', width: '100%', margin: '0' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Govt. Charges Configuration</h1>
                    <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '4px' }}>Manage financial configurations and collector rates</p>
                </div>
            </div>

            {/* Filter Side Panel */}
            {isFilterPanelOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)', zIndex: 2000, display: 'flex', justifyContent: 'flex-end', backdropFilter: 'blur(2px)' }}>
                    <div style={{ width: '380px', background: '#fff', height: '100%', boxShadow: '-4px 0 25px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', animation: 'slideInRight 0.3s ease-out' }}>
                        <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Advanced Filters</h2>
                            <button onClick={() => setIsFilterPanelOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
                            {activeTab === 'collector' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    <div>
                                        <label style={labelStyle}>State</label>
                                        <select style={selectStyle} value={collectorFilters.state} onChange={e => handleCollectorFilterChange('state', e.target.value)}>
                                            <option value="">All States</option>
                                            {states.map(s => <option key={s._id} value={s._id}>{s.lookup_value}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>District</label>
                                        <select style={selectStyle} value={collectorFilters.district} onChange={e => handleCollectorFilterChange('district', e.target.value)} disabled={!collectorFilters.state}>
                                            <option value="">All Districts</option>
                                            {districts.map(d => <option key={d._id} value={d._id}>{d.lookup_value}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Tehsil</label>
                                        <select style={selectStyle} value={collectorFilters.tehsil} onChange={e => handleCollectorFilterChange('tehsil', e.target.value)} disabled={!collectorFilters.district}>
                                            <option value="">All Tehsils</option>
                                            {tehsils.map(t => <option key={t._id} value={t._id}>{t.lookup_value}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Location</label>
                                        <select style={selectStyle} value={collectorFilters.location} onChange={e => handleCollectorFilterChange('location', e.target.value)} disabled={!collectorFilters.tehsil}>
                                            <option value="">All Locations</option>
                                            {locations.map(l => <option key={l._id} value={l._id}>{l.lookup_value}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Category</label>
                                        <select style={selectStyle} value={collectorFilters.category} onChange={e => handleCollectorFilterChange('category', e.target.value)}>
                                            <option value="">All Categories</option>
                                            {Object.keys(PROPERTY_CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Sub Category</label>
                                        <input
                                            type="text"
                                            style={selectStyle}
                                            placeholder="Filter sub category..."
                                            value={collectorFilters.subCategory}
                                            onChange={e => handleCollectorFilterChange('subCategory', e.target.value)}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    <div>
                                        <label style={labelStyle}>Configuration Name</label>
                                        <input
                                            type="text"
                                            style={selectStyle}
                                            placeholder="Search by name..."
                                            value={registrationFilters.configName} // Renamed from globalFilters
                                            onChange={e => handleRegistrationFilterChange('configName', e.target.value)} // Renamed from handleGlobalFilterChange
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div style={{ padding: '24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '12px' }}>
                            <button onClick={clearFilters} style={{ ...btnOutlineStyle, flex: 1, height: '42px' }}>Clear All</button>
                            <button onClick={() => setIsFilterPanelOpen(false)} style={{ ...btnPrimaryStyle, flex: 1, height: '42px' }}>Apply Filters</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Collector Rates Section (First) */}
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '32px' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <div>
                        <div style={{ display: 'flex', gap: '1px', background: '#e2e8f0', padding: '4px', borderRadius: '10px', marginBottom: '8px', width: 'fit-content' }}>
                            <button
                                onClick={() => setActiveTab('collector')}
                                style={{
                                    padding: '6px 16px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    background: activeTab === 'collector' ? '#fff' : 'transparent',
                                    color: activeTab === 'collector' ? '#2563eb' : '#64748b',
                                    boxShadow: activeTab === 'collector' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                                    transition: 'all 0.2s'
                                }}
                            >
                                Govt. Charges
                            </button>
                            <button
                                onClick={() => setActiveTab('global')}
                                style={{
                                    padding: '6px 16px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    background: activeTab === 'global' ? '#fff' : 'transparent',
                                    color: activeTab === 'global' ? '#2563eb' : '#64748b',
                                    boxShadow: activeTab === 'global' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                                    transition: 'all 0.2s'
                                }}
                            >
                                Registration Charges
                            </button>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '2px' }}>
                            {activeTab === 'collector' ? 'Manage government circle rates and charges based on location' : 'Manage global financial configurations and standard registration charges'}
                        </p>
                    </div>
                </div>

                {/* Consolidated Header: Search, Add, Pagination & Filter */}
                <div style={{ padding: '12px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', background: '#f8fafc' }}>
                    
                    {/* Left Section: Search & Add */}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                        {/* Search Bar (Shrunken) */}
                        <div style={{ position: 'relative', width: '220px' }}>
                            <i className="fas fa-search" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.75rem' }}></i>
                            <input
                                type="text"
                                placeholder="Search..."
                                style={{
                                    padding: '8px 10px 8px 32px',
                                    borderRadius: '8px',
                                    border: '1px solid #e2e8f0',
                                    fontSize: '0.8rem',
                                    width: '100%',
                                    outline: 'none',
                                    transition: 'all 0.2s'
                                }}
                                value={activeTab === 'collector' ? collectorSearch : registrationSearch}
                                onChange={e => activeTab === 'collector' ? setCollectorSearch(e.target.value) : setRegistrationSearch(e.target.value)}
                                onFocus={e => { e.target.style.borderColor = '#2563eb'; e.target.style.boxShadow = '0 0 0 2px rgba(37, 99, 235, 0.1)'; }}
                                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
                            />
                        </div>

                        {/* Add Button (Icon Only) */}
                        {activeTab === 'global' ? (
                            <button
                                onClick={() => {
                                    setConfig({
                                        configName: '',
                                        stampDutyMale: 7,
                                        stampDutyFemale: 5,
                                        stampDutyJoint: 6,
                                        registrationPercent: 1,
                                        registrationMode: 'percent',
                                        registrationSlabs: [],
                                        legalFees: 15000,
                                        brokeragePercent: 1,
                                        coveredAreaPriceSqYds: 0,
                                        coveredAreaPriceSqFt: 0,
                                        useCollectorRateDefault: true
                                    });
                                    setIsConfigModalOpen(true);
                                }}
                                style={{
                                    width: '34px',
                                    height: '34px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: '#2563eb',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.9rem',
                                    transition: 'all 0.2s',
                                    boxShadow: '0 2px 6px rgba(37, 99, 235, 0.2)'
                                }}
                                title="Add Registration Charge"
                            >
                                <i className="fas fa-plus"></i>
                            </button>
                        ) : (
                            <button
                                onClick={() => setViewMode('add')}
                                style={{
                                    width: '34px',
                                    height: '34px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: '#2563eb',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.9rem',
                                    transition: 'all 0.2s',
                                    boxShadow: '0 2px 6px rgba(37, 99, 235, 0.2)'
                                }}
                                title="Add Govt. Charge"
                            >
                                <i className="fas fa-plus"></i>
                            </button>
                        )}
                    </div>

                    {/* Middle Section: Pagination & Limit */}
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flex: 1, justifyContent: 'center' }}>
                        {/* Pagination Summary */}
                        <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500, whiteSpace: 'nowrap' }}>
                            {activeTab === 'collector' ? (
                                collectorPagination.totalDocs > 0 ? (
                                    <span><b>{(collectorPagination.page - 1) * collectorPagination.limit + 1}-{Math.min(collectorPagination.page * collectorPagination.limit, collectorPagination.totalDocs)}</b> of <b>{collectorPagination.totalDocs}</b></span>
                                ) : "0 records"
                            ) : (
                                registrationPagination.totalDocs > 0 ? (
                                    <span><b>{(registrationPagination.page - 1) * registrationPagination.limit + 1}-{Math.min(registrationPagination.page * registrationPagination.limit, registrationPagination.totalDocs)}</b> of <b>{registrationPagination.totalDocs}</b></span>
                                ) : "0 records"
                            )}
                        </div>

                        {/* Rows per page */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <select
                                style={{ border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.75rem', fontWeight: 600, color: '#1e293b', outline: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: '6px' }}
                                value={activeTab === 'collector' ? collectorPagination.limit : registrationPagination.limit}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    if (activeTab === 'collector') {
                                        setCollectorPagination(prev => ({ ...prev, limit: val, page: 1 }));
                                    } else {
                                        setRegistrationPagination(prev => ({ ...prev, limit: val, page: 1 }));
                                    }
                                }}
                            >
                                <option value="10">10</option>
                                <option value="25">25</option>
                                <option value="50">50</option>
                            </select>
                        </div>
                    </div>

                    {/* Right Section: Navigation & Filter */}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <button
                                disabled={(activeTab === 'collector' ? collectorPagination.page : registrationPagination.page) <= 1}
                                onClick={() => (activeTab === 'collector' ? setCollectorPagination : setRegistrationPagination)(prev => ({ ...prev, page: 1 }))}
                                style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: (activeTab === 'collector' ? collectorPagination.page : registrationPagination.page) <= 1 ? 0.4 : 1 }}
                                title="First Page"
                            >
                                <i className="fas fa-angle-double-left" style={{ fontSize: '0.7rem' }}></i>
                            </button>
                            <button
                                disabled={(activeTab === 'collector' ? collectorPagination.page : registrationPagination.page) <= 1}
                                onClick={() => (activeTab === 'collector' ? setCollectorPagination : setRegistrationPagination)(prev => ({ ...prev, page: prev.page - 1 }))}
                                style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: (activeTab === 'collector' ? collectorPagination.page : registrationPagination.page) <= 1 ? 0.4 : 1 }}
                                title="Previous Page"
                            >
                                <i className="fas fa-chevron-left" style={{ fontSize: '0.7rem' }}></i>
                            </button>
                            
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, margin: '0 4px', color: '#1e293b' }}>
                                {activeTab === 'collector' ? collectorPagination.page : registrationPagination.page} / {activeTab === 'collector' ? collectorPagination.totalPages : registrationPagination.totalPages}
                            </span>

                            <button
                                disabled={(activeTab === 'collector' ? collectorPagination.page : registrationPagination.page) >= (activeTab === 'collector' ? collectorPagination.totalPages : registrationPagination.totalPages)}
                                onClick={() => (activeTab === 'collector' ? setCollectorPagination : setRegistrationPagination)(prev => ({ ...prev, page: prev.page + 1 }))}
                                style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: (activeTab === 'collector' ? collectorPagination.page : registrationPagination.page) >= (activeTab === 'collector' ? collectorPagination.totalPages : registrationPagination.totalPages) ? 0.4 : 1 }}
                                title="Next Page"
                            >
                                <i className="fas fa-chevron-right" style={{ fontSize: '0.7rem' }}></i>
                            </button>
                            <button
                                disabled={(activeTab === 'collector' ? collectorPagination.page : registrationPagination.page) >= (activeTab === 'collector' ? collectorPagination.totalPages : registrationPagination.totalPages)}
                                onClick={() => (activeTab === 'collector' ? setCollectorPagination : setRegistrationPagination)(prev => ({ ...prev, page: (activeTab === 'collector' ? collectorPagination.totalPages : registrationPagination.totalPages) }))}
                                style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: (activeTab === 'collector' ? collectorPagination.page : registrationPagination.page) >= (activeTab === 'collector' ? collectorPagination.totalPages : registrationPagination.totalPages) ? 0.4 : 1 }}
                                title="Last Page"
                            >
                                <i className="fas fa-angle-double-right" style={{ fontSize: '0.7rem' }}></i>
                            </button>
                        </div>

                        {/* Filter Button (Icon) */}
                        <button
                            onClick={() => setIsFilterPanelOpen(true)}
                            style={{
                                width: '34px',
                                height: '34px',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0',
                                background: Object.values(activeTab === 'collector' ? collectorFilters : registrationFilters).some(v => v !== '') ? '#eff6ff' : '#fff',
                                color: Object.values(activeTab === 'collector' ? collectorFilters : registrationFilters).some(v => v !== '') ? '#2563eb' : '#64748b',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s',
                                marginLeft: '8px',
                                position: 'relative'
                            }}
                            title="Filter"
                            onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#2563eb'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = Object.values(activeTab === 'collector' ? collectorFilters : registrationFilters).some(v => v !== '') ? '#eff6ff' : '#fff'; e.currentTarget.style.color = Object.values(activeTab === 'collector' ? collectorFilters : registrationFilters).some(v => v !== '') ? '#2563eb' : '#64748b'; }}
                        >
                            <i className="fas fa-filter" style={{ fontSize: '0.85rem' }}></i>
                            {Object.values(activeTab === 'collector' ? collectorFilters : registrationFilters).some(v => v !== '') && (
                                <span style={{ position: 'absolute', top: '-4px', right: '-4px', width: '8px', height: '8px', background: '#2563eb', borderRadius: '50%', border: '2px solid #fff' }}></span>
                            )}
                        </button>
                    </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    {activeTab === 'collector' ? (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={tableHeaderStyle}>Location</th>
                                    <th style={tableHeaderStyle}>Property Type</th>
                                    <th style={tableHeaderStyle}>Basis / Unit</th>
                                    <th style={tableHeaderStyle}>Rate (₹)</th>
                                    <th style={tableHeaderStyle}>Multipliers</th>
                                    <th style={tableHeaderStyle}>Period</th>
                                    <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {collectorRates.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                                            No collector rates found. Add one to get started.
                                        </td>
                                    </tr>
                                ) : (
                                    collectorRates.map(rate => (
                                        <tr key={rate._id} style={{ transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <td style={tableCellStyle}>
                                                <div style={{ fontWeight: 600, color: '#1e293b' }}>
                                                    {rate.location?.lookup_value && <span style={{ color: '#2563eb' }}>{rate.location.lookup_value} • </span>}
                                                    {rate.district?.lookup_value || 'Unknown'}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                                                    {rate.tehsil?.lookup_value && <span>{rate.tehsil.lookup_value}, </span>}
                                                    {rate.state?.lookup_value}
                                                </div>
                                            </td>
                                            <td style={tableCellStyle}>
                                                <div style={{ fontWeight: 600, color: '#1e293b' }}>{rate.category || 'N/A'}</div>
                                                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{rate.subCategory || 'N/A'}</div>
                                            </td>
                                            <td style={tableCellStyle}>
                                                <div style={{ fontSize: '0.85rem', color: '#475569' }}>{rate.rateApplyOn}</div>
                                                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>per {rate.rateUnit}</div>
                                            </td>
                                            <td style={tableCellStyle}>
                                                <div style={{ fontWeight: 700, color: '#2563eb', fontSize: '1.05rem' }}>₹{rate.rate?.toLocaleString()}</div>
                                            </td>
                                            <td style={tableCellStyle}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    {rate.roadMultipliers?.map((m, idx) => (
                                                        <span key={`r-${idx}`} style={{ background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>
                                                            {m.roadType}: {m.multiplier}%
                                                        </span>
                                                    ))}
                                                    {rate.floorMultipliers?.map((m, idx) => (
                                                        <span key={`f-${idx}`} style={{ background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>
                                                            {m.floorType}: {m.multiplier}%
                                                        </span>
                                                    ))}
                                                    {(!rate.roadMultipliers?.length && !rate.floorMultipliers?.length) && <span style={{ color: '#cbd5e1', fontSize: '0.75rem' }}>None</span>}
                                                </div>
                                            </td>
                                            <td style={tableCellStyle}>
                                                <div style={{ fontSize: '0.8rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <i className="fas fa-calendar-alt" style={{ fontSize: '0.7rem', color: '#94a3b8' }}></i>
                                                    {new Date(rate.effectiveFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                                                </div>
                                                {rate.effectiveTo && (
                                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                                                        to {new Date(rate.effectiveTo).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                                                    </div>
                                                )}
                                                {rate.versionNo && <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontStyle: 'italic', marginTop: '4px' }}>v{rate.versionNo}</div>}
                                            </td>
                                            <td style={{ ...tableCellStyle, textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                    <button
                                                        onClick={() => handleDeleteRate(rate._id)}
                                                        style={{ background: '#fee2e2', color: '#ef4444', border: 'none', width: '32px', height: '32px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                        title="Delete"
                                                    >
                                                        <i className="fas fa-trash-alt" style={{ fontSize: '0.8rem' }}></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )))}
                            </tbody>
                        </table>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <th style={tableHeaderStyle}>Config Name</th>
                                    <th style={tableHeaderStyle}>Target State</th>
                                    <th style={tableHeaderStyle}>Stamp Duty (M/F/J)</th>
                                    <th style={tableHeaderStyle}>Regis. Fee</th>
                                    <th style={tableHeaderStyle}>Legal Fees</th>
                                    <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(!registrationCharges || registrationCharges.length === 0) ? (
                                    <tr>
                                        <td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                                            No configuration found. Add one to get started.
                                        </td>
                                    </tr>
                                ) : (
                                    (registrationCharges || []).map(charge => (
                                        <tr key={charge._id} style={{ transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <td style={tableCellStyle}>
                                                <div style={{ fontWeight: 600, color: '#1e293b' }}>{charge.key.replace('govt_charges_', '')}</div>
                                            </td>
                                            <td style={tableCellStyle}>
                                                <div style={{ padding: '4px 8px', background: charge.value?.state ? '#eff6ff' : '#f8fafc', color: charge.value?.state ? '#2563eb' : '#64748b', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, display: 'inline-block' }}>
                                                    {charge.value?.state ? 'Region Specific' : 'Global (All)'}
                                                </div>
                                            </td>
                                            <td style={tableCellStyle}>
                                                <div style={{ color: '#475569' }}>
                                                    {charge.value?.stampDutyMale}% / {charge.value?.stampDutyFemale}% / {charge.value?.stampDutyJoint}%
                                                </div>
                                            </td>
                                            <td style={tableCellStyle}>
                                                <div style={{ color: '#475569' }}>
                                                    {charge.value?.registrationMode === 'percent' ? `${charge.value?.registrationPercent}%` : 'Slab-based'}
                                                </div>
                                            </td>
                                            <td style={tableCellStyle}>
                                                <div style={{ color: '#475569' }}>₹{charge.value?.legalFees?.toLocaleString()}</div>
                                            </td>
                                            <td style={{ ...tableCellStyle, textAlign: 'right' }}>
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                                    <button
                                                        onClick={() => {
                                                            setConfig(charge.value);
                                                            setIsConfigModalOpen(true);
                                                        }}
                                                        style={{ background: '#f1f5f9', color: '#475569', border: 'none', width: '32px', height: '32px', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                        title="Edit"
                                                    >
                                                        <i className="fas fa-edit" style={{ fontSize: '0.8rem' }}></i>
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteRegistrationCharge(charge.key)}
                                                        style={{ background: '#fee2e2', color: '#ef4444', border: 'none', width: '32px', height: '32px', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                        title="Delete"
                                                    >
                                                        <i className="fas fa-trash-alt" style={{ fontSize: '0.8rem' }}></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Removed Global Standard Rates Section */}

            {/* Removed inline config section as it is now in a modal */}

            {/* Add Rate Modal */}
            {viewMode === 'add' && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)' }}>
                    <div style={{ background: '#fff', width: '90%', maxWidth: '900px', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)', maxHeight: '90vh' }}>

                        {/* Modal Header */}
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', flexShrink: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                <div style={{ width: '42px', height: '42px', background: '#eff6ff', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <i className="fas fa-map-marked-alt" style={{ color: '#2563eb', fontSize: '1.2rem' }}></i>
                                </div>
                                <div>
                                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                                        Add Govt. Charge
                                    </h2>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                        <LiveClock />
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setViewMode('list')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1.2rem', transition: 'color 0.2s' }}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                    <div>
                                        <label style={labelStyle}>State</label>
                                        <select
                                            style={selectStyle}
                                            value={rateForm.state}
                                            onChange={e => handleRateChange('state', e.target.value)}
                                        >
                                            <option value="">Select State</option>
                                            {states.map(s => <option key={s._id} value={s._id}>{s.lookup_value}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Distt (City)</label>
                                        <select
                                            style={selectStyle}
                                            value={rateForm.district}
                                            onChange={e => handleRateChange('district', e.target.value)}
                                            disabled={!rateForm.state}
                                        >
                                            <option value="">Select Distt (City)</option>
                                            {districts.map(d => <option key={d._id} value={d._id}>{d.lookup_value}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                    <div>
                                        <label style={labelStyle}>Tehsil</label>
                                        <select
                                            style={selectStyle}
                                            value={rateForm.tehsil}
                                            onChange={e => handleRateChange('tehsil', e.target.value)}
                                            disabled={!rateForm.district}
                                        >
                                            <option value="">Select Tehsil</option>
                                            {tehsils.map(t => <option key={t._id} value={t._id}>{t.lookup_value}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Location / Sector</label>
                                        <select
                                            style={selectStyle}
                                            value={rateForm.location}
                                            onChange={e => handleRateChange('location', e.target.value)}
                                            disabled={!rateForm.district}
                                        >
                                            <option value="">Select Location / Sector</option>
                                            {locations.map(l => <option key={l._id} value={l._id}>{l.lookup_value}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                                    <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <i className="fas fa-sliders-h" style={{ color: '#2563eb' }}></i>
                                        Property & Rate Configuration
                                    </h4>

                                    {/* Mapping Row */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                                        <div>
                                            <label style={labelStyle}>Category</label>
                                            <select
                                                style={selectStyle}
                                                value={rateForm.category}
                                                onChange={e => {
                                                    handleRateChange('category', e.target.value);
                                                    handleRateChange('subCategory', '');
                                                }}
                                            >
                                                <option value="">Select Category</option>
                                                {Object.keys(PROPERTY_CATEGORIES).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Sub Category</label>
                                            <select
                                                style={selectStyle}
                                                value={rateForm.subCategory}
                                                onChange={e => handleRateChange('subCategory', e.target.value)}
                                                disabled={!rateForm.category}
                                            >
                                                <option value="">Select Sub Category</option>
                                                {rateForm.category && PROPERTY_CATEGORIES[rateForm.category].subCategories.map(sub => (
                                                    <option key={sub.name} value={sub.name}>{sub.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Rate Row */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr', gap: '20px', marginBottom: '24px', padding: '20px', background: '#fff', borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                        <div>
                                            <label style={labelStyle}>Rate Basis</label>
                                            <select
                                                style={selectStyle}
                                                value={rateForm.rateApplyOn}
                                                onChange={e => handleRateChange('rateApplyOn', e.target.value)}
                                            >
                                                <option value="Land Area">Land Area</option>
                                                <option value="Built-up Area">Built-up Area</option>
                                                <option value="Land + Built-up">Land + Built-up</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Rate Unit</label>
                                            <select
                                                style={selectStyle}
                                                value={rateForm.rateUnit}
                                                onChange={e => handleRateChange('rateUnit', e.target.value)}
                                            >
                                                <option value="Sq Yard">Sq Yard</option>
                                                <option value="Sq Meter">Sq Meter</option>
                                                <option value="Sq Ft">Sq Ft</option>
                                                <option value="Acre">Acre</option>
                                                <option value="Kanal">Kanal</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Rate (₹)</label>
                                            <div style={{ position: 'relative' }}>
                                                <input
                                                    type="number"
                                                    style={{ ...inputStyle, paddingLeft: '28px' }}
                                                    value={rateForm.rate}
                                                    onChange={e => handleRateChange('rate', e.target.value)}
                                                    placeholder="0.00"
                                                />
                                                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontWeight: 600 }}>₹</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Multipliers Row */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                                        <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'center' }}>
                                                <label style={{ ...labelStyle, marginBottom: 0, fontSize: '0.75rem' }}>Road Multipliers</label>
                                                <button onClick={() => addMultiplier('road')} style={{ background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }} className="hover:bg-blue-100">+ Add</button>
                                            </div>
                                            {rateForm.roadMultipliers.length > 0 ? rateForm.roadMultipliers.map((m, idx) => (
                                                <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                                    <select
                                                        style={{ ...selectStyle, flex: 2, padding: '6px 24px 6px 10px', fontSize: '0.8rem' }}
                                                        value={m.roadType}
                                                        onChange={e => handleMultiplierChange('road', idx, 'roadType', e.target.value)}
                                                    >
                                                        <option value="">Type</option>
                                                        {ROAD_WIDTH_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                        <option value="Main Road">Main Road</option>
                                                        <option value="Inner Road">Inner Road</option>
                                                    </select>
                                                    <input
                                                        type="number"
                                                        style={{ ...inputStyle, flex: 1, padding: '6px 10px', fontSize: '0.8rem' }}
                                                        value={m.multiplier}
                                                        onChange={e => handleMultiplierChange('road', idx, 'multiplier', e.target.value)}
                                                        placeholder="%"
                                                    />
                                                    <button onClick={() => removeMultiplier('road', idx)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}><i className="fas fa-trash-alt"></i></button>
                                                </div>
                                            )) : (
                                                <div style={{ textAlign: 'center', padding: '10px', color: '#94a3b8', fontSize: '0.75rem', border: '1px dashed #e2e8f0', borderRadius: '8px' }}>No road multipliers added</div>
                                            )}
                                        </div>
                                        <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'center' }}>
                                                <label style={{ ...labelStyle, marginBottom: 0, fontSize: '0.75rem' }}>Floor Multipliers</label>
                                                <button onClick={() => addMultiplier('floor')} style={{ background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }} className="hover:bg-blue-100">+ Add</button>
                                            </div>
                                            {rateForm.floorMultipliers.length > 0 ? rateForm.floorMultipliers.map((m, idx) => (
                                                <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                                    <input
                                                        type="text"
                                                        style={{ ...inputStyle, flex: 2, padding: '6px 10px', fontSize: '0.8rem' }}
                                                        value={m.floorType}
                                                        onChange={e => handleMultiplierChange('floor', idx, 'floorType', e.target.value)}
                                                        placeholder="Floor Type"
                                                    />
                                                    <input
                                                        type="number"
                                                        style={{ ...inputStyle, flex: 1, padding: '6px 10px', fontSize: '0.8rem' }}
                                                        value={m.multiplier}
                                                        onChange={e => handleMultiplierChange('floor', idx, 'multiplier', e.target.value)}
                                                        placeholder="%"
                                                    />
                                                    <button onClick={() => removeMultiplier('floor', idx)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}><i className="fas fa-trash-alt"></i></button>
                                                </div>
                                            )) : (
                                                <div style={{ textAlign: 'center', padding: '10px', color: '#94a3b8', fontSize: '0.75rem', border: '1px dashed #e2e8f0', borderRadius: '8px' }}>No floor multipliers added</div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action Button: Add to List */}
                                    <div style={{ textAlign: 'center', marginBottom: '24px', borderTop: '1px dashed #e2e8f0', paddingTop: '20px' }}>
                                        <button
                                            onClick={addToQueue}
                                            style={{
                                                padding: '10px 24px',
                                                background: '#2563eb',
                                                color: '#fff',
                                                border: 'none',
                                                borderRadius: '10px',
                                                fontSize: '0.9rem',
                                                fontWeight: 800,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px',
                                                margin: '0 auto',
                                                boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)',
                                                transition: 'all 0.2s'
                                            }}
                                            className="hover:scale-105 active:scale-95"
                                        >
                                            <i className="fas fa-plus-circle"></i> Add to List
                                        </button>
                                    </div>

                                    {/* Queued List View */}
                                    {rateForm.queuedRates.length > 0 && (
                                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px', marginTop: '20px' }}>
                                            <h5 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#475569', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.025em' }}>Added Configurations ({rateForm.queuedRates.length})</h5>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {rateForm.queuedRates.map((item, idx) => (
                                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                                                        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                                                            <div style={{ width: '32px', height: '32px', background: '#eff6ff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb', fontWeight: 800, fontSize: '0.75rem' }}>{idx + 1}</div>
                                                            <div>
                                                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>{item.category} • {item.subCategory}</div>
                                                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>₹{item.rate} per {item.rateUnit} ({item.rateApplyOn})</div>
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                                {item.roadMultipliers.length > 0 && <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: '#fff7ed', color: '#c2410c', borderRadius: '4px', border: '1px solid #ffedd5' }}>{item.roadMultipliers.length} Road</span>}
                                                                {item.floorMultipliers.length > 0 && <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: '#f0fdf4', color: '#15803d', borderRadius: '4px', border: '1px solid #dcfce7' }}>{item.floorMultipliers.length} Floor</span>}
                                                            </div>
                                                            <button onClick={() => removeFromQueue(idx)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}><i className="fas fa-times"></i></button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                    <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="fas fa-history" style={{ color: '#2563eb' }}></i>
                                        Effective Period & Tracking
                                    </h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
                                        <div>
                                            <label style={labelStyle}>Effective From</label>
                                            <input
                                                type="date"
                                                style={inputStyle}
                                                value={rateForm.effectiveFrom}
                                                onChange={e => handleRateChange('effectiveFrom', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Effective To</label>
                                            <input
                                                type="date"
                                                style={inputStyle}
                                                value={rateForm.effectiveTo}
                                                onChange={e => handleRateChange('effectiveTo', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Version No</label>
                                            <input
                                                type="text"
                                                style={inputStyle}
                                                value={rateForm.versionNo}
                                                onChange={e => handleRateChange('versionNo', e.target.value)}
                                                placeholder="v1.0"
                                            />
                                        </div>
                                         <div>
                                            <label style={labelStyle}>Target Config</label>
                                            <select
                                                style={selectStyle}
                                                value={rateForm.configName}
                                                onChange={e => handleRateChange('configName', e.target.value)}
                                            >
                                                <option value="">Select Config</option>
                                                {(registrationCharges || []).map(charge => (
                                                    <option key={charge._id} value={charge.value.configName}>
                                                        {charge.value.configName}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div style={{ padding: '20px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '12px', flexShrink: 0 }}>
                            <button onClick={() => setViewMode('list')} style={btnOutlineStyle}>Cancel</button>
                            <button onClick={handleSaveAll} style={btnPrimaryStyle} disabled={saving}>
                                {saving ? <span className="loader-sm"></span> : (
                                    <>
                                        <i className="fas fa-check-double"></i>
                                        {rateForm.queuedRates.length > 0 ? ` Save All (${rateForm.queuedRates.length})` : ' Save Rate'}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Global Config Modal */}
            <CreateGlobalConfigModal
                isOpen={isConfigModalOpen}
                onClose={() => setIsConfigModalOpen(false)}
                onSave={handleSaveConfig}
                initialConfig={config}
                saving={saving}
            />

            <style>{`
                @keyframes slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .loader-sm {
                    width: 16px;
                    height: 16px;
                    border: 2px solid #fff;
                    border-bottom-color: transparent;
                    border-radius: 50%;
                    display: inline-block;
                    animation: rotation 1s linear infinite;
                }
                @keyframes rotation {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div >
    );
};

export default DealSettingsPage;
