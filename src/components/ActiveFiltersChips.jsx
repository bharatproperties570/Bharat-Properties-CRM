import React from 'react';

/**
 * ActiveFiltersChips Component
 * Displays a row of removable chips for active filters.
 * 
 * Props:
 * - filters: Object (key-value pairs of active filters)
 * - onRemoveFilter: Function(key, value) - value is passed if removing a specific item from an array
 * - onClearAll: Function()
 * - config: Object (optional mapping for human-readable labels, e.g. { minPrice: 'Min Price' })
 */
const ActiveFiltersChips = ({ filters, onRemoveFilter, onClearAll, config = {} }) => {
    if (!filters || Object.keys(filters).length === 0) return null;

    // Helper to format values
    const formatValue = (key, value) => {
        if (!value) return '';
        if (Array.isArray(value)) return value.join(', ');
        if (typeof value === 'object') {
            // Handle Date Range or other objects if needed
            if (value.start && value.end) return `${value.start} - ${value.end}`;
            return JSON.stringify(value);
        }
        return value.toString();
    };

    // Helper to get label
    const getLabel = (key) => config[key] || key.replace(/([A-Z])/g, ' $1').trim().replace(/^\w/, c => c.toUpperCase());

    const chips = [];

    Object.entries(filters).forEach(([key, value]) => {
        if (!value || (Array.isArray(value) && value.length === 0)) return;

        // If it's an array, we might want individual chips for each item, 
        // OR one chip for the key. For now, let's do one chip per Key to save space, 
        // but if it's an array, user clicking 'x' clears the whole key? 
        // Better UX: One chip per Key with comma separated values.

        // Let's support array removal if needed, but for simplicity finding a generic way:
        chips.push({
            key: key,
            label: getLabel(key),
            valueDisplay: formatValue(key, value)
        });
    });

    if (chips.length === 0) return null;

    return (
        <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            padding: '8px 2rem',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            alignItems: 'center'
        }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginRight: '4px' }}>
                Active Filters:
            </span>

            {chips.map(chip => (
                <div
                    key={chip.key}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        background: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '16px',
                        fontSize: '0.8rem',
                        color: '#0f172a',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                    }}
                >
                    <span style={{ color: '#64748b' }}>{chip.label}:</span>
                    <span style={{ fontWeight: 600 }}>{chip.valueDisplay}</span>
                    <button
                        onClick={() => onRemoveFilter(chip.key)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '2px',
                            marginLeft: '2px'
                        }}
                    >
                        <i className="fas fa-times" style={{ fontSize: '0.8rem' }}></i>
                    </button>
                </div>
            ))}

            <button
                onClick={onClearAll}
                style={{
                    background: 'none',
                    border: 'none',
                    color: '#ef4444',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginLeft: '8px',
                    textDecoration: 'underline'
                }}
            >
                Clear All
            </button>
        </div>
    );
};

export default ActiveFiltersChips;
