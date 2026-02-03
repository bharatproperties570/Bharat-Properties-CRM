import React, { useState, useEffect, useRef } from 'react';

const MultiSelectDropdown = ({ options, selected, onChange, placeholder, disabled }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    // Default styles if not provided by parent context (we keep it self-contained for now)
    const baseInputStyle = {
        width: '100%',
        padding: '10px 12px',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        fontSize: '0.9rem',
        outline: 'none',
        transition: 'border-color 0.2s',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#fff',
        color: '#0f172a'
    };

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
                    ...baseInputStyle,
                    color: disabled ? '#94a3b8' : '#0f172a',
                    backgroundColor: disabled ? '#f1f5f9' : '#fff',
                    cursor: disabled ? 'not-allowed' : 'pointer',
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
                                padding: '10px 12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                borderBottom: '1px solid #f8fafc',
                                backgroundColor: selected.includes(option) ? '#eff6ff' : 'transparent'
                            }}
                            onMouseEnter={(e) => {
                                if (!selected.includes(option)) e.currentTarget.style.backgroundColor = '#f8fafc';
                            }}
                            onMouseLeave={(e) => {
                                if (!selected.includes(option)) e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={selected.includes(option)}
                                readOnly
                                style={{
                                    accentColor: '#22c55e',
                                    width: '16px',
                                    height: '16px',
                                    cursor: 'pointer'
                                }}
                            />
                            <span style={{ fontSize: '0.9rem', color: '#334155' }}>
                                {option}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MultiSelectDropdown;
