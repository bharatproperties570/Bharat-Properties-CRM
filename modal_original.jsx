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
        return null;
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

