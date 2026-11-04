
import React from 'react';
import { useTheme } from '../context/ThemeContext';

/**
 * ActiveFiltersChips Component
 * Displays a row or inline strip of removable chips for active filters.
 * 
 * Props:
 * - filters: Object (key-value pairs of active filters)
 * - onRemoveFilter: Function(key, value) - value is passed if removing a specific item from an array
 * - onClearAll: Function()
 * - config: Object (optional mapping for human-readable labels, e.g. { minPrice: 'Min Price' })
 * - inline: Boolean (renders compactly inside a toolbar next to search input)
 */
const ActiveFiltersChips = ({ filters, onRemoveFilter, onClearAll, config = {}, inline = false }) => {
    const { isDark } = useTheme() || {};
    if (!filters || Object.keys(filters).length === 0) return null;

    // Helper to format values
    const formatValue = (key, value) => {
        if (!value) return '';
        if (Array.isArray(value)) return value.filter(Boolean).join(', ');
        if (typeof value === 'object') {
            if (value.start && value.end) return `${value.start} - ${value.end}`;
            if (value.min && value.max) return `${value.min} - ${value.max}`;
            if (value.lookup_value) return value.lookup_value;
            if (value.name) return value.name;
            return JSON.stringify(value);
        }
        return value.toString();
    };

    // Helper to get label
    const getLabel = (key) => config[key] || (key === 'subCategory' ? 'Sub Category' : key.replace(/([A-Z])/g, ' $1').trim().replace(/^\w/, c => c.toUpperCase()));

    const chips = [];

    Object.entries(filters).forEach(([key, value]) => {
        if (!value) return;
        if (Array.isArray(value) && value.filter(Boolean).length === 0) return;
        if (key === 'page' || key === 'limit' || key === 'sortBy' || key === 'sortOrder' || key === 'view') return;

        const valDisp = formatValue(key, value);
        if (!valDisp) return;

        chips.push({
            key,
            label: getLabel(key),
            valueDisplay: valDisp
        });
    });

    if (chips.length === 0) return null;

    return (
        <div style={{
            display: 'flex',
            flexWrap: inline ? 'nowrap' : 'wrap',
            gap: inline ? '6px' : '8px',
            alignItems: 'center',
            overflowX: inline ? 'auto' : undefined,
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            padding: inline ? '0 4px' : '8px 2rem',
            background: inline ? 'transparent' : (isDark ? 'var(--bg-gray, #1f2937)' : '#f8fafc'),
            borderBottom: inline ? 'none' : '1px solid var(--border-color, #e2e8f0)',
            maxWidth: '100%',
            flexShrink: 1
        }}>
            {/* Subtle Divider before Active Filters in inline mode */}
            {inline && (
                <div style={{
                    height: '20px',
                    width: '1px',
                    background: isDark ? 'rgba(255, 255, 255, 0.15)' : '#cbd5e1',
                    margin: '0 4px',
                    flexShrink: 0
                }} />
            )}

            <span style={{ 
                fontSize: inline ? '0.7rem' : '0.75rem', 
                fontWeight: 700, 
                color: isDark ? '#94a3b8' : '#64748b', 
                textTransform: 'uppercase', 
                letterSpacing: '0.4px',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                flexShrink: 0
            }}>
                <i className="fas fa-filter" style={{ fontSize: '0.65rem', opacity: 0.85 }}></i>
                Active Filters:
            </span>

            {chips.map(chip => (
                <div
                    key={chip.key}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: inline ? '3px 8px' : '4px 10px',
                        background: isDark ? 'rgba(255, 255, 255, 0.06)' : '#ffffff',
                        border: isDark ? '1px solid rgba(255, 255, 255, 0.16)' : '1px solid #cbd5e1',
                        borderRadius: inline ? '8px' : '16px',
                        fontSize: inline ? '0.73rem' : '0.8rem',
                        color: isDark ? '#f8fafc' : '#0f172a',
                        boxShadow: isDark ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 2px rgba(0,0,0,0.04)',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        transition: 'all 0.15s ease'
                    }}
                >
                    <span style={{ color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>{chip.label}:</span>
                    <span style={{ fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a', textTransform: 'capitalize' }}>{chip.valueDisplay}</span>
                    <button
                        onClick={() => onRemoveFilter(chip.key)}
                        title={`Remove ${chip.label} filter`}
                        type="button"
                        style={{
                            background: isDark ? 'rgba(255, 255, 255, 0.12)' : '#f1f5f9',
                            border: 'none',
                            color: isDark ? '#cbd5e1' : '#64748b',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '15px',
                            height: '15px',
                            borderRadius: '50%',
                            padding: 0,
                            marginLeft: '2px',
                            fontSize: '0.62rem',
                            fontWeight: 900,
                            lineHeight: 1,
                            transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#ef4444';
                            e.currentTarget.style.color = '#ffffff';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = isDark ? 'rgba(255, 255, 255, 0.12)' : '#f1f5f9';
                            e.currentTarget.style.color = isDark ? '#cbd5e1' : '#64748b';
                        }}
                    >
                        ✕
                    </button>
                </div>
            ))}

            <button
                onClick={onClearAll}
                title="Clear all active filters"
                type="button"
                style={{
                    background: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    color: '#ef4444',
                    fontSize: inline ? '0.7rem' : '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    marginLeft: '2px',
                    padding: inline ? '3px 8px' : '4px 10px',
                    borderRadius: inline ? '8px' : '12px',
                    whiteSpace: 'nowrap',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    flexShrink: 0,
                    transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#ef4444';
                    e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.08)';
                    e.currentTarget.style.color = '#ef4444';
                }}
            >
                Clear All
            </button>
        </div>
    );
};

export default ActiveFiltersChips;
