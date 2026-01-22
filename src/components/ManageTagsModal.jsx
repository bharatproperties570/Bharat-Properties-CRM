import React, { useState, useEffect, useRef } from 'react';
import { suggestedTags } from '../data/mockData';

const ManageTagsModal = ({ isOpen, onClose, selectedContacts = [], onUpdateTags }) => {
    const isBulk = selectedContacts.length > 1;
    const [currentTags, setCurrentTags] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [mode, setMode] = useState('add'); // 'add' or 'remove' for bulk
    const [selectedSummary, setSelectedSummary] = useState([]);

    // AI Suggestions (Mock logic: filter out already selected tags)
    const aiSuggestions = suggestedTags.filter(tag => !currentTags.includes(tag)).slice(0, 5);

    useEffect(() => {
        if (isOpen) {
            setInputValue('');
            setMode('add');
            if (isBulk) {
                setCurrentTags([]); // Start empty for bulk
            } else if (selectedContacts.length === 1) {
                // Pre-fill existing tags for single contact
                // Split string 'Tag1, Tag2' into array, handle empty cases
                const existing = selectedContacts[0].tags && selectedContacts[0].tags !== '-'
                    ? selectedContacts[0].tags.split(',').map(t => t.trim())
                    : [];
                setCurrentTags(existing);
            }
        }
    }, [isOpen, selectedContacts, isBulk]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addTag(inputValue);
        } else if (e.key === 'Backspace' && !inputValue && currentTags.length > 0) {
            removeTag(currentTags[currentTags.length - 1]);
        }
    };

    const addTag = (tag) => {
        const trimmed = tag.trim();
        if (trimmed && !currentTags.includes(trimmed)) {
            setCurrentTags([...currentTags, trimmed]);
            setInputValue('');
        }
    };

    const removeTag = (tagToRemove) => {
        setCurrentTags(currentTags.filter(tag => tag !== tagToRemove));
    };

    const handleSave = () => {
        // Validation
        if (isBulk && currentTags.length === 0) {
            alert("Please select at least one tag to " + mode);
            return;
        }

        const tagsToApply = currentTags;

        // Mock payload
        const payload = {
            contactIds: selectedContacts.map(c => c.id || c.mobile),
            tags: tagsToApply,
            mode: isBulk ? mode : 'overwrite' // 'overwrite' for single, 'add'/'remove' for bulk
        };

        if (onUpdateTags) onUpdateTags(payload);

        onClose();
        alert(isBulk
            ? `Tags ${mode === 'add' ? 'added to' : 'removed from'} ${selectedContacts.length} contacts!`
            : 'Tags updated successfully!');
    };

    if (!isOpen) return null;

    // --- Styles ---
    const overlayStyle = {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
        zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.2s ease-out'
    };

    const modalStyle = {
        backgroundColor: '#fff', borderRadius: '16px',
        width: '600px', maxWidth: '95vw', maxHeight: '90vh',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
    };

    const headerStyle = {
        padding: '24px', borderBottom: '1px solid #f1f5f9',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    };

    const bodyStyle = {
        padding: '24px', overflowY: 'auto'
    };

    const footerStyle = {
        padding: '16px 24px', borderTop: '1px solid #f1f5f9', backgroundColor: '#f8fafc',
        display: 'flex', justifyContent: 'flex-end', gap: '12px'
    };

    const pillStyle = {
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        padding: '4px 10px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600,
        backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #e2e8f0',
        transition: 'all 0.2s'
    };

    const suggestionPillStyle = {
        ...pillStyle, cursor: 'pointer', backgroundColor: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe'
    };

    return (
        <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <style>
                {`
                    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                    @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                `}
            </style>
            <div style={modalStyle}>
                {/* Header */}
                <div style={headerStyle}>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                            <i className="fas fa-tags" style={{ marginRight: '10px', color: 'var(--primary-color)' }}></i>
                            Manage Tags
                        </h2>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '4px 0 0 0' }}>
                            {isBulk ? `Managing tags for ${selectedContacts.length} contacts` : 'Edit tags for this contact'}
                        </p>
                    </div>
                    <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}>
                        <i className="fas fa-times" style={{ fontSize: '1.2rem' }}></i>
                    </button>
                </div>

                {/* Body */}
                <div style={bodyStyle}>

                    {/* Bulk Actions Toggle */}
                    {isBulk && (
                        <div style={{ marginBottom: '20px', display: 'flex', gap: '4px', background: '#f1f5f9', padding: '4px', borderRadius: '8px', width: 'fit-content' }}>
                            <button
                                onClick={() => setMode('add')}
                                style={{
                                    padding: '6px 16px', borderRadius: '6px', border: 'none', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                                    background: mode === 'add' ? '#fff' : 'transparent',
                                    color: mode === 'add' ? '#16a34a' : '#64748b',
                                    boxShadow: mode === 'add' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
                                }}
                            >
                                <i className="fas fa-plus" style={{ marginRight: '6px' }}></i> Add Tags
                            </button>
                            <button
                                onClick={() => setMode('remove')}
                                style={{
                                    padding: '6px 16px', borderRadius: '6px', border: 'none', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                                    background: mode === 'remove' ? '#fff' : 'transparent',
                                    color: mode === 'remove' ? '#dc2626' : '#64748b',
                                    boxShadow: mode === 'remove' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
                                }}
                            >
                                <i className="fas fa-minus" style={{ marginRight: '6px' }}></i> Remove Tags
                            </button>
                        </div>
                    )}

                    {/* Tag Input Area */}
                    <div style={{
                        border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px',
                        display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', minHeight: '48px',
                        marginBottom: '20px', background: '#fff'
                    }} onClick={() => document.getElementById('tagInput').focus()}>

                        {currentTags.map(tag => (
                            <span key={tag} style={pillStyle}>
                                {tag}
                                <i className="fas fa-times"
                                    style={{ marginLeft: '4px', cursor: 'pointer', fontSize: '0.75rem', color: '#94a3b8' }}
                                    onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
                                ></i>
                            </span>
                        ))}

                        <input
                            id="tagInput"
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={currentTags.length === 0 ? "Type tag name and press Enter..." : ""}
                            style={{
                                border: 'none', outline: 'none', fontSize: '0.9rem', flex: 1, minWidth: '120px', color: '#1e293b'
                            }}
                        />
                    </div>

                    {/* AI Suggestions */}
                    <div style={{ marginBottom: '24px' }}>
                        <div style={{
                            fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px',
                            display: 'flex', alignItems: 'center', gap: '6px'
                        }}>
                            <i className="fas fa-robot" style={{ color: '#8b5cf6' }}></i> AI Suggested Tags
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                            {aiSuggestions.map(tag => (
                                <div
                                    key={tag}
                                    style={suggestionPillStyle}
                                    onClick={() => addTag(tag)}
                                    title="Verified by AI based on contact history"
                                >
                                    <i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i> {tag}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Action Preview (Bulk Only) */}
                    {isBulk && currentTags.length > 0 && (
                        <div style={{ background: mode === 'add' ? '#f0fdf4' : '#fef2f2', border: `1px dashed ${mode === 'add' ? '#86efac' : '#fecaca'}`, borderRadius: '8px', padding: '12px' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: mode === 'add' ? '#166534' : '#991b1b', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                <i className={`fas ${mode === 'add' ? 'fa-check-circle' : 'fa-exclamation-circle'}`} style={{ marginTop: '2px' }}></i>
                                <div>
                                    This will <strong>{mode}</strong> the tag(s) <strong>{currentTags.join(', ')}</strong> on <strong>{selectedContacts.length} selected contacts</strong>.
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={footerStyle}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '10px 20px', borderRadius: '8px', border: '1px solid #cbd5e1',
                            background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer',
                            fontSize: '0.9rem'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        style={{
                            padding: '10px 24px', borderRadius: '8px', border: 'none',
                            background: 'var(--primary-color)',
                            color: '#fff', fontWeight: 600, cursor: 'pointer',
                            fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px',
                            boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.4)',
                            transition: 'all 0.2s'
                        }}
                    >
                        {isBulk ? 'Apply to Contacts' : 'Save Tags'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ManageTagsModal;
