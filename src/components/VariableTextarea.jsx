import { useState, useRef, useEffect, useMemo } from 'react';
import { variableDictionary } from '../constants/variableDictionary';

// Type badge color map
const TYPE_COLORS = {
    text:           { bg: '#f0fdf4', color: '#16a34a' },
    number:         { bg: '#eff6ff', color: '#2563eb' },
    dropdown:       { bg: '#fdf4ff', color: '#9333ea' },
    'multi-select': { bg: '#fff7ed', color: '#ea580c' },
    date:           { bg: '#fef2f2', color: '#dc2626' },
    textarea:       { bg: '#f8fafc', color: '#64748b' },
    boolean:        { bg: '#f0fdf4', color: '#059669' },
    computed:       { bg: '#fafaf9', color: '#78716c' },
};

// Helper to calculate caret coordinates inside a textarea
const getCaretCoordinates = (element, position) => {
    const div = document.createElement('div');
    const style = div.style;
    const computed = window.getComputedStyle(element);
    style.whiteSpace = 'pre-wrap';
    style.wordWrap = 'break-word';
    style.position = 'absolute';
    style.visibility = 'hidden';
    ['fontFamily','fontSize','fontWeight','fontStyle','letterSpacing','lineHeight','textDecoration','textTransform','paddingTop','paddingRight','paddingBottom','paddingLeft','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'].forEach(prop => {
        style[prop] = computed[prop];
    });
    style.width = computed.width;
    style.overflow = 'auto';
    div.textContent = element.value.substring(0, position);
    const span = document.createElement('span');
    span.textContent = element.value.substring(position) || '.';
    div.appendChild(span);
    document.body.appendChild(div);
    const coordinates = {
        top: span.offsetTop + parseInt(computed.borderTopWidth),
        left: span.offsetLeft + parseInt(computed.borderLeftWidth),
        height: parseInt(computed.lineHeight) || parseInt(computed.fontSize)
    };
    document.body.removeChild(div);
    return coordinates;
};

const VariableTextarea = ({ value, onChange, placeholder, style, minHeight = '120px' }) => {
    const textareaRef = useRef(null);
    const dropdownRef = useRef(null);
    const [mentionState, setMentionState] = useState({
        isOpen: false, query: '', startIndex: -1, top: 0, left: 0, selectedIndex: 0
    });

    const filteredVariables = useMemo(() =>
        variableDictionary.filter(v =>
            v.id.toLowerCase().includes(mentionState.query.toLowerCase()) ||
            v.label.toLowerCase().includes(mentionState.query.toLowerCase()) ||
            v.category.toLowerCase().includes(mentionState.query.toLowerCase())
        ),
        [mentionState.query]
    );

    const groupedVariables = useMemo(() =>
        filteredVariables.reduce((acc, v) => {
            if (!acc[v.category]) acc[v.category] = [];
            acc[v.category].push(v);
            return acc;
        }, {}),
        [filteredVariables]
    );

    const handleTextChange = (e) => {
        const val = e.target.value;
        onChange(e);
        const cursorPosition = e.target.selectionStart;
        const textBeforeCursor = val.substring(0, cursorPosition);
        const match = textBeforeCursor.match(/\{\{([a-zA-Z0-9_.]*)$/);
        if (match) {
            const coords = getCaretCoordinates(textareaRef.current, cursorPosition);
            setMentionState({
                isOpen: true,
                query: match[1],
                startIndex: match.index,
                top: coords.top + coords.height - textareaRef.current.scrollTop + 5,
                left: coords.left - textareaRef.current.scrollLeft,
                selectedIndex: 0
            });
        } else {
            setMentionState(prev => ({ ...prev, isOpen: false }));
        }
    };

    const insertVariable = (variableId) => {
        if (!textareaRef.current) return;
        const cursorPosition = textareaRef.current.selectionStart;
        const textBefore = value.substring(0, mentionState.startIndex);
        const textAfter = value.substring(cursorPosition);
        onChange({ target: { value: `${textBefore}{{${variableId}}}${textAfter}` } });
        setMentionState(prev => ({ ...prev, isOpen: false }));
        setTimeout(() => {
            const pos = mentionState.startIndex + variableId.length + 4;
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(pos, pos);
        }, 0);
    };

    const handleKeyDown = (e) => {
        if (!mentionState.isOpen || filteredVariables.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setMentionState(prev => ({ ...prev, selectedIndex: (prev.selectedIndex + 1) % filteredVariables.length }));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setMentionState(prev => ({ ...prev, selectedIndex: (prev.selectedIndex - 1 + filteredVariables.length) % filteredVariables.length }));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            insertVariable(filteredVariables[mentionState.selectedIndex].id);
        } else if (e.key === 'Escape') {
            setMentionState(prev => ({ ...prev, isOpen: false }));
        }
    };

    useEffect(() => {
        if (dropdownRef.current && mentionState.isOpen) {
            const selected = dropdownRef.current.querySelector('[data-selected="true"]');
            if (selected) selected.scrollIntoView({ block: 'nearest' });
        }
    }, [mentionState.selectedIndex, mentionState.isOpen]);

    useEffect(() => {
        const close = (e) => {
            if (textareaRef.current && !textareaRef.current.contains(e.target) && !e.target.closest('.variable-dropdown')) {
                setMentionState(prev => ({ ...prev, isOpen: false }));
            }
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    let flatIdx = 0;

    return (
        <div style={{ position: 'relative', width: '100%' }}>
            <textarea
                ref={textareaRef}
                style={{
                    width: '100%', minHeight, padding: '12px',
                    border: '1px solid #e2e8f0', borderRadius: '8px',
                    fontSize: '0.95rem', resize: 'vertical',
                    fontFamily: 'inherit', lineHeight: '1.5', outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    ...style
                }}
                placeholder={placeholder}
                value={value}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                onClick={handleTextChange}
                onKeyUp={(e) => { if (['ArrowLeft','ArrowRight'].includes(e.key)) handleTextChange({ target: textareaRef.current }); }}
                onFocus={(e) => { e.target.style.borderColor = '#6366f1'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'; }}
                onBlur={(e)  => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
            />

            {/* Hint bar */}
            <div style={{ marginTop: '4px', fontSize: '0.7rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px', fontFamily: 'monospace', fontWeight: 700, color: '#6366f1', letterSpacing: '0.03em' }}>{'{{ '}</span>
                type karein variable insert karne ke liye
            </div>

            {/* Dropdown */}
            {mentionState.isOpen && filteredVariables.length > 0 && (
                <div
                    ref={dropdownRef}
                    className="variable-dropdown"
                    style={{
                        position: 'absolute',
                        top: `${mentionState.top}px`,
                        left: `${Math.max(0, mentionState.left)}px`,
                        backgroundColor: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.13)',
                        zIndex: 9999,
                        maxHeight: '320px',
                        overflowY: 'auto',
                        minWidth: '290px',
                        maxWidth: '370px',
                    }}
                >
                    {/* Header */}
                    <div style={{ padding: '7px 12px', borderBottom: '1px solid #f1f5f9', background: '#fafafa', borderRadius: '10px 10px 0 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="fas fa-search" style={{ fontSize: '0.65rem', color: '#94a3b8' }}></i>
                        <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                            {mentionState.query ? `"${mentionState.query}" — ${filteredVariables.length} results` : `${filteredVariables.length} variables available`}
                        </span>
                    </div>

                    {/* Grouped items */}
                    {Object.entries(groupedVariables).map(([category, vars]) => (
                        <div key={category}>
                            <div style={{ padding: '6px 12px 3px', fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', background: '#fafafa' }}>
                                {category}
                            </div>
                            {vars.map((v) => {
                                const myIdx = flatIdx++;
                                const isSelected = myIdx === mentionState.selectedIndex;
                                const tStyle = TYPE_COLORS[v.type] || TYPE_COLORS.text;
                                return (
                                    <div
                                        key={`${v.category}-${v.id}`}
                                        data-selected={isSelected}
                                        onClick={() => insertVariable(v.id)}
                                        onMouseEnter={() => setMentionState(prev => ({ ...prev, selectedIndex: myIdx }))}
                                        style={{
                                            padding: '7px 12px',
                                            cursor: 'pointer',
                                            backgroundColor: isSelected ? '#eff6ff' : 'transparent',
                                            borderLeft: isSelected ? '3px solid #6366f1' : '3px solid transparent',
                                            display: 'flex', alignItems: 'center', gap: '10px',
                                            transition: 'background 0.1s'
                                        }}
                                    >
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ fontWeight: 700, fontSize: '0.82rem', color: isSelected ? '#4f46e5' : '#1e293b', fontFamily: 'monospace' }}>{`{{${v.id}}}`}</span>
                                            <span style={{ fontSize: '0.71rem', color: '#64748b', display: 'block', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.label}</span>
                                        </div>
                                        <span style={{ fontSize: '0.58rem', padding: '2px 6px', borderRadius: '4px', background: tStyle.bg, color: tStyle.color, fontWeight: 700, flexShrink: 0, textTransform: 'uppercase' }}>
                                            {v.type}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    ))}

                    {/* Footer */}
                    <div style={{ padding: '5px 12px', borderTop: '1px solid #f1f5f9', background: '#fafafa', borderRadius: '0 0 10px 10px', display: 'flex', gap: '12px' }}>
                        {['↑↓ Navigate','↵ Insert','Esc Close'].map(k => (
                            <span key={k} style={{ fontSize: '0.6rem', color: '#94a3b8' }}>{k}</span>
                        ))}
                    </div>
                </div>
            )}

            {/* No results */}
            {mentionState.isOpen && filteredVariables.length === 0 && mentionState.query && (
                <div
                    className="variable-dropdown"
                    style={{
                        position: 'absolute',
                        top: `${mentionState.top}px`,
                        left: `${Math.max(0, mentionState.left)}px`,
                        backgroundColor: '#fff', border: '1px solid #e2e8f0',
                        borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.13)',
                        zIndex: 9999, padding: '16px 20px',
                        minWidth: '220px', textAlign: 'center', fontSize: '0.8rem', color: '#94a3b8'
                    }}
                >
                    <i className="fas fa-search" style={{ marginBottom: '6px', display: 'block' }}></i>
                    <strong>{mentionState.query}</strong> ke liye koi variable nahi mila
                </div>
            )}
        </div>
    );
};

export default VariableTextarea;
