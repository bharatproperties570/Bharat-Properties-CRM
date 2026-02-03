
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePropertyConfig } from '../../../../context/PropertyConfigContext';
import MultiSelectDropdown from '../../../../components/MultiSelectDropdown';
import { PROPERTY_CATEGORIES } from '../../../../data/propertyData';

// ==================================================================================
// STYLES (Extracted as per Coding Standards)
// ==================================================================================
const styles = {
    overlay: {
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(2px)',
        zIndex: 5000,
        transition: 'opacity 0.3s ease'
    },
    panel: {
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '400px',
        maxWidth: '90%',
        backgroundColor: '#fff',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
        zIndex: 5001,
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
        overflow: 'hidden'
    },
    header: {
        padding: '20px',
        borderBottom: '1px solid #f1f5f9',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#fff'
    },
    title: {
        fontSize: '1.1rem',
        fontWeight: '700',
        color: '#0f172a',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    },
    closeBtn: {
        background: 'none',
        border: 'none',
        color: '#64748b',
        cursor: 'pointer',
        fontSize: '1.1rem',
        padding: '8px',
        borderRadius: '50%',
        transition: 'all 0.2s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    },
    body: {
        flex: 1,
        overflowY: 'auto',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px'
    },
    section: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
    },
    sectionTitle: {
        fontSize: '0.75rem',
        fontWeight: '700',
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: '4px'
    },
    label: {
        fontSize: '0.9rem',
        fontWeight: '600',
        color: '#334155',
        marginBottom: '6px',
        display: 'block'
    },
    input: {
        width: '100%',
        padding: '10px 12px',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        fontSize: '0.9rem',
        outline: 'none',
        transition: 'border-color 0.2s'
    },
    toggleGroup: {
        display: 'flex',
        background: '#f1f5f9',
        padding: '4px',
        borderRadius: '8px'
    },
    toggleBtn: (active) => ({
        flex: 1,
        padding: '8px',
        borderRadius: '6px',
        border: 'none',
        fontSize: '0.9rem',
        fontWeight: active ? '600' : '500',
        backgroundColor: active ? '#fff' : 'transparent',
        color: active ? '#0f172a' : '#64748b',
        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
        cursor: 'pointer',
        transition: 'all 0.2s'
    }),
    footer: {
        padding: '20px',
        borderTop: '1px solid #f1f5f9',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#fff'
    },
    clearBtn: {
        background: 'none',
        border: 'none',
        color: '#64748b',
        fontSize: '0.9rem',
        fontWeight: '600',
        cursor: 'pointer',
        padding: '10px'
    },
    applyBtn: {
        backgroundColor: '#0f172a', // Professional black/dark slate
        color: '#fff',
        border: 'none',
        padding: '12px 24px',
        borderRadius: '8px',
        fontSize: '0.95rem',
        fontWeight: '600',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        boxShadow: '0 4px 6px -1px rgba(15, 23, 42, 0.1)'
    }
};

const LeadFilterPanel = ({ isOpen, onClose, filters, onApply }) => {
    const { masterFields } = usePropertyConfig();

    // Local state to manage filter changes before applying
    const [localFilters, setLocalFilters] = useState({});

    // Sync local state when panel opens or filters change externally
    useEffect(() => {
        if (isOpen) {
            setLocalFilters(filters || {});
        }
    }, [isOpen, filters]);

    if (!isOpen) return null;

    const handleUpdate = (key, value) => {
        setLocalFilters(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const handleApply = () => {
        onApply(localFilters);
        onClose();
    };

    const handleClear = () => {
        setLocalFilters({});
        // onApply({}); // Optional: Apply clear immediately or wait for user to click Apply
    };

    // Derived Options
    const stageOptions = ['New', 'Contacted', 'Interested', 'Meeting Scheduled', 'Negotiation', 'Qualified', 'Won', 'Lost'];
    // Use masterFields if available, else fallback
    const statusOptions = masterFields?.statuses || ['Active', 'Inactive', 'Pending', 'Closed'];
    const sourceOptions = masterFields?.sources || ['Direct', 'Facebook', 'Referral', 'Website', 'Walk-in'];

    return createPortal(
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.panel} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={styles.header}>
                    <div style={styles.title}>
                        <i className="fas fa-filter" style={{ color: '#0f172a' }}></i>
                        Filter Leads
                    </div>
                    <button style={styles.closeBtn} onClick={onClose}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {/* Body */}
                <div style={styles.body}>

                    {/* 1. Lead Details Section */}
                    <div style={styles.section}>
                        <span style={styles.sectionTitle}>Lead Status & Source</span>

                        <div>
                            <label style={styles.label}>Status</label>
                            <MultiSelectDropdown
                                options={statusOptions}
                                selected={localFilters.status || []}
                                onChange={val => handleUpdate('status', val)}
                                placeholder="All Statuses"
                            />
                        </div>

                        <div>
                            <label style={styles.label}>Stage</label>
                            <MultiSelectDropdown
                                options={stageOptions}
                                selected={localFilters.stage || []}
                                onChange={val => handleUpdate('stage', val)}
                                placeholder="All Stages"
                            />
                        </div>

                        <div>
                            <label style={styles.label}>Source</label>
                            <MultiSelectDropdown
                                options={sourceOptions}
                                selected={localFilters.source || []}
                                onChange={val => handleUpdate('source', val)}
                                placeholder="All Sources"
                            />
                        </div>
                    </div>

                    <div style={{ height: '1px', background: '#f1f5f9', margin: '8px 0' }}></div>

                    {/* 2. Requirement Section */}
                    <div style={styles.section}>
                        <span style={styles.sectionTitle}>Requirement</span>

                        {/* Intent Toggle */}
                        <div style={styles.toggleGroup}>
                            {['Buy', 'Rent'].map(intent => (
                                <button
                                    key={intent}
                                    style={styles.toggleBtn(localFilters.intent === intent)}
                                    onClick={() => handleUpdate('intent', localFilters.intent === intent ? null : intent)}
                                >
                                    {intent}
                                </button>
                            ))}
                        </div>

                        <div>
                            <label style={styles.label}>Property Category</label>
                            <MultiSelectDropdown
                                options={Object.keys(PROPERTY_CATEGORIES)}
                                selected={localFilters.category || []}
                                onChange={val => handleUpdate('category', val)}
                                placeholder="Select Categories"
                            />
                        </div>

                        {/* Budget Range */}
                        <div>
                            <label style={styles.label}>Budget Range</label>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <input
                                    type="number"
                                    placeholder="Min"
                                    style={styles.input}
                                    value={localFilters.budgetMin || ''}
                                    onChange={e => handleUpdate('budgetMin', e.target.value)}
                                />
                                <span style={{ color: '#94a3b8' }}>-</span>
                                <input
                                    type="number"
                                    placeholder="Max"
                                    style={styles.input}
                                    value={localFilters.budgetMax || ''}
                                    onChange={e => handleUpdate('budgetMax', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    <div style={{ height: '1px', background: '#f1f5f9', margin: '8px 0' }}></div>

                    {/* 3. Location Section */}
                    <div style={styles.section}>
                        <span style={styles.sectionTitle}>Location</span>
                        <div>
                            <label style={styles.label}>City or Area</label>
                            <div style={{ position: 'relative' }}>
                                <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}></i>
                                <input
                                    type="text"
                                    placeholder="Search location..."
                                    style={{ ...styles.input, paddingLeft: '36px' }}
                                    value={localFilters.location || ''}
                                    onChange={e => handleUpdate('location', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* 4. Assignment Section */}
                    <div style={styles.section}>
                        <span style={styles.sectionTitle}>Assignment</span>
                        <div>
                            <label style={styles.label}>Assigned To</label>
                            <input
                                type="text"
                                placeholder="Search Owner Name" // Simple text for now, could be dropdown of users
                                style={styles.input}
                                value={localFilters.owner ? localFilters.owner[0] : ''}
                                onChange={e => handleUpdate('owner', e.target.value ? [e.target.value] : [])}
                            />
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div style={styles.footer}>
                    <button style={styles.clearBtn} onClick={handleClear}>
                        Clear All
                    </button>
                    <button style={styles.applyBtn} onClick={handleApply}>
                        <i className="fas fa-check"></i> Apply Filters
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default LeadFilterPanel;
