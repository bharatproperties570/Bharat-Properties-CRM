import { useState, useEffect } from 'react';
import { api } from '../../../utils/api';
import toast from 'react-hot-toast';

const SUPPORTED_AREA_UNITS = [
    { value: 'sqft', label: 'Sq Ft (Square Feet)' },
    { value: 'sqyd', label: 'Sq Yd / Gaz (Square Yards)' },
    { value: 'marla', label: 'Marla (225 sqft / 25 sqyd)' },
    { value: 'kanal', label: 'Kanal (20 Marla / 500 sqyd)' },
    { value: 'bigha', label: 'Bigha (4 Kanal / 1000 sqyd)' },
    { value: 'acre', label: 'Acre (8 Kanal / 4840 sqyd)' }
];

const SELLER_TYPE_OPTIONS = [
    { value: 'owner', label: 'Direct Owner', icon: 'fa-user' },
    { value: 'broker', label: 'Channel Partner / Broker', icon: 'fa-handshake' },
    { value: 'builder', label: 'Builder / Developer', icon: 'fa-building' }
];

const formatCurrencyINR = (amount) => {
    if (!amount && amount !== 0) return null;
    const num = Number(amount);
    if (isNaN(num)) return null;
    if (num >= 10000000) {
        return `₹${(num / 10000000).toFixed(2).replace(/\.00$/, '')} Cr`;
    }
    if (num >= 100000) {
        return `₹${(num / 100000).toFixed(2).replace(/\.00$/, '')} Lac`;
    }
    return `₹${num.toLocaleString('en-IN')}`;
};

const DiscoverySettingsPage = () => {
    const [configs, setConfigs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingConfig, setEditingConfig] = useState(null);

    // Form State (Core)
    const [name, setName] = useState('');
    const [keywords, setKeywords] = useState('');
    const [locationFilters, setLocationFilters] = useState('');
    const [propertyTypes, setPropertyTypes] = useState('');
    const [scheduleCron, setScheduleCron] = useState('0 0 * * *');
    const [isActive, setIsActive] = useState(true);

    // Form State (Phase 1 Enhanced Filters)
    const [priceMin, setPriceMin] = useState('');
    const [priceMax, setPriceMax] = useState('');
    const [sizeMin, setSizeMin] = useState('');
    const [sizeMax, setSizeMax] = useState('');
    const [sizeUnit, setSizeUnit] = useState('sqyd');
    const [sellerTypes, setSellerTypes] = useState([]);
    const [portalWhitelist, setPortalWhitelist] = useState('');
    const [freshnessDays, setFreshnessDays] = useState('');

    useEffect(() => {
        fetchConfigs();
    }, []);

    const fetchConfigs = async () => {
        try {
            const res = await api.get('/discovery');
            if (res.data.success) {
                setConfigs(res.data.data);
            }
        } catch (error) {
            console.error("Error fetching discovery configs", error);
            toast.error("Failed to fetch discovery configs");
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenModal = (config = null) => {
        if (config) {
            setEditingConfig(config);
            setName(config.name || '');
            setKeywords(Array.isArray(config.keywords) ? config.keywords.join(', ') : '');
            setLocationFilters(Array.isArray(config.location_filters) ? config.location_filters.join(', ') : '');
            setPropertyTypes(Array.isArray(config.property_types) ? config.property_types.join(', ') : '');
            setScheduleCron(config.schedule_cron || '0 0 * * *');
            setIsActive(config.is_active !== undefined ? config.is_active : true);

            // Enhanced Phase 1 fields
            setPriceMin(config.price_min !== null && config.price_min !== undefined ? String(config.price_min) : '');
            setPriceMax(config.price_max !== null && config.price_max !== undefined ? String(config.price_max) : '');
            setSizeMin(config.size_min !== null && config.size_min !== undefined ? String(config.size_min) : '');
            setSizeMax(config.size_max !== null && config.size_max !== undefined ? String(config.size_max) : '');
            setSizeUnit(config.size_unit || 'sqyd');
            setSellerTypes(Array.isArray(config.seller_types) ? config.seller_types : []);
            setPortalWhitelist(Array.isArray(config.portal_whitelist) ? config.portal_whitelist.join(', ') : '');
            setFreshnessDays(config.freshness_days ? String(config.freshness_days) : '');
        } else {
            setEditingConfig(null);
            setName('');
            setKeywords('');
            setLocationFilters('');
            setPropertyTypes('');
            setScheduleCron('0 0 * * *');
            setIsActive(true);

            // Defaults
            setPriceMin('');
            setPriceMax('');
            setSizeMin('');
            setSizeMax('');
            setSizeUnit('sqyd');
            setSellerTypes([]);
            setPortalWhitelist('99acres.com, magicbricks.com, housing.com, olx.in');
            setFreshnessDays('30');
        }
        setIsModalOpen(true);
    };

    const toggleSellerType = (type) => {
        setSellerTypes(prev => 
            prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
        );
    };

    const handleSave = async () => {
        if (!name.trim()) {
            return toast.error("Configuration Name is required");
        }
        if (!keywords.trim()) {
            return toast.error("At least one Search Keyword is required");
        }

        // Validate Price Range
        const numPriceMin = priceMin !== '' ? Number(priceMin) : null;
        const numPriceMax = priceMax !== '' ? Number(priceMax) : null;
        if (numPriceMin !== null && (isNaN(numPriceMin) || numPriceMin < 0)) {
            return toast.error("Minimum Price must be a valid non-negative number");
        }
        if (numPriceMax !== null && (isNaN(numPriceMax) || numPriceMax < 0)) {
            return toast.error("Maximum Price must be a valid non-negative number");
        }
        if (numPriceMin !== null && numPriceMax !== null && numPriceMax < numPriceMin) {
            return toast.error("Maximum Price cannot be less than Minimum Price");
        }

        // Validate Size Range
        const numSizeMin = sizeMin !== '' ? Number(sizeMin) : null;
        const numSizeMax = sizeMax !== '' ? Number(sizeMax) : null;
        if (numSizeMin !== null && (isNaN(numSizeMin) || numSizeMin < 0)) {
            return toast.error("Minimum Size must be a valid non-negative number");
        }
        if (numSizeMax !== null && (isNaN(numSizeMax) || numSizeMax < 0)) {
            return toast.error("Maximum Size must be a valid non-negative number");
        }
        if (numSizeMin !== null && numSizeMax !== null && numSizeMax < numSizeMin) {
            return toast.error("Maximum Size cannot be less than Minimum Size");
        }

        // Validate Freshness Days
        const numFreshness = freshnessDays !== '' ? Number(freshnessDays) : null;
        if (numFreshness !== null && (!Number.isInteger(numFreshness) || numFreshness < 1 || numFreshness > 365)) {
            return toast.error("Freshness must be an integer between 1 and 365 days");
        }

        const payload = {
            name: name.trim(),
            keywords: keywords.split(',').map(s => s.trim()).filter(Boolean),
            location_filters: locationFilters.split(',').map(s => s.trim()).filter(Boolean),
            property_types: propertyTypes.split(',').map(s => s.trim()).filter(Boolean),
            schedule_cron: scheduleCron.trim(),
            is_active: isActive,

            // Enhanced Phase 1 fields
            price_min: numPriceMin,
            price_max: numPriceMax,
            size_min: numSizeMin,
            size_max: numSizeMax,
            size_unit: (numSizeMin !== null || numSizeMax !== null) ? sizeUnit : null,
            seller_types: sellerTypes,
            portal_whitelist: portalWhitelist.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
            freshness_days: numFreshness
        };

        const tId = toast.loading('Saving config...');
        try {
            if (editingConfig) {
                await api.put(`/discovery/${editingConfig._id}`, payload);
                toast.success("Updated successfully", { id: tId });
            } else {
                await api.post('/discovery', payload);
                toast.success("Created successfully", { id: tId });
            }
            setIsModalOpen(false);
            fetchConfigs();
        } catch (error) {
            const msg = error.response?.data?.message || error.message || "Failed to save";
            toast.error(msg, { id: tId });
            console.error(error);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Delete this discovery configuration?")) return;
        
        const tId = toast.loading("Deleting...");
        try {
            await api.delete(`/discovery/${id}`);
            toast.success("Deleted", { id: tId });
            fetchConfigs();
        } catch (error) {
            toast.error("Failed to delete", { id: tId });
        }
    };

    const handleTrigger = async (id) => {
        const tId = toast.loading("Triggering discovery run...");
        try {
            await api.post(`/discovery/${id}/trigger`);
            toast.success("Discovery triggered! Jobs are running in background.", { id: tId });
            setTimeout(fetchConfigs, 3000);
        } catch (error) {
            toast.error("Failed to trigger", { id: tId });
        }
    };

    return (
        <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 8px 0' }}>Online Deal Discovery Engine</h2>
                    <p style={{ color: 'var(--text-muted)', margin: 0 }}>Automate public property discovery from indexed portals with precision budget and size filters.</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    style={{ background: '#3b82f6', color: '#ffffff', padding: '10px 20px', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    <i className="fas fa-plus"></i> New Config
                </button>
            </div>

            {isLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    <i className="fas fa-spinner fa-spin" style={{ marginRight: '8px' }}></i> Loading configurations...
                </div>
            ) : configs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
                    <i className="fab fa-google" style={{ fontSize: '3rem', color: 'var(--text-muted)', marginBottom: '16px' }}></i>
                    <h3 style={{ fontSize: '1.1rem', color: 'var(--text-muted)', marginBottom: '8px' }}>No Discovery Configs</h3>
                    <p style={{ color: 'var(--text-muted)' }}>Create a search configuration to start discovering properties.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: '16px' }}>
                    {configs.map(config => {
                        const hasBudget = config.price_min !== null || config.price_max !== null;
                        const hasSize = config.size_min !== null || config.size_max !== null;
                        const hasPortals = Array.isArray(config.portal_whitelist) && config.portal_whitelist.length > 0;
                        const hasSellerTypes = Array.isArray(config.seller_types) && config.seller_types.length > 0;

                        return (
                            <div key={config._id} style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>{config.name}</h3>
                                        <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 700, background: config.is_active ? 'rgba(34, 197, 94, 0.15)' : 'var(--bg-light)', color: config.is_active ? '#166534' : 'var(--text-muted)' }}>
                                            {config.is_active ? 'ACTIVE' : 'PAUSED'}
                                        </span>
                                    </div>

                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                                        <strong>Keywords:</strong> {config.keywords?.join(', ')}
                                    </div>

                                    {config.location_filters?.length > 0 && (
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                                            <strong>Locations:</strong> {config.location_filters.join(', ')}
                                        </div>
                                    )}

                                    {/* Phase 1 Filter Badges */}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '10px 0' }}>
                                        {hasBudget ? (
                                            <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                                                <i className="fas fa-rupee-sign" style={{ marginRight: '4px' }}></i>
                                                Budget: {config.price_min ? formatCurrencyINR(config.price_min) : '₹0'} - {config.price_max ? formatCurrencyINR(config.price_max) : 'No Max'}
                                            </span>
                                        ) : (
                                            <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-light)' }}>
                                                Budget: Any
                                            </span>
                                        )}

                                        {hasSize ? (
                                            <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, background: 'rgba(16, 185, 129, 0.1)', color: '#059669', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                                <i className="fas fa-ruler-combined" style={{ marginRight: '4px' }}></i>
                                                Size: {config.size_min || '0'} - {config.size_max || '∞'} {config.size_unit}
                                            </span>
                                        ) : null}

                                        {hasPortals ? (
                                            <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, background: 'rgba(139, 92, 246, 0.1)', color: '#7c3aed', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                                                <i className="fas fa-globe" style={{ marginRight: '4px' }}></i>
                                                Portals: {config.portal_whitelist.join(', ')}
                                            </span>
                                        ) : (
                                            <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-light)' }}>
                                                All Portals
                                            </span>
                                        )}

                                        {hasSellerTypes ? (
                                            <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, background: 'rgba(245, 158, 11, 0.1)', color: '#d97706', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                                                <i className="fas fa-users" style={{ marginRight: '4px' }}></i>
                                                Sellers: {config.seller_types.join(', ')}
                                            </span>
                                        ) : null}

                                        {config.freshness_days ? (
                                            <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-light)' }}>
                                                <i className="far fa-calendar-alt" style={{ marginRight: '4px' }}></i>
                                                Last {config.freshness_days} days
                                            </span>
                                        ) : null}
                                    </div>

                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '16px', marginTop: '8px' }}>
                                        <span><i className="far fa-clock"></i> {config.schedule_cron}</span>
                                        <span><i className="fas fa-link"></i> {config.urls_discovered_count || 0} URLs Found</span>
                                        <span>
                                            Status: 
                                            <span style={{ 
                                                marginLeft: '4px',
                                                color: config.last_run_status === 'success' ? '#10b981' : config.last_run_status === 'failed' ? '#ef4444' : '#f59e0b',
                                                fontWeight: 600
                                            }}>
                                                {String(config.last_run_status || 'pending').toUpperCase()}
                                            </span>
                                        </span>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                    <button onClick={() => handleTrigger(config._id)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: '#3b82f6', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <i className="fas fa-play"></i> Run Now
                                    </button>
                                    <button onClick={() => handleOpenModal(config)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                        Edit
                                    </button>
                                    <button onClick={() => handleDelete(config._id)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.15)', background: 'var(--danger-bg)', color: '#ef4444', cursor: 'pointer' }}>
                                        Delete
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {isModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, overflowY: 'auto', padding: '20px 0' }}>
                    <div style={{ background: 'var(--bg-card)', padding: '28px', borderRadius: '12px', width: '650px', maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>{editingConfig ? 'Edit Discovery Config' : 'New Discovery Config'}</h3>
                            <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
                        </div>
                        
                        {/* Section 1: Basic Search */}
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>Configuration Name *</label>
                            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Haryana Distress Deals" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input, transparent)', color: 'var(--text-main)' }} />
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>Keywords (comma separated) *</label>
                            <input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="e.g. urgent sale, distress property, direct owner" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input, transparent)', color: 'var(--text-main)' }} />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>Locations</label>
                                <input value={locationFilters} onChange={e => setLocationFilters(e.target.value)} placeholder="e.g. Sector 8, Kurukshetra" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input, transparent)', color: 'var(--text-main)' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>Property Types</label>
                                <input value={propertyTypes} onChange={e => setPropertyTypes(e.target.value)} placeholder="e.g. Plot, House, Kothi, Flat" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input, transparent)', color: 'var(--text-main)' }} />
                            </div>
                        </div>

                        {/* Section 2: Phase 1 Budget Filter */}
                        <div style={{ background: 'var(--bg-light, rgba(0,0,0,0.02))', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
                            <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-rupee-sign" style={{ color: '#2563eb' }}></i> Budget & Price Range Filter
                            </h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Min Price (₹ INR)</label>
                                    <input 
                                        type="number" 
                                        value={priceMin} 
                                        onChange={e => setPriceMin(e.target.value)} 
                                        placeholder="e.g. 5000000 (50L)" 
                                        min="0"
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input, transparent)', color: 'var(--text-main)' }} 
                                    />
                                    {priceMin && <div style={{ fontSize: '0.7rem', color: '#2563eb', marginTop: '2px' }}>{formatCurrencyINR(priceMin)}</div>}
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Max Price (₹ INR)</label>
                                    <input 
                                        type="number" 
                                        value={priceMax} 
                                        onChange={e => setPriceMax(e.target.value)} 
                                        placeholder="e.g. 20000000 (2Cr)" 
                                        min="0"
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input, transparent)', color: 'var(--text-main)' }} 
                                    />
                                    {priceMax && <div style={{ fontSize: '0.7rem', color: '#2563eb', marginTop: '2px' }}>{formatCurrencyINR(priceMax)}</div>}
                                </div>
                            </div>
                        </div>

                        {/* Section 3: Phase 1 Size Range Filter */}
                        <div style={{ background: 'var(--bg-light, rgba(0,0,0,0.02))', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
                            <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-ruler-combined" style={{ color: '#059669' }}></i> Area / Size Range Filter
                            </h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Min Size</label>
                                    <input 
                                        type="number" 
                                        value={sizeMin} 
                                        onChange={e => setSizeMin(e.target.value)} 
                                        placeholder="e.g. 150" 
                                        min="0"
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input, transparent)', color: 'var(--text-main)' }} 
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Max Size</label>
                                    <input 
                                        type="number" 
                                        value={sizeMax} 
                                        onChange={e => setSizeMax(e.target.value)} 
                                        placeholder="e.g. 350" 
                                        min="0"
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input, transparent)', color: 'var(--text-main)' }} 
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Standard Unit</label>
                                    <select 
                                        value={sizeUnit} 
                                        onChange={e => setSizeUnit(e.target.value)} 
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input, transparent)', color: 'var(--text-main)' }}
                                    >
                                        {SUPPORTED_AREA_UNITS.map(u => (
                                            <option key={u.value} value={u.value}>{u.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Section 4: Portal Whitelist & Seller Types */}
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>Allowed Real Estate Portals (Whitelist)</label>
                            <input 
                                value={portalWhitelist} 
                                onChange={e => setPortalWhitelist(e.target.value)} 
                                placeholder="e.g. 99acres.com, magicbricks.com, housing.com, olx.in" 
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input, transparent)', color: 'var(--text-main)' }} 
                            />
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>Leave blank to allow all discovered domains.</div>
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>Allowed Seller Types</label>
                            <div style={{ display: 'flex', gap: '16px' }}>
                                {SELLER_TYPE_OPTIONS.map(opt => {
                                    const checked = sellerTypes.includes(opt.value);
                                    return (
                                        <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                                            <input 
                                                type="checkbox" 
                                                checked={checked} 
                                                onChange={() => toggleSellerType(opt.value)} 
                                            />
                                            <i className={`fas ${opt.icon}`} style={{ opacity: 0.7 }}></i>
                                            {opt.label}
                                        </label>
                                    );
                                })}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>Leave all unchecked to accept all seller types.</div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>Listing Freshness (Max Days Old)</label>
                                <input 
                                    type="number" 
                                    value={freshnessDays} 
                                    onChange={e => setFreshnessDays(e.target.value)} 
                                    placeholder="e.g. 30" 
                                    min="1" 
                                    max="365"
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input, transparent)', color: 'var(--text-main)' }} 
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>Cron Schedule</label>
                                <input 
                                    value={scheduleCron} 
                                    onChange={e => setScheduleCron(e.target.value)} 
                                    placeholder="0 0 * * *" 
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontFamily: 'monospace', background: 'var(--bg-input, transparent)', color: 'var(--text-main)' }} 
                                />
                            </div>
                        </div>

                        <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} id="isActiveToggle" />
                            <label htmlFor="isActiveToggle" style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>Active / Scheduled Monitoring</label>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button onClick={() => setIsModalOpen(false)} style={{ padding: '10px 20px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                            <button onClick={handleSave} style={{ padding: '10px 20px', borderRadius: '6px', border: 'none', background: '#3b82f6', color: '#ffffff', cursor: 'pointer', fontWeight: 600 }}>Save Config</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DiscoverySettingsPage;
