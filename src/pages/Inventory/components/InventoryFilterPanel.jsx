import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PROPERTY_CATEGORIES } from '../../../data/propertyData';
import { PROJECTS_LIST } from '../../../data/projectData';
import { usePropertyConfig } from '../../../context/PropertyConfigContext';
import { calculateDistance } from '../../../utils/inventoryFilterLogic';

// ==================================================================================
// STYLES
// ==================================================================================
const styles = {
    sectionTitle: {
        fontSize: '0.7rem',
        fontWeight: '700',
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: '10px',
        display: 'block'
    },
    label: {
        display: 'block',
        fontSize: '0.85rem',
        fontWeight: '600',
        color: '#1e293b',
        marginBottom: '6px'
    },
    input: {
        width: '100%',
        padding: '10px 12px',
        fontSize: '0.9rem',
        color: '#0f172a',
        backgroundColor: '#fff',
        border: '1px solid #cbd5e1',
        borderRadius: '8px',
        outline: 'none',
        transition: 'all 0.2s ease',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
    },
    select: {
        width: '100%',
        padding: '10px 12px',
        fontSize: '0.9rem',
        color: '#0f172a',
        backgroundColor: '#fff',
        border: '1px solid #cbd5e1',
        borderRadius: '8px',
        outline: 'none',
        transition: 'all 0.2s ease',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        appearance: 'none',
        backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2364748b\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'/%3e%3c/svg%3e")',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
        backgroundSize: '16px'
    },
    activeBtn: {
        backgroundColor: '#eff6ff',
        borderColor: '#0066ff',
        color: '#0066ff',
        boxShadow: '0 1px 2px rgba(0, 102, 255, 0.1)'
    },
    inactiveBtn: {
        backgroundColor: '#ffffff',
        borderColor: '#e2e8f0',
        color: '#64748b'
    },
    resetBtn: {
        background: 'transparent',
        border: 'none',
        color: '#64748b',
        fontSize: '0.85rem',
        fontWeight: '600',
        cursor: 'pointer',
        textDecoration: 'underline',
        textAlign: 'center'
    },
    applyBtn: {
        width: '100%',
        padding: '14px',
        backgroundColor: '#22c55e',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        fontSize: '0.95rem',
        fontWeight: '700',
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)',
        transition: 'all 0.2s'
    }
};

// ==================================================================================
// COMPONENTS
// ==================================================================================

// MultiSelect Component
const MultiSelectDropdown = ({ options, selected, onChange, placeholder, disabled }) => {
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

    const handleSelect = (option) => {
        if (selected.includes(option)) {
            onChange(selected.filter(item => item !== option));
        } else {
            onChange([...selected, option]);
        }
    };

    const displayText = selected.length > 0
        ? `${selected.length} Selected`
        : placeholder;

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
            <div
                onClick={() => !disabled && setIsOpen(!isOpen)}
                style={{
                    ...styles.input,
                    color: disabled ? '#94a3b8' : '#0f172a',
                    backgroundColor: disabled ? '#f1f5f9' : '#fff',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}
            >
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '90%' }}>
                    {displayText}
                </span>
                <i className={`fas fa-chevron-${isOpen ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#64748b' }}></i>
            </div>

            {isOpen && !disabled && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px',
                    backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', zIndex: 2001, maxHeight: '200px', overflowY: 'auto'
                }}>
                    {options.map(option => (
                        <div
                            key={option}
                            onClick={() => handleSelect(option)}
                            style={{
                                padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                                backgroundColor: selected.includes(option) ? '#eff6ff' : 'transparent',
                                color: selected.includes(option) ? '#0066ff' : '#0f172a', fontSize: '0.9rem'
                            }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = selected.includes(option) ? '#eff6ff' : '#f8fafc'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = selected.includes(option) ? '#eff6ff' : 'transparent'}
                        >
                            <input type="checkbox" checked={selected.includes(option)} readOnly style={{ pointerEvents: 'none' }} />
                            {option}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const InventoryFilterPanel = ({ isOpen, onClose, filters, onFilterChange }) => {
    const { masterFields = {} } = usePropertyConfig();
    const [isVisible, setIsVisible] = useState(false);
    const [sizeMode, setSizeMode] = useState('type'); // 'type' | 'range'

    useEffect(() => {
        if (filters.sizeMode) setSizeMode(filters.sizeMode);
        else if (filters.minSize || filters.maxSize) setSizeMode('range');
        else if (filters.sizeType && filters.sizeType.length > 0) setSizeMode('type');
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
            document.body.style.overflow = 'hidden';
        } else {
            const timer = setTimeout(() => setIsVisible(false), 300);
            document.body.style.overflow = 'unset';
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    const searchInputRef = useRef(null);

    useEffect(() => {
        if (isOpen && searchInputRef.current && window.google) {
            const autocomplete = new window.google.maps.places.Autocomplete(searchInputRef.current, {
                types: ['geocode'],
                fields: ['formatted_address', 'geometry']
            });

            autocomplete.addListener('place_changed', () => {
                const place = autocomplete.getPlace();
                if (place.formatted_address) {
                    const updateObj = { ...filters, location: place.formatted_address };
                    if (place.geometry && place.geometry.location) {
                        updateObj.locationCoords = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() };
                    } else {
                        updateObj.locationCoords = null;
                    }
                    onFilterChange(updateObj);
                }
            });
        }
    }, [isOpen, filters]);

    const updateFilter = (key, value) => {
        onFilterChange({ ...filters, [key]: value });
    };

    const handleReset = () => {
        onFilterChange({});
        setSizeMode('type');
    };

    const selectedCategories = filters.category || [];
    const selectedSubCategories = filters.subCategory || [];

    const availableSubCategories = selectedCategories.length > 0
        ? selectedCategories.reduce((acc, cat) => PROPERTY_CATEGORIES[cat] ? [...acc, ...PROPERTY_CATEGORIES[cat].subCategories.map(sc => sc.name)] : acc, [])
        : [];

    const availableSizeTypes = selectedSubCategories.length > 0
        ? selectedCategories.reduce((acc, cat) => {
            if (PROPERTY_CATEGORIES[cat]) {
                const matchingSubs = PROPERTY_CATEGORIES[cat].subCategories.filter(sc => selectedSubCategories.includes(sc.name));
                const types = matchingSubs.reduce((tAcc, sub) => [...tAcc, ...sub.types.map(t => t.name)], []);
                return [...acc, ...types];
            }
            return acc;
        }, [])
        : [];

    const uniqueSubCategories = [...new Set(availableSubCategories)];
    const uniqueSizeTypes = [...new Set(availableSizeTypes)];

    const getFilteredProjects = () => {
        const projects = PROJECTS_LIST.map(p => p.name);
        if (filters.locationCoords && filters.range && filters.range !== 'Exact') {
            const rangeKm = parseInt(filters.range.replace(/\D/g, ''), 10);
            if (!isNaN(rangeKm)) {
                return PROJECTS_LIST.filter(p => {
                    const dist = calculateDistance(filters.locationCoords.lat, filters.locationCoords.lng, p.lat, p.lng);
                    return dist !== null && dist <= rangeKm;
                }).map(p => p.name);
            }
        }
        return projects;
    };

    const projectOptions = getFilteredProjects();

    if (!isOpen && !isVisible) return null;

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', justifyContent: 'flex-end', fontFamily: "'Inter', sans-serif" }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.3)', opacity: isOpen ? 1 : 0, transition: 'opacity 200ms ease' }} onClick={onClose}></div>
            <div style={{
                position: 'relative', width: '420px', height: '100%', background: '#ffffff', boxShadow: '-10px 0 40px rgba(0,0,0,0.1)',
                display: 'flex', flexDirection: 'column', transform: isOpen ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 300ms cubic-bezier(0.16, 1, 0.3, 1)'
            }}>
                <header style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff' }}>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.025em', margin: 0 }}>Filter Inventory</h2>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px', margin: 0 }}>Real-time filtering enabled</p>
                    </div>
                    <button onClick={onClose} style={{ width: '36px', height: '36px', borderRadius: '50%', border: 'none', background: '#f8fafc', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', transition: 'all 0.2s' }}>
                        <i className="fas fa-times"></i>
                    </button>
                </header>

                <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '32px' }}>

                    {/* 1. Inventory Status */}
                    <section>
                        <span style={styles.sectionTitle}>Status</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {['Active', 'Inactive', 'Sold Out', 'Hold', 'Rented Out'].map(status => {
                                const isActive = filters.status === status;
                                return (
                                    <button
                                        key={status}
                                        onClick={() => updateFilter('status', status === isActive ? '' : status)}
                                        style={{
                                            padding: '8px 16px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', border: '1px solid',
                                            transition: 'all 0.2s', ...(isActive ? styles.activeBtn : styles.inactiveBtn)
                                        }}
                                    >
                                        {status}
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    <div style={{ height: '1px', background: '#f1f5f9' }}></div>

                    {/* 2. Property Information */}
                    <section>
                        <span style={styles.sectionTitle}>Property Information</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={styles.label}>Category</label>
                                <MultiSelectDropdown
                                    options={Object.keys(PROPERTY_CATEGORIES)}
                                    selected={filters.category || []}
                                    onChange={(val) => {
                                        onFilterChange({ ...filters, category: val, subCategory: [], sizeType: [] });
                                    }}
                                    placeholder="Select Categories"
                                />
                            </div>
                            <div>
                                <label style={styles.label}>Sub Category</label>
                                <MultiSelectDropdown
                                    options={uniqueSubCategories}
                                    selected={filters.subCategory || []}
                                    onChange={(val) => {
                                        onFilterChange({ ...filters, subCategory: val, sizeType: [] });
                                    }}
                                    placeholder="Select Sub-Categories"
                                    disabled={selectedCategories.length === 0}
                                />
                            </div>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <label style={{ ...styles.label, marginBottom: 0 }}>Size</label>
                                    <div style={{ display: 'flex', backgroundColor: '#f1f5f9', padding: '2px', borderRadius: '6px' }}>
                                        <button onClick={() => { setSizeMode('type'); updateFilter('sizeMode', 'type'); }} style={{ padding: '4px 12px', fontSize: '0.75rem', borderRadius: '4px', border: 'none', fontWeight: '600', cursor: 'pointer', backgroundColor: sizeMode === 'type' ? '#fff' : 'transparent', color: sizeMode === 'type' ? '#0f172a' : '#64748b', boxShadow: sizeMode === 'type' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}>Type</button>
                                        <button onClick={() => { setSizeMode('range'); updateFilter('sizeMode', 'range'); }} style={{ padding: '4px 12px', fontSize: '0.75rem', borderRadius: '4px', border: 'none', fontWeight: '600', cursor: 'pointer', backgroundColor: sizeMode === 'range' ? '#fff' : 'transparent', color: sizeMode === 'range' ? '#0f172a' : '#64748b', boxShadow: sizeMode === 'range' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}>Min/Max</button>
                                    </div>
                                </div>
                                {sizeMode === 'type' ? (
                                    <MultiSelectDropdown
                                        options={uniqueSizeTypes}
                                        selected={filters.sizeType || []}
                                        onChange={(val) => {
                                            const newFilters = { ...filters, sizeType: val };
                                            delete newFilters.minSize;
                                            delete newFilters.maxSize;
                                            onFilterChange(newFilters);
                                        }}
                                        placeholder="Select Size Types"
                                        disabled={selectedSubCategories.length === 0}
                                    />
                                ) : (
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <div style={{ flex: 1 }}>
                                            <input type="text" placeholder="Min Size" style={styles.input} value={filters.minSize || ''} onChange={(e) => {
                                                const newFilters = { ...filters, minSize: e.target.value };
                                                delete newFilters.sizeType;
                                                onFilterChange(newFilters);
                                            }} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <input type="text" placeholder="Max Size" style={styles.input} value={filters.maxSize || ''} onChange={(e) => {
                                                const newFilters = { ...filters, maxSize: e.target.value };
                                                delete newFilters.sizeType;
                                                onFilterChange(newFilters);
                                            }} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    <div style={{ height: '1px', background: '#f1f5f9' }}></div>

                    {/* 3. Location & Project */}
                    <section>
                        <span style={styles.sectionTitle}>Location & Project</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={styles.label}>Location</label>
                                    <div style={{ position: 'relative' }}>
                                        <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.9rem' }}></i>
                                        <input
                                            ref={searchInputRef}
                                            type="text"
                                            placeholder="Search location..."
                                            style={{ ...styles.input, paddingLeft: '36px' }}
                                            value={filters.location || ''}
                                            onChange={(e) => updateFilter('location', e.target.value)}
                                            onFocus={e => e.target.style.borderColor = '#0066ff'}
                                            onBlur={e => e.target.style.borderColor = '#cbd5e1'}
                                        />
                                    </div>
                                </div>
                                <div style={{ width: '130px' }}>
                                    <label style={styles.label}>Range</label>
                                    <select style={styles.select} value={filters.range || 'Exact'} onChange={(e) => updateFilter('range', e.target.value)}>
                                        <option value="Exact">Exact</option>
                                        <option value="Within 1 km">Within 1 km</option>
                                        <option value="Within 2 km">Within 2 km</option>
                                        <option value="Within 5 km">Within 5 km</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label style={styles.label}>
                                    Project Name
                                    {filters.location && filters.range !== 'Exact' && (
                                        <span style={{ fontSize: '0.75rem', fontWeight: '400', color: '#22c55e', marginLeft: '6px' }}>(Filtered by Location)</span>
                                    )}
                                </label>
                                <select style={styles.select} value={filters.project || ''} onChange={(e) => updateFilter('project', e.target.value)}>
                                    <option value="">Select Project</option>
                                    {projectOptions.map(proj => (
                                        <option key={proj} value={proj}>{proj}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </section>

                    <div style={{ height: '1px', background: '#f1f5f9' }}></div>

                    {/* 4. Orientation */}
                    <section>
                        <span style={styles.sectionTitle}>Orientation</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={styles.label}>Direction</label>
                                <MultiSelectDropdown
                                    options={masterFields.directions || []}
                                    selected={filters.direction || []}
                                    onChange={(val) => updateFilter('direction', val)}
                                    placeholder="Select Directions"
                                />
                            </div>
                            <div>
                                <label style={styles.label}>Road Width</label>
                                <MultiSelectDropdown
                                    options={masterFields.roadWidths || []}
                                    selected={filters.roadWidth || []}
                                    onChange={(val) => updateFilter('roadWidth', val)}
                                    placeholder="Select Road Widths"
                                />
                            </div>
                            <div>
                                <label style={styles.label}>Facing</label>
                                <MultiSelectDropdown
                                    options={masterFields.facings || []}
                                    selected={filters.facing || []}
                                    onChange={(val) => updateFilter('facing', val)}
                                    placeholder="Select Facings"
                                />
                            </div>
                        </div>
                    </section>

                    <div style={{ height: '1px', background: '#f1f5f9' }}></div>

                    {/* 5. Feedback & Activity */}
                    <section>
                        <span style={styles.sectionTitle}>Feedback & Activity</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={styles.label}>Feedback Outcome</label>
                                <select
                                    style={styles.select}
                                    value={filters.feedbackOutcome || ''}
                                    onChange={(e) => {
                                        updateFilter('feedbackOutcome', e.target.value);
                                        updateFilter('feedbackReason', '');
                                    }}
                                >
                                    <option value="">Select Outcome</option>
                                    {masterFields.propertyOwnerFeedback?.map(outcome => (
                                        <option key={outcome} value={outcome}>{outcome}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Specific Reason */}
                            {filters.feedbackOutcome && masterFields.feedbackReasons?.[filters.feedbackOutcome] && (
                                <div className="animate-fade-in">
                                    <label style={styles.label}>Specific Reason</label>
                                    <MultiSelectDropdown
                                        options={masterFields.feedbackReasons[filters.feedbackOutcome]}
                                        selected={filters.feedbackReason || []}
                                        onChange={(val) => updateFilter('feedbackReason', val)}
                                        placeholder="Select Reasons"
                                    />
                                </div>
                            )}

                            {/* Follow-up Date Range */}
                            <div>
                                <label style={styles.label}>Follow-up Date</label>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <div style={{ flex: 1 }}>
                                        <input
                                            type="date"
                                            style={styles.input}
                                            value={filters.followUpFrom || ''}
                                            onChange={(e) => updateFilter('followUpFrom', e.target.value)}
                                            placeholder="From"
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <input
                                            type="date"
                                            style={styles.input}
                                            value={filters.followUpTo || ''}
                                            onChange={(e) => updateFilter('followUpTo', e.target.value)}
                                            placeholder="To"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                <footer style={{ padding: '24px', borderTop: '1px solid #e2e8f0', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button onClick={onClose} style={styles.applyBtn}>
                        View {Object.keys(filters).length > 0 ? 'Filtered Results' : 'All Inventory'}
                    </button>
                    <button onClick={handleReset} style={styles.resetBtn}>
                        Reset All Filters
                    </button>
                </footer>
            </div>
        </div>,
        document.body
    );
};

export default InventoryFilterPanel;
