import React, { useState, useRef, useEffect } from 'react';
import { emailTemplates } from '../../../data/mockData';

// --- Sub-Components (Moved outside to prevent re-renders) ---

const VisibilityDropdown = ({ type, value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const options = [
        'Not visible to users',
        'Visible to users',
        'Visible to users only if I\'m an owner or collaborator',
        'Visible to users only if I\'m an owner'
    ];

    return (
        <div style={{ position: 'relative' }}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.85rem', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', minWidth: '220px', justifyContent: 'space-between' }}
            >
                {value} <i className={`fas fa-chevron-${isOpen ? 'up' : 'down'}`} style={{ fontSize: '0.7rem' }}></i>
            </div>
            {isOpen && (
                <div style={{ position: 'absolute', top: '100%', right: 0, width: '320px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, marginTop: '4px' }}>
                    {options.map(opt => (
                        <div
                            key={opt}
                            onClick={() => { onChange(opt); setIsOpen(false); }}
                            style={{ padding: '10px 16px', fontSize: '0.85rem', color: value === opt ? 'var(--primary-color)' : '#475569', fontWeight: value === opt ? 700 : 500, cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                            onMouseOver={e => e.target.style.background = '#f8fafc'}
                            onMouseOut={e => e.target.style.background = 'transparent'}
                        >
                            {opt}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const TemplateModal = ({ isOpen, onClose, onSave, initialData }) => {
    const [templateData, setTemplateData] = useState({ name: '', subject: '', content: '', tags: [], shared: true });

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setTemplateData(initialData);
            } else {
                setTemplateData({ name: '', subject: '', content: '', tags: [], shared: true });
            }
        }
    }, [isOpen, initialData]);

    const [showMergeTags, setShowMergeTags] = useState(false);
    const [showImageModal, setShowImageModal] = useState(false);
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [showFontMenu, setShowFontMenu] = useState(false);
    const [showEmojiMenu, setShowEmojiMenu] = useState(false);
    const [tagInput, setTagInput] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [linkUrl, setLinkUrl] = useState('');
    const [linkText, setLinkText] = useState('');
    const editorRef = useRef(null);

    // Sync content if it changes externally
    useEffect(() => {
        if (isOpen && editorRef.current) {
            editorRef.current.innerHTML = templateData.content || '<div><br></div>';
        }
    }, [isOpen, templateData.content]);

    if (!isOpen) return null;

    const execCommand = (command, value = null) => {
        if (editorRef.current) {
            editorRef.current.focus();
            document.execCommand(command, false, value);
            setTemplateData(prev => ({ ...prev, content: editorRef.current.innerHTML }));
        }
    };

    const insertHTML = (html) => {
        if (editorRef.current) {
            editorRef.current.focus();
            document.execCommand('insertHTML', false, html);
            setTemplateData(prev => ({ ...prev, content: editorRef.current.innerHTML }));
        }
    };

    const insertTag = (tag) => {
        insertHTML(`<span style="color: var(--primary-color); font-weight: 700;">{{${tag}}}</span>&nbsp;`);
        setShowMergeTags(false);
    };

    const addTag = () => {
        if (tagInput.trim() && !templateData.tags.includes(tagInput.trim())) {
            setTemplateData({ ...templateData, tags: [...templateData.tags, tagInput.trim()] });
            setTagInput('');
        }
    };

    const removeTag = (tag) => {
        setTemplateData({ ...templateData, tags: templateData.tags.filter(t => t !== tag) });
    };

    const fonts = ['Arial', 'Inter', 'Georgia', 'Verdana', 'Times New Roman', 'Courier New'];
    const emojis = ['👋', '😊', '🤝', '📧', '🚀', '✨', '🏠', '📞', '🙏'];

    const unifiedMergeTags = {
        'Universal': ['Address', 'Company name', 'Email address', 'Facebook', 'Fax number', 'First name', 'Full name', 'Industry', 'Last name', 'Mobile number', 'Phone number', 'Salutation', 'Twitter', 'Website'],
        'Sender': ['Sender\'s first name', 'Sender\'s last name', 'Sender\'s email', 'Sender\'s signature'],
        'System': ['Current date', 'Project name']
    };

    const allValidTags = Object.values(unifiedMergeTags).flat();

    const checkMissingTags = (html) => {
        const regex = /\{\{(.*?)\}\}/g;
        let match;
        const missing = [];
        while ((match = regex.exec(html)) !== null) {
            if (!allValidTags.includes(match[1])) {
                missing.push(match[1]);
            }
        }
        return missing;
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001 }}>
            <div style={{ background: '#fff', width: '850px', maxHeight: '95vh', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                <div style={{ padding: '20px 32px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>Create template</h2>
                    <i className="fas fa-times" style={{ cursor: 'pointer', color: '#94a3b8', fontSize: '1.2rem' }} onClick={onClose}></i>
                </div>

                <div style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>Template name</label>
                        <input
                            type="text"
                            style={{ width: '100%', padding: '12px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem' }}
                            placeholder="e.g. Welcome Email"
                            value={templateData.name}
                            onChange={e => setTemplateData({ ...templateData, name: e.target.value })}
                        />
                    </div>

                    <div style={{ marginBottom: '32px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>Tags</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', minHeight: '48px', alignItems: 'center' }}>
                            {templateData.tags.map(tag => (
                                <div key={tag} style={{ background: '#f1f5f9', padding: '4px 12px', borderRadius: '6px', fontSize: '0.85rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {tag} <i className="fas fa-times" style={{ cursor: 'pointer', fontSize: '0.75rem', color: '#94a3b8' }} onClick={() => removeTag(tag)}></i>
                                </div>
                            ))}
                            <input
                                type="text"
                                style={{ border: 'none', outline: 'none', flex: 1, minWidth: '120px', fontSize: '0.95rem' }}
                                placeholder={templateData.tags.length === 0 ? "Search or create tags..." : ""}
                                value={tagInput}
                                onChange={e => setTagInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && addTag()}
                            />
                            <i className="fas fa-chevron-down" style={{ color: '#cbd5e1', fontSize: '0.8rem' }}></i>
                        </div>
                    </div>

                    <div style={{ marginBottom: '32px', cursor: 'pointer' }} onClick={() => setTemplateData({ ...templateData, shared: !templateData.shared })}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                            <div style={{ width: '18px', height: '18px', border: '2px solid #cbd5e1', borderRadius: '4px', background: templateData.shared ? 'var(--primary-color)' : '#fff', borderColor: templateData.shared ? 'var(--primary-color)' : '#cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '2px' }}>
                                {templateData.shared && <i className="fas fa-check" style={{ color: '#fff', fontSize: '0.65rem' }}></i>}
                            </div>
                            <div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>Share with everyone</div>
                                <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>This option will make the template available to everyone on the account.</div>
                            </div>
                        </div>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#64748b', minWidth: '60px' }}>Subject</span>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <input
                                    type="text"
                                    style={{ flex: 1, border: 'none', outline: 'none', fontSize: '0.95rem', color: '#1e293b', fontWeight: 600 }}
                                    placeholder="Enter email subject..."
                                    value={templateData.subject}
                                    onChange={e => setTemplateData({ ...templateData, subject: e.target.value })}
                                />
                                <i className="fas fa-brackets-curly" style={{ color: 'var(--primary-color)', cursor: 'pointer' }} onClick={() => setShowMergeTags(!showMergeTags)}></i>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600 }}>
                                    Templates <i className="fas fa-chevron-down" style={{ fontSize: '0.7rem' }}></i>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                        <div style={{ padding: '12px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#475569' }}>Editor</div>
                            <div style={{ display: 'flex', gap: '16px', color: 'var(--primary-color)' }}>
                                <span style={{ fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer' }} onClick={() => setShowEmojiMenu(!showEmojiMenu)}>😊</span>
                            </div>
                        </div>

                        <div style={{ padding: '24px', minHeight: '300px' }}>
                            <div
                                ref={editorRef}
                                contentEditable
                                style={{ width: '100%', minHeight: '200px', border: 'none', outline: 'none', fontSize: '1rem', color: '#1e293b', lineHeight: '1.6' }}
                                onInput={(e) => setTemplateData(prev => ({ ...prev, content: e.target.innerHTML }))}
                                onBlur={(e) => setTemplateData(prev => ({ ...prev, content: e.target.innerHTML }))}
                            />

                            {/* Orange Warning Banner */}
                            {checkMissingTags(templateData.content).length > 0 && (
                                <div style={{ background: '#fff7ed', border: '1px solid #ffedd5', borderRadius: '8px', padding: '16px 20px', display: 'flex', gap: '16px', marginTop: '24px' }}>
                                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: '1.5px solid #f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f97316', fontSize: '0.8rem', flexShrink: 0 }}>
                                        <i className="fas fa-exclamation"></i>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#9a3412', marginBottom: '4px' }}>Missing merge tag</div>
                                        <div style={{ fontSize: '0.85rem', color: '#ea580c' }}>Remove the merge tag from email content or edit the contact to add missing data.</div>
                                    </div>
                                </div>
                            )}

                            {/* Floating Bar Toolbar */}
                            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '32px', marginBottom: '20px' }}>
                                <div style={{ display: 'flex', gap: '2px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '4px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                    <button onClick={() => execCommand('bold')} style={{ padding: '6px 12px', border: 'none', background: 'transparent', color: '#475569', cursor: 'pointer', fontWeight: 700 }}>B</button>
                                    <button onClick={() => execCommand('italic')} style={{ padding: '6px 12px', border: 'none', background: 'transparent', color: '#475569', cursor: 'pointer', fontStyle: 'italic', fontFamily: 'serif' }}>I</button>
                                    <button onClick={() => execCommand('underline')} style={{ padding: '6px 12px', border: 'none', background: 'transparent', color: '#475569', cursor: 'pointer', textDecoration: 'underline' }}>U</button>
                                    <div style={{ width: '1px', background: '#e2e8f0', margin: '4px' }}></div>
                                    <button onClick={() => execCommand('insertUnorderedList')} style={{ padding: '6px 12px', border: 'none', background: 'transparent', color: '#475569', cursor: 'pointer' }}><i className="fas fa-list-ul"></i></button>
                                </div>
                            </div>
                        </div>

                        <div style={{ padding: '12px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
                            <div style={{ display: 'flex', gap: '24px', color: '#94a3b8', fontSize: '1.1rem', alignItems: 'center' }}>
                                <div style={{ position: 'relative' }}>
                                    <span onClick={() => setShowFontMenu(!showFontMenu)} style={{ fontSize: '1rem', fontWeight: 700, color: '#475569', cursor: 'pointer' }}>Tt</span>
                                    {showFontMenu && (
                                        <div style={{ position: 'absolute', bottom: '100%', left: 0, width: '160px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, marginBottom: '8px' }}>
                                            {fonts.map(font => (
                                                <div key={font} onClick={() => { execCommand('fontName', font); setShowFontMenu(false); }} style={{ padding: '8px 12px', fontSize: '0.85rem', cursor: 'pointer', fontFamily: font, color: '#1e293b' }}>{font}</div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <i className="far fa-image" style={{ cursor: 'pointer' }} onClick={() => setShowImageModal(true)}></i>
                                <i className="fas fa-link" style={{ cursor: 'pointer' }} onClick={() => setShowLinkModal(true)}></i>

                                <div style={{ position: 'relative' }}>
                                    <i className="fas fa-brackets-curly" style={{ cursor: 'pointer' }} onClick={() => setShowMergeTags(!showMergeTags)}></i>
                                    {showMergeTags && (
                                        <div style={{ position: 'absolute', bottom: '100%', left: '-80px', width: '240px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', zIndex: 100, marginBottom: '12px', maxHeight: '400px', overflowY: 'auto' }}>
                                            {Object.entries(unifiedMergeTags).map(([category, tags]) => (
                                                <div key={category}>
                                                    <div style={{ padding: '12px 16px 8px 16px', fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#f8fafc' }}>{category}</div>
                                                    {tags.map(tag => (
                                                        <div
                                                            key={tag}
                                                            onClick={() => insertTag(tag)}
                                                            style={{ padding: '10px 16px', fontSize: '0.9rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', color: '#475569' }}
                                                        >
                                                            {tag}
                                                        </div>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {showEmojiMenu && (
                                    <div style={{ position: 'absolute', bottom: '100%', left: '100px', width: '200px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, marginBottom: '12px' }}>
                                        {emojis.map(e => (
                                            <div key={e} onClick={() => { insertHTML(e); setShowEmojiMenu(false); }} style={{ padding: '8px', textAlign: 'center', cursor: 'pointer', fontSize: '1.2rem' }}>{e}</div>
                                        ))}
                                    </div>
                                )}

                                <i className="fas fa-paperclip" style={{ cursor: 'pointer' }}></i>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ padding: '20px 32px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '16px' }}>
                    <button className="btn-outline" onClick={onClose} style={{ padding: '10px 28px', background: '#fff', fontWeight: 600 }}>Cancel</button>
                    <button className="btn-primary" onClick={() => { onSave(templateData); onClose(); }} style={{ padding: '10px 36px', fontWeight: 700 }}>Save</button>
                </div>
            </div>

            {showImageModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10002 }}>
                    <div style={{ background: '#fff', width: '400px', borderRadius: '12px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
                        <h3 style={{ margin: '0 0 20px 0', fontSize: '1.1rem', fontWeight: 700 }}>Add Image</h3>
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Image URL <span style={{ color: '#ef4444' }}>*</span></label>
                            <input type="text" value={imageUrl} onChange={e => setImageUrl(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px' }} placeholder="www.example.com/image.jpg" />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button className="btn-outline" onClick={() => setShowImageModal(false)} style={{ fontSize: '0.85rem' }}>Cancel</button>
                            <button className="btn-primary" onClick={() => { insertHTML(`<img src="${imageUrl}" style="max-width: 100%; height: auto;" />`); setShowImageModal(false); setImageUrl(''); }} style={{ fontSize: '0.85rem', padding: '8px 24px' }}>Insert</button>
                        </div>
                    </div>
                </div>
            )}

            {showLinkModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10002 }}>
                    <div style={{ background: '#fff', width: '400px', borderRadius: '12px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
                        <h3 style={{ margin: '0 0 20px 0', fontSize: '1.1rem', fontWeight: 700 }}>Add URL</h3>
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Link <span style={{ color: '#ef4444' }}>*</span></label>
                            <input type="text" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px' }} placeholder="www.example.com" />
                        </div>
                        <div style={{ marginBottom: '24px' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Text to display</label>
                            <input type="text" value={linkText} onChange={e => setLinkText(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px' }} placeholder="Link text" />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button className="btn-outline" onClick={() => setShowLinkModal(false)} style={{ fontSize: '0.85rem' }}>Cancel</button>
                            <button className="btn-primary" onClick={() => { insertHTML(`<a href="${linkUrl.startsWith('http') ? linkUrl : 'https://' + linkUrl}" target="_blank" style="color: var(--primary-color); text-decoration: underline;">${linkText || linkUrl}</a>`); setShowLinkModal(false); setLinkUrl(''); setLinkText(''); }} style={{ fontSize: '0.85rem', padding: '8px 24px' }}>Insert</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Main Component ---

const EmailSettingsPage = () => {
    const [subTab, setSubTab] = useState('connection');
    const [isAddEmailModalOpen, setIsAddEmailModalOpen] = useState(false);
    const [isAddTemplateModalOpen, setIsAddTemplateModalOpen] = useState(false);
    const [signatureType, setSignatureType] = useState('simple');
    const [simpleSignature, setSimpleSignature] = useState('--Real Deal');
    const [htmlSignature, setHtmlSignature] = useState('--Real Deal');
    const [connectedEmail, setConnectedEmail] = useState(''); // Reset to empty for discovery
    const [isAdvancedSettingsOpen, setIsAdvancedSettingsOpen] = useState(true); // Default to true for "Other"
    const [selectedProvider, setSelectedProvider] = useState('Other');
    const [emailConfig, setEmailConfig] = useState({
        email: '',
        password: '',
        customUsername: false,
        imapHost: '',
        imapPort: '993',
        smtpHost: '',
        smtpPort: '465',
        securityType: 'SSL/TLS',
        syncEmail: true,
        syncContacts: true,
        syncCalendar: true
    });

    const tabs = [
        { id: 'connection', label: 'Connection' },
        { id: 'signature', label: 'Signature' },
        { id: 'visibility', label: 'Visibility' },
        { id: 'block-list', label: 'Block list' },
        { id: 'email-templates', label: 'Email templates' }
    ];

    const containerStyle = {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        overflow: 'hidden'
    };

    const headerStyle = {
        padding: '32px 40px 0 40px',
        borderBottom: '1px solid #f1f5f9'
    };

    const titleStyle = {
        fontSize: '1.5rem',
        fontWeight: 800,
        color: '#0f172a',
        marginBottom: '8px',
        textTransform: 'uppercase'
    };

    const subtitleStyle = {
        fontSize: '0.9rem',
        color: '#64748b',
        marginBottom: '24px'
    };

    const tabListStyle = {
        display: 'flex',
        gap: '24px'
    };

    const tabStyle = (id) => ({
        padding: '12px 0',
        fontSize: '0.9rem',
        fontWeight: 600,
        color: subTab === id ? 'var(--primary-color)' : '#64748b',
        borderBottom: subTab === id ? '2px solid var(--primary-color)' : '2px solid transparent',
        cursor: 'pointer',
        transition: '0.2s'
    });

    const contentStyle = {
        flex: 1,
        padding: '32px 40px',
        overflowY: 'auto'
    };

    const [innerTab, setInnerTab] = useState('templates');
    const [blockInnerTab, setBlockInnerTab] = useState('individual');
    const [filterTags, setFilterTags] = useState(['Welcome']);
    const [allTags, setAllTags] = useState(['Welcome', 'Leads', 'Follow-up', 'Onboarding']);
    const [editingTemplate, setEditingTemplate] = useState(null);

    const [templates, setTemplates] = useState(emailTemplates);
    const [visibilitySettings, setVisibilitySettings] = useState({
        leads: 'Not visible to users',
        contacts: 'Not visible to users',
        deals: 'Not visible to users'
    });

    const [isSwitchModalOpen, setIsSwitchModalOpen] = useState(false);
    const [pendingSignatureType, setPendingSignatureType] = useState(null);

    const handleSignatureTypeChange = (type) => {
        if (signatureType === 'html' && type === 'simple') {
            setPendingSignatureType(type);
            setIsSwitchModalOpen(true);
        } else {
            setSignatureType(type);
        }
    };

    const confirmSwitch = () => {
        setSignatureType('simple');
        setHtmlSignature('--Real Deal');
        setIsSwitchModalOpen(false);
    };

    // --- Tab Renderers ---

    const renderConnection = () => (
        <div>
            <div style={{ display: 'flex', gap: '20px', marginBottom: '32px' }}>
                {['Google', 'Outlook', 'Yahoo', 'Other'].map(provider => (
                    <div key={provider}
                        onClick={() => setSelectedProvider(provider)}
                        style={{
                            width: '80px',
                            height: '80px',
                            border: selectedProvider === provider ? '2px solid var(--primary-color)' : '1px solid #e2e8f0',
                            borderRadius: '4px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: '0.2s',
                            background: '#fff'
                        }}>
                        <div style={{ width: '32px', height: '32px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '4px', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className={`fab fa-${provider.toLowerCase() === 'google' ? 'google text-primary' : provider.toLowerCase() === 'outlook' ? 'microsoft text-orange' : provider.toLowerCase() === 'yahoo' ? 'yahoo text-purple' : 'envelope text-blue'}`} style={{ fontSize: '1rem' }}></i>
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>{provider}</span>
                    </div>
                ))}
            </div>

            {connectedEmail && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '4px', padding: '20px 24px', position: 'relative', background: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>Email Address</span>
                            <span style={{ fontSize: '0.9rem', color: '#475569' }}>{connectedEmail}</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 600 }}>Sync</span>
                            <div style={{ display: 'flex', gap: '6px', color: '#94a3b8' }}>
                                <i className="fas fa-envelope" style={{ color: 'var(--primary-color)', fontSize: '0.8rem' }}></i>
                                <i className="far fa-calendar-alt" style={{ fontSize: '0.8rem' }}></i>
                                <i className="fas fa-user-friends" style={{ fontSize: '0.8rem' }}></i>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 600 }}>Status</span>
                            <span style={{ fontSize: '0.85rem', color: '#22c55e', fontWeight: 700 }}>Connected</span>
                        </div>

                        <span style={{ fontSize: '0.85rem', color: '#475569', cursor: 'pointer', marginLeft: 'auto' }}>Update your password</span>
                        <span style={{ fontSize: '0.85rem', color: '#ef4444', cursor: 'pointer' }} onClick={() => setConnectedEmail('')}>Disconnect Email Account</span>
                    </div>
                </div>
            )}

            {!connectedEmail && (
                <button className="btn-primary" onClick={() => setIsAddEmailModalOpen(true)} style={{ padding: '10px 24px', borderRadius: '4px', fontWeight: 700, fontSize: '0.9rem' }}>Add New Email</button>
            )}

            <div style={{ marginTop: '64px', borderTop: '1px solid #f1f5f9', paddingTop: '48px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', marginBottom: '24px', textTransform: 'none' }}>Options</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '48px' }}>
                    <div style={{ fontSize: '0.9rem', color: '#475569', fontWeight: 600 }}>Invitation Email Logo</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                        <div style={{ width: '64px', height: '64px', border: '1px solid #e2e8f0', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
                            <img src="https://via.placeholder.com/40" alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '0' }}>
                            <button className="btn-outline" style={{ fontSize: '0.8rem', padding: '6px 16px', borderRadius: '4px 0 0 4px', borderRight: 'none' }}>Remove</button>
                            <button className="btn-outline" style={{ fontSize: '0.8rem', padding: '6px 16px', borderRadius: '0 4px 4px 0', color: 'var(--primary-color)' }}>Change</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderSignature = () => (
        <div>
            <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: '0 0 8px 0' }}>Email signature</h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
                <div onClick={() => handleSignatureTypeChange('simple')} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}>
                    <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '2px', background: signatureType === 'simple' ? 'var(--primary-color)' : '#fff', borderColor: signatureType === 'simple' ? 'var(--primary-color)' : '#cbd5e1' }}>
                        {signatureType === 'simple' && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff' }}></div>}
                    </div>
                    <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b' }}>Simple signature</div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Use simple text formatting.</div>
                    </div>
                </div>
                <div onClick={() => handleSignatureTypeChange('html')} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}>
                    <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '2px', background: signatureType === 'html' ? 'var(--primary-color)' : '#fff', borderColor: signatureType === 'html' ? 'var(--primary-color)' : '#cbd5e1' }}>
                        {signatureType === 'html' && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff' }}></div>}
                    </div>
                    <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b' }}>HTML</div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Add a company logo, social media icons, or style your signature with brand colors.</div>
                    </div>
                </div>
            </div>

            {signatureType === 'simple' ? (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                    <textarea
                        style={{ width: '100%', height: '120px', padding: '16px', border: 'none', resize: 'none', outline: 'none', fontSize: '0.95rem' }}
                        placeholder="Your signature..."
                        value={simpleSignature}
                        onChange={(e) => setSimpleSignature(e.target.value)}
                    />
                    <div style={{ padding: '8px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '20px', color: '#94a3b8', fontSize: '1rem', background: '#fff', justifyContent: 'center' }}>
                        <i className="fas fa-bold"></i><i className="fas fa-italic"></i><i className="fas fa-underline"></i><i className="fas fa-list-ul"></i><i className="far fa-image"></i><i className="fas fa-link"></i>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                        <textarea
                            style={{ width: '100%', height: '300px', padding: '16px', border: 'none', resize: 'none', outline: 'none', fontSize: '0.9rem', fontFamily: 'monospace' }}
                            placeholder="HTML Code..."
                            value={htmlSignature}
                            onChange={(e) => setHtmlSignature(e.target.value)}
                        />
                    </div>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '4px', padding: '16px', background: '#fff', height: '300px', overflowY: 'auto' }}>
                        <div dangerouslySetInnerHTML={{ __html: htmlSignature || '--Real Deal' }} />
                    </div>
                </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button className="btn-primary" style={{ padding: '8px 32px' }}>Save</button>
            </div>
        </div>
    );

    const renderVisibility = () => (
        <div>
            <div style={{ background: '#f8fafc', padding: '16px 20px', borderRadius: '8px', marginBottom: '24px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <i className="fas fa-info-circle" style={{ color: 'var(--primary-color)', fontSize: '1.1rem' }}></i>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', lineHeight: '1.5' }}>
                    Changes to visibility settings will be applied to all past emails as well as all future emails once they are saved.
                </p>
            </div>
            {['leads', 'contacts', 'deals'].map(type => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '20px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: '0.95rem', color: '#1e293b' }}>My email conversations on <strong style={{ textTransform: 'capitalize' }}>{type === 'deals' ? 'Properties' : type}</strong> are</span>
                    <VisibilityDropdown value={visibilitySettings[type]} onChange={(val) => setVisibilitySettings({ ...visibilitySettings, [type]: val })} />
                </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '32px' }}>
                <button className="btn-primary" style={{ padding: '10px 32px', borderRadius: '4px', fontWeight: 600 }}>Save</button>
            </div>
        </div>
    );

    const renderBlockList = () => (
        <div>
            <div style={{ display: 'flex', gap: '32px', borderBottom: '1px solid #f1f5f9', marginBottom: '32px' }}>
                <div onClick={() => setBlockInnerTab('team')} style={{ padding: '12px 0', fontSize: '0.9rem', fontWeight: 700, color: blockInnerTab === 'team' ? 'var(--primary-color)' : '#64748b', borderBottom: blockInnerTab === 'team' ? '2px solid var(--primary-color)' : '2px solid transparent', cursor: 'pointer' }}>Team Members</div>
                <div onClick={() => setBlockInnerTab('individual')} style={{ padding: '12px 0', fontSize: '0.9rem', fontWeight: 600, color: blockInnerTab === 'individual' ? 'var(--primary-color)' : '#64748b', borderBottom: blockInnerTab === 'individual' ? '2px solid var(--primary-color)' : '2px solid transparent', cursor: 'pointer' }}>Individual Emails</div>
            </div>
            {blockInnerTab === 'team' ? (
                <>
                    <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '24px' }}>Coworkers are automatically blocklisted.</p>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead><tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}><th style={{ padding: '12px 24px', textAlign: 'left' }}>Name</th><th style={{ padding: '12px 24px', textAlign: 'left' }}>Email</th><th style={{ padding: '12px 24px', textAlign: 'right' }}>Status</th></tr></thead>
                            <tbody>{['Ramesh', 'Suresh', 'Ajitesh'].map((name, i) => (<tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}><td style={{ padding: '16px 24px', fontWeight: 600 }}>{name}</td><td style={{ padding: '16px 24px' }}>{name.toLowerCase()}@bharatproperties.com</td><td style={{ padding: '16px 24px', textAlign: 'right', fontStyle: 'italic' }}>Blocked (System)</td></tr>))}</tbody>
                        </table>
                    </div>
                </>
            ) : (
                <div style={{ padding: '40px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                    <p style={{ color: '#64748b' }}>No individual emails blocklisted yet.</p>
                    <button className="btn-outline" style={{ marginTop: '16px' }}><i className="fas fa-plus"></i> Add Email</button>
                </div>
            )}
        </div>
    );

    const renderTemplates = () => (
        <div>
            <div style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', margin: '0 0 8px 0' }}>Email templates</h2>
                <p style={{ fontSize: '0.9rem', color: '#64748b' }}>Create templates for frequently sent email messages.</p>
            </div>
            <div style={{ display: 'flex', gap: '32px', borderBottom: '1px solid #f1f5f9', marginBottom: '24px' }}>
                <div onClick={() => setInnerTab('templates')} style={{ padding: '12px 0', fontSize: '0.9rem', fontWeight: 700, color: innerTab === 'templates' ? 'var(--primary-color)' : '#64748b', borderBottom: innerTab === 'templates' ? '2px solid var(--primary-color)' : '2px solid transparent', cursor: 'pointer' }}>Templates</div>
                <div onClick={() => setInnerTab('tags')} style={{ padding: '12px 0', fontSize: '0.9rem', fontWeight: 600, color: innerTab === 'tags' ? 'var(--primary-color)' : '#64748b', borderBottom: innerTab === 'tags' ? '2px solid var(--primary-color)' : '2px solid transparent', cursor: 'pointer' }}>Tags</div>
            </div>
            {innerTab === 'templates' ? (
                <>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#cbd5e1' }}></i>
                            <input type="text" placeholder="Search templates..." style={{ width: '100%', padding: '10px 12px 10px 36px', border: '1px solid #e2e8f0', borderRadius: '6px' }} />
                        </div>
                        <button className="btn-primary" onClick={() => setIsAddTemplateModalOpen(true)} style={{ padding: '10px 20px', fontWeight: 700 }}>Add template</button>
                    </div>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead><tr style={{ background: '#fff', borderBottom: '1px solid #e2e8f0' }}><th style={{ padding: '12px 24px', textAlign: 'left' }}>Template name</th><th style={{ padding: '12px 24px', textAlign: 'left' }}>Tags</th><th style={{ padding: '12px 24px', textAlign: 'left' }}>Created by</th><th style={{ padding: '12px 24px', textAlign: 'left' }}>Sharing</th><th style={{ padding: '12px 24px', width: '40px' }}></th><th style={{ padding: '12px 24px', width: '40px' }}></th></tr></thead>
                            <tbody>{templates.map(tmpl => (<tr key={tmpl.id} style={{ borderBottom: '1px solid #f1f5f9' }}><td style={{ padding: '16px 24px', fontWeight: 600 }}>{tmpl.name}</td><td style={{ padding: '16px 24px' }}>{tmpl.tags.map(tag => (<span key={tag} style={{ fontSize: '0.7rem', color: '#475569', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', marginRight: '4px' }}>{tag}</span>))}</td><td style={{ padding: '16px 24px' }}>{tmpl.author}</td><td style={{ padding: '16px 24px' }}>{tmpl.visibility}</td><td style={{ padding: '16px 24px', textAlign: 'right' }}><i className="far fa-edit" style={{ cursor: 'pointer', color: '#3b82f6', marginRight: '12px' }} onClick={() => { setEditingTemplate(tmpl); setIsAddTemplateModalOpen(true); }}></i></td><td style={{ padding: '16px 24px', textAlign: 'right' }}><i className="far fa-trash-alt" style={{ cursor: 'pointer', color: '#94a3b8' }} onClick={() => setTemplates(templates.filter(t => t.id !== tmpl.id))}></i></td></tr>))}</tbody>
                        </table>
                    </div>
                </>
            ) : (
                <div style={{ padding: '40px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}><p>Tag management is coming soon.</p></div>
            )}
            <TemplateModal
                isOpen={isAddTemplateModalOpen}
                onClose={() => { setIsAddTemplateModalOpen(false); setEditingTemplate(null); }}
                initialData={editingTemplate}
                onSave={(data) => {
                    if (data.id) {
                        setTemplates(templates.map(t => t.id === data.id ? { ...data, visibility: data.shared ? 'Owned by everyone' : 'Owned by you' } : t));
                    } else {
                        setTemplates([...templates, { ...data, id: Date.now(), author: 'Bharat Properties', visibility: data.shared ? 'Owned by everyone' : 'Owned by you' }]);
                    }
                    setEditingTemplate(null);
                }}
            />
        </div>
    );

    const renderAddEmailModal = () => (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
            <div style={{ background: '#fff', width: '720px', borderRadius: '8px', display: 'flex', flexDirection: 'column', overflowY: 'auto', maxHeight: '95vh', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                <div style={{ padding: '24px 32px', display: 'flex', justifyContent: 'flex-end' }}><i className="fas fa-times" style={{ cursor: 'pointer', color: '#94a3b8' }} onClick={() => setIsAddEmailModalOpen(false)}></i></div>
                <div style={{ padding: '0 64px 64px 64px' }}>
                    <h2 style={{ margin: '0 0 12px 0', fontSize: '1.25rem', fontWeight: 800 }}>Add your email address</h2>
                    <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '32px' }}>Connecting your email is the best way to track conversations.</p>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '40px' }}>
                        {['Google', 'Microsoft', 'Yahoo', 'Other'].map(p => (<button key={p} onClick={() => setSelectedProvider(p === 'Microsoft' ? 'Outlook' : p)} style={{ flex: 1, padding: '12px', background: '#fff', border: selectedProvider === (p === 'Microsoft' ? 'Outlook' : p) ? '2px solid var(--primary-color)' : '1px solid #e2e8f0', borderRadius: '4px', fontWeight: 700 }}>Sign in {p}</button>))}
                    </div>
                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '32px' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, marginBottom: '24px' }}>or sign in with email and password</div>
                        <div style={{ marginBottom: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}><label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Email Address</label></div>
                            <input type="email" value={emailConfig.email} onChange={e => setEmailConfig({ ...emailConfig, email: e.target.value })} style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                        </div>
                        <div style={{ marginBottom: '24px' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '8px' }}>Password</label>
                            <input type="password" value={emailConfig.password} onChange={e => setEmailConfig({ ...emailConfig, password: e.target.value })} style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                        </div>
                        <div style={{ marginBottom: '24px' }}>
                            <div onClick={() => setIsAdvancedSettingsOpen(!isAdvancedSettingsOpen)} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--primary-color)', fontSize: '0.85rem', fontWeight: 700 }}>
                                <i className={`fas fa-chevron-${isAdvancedSettingsOpen ? 'up' : 'down'}`}></i> More settings
                            </div>
                            {isAdvancedSettingsOpen && (
                                <div style={{ marginTop: '24px', background: '#f8fafc', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                    <h4 style={{ margin: '0 0 16px 0', fontSize: '0.85rem', fontWeight: 800 }}>IMAP Settings</h4>
                                    <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
                                        <div style={{ flex: 1 }}><input type="text" placeholder="imap.gmail.com" value={emailConfig.imapHost} onChange={e => setEmailConfig({ ...emailConfig, imapHost: e.target.value })} style={{ width: '100%', padding: '10px' }} /></div>
                                        <div style={{ width: '80px' }}><input type="text" placeholder="993" value={emailConfig.imapPort} onChange={e => setEmailConfig({ ...emailConfig, imapPort: e.target.value })} style={{ width: '100%', padding: '10px' }} /></div>
                                    </div>
                                    <h4 style={{ margin: '24px 0 16px 0', fontSize: '0.85rem', fontWeight: 800 }}>SMTP Settings</h4>
                                    <div style={{ display: 'flex', gap: '16px' }}>
                                        <div style={{ flex: 1 }}><input type="text" placeholder="smtp.gmail.com" value={emailConfig.smtpHost} onChange={e => setEmailConfig({ ...emailConfig, smtpHost: e.target.value })} style={{ width: '100%', padding: '10px' }} /></div>
                                        <div style={{ width: '80px' }}><input type="text" placeholder="465" value={emailConfig.smtpPort} onChange={e => setEmailConfig({ ...emailConfig, smtpPort: e.target.value })} style={{ width: '100%', padding: '10px' }} /></div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '40px' }}>
                            <button className="btn-primary" style={{ padding: '12px 48px', fontWeight: 700 }} onClick={() => { setConnectedEmail(emailConfig.email || 'custom@provider.com'); setIsAddEmailModalOpen(false); }}>Connect</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <section style={containerStyle}>
            <div style={headerStyle}>
                <h1 style={titleStyle}>Email Account</h1>
                <p style={subtitleStyle}>Connect your email and manage your templates.</p>
                <div style={tabListStyle}>{tabs.map(tab => (<div key={tab.id} onClick={() => setSubTab(tab.id)} style={tabStyle(tab.id)}>{tab.label}</div>))}</div>
            </div>
            <div style={contentStyle}>
                {subTab === 'connection' && renderConnection()}
                {subTab === 'signature' && renderSignature()}
                {subTab === 'visibility' && renderVisibility()}
                {subTab === 'block-list' && renderBlockList()}
                {subTab === 'email-templates' && renderTemplates()}
            </div>
            {isAddEmailModalOpen && renderAddEmailModal()}
            {isSwitchModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10005 }}>
                    <div style={{ background: '#fff', width: '480px', borderRadius: '8px', padding: '32px' }}>
                        <h2 style={{ margin: '0 0 24px 0', fontSize: '1.25rem', fontWeight: 700 }}>Switch to simple signature</h2>
                        <p>Your HTML signature will be deleted.</p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                            <button className="btn-outline" onClick={() => setIsSwitchModalOpen(false)}>Cancel</button>
                            <button className="btn-primary" onClick={confirmSwitch}>Switch signature</button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
};

export default EmailSettingsPage;
