import { useState, useEffect, useRef } from 'react';
import { api } from '../../../utils/api';
import toast from 'react-hot-toast';

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
        locCity: ''
    });
    const [loading, setLoading] = useState(false);

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
                locCity: lead.locCity || ''
            });
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
                locCity: formData.locCity
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

    const locationsList = lookups?.Location || [];

    // --- Styling matching modern CRM layout ---
    const overlayStyle = {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)',
        zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
    };

    const modalStyle = {
        backgroundColor: '#fff', width: '100%', maxWidth: '650px',
        borderRadius: '24px', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        maxHeight: '90vh', overflowY: 'auto'
    };

    const sectionCardStyle = {
        background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '20px'
    };

    const labelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' };
    const inputStyle = { width: '100%', padding: '12px 16px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none', color: '#1e293b' };
    const customSelectStyle = { ...inputStyle, background: '#fff', cursor: 'pointer' };

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
                        <label style={labelStyle}>Location Details</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Primary Location (Lookup)</label>
                                <select 
                                    style={customSelectStyle} 
                                    value={formData.location}
                                    onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                                >
                                    <option value="">Select Location...</option>
                                    {locationsList.map(l => (
                                        <option key={l._id} value={l._id}>{l.lookup_value}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Area/Sector</label>
                                <input 
                                    type="text" style={inputStyle} value={formData.sector}
                                    placeholder="e.g. Sector 45"
                                    onChange={(e) => setFormData(prev => ({ ...prev, sector: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Locality / Area Name</label>
                                <input 
                                    type="text" style={inputStyle} value={formData.locArea}
                                    placeholder="e.g. Near Main Market"
                                    onChange={(e) => setFormData(prev => ({ ...prev, locArea: e.target.value }))}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>City</label>
                                <input 
                                    type="text" style={inputStyle} value={formData.locCity}
                                    placeholder="e.g. Gurgaon"
                                    onChange={(e) => setFormData(prev => ({ ...prev, locCity: e.target.value }))}
                                />
                            </div>
                        </div>
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
