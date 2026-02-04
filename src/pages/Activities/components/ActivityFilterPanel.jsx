import React, { useState } from 'react';
import { ACTIVITY_TYPES, ACTIVITY_STATUSES, PRIORITIES } from '../../../utils/activityFilterLogic';
import { users } from '../../../data/mockData';

const ActivityFilterPanel = ({ isOpen, onClose, filters, onFilterChange, onReset }) => {
    // Local state for temporary filter changes before applying (if we wanted "Apply" button)
    // But we are doing real-time, so we might pass changes directly. 
    // However, for consistency with other panels, we often use local state + Apply, 
    // OR direct updates. The implemented plan said "Real-time", 
    // so we will trigger onFilterChange directly.

    // Helper to handle multi-select toggles
    const toggleFilter = (category, value) => {
        const current = filters[category] || [];
        const updated = current.includes(value)
            ? current.filter(item => item !== value)
            : [...current, value];
        onFilterChange(category, updated);
    };

    const handleDateChange = (type, value) => {
        const currentRange = filters.dateRange || {};
        onFilterChange('dateRange', { ...currentRange, [type]: value });
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="filter-panel-overlay" onClick={onClose} style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(2px)', zIndex: 999
            }}></div>
            <div className={`filter-panel ${isOpen ? 'open' : ''}`} style={{
                position: 'fixed', top: 0, right: 0, bottom: 0,
                width: '380px', backgroundColor: '#fff', boxShadow: '-4px 0 15px rgba(0,0,0,0.1)',
                zIndex: 1000, transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
                transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                display: 'flex', flexDirection: 'column'
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 24px', borderBottom: '1px solid #e2e8f0',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: '#fff'
                }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="fas fa-filter" style={{ color: '#64748b', fontSize: '1rem' }}></i> Filters
                    </h3>
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer',
                        padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background 0.2s'
                    }}
                        onMouseOver={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#ef4444'; }}
                        onMouseOut={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#94a3b8'; }}
                    >
                        <i className="fas fa-times" style={{ fontSize: '1.1rem' }}></i>
                    </button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

                    {/* Activity Type */}
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Activity Type
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {ACTIVITY_TYPES.map(type => (
                                <button
                                    key={type}
                                    onClick={() => toggleFilter('activityType', type)}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        border: (filters.activityType || []).includes(type) ? '1px solid #10b981' : '1px solid #e2e8f0',
                                        background: (filters.activityType || []).includes(type) ? '#ecfdf5' : '#fff',
                                        color: (filters.activityType || []).includes(type) ? '#059669' : '#64748b',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {type}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Status */}
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Status
                        </label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {ACTIVITY_STATUSES.map(status => (
                                <label key={status} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.9rem', color: '#334155' }}>
                                    <input
                                        type="checkbox"
                                        checked={(filters.status || []).includes(status)}
                                        onChange={() => toggleFilter('status', status)}
                                        style={{ accentColor: '#10b981', width: '16px', height: '16px' }}
                                    />
                                    {status}
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Priority */}
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Priority
                        </label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {PRIORITIES.map(priority => {
                                const isSelected = (filters.priority || []).includes(priority);
                                let color = '#64748b';
                                let bg = '#fff';
                                let border = '#e2e8f0';

                                if (isSelected) {
                                    if (priority === 'High') { color = '#dc2626'; bg = '#fef2f2'; border = '#fca5a5'; }
                                    else if (priority === 'Normal') { color = '#0284c7'; bg = '#e0f2fe'; border = '#7dd3fc'; }
                                    else { color = '#65a30d'; bg = '#ecfccb'; border = '#bef264'; }
                                }

                                return (
                                    <button
                                        key={priority}
                                        onClick={() => toggleFilter('priority', priority)}
                                        style={{
                                            flex: 1,
                                            padding: '8px',
                                            borderRadius: '6px',
                                            fontSize: '0.85rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            border: `1px solid ${border}`,
                                            background: bg,
                                            color: color,
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        {priority}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Date Range */}
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Scheduled Date
                        </label>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>From</label>
                                <input
                                    type="date"
                                    value={filters.dateRange?.start || ''}
                                    onChange={(e) => handleDateChange('start', e.target.value)}
                                    style={{
                                        width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0',
                                        fontSize: '0.85rem', color: '#334155', outline: 'none'
                                    }}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>To</label>
                                <input
                                    type="date"
                                    value={filters.dateRange?.end || ''}
                                    onChange={(e) => handleDateChange('end', e.target.value)}
                                    style={{
                                        width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0',
                                        fontSize: '0.85rem', color: '#334155', outline: 'none'
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Owner */}
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Assigned To
                        </label>
                        <select
                            value=""
                            onChange={(e) => {
                                if (e.target.value) toggleFilter('owner', e.target.value);
                            }}
                            style={{
                                width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0',
                                fontSize: '0.9rem', color: '#334155', outline: 'none', marginBottom: '8px'
                            }}
                        >
                            <option value="">Select User...</option>
                            {users.map(u => (
                                <option key={u.id} value={u.name}>{u.name} ({u.role})</option>
                            ))}
                        </select>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {(filters.owner || []).map(owner => (
                                <div key={owner} style={{
                                    fontSize: '0.8rem', background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px',
                                    color: '#475569', display: 'flex', alignItems: 'center', gap: '6px'
                                }}>
                                    {owner}
                                    <i className="fas fa-times" style={{ cursor: 'pointer', color: '#94a3b8' }} onClick={() => toggleFilter('owner', owner)}></i>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div style={{
                    padding: '20px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <button
                        onClick={onReset}
                        style={{
                            background: 'none', border: 'none', color: '#64748b', fontSize: '0.9rem', fontWeight: 600,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                    >
                        <i className="fas fa-undo"></i> Reset All
                    </button>
                    <button
                        onClick={onClose}
                        style={{
                            background: '#1e293b', color: '#fff', border: 'none', padding: '10px 24px',
                            borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
                            boxShadow: '0 4px 6px rgba(15, 23, 42, 0.1)'
                        }}
                    >
                        Done
                    </button>
                </div>
            </div>
        </>
    );
};

export default ActivityFilterPanel;
