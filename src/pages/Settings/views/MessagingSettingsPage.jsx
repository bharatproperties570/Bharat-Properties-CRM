import { useState, useEffect, useCallback, useMemo } from 'react';
import { whatsappTemplates, smsTemplates, rcsTemplates } from '../../../constants/templates';
import { systemSettingsAPI } from '../../../utils/api';
import Swal from 'sweetalert2';
import { toast } from 'react-hot-toast';
import { Sparkles, ShieldCheck, MessageSquare, Clock, Globe, Settings, Database, History, Ban } from 'lucide-react';
import smsService from '../../../services/smsService';
import whatsappService from '../../../services/whatsappService';
import VariableTextarea from '../../../components/VariableTextarea';


// --- Sub-Components ---

const MessagingTemplateModal = ({ isOpen, onClose, channelType, initialData, onSave }) => {
    const [templateData, setTemplateData] = useState({
        name: '',
        category: 'Transactional',
        language: 'en_US',
        headerType: 'NONE',
        headerText: '',
        body: '',
        footer: '',
        buttons: [],
        tags: [],
        shared: true,
        dltTemplateId: '',
        dltHeaderId: '',
        systemContext: initialData?.systemContext || []
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
                    headerType: initialData.headerType || 'NONE',
                    variableMapping: initialData.variableMapping || {}
                });
            } else {
                setTemplateData({
                    name: '',
                    category: channelType === 'sms' ? 'Transactional' : 'MARKETING',
                    language: 'en_US',
                    headerType: 'NONE',
                    headerText: '',
                    body: (channelType === 'whatsapp' || channelType === 'sms') ? '' : '',
                    footer: '',
                    buttons: [],
                    tags: [],
                    shared: true,
                    dltTemplateId: '',
                    dltHeaderId: '',
                    variableMapping: {}
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
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Category</label>
                    <select value={templateData.category} onChange={e => setTemplateData({ ...templateData, category: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                        <option value="MARKETING">Marketing</option>
                        <option value="UTILITY">Utility</option>
                        <option value="AUTHENTICATION">Authentication</option>
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Language</label>
                    <select value={templateData.language} onChange={e => setTemplateData({ ...templateData, language: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                        <option value="en_US">English (US)</option>
                        <option value="hi">Hindi</option>
                        <option value="gu">Gujarati</option>
                    </select>
                </div>
            </div>

            {/* ENTERPRISE UPGRADE: System Trigger Intent Context */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block' }}>
                    <i className="fas fa-plug" style={{ color: 'var(--primary-color)', marginRight: '6px' }}></i>
                    System Trigger Context (Where should this template be used?)
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '12px', background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: '8px' }}>
                    {[
                        { value: 'lead_match_full', label: 'Lead Match (Full Details)' },
                        { value: 'lead_match_short', label: 'Lead Match (Short Details)' },
                        { value: 'deal_match', label: 'Deal Match (Auto-Dispatch & Centre)' },
                        { value: 'marketing_blast', label: 'Marketing Blast' },
                        { value: 'welcome', label: 'Welcome/Auto-Reply' }
                    ].map(ctx => {
                        const isSelected = templateData.systemContext?.includes(ctx.value);
                        return (
                            <div 
                                key={ctx.value}
                                onClick={() => {
                                    let newContext = [...(templateData.systemContext || [])];
                                    if (isSelected) {
                                        newContext = newContext.filter(c => c !== ctx.value);
                                    } else {
                                        newContext.push(ctx.value);
                                    }
                                    setTemplateData({ ...templateData, systemContext: newContext });
                                }}
                                style={{ 
                                    padding: '6px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                                    background: isSelected ? 'var(--primary-color)' : 'var(--bg-card)', 
                                    color: isSelected ? '#fff' : 'var(--text-muted)', 
                                    border: `1px solid ${isSelected ? 'var(--primary-color)' : 'var(--border-color)'}`
                                }}>
                                {isSelected ? <i className="fas fa-check" style={{ marginRight: '4px' }}></i> : ''}
                                {ctx.label}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Header (Optional)</label>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                    {['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'].map(type => (
                        <button key={type} onClick={() => setTemplateData({ ...templateData, headerType: type })} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, border: '1px solid var(--border-color)', background: templateData.headerType === type ? 'var(--primary-color)' : 'var(--bg-card)', color: templateData.headerType === type ? 'var(--bg-card)' : 'var(--text-muted)' }}>{type}</button>
                    ))}
                </div>
                {templateData.headerType === 'TEXT' && (
                    <input type="text" placeholder="Enter header text..." value={templateData.headerText} onChange={e => setTemplateData({ ...templateData, headerText: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                )}
                {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(templateData.headerType) && (
                    <div style={{ padding: '20px', border: '2px dashed rgba(148, 163, 184, 0.15)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        <i className="fas fa-cloud-upload-alt" style={{ marginBottom: '8px', display: 'block', fontSize: '1.2rem' }}></i>
                        Upload {templateData.headerType.toLowerCase()} file
                    </div>
                )}
            </div>

            <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Body Message <span style={{ color: '#ef4444' }}>*</span></label>
                <VariableTextarea
                    placeholder="Hello {{firstName}}, welcome to Bharat Properties! Our team will contact you regarding {{projectName}} soon."
                    value={templateData.body}
                    onChange={e => setTemplateData({ ...templateData, body: e.target.value })}
                />
            </div>

            <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Footer (Optional)</label>
                <input type="text" placeholder="e.g. Reply STOP to opt out" value={templateData.footer} onChange={e => setTemplateData({ ...templateData, footer: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
            </div>

            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Buttons (Max 3)</label>
                    {templateData.buttons.length < 3 && <button onClick={addButton} style={{ fontSize: '0.75rem', color: 'var(--primary-color)', background: 'none', border: 'none', fontWeight: 700, cursor: 'pointer' }}>+ Add Button</button>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {templateData.buttons.map((btn, i) => (
                        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <select value={btn.type} onChange={e => updateButton(i, 'type', e.target.value)} style={{ padding: '8px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.8rem' }}>
                                <option value="QUICK_REPLY">Quick Reply</option>
                                <option value="URL">Visit Website</option>
                                <option value="PHONE">Call Number</option>
                            </select>
                            <input type="text" placeholder="Button Label" value={btn.text} onChange={e => updateButton(i, 'text', e.target.value)} style={{ flex: 1, padding: '8px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.8rem' }} />
                            <i className="fas fa-trash-alt" style={{ color: 'var(--border-color)', cursor: 'pointer', fontSize: '0.85rem' }} onClick={() => removeButton(i)}></i>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    const renderRCSFields = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Rich Media (Card)</label>
                <div style={{ padding: '24px', border: '2px dashed rgba(148, 163, 184, 0.15)', borderRadius: '12px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-light)' }}>
                    <i className="fas fa-images" style={{ fontSize: '1.5rem', marginBottom: '8px', display: 'block' }}></i>
                    <span style={{ fontSize: '0.85rem' }}>Upload High-Res Image or Video</span>
                </div>
            </div>

            <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>RCS Body Text <span style={{ color: '#ef4444' }}>*</span></label>
                <VariableTextarea
                    minHeight="100px"
                    placeholder="Enter your rich message content..."
                    value={templateData.body}
                    onChange={e => setTemplateData({ ...templateData, body: e.target.value })}
                />
            </div>

            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Suggested Actions (Max 4)</label>
                    {templateData.buttons.length < 4 && <button onClick={() => setTemplateData({ ...templateData, buttons: [...templateData.buttons, { type: 'URL', text: '' }] })} style={{ fontSize: '0.75rem', color: 'var(--primary-color)', background: 'none', border: 'none', fontWeight: 700, cursor: 'pointer' }}>+ Add Action</button>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {templateData.buttons.map((btn, i) => (
                        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <select value={btn.type} onChange={e => updateButton(i, 'type', e.target.value)} style={{ padding: '8px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.8rem' }}>
                                <option value="URL">Open Website</option>
                                <option value="PHONE">Dial Number</option>
                                <option value="MAP">Show Location</option>
                                <option value="CALENDAR">Add Event</option>
                            </select>
                            <input type="text" placeholder="Action Label" value={btn.text} onChange={e => updateButton(i, 'text', e.target.value)} style={{ flex: 1, padding: '8px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.8rem' }} />
                            <i className="fas fa-trash-alt" style={{ color: 'var(--border-color)', cursor: 'pointer', fontSize: '0.85rem' }} onClick={() => removeButton(i)}></i>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    const renderVariableMapping = () => {
        if (channelType !== 'whatsapp') return null;

        const fieldOptions = [
            { id: 'firstname', label: 'First Name' },
            { id: 'customer_name', label: 'Full Name' },
            { id: 'mobile', label: 'Mobile Number' },
            { id: 'email', label: 'Email Address' },
            { id: 'unitno', label: 'Unit/Plot Number' },
            { id: 'size', label: 'Size (3 BHK/Marla)' },
            { id: 'price', label: 'Basic Price' },
            { id: 'projectname', label: 'Project Name' },
            { id: 'location', label: 'Location' },
            { id: 'property_list_default', label: 'Property List (Default)' },
            { id: 'property_list_detailed', label: 'Property List (Detailed)' },
            { id: 'assignedto', label: 'Assigned Agent' },
            { id: 'ownermobile', label: 'Agent Mobile' },
            { id: 'propertiescount', label: 'Properties Count' },
            { id: 'agent_name', label: 'Agent Name' },
            { id: 'agent_mobile', label: 'Agent Mobile' },
            { id: 'ai_intent_summary', label: 'AI Intent Summary' }
        ];

        return (
            <div style={{ marginTop: '32px', background: 'var(--bg-light)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldCheck size={18} color="var(--primary-color)" /> Template Variable Mapping (Override)
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '20px' }}>Define what each {"{{n}}"} variable represents for THIS template specifically.</div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                    {[1, 2, 3, 4, 5, 6].map(num => {
                        const idx = String(num);
                        const currentVal = (templateData.variableMapping && templateData.variableMapping[idx]) || '';
                        
                        return (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-card)', padding: '8px 12px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                                <div style={{ background: 'var(--text-main)', color: '#ffffff', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>
                                    {idx}
                                </div>
                                <select 
                                    value={currentVal}
                                    onChange={e => {
                                        const newMapping = { ...(templateData.variableMapping || {}), [idx]: e.target.value };
                                        setTemplateData({ ...templateData, variableMapping: newMapping });
                                    }}
                                    style={{ flex: 1, border: 'none', outline: 'none', fontSize: '0.8rem', color: currentVal ? 'var(--text-main)' : 'var(--text-muted)' }}
                                >
                                    <option value="">-- Use Global Default --</option>
                                    {fieldOptions.map(opt => (
                                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderSMSFields = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Message Body <span style={{ color: '#ef4444' }}>*</span></label>
                <VariableTextarea
                    minHeight="180px"
                    placeholder="Enter your SMS content here..."
                    value={templateData.body}
                    onChange={e => setTemplateData({ ...templateData, body: e.target.value })}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', background: 'var(--bg-light)', padding: '10px 16px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Characters: <span style={{ fontWeight: 700, color: charCount > 160 ? '#f59e0b' : 'var(--text-main)' }}>{charCount}</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Segments: <span style={{ fontWeight: 700, color: segments > 1 ? '#f59e0b' : 'var(--text-main)' }}>{segments}</span> / 160 chars
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Category</label>
                    <select
                        value={templateData.category}
                        onChange={e => setTemplateData({ ...templateData, category: e.target.value })}
                        style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                    >
                        {channelType === 'sms' ? (
                            <>
                                <option value="Promotional">Promotional</option>
                                <option value="Transactional">Transactional</option>
                            </>
                        ) : (
                            <>
                                <option value="MARKETING">Marketing</option>
                                <option value="UTILITY">Utility</option>
                                <option value="AUTHENTICATION">Authentication</option>
                            </>
                        )}
                    </select>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>DLT Template ID</label>
                    <input
                        type="text"
                        placeholder="e.g. 12071234567890"
                        value={templateData.dltTemplateId || ''}
                        onChange={e => setTemplateData({ ...templateData, dltTemplateId: e.target.value })}
                        style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                    />
                </div>
                <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>DLT Header/Sender ID</label>
                    <input
                        type="text"
                        placeholder="e.g. BHARAT"
                        value={templateData.dltHeaderId || ''}
                        onChange={e => setTemplateData({ ...templateData, dltHeaderId: e.target.value })}
                        style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                    />
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
            <div style={{ background: 'var(--bg-card)', width: '1000px', maxHeight: '95vh', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                <div style={{ padding: '20px 32px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: channelType === 'rcs' ? '#4285F4' : 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff' }}>
                            <i className={getChannelIcon()}></i>
                        </div>
                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>Add {getChannelTitle()} Template</h2>
                    </div>
                    <i className="fas fa-times" style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.2rem' }} onClick={onClose}></i>
                </div>

                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                    {/* Left Panel: Form */}
                    <div style={{ flex: 3.5, padding: '32px', overflowY: 'auto', borderRight: '1px solid #f1f5f9' }}>
                        <div style={{ marginBottom: '24px' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Template name <span style={{ color: '#ef4444' }}>*</span></label>
                            <input
                                type="text"
                                style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.95rem' }}
                                placeholder="e.g. Lead Follow-up"
                                value={templateData.name}
                                onChange={e => setTemplateData({ ...templateData, name: e.target.value })}
                            />
                        </div>

                        <div style={{ marginBottom: '32px' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Assign Tags</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', minHeight: '48px', alignItems: 'center' }}>
                                {templateData.tags.map(tag => (
                                    <div key={tag} style={{ background: 'var(--bg-light)', padding: '4px 12px', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {tag} <i className="fas fa-times" style={{ cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-muted)' }} onClick={() => setTemplateData({ ...templateData, tags: templateData.tags.filter(t => t !== tag) })}></i>
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
                                <div style={{ width: '20px', height: '20px', border: '2px solid var(--border-color)', borderRadius: '6px', background: templateData.shared ? 'var(--primary-color)' : 'var(--bg-card)', borderColor: templateData.shared ? 'var(--primary-color)' : 'var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '2px' }}>
                                    {templateData.shared && <i className="fas fa-check" style={{ color: '#ffffff', fontSize: '0.7rem' }}></i>}
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)' }}>Share with everyone</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>Make this template available to all team members.</div>
                                </div>
                            </div>
                        </div>

                        <div style={{ height: '1px', background: 'var(--bg-light)', margin: '32px 0' }}></div>

                        {channelType === 'whatsapp' ? (
                            <>
                                {renderWhatsAppFields()}
                                {renderVariableMapping()}
                            </>
                        ) : channelType === 'rcs' ? renderRCSFields() : renderSMSFields()}
                    </div>

                    {/* Right Panel: Preview */}
                    <div style={{ flex: 2.5, padding: '32px', background: 'var(--bg-light)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: '280px', height: '580px', background: 'var(--text-main)', borderRadius: '40px', border: '8px solid #333', padding: '12px', boxSizing: 'content-box', position: 'relative', boxShadow: '0 20px 50px rgba(0,0,0,0.1)' }}>
                            <div style={{ position: 'absolute', top: '0', left: '50%', transform: 'translateX(-50%)', width: '120px', height: '20px', background: 'var(--text-main)', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px' }}></div>

                            <div style={{ width: '100%', height: '100%', background: channelType === 'rcs' ? 'var(--bg-card)' : '#ece5dd', borderRadius: '32px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ background: channelType === 'rcs' ? 'var(--bg-card)' : '#075e54', padding: '30px 16px 12px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: channelType === 'rcs' ? '1px solid #f1f5f9' : 'none' }}>
                                    <i className="fas fa-arrow-left" style={{ color: channelType === 'rcs' ? '#4285F4' : 'var(--bg-card)', fontSize: '0.9rem' }}></i>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: channelType === 'rcs' ? '#e8f0fe' : 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <i className="fas fa-building" style={{ color: channelType === 'rcs' ? '#4285F4' : '#075e54', fontSize: '0.8rem' }}></i>
                                    </div>
                                    <div style={{ color: channelType === 'rcs' ? 'var(--text-main)' : 'var(--bg-card)' }}>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>Bharat Properties</div>
                                        <div style={{ fontSize: '0.65rem', opacity: 0.8 }}>Online</div>
                                    </div>
                                </div>

                                <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                                    <div style={{ background: channelType === 'rcs' ? '#e8f0fe' : 'var(--bg-card)', padding: channelType === 'rcs' ? '0' : '8px', borderRadius: '12px', maxWidth: '90%', position: 'relative', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                                        {channelType === 'whatsapp' && templateData.headerType !== 'NONE' && (
                                            <div style={{ background: 'var(--bg-light)', borderRadius: '8px', padding: '12px', marginBottom: '8px', fontSize: '0.75rem', fontWeight: 700, textAlign: 'center' }}>
                                                {templateData.headerType === 'TEXT' ? templateData.headerText || 'Header Text' : `[${templateData.headerType} Media]`}
                                            </div>
                                        )}
                                        {channelType === 'rcs' && (
                                            <div style={{ width: '100%', height: '120px', background: '#d1e3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4285F4' }}>
                                                <i className="fas fa-image" style={{ fontSize: '1.5rem' }}></i>
                                            </div>
                                        )}
                                        <div style={{ padding: channelType === 'rcs' ? '12px' : '0', fontSize: '0.85rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                                            {templateData.body || (channelType === 'whatsapp' ? 'Enter template body...' : channelType === 'rcs' ? 'Enter rich content...' : 'Enter SMS content...')}
                                        </div>
                                        {channelType === 'whatsapp' && templateData.footer && (
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '6px' }}>{templateData.footer}</div>
                                        )}
                                        <div style={{ textAlign: 'right', fontSize: '0.6rem', color: channelType === 'rcs' ? '#4285F4' : 'var(--text-muted)', marginTop: '4px', paddingRight: '8px', paddingBottom: '4px' }}>10:48 AM</div>
                                    </div>

                                    {(channelType === 'whatsapp' || channelType === 'rcs') && templateData.buttons.length > 0 && (
                                        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '90%' }}>
                                            {templateData.buttons.map((btn, i) => (
                                                <div key={i} style={{ background: 'var(--bg-card)', padding: '10px', borderRadius: '12px', border: '1px solid var(--border-color)', color: '#4285F4', fontSize: '0.8rem', fontWeight: 700, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
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
                        <div style={{ marginTop: '20px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>RCS RICH PREVIEW</div>
                    </div>
                </div>

                <div style={{ padding: '20px 32px', borderTop: '1px solid #f1f5f9', background: 'var(--bg-light)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button className="btn-outline" onClick={onClose} style={{ background: 'var(--bg-card)' }}>Cancel</button>
                    <button className="btn-primary" onClick={() => { onSave(templateData); onClose(); }}>Save Template</button>
                </div>
            </div>
        </div>
    );
};


const VariableRegistryTab = () => {
    const [variables, setVariables] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const fieldOptions = [
        {
            category: 'Customer / Lead (Internal)',
            options: [
                { id: 'name', label: 'Full Name ({name})' },
                { id: 'customer_first_name', label: 'First Name ({customer_first_name})' },
                { id: 'mobile', label: 'Mobile Number ({mobile})' },
                { id: 'email', label: 'Email Address ({email})' },
                { id: 'lead_source', label: 'Lead Source ({lead_source})' },
                { id: 'lead_stage', label: 'Sales Stage ({lead_stage})' }
            ]
        },
        {
            category: 'Unit Specifications (Internal)',
            options: [
                { id: 'unit', label: 'Unit/Plot Number ({unit})' },
                { id: 'floor_level', label: 'Floor Level ({floor_level})' },
                { id: 'facing', label: 'Facing ({facing})' },
                { id: 'size', label: 'Size ({size})' },
                { id: 'built_up_area', label: 'Built-up Area ({built_up_area})' },
                { id: 'carpet_area', label: 'Carpet Area ({carpet_area})' }
            ]
        },
        {
            category: 'Project Deep-Dive (Internal)',
            options: [
                { id: 'project', label: 'Project Name ({project})' },
                { id: 'developer', label: 'Developer/Builder ({developer})' },
                { id: 'rera_number', label: 'RERA Registration No ({rera_number})' },
                { id: 'location', label: 'Project Locality ({location})' }
            ]
        },
        {
            category: 'Financials & Pricing (Internal)',
            options: [
                { id: 'price', label: 'Basic Sale Price ({price})' },
                { id: 'total_cost', label: 'All-Inclusive Cost ({total_cost})' },
                { id: 'payment_plan', label: 'Payment Plan ({payment_plan})' }
            ]
        },
        {
            category: 'Dynamic Links & Lists (Internal)',
            options: [
                { id: 'property_list_default', label: 'Match Property Default ({property_list_default})' },
                { id: 'property_list_detailed', label: 'Match Property Detailed ({property_list_detailed})' },
                { id: 'site_visit_link', label: 'Site Visit Form Link ({site_visit_link})' },
                { id: 'feedback_link', label: 'Feedback Form Link ({feedback_link})' },
                { id: 'portal_link', label: 'Public Portal Link ({portal_link})' }
            ]
        },
        {
            category: 'AI Insights (Internal)',
            options: [
                { id: 'ai_summary', label: 'AI Intent Summary ({ai_summary})' },
                { id: 'ai_score', label: 'AI Closing Prob. ({ai_score})' }
            ]
        },
        {
            category: 'System & Branding (Internal)',
            options: [
                { id: 'agent', label: 'Agent Name ({agent})' },
                { id: 'agent_mobile', label: 'Agent Mobile ({agent_mobile})' },
                { id: 'company', label: 'Company Name ({company})' },
                { id: 'office_address', label: 'Office Address ({office_address})' }
            ]
        }
    ];

    const fetchVariables = async () => {
        try {
            const res = await systemSettingsAPI.getByKey('messaging_variable_registry');
            if (res.success && res.data?.value) {
                const raw = res.data.value;
                const normalized = {};
                // 🧠 Professional Migration Logic: Convert legacy strings to object schema
                Object.keys(raw).forEach(k => {
                    const val = raw[k];
                    if (typeof val === 'string') {
                        normalized[String(k)] = { source: val, mode: 'static' };
                    } else {
                        normalized[String(k)] = val;
                    }
                });
                setVariables(normalized);
            }
        } catch (err) {
            console.warn('No variable registry found.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchVariables();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await systemSettingsAPI.upsert('messaging_variable_registry', {
                category: 'messaging',
                value: variables,
                description: 'Tiered variable registry (Static/Dynamic support)',
                isPublic: true
            });
            toast.success('Enterprise mapping registry updated');
        } catch (err) {
            toast.error('Save failed: ' + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const updateVar = (idx, field, val) => {
        setVariables(p => ({
            ...p,
            [idx]: { ...(p[idx] || { source: '', mode: 'static' }), [field]: val }
        }));
    };

    if (isLoading) return <div style={{ padding: '40px', textAlign: 'center' }}><span className="spinner-sm"></span></div>;

    const lockedIndices = ['1', '7', '8'];

    return (
        <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', background: 'var(--bg-card)', padding: '20px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Database size={20} color="var(--primary-color)" /> Hybrid Resolution Registry
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>Configure <b>Static</b> (Global) vs <b>Dynamic</b> (Runtime) variables for enterprise campaigns.</div>
                </div>
                <button className="btn-primary" onClick={handleSave} disabled={isSaving}>
                    {isSaving ? 'Synchronizing...' : 'Save Registry'}
                </button>
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-light)', borderBottom: '1px solid var(--border-color)' }}>
                            <th style={{ padding: '16px', textAlign: 'left', width: '80px' }}>Index</th>
                            <th style={{ padding: '16px', textAlign: 'left', width: '200px' }}>Resolution Mode</th>
                            <th style={{ padding: '16px', textAlign: 'left' }}>Internal Semantic Name</th>
                            <th style={{ padding: '16px', textAlign: 'left' }}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: 30 }).map((_, i) => {
                            const idx = String(i + 1);
                            const config = variables[idx] || { source: '', mode: 'static' };
                            const isLocked = lockedIndices.includes(idx);

                            return (
                                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: isLocked ? '#fafafa' : 'var(--bg-card)' }}>
                                    <td style={{ padding: '12px 16px' }}>
                                        <div style={{ background: 'var(--text-main)', color: '#ffffff', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.75rem' }}>
                                            {idx}
                                        </div>
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <div style={{ display: 'flex', background: 'var(--bg-light)', padding: '3px', borderRadius: '8px', width: 'fit-content' }}>
                                            <button 
                                                onClick={() => !isLocked && updateVar(idx, 'mode', 'static')}
                                                style={{ padding: '6px 12px', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: isLocked ? 'not-allowed' : 'pointer', background: config.mode === 'static' ? 'var(--bg-card)' : 'transparent', color: config.mode === 'static' ? 'var(--text-main)' : 'var(--text-muted)', boxShadow: config.mode === 'static' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}
                                            >
                                                <ShieldCheck size={12} style={{ marginRight: '4px', display: 'inline' }} /> Static
                                            </button>
                                            <button 
                                                onClick={() => !isLocked && updateVar(idx, 'mode', 'dynamic')}
                                                style={{ padding: '6px 12px', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: isLocked ? 'not-allowed' : 'pointer', background: config.mode === 'dynamic' ? 'var(--bg-card)' : 'transparent', color: config.mode === 'dynamic' ? 'var(--primary-color)' : 'var(--text-muted)', boxShadow: config.mode === 'dynamic' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}
                                            >
                                                <Sparkles size={12} style={{ marginRight: '4px', display: 'inline' }} /> Dynamic
                                            </button>
                                        </div>
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <select 
                                            value={config.source} 
                                            onChange={e => updateVar(idx, 'source', e.target.value)}
                                            style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.85rem' }}
                                        >
                                            <option value="">-- No Global Fallback --</option>
                                            {fieldOptions.map(cat => (
                                                <optgroup key={cat.category} label={cat.category}>
                                                    {cat.options.map(opt => (
                                                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                                                    ))}
                                                </optgroup>
                                            ))}
                                        </select>
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                        {isLocked ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>
                                                <History size={14} /> System Locked
                                            </div>
                                        ) : config.mode === 'dynamic' ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f59e0b', fontSize: '0.75rem', fontWeight: 700 }}>
                                                <MessageSquare size={14} /> Override Allowed
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontSize: '0.75rem', fontWeight: 600 }}>
                                                <ShieldCheck size={14} /> Global Only
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// AutomationEngineTab logic removed as it has been moved to Global Business Rules

const MessagingSettingsPage = () => {
    const [subTab, setSubTab] = useState('templates');
    const [templateType, setTemplateType] = useState('whatsapp');
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isSyncingMeta, setIsSyncingMeta] = useState(false); // Enterprise Sync State

    // Initialize from hardcoded defaults; DB overrides on mount
    const [allTemplates, setAllTemplates] = useState({
        whatsapp: whatsappTemplates,
        sms: smsTemplates,
        rcs: rcsTemplates
    });

    // ── Load persisted WhatsApp + RCS templates from DB ──
    const loadPersistedTemplates = async () => {
        try {
            const [waRes, rcsRes] = await Promise.all([
                systemSettingsAPI.getByKey('crm_whatsapp_templates'),
                systemSettingsAPI.getByKey('crm_rcs_templates'),
            ]);
            
            setAllTemplates(prev => {
                const mergeTemplates = (defaultList, dbList) => {
                    if (!dbList || !dbList.length) return defaultList;
                    const merged = [...defaultList];
                    dbList.forEach(dbTpl => {
                        const idx = merged.findIndex(t => String(t.id) === String(dbTpl.id));
                        if (idx >= 0) merged[idx] = dbTpl; // Override existing
                        else merged.push(dbTpl); // Add new
                    });
                    return merged;
                };

                return {
                    ...prev,
                    whatsapp: mergeTemplates(whatsappTemplates, waRes?.data?.value),
                    rcs: mergeTemplates(rcsTemplates, rcsRes?.data?.value),
                };
            });
        } catch (err) {
            console.warn('Could not load persisted templates, using defaults:', err.message);
        }
    };

    // ── Persist WhatsApp / RCS to DB ──
    const persistTemplates = async (type, templateList) => {
        const keyMap = { whatsapp: 'crm_whatsapp_templates', rcs: 'crm_rcs_templates' };
        const key = keyMap[type];
        if (!key) return; // SMS uses its own smsService
        try {
            await systemSettingsAPI.upsert(key, { value: templateList });
        } catch (err) {
            console.error(`Failed to persist ${type} templates:`, err.message);
        }
    };

    const handleDelete = (templateId) => {
        Swal.fire({
            title: 'Are you sure?',
            text: "You won't be able to revert this!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: 'var(--primary-color)',
            cancelButtoncolor: 'var(--text-muted)',
            confirmButtonText: 'Yes, delete it!'
        }).then(async (result) => {
            if (result.isConfirmed) {
                if (templateType === 'sms') {
                    try {
                        await smsService.deleteTemplate(templateId);
                        toast.success('Template deleted successfully');
                        loadSmsTemplates();
                    } catch (err) {
                        toast.error('Failed to delete template: ' + err.message);
                    }
                } else {
                    const updatedList = allTemplates[templateType].filter(t => t.id !== templateId);
                    setAllTemplates(prev => ({ ...prev, [templateType]: updatedList }));
                    await persistTemplates(templateType, updatedList);
                    toast.success('Template deleted successfully');
                }
            }
        });
    };

    const handleEdit = (template) => {
        setEditingTemplate({
            ...template,
            body: template.body || template.content || '',
        });
        setIsTemplateModalOpen(true);
    };

    const handleSaveTemplate = async (data) => {
        setIsSyncing(true);
        try {
            if (templateType === 'sms') {
                await smsService.saveTemplate(data.id ? { ...data, _id: data.id } : data);
                loadSmsTemplates();
            } else {
                // ENTERPRISE UPGRADE: Sync Up to Meta Cloud API (WhatsApp only)
                if (templateType === 'whatsapp') {
                    try {
                        const toastId = toast.loading('Submitting template to Meta for review...');
                        await whatsappService.submitTemplateToMeta(data);
                        toast.success('Successfully submitted to Meta!', { id: toastId });
                    } catch (err) {
                        console.warn('Backend Meta Submission Endpoint missing, falling back to local CRM store:', err);
                        toast.error('Meta API integration incomplete. Saved locally only.');
                    }
                }

                // Keep body + content in sync for compatibility locally
                const savedData = {
                    ...data,
                    body:    data.body    || data.content || '',
                    content: data.content || data.body    || '',
                };

                let updatedList;
                setAllTemplates(prev => {
                    const currentList = prev[templateType];
                    
                    // 🚨 ENFORCEMENT LOGIC: 1-to-1 mapping for deal_match
                    let sanitizedList = [...currentList];
                    if (savedData.systemContext?.includes('deal_match')) {
                        let strippedCount = 0;
                        sanitizedList = sanitizedList.map(t => {
                            if (t.id !== data.id && t.systemContext?.includes('deal_match')) {
                                strippedCount++;
                                return {
                                    ...t,
                                    systemContext: t.systemContext.filter(ctx => ctx !== 'deal_match')
                                };
                            }
                            return t;
                        });
                        if (strippedCount > 0) {
                            setTimeout(() => {
                                toast.success(`Deal Match context was removed from ${strippedCount} other template(s) in this channel.`);
                            }, 500);
                        }
                    }

                    if (data.id) {
                        updatedList = sanitizedList.map(t => t.id === data.id ? savedData : t);
                    } else {
                        updatedList = [...sanitizedList, { ...savedData, id: `local_${Date.now()}` }];
                    }
                    return { ...prev, [templateType]: updatedList };
                });

                // Small delay to allow state to settle before reading
                await new Promise(r => setTimeout(r, 50));
                await persistTemplates(templateType, updatedList || allTemplates[templateType]);
            }
            toast.success(data.id ? 'Template updated & saved ✓' : 'Template created & saved ✓');
        } catch (err) {
            toast.error('Failed to save template: ' + err.message);
        } finally {
            setIsSyncing(false);
        }
    };

    // ENTERPRISE UPGRADE: Sync Down from Meta
    const handleSyncFromMeta = async () => {
        if (templateType !== 'whatsapp') return;
        setIsSyncingMeta(true);
        const toastId = toast.loading('Syncing approved templates from Meta WhatsApp Manager...');
        
        try {
            const res = await whatsappService.syncTemplatesFromMeta();
            if (res?.success && res.data) {
                setAllTemplates(prev => ({ ...prev, whatsapp: res.data }));
                await persistTemplates('whatsapp', res.data);
                toast.success(`Successfully synced ${res.data.length} templates from Meta!`, { id: toastId });
            } else {
                throw new Error('Invalid response format');
            }
        } catch (err) {
            console.error('Meta Sync failed:', err);
            // Fallback mock success if backend isn't ready
            toast.error('Meta API endpoint not connected yet. Check backend logs.', { id: toastId });
        } finally {
            setIsSyncingMeta(false);
        }
    };

    const loadSmsTemplates = async () => {
        try {
            const res = await smsService.getTemplates();
            setAllTemplates(prev => ({
                ...prev,
                sms: res.data.map(t => ({ ...t, id: t._id }))
            }));
        } catch (err) {
            console.error('Failed to load SMS templates', err);
        }
    };

    useEffect(() => {
        loadSmsTemplates();
        loadPersistedTemplates();
    }, []);

    const tabs = [
        { id: 'templates', label: 'Templates' },
        { id: 'variables', label: 'Variables' },
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
                        color: subTab === tab.id ? 'var(--primary-color)' : 'var(--text-muted)',
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
                    <div style={{ display: 'flex', background: 'var(--bg-light)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <button onClick={() => setTemplateType('sms')} style={{ padding: '8px 32px', border: 'none', background: templateType === 'sms' ? 'var(--bg-card)' : 'transparent', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 700, color: templateType === 'sms' ? 'var(--primary-color)' : 'var(--text-muted)', boxShadow: templateType === 'sms' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }}>SMS</button>
                        <button onClick={() => setTemplateType('whatsapp')} style={{ padding: '8px 32px', border: 'none', background: templateType === 'whatsapp' ? 'var(--bg-card)' : 'transparent', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 700, color: templateType === 'whatsapp' ? 'var(--primary-color)' : 'var(--text-muted)', boxShadow: templateType === 'whatsapp' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }}>Whatsapp</button>
                        <button onClick={() => setTemplateType('rcs')} style={{ padding: '8px 32px', border: 'none', background: templateType === 'rcs' ? 'var(--bg-card)' : 'transparent', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 700, color: templateType === 'rcs' ? '#4285F4' : 'var(--text-muted)', boxShadow: templateType === 'rcs' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }}>RCS</button>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <div style={{ position: 'relative' }}>
                            <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--border-color)' }}></i>
                            <input type="text" placeholder="Search..." style={{ padding: '8px 12px 8px 36px', border: '1px solid var(--border-color)', borderRadius: '4px', width: '240px' }} />
                        </div>
                        <button className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-card)' }}>Filter tags <i className="fas fa-chevron-down"></i></button>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        {templateType === 'whatsapp' && (
                            <button 
                                className="btn-outline" 
                                onClick={handleSyncFromMeta}
                                disabled={isSyncingMeta}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-card)', color: '#059669', borderColor: '#10b981' }}>
                                <i className={`fas fa-sync ${isSyncingMeta ? 'fa-spin' : ''}`}></i> Sync from Meta
                            </button>
                        )}
                        <button className="btn-primary" onClick={() => { setEditingTemplate(null); setIsTemplateModalOpen(true); }}>
                            <i className="fas fa-plus" style={{ marginRight: '6px' }}></i>Add template
                        </button>
                    </div>
                    {isSyncing && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#6366f1', fontWeight: 600 }}>
                            <i className="fas fa-circle-notch fa-spin"></i> Saving…
                        </span>
                    )}
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
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
                                <td style={{ padding: '16px 12px' }}><span style={{ background: 'var(--bg-light)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>{row.tags ? row.tags[0] : 'Property'}</span></td>
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
                                <td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No templates found for this channel.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        );
    };



    const renderBlocklist = () => (
        <div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>Block Messaging</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '24px' }}>Block SMS and WhatsApp messages from specific numbers.</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '32px' }}>
                <input type="text" style={{ padding: '8px 16px', border: '1px solid var(--border-color)', borderRadius: '4px', width: '240px' }} placeholder="+91..." />
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
                            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>{item.name}</span>
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{item.num}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: '12px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                {item.channels.join(', ')}
                            </div>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer' }}>Unblock</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', overflow: 'hidden' }}>
            <div style={{ padding: '32px 40px', borderBottom: '1px solid #f1f5f9' }}>
                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', textTransform: 'uppercase' }}>Messaging Settings</h2>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '8px' }}>Manage SMS, WhatsApp, and social media integration settings.</div>
            </div>

            <div style={{ flex: 1, padding: '32px 40px', overflowY: 'auto' }}>
                {renderTabs()}

                {subTab === 'templates' && renderTemplates()}
                {subTab === 'variables' && <VariableRegistryTab />}
                {subTab === 'block-list' && renderBlocklist()}


                {subTab === 'logs' && (
                    <div style={{ padding: '80px', textAlign: 'center', background: 'var(--bg-light)', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
                        <i className="fas fa-comment-alt-lines" style={{ fontSize: '3rem', color: 'var(--border-color)', marginBottom: '20px' }}></i>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>Conversation Logs</h3>
                        <p style={{ color: 'var(--text-muted)' }}>All sent and received messages will appear here.</p>
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
