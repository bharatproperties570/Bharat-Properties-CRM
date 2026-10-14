import React, { useState, useRef, useEffect, useMemo } from 'react';
import { variableDictionary } from '../constants/variableDictionary';
import { UNICODE_FONTS, QUICK_EMOJIS, EMOJI_CATEGORIES } from '../utils/whatsappFormatter';

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

// Quick-access essential variables shown in the toolbar
const QUICK_VARIABLES = [
    { id: 'EmployeeName',   label: 'Assigned Employee Name',     shortLabel: 'Employee',      highlight: true },
    { id: 'EmployeeMobile', label: 'Assigned Employee Mobile',   shortLabel: 'Emp Mobile',    highlight: true },
    { id: 'agent_email',    label: 'Assigned Employee Email',    shortLabel: 'Emp Email',     highlight: true },
    { id: 'team',           label: 'Assigned Team',              shortLabel: 'Team',          highlight: true },
    { id: 'assignedTo',     label: 'Assigned User / Agent',      shortLabel: 'Assigned User', highlight: true },
    { id: 'visibleTo',      label: 'Visibility Scope',           shortLabel: 'Visibility',   highlight: true },
    { id: 'firstName',      label: 'Customer First Name',        shortLabel: 'First Name',    highlight: false },
    { id: 'mobile',         label: 'Customer Mobile',            shortLabel: 'Mobile',        highlight: false },
    { id: 'projectName',    label: 'Preferred Project Name',     shortLabel: 'Project',       highlight: false },
    { id: 'price',          label: 'Property Price',             shortLabel: 'Price',         highlight: false },
];

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
    div.textContent = (element.value || '').substring(0, position);
    const span = document.createElement('span');
    span.textContent = (element.value || '').substring(position) || '.';
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

const VariableTextarea = ({
    value = '',
    onChange,
    placeholder,
    style,
    minHeight = '120px',
    showQuickPills = true,
    showFormattingToolbar = true,
    showEmojiPicker = true,
    showFontStyles = true
}) => {
    const textareaRef = useRef(null);
    const dropdownRef = useRef(null);
    const pickerRef = useRef(null);
    const emojiPickerRef = useRef(null);
    const fontDropdownRef = useRef(null);

    // Autocomplete dropdown state (on typing `{{`)
    const [mentionState, setMentionState] = useState({
        isOpen: false, query: '', startIndex: -1, top: 0, left: 0, selectedIndex: 0
    });

    // Dedicated "All Variables" modal/popover state
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [pickerSearch, setPickerSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('ALL');

    // Emoji Popover state
    const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
    const [emojiSearch, setEmojiSearch] = useState('');
    const [activeEmojiCategory, setActiveEmojiCategory] = useState('realestate');

    // Font Style Dropdown state
    const [isFontDropdownOpen, setIsFontDropdownOpen] = useState(false);

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

    // Filter variables for the "All Variables" popover
    const pickerFilteredVariables = useMemo(() => {
        return variableDictionary.filter(v => {
            const matchesCat = selectedCategory === 'ALL' || v.category === selectedCategory || (selectedCategory === 'System & Assignment' && (v.category === 'System & Assignment' || v.category === 'Lead – System' || v.category === 'System'));
            const matchesSearch = !pickerSearch || 
                v.id.toLowerCase().includes(pickerSearch.toLowerCase()) ||
                v.label.toLowerCase().includes(pickerSearch.toLowerCase()) ||
                v.category.toLowerCase().includes(pickerSearch.toLowerCase());
            return matchesCat && matchesSearch;
        });
    }, [selectedCategory, pickerSearch]);

    // Filtered emojis for the emoji popover
    const filteredEmojis = useMemo(() => {
        if (!emojiSearch.trim()) {
            const cat = EMOJI_CATEGORIES.find(c => c.id === activeEmojiCategory);
            return cat ? cat.emojis : [];
        }
        const query = emojiSearch.toLowerCase().trim();
        const results = [];
        EMOJI_CATEGORIES.forEach(cat => {
            cat.emojis.forEach(item => {
                if (item.name.toLowerCase().includes(query) || item.char.includes(query)) {
                    results.push(item);
                }
            });
        });
        return results;
    }, [emojiSearch, activeEmojiCategory]);

    const handleTextChange = (e) => {
        const val = e.target.value || '';
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

    // Generic insert text at cursor / replace selection
    const insertTextAtCursor = (textToInsert, selectLength = 0) => {
        const curVal = value || '';
        const el = textareaRef.current;
        let start = curVal.length;
        let end = curVal.length;
        if (el && typeof el.selectionStart === 'number') {
            start = el.selectionStart;
            end = el.selectionEnd;
        }
        const textBefore = curVal.substring(0, start);
        const textAfter = curVal.substring(end);
        const newText = `${textBefore}${textToInsert}${textAfter}`;
        onChange({ target: { value: newText } });

        setTimeout(() => {
            if (el) {
                el.focus();
                if (selectLength > 0) {
                    el.setSelectionRange(start, start + selectLength);
                } else {
                    const pos = start + textToInsert.length;
                    el.setSelectionRange(pos, pos);
                }
            }
        }, 0);
    };

    // Insert variable from inline dropdown (replaces typed {{query)
    const insertVariable = (variableId) => {
        if (!textareaRef.current) return;
        const curVal = value || '';
        const cursorPosition = textareaRef.current.selectionStart;
        const startIndex = mentionState.startIndex >= 0 ? mentionState.startIndex : cursorPosition;
        const textBefore = curVal.substring(0, startIndex);
        const textAfter = curVal.substring(cursorPosition);
        const inserted = `{{${variableId}}}`;
        onChange({ target: { value: `${textBefore}${inserted}${textAfter}` } });
        setMentionState(prev => ({ ...prev, isOpen: false }));
        setTimeout(() => {
            const pos = startIndex + inserted.length;
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(pos, pos);
        }, 0);
    };

    // Insert variable directly at caret from chip/picker click
    const insertVariableAtCursor = (variableId) => {
        insertTextAtCursor(`{{${variableId}}}`);
        setIsPickerOpen(false);
        setMentionState(prev => ({ ...prev, isOpen: false }));
    };

    // WhatsApp formatting wrapper (Bold, Italic, Strikethrough, Monospace)
    const applyFormatting = (prefix, suffix = prefix) => {
        const el = textareaRef.current;
        if (!el) return;
        const curVal = value || '';
        const start = el.selectionStart ?? curVal.length;
        const end = el.selectionEnd ?? curVal.length;
        const selected = curVal.substring(start, end);

        let newText = '';
        let newStart = start;
        let newEnd = end;

        if (start === end) {
            // No selection: insert placeholder and select it
            const placeholder = prefix === '*' ? 'bold text' : prefix === '_' ? 'italic text' : prefix === '~' ? 'strikethrough text' : prefix.startsWith('```') ? 'code' : 'text';
            newText = `${curVal.substring(0, start)}${prefix}${placeholder}${suffix}${curVal.substring(end)}`;
            newStart = start + prefix.length;
            newEnd = newStart + placeholder.length;
        } else {
            // Check if selected text is already wrapped
            const pLen = prefix.length;
            const sLen = suffix.length;
            const hasOuterWrap = curVal.substring(start - pLen, start) === prefix && curVal.substring(end, end + sLen) === suffix;
            const hasInnerWrap = selected.startsWith(prefix) && selected.endsWith(suffix) && selected.length >= (pLen + sLen);

            if (hasOuterWrap) {
                // Unwrap outer
                newText = `${curVal.substring(0, start - pLen)}${selected}${curVal.substring(end + sLen)}`;
                newStart = start - pLen;
                newEnd = newStart + selected.length;
            } else if (hasInnerWrap) {
                // Unwrap inner
                const unwrapped = selected.substring(pLen, selected.length - sLen);
                newText = `${curVal.substring(0, start)}${unwrapped}${curVal.substring(end)}`;
                newStart = start;
                newEnd = start + unwrapped.length;
            } else {
                // Wrap text
                newText = `${curVal.substring(0, start)}${prefix}${selected}${suffix}${curVal.substring(end)}`;
                newStart = start + prefix.length;
                newEnd = end + prefix.length;
            }
        }

        onChange({ target: { value: newText } });
        setTimeout(() => {
            el.focus();
            el.setSelectionRange(newStart, newEnd);
        }, 0);
    };

    // Apply list or quote prefix to lines
    const applyLinePrefix = (type) => {
        const el = textareaRef.current;
        if (!el) return;
        const curVal = value || '';
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? 0;

        const lastNewlineBefore = curVal.lastIndexOf('\n', start - 1);
        const lineStart = lastNewlineBefore === -1 ? 0 : lastNewlineBefore + 1;
        const nextNewlineAfter = curVal.indexOf('\n', end);
        const lineEnd = nextNewlineAfter === -1 ? curVal.length : nextNewlineAfter;

        const selectedLines = curVal.substring(lineStart, lineEnd).split('\n');
        const formatted = selectedLines.map((line, idx) => {
            if (type === 'bullet') {
                return line.startsWith('👉 ') ? line.substring(3) : line.startsWith('- ') ? line.substring(2) : `👉 ${line}`;
            } else if (type === 'number') {
                const match = line.match(/^\d+\.\s/);
                return match ? line.substring(match[0].length) : `${idx + 1}. ${line}`;
            } else if (type === 'quote') {
                return line.startsWith('> ') ? line.substring(2) : `> ${line}`;
            }
            return line;
        });

        const newBlock = formatted.join('\n');
        const newText = `${curVal.substring(0, lineStart)}${newBlock}${curVal.substring(lineEnd)}`;
        onChange({ target: { value: newText } });
        setTimeout(() => {
            el.focus();
            el.setSelectionRange(lineStart, lineStart + newBlock.length);
        }, 0);
    };

    // Apply Unicode Font Style to selection
    const applyFontStyle = (fontObj) => {
        const el = textareaRef.current;
        if (!el) return;
        const curVal = value || '';
        const start = el.selectionStart ?? curVal.length;
        const end = el.selectionEnd ?? curVal.length;
        const selected = curVal.substring(start, end);

        if (start === end || !selected.trim()) {
            // Nothing selected: insert converted sample text
            const sample = fontObj.preview;
            insertTextAtCursor(sample, sample.length);
        } else {
            const converted = fontObj.convert(selected);
            const textBefore = curVal.substring(0, start);
            const textAfter = curVal.substring(end);
            onChange({ target: { value: `${textBefore}${converted}${textAfter}` } });
            setTimeout(() => {
                el.focus();
                el.setSelectionRange(start, start + converted.length);
            }, 0);
        }
        setIsFontDropdownOpen(false);
    };

    const handleKeyDown = (e) => {
        // Keyboard shortcuts inside textarea: Ctrl+B / Cmd+B for bold, Ctrl+I / Cmd+I for italic
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            applyFormatting('*');
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
            e.preventDefault();
            applyFormatting('_');
            return;
        }

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

    // Handle outside clicks to close popovers
    useEffect(() => {
        const close = (e) => {
            if (textareaRef.current && !textareaRef.current.contains(e.target) && !e.target.closest('.variable-dropdown')) {
                setMentionState(prev => ({ ...prev, isOpen: false }));
            }
            if (pickerRef.current && !pickerRef.current.contains(e.target) && !e.target.closest('.variable-picker-btn')) {
                setIsPickerOpen(false);
            }
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target) && !e.target.closest('.emoji-picker-toggle-btn')) {
                setIsEmojiPickerOpen(false);
            }
            if (fontDropdownRef.current && !fontDropdownRef.current.contains(e.target) && !e.target.closest('.font-dropdown-toggle-btn')) {
                setIsFontDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    let flatIdx = 0;

    return (
        <div style={{ position: 'relative', width: '100%' }}>
            {/* 🛠️ Comprehensive Formatting & Emoji Toolbar */}
            {showFormattingToolbar && (
                <div style={{
                    marginBottom: '8px',
                    padding: '6px 10px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                }}>
                    {/* Row 1: Formatting actions, Font Styles, and Emojis */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        
                        {/* Text Styling Group (WhatsApp Markdown) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', background: '#ffffff', padding: '2px 4px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                            {/* Bold */}
                            <button
                                type="button"
                                onClick={() => applyFormatting('*')}
                                title="Bold (*text*) — Ctrl+B"
                                style={{
                                    width: '28px', height: '28px', border: 'none', background: 'transparent',
                                    borderRadius: '5px', cursor: 'pointer', fontWeight: 900, fontSize: '0.88rem',
                                    color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            >
                                <span style={{ fontWeight: 900, fontFamily: 'serif' }}>B</span>
                            </button>

                            {/* Italic */}
                            <button
                                type="button"
                                onClick={() => applyFormatting('_')}
                                title="Italic (_text_) — Ctrl+I"
                                style={{
                                    width: '28px', height: '28px', border: 'none', background: 'transparent',
                                    borderRadius: '5px', cursor: 'pointer', fontStyle: 'italic', fontSize: '0.88rem',
                                    color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            >
                                <span style={{ fontStyle: 'italic', fontFamily: 'serif', fontWeight: 600 }}>I</span>
                            </button>

                            {/* Strikethrough */}
                            <button
                                type="button"
                                onClick={() => applyFormatting('~')}
                                title="Strikethrough (~text~)"
                                style={{
                                    width: '28px', height: '28px', border: 'none', background: 'transparent',
                                    borderRadius: '5px', cursor: 'pointer', textDecoration: 'line-through', fontSize: '0.88rem',
                                    color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            >
                                <span style={{ textDecoration: 'line-through' }}>S</span>
                            </button>

                            {/* Monospace Code */}
                            <button
                                type="button"
                                onClick={() => applyFormatting('```', '```')}
                                title="Monospace (```code```)"
                                style={{
                                    width: '28px', height: '28px', border: 'none', background: 'transparent',
                                    borderRadius: '5px', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.82rem',
                                    color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            >
                                <span>&lt;/&gt;</span>
                            </button>

                            <div style={{ width: '1px', height: '18px', background: '#e2e8f0', margin: '0 2px' }}></div>

                            {/* Pointer Bullet */}
                            <button
                                type="button"
                                onClick={() => applyLinePrefix('bullet')}
                                title="Add Pointer Bullet (👉 line)"
                                style={{
                                    height: '28px', padding: '0 6px', border: 'none', background: 'transparent',
                                    borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                                    color: '#334155', display: 'flex', alignItems: 'center', gap: '3px'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            >
                                <span>👉 List</span>
                            </button>

                            {/* Numbered List */}
                            <button
                                type="button"
                                onClick={() => applyLinePrefix('number')}
                                title="Numbered List (1. line)"
                                style={{
                                    height: '28px', padding: '0 6px', border: 'none', background: 'transparent',
                                    borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                                    color: '#334155', display: 'flex', alignItems: 'center', gap: '3px'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            >
                                <span>1. List</span>
                            </button>

                            {/* Divider Line */}
                            <button
                                type="button"
                                onClick={() => insertTextAtCursor('\n━━━━━━━━━━━━━━━━━━━━\n')}
                                title="Insert Decorative Separator Line"
                                style={{
                                    height: '28px', padding: '0 6px', border: 'none', background: 'transparent',
                                    borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                                    color: '#334155', display: 'flex', alignItems: 'center', gap: '3px'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            >
                                <span>— Line</span>
                            </button>
                        </div>

                        {/* Font Style & Emojis Controls */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {/* Font Style Dropdown Toggle */}
                            {showFontStyles && (
                                <div style={{ position: 'relative' }}>
                                    <button
                                        type="button"
                                        className="font-dropdown-toggle-btn"
                                        onClick={() => setIsFontDropdownOpen(prev => !prev)}
                                        title="Font Styles (Change text to Bold Sans, Gothic, Script, etc.)"
                                        style={{
                                            fontSize: '0.74rem',
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            border: '1px solid #cbd5e1',
                                            background: isFontDropdownOpen ? '#4338ca' : '#ffffff',
                                            color: isFontDropdownOpen ? '#ffffff' : '#3730a3',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                                        }}
                                    >
                                        <span style={{ fontSize: '0.85rem' }}>Aa</span>
                                        <span>Font Style</span>
                                        <i className={`fas fa-chevron-${isFontDropdownOpen ? 'up' : 'down'}`} style={{ fontSize: '0.55rem' }}></i>
                                    </button>

                                    {/* Font Style Dropdown Menu */}
                                    {isFontDropdownOpen && (
                                        <div
                                            ref={fontDropdownRef}
                                            style={{
                                                position: 'absolute',
                                                top: '34px',
                                                right: 0,
                                                width: '260px',
                                                backgroundColor: '#ffffff',
                                                border: '1px solid #cbd5e1',
                                                borderRadius: '10px',
                                                boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
                                                zIndex: 10008,
                                                padding: '6px',
                                                animation: 'fadeIn 0.15s ease-out'
                                            }}
                                        >
                                            <div style={{ padding: '6px 8px 4px', fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                Select Stylized Font
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                {UNICODE_FONTS.map(font => (
                                                    <div
                                                        key={font.id}
                                                        onClick={() => applyFontStyle(font)}
                                                        style={{
                                                            padding: '8px 10px',
                                                            borderRadius: '6px',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            transition: 'background 0.1s'
                                                        }}
                                                        onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                                    >
                                                        <div>
                                                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>
                                                                {font.preview}
                                                            </div>
                                                            <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                                                                {font.label}
                                                            </div>
                                                        </div>
                                                        <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: '#e0e7ff', color: '#3730a3', fontWeight: 700 }}>
                                                            {font.badge}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div style={{ padding: '8px', marginTop: '4px', borderTop: '1px solid #f1f5f9', fontSize: '0.65rem', color: '#64748b', lineHeight: '1.3' }}>
                                                💡 <em>Tip: Select words in body and click any font style to transform instantly. Best for headings and brand names.</em>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Full Emojis & Icons Popover Toggle */}
                            {showEmojiPicker && (
                                <div style={{ position: 'relative' }}>
                                    <button
                                        type="button"
                                        className="emoji-picker-toggle-btn"
                                        onClick={() => {
                                            setIsEmojiPickerOpen(prev => !prev);
                                            setEmojiSearch('');
                                        }}
                                        title="Browse All Emojis & Real Estate Icons"
                                        style={{
                                            fontSize: '0.74rem',
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            border: '1px solid #f59e0b',
                                            background: isEmojiPickerOpen ? '#f59e0b' : '#fffbeb',
                                            color: isEmojiPickerOpen ? '#ffffff' : '#b45309',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                                        }}
                                    >
                                        <span style={{ fontSize: '0.85rem' }}>😊</span>
                                        <span>Emojis & Icons</span>
                                        <i className={`fas fa-chevron-${isEmojiPickerOpen ? 'up' : 'down'}`} style={{ fontSize: '0.55rem' }}></i>
                                    </button>

                                    {/* Emojis Popover Card */}
                                    {isEmojiPickerOpen && (
                                        <div
                                            ref={emojiPickerRef}
                                            style={{
                                                position: 'absolute',
                                                top: '34px',
                                                right: 0,
                                                width: '340px',
                                                maxHeight: '340px',
                                                backgroundColor: '#ffffff',
                                                border: '1px solid #cbd5e1',
                                                borderRadius: '12px',
                                                boxShadow: '0 14px 36px rgba(0,0,0,0.2)',
                                                zIndex: 10008,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                overflow: 'hidden',
                                                animation: 'fadeIn 0.15s ease-out'
                                            }}
                                        >
                                            {/* Search Header */}
                                            <div style={{ padding: '10px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '5px 10px' }}>
                                                    <i className="fas fa-search" style={{ color: '#94a3b8', fontSize: '0.75rem' }}></i>
                                                    <input
                                                        type="text"
                                                        placeholder="Search emoji (home, price, call, key...)"
                                                        value={emojiSearch}
                                                        onChange={e => setEmojiSearch(e.target.value)}
                                                        style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.82rem' }}
                                                        autoFocus
                                                    />
                                                    {emojiSearch && (
                                                        <i className="fas fa-times" style={{ cursor: 'pointer', color: '#94a3b8', fontSize: '0.7rem' }} onClick={() => setEmojiSearch('')}></i>
                                                    )}
                                                </div>

                                                {/* Category Tabs */}
                                                {!emojiSearch && (
                                                    <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', marginTop: '8px', paddingBottom: '2px' }}>
                                                        {EMOJI_CATEGORIES.map(cat => (
                                                            <button
                                                                key={cat.id}
                                                                type="button"
                                                                onClick={() => setActiveEmojiCategory(cat.id)}
                                                                title={cat.name}
                                                                style={{
                                                                    fontSize: '0.7rem',
                                                                    padding: '3px 7px',
                                                                    borderRadius: '6px',
                                                                    border: '1px solid',
                                                                    borderColor: activeEmojiCategory === cat.id ? '#f59e0b' : '#e2e8f0',
                                                                    background: activeEmojiCategory === cat.id ? '#fef3c7' : '#ffffff',
                                                                    color: activeEmojiCategory === cat.id ? '#92400e' : '#64748b',
                                                                    fontWeight: activeEmojiCategory === cat.id ? 700 : 500,
                                                                    cursor: 'pointer',
                                                                    whiteSpace: 'nowrap',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '3px'
                                                                }}
                                                            >
                                                                <span>{cat.icon}</span>
                                                                <span>{cat.name.split(' ')[0]}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Emoji Grid */}
                                            <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px' }}>
                                                {filteredEmojis.length === 0 ? (
                                                    <div style={{ gridColumn: 'span 6', padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>
                                                        No emojis found matching &quot;{emojiSearch}&quot;
                                                    </div>
                                                ) : (
                                                    filteredEmojis.map((e, idx) => (
                                                        <button
                                                            key={`${e.char}-${idx}`}
                                                            type="button"
                                                            onClick={() => {
                                                                insertTextAtCursor(e.char);
                                                            }}
                                                            title={e.name}
                                                            style={{
                                                                fontSize: '1.25rem',
                                                                width: '42px',
                                                                height: '42px',
                                                                borderRadius: '8px',
                                                                border: '1px solid #f1f5f9',
                                                                background: '#ffffff',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                transition: 'all 0.12s ease'
                                                            }}
                                                            onMouseEnter={evt => {
                                                                evt.currentTarget.style.transform = 'scale(1.18)';
                                                                evt.currentTarget.style.background = '#fef3c7';
                                                                evt.currentTarget.style.borderColor = '#f59e0b';
                                                            }}
                                                            onMouseLeave={evt => {
                                                                evt.currentTarget.style.transform = 'scale(1)';
                                                                evt.currentTarget.style.background = '#ffffff';
                                                                evt.currentTarget.style.borderColor = '#f1f5f9';
                                                            }}
                                                        >
                                                            {e.char}
                                                        </button>
                                                    ))
                                                )}
                                            </div>

                                            <div style={{ padding: '6px 12px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: '0.68rem', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                                                <span>Click any emoji to insert at cursor</span>
                                                <span style={{ fontWeight: 600 }}>{filteredEmojis.length} icons</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Row 2: ⚡ Instant 1-Click Quick Real Estate Emojis Bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflowX: 'auto', padding: '2px 0' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', marginRight: '4px', whiteSpace: 'nowrap' }}>
                            Quick Icons:
                        </span>
                        {QUICK_EMOJIS.map(emoji => (
                            <button
                                key={emoji}
                                type="button"
                                onClick={() => insertTextAtCursor(emoji)}
                                title={`Click to insert ${emoji}`}
                                style={{
                                    fontSize: '1rem',
                                    padding: '2px 6px',
                                    borderRadius: '6px',
                                    border: '1px solid #e2e8f0',
                                    background: '#ffffff',
                                    cursor: 'pointer',
                                    transition: 'all 0.12s ease'
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = '#fef3c7';
                                    e.currentTarget.style.borderColor = '#f59e0b';
                                    e.currentTarget.style.transform = 'scale(1.15)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = '#ffffff';
                                    e.currentTarget.style.borderColor = '#e2e8f0';
                                    e.currentTarget.style.transform = 'scale(1)';
                                }}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* 🏷️ Quick-Insert Variable Toolbar */}
            {showQuickPills && (
                <div style={{ marginBottom: '8px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px', marginRight: '2px' }}>
                            <i className="fas fa-magic" style={{ color: '#6366f1' }}></i> Insert:
                        </span>

                        {QUICK_VARIABLES.map(v => (
                            <button
                                key={v.id}
                                type="button"
                                onClick={() => insertVariableAtCursor(v.id)}
                                title={`${v.label} (Click to insert {{${v.id}}})`}
                                style={{
                                    fontSize: '0.73rem',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    border: `1px solid ${v.highlight ? '#bfdbfe' : '#e2e8f0'}`,
                                    background: v.highlight ? '#eff6ff' : '#ffffff',
                                    color: v.highlight ? '#1d4ed8' : '#334155',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    transition: 'all 0.15s ease',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.borderColor = '#6366f1';
                                    e.currentTarget.style.background = '#f5f3ff';
                                    e.currentTarget.style.color = '#4f46e5';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.borderColor = v.highlight ? '#bfdbfe' : '#e2e8f0';
                                    e.currentTarget.style.background = v.highlight ? '#eff6ff' : '#ffffff';
                                    e.currentTarget.style.color = v.highlight ? '#1d4ed8' : '#334155';
                                }}
                            >
                                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.75rem' }}>{`{{${v.id}}}`}</span>
                                <span style={{ fontSize: '0.64rem', opacity: 0.85, color: '#64748b', fontWeight: 500 }}>{v.shortLabel}</span>
                            </button>
                        ))}

                        {/* All Variables Popover Toggle Button */}
                        <button
                            type="button"
                            className="variable-picker-btn"
                            onClick={() => {
                                setIsPickerOpen(prev => !prev);
                                setPickerSearch('');
                            }}
                            style={{
                                fontSize: '0.73rem',
                                padding: '3px 10px',
                                borderRadius: '6px',
                                border: '1px solid #6366f1',
                                background: isPickerOpen ? '#4f46e5' : '#f5f3ff',
                                color: isPickerOpen ? '#ffffff' : '#4f46e5',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <i className="fas fa-layer-group" style={{ fontSize: '0.7rem' }}></i>
                            <span>All Variables</span>
                            <i className={`fas fa-chevron-${isPickerOpen ? 'up' : 'down'}`} style={{ fontSize: '0.6rem' }}></i>
                        </button>
                    </div>

                    {/* Popover Card for "All Variables" */}
                    {isPickerOpen && (
                        <div
                            ref={pickerRef}
                            style={{
                                position: 'absolute',
                                top: '80px',
                                left: '0',
                                right: '0',
                                maxWidth: '580px',
                                maxHeight: '360px',
                                backgroundColor: '#ffffff',
                                border: '1px solid #cbd5e1',
                                borderRadius: '12px',
                                boxShadow: '0 12px 36px rgba(0,0,0,0.18)',
                                zIndex: 10005,
                                display: 'flex',
                                flexDirection: 'column',
                                overflow: 'hidden',
                                animation: 'fadeIn 0.15s ease-out'
                            }}
                        >
                            {/* Search bar & Category filter */}
                            <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 12px', marginBottom: '10px' }}>
                                    <i className="fas fa-search" style={{ color: '#94a3b8', fontSize: '0.8rem' }}></i>
                                    <input
                                        type="text"
                                        placeholder="Search variable name, team, user, employee, etc..."
                                        value={pickerSearch}
                                        onChange={e => setPickerSearch(e.target.value)}
                                        style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.85rem' }}
                                        autoFocus
                                    />
                                    {pickerSearch && (
                                        <i className="fas fa-times" style={{ cursor: 'pointer', color: '#94a3b8', fontSize: '0.75rem' }} onClick={() => setPickerSearch('')}></i>
                                    )}
                                </div>

                                {/* Category Pills */}
                                <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
                                    {['ALL', 'System & Assignment', 'Lead – Basic', 'Inventory – Unit', 'Booking', 'Activity'].map(cat => (
                                        <button
                                            key={cat}
                                            type="button"
                                            onClick={() => setSelectedCategory(cat)}
                                            style={{
                                                fontSize: '0.68rem',
                                                padding: '2px 8px',
                                                borderRadius: '9999px',
                                                border: '1px solid',
                                                borderColor: selectedCategory === cat ? '#6366f1' : '#e2e8f0',
                                                background: selectedCategory === cat ? '#6366f1' : '#ffffff',
                                                color: selectedCategory === cat ? '#ffffff' : '#64748b',
                                                fontWeight: selectedCategory === cat ? 700 : 500,
                                                cursor: 'pointer',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            {cat === 'ALL' ? 'All' : cat}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Variable list */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
                                {pickerFilteredVariables.length === 0 ? (
                                    <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                                        No variables matching &quot;{pickerSearch}&quot;
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                                        {pickerFilteredVariables.map(v => {
                                            const tStyle = TYPE_COLORS[v.type] || TYPE_COLORS.text;
                                            return (
                                                <div
                                                    key={`${v.category}-${v.id}`}
                                                    onClick={() => insertVariableAtCursor(v.id)}
                                                    style={{
                                                        padding: '8px 10px',
                                                        borderRadius: '8px',
                                                        border: '1px solid #f1f5f9',
                                                        background: '#ffffff',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '2px',
                                                        transition: 'all 0.12s ease'
                                                    }}
                                                    onMouseEnter={e => {
                                                        e.currentTarget.style.borderColor = '#93c5fd';
                                                        e.currentTarget.style.background = '#eff6ff';
                                                    }}
                                                    onMouseLeave={e => {
                                                        e.currentTarget.style.borderColor = '#f1f5f9';
                                                        e.currentTarget.style.background = '#ffffff';
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.82rem', color: '#1e40af' }}>{`{{${v.id}}}`}</span>
                                                        <span style={{ fontSize: '0.58rem', padding: '1px 5px', borderRadius: '4px', background: tStyle.bg, color: tStyle.color, fontWeight: 700, textTransform: 'uppercase' }}>
                                                            {v.type}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {v.label}
                                                    </div>
                                                    <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>
                                                        {v.category}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div style={{ padding: '8px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: '#64748b' }}>
                                <span>Click any variable to insert into template body</span>
                                <span style={{ fontWeight: 600 }}>{pickerFilteredVariables.length} available</span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Main Textarea */}
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

            {/* Formatting Legend / Hint bar */}
            <div style={{ marginTop: '5px', fontSize: '0.72rem', color: '#64748b', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: '#047857' }}>WhatsApp Formatting:</span>
                    <span style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px', fontFamily: 'monospace' }}>*bold*</span>
                    <span style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px', fontFamily: 'monospace' }}>_italic_</span>
                    <span style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px', fontFamily: 'monospace' }}>~strike~</span>
                    <span style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px', fontFamily: 'monospace' }}>```mono```</span>
                    <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '1px 5px', borderRadius: '4px', fontFamily: 'monospace', fontWeight: 700 }}>{'{{variable}}'}</span>
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                    {(value || '').length} chars
                </div>
            </div>

            {/* Inline Autocomplete Dropdown (triggers when typing {{) */}
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
                        zIndex: 10006,
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
                        zIndex: 10006, padding: '16px 20px',
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
