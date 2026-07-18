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
    const [step, setStep] = useState(1);
    const [templateData, setTemplateData] = useState({
        name: '',
        category: 'MARKETING',
        subCategory: 'DEFAULT',
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
            setStep(1);
            if (initialData) {
                setTemplateData({
                    ...initialData,
                    buttons: initialData.buttons || [],
                    tags: initialData.tags || [],
                    headerType: initialData.headerType || 'NONE',
                    subCategory: initialData.subCategory || 'DEFAULT',
                    variableMapping: initialData.variableMapping || {}
                });
            } else {
                setTemplateData({
                    name: '',
                    category: channelType === 'sms' ? 'Transactional' : 'MARKETING',
                    subCategory: 'DEFAULT',
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
                    variableMapping: {}
                });
            }
        }
    }, [isOpen, initialData, channelType]);

    if (!isOpen) return null;

    const charCount = templateData.body.length;
    const segments = Math.ceil(charCount / 160) || 1;

    const addButton = () => {
        const maxBtns = channelType === 'whatsapp' ? 10 : (channelType === 'rcs' ? 4 : 3);
        if (templateData.buttons.length < maxBtns) {
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

    const renderWhatsAppStep1 = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.3s ease-out' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>Set up your template</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Choose the category that best describes your message template.</p>
            
            <div style={{ display: 'flex', gap: '0', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                {['MARKETING', 'UTILITY', 'AUTHENTICATION'].map(cat => (
                    <div 
                        key={cat}
                        onClick={() => setTemplateData({ ...templateData, category: cat })}
                        style={{ 
                            flex: 1, 
                            padding: '12px', 
                            textAlign: 'center', 
                            cursor: 'pointer', 
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            background: templateData.category === cat ? '#e0f2fe' : 'var(--bg-card)', 
                            color: templateData.category === cat ? '#0284c7' : 'var(--text-main)',
                            borderRight: cat !== 'AUTHENTICATION' ? '1px solid var(--border-color)' : 'none',
                            transition: 'all 0.2s'
                        }}
                    >
                        {cat === 'MARKETING' && <i className="fas fa-bullhorn" style={{ marginRight: '8px' }}></i>}
                        {cat === 'UTILITY' && <i className="fas fa-bell" style={{ marginRight: '8px' }}></i>}
                        {cat === 'AUTHENTICATION' && <i className="fas fa-key" style={{ marginRight: '8px' }}></i>}
                        {cat.charAt(0) + cat.slice(1).toLowerCase()}
                    </div>
                ))}
            </div>

            {(templateData.category === 'MARKETING' || templateData.category === 'UTILITY') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                    {(templateData.category === 'MARKETING' ? [
                        { id: 'DEFAULT', title: 'Default', desc: 'Send messages with media and customized buttons to engage your customers.' },
                        { id: 'CATALOGUE', title: 'Catalogue', desc: 'Send messages that drive sales by connecting your product catalogue.' },
                        { id: 'FLOWS', title: 'Flows', desc: 'Send a form to capture customer interests, appointment requests or run surveys.' },
                        { id: 'ORDER_DETAILS', title: 'Order details', desc: 'Send messages through which customers can pay you.' },
                        { id: 'CALLING_PERMISSIONS', title: 'Calling permissions request', desc: 'Ask customers if you can call them on WhatsApp.' }
                    ] : [
                        { id: 'DEFAULT', title: 'Default', desc: 'Send messages about an existing order or account.' },
                        { id: 'FLOWS', title: 'Flows', desc: 'Send a form to collect feedback, send reminders or manage orders.' },
                        { id: 'ORDER_STATUS', title: 'Order status', desc: 'Send messages to tell customers about the progress of their orders.' },
                        { id: 'ORDER_DETAILS', title: 'Order details', desc: 'Send messages through which customers can pay you.' },
                        { id: 'CALLING_PERMISSIONS', title: 'Calling permissions request', desc: 'Ask customers if you can call them on WhatsApp.' }
                    ]).map(sub => (
                        <label key={sub.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: templateData.subCategory === sub.id ? '#f8fafc' : 'transparent' }}>
                            <input 
                                type="radio" 
                                name="subCategory" 
                                checked={templateData.subCategory === sub.id} 
                                onChange={() => setTemplateData({ ...templateData, subCategory: sub.id })} 
                                style={{ marginTop: '4px' }}
                            />
                            <div>
                                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>{sub.title}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>{sub.desc}</div>
                            </div>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );

    const renderWhatsAppStep2 = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.3s ease-out' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>Edit template</h3>
            
            <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 2 }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Template name <span style={{ color: '#ef4444' }}>*</span></label>
                    <input
                        type="text"
                        style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.9rem' }}
                        placeholder="Enter a template name"
                        value={templateData.name}
                        onChange={e => setTemplateData({ ...templateData, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                    />
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'right' }}>{templateData.name.length}/512</div>
                </div>
                <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Language</label>
                    <select value={templateData.language} onChange={e => setTemplateData({ ...templateData, language: e.target.value })} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.9rem' }}>
                        <option value="en_US">English</option>
                        <option value="en_GB">English (UK)</option>
                        <option value="hi">Hindi</option>
                        <option value="gu">Gujarati</option>
                    </select>
                </div>
            </div>

            <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: 'var(--text-main)' }}>Content</h4>
                
                {/* Header */}
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Header <span style={{ fontWeight: 400 }}>• Optional</span></label>
                    <select value={templateData.headerType} onChange={e => setTemplateData({ ...templateData, headerType: e.target.value, headerText: '' })} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.9rem', marginBottom: '8px' }}>
                        <option value="NONE">None</option>
                        <option value="TEXT">Text</option>
                        <option value="IMAGE">Media (Image)</option>
                        <option value="DOCUMENT">Media (Document)</option>
                        <option value="VIDEO">Media (Video)</option>
                    </select>
                    {templateData.headerType === 'TEXT' && (
                        <input type="text" placeholder="Add a short line of text..." value={templateData.headerText} onChange={e => setTemplateData({ ...templateData, headerText: e.target.value })} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.9rem' }} />
                    )}
                    {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(templateData.headerType) && (
                        <div style={{ padding: '20px', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center', color: '#64748b', fontSize: '0.85rem', background: '#ffffff' }}>
                            <i className="fas fa-cloud-upload-alt" style={{ marginBottom: '8px', display: 'block', fontSize: '1.2rem' }}></i>
                            Drag and drop to upload<br/>Or choose files
                        </div>
                    )}
                </div>

                {/* Body */}
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Body</label>
                    <VariableTextarea
                        minHeight="120px"
                        placeholder="Enter your message body..."
                        value={templateData.body}
                        onChange={e => setTemplateData({ ...templateData, body: e.target.value })}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {templateData.body.length}/1024
                    </div>
                </div>

                {/* Footer */}
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Footer <span style={{ fontWeight: 400 }}>• Optional</span></label>
                    <input type="text" placeholder="Add a short line of text to the bottom..." value={templateData.footer} onChange={e => setTemplateData({ ...templateData, footer: e.target.value })} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.9rem' }} maxLength={60} />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {templateData.footer.length}/60
                    </div>
                </div>

                {/* Buttons */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>Buttons <span style={{ fontWeight: 400 }}>• Optional</span></label>
                        {templateData.buttons.length < 10 && (
                            <button onClick={addButton} style={{ fontSize: '0.8rem', color: 'var(--primary-color)', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '4px 10px', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}>
                                + Add button
                            </button>
                        )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {templateData.buttons.map((btn, i) => (
                            <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', background: '#ffffff', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <select value={btn.type} onChange={e => updateButton(i, 'type', e.target.value)} style={{ padding: '8px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.85rem', flex: 1 }}>
                                    <option value="QUICK_REPLY">Custom (Quick Reply)</option>
                                    <option value="URL">Visit website</option>
                                    <option value="PHONE">Call phone number</option>
                                    <option value="COPY_CODE">Copy offer code</option>
                                </select>
                                <input type="text" placeholder="Button text" value={btn.text} onChange={e => updateButton(i, 'text', e.target.value)} style={{ flex: 2, padding: '8px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.85rem' }} />
                                <button onClick={() => removeButton(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px 8px' }}>
                                    <i className="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );

    const renderRCSFields = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Same as original RCS fields */}
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

    const renderSMSFields = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Same as original SMS fields */}
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
                        <option value="Promotional">Promotional</option>
                        <option value="Transactional">Transactional</option>
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
            <div style={{ background: 'var(--bg-card)', width: channelType === 'whatsapp' ? '1100px' : '1000px', maxHeight: '95vh', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                <div style={{ padding: '20px 32px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: channelType === 'rcs' ? '#4285F4' : 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff' }}>
                            <i className={getChannelIcon()}></i>
                        </div>
                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
                            {channelType === 'whatsapp' ? (step === 1 ? 'Create template' : 'Edit template') : `Add ${getChannelTitle()} Template`}
                        </h2>
                    </div>
                    {channelType === 'whatsapp' && (
                        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: step === 1 ? '#059669' : '#cbd5e1' }}>
                                <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: step === 1 ? '#059669' : '#cbd5e1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>1</div>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Set up</span>
                            </div>
                            <div style={{ width: '40px', height: '2px', background: '#cbd5e1' }}></div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: step === 2 ? '#059669' : '#cbd5e1' }}>
                                <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: step === 2 ? '#059669' : '#cbd5e1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>2</div>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Edit</span>
                            </div>
                        </div>
                    )}
                    <i className="fas fa-times" style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.2rem' }} onClick={onClose}></i>
                </div>

                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                    {/* Left Panel: Form */}
                    <div style={{ flex: 3.5, padding: '32px', overflowY: 'auto', borderRight: '1px solid #f1f5f9' }}>
                        {channelType === 'whatsapp' ? (
                            step === 1 ? renderWhatsAppStep1() : renderWhatsAppStep2()
                        ) : channelType === 'rcs' ? (
                            <>
                                <div style={{ marginBottom: '24px' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Template name <span style={{ color: '#ef4444' }}>*</span></label>
                                    <input type="text" style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.95rem' }} placeholder="e.g. Lead Follow-up" value={templateData.name} onChange={e => setTemplateData({ ...templateData, name: e.target.value })} />
                                </div>
                                {renderRCSFields()}
                            </>
                        ) : (
                            <>
                                <div style={{ marginBottom: '24px' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Template name <span style={{ color: '#ef4444' }}>*</span></label>
                                    <input type="text" style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.95rem' }} placeholder="e.g. Lead Follow-up" value={templateData.name} onChange={e => setTemplateData({ ...templateData, name: e.target.value })} />
                                </div>
                                {renderSMSFields()}
                            </>
                        )}
                        
                        {channelType !== 'whatsapp' && (
                            <div style={{ marginTop: '32px' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Assign Tags</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', minHeight: '48px', alignItems: 'center' }}>
                                    {templateData.tags.map(tag => (
                                        <div key={tag} style={{ background: 'var(--bg-light)', padding: '4px 12px', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {tag} <i className="fas fa-times" style={{ cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-muted)' }} onClick={() => setTemplateData({ ...templateData, tags: templateData.tags.filter(t => t !== tag) })}></i>
                                        </div>
                                    ))}
                                    <input type="text" style={{ border: 'none', outline: 'none', flex: 1, minWidth: '120px', fontSize: '0.95rem' }} placeholder={templateData.tags.length === 0 ? "Search or create tags..." : ""} value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && tagInput.trim()) { setTemplateData({ ...templateData, tags: [...templateData.tags, tagInput.trim()] }); setTagInput(''); } }} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Panel: Preview */}
                    <div style={{ flex: 2.5, padding: '32px', background: 'var(--bg-light)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: '280px', height: '580px', background: 'var(--text-main)', borderRadius: '40px', border: '8px solid #333', padding: '12px', boxSizing: 'content-box', position: 'relative', boxShadow: '0 20px 50px rgba(0,0,0,0.1)' }}>
                            <div style={{ position: 'absolute', top: '0', left: '50%', transform: 'translateX(-50%)', width: '120px', height: '20px', background: 'var(--text-main)', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px', zIndex: 10 }}></div>

                            <div style={{ width: '100%', height: '100%', background: channelType === 'rcs' ? 'var(--bg-card)' : '#ece5dd', borderRadius: '32px', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                                {/* Background Image for WhatsApp */}
                                {channelType === 'whatsapp' && (
                                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.4, backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundSize: 'cover', zIndex: 1 }}></div>
                                )}
                                
                                <div style={{ background: channelType === 'rcs' ? 'var(--bg-card)' : '#075e54', padding: '30px 16px 12px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: channelType === 'rcs' ? '1px solid #f1f5f9' : 'none', zIndex: 2 }}>
                                    <i className="fas fa-arrow-left" style={{ color: channelType === 'rcs' ? '#4285F4' : 'var(--bg-card)', fontSize: '0.9rem' }}></i>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: channelType === 'rcs' ? '#e8f0fe' : 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <i className="fas fa-building" style={{ color: channelType === 'rcs' ? '#4285F4' : '#075e54', fontSize: '0.8rem' }}></i>
                                    </div>
                                    <div style={{ color: channelType === 'rcs' ? 'var(--text-main)' : 'var(--bg-card)' }}>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>Bharat Properties</div>
                                        <div style={{ fontSize: '0.65rem', opacity: 0.8 }}>Online</div>
                                    </div>
                                </div>

                                <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', zIndex: 2, overflowY: 'auto' }}>
                                    <div style={{ background: channelType === 'rcs' ? '#e8f0fe' : 'var(--bg-card)', padding: channelType === 'rcs' ? '0' : '8px', borderRadius: '12px', maxWidth: '92%', position: 'relative', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                                        {channelType === 'whatsapp' && templateData.headerType !== 'NONE' && (
                                            <div style={{ background: 'var(--bg-light)', borderRadius: '8px', padding: '12px', marginBottom: '8px', fontSize: '0.75rem', fontWeight: 700, textAlign: 'center' }}>
                                                {templateData.headerType === 'TEXT' ? (templateData.headerText || 'Header Text') : `[${templateData.headerType} Media]`}
                                            </div>
                                        )}
                                        {channelType === 'rcs' && (
                                            <div style={{ width: '100%', height: '120px', background: '#d1e3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4285F4' }}>
                                                <i className="fas fa-image" style={{ fontSize: '1.5rem' }}></i>
                                            </div>
                                        )}
                                        <div style={{ padding: channelType === 'rcs' ? '12px' : '0 4px', fontSize: '0.85rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                                            {templateData.body || (channelType === 'whatsapp' ? 'Message body...' : channelType === 'rcs' ? 'Enter rich content...' : 'Enter SMS content...')}
                                        </div>
                                        {channelType === 'whatsapp' && templateData.footer && (
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '6px', padding: '0 4px' }}>{templateData.footer}</div>
                                        )}
                                        <div style={{ textAlign: 'right', fontSize: '0.6rem', color: channelType === 'rcs' ? '#4285F4' : 'var(--text-muted)', marginTop: '4px', paddingRight: '8px', paddingBottom: '4px' }}>10:48 AM</div>
                                    </div>

                                    {(channelType === 'whatsapp' || channelType === 'rcs') && templateData.buttons.length > 0 && (
                                        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '92%' }}>
                                            {templateData.buttons.map((btn, i) => (
                                                <div key={i} style={{ background: 'var(--bg-card)', padding: '10px', borderRadius: '12px', border: '1px solid var(--border-color)', color: channelType === 'whatsapp' ? '#0ea5e9' : '#4285F4', fontSize: '0.85rem', fontWeight: 600, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                                    {btn.type === 'PHONE' && <i className="fas fa-phone-alt"></i>}
                                                    {btn.type === 'URL' && <i className="fas fa-external-link-square-alt"></i>}
                                                    {btn.type === 'MAP' && <i className="fas fa-map-marker-alt"></i>}
                                                    {btn.type === 'QUICK_REPLY' && <i className="fas fa-reply"></i>}
                                                    {btn.type === 'COPY_CODE' && <i className="fas fa-copy"></i>}
                                                    {btn.text || 'Action Label'}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div style={{ marginTop: '20px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                            {channelType === 'whatsapp' ? 'TEMPLATE PREVIEW' : (channelType === 'rcs' ? 'RCS RICH PREVIEW' : 'SMS PREVIEW')}
                        </div>
                    </div>
                </div>

                <div style={{ padding: '20px 32px', borderTop: '1px solid #f1f5f9', background: 'var(--bg-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        {channelType === 'whatsapp' && step === 2 && (
                             <button className="btn-outline" onClick={() => setStep(1)} style={{ background: 'var(--bg-card)' }}>Previous</button>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button className="btn-outline" onClick={onClose} style={{ background: 'var(--bg-card)' }}>{channelType === 'whatsapp' && step === 1 ? 'Discard' : 'Cancel'}</button>
                        {channelType === 'whatsapp' && step === 1 ? (
                            <button className="btn-primary" onClick={() => setStep(2)}>Next</button>
                        ) : (
                            <button className="btn-primary" onClick={() => { onSave(templateData); onClose(); }}>{channelType === 'whatsapp' ? 'Submit for Review' : 'Save Template'}</button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};


const VariableRegistryTab = () => {
    return (
        <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', background: 'var(--bg-card)', padding: '20px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Database size={20} color="var(--primary-color)" /> Supported Template Variables
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Use these exact word variables in your WhatsApp and SMS templates. The CRM will automatically populate them with real data when sending.
                    </div>
                </div>
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-light)', borderBottom: '1px solid var(--border-color)' }}>
                            <th style={{ padding: '16px', textAlign: 'left', width: '250px' }}>Variable Syntax</th>
                            <th style={{ padding: '16px', textAlign: 'left' }}>Description & Data Source</th>
                            <th style={{ padding: '16px', textAlign: 'left', width: '120px' }}>Context</th>
                        </tr>
                    </thead>
                    <tbody>
                        {[
                            // Customer / Lead Data
                            { var: '{{first_name}}', desc: 'Customer First Name', ctx: 'Lead/Contact' },
                            { var: '{{last_name}}', desc: 'Customer Last Name', ctx: 'Lead/Contact' },
                            { var: '{{full_name}}', desc: 'Customer Full Name', ctx: 'Lead/Contact' },
                            { var: '{{mobile}}', desc: 'Customer Mobile Number', ctx: 'Lead/Contact' },
                            { var: '{{email}}', desc: 'Customer Email Address', ctx: 'Lead/Contact' },
                            { var: '{{lead_source}}', desc: 'Lead Source (e.g. Website, Facebook)', ctx: 'Lead' },
                            { var: '{{lead_status}}', desc: 'Lead Status (e.g. New, Follow-up)', ctx: 'Lead' },
                            { var: '{{lead_stage}}', desc: 'Sales Stage (e.g. Negotiation)', ctx: 'Lead' },
                            { var: '{{lead_requirement}}', desc: 'Property Requirement (Buy/Rent)', ctx: 'Lead' },
                            { var: '{{budget_min}}', desc: 'Minimum Budget', ctx: 'Lead' },
                            { var: '{{budget_max}}', desc: 'Maximum Budget', ctx: 'Lead' },
                            { var: '{{preferred_city}}', desc: 'Preferred City', ctx: 'Lead' },
                            { var: '{{preferred_area}}', desc: 'Preferred Area/Locality', ctx: 'Lead' },
                            
                            // Agent / System Data
                            { var: '{{agent_name}}', desc: 'Assigned Agent Name', ctx: 'System' },
                            { var: '{{agent_mobile}}', desc: 'Assigned Agent Mobile', ctx: 'System' },
                            { var: '{{agent_email}}', desc: 'Assigned Agent Email', ctx: 'System' },
                            { var: '{{company_name}}', desc: 'Your Company Name', ctx: 'System' },
                            
                            // Property / Inventory Data
                            { var: '{{project_name}}', desc: 'Property Project Name', ctx: 'Property' },
                            { var: '{{unit_number}}', desc: 'Property Unit Number', ctx: 'Property' },
                            { var: '{{block_name}}', desc: 'Property Block / Tower', ctx: 'Property' },
                            { var: '{{unit_type}}', desc: 'Unit Type (e.g. 2 BHK, 3 BHK)', ctx: 'Property' },
                            { var: '{{property_category}}', desc: 'Property Category (e.g. Residential)', ctx: 'Property' },
                            { var: '{{property_subcategory}}', desc: 'Property Sub-Category (e.g. Apartment)', ctx: 'Property' },
                            { var: '{{builtup_type}}', desc: 'Built-up Type', ctx: 'Property' },
                            { var: '{{size_label}}', desc: 'Size Type (e.g. Sq.Ft)', ctx: 'Property' },
                            { var: '{{property_direction}}', desc: 'Property Direction', ctx: 'Property' },
                            { var: '{{property_facing}}', desc: 'Property Facing (e.g. North, East)', ctx: 'Property' },
                            { var: '{{road_width}}', desc: 'Road Width', ctx: 'Property' },
                            { var: '{{property_price}}', desc: 'Property Price', ctx: 'Property' },
                            { var: '{{property_size}}', desc: 'Property Size / Area', ctx: 'Property' },
                            { var: '{{property_location}}', desc: 'Property Location / Address', ctx: 'Property' },
                            
                            // Dynamic / Match Data
                            { var: '{{property_list}}', desc: 'Standard matched property list', ctx: 'Match' },
                            { var: '{{property_list_default}}', desc: 'Formatted list of matched properties', ctx: 'Match' },
                            { var: '{{property_list_detailed}}', desc: 'Detailed list with specs & pricing', ctx: 'Match' },
                            { var: '{{requirement_summary}}', desc: 'Summary of what customer is looking for', ctx: 'Match' },
                            { var: '{{properties_count}}', desc: 'Total number of properties matched', ctx: 'Match' },
                            { var: '{{match_percentage}}', desc: 'Match Percentage Score (AI generated)', ctx: 'Match' },
                            
                            // Legacy / Static Data
                            { var: '{{amount}}', desc: 'Due Amount (For reminders)', ctx: 'System' },
                            { var: '{{due_date}}', desc: 'Due Date (For reminders)', ctx: 'System' },
                            { var: '{{document_list}}', desc: 'Required Document List', ctx: 'System' }
                        ].map((item, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '12px 16px' }}>
                                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: 'var(--primary-color)', padding: '6px 12px', borderRadius: '6px', display: 'inline-block', fontWeight: 800, fontSize: '0.8rem', fontFamily: 'monospace' }}>
                                        {item.var}
                                    </div>
                                </td>
                                <td style={{ padding: '12px 16px', color: 'var(--text-main)', fontWeight: 600 }}>
                                    {item.desc}
                                </td>
                                <td style={{ padding: '12px 16px' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '4px 8px', borderRadius: '4px', background: item.ctx === 'Lead' || item.ctx === 'Lead/Contact' ? '#dbeafe' : item.ctx === 'Property' ? '#dcfce7' : '#f3e8ff', color: item.ctx === 'Lead' || item.ctx === 'Lead/Contact' ? '#2563eb' : item.ctx === 'Property' ? '#16a34a' : '#9333ea' }}>
                                        {item.ctx}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// AutomationEngineTab logic removed as it has been moved to Global Business Rules

const ContextEditModal = ({ isOpen, onClose, template, onSave }) => {
    const [selectedContext, setSelectedContext] = useState([]);

    useEffect(() => {
        if (isOpen && template) {
            setSelectedContext(template.systemContext || []);
        }
    }, [isOpen, template]);

    if (!isOpen || !template) return null;

    const options = [
        { value: 'lead_match_full', label: 'Lead Match (Full Details)' },
        { value: 'lead_match_short', label: 'Lead Match (Short Details)' },
        { value: 'deal_match', label: 'Deal Match (Auto-Dispatch)' },
        { value: 'deal_match_modal', label: 'Deal Match (Message Modal)' },
        { value: 'marketing_blast', label: 'Marketing Blast' },
        { value: 'welcome', label: 'Welcome/Auto-Reply' }
    ];

    const handleToggle = (val) => {
        if (selectedContext.includes(val)) {
            setSelectedContext(selectedContext.filter(c => c !== val));
        } else {
            setSelectedContext([...selectedContext, val]);
        }
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10002 }}>
            <div style={{ background: 'var(--bg-card)', width: '500px', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>Set System Trigger Context</h3>
                    <i className="fas fa-times" style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={onClose}></i>
                </div>
                <div style={{ padding: '24px' }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px', marginTop: 0 }}>
                        Select where this template should be used automatically by the system.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {options.map(opt => {
                            const isSelected = selectedContext.includes(opt.value);
                            return (
                                <div 
                                    key={opt.value}
                                    onClick={() => handleToggle(opt.value)}
                                    style={{ 
                                        padding: '12px 16px', 
                                        borderRadius: '8px', 
                                        border: `1px solid ${isSelected ? 'var(--primary-color)' : 'var(--border-color)'}`,
                                        background: isSelected ? 'rgba(99, 102, 241, 0.05)' : 'var(--bg-light)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <div style={{ 
                                        width: '20px', height: '20px', borderRadius: '4px', 
                                        border: `2px solid ${isSelected ? 'var(--primary-color)' : 'var(--border-color)'}`,
                                        background: isSelected ? 'var(--primary-color)' : 'transparent',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        {isSelected && <i className="fas fa-check" style={{ color: '#fff', fontSize: '12px' }}></i>}
                                    </div>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: isSelected ? 'var(--primary-color)' : 'var(--text-main)' }}>
                                        {opt.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: 'var(--bg-light)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button className="btn-outline" onClick={onClose} style={{ background: 'var(--bg-card)' }}>Cancel</button>
                    <button className="btn-primary" onClick={() => { onSave(template, selectedContext); onClose(); }}>Save Context</button>
                </div>
            </div>
        </div>
    );
};

const MessagingSettingsPage = () => {
    const [subTab, setSubTab] = useState('templates');
    const [templateType, setTemplateType] = useState('whatsapp');
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [contextEditingTemplate, setContextEditingTemplate] = useState(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isSyncingMeta, setIsSyncingMeta] = useState(false); // Enterprise Sync State
    const [activeDropdown, setActiveDropdown] = useState(null);

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
                // Keep body + content in sync for compatibility locally
                const savedData = {
                    ...data,
                    body:    data.body    || data.content || '',
                    content: data.content || data.body    || '',
                };

                // ENTERPRISE UPGRADE: Sync Up to Meta Cloud API (WhatsApp only)
                if (templateType === 'whatsapp') {
                    try {
                        const toastId = toast.loading('Submitting template to Meta for review...');
                        await whatsappService.submitTemplateToMeta(savedData);
                        toast.success('Successfully submitted to Meta!', { id: toastId });
                    } catch (err) {
                        console.warn('Backend Meta Submission Endpoint missing, falling back to local CRM store:', err);
                        toast.error('Meta API integration incomplete. Saved locally only.');
                    }
                }


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

    const handleSaveContext = async (template, newContext) => {
        setIsSyncing(true);
        try {
            const updatedData = { ...template, systemContext: newContext };
            
            // Re-use the save logic (it handles DB persist and deal_match logic)
            // But we don't submit to meta again just for context update
            let updatedList;
            setAllTemplates(prev => {
                const currentList = prev[templateType];
                
                // ENFORCEMENT LOGIC: 1-to-1 mapping for deal_match
                let sanitizedList = [...currentList];
                if (updatedData.systemContext?.includes('deal_match')) {
                    let strippedCount = 0;
                    sanitizedList = sanitizedList.map(t => {
                        if (t.id !== template.id && t.systemContext?.includes('deal_match')) {
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
                            toast.success(`Deal Match context was removed from ${strippedCount} other template(s).`);
                        }, 500);
                    }
                }

                updatedList = sanitizedList.map(t => t.id === template.id ? updatedData : t);
                return { ...prev, [templateType]: updatedList };
            });

            await new Promise(r => setTimeout(r, 50));
            await persistTemplates(templateType, updatedList || allTemplates[templateType]);
            toast.success('System trigger context updated ✓');
        } catch (err) {
            toast.error('Failed to update context: ' + err.message);
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
                setAllTemplates(prev => {
                    const localTemplates = prev.whatsapp || [];
                    const mergedTemplates = [...localTemplates];
                    
                    res.data.forEach(metaTpl => {
                        const existingIdx = mergedTemplates.findIndex(t => t.id === metaTpl.id || t.name === metaTpl.name);
                        if (existingIdx >= 0) {
                            mergedTemplates[existingIdx] = { ...mergedTemplates[existingIdx], ...metaTpl };
                        } else {
                            mergedTemplates.push(metaTpl);
                        }
                    });
                    
                    persistTemplates('whatsapp', mergedTemplates);
                    return { ...prev, whatsapp: mergedTemplates };
                });
                toast.success(`Successfully synced templates from Meta!`, { id: toastId });
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
                                    <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end' }}>
                                        <div 
                                            style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: '4px' }} 
                                            onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === row.id ? null : row.id); }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <i className="fas fa-ellipsis-v" style={{ color: 'var(--text-muted)' }}></i>
                                        </div>
                                        {activeDropdown === row.id && (
                                            <>
                                                <div 
                                                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9 }} 
                                                    onClick={() => setActiveDropdown(null)} 
                                                />
                                                <div style={{ position: 'absolute', right: '0', top: '32px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', zIndex: 10, width: '220px', padding: '4px 0', textAlign: 'left' }}>
                                                    <div 
                                                        style={{ padding: '10px 16px', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)', fontWeight: 600 }}
                                                        onClick={() => { setActiveDropdown(null); handleEdit(row); }}
                                                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-light)'}
                                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                    >
                                                        <i className="far fa-edit" style={{ width: '16px', color: '#3b82f6', textAlign: 'center' }}></i> Edit Template
                                                    </div>
                                                    <div 
                                                        style={{ padding: '10px 16px', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)', fontWeight: 600 }}
                                                        onClick={() => { setActiveDropdown(null); setContextEditingTemplate(row); }}
                                                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-light)'}
                                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                    >
                                                        <i className="fas fa-plug" style={{ width: '16px', color: 'var(--primary-color)', textAlign: 'center' }}></i> System Trigger Context
                                                    </div>
                                                    <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }}></div>
                                                    <div 
                                                        style={{ padding: '10px 16px', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', color: '#ef4444', fontWeight: 600 }}
                                                        onClick={() => { setActiveDropdown(null); handleDelete(row.id); }}
                                                        onMouseEnter={(e) => e.currentTarget.style.background = '#fef2f2'}
                                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                    >
                                                        <i className="far fa-trash-alt" style={{ width: '16px', textAlign: 'center' }}></i> Delete Template
                                                    </div>
                                                </div>
                                            </>
                                        )}
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

            <ContextEditModal
                isOpen={!!contextEditingTemplate}
                onClose={() => setContextEditingTemplate(null)}
                template={contextEditingTemplate}
                onSave={handleSaveContext}
            />
        </div>
    );
};

export default MessagingSettingsPage;
