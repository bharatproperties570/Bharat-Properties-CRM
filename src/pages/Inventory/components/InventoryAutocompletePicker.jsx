import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Search, X, Building2, Check, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../../../utils/api';

/**
 * Enterprise Inventory Autocomplete Picker
 * 
 * Complies with Bharat Properties CRM Design Standards:
 * - Debounced asynchronous search (250ms)
 * - Minimum query length enforcement (>= 2 chars)
 * - Request cancellation via AbortController for stale response prevention
 * - Full keyboard navigation (Arrow Up/Down, Enter, Escape) and ARIA attributes
 * - Multiple selection with removable chips
 * - Zero PII exposure (project, unit, and size metadata only)
 */
export default function InventoryAutocompletePicker({
    selectedItems = [],
    onSelect,
    onRemove,
    disabled = false,
    placeholder = 'Search by project, sector, unit number...',
    maxLimit = 25
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const containerRef = useRef(null);
    const inputRef = useRef(null);
    const abortControllerRef = useRef(null);
    const debounceTimerRef = useRef(null);
    const justSelectedRef = useRef(false);
    const requestGenerationRef = useRef(0);

    // Cancel any active search, clear debounce timer and abort inflight request
    const cancelSearch = useCallback(() => {
        requestGenerationRef.current += 1;
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setLoading(false);
    }, []);

    // Abort inflight requests and clear timers on unmount
    useEffect(() => {
        return () => {
            cancelSearch();
        };
    }, [cancelSearch]);

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
                setHighlightedIndex(-1);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Execute debounced search against GET /api/owner-outreach/inventory-search
    const handleQueryChange = (e) => {
        const value = e.target.value;
        setQuery(value);
        setError(null);
        setHighlightedIndex(-1);

        const trimmed = value.trim();
        if (trimmed.length < 2) {
            cancelSearch();
            setResults([]);
            setIsOpen(trimmed.length > 0);
            return;
        }

        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }

        setLoading(true);
        const generation = ++requestGenerationRef.current;

        debounceTimerRef.current = setTimeout(async () => {
            const controller = new AbortController();
            abortControllerRef.current = controller;

            try {
                const response = await api.get('/owner-outreach/inventory-search', {
                    params: { q: trimmed, limit: maxLimit },
                    signal: controller.signal
                });

                // Ignore stale response if a newer request was dispatched or search cancelled
                if (generation !== requestGenerationRef.current) {
                    return;
                }

                const items = response.data?.data?.items || [];
                setResults(items);
                setIsOpen(true);
                setLoading(false);
            } catch (err) {
                // Ignore stale response or cancelled requests
                if (generation !== requestGenerationRef.current) {
                    return;
                }
                if (err.name === 'CanceledError' || err.name === 'AbortError' || err.code === 'ERR_CANCELED') {
                    return;
                }
                console.error('[InventoryPicker] Search error:', err);
                setError(err.response?.data?.error || 'Unable to search inventory. Please try again.');
                setResults([]);
                setLoading(false);
                setIsOpen(true);
            }
        }, 250);
    };

    const handleSelectItem = useCallback((item) => {
        const isAlreadySelected = selectedItems.some((sel) => sel.id === item.id);
        if (!isAlreadySelected && onSelect) {
            onSelect(item);
        }
        cancelSearch();
        justSelectedRef.current = true;
        setQuery('');
        setResults([]);
        setIsOpen(false);
        setHighlightedIndex(-1);
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, [selectedItems, onSelect, cancelSearch]);

    const handleClear = useCallback(() => {
        cancelSearch();
        setQuery('');
        setResults([]);
        setError(null);
        setIsOpen(false);
        setHighlightedIndex(-1);
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, [cancelSearch]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (isOpen && highlightedIndex >= 0 && highlightedIndex < results.length) {
                handleSelectItem(results[highlightedIndex]);
            }
            return;
        }

        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                if (results.length > 0 || query.trim().length >= 2) {
                    setIsOpen(true);
                }
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setIsOpen(false);
            setHighlightedIndex(-1);
        }
    };

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
            {/* Selected Inventory Chips */}
            {selectedItems.length > 0 && (
                <div
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 8,
                        marginBottom: 10
                    }}
                    role="region"
                    aria-label="Selected properties"
                >
                    {selectedItems.map((item) => (
                        <span
                            key={item.id}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                background: '#f1f5f9',
                                border: '1px solid #cbd5e1',
                                borderRadius: 16,
                                padding: '4px 10px',
                                fontSize: 12,
                                fontWeight: 500,
                                color: '#1e293b'
                            }}
                        >
                            <Building2 size={13} style={{ color: '#64748b' }} />
                            <span>
                                <strong>{item.project || 'Project'}</strong> · {item.unit || 'Unit'}
                                {item.size ? ` (${item.size})` : ''}
                            </span>
                            {!disabled && (
                                <button
                                    type="button"
                                    onClick={() => onRemove && onRemove(item.id)}
                                    aria-label={`Remove ${item.project || ''} ${item.unit || item.id}`}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: 0,
                                        marginLeft: 2,
                                        color: '#64748b',
                                        borderRadius: '50%'
                                    }}
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </span>
                    ))}
                </div>
            )}

            {/* Search Input Box */}
            <div style={{ position: 'relative', width: '100%' }}>
                <div
                    style={{
                        position: 'absolute',
                        left: 12,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        pointerEvents: 'none',
                        color: '#94a3b8',
                        display: 'flex',
                        alignItems: 'center'
                    }}
                >
                    {loading ? (
                        <Loader2 size={16} className="animate-spin" style={{ color: '#2563eb' }} />
                    ) : (
                        <Search size={16} />
                    )}
                </div>

                <input
                    ref={inputRef}
                    type="text"
                    role="combobox"
                    aria-expanded={isOpen}
                    aria-autocomplete="list"
                    aria-controls="inventory-search-listbox"
                    aria-activedescendant={
                        highlightedIndex >= 0 ? `inventory-option-${highlightedIndex}` : undefined
                    }
                    disabled={disabled}
                    value={query}
                    onChange={handleQueryChange}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                        if (justSelectedRef.current) {
                            justSelectedRef.current = false;
                            return;
                        }
                        if (query.trim().length >= 2 && results.length > 0) {
                            setIsOpen(true);
                        }
                    }}
                    placeholder={placeholder}
                    style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '10px 36px 10px 36px',
                        border: isOpen ? '1.5px solid #2563eb' : '1px solid #dbe2ea',
                        borderRadius: 8,
                        background: disabled ? '#f8fafc' : '#fff',
                        color: '#1e293b',
                        fontSize: 13,
                        outline: 'none',
                        transition: 'border-color 0.15s ease'
                    }}
                />

                {query.length > 0 && !disabled && (
                    <button
                        type="button"
                        aria-label="Clear search input"
                        onClick={handleClear}
                        style={{
                            position: 'absolute',
                            right: 10,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#94a3b8',
                            padding: 2
                        }}
                    >
                        <X size={15} />
                    </button>
                )}
            </div>

            {/* Results Dropdown Menu */}
            {isOpen && (
                <div
                    id="inventory-search-listbox"
                    role="listbox"
                    aria-label="Matching inventory properties"
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: 0,
                        right: 0,
                        background: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: 8,
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                        zIndex: 50,
                        maxHeight: 260,
                        overflowY: 'auto',
                        padding: '4px 0'
                    }}
                >
                    {/* Minimum Length Guidance */}
                    {query.trim().length > 0 && query.trim().length < 2 && (
                        <div style={{ padding: '10px 14px', fontSize: 12, color: '#64748b' }}>
                            Type at least 2 characters to search properties...
                        </div>
                    )}

                    {/* Loading State */}
                    {loading && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '12px 14px',
                                fontSize: 13,
                                color: '#475569'
                            }}
                        >
                            <Loader2 size={16} className="animate-spin" style={{ color: '#2563eb' }} />
                            <span>Searching CRM inventory...</span>
                        </div>
                    )}

                    {/* Error State */}
                    {error && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '10px 14px',
                                fontSize: 12,
                                color: '#b91c1c',
                                background: '#fef2f2'
                            }}
                        >
                            <AlertCircle size={15} />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Empty Results State */}
                    {!loading && !error && query.trim().length >= 2 && results.length === 0 && (
                        <div style={{ padding: '12px 14px', fontSize: 13, color: '#64748b', textAlign: 'center' }}>
                            No properties found matching &ldquo;{query.trim()}&rdquo;.
                        </div>
                    )}

                    {/* Option List */}
                    {!loading &&
                        results.map((item, index) => {
                            const isSelected = selectedItems.some((sel) => sel.id === item.id);
                            const isHighlighted = highlightedIndex === index;

                            return (
                                <div
                                    key={item.id}
                                    id={`inventory-option-${index}`}
                                    role="option"
                                    aria-selected={isSelected}
                                    onClick={() => handleSelectItem(item)}
                                    onMouseEnter={() => setHighlightedIndex(index)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '9px 14px',
                                        cursor: isSelected ? 'default' : 'pointer',
                                        background: isHighlighted ? '#f1f5f9' : '#fff',
                                        borderBottom: index < results.length - 1 ? '1px solid #f8fafc' : 'none',
                                        transition: 'background-color 0.1s ease'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div
                                            style={{
                                                width: 30,
                                                height: 30,
                                                borderRadius: 6,
                                                background: '#f8fafc',
                                                border: '1px solid #e2e8f0',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: '#64748b'
                                            }}
                                        >
                                            <Building2 size={16} />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                                                {item.project || 'Unassigned Project'} · {item.unit || 'Unit not specified'}
                                            </div>
                                            <div style={{ fontSize: 11, color: '#64748b' }}>
                                                {item.size ? `Size: ${item.size}` : 'Standard size'}
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        {isSelected ? (
                                            <span
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: 4,
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                    color: '#15803d',
                                                    background: '#f0fdf4',
                                                    padding: '2px 8px',
                                                    borderRadius: 12
                                                }}
                                            >
                                                <Check size={12} />
                                                Selected
                                            </span>
                                        ) : (
                                            <span
                                                style={{
                                                    fontSize: 11,
                                                    color: '#2563eb',
                                                    fontWeight: 500
                                                }}
                                            >
                                                + Add
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                </div>
            )}
        </div>
    );
}

InventoryAutocompletePicker.propTypes = {
    selectedItems: PropTypes.arrayOf(
        PropTypes.shape({
            id: PropTypes.string.isRequired,
            project: PropTypes.string,
            unit: PropTypes.string,
            size: PropTypes.string,
            label: PropTypes.string
        })
    ),
    onSelect: PropTypes.func.isRequired,
    onRemove: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
    placeholder: PropTypes.string,
    maxLimit: PropTypes.number
};
