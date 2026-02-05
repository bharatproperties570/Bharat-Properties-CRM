import React, { useState, useRef, useEffect } from 'react';
import { whatsappTemplates, smsTemplates, rcsTemplates } from '../../../data/mockData';
import Swal from 'sweetalert2';
import { toast } from 'react-hot-toast';

// --- Sub-Components ---

const MessagingTemplateModal = ({ isOpen, onClose, channelType, initialData, onSave }) => {
    const [templateData, setTemplateData] = useState({
        name: '',
        category: 'MARKETING',
        language: 'en_US',
        headerType: 'NONE',
        headerText: '',
        body: '',
        footer: '',
        buttons: [],
        tags: [],
        shared: true
    });
    const [tagInput, setTagInput] = useState('');

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setTemplateData({
                    ...initialData,
                    // Ensure nested fields are initialized if missing
                    buttons: initialData.buttons || [],
                    tags: initialData.tags || [],
                    headerType: initialData.headerType || 'NONE'
                });
            } else {
                setTemplateData({
                    name: '',
                    category: 'MARKETING',
                    language: 'en_US',
                    headerType: 'NONE',
                    headerText: '',
                    body: (channelType === 'whatsapp' || channelType === 'sms') ? '' : '',
                    footer: '',
                    buttons: [],
                    tags: [],
                    shared: true
                });
            }
        }
    }, [isOpen, initialData, channelType]);

    if (!isOpen) return null;

    const charCount = templateData.body.length;
    const segments = Math.ceil(charCount / 160) || 1;

    const addButton = () => {
        if (templateData.buttons.length < 3) {
            setTemplateData({
                ...templateData,
                buttons: [...templateData.buttons, { type: 'QUICK_REPLY', text: '' }]
            });
        }
    };

    const updateButton = (idx, field, value) => {
        const newButtons = [...templateData.buttons];
        newButtons[idx][field] = value;
        setTemplateData({ ...templateData, buttons: newButtons });
    };

    const removeButton = (idx) => {
        setTemplateData({
            ...templateData,
            buttons: templateData.buttons.filter((_, i) => i !== idx)
        });
    };

    const renderWhatsAppFields = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '8px' }}>Category</label>
                    <select value={templateData.category} onChange={e => setTemplateData({ ...templateData, category: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                        <option value="MARKETING">Marketing</option>
                        <option value="UTILITY">Utility</option>
                        <option value="AUTHENTICATION">Authentication</option>
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '8px' }}>Language</label>
                    <select value={templateData.language} onChange={e => setTemplateData({ ...templateData, language: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                        <option value="en_US">English (US)</option>
                        <option value="hi">Hindi</option>
                        <option value="gu">Gujarati</option>
                    </select>
                </div>
            </div>

            <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '8px' }}>Header (Optional)</label>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                    {['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'].map(type => (
                        <button key={type} onClick={() => setTemplateData({ ...templateData, headerType: type })} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, border: '1px solid #e2e8f0', background: templateData.headerType === type ? 'var(--primary-color)' : '#fff', color: templateData.headerType === type ? '#fff' : '#64748b' }}>{type}</button>
                    ))}
                </div>
                {templateData.headerType === 'TEXT' && (
                    <input type="text" placeholder="Enter header text..." value={templateData.headerText} onChange={e => setTemplateData({ ...templateData, headerText: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
                )}
                {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(templateData.headerType) && (
                    <div style={{ padding: '20px', border: '2px dashed #e2e8f0', borderRadius: '8px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                        <i className="fas fa-cloud-upload-alt" style={{ marginBottom: '8px', display: 'block', fontSize: '1.2rem' }}></i>
                        Upload {templateData.headerType.toLowerCase()} file
                    </div>
                )}
            </div>

            <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '8px' }}>Body Message <span style={{ color: '#ef4444' }}>*</span></label>
                <textarea
                    style={{ width: '100%', minHeight: '120px', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem', resize: 'vertical' }}
                    placeholder="Hello {{1}}, welcome to Bharat Properties! Our team will contact you regarding {{2}} soon."
                    value={templateData.body}
                    onChange={e => setTemplateData({ ...templateData, body: e.target.value })}
                />
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>Use numbers in double curly brackets like {"{{1}}"} as variables.</div>
            </div>

            <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '8px' }}>Footer (Optional)</label>
                <input type="text" placeholder="e.g. Reply STOP to opt out" value={templateData.footer} onChange={e => setTemplateData({ ...templateData, footer: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
            </div>

            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b' }}>Buttons (Max 3)</label>
                    {templateData.buttons.length < 3 && <button onClick={addButton} style={{ fontSize: '0.75rem', color: 'var(--primary-color)', background: 'none', border: 'none', fontWeight: 700, cursor: 'pointer' }}>+ Add Button</button>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {templateData.buttons.map((btn, i) => (
                        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <select value={btn.type} onChange={e => updateButton(i, 'type', e.target.value)} style={{ padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8rem' }}>
                                <option value="QUICK_REPLY">Quick Reply</option>
                                <option value="URL">Visit Website</option>
                                <option value="PHONE">Call Number</option>
                            </select>
                            <input type="text" placeholder="Button Label" value={btn.text} onChange={e => updateButton(i, 'text', e.target.value)} style={{ flex: 1, padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8rem' }} />
                            <i className="fas fa-trash-alt" style={{ color: '#cbd5e1', cursor: 'pointer', fontSize: '0.85rem' }} onClick={() => removeButton(i)}></i>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    const renderRCSFields = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '8px' }}>Rich Media (Card)</label>
                <div style={{ padding: '24px', border: '2px dashed #e2e8f0', borderRadius: '12px', textAlign: 'center', color: '#94a3b8', background: '#f8fafc' }}>
                    <i className="fas fa-images" style={{ fontSize: '1.5rem', marginBottom: '8px', display: 'block' }}></i>
                    <span style={{ fontSize: '0.85rem' }}>Upload High-Res Image or Video</span>
                </div>
            </div>

            <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '8px' }}>RCS Body Text <span style={{ color: '#ef4444' }}>*</span></label>
                <textarea
                    style={{ width: '100%', minHeight: '100px', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem', resize: 'vertical' }}
                    placeholder="Enter your rich message content..."
                    value={templateData.body}
                    onChange={e => setTemplateData({ ...templateData, body: e.target.value })}
                />
            </div>

            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b' }}>Suggested Actions (Max 4)</label>
                    {templateData.buttons.length < 4 && <button onClick={() => setTemplateData({ ...templateData, buttons: [...templateData.buttons, { type: 'URL', text: '' }] })} style={{ fontSize: '0.75rem', color: 'var(--primary-color)', background: 'none', border: 'none', fontWeight: 700, cursor: 'pointer' }}>+ Add Action</button>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {templateData.buttons.map((btn, i) => (
                        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <select value={btn.type} onChange={e => updateButton(i, 'type', e.target.value)} style={{ padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8rem' }}>
                                <option value="URL">Open Website</option>
                                <option value="PHONE">Dial Number</option>
                                <option value="MAP">Show Location</option>
                                <option value="CALENDAR">Add Event</option>
                            </select>
                            <input type="text" placeholder="Action Label" value={btn.text} onChange={e => updateButton(i, 'text', e.target.value)} style={{ flex: 1, padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8rem' }} />
                            <i className="fas fa-trash-alt" style={{ color: '#cbd5e1', cursor: 'pointer', fontSize: '0.85rem' }} onClick={() => removeButton(i)}></i>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    const renderSMSFields = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '8px' }}>Message Body <span style={{ color: '#ef4444' }}>*</span></label>
                <textarea
                    style={{ width: '100%', minHeight: '180px', padding: '16px', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '1rem', resize: 'vertical', lineHeight: '1.5' }}
                    placeholder="Enter your SMS content here..."
                    value={templateData.body}
                    onChange={e => setTemplateData({ ...templateData, body: e.target.value })}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', background: '#f8fafc', padding: '10px 16px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        Characters: <span style={{ fontWeight: 700, color: charCount > 160 ? '#f59e0b' : '#1e293b' }}>{charCount}</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        Segments: <span style={{ fontWeight: 700, color: segments > 1 ? '#f59e0b' : '#1e293b' }}>{segments}</span> / 160 chars
                    </div>
                </div>
            </div>
        </div>
    );

    const getChannelIcon = () => {
        switch (channelType) {
            case 'whatsapp': return 'fab fa-whatsapp';
            case 'rcs': return 'fas fa-comment-dots';
            default: return 'fas fa-comment-alt';
        }
    };

    const getChannelTitle = () => {
        switch (channelType) {
            case 'whatsapp': return 'WhatsApp';
            case 'rcs': return 'RCS';
            default: return 'SMS';
        }
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001 }}>
            <div style={{ background: '#fff', width: '1000px', maxHeight: '95vh', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                <div style={{ padding: '20px 32px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: channelType === 'rcs' ? '#4285F4' : 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                            <i className={getChannelIcon()}></i>
                        </div>
                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>Add {getChannelTitle()} Template</h2>
                    </div>
                    <i className="fas fa-times" style={{ cursor: 'pointer', color: '#94a3b8', fontSize: '1.2rem' }} onClick={onClose}></i>
                </div>

                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                    {/* Left Panel: Form */}
                    <div style={{ flex: 3.5, padding: '32px', overflowY: 'auto', borderRight: '1px solid #f1f5f9' }}>
                        <div style={{ marginBottom: '24px' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>Template name <span style={{ color: '#ef4444' }}>*</span></label>
                            <input
                                type="text"
                                style={{ width: '100%', padding: '12px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem' }}
                                placeholder="e.g. Lead Follow-up"
                                value={templateData.name}
                                onChange={e => setTemplateData({ ...templateData, name: e.target.value })}
                            />
                        </div>

                        <div style={{ marginBottom: '32px' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>Assign Tags</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', minHeight: '48px', alignItems: 'center' }}>
                                {templateData.tags.map(tag => (
                                    <div key={tag} style={{ background: '#f1f5f9', padding: '4px 12px', borderRadius: '6px', fontSize: '0.85rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {tag} <i className="fas fa-times" style={{ cursor: 'pointer', fontSize: '0.75rem', color: '#94a3b8' }} onClick={() => setTemplateData({ ...templateData, tags: templateData.tags.filter(t => t !== tag) })}></i>
                                    </div>
                                ))}
                                <input
                                    type="text"
                                    style={{ border: 'none', outline: 'none', flex: 1, minWidth: '120px', fontSize: '0.95rem' }}
                                    placeholder={templateData.tags.length === 0 ? "Search or create tags..." : ""}
                                    value={tagInput}
                                    onChange={e => setTagInput(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && tagInput.trim()) {
                                            setTemplateData({ ...templateData, tags: [...templateData.tags, tagInput.trim()] });
                                            setTagInput('');
                                        }
                                    }}
                                />
                            </div>
                        </div>

                        <div style={{ marginBottom: '32px', cursor: 'pointer' }} onClick={() => setTemplateData({ ...templateData, shared: !templateData.shared })}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                <div style={{ width: '20px', height: '20px', border: '2px solid #cbd5e1', borderRadius: '6px', background: templateData.shared ? 'var(--primary-color)' : '#fff', borderColor: templateData.shared ? 'var(--primary-color)' : '#cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '2px' }}>
                                    {templateData.shared && <i className="fas fa-check" style={{ color: '#fff', fontSize: '0.7rem' }}></i>}
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>Share with everyone</div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>Make this template available to all team members.</div>
                                </div>
                            </div>
                        </div>

                        <div style={{ height: '1px', background: '#f1f5f9', margin: '32px 0' }}></div>

                        {channelType === 'whatsapp' ? renderWhatsAppFields() : channelType === 'rcs' ? renderRCSFields() : renderSMSFields()}
                    </div>

                    {/* Right Panel: Preview */}
                    <div style={{ flex: 2.5, padding: '32px', background: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: '280px', height: '580px', background: '#1e1e1e', borderRadius: '40px', border: '8px solid #333', padding: '12px', boxSizing: 'content-box', position: 'relative', boxShadow: '0 20px 50px rgba(0,0,0,0.1)' }}>
                            <div style={{ position: 'absolute', top: '0', left: '50%', transform: 'translateX(-50%)', width: '120px', height: '20px', background: '#333', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px' }}></div>

                            <div style={{ width: '100%', height: '100%', background: channelType === 'rcs' ? '#fff' : '#ece5dd', borderRadius: '32px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ background: channelType === 'rcs' ? '#fff' : '#075e54', padding: '30px 16px 12px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: channelType === 'rcs' ? '1px solid #f1f5f9' : 'none' }}>
                                    <i className="fas fa-arrow-left" style={{ color: channelType === 'rcs' ? '#4285F4' : '#fff', fontSize: '0.9rem' }}></i>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: channelType === 'rcs' ? '#e8f0fe' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <i className="fas fa-building" style={{ color: channelType === 'rcs' ? '#4285F4' : '#075e54', fontSize: '0.8rem' }}></i>
                                    </div>
                                    <div style={{ color: channelType === 'rcs' ? '#1e293b' : '#fff' }}>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>Bharat Properties</div>
                                        <div style={{ fontSize: '0.65rem', opacity: 0.8 }}>Online</div>
                                    </div>
                                </div>

                                <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                                    <div style={{ background: channelType === 'rcs' ? '#e8f0fe' : '#fff', padding: channelType === 'rcs' ? '0' : '8px', borderRadius: '12px', maxWidth: '90%', position: 'relative', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                                        {channelType === 'whatsapp' && templateData.headerType !== 'NONE' && (
                                            <div style={{ background: '#f1f5f9', borderRadius: '8px', padding: '12px', marginBottom: '8px', fontSize: '0.75rem', fontWeight: 700, textAlign: 'center' }}>
                                                {templateData.headerType === 'TEXT' ? templateData.headerText || 'Header Text' : `[${templateData.headerType} Media]`}
                                            </div>
                                        )}
                                        {channelType === 'rcs' && (
                                            <div style={{ width: '100%', height: '120px', background: '#d1e3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4285F4' }}>
                                                <i className="fas fa-image" style={{ fontSize: '1.5rem' }}></i>
                                            </div>
                                        )}
                                        <div style={{ padding: channelType === 'rcs' ? '12px' : '0', fontSize: '0.85rem', color: '#333', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                                            {templateData.body || (channelType === 'whatsapp' ? 'Enter template body...' : channelType === 'rcs' ? 'Enter rich content...' : 'Enter SMS content...')}
                                        </div>
                                        {channelType === 'whatsapp' && templateData.footer && (
                                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '6px' }}>{templateData.footer}</div>
                                        )}
                                        <div style={{ textAlign: 'right', fontSize: '0.6rem', color: channelType === 'rcs' ? '#4285F4' : '#94a3b8', marginTop: '4px', paddingRight: '8px', paddingBottom: '4px' }}>10:48 AM</div>
                                    </div>

                                    {(channelType === 'whatsapp' || channelType === 'rcs') && templateData.buttons.length > 0 && (
                                        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '90%' }}>
                                            {templateData.buttons.map((btn, i) => (
                                                <div key={i} style={{ background: '#fff', padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#4285F4', fontSize: '0.8rem', fontWeight: 700, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                                    {btn.type === 'PHONE' && <i className="fas fa-phone-alt"></i>}
                                                    {btn.type === 'URL' && <i className="fas fa-external-link-alt"></i>}
                                                    {btn.type === 'MAP' && <i className="fas fa-map-marker-alt"></i>}
                                                    {btn.text || 'Action Label'}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div style={{ marginTop: '20px', fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>RCS RICH PREVIEW</div>
                    </div>
                </div>

                <div style={{ padding: '20px 32px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button className="btn-outline" onClick={onClose} style={{ background: '#fff' }}>Cancel</button>
                    <button className="btn-primary" onClick={() => { onSave(templateData); onClose(); }}>Save Template</button>
                </div>
            </div>
        </div>
    );
};

const MessagingSettingsPage = () => {
    const [subTab, setSubTab] = useState('templates');
    const [templateType, setTemplateType] = useState('whatsapp'); // Default to whatsapp
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);

    // Initialize state with mock data
    const [allTemplates, setAllTemplates] = useState({
        whatsapp: whatsappTemplates,
        sms: smsTemplates,
        rcs: rcsTemplates
    });

    const handleDelete = (templateId) => {
        Swal.fire({
            title: 'Are you sure?',
            text: "You won't be able to revert this!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: 'var(--primary-color)',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Yes, delete it!'
        }).then((result) => {
            if (result.isConfirmed) {
                setAllTemplates(prev => ({
                    ...prev,
                    [templateType]: prev[templateType].filter(t => t.id !== templateId)
                }));
                toast.success('Template deleted successfully');
            }
        });
    };

    const handleEdit = (template) => {
        // Normalize field names for the modal
        const normalizedTemplate = {
            ...template,
            body: template.body || template.content || '', // WhatsApp uses 'content', modal uses 'body'
        };
        setEditingTemplate(normalizedTemplate);
        setIsTemplateModalOpen(true);
    };

    const handleSaveTemplate = (data) => {
        // For WhatsApp templates, map 'body' back to 'content'
        const savedData = templateType === 'whatsapp'
            ? { ...data, content: data.body, body: undefined }
            : data;

        setAllTemplates(prev => {
            const currentList = prev[templateType];
            if (data.id) {
                // Update
                return {
                    ...prev,
                    [templateType]: currentList.map(t => t.id === data.id ? savedData : t)
                };
            } else {
                // Add
                return {
                    ...prev,
                    [templateType]: [...currentList, { ...savedData, id: Date.now() }]
                };
            }
        });
        toast.success(data.id ? 'Template updated' : 'Template created');
    };

    const tabs = [
        { id: 'templates', label: 'Templates' },
        { id: 'block-list', label: 'Block list' },
        { id: 'logs', label: 'Logs' }
    ];

    const renderTabs = () => (
        <div style={{ display: 'flex', gap: '24px', borderBottom: '1px solid #f1f5f9', marginBottom: '32px' }}>
            {tabs.map(tab => (
                <div
                    key={tab.id}
                    onClick={() => setSubTab(tab.id)}
                    style={{
                        padding: '12px 0',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        color: subTab === tab.id ? 'var(--primary-color)' : '#64748b',
                        borderBottom: subTab === tab.id ? '2px solid var(--primary-color)' : '2px solid transparent',
                        cursor: 'pointer'
                    }}
                >
                    {tab.label}
                </div>
            ))}
        </div>
    );

    const renderTemplates = () => {
        const templatesToDisplay = allTemplates[templateType] || [];

        return (
            <div>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '32px' }}>
                    <div style={{ display: 'flex', background: '#f8fafc', padding: '4px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <button onClick={() => setTemplateType('sms')} style={{ padding: '8px 32px', border: 'none', background: templateType === 'sms' ? '#fff' : 'transparent', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 700, color: templateType === 'sms' ? 'var(--primary-color)' : '#64748b', boxShadow: templateType === 'sms' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }}>SMS</button>
                        <button onClick={() => setTemplateType('whatsapp')} style={{ padding: '8px 32px', border: 'none', background: templateType === 'whatsapp' ? '#fff' : 'transparent', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 700, color: templateType === 'whatsapp' ? 'var(--primary-color)' : '#64748b', boxShadow: templateType === 'whatsapp' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }}>Whatsapp</button>
                        <button onClick={() => setTemplateType('rcs')} style={{ padding: '8px 32px', border: 'none', background: templateType === 'rcs' ? '#fff' : 'transparent', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 700, color: templateType === 'rcs' ? '#4285F4' : '#64748b', boxShadow: templateType === 'rcs' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }}>RCS</button>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <div style={{ position: 'relative' }}>
                            <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#cbd5e1' }}></i>
                            <input type="text" placeholder="Search..." style={{ padding: '8px 12px 8px 36px', border: '1px solid #e2e8f0', borderRadius: '4px', width: '240px' }} />
                        </div>
                        <button className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff' }}>Filter tags <i className="fas fa-chevron-down"></i></button>
                    </div>
                    <button className="btn-primary" onClick={() => { setEditingTemplate(null); setIsTemplateModalOpen(true); }}>Add template</button>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                            <th style={{ padding: '12px' }}>Template name</th>
                            <th style={{ padding: '12px' }}>Status</th>
                            <th style={{ padding: '12px' }}>Dated</th>
                            <th style={{ padding: '12px' }}>Tags</th>
                            <th style={{ padding: '12px' }}>Created by</th>
                            <th style={{ padding: '12px' }}>Sharing</th>
                            <th style={{ padding: '12px' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {templatesToDisplay.length > 0 ? templatesToDisplay.map((row, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '16px 12px', fontWeight: 600, color: 'var(--primary-color)' }}>{row.name}</td>
                                <td style={{ padding: '16px 12px' }}><span style={{ color: '#22c55e', fontWeight: 600 }}>Active</span></td>
                                <td style={{ padding: '16px 12px' }}>05/02/2026</td>
                                <td style={{ padding: '16px 12px' }}><span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>{row.tags ? row.tags[0] : 'Property'}</span></td>
                                <td style={{ padding: '16px 12px' }}>Bharat Properties</td>
                                <td style={{ padding: '16px 12px' }}>Owned by you</td>
                                <td style={{ padding: '16px 12px' }}>
                                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                        <i
                                            className="far fa-edit"
                                            style={{ cursor: 'pointer', color: '#3b82f6' }}
                                            onClick={() => handleEdit(row)}
                                            title="Edit Template"
                                        ></i>
                                        <i
                                            className="far fa-trash-alt"
                                            style={{ cursor: 'pointer', color: '#ef4444' }}
                                            onClick={() => handleDelete(row.id)}
                                            title="Delete Template"
                                        ></i>
                                    </div>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No templates found for this channel.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderBlocklist = () => (
        <div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>Block Messaging</div>
            <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '24px' }}>Block SMS and WhatsApp messages from specific numbers.</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '32px' }}>
                <input type="text" style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: '4px', width: '240px' }} placeholder="+91..." />
                <button className="btn-outline" style={{ padding: '8px 16px' }}>+</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                    { name: 'Aastha Gupta', num: '+91-7888485883', channels: ['SMS', 'WhatsApp'] },
                    { name: 'Parampreet Singh Malhali', num: '+91-897534321', channels: ['WhatsApp'] },
                    { name: 'ramesh', num: '+91-9812345678', channels: ['SMS', 'WhatsApp'] }
                ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>{item.name}</span>
                            <span style={{ fontSize: '0.9rem', color: '#64748b' }}>{item.num}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: '12px', fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>
                                {item.channels.join(', ')}
                            </div>
                            <span style={{ fontSize: '0.85rem', color: '#94a3b8', cursor: 'pointer' }}>Unblock</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>
            <div style={{ padding: '32px 40px', borderBottom: '1px solid #f1f5f9' }}>
                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase' }}>Messaging Settings</h2>
                <div style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '8px' }}>Manage SMS, WhatsApp, and social media integration settings.</div>
            </div>

            <div style={{ flex: 1, padding: '32px 40px', overflowY: 'auto' }}>
                {renderTabs()}

                {subTab === 'templates' && renderTemplates()}
                {subTab === 'block-list' && renderBlocklist()}
                {subTab === 'logs' && (
                    <div style={{ padding: '80px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                        <i className="fas fa-comment-alt-lines" style={{ fontSize: '3rem', color: '#cbd5e1', marginBottom: '20px' }}></i>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>Conversation Logs</h3>
                        <p style={{ color: '#64748b' }}>All sent and received messages will appear here.</p>
                    </div>
                )}
            </div>

            <MessagingTemplateModal
                isOpen={isTemplateModalOpen}
                onClose={() => { setIsTemplateModalOpen(false); setEditingTemplate(null); }}
                channelType={templateType}
                initialData={editingTemplate}
                onSave={handleSaveTemplate}
            />
        </div>
    );
};

export default MessagingSettingsPage;
