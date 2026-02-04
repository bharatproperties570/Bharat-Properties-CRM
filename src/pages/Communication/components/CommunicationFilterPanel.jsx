import React from 'react';
import { COMMUNICATION_TYPES, PLATFORMS, OUTCOMES, TIME_FRAMES } from '../../../utils/communicationFilterLogic';

const CommunicationFilterPanel = ({ isOpen, onClose, filters, onFilterChange, onReset }) => {

    const toggleFilter = (category, value) => {
        const current = filters[category] || [];
        const updated = current.includes(value)
            ? current.filter(item => item !== value)
            : [...current, value];
        onFilterChange(category, updated);
    };

    const setSingleFilter = (category, value) => {
        // Toggle behavior for single select (Time Frame)
        if (filters[category] === value) {
            onFilterChange(category, null);
        } else {
            onFilterChange(category, value);
        }
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

                    {/* Direction / Type */}
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Direction
                        </label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {COMMUNICATION_TYPES.map(type => (
                                <button
                                    key={type}
                                    onClick={() => toggleFilter('direction', type)}
                                    style={{
                                        flex: 1,
                                        padding: '8px',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        border: (filters.direction || []).includes(type) ? '1px solid #10b981' : '1px solid #e2e8f0',
                                        background: (filters.direction || []).includes(type) ? '#ecfdf5' : '#fff',
                                        color: (filters.direction || []).includes(type) ? '#059669' : '#64748b',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {type}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Platform */}
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Platform
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {PLATFORMS.map(platform => (
                                <button
                                    key={platform}
                                    onClick={() => toggleFilter('platform', platform)}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        border: (filters.platform || []).includes(platform) ? '1px solid #3b82f6' : '1px solid #e2e8f0',
                                        background: (filters.platform || []).includes(platform) ? '#eff6ff' : '#fff',
                                        color: (filters.platform || []).includes(platform) ? '#2563eb' : '#64748b',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {platform}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Outcome */}
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Outcome
                        </label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {OUTCOMES.map(outcome => (
                                <label key={outcome} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.9rem', color: '#334155' }}>
                                    <input
                                        type="checkbox"
                                        checked={(filters.outcome || []).includes(outcome)}
                                        onChange={() => toggleFilter('outcome', outcome)}
                                        style={{ accentColor: '#10b981', width: '16px', height: '16px' }}
                                    />
                                    {outcome}
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Time Frame */}
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Time Frame
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {TIME_FRAMES.map(tf => (
                                <button
                                    key={tf}
                                    onClick={() => setSingleFilter('timeFrame', tf)}
                                    style={{
                                        flex: '1 0 45%', // 2 per row
                                        padding: '8px',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        border: filters.timeFrame === tf ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                                        background: filters.timeFrame === tf ? '#fffbeb' : '#fff',
                                        color: filters.timeFrame === tf ? '#d97706' : '#64748b',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {tf}
                                </button>
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

export default CommunicationFilterPanel;
