import { useState, useEffect, useRef } from 'react';
import { api } from '../../../utils/api';
import toast from 'react-hot-toast';
import { usePropertyConfig } from '../../../context/PropertyConfigContext';

const BUDGET_VALUES = [
    { value: 500000, label: "5 Lakh" },
    { value: 2500000, label: "25 Lakh" },
    { value: 5000000, label: "50 Lakh" },
    { value: 7500000, label: "75 Lakh" },
    { value: 10000000, label: "1 Crore" },
    { value: 15000000, label: "1.5 Crore" },
    { value: 20000000, label: "2 Crore" },
    { value: 25000000, label: "2.5 Crore" },
    { value: 30000000, label: "3 Crore" },
    { value: 35000000, label: "3.5 Crore" },
    { value: 40000000, label: "4 Crore" },
    { value: 45000000, label: "4.5 Crore" },
    { value: 50000000, label: "5 Crore" },
    { value: 55000000, label: "5.5 Crore" },
    { value: 60000000, label: "6 Crore" },
    { value: 70000000, label: "7 Crore" },
    { value: 80000000, label: "8 Crore" },
    { value: 90000000, label: "9 Crore" },
    { value: 100000000, label: "10 Crore" },
    { value: 200000000, label: "20 Crore" },
    { value: 300000000, label: "30 Crore" },
    { value: 500000000, label: "50 Crore" },
    { value: 750000000, label: "75 Crore" },
    { value: 1000000000, label: "100 Crore" }
];

// --- Local Re-usable UI Components matching AddLeadModal ---

const AnimatedSegmentControl = ({ options, value, onChange }) => {
    const [activeIndex, setActiveIndex] = useState(options.indexOf(value));

    useEffect(() => {
        setActiveIndex(options.indexOf(value));
    }, [value, options]);

    const handleSelect = (option, index) => {
        setActiveIndex(index);
        onChange(option);
    };

    return (
        <div style={{
            position: 'relative',
            display: 'flex',
            background: '#f1f5f9',
            borderRadius: '12px',
            padding: '4px',
            border: '1px solid #e2e8f0',
            height: '48px',
            isolation: 'isolate'
        }}>
            <div style={{
                position: 'absolute',
                top: '4px',
                bottom: '4px',
                left: `calc(${activeIndex * (100 / options.length)}% + 4px)`,
                width: `calc(${100 / options.length}% - 8px)`,
                background: '#fff',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                zIndex: 1
            }} />

            {options.map((option, index) => (
                <button
                    key={option}
                    type="button"
                    onClick={() => handleSelect(option, index)}
                    style={{
                        flex: 1,
                        position: 'relative',
                        zIndex: 2,
                        background: 'transparent',
                        border: 'none',
                        fontSize: '0.95rem',
                        fontWeight: value === option ? 600 : 500,
                        color: value === option ? '#0f172a' : '#64748b',
                        cursor: 'pointer',
                        transition: 'color 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    {option}
                </button>
            ))}
        </div>
    );
};

const CustomMultiSelect = ({ options, value, onChange, placeholder, disabled, allowSelectAll = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const toggleOption = (option) => {
        const safeValue = Array.isArray(value) ? value : [];
        const newValue = safeValue.includes(option)
            ? safeValue.filter(v => v !== option)
            : [...safeValue, option];
        onChange(newValue);
    };

    return (
        <div ref={containerRef} style={{ position: 'relative' }}>
            <div
                onClick={() => !disabled && setIsOpen(!isOpen)}
                style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    color: '#334155',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    background: disabled ? '#f8fafc' : '#fff',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    minHeight: '40px'
                }}
            >
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '8px' }}>
                    {Array.isArray(value) && value.length > 0 ? value.join(', ') : <span style={{ color: '#94a3b8' }}>{placeholder}</span>}
                </div>
                <i className={`fas fa-chevron-down ${isOpen ? 'fa-rotate-180' : ''}`} style={{ color: '#94a3b8', transition: 'transform 0.2s', fontSize: '0.8rem' }}></i>
            </div>

            {isOpen && !disabled && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', marginTop: '4px', zIndex: 100, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                    {allowSelectAll && options.length > 0 && (
                        <div
                            onClick={() => {
                                const safeValue = Array.isArray(value) ? value : [];
                                if (safeValue.length === options.length) {
                                    onChange([]);
                                } else {
                                    onChange([...options]);
                                }
                            }}
                            style={{
                                padding: '10px 12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                borderBottom: '2px solid #e2e8f0',
                                background: '#f8fafc',
                                fontWeight: 600
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={Array.isArray(value) && value.length === options.length && options.length > 0}
                                readOnly
                                style={{ width: '14px', height: '14px', cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: '0.9rem', color: '#0f172a' }}>Select All</span>
                        </div>
                    )}
                    {options.length > 0 ? options.map(opt => (
                        <div
                            key={opt}
                            onClick={() => toggleOption(opt)}
                            style={{
                                padding: '10px 12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                borderBottom: '1px solid #f1f5f9',
                                background: Array.isArray(value) && value.includes(opt) ? '#f8fafc' : '#fff'
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={Array.isArray(value) && value.includes(opt)}
                                readOnly
                                style={{ width: '14px', height: '14px', cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: '0.9rem', color: '#334155' }}>{opt}</span>
                        </div>
                    )) : (
                        <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>No options available</div>
                    )}
                </div>
            )}
        </div>
    );
};

// --- Main QuickFillModal Component ---

const QuickFillModal = ({ isOpen, onClose, lead, onUpdate, getLookupValue, getLookupId, propertyConfig, lookups }) => {
    const { projects: allProjects } = usePropertyConfig();
    const [locationTab, setLocationTab] = useState('search');
    const [projectData, setProjectData] = useState({});
    const [cities, setCities] = useState([]);
    const searchInputRef = useRef(null);

    const [formData, setFormData] = useState({
        requirement: 'Buy',
        propertyType: [], // category names, e.g. ['Residential']
        subType: [],      // subCategory names, e.g. ['Apartment']
        sizeType: [],     // size names, e.g. ['3 BHK']
        budgetMin: '',
        budgetMax: '',
        areaMin: '',
        areaMax: '',
        areaMetric: 'Sq Yard',
        location: '',     // Location lookup ID
        sector: '',
        locArea: '',
        locCity: '',
        searchLocation: '',
        locStreet: '',
        locHNo: '',
        range: 'Within 3 km',
        locPinCode: '',
        locState: '',
        locCountry: '',
        locLat: '',
        locLng: '',
        projectName: [],
        projectCity: ''
    });
    const [loading, setLoading] = useState(false);

    // Initialize Project & Cities lists from Context
    useEffect(() => {
        if (allProjects && allProjects.length > 0) {
            const grouped = allProjects.reduce((acc, project) => {
                let cityName = 'Other';
                const rawCity = project.address?.city;
                if (rawCity) {
                    cityName = getLookupValue('City', rawCity) || rawCity;
                }

                if (!acc[cityName]) acc[cityName] = [];
                const safeBlocks = (project.blocks || []).map(b =>
                    typeof b === 'object' ? (b.name || '') : b
                ).filter(Boolean);

                acc[cityName].push({
                    ...project,
                    towers: safeBlocks
                });
                return acc;
            }, {});

            setProjectData(grouped);
            setCities(Object.keys(grouped).sort());
        }
    }, [allProjects, getLookupValue]);

    // Setup autocomplete search list
    useEffect(() => {
        if (isOpen && locationTab === 'search' && searchInputRef.current && window.google) {
            const autocomplete = new window.google.maps.places.Autocomplete(searchInputRef.current, {
                types: ['geocode'],
                fields: ['address_components', 'geometry', 'formatted_address']
            });

            autocomplete.addListener('place_changed', () => {
                const place = autocomplete.getPlace();
                if (!place.geometry) {
                    console.log("Returned place contains no geometry");
                    return;
                }

                const addressComponents = place.address_components;
                let city = '', state = '', country = '', zipcode = '', area = '';
                addressComponents.forEach(component => {
                    const types = component.types;
                    if (types.includes('locality')) city = component.long_name;
                    if (types.includes('sublocality_level_1')) area = component.long_name;
                    if (types.includes('administrative_area_level_1')) state = component.long_name;
                    if (types.includes('country')) country = component.long_name;
                    if (types.includes('postal_code')) zipcode = component.long_name;
                });

                setFormData(prev => ({
                    ...prev,
                    searchLocation: place.formatted_address,
                    locCity: city,
                    locArea: area || city,
                    locState: state,
                    locCountry: country,
                    locPinCode: zipcode,
                    locLat: place.geometry.location.lat(),
                    locLng: place.geometry.location.lng()
                }));
            });
        }
    }, [isOpen, locationTab]);

    useEffect(() => {
        if (lead) {
            // Map backend lookup IDs to readable values for the UI
            const uiReq = getLookupValue('Requirement', lead.requirement) || 'Buy';
            const uiCats = Array.isArray(lead.propertyType)
                ? lead.propertyType.map(id => getLookupValue('Category', id)).filter(Boolean)
                : [];
            const uiSubs = Array.isArray(lead.subType)
                ? lead.subType.map(id => getLookupValue('SubCategory', id)).filter(Boolean)
                : [];
            const uiSizes = Array.isArray(lead.sizeType)
                ? lead.sizeType.map(id => getLookupValue('Size', id)).filter(Boolean)
                : [];

            setFormData({
                requirement: uiReq,
                propertyType: uiCats,
                subType: uiSubs,
                sizeType: uiSizes,
                budgetMin: lead.budgetMin || '',
                budgetMax: lead.budgetMax || '',
                areaMin: lead.areaMin || '',
                areaMax: lead.areaMax || '',
                areaMetric: lead.areaMetric || 'Sq Yard',
                location: lead.location?._id || lead.location || '',
                sector: lead.sector || '',
                locArea: lead.locArea || '',
                locCity: lead.locCity || '',
                searchLocation: lead.searchLocation || '',
                locStreet: lead.locStreet || '',
                locHNo: lead.locHNo || '',
                range: lead.range || 'Within 3 km',
                locPinCode: lead.locPinCode || '',
                locState: lead.locState || '',
                locCountry: lead.locCountry || '',
                locLat: lead.locLat || '',
                locLng: lead.locLng || '',
                projectName: lead.projectName || [],
                projectCity: lead.projectCity || ''
            });

            if (lead.projectName && lead.projectName.length > 0) {
                setLocationTab('select');
            } else {
                setLocationTab('search');
            }
        }
    }, [lead, isOpen, getLookupValue]);

    if (!isOpen) return null;

    const handleSave = async () => {
        setLoading(true);
        try {
            // Map names back to database lookup IDs
            const payload = {
                requirement: getLookupId('Requirement', formData.requirement) || formData.requirement,
                propertyType: (formData.propertyType || []).map(v => getLookupId('Category', v) || v).filter(Boolean),
                subType: (formData.subType || []).map(v => getLookupId('SubCategory', v) || v).filter(Boolean),
                sizeType: (formData.sizeType || []).map(v => getLookupId('Size', v) || v).filter(Boolean),
                location: formData.location || null,
                budgetMin: formData.budgetMin ? Number(formData.budgetMin) : 0,
                budgetMax: formData.budgetMax ? Number(formData.budgetMax) : 0,
                areaMin: formData.areaMin ? Number(formData.areaMin) : 0,
                areaMax: formData.areaMax ? Number(formData.areaMax) : 0,
                areaMetric: formData.areaMetric,
                sector: formData.sector,
                locArea: formData.locArea,
                locCity: formData.locCity,
                // Include newly added fields
                projectName: formData.projectName,
                projectCity: formData.projectCity,
                searchLocation: formData.searchLocation,
                locStreet: formData.locStreet,
                locHNo: formData.locHNo,
                range: formData.range,
                locPinCode: formData.locPinCode,
                locState: formData.locState,
                locCountry: formData.locCountry,
                locLat: formData.locLat,
                locLng: formData.locLng
            };

            const res = await api.put(`leads/${lead._id}`, payload);
            if (res.data?.success) {
                toast.success('Lead requirement updated successfully');
                onUpdate(res.data.data);
                onClose();
            }
        } catch (err) {
            toast.error('Failed to update lead');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleProjectCityChange = (city) => {
        setFormData(prev => ({
            ...prev,
            projectCity: city,
            projectName: []
        }));
    };

    const handleProjectSelectionChange = (projects) => {
        setFormData(prev => ({
            ...prev,
            projectName: projects
        }));
    };

    const availableProjects = formData.projectCity && projectData[formData.projectCity]
        ? projectData[formData.projectCity].map(p => p.name)
        : [];

    // --- Options Calculators matching AddLeadModal ---
    const categoriesList = propertyConfig && Object.keys(propertyConfig).length > 0 
        ? Object.keys(propertyConfig) 
        : ['Residential', 'Commercial', 'Industrial', 'Agricultural', 'Institutional'];

    const subCategoriesList = Array.from(
        new Set(formData.propertyType.flatMap(cat => propertyConfig[cat]?.subCategories.map(sub => sub.name) || []))
    );

    const sizeTypesOptions = (() => {
        if (formData.subType.length === 0) return [];
        const allRawTypes = formData.subType.flatMap(subName => {
            for (const cat of Object.values(propertyConfig)) {
                const foundSub = cat.subCategories.find(s => s.name === subName);
                if (foundSub) return foundSub.types.map(t => typeof t === 'string' ? t : t.name) || [];
            }
            return [];
        });
        return Array.from(new Set(allRawTypes)).sort();
    })();

    // --- Styling matching modern CRM layout ---
    const overlayStyle = {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)',
        zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
    };

    const modalStyle = {
        backgroundColor: '#fff', width: '100%', maxWidth: '680px',
        borderRadius: '24px', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        maxHeight: '90vh', overflowY: 'auto'
    };

    const sectionCardStyle = {
        background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '20px'
    };

    const labelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' };
    const inputStyle = { width: '100%', padding: '12px 16px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none', color: '#1e293b', boxSizing: 'border-box' };
    
    const customSelectStyle = {
        width: '100%',
        padding: '12px 16px',
        paddingRight: '30px',
        borderRadius: '10px',
        border: '1px solid #cbd5e1',
        fontSize: '0.9rem',
        outline: 'none',
        background: '#fff',
        color: '#1e293b',
        appearance: 'none',
        WebkitAppearance: 'none',
        MozAppearance: 'none',
        backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23475569%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
        backgroundSize: '12px',
        cursor: 'pointer',
        boxSizing: 'border-box'
    };

    return (
        <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div style={modalStyle} className="no-scrollbar">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <i className="fas fa-clipboard-list" style={{ color: '#2563eb', fontSize: '1.25rem' }}></i>
                        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Quick Fill Requirement</h2>
                    </div>
                    <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '1.25rem' }}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {/* REQUIREMENT CARD */}
                    <div style={sectionCardStyle}>
                        <label style={labelStyle}>Requirement Type</label>
                        <AnimatedSegmentControl
                            options={['Buy', 'Rent', 'Lease']}
                            value={formData.requirement}
                            onChange={(val) => setFormData(prev => ({ ...prev, requirement: val }))}
                        />
                    </div>

                    {/* PROPERTY CATEGORY CARD */}
                    <div style={sectionCardStyle}>
                        <label style={labelStyle}>Property Category</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px' }}>
                            {categoriesList.map(catLabel => {
                                const iconMap = {
                                    'Residential': 'fa-home',
                                    'Commercial': 'fa-building',
                                    'Industrial': 'fa-industry',
                                    'Agricultural': 'fa-seedling',
                                    'Institutional': 'fa-university'
                                };
                                const isSelected = formData.propertyType.includes(catLabel);
                                return (
                                    <button
                                        key={catLabel}
                                        type="button"
                                        onClick={() => {
                                            const newCats = isSelected
                                                ? formData.propertyType.filter(c => c !== catLabel)
                                                : [...formData.propertyType, catLabel];
                                            setFormData(prev => ({ ...prev, propertyType: newCats, subType: [] })); // reset subType on category change
                                        }}
                                        style={{
                                            padding: '10px 8px',
                                            borderRadius: '10px',
                                            border: isSelected ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                                            background: isSelected ? '#eff6ff' : '#fff',
                                            color: isSelected ? '#2563eb' : '#64748b',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: '6px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            minHeight: '60px'
                                        }}
                                    >
                                        <i className={`fas ${iconMap[catLabel] || 'fa-tag'}`} style={{ fontSize: '1rem' }}></i>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{catLabel}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* PROPERTY SUB-CATEGORY CARD */}
                    {formData.propertyType.length > 0 && (
                        <div style={sectionCardStyle}>
                            <label style={labelStyle}>Property Sub-Category</label>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {subCategoriesList.map(sub => {
                                    const isSelected = formData.subType.includes(sub);
                                    return (
                                        <button
                                            key={sub}
                                            type="button"
                                            onClick={() => {
                                                const newSubs = isSelected
                                                    ? formData.subType.filter(s => s !== sub)
                                                    : [...formData.subType, sub];
                                                setFormData(prev => ({ ...prev, subType: newSubs, sizeType: [] })); // reset sizes on subType change
                                            }}
                                            style={{
                                                padding: '8px 16px',
                                                borderRadius: '20px',
                                                border: isSelected ? '1px solid #2563eb' : '1px solid #cbd5e1',
                                                background: isSelected ? '#eff6ff' : '#fff',
                                                color: isSelected ? '#2563eb' : '#475569',
                                                fontSize: '0.85rem',
                                                cursor: 'pointer',
                                                fontWeight: isSelected ? 600 : 500,
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {sub}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* SIZE TYPE & AREA METRIC */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <div style={sectionCardStyle}>
                            <label style={labelStyle}>Size Type</label>
                            <CustomMultiSelect
                                options={sizeTypesOptions}
                                value={formData.sizeType}
                                onChange={(val) => setFormData(prev => ({ ...prev, sizeType: val }))}
                                placeholder={formData.subType.length > 0 ? "Select Sizes..." : "Select Sub-Category First"}
                                disabled={formData.subType.length === 0}
                            />
                        </div>

                        <div style={sectionCardStyle}>
                            <label style={labelStyle}>Area Range</label>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <input
                                    type="number"
                                    value={formData.areaMin}
                                    onChange={(e) => setFormData(prev => ({ ...prev, areaMin: e.target.value }))}
                                    placeholder="Min"
                                    style={{ ...inputStyle, padding: '10px' }}
                                />
                                <span style={{ color: '#94a3b8' }}>-</span>
                                <input
                                    type="number"
                                    value={formData.areaMax}
                                    onChange={(e) => setFormData(prev => ({ ...prev, areaMax: e.target.value }))}
                                    placeholder="Max"
                                    style={{ ...inputStyle, padding: '10px' }}
                                />
                                <div style={{ width: '110px' }}>
                                    <select
                                        value={formData.areaMetric}
                                        onChange={(e) => setFormData(prev => ({ ...prev, areaMetric: e.target.value }))}
                                        style={{ ...customSelectStyle, padding: '10px' }}
                                    >
                                        <option value="Sq Yard">Sq Yard</option>
                                        <option value="Sq Feet">Sq Feet</option>
                                        <option value="Sq Meter">Sq Meter</option>
                                        <option value="Marla">Marla</option>
                                        <option value="Kanal">Kanal</option>
                                        <option value="Acre">Acre</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* BUDGET RANGE CARD */}
                    <div style={sectionCardStyle}>
                        <label style={labelStyle}>Budget Range</label>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <select
                                value={formData.budgetMin}
                                onChange={(e) => {
                                    const min = e.target.value;
                                    setFormData(prev => ({
                                        ...prev,
                                        budgetMin: min,
                                        budgetMax: prev.budgetMax && Number(prev.budgetMax) <= Number(min) ? '' : prev.budgetMax
                                    }));
                                }}
                                style={customSelectStyle}
                            >
                                <option value="">Min Budget</option>
                                {BUDGET_VALUES.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                            <span style={{ color: '#cbd5e1', fontWeight: 600 }}>-</span>
                            <select
                                value={formData.budgetMax}
                                onChange={(e) => setFormData(prev => ({ ...prev, budgetMax: e.target.value }))}
                                style={customSelectStyle}
                                disabled={!formData.budgetMin}
                            >
                                <option value="">Max Budget</option>
                                {BUDGET_VALUES.filter(opt => !formData.budgetMin || opt.value > Number(formData.budgetMin)).map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* LOCATION DETAILS CARD */}
                    <div style={sectionCardStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <label style={{ ...labelStyle, marginBottom: 0 }}>Location Details</label>
                            <div style={{ background: '#e2e8f0', padding: '3px', borderRadius: '8px', display: 'flex', gap: '4px' }}>
                                <button
                                    type="button"
                                    onClick={() => setLocationTab('search')}
                                    style={{
                                        padding: '6px 14px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: locationTab === 'search' ? '#fff' : 'transparent',
                                        color: locationTab === 'search' ? '#2563eb' : '#64748b',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        fontSize: '0.8rem',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    Search Location
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setLocationTab('select')}
                                    style={{
                                        padding: '6px 14px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: locationTab === 'select' ? '#fff' : 'transparent',
                                        color: locationTab === 'select' ? '#2563eb' : '#64748b',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        fontSize: '0.8rem',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    Select Project
                                </button>
                            </div>
                        </div>

                        {locationTab === 'search' ? (
                            <div>
                                <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '6px', fontWeight: 600 }}>Search Location (Google Maps)</label>
                                        <input
                                            ref={searchInputRef}
                                            type="text"
                                            value={formData.searchLocation}
                                            onChange={(e) => setFormData(prev => ({ ...prev, searchLocation: e.target.value }))}
                                            placeholder="Search area, city or landmark..."
                                            style={{
                                                ...inputStyle,
                                                paddingLeft: '36px',
                                                backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%2394a3b8\' stroke-width=\'2\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' d=\'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z\' /%3E%3C/svg%3E")',
                                                backgroundRepeat: 'no-repeat',
                                                backgroundPosition: '12px center',
                                                backgroundSize: '16px'
                                            }}
                                        />
                                    </div>
                                    <div style={{ width: '140px' }}>
                                        <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '6px', fontWeight: 600 }}>Range</label>
                                        <select
                                            value={formData.range}
                                            onChange={(e) => setFormData(prev => ({ ...prev, range: e.target.value }))}
                                            style={customSelectStyle}
                                        >
                                            <option value="0 km">Exact</option>
                                            <option value="Within 1 km">0-1 km</option>
                                            <option value="Within 2 km">0-2 km</option>
                                            <option value="Within 3 km">0-3 km</option>
                                            <option value="Within 5 km">0-5 km</option>
                                        </select>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '6px', fontWeight: 600 }}>House/Flat No.</label>
                                        <input
                                            type="text"
                                            value={formData.locHNo}
                                            onChange={(e) => setFormData(prev => ({ ...prev, locHNo: e.target.value }))}
                                            placeholder="H.No"
                                            style={inputStyle}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '6px', fontWeight: 600 }}>Street/Road</label>
                                        <input
                                            type="text"
                                            value={formData.locStreet}
                                            onChange={(e) => setFormData(prev => ({ ...prev, locStreet: e.target.value }))}
                                            placeholder="Street Name"
                                            style={inputStyle}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '6px', fontWeight: 600 }}>Area/Sector</label>
                                        <input
                                            type="text"
                                            value={formData.sector}
                                            onChange={(e) => setFormData(prev => ({ ...prev, sector: e.target.value }))}
                                            placeholder="e.g. Sector 45"
                                            style={inputStyle}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '6px', fontWeight: 600 }}>City</label>
                                        <input
                                            type="text"
                                            value={formData.locCity}
                                            onChange={(e) => setFormData(prev => ({ ...prev, locCity: e.target.value }))}
                                            placeholder="City"
                                            style={inputStyle}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '6px', fontWeight: 600 }}>State</label>
                                        <input
                                            type="text"
                                            value={formData.locState}
                                            onChange={(e) => setFormData(prev => ({ ...prev, locState: e.target.value }))}
                                            placeholder="State"
                                            style={inputStyle}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '6px', fontWeight: 600 }}>Pin Code</label>
                                        <input
                                            type="text"
                                            value={formData.locPinCode}
                                            onChange={(e) => setFormData(prev => ({ ...prev, locPinCode: e.target.value }))}
                                            placeholder="Pincode"
                                            style={inputStyle}
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '6px', fontWeight: 600 }}>Select City</label>
                                    <select
                                        value={formData.projectCity}
                                        onChange={(e) => handleProjectCityChange(e.target.value)}
                                        style={customSelectStyle}
                                    >
                                        <option value="">Select City</option>
                                        {cities.map(city => (
                                            <option key={city} value={city}>{city}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '6px', fontWeight: 600 }}>Select Projects</label>
                                    <CustomMultiSelect
                                        options={availableProjects}
                                        value={formData.projectName}
                                        onChange={handleProjectSelectionChange}
                                        placeholder={formData.projectCity ? "Select Projects" : "Select City First"}
                                        disabled={!formData.projectCity}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                </div>

                <div style={{ display: 'flex', gap: '16px', marginTop: '28px' }}>
                    <button
                        onClick={onClose}
                        style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s' }}
                        onMouseOver={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                        onMouseOut={(e) => { e.currentTarget.style.background = '#fff'; }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        style={{ flex: 2, padding: '14px', borderRadius: '12px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.3)', transition: 'background 0.2s' }}
                        onMouseOver={(e) => { e.currentTarget.style.background = '#1d4ed8'; }}
                        onMouseOut={(e) => { e.currentTarget.style.background = '#2563eb'; }}
                    >
                        {loading ? 'Updating...' : 'Update Lead'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuickFillModal;
