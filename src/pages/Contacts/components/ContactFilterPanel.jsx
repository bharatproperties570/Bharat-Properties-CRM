import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePropertyConfig } from '../../../context/PropertyConfigContext';
import { useContactConfig } from '../../../context/ContactConfigContext';

// ==================================================================================
// STYLES (Standardized Premium Side Panel)
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

const ContactFilterPanel = ({ isOpen, onClose, filters, onFilterChange }) => {
    const { masterFields } = usePropertyConfig();
    const { professionalConfig } = useContactConfig();
    const [isVisible, setIsVisible] = useState(false);

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

    const updateFilter = (key, value) => {
        onFilterChange({ ...filters, [key]: value });
    };

    const toggleFilterArray = (key, value) => {
        const current = filters[key] || [];
        if (current.includes(value)) {
            updateFilter(key, current.filter(item => item !== value));
        } else {
            updateFilter(key, [...current, value]);
        }
    };

    const handleReset = () => {
        onFilterChange({});
    };

    const statusOptions = masterFields.statuses || ['Active', 'Inactive', 'Pending', 'Closed'];
    const sourceOptions = masterFields.sources || ['Direct', 'Referral', 'Website', 'Facebook', 'Walk-in'];
    const professionOptions = professionalConfig?.categories?.map(c => c.name) || ['Business', 'Salaried', 'Self Employed', 'Doctor', 'Lawyer', 'Govt. Service'];

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
                        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.025em', margin: 0 }}>Filter Contacts</h2>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px', margin: 0 }}>Real-time filtering enabled</p>
                    </div>
                    <button onClick={onClose} style={{ width: '36px', height: '36px', borderRadius: '50%', border: 'none', background: '#f8fafc', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', transition: 'all 0.2s' }}>
                        <i className="fas fa-times"></i>
                    </button>
                </header>

                <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '32px' }}>

                    {/* 1. Status & Source */}
                    <section>
                        <span style={styles.sectionTitle}>Status</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
                            {statusOptions.map(status => {
                                const isActive = (filters.status || []).includes(status);
                                return (
                                    <button
                                        key={status}
                                        onClick={() => toggleFilterArray('status', status)}
                                        style={{
                                            padding: '8px 16px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', border: '1px solid',
                                            transition: 'all 0.2s', ...(isActive ? styles.activeBtn : styles.inactiveBtn)
                                        }}
                                    >
                                        {status}
                                    </button>
                                );
                            })}
                        </div>

                        <span style={styles.sectionTitle}>Source</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                            {sourceOptions.map(src => {
                                const isActive = (filters.source || []).includes(src);
                                return (
                                    <button
                                        key={src}
                                        onClick={() => toggleFilterArray('source', src)}
                                        style={{
                                            padding: '8px 16px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', border: '1px solid',
                                            transition: 'all 0.2s', ...(isActive ? styles.activeBtn : styles.inactiveBtn)
                                        }}
                                    >
                                        {src}
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    <div style={{ height: '1px', background: '#f1f5f9' }}></div>

                    {/* 2. Professional Details */}
                    <section>
                        <span style={styles.sectionTitle}>Professional Details</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={styles.label}>Profession</label>
                                <MultiSelectDropdown
                                    options={professionOptions}
                                    selected={filters.professionCategory || []}
                                    onChange={(val) => updateFilter('professionCategory', val)}
                                    placeholder="Select Professions"
                                />
                            </div>
                            <div>
                                <label style={styles.label}>Company / Organization</label>
                                <input
                                    type="text"
                                    placeholder="Search Company..."
                                    style={styles.input}
                                    value={filters.company || ''}
                                    onChange={(e) => updateFilter('company', e.target.value)}
                                />
                            </div>
                        </div>
                    </section>

                    <div style={{ height: '1px', background: '#f1f5f9' }}></div>

                    {/* 3. Location */}
                    <section>
                        <span style={styles.sectionTitle}>Location</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={styles.label}>City</label>
                                <div style={{ position: 'relative' }}>
                                    <i className="fas fa-map-marker-alt" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.9rem' }}></i>
                                    <input
                                        type="text"
                                        placeholder="Search City..."
                                        style={{ ...styles.input, paddingLeft: '36px' }}
                                        value={filters.city || ''}
                                        onChange={(e) => updateFilter('city', e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                    </section>

                    <div style={{ height: '1px', background: '#f1f5f9' }}></div>

                    {/* 4. System & Tags */}
                    <section>
                        <span style={styles.sectionTitle}>System & Tags</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={styles.label}>Tags</label>
                                <div style={{ position: 'relative' }}>
                                    <i className="fas fa-tag" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.9rem' }}></i>
                                    <input
                                        type="text"
                                        placeholder="Search Tags..."
                                        style={{ ...styles.input, paddingLeft: '36px' }}
                                        value={filters.tags ? filters.tags[0] || '' : ''} // Simple single tag search for now or use array logic
                                        onChange={(e) => updateFilter('tags', e.target.value ? [e.target.value] : [])}
                                    />
                                </div>
                            </div>
                            <div>
                                <label style={styles.label}>Assigned Owner</label>
                                <input
                                    type="text"
                                    placeholder="Search Owner..."
                                    style={styles.input}
                                    value={filters.owner || ''}
                                    onChange={(e) => updateFilter('owner', e.target.value)}
                                />
                            </div>
                        </div>
                    </section>
                </div>

                <footer style={{ padding: '24px', borderTop: '1px solid #e2e8f0', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button onClick={onClose} style={styles.applyBtn}>
                        View {Object.keys(filters).length > 0 ? 'Filtered Results' : 'All Contacts'}
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

export default ContactFilterPanel;
