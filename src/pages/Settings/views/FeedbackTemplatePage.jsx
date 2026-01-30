import React, { useState } from 'react';
import { usePropertyConfig } from '../../../context/PropertyConfigContext';

const FeedbackTemplatePage = () => {
    const { masterFields, updateMasterFields } = usePropertyConfig();
    const [selectedOutcome, setSelectedOutcome] = useState(masterFields.propertyOwnerFeedback?.[0] || '');
    const [activeChannel, setActiveChannel] = useState('whatsapp');

    const templates = masterFields.responseTemplates || {};
    const outcomes = masterFields.propertyOwnerFeedback || [];

    const currentTemplateContent = templates[selectedOutcome]?.[activeChannel] || '';

    const handleSaveTemplate = (newContent) => {
        const updatedTemplates = {
            ...templates,
            [selectedOutcome]: {
                ...(templates[selectedOutcome] || {}),
                [activeChannel]: newContent
            }
        };
        updateMasterFields('responseTemplates', updatedTemplates);
    };

    const insertPlaceholder = (placeholder) => {
        const textarea = document.getElementById('template-editor-area');
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const before = currentTemplateContent.substring(0, start);
        const after = currentTemplateContent.substring(end);
        const newValue = before + placeholder + after;

        handleSaveTemplate(newValue);

        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + placeholder.length, start + placeholder.length);
        }, 0);
    };

    return (
        <div style={{ flex: 1, padding: '32px 40px', background: '#fff', overflowY: 'auto' }}>
            <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Smart Message Templates</h2>
                <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Customize the automated messages for each communication channel.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '32px', alignItems: 'start' }}>
                {/* Outcomes List */}
                <div style={{ background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px' }}>
                    <h3 style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '16px', letterSpacing: '0.05em' }}>Interaction Outcome</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {outcomes.map(outcome => (
                            <div
                                key={outcome}
                                onClick={() => setSelectedOutcome(outcome)}
                                style={{
                                    padding: '10px 14px',
                                    borderRadius: '8px',
                                    background: selectedOutcome === outcome ? 'var(--primary-color)' : 'transparent',
                                    color: selectedOutcome === outcome ? '#fff' : '#475569',
                                    fontWeight: selectedOutcome === outcome ? 700 : 500,
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {outcome}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Editor Section */}
                <div>
                    {/* Channel Tabs */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', background: '#f1f5f9', padding: '4px', borderRadius: '8px', width: 'fit-content' }}>
                        {[
                            { id: 'whatsapp', label: 'WhatsApp', icon: 'fab fa-whatsapp' },
                            { id: 'sms', label: 'SMS', icon: 'fas fa-comment-alt' },
                            { id: 'email', label: 'Email', icon: 'fas fa-envelope' }
                        ].map(ch => (
                            <button
                                key={ch.id}
                                onClick={() => setActiveChannel(ch.id)}
                                style={{
                                    padding: '8px 20px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: activeChannel === ch.id ? '#fff' : 'transparent',
                                    color: activeChannel === ch.id ? 'var(--primary-color)' : '#64748b',
                                    fontSize: '0.85rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    boxShadow: activeChannel === ch.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <i className={ch.icon}></i>
                                {ch.label}
                            </button>
                        ))}
                    </div>

                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', background: '#fff' }}>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', marginBottom: '12px' }}>
                                Template for <span style={{ color: 'var(--primary-color)' }}>{selectedOutcome}</span> ({activeChannel.toUpperCase()})
                            </label>
                            <textarea
                                id="template-editor-area"
                                value={currentTemplateContent}
                                onChange={(e) => handleSaveTemplate(e.target.value)}
                                style={{
                                    width: '100%',
                                    minHeight: activeChannel === 'email' ? '300px' : '120px',
                                    padding: '16px',
                                    borderRadius: '12px',
                                    border: '1px solid #cbd5e1',
                                    fontSize: '0.95rem',
                                    color: '#334155',
                                    lineHeight: '1.6',
                                    outline: 'none',
                                    background: '#f8fafc',
                                    resize: 'vertical'
                                }}
                                placeholder={`Enter ${activeChannel} message here...`}
                            />
                        </div>

                        <div style={{ marginBottom: '32px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Available Placeholders</span>
                                <div style={{ height: '1px', flex: 1, background: '#f1f5f9' }}></div>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {['{owner}', '{unit}', '{time}', '{reason}'].map(p => (
                                    <button
                                        key={p}
                                        onClick={() => insertPlaceholder(p)}
                                        style={{
                                            padding: '6px 14px',
                                            borderRadius: '6px',
                                            border: '1px solid #e2e8f0',
                                            background: '#fff',
                                            color: '#475569',
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => { e.target.style.background = '#f8fafc', e.target.style.borderColor = '#cbd5e1' }}
                                        onMouseLeave={(e) => { e.target.style.background = '#fff', e.target.style.borderColor = '#e2e8f0' }}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', background: '#f8fafc', padding: '12px', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
                            <i className="fas fa-info-circle" style={{ marginRight: '8px', color: '#3b82f6' }}></i>
                            Changes are saved automatically to the master configuration. This template will be triggered based on your <strong>Automation Settings</strong>.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FeedbackTemplatePage;
