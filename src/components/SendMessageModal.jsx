import React, { useState, useEffect, useRef } from 'react';

const SendMessageModal = ({ isOpen, onClose, onSend, initialRecipients = [] }) => {
    const [channel, setChannel] = useState('SMS'); // SMS, WHATSAPP, RCS
    const [recipients, setRecipients] = useState([]);
    const [recipientInput, setRecipientInput] = useState('');

    // Message Content States
    const [messageBody, setMessageBody] = useState('');
    const [templateId, setTemplateId] = useState('');

    // RCS Specifics
    const [rcsTitle, setRcsTitle] = useState('');
    const [rcsMedia, setRcsMedia] = useState(null);
    const [rcsActions, setRcsActions] = useState([]);

    // Reference / Context (New Feature)
    const [referenceType, setReferenceType] = useState(''); // 'property', 'booking', 'invoice'
    const [selectedReference, setSelectedReference] = useState(null);
    const [attachment, setAttachment] = useState(null); // { type: 'pdf'|'image'|'video', name: 'file.pdf', url: '...' }

    // Mock Data for References
    const mockReferences = {
        property: [
            { id: 'p1', name: 'Luxury Villa in Sector 17', attachmentType: 'pdf', fileName: 'Villa_Brochure.pdf', link: 'https://bharatprops.com/b/123' },
            { id: 'p2', name: '3BHK Apartment (Zirakpur)', attachmentType: 'image', fileName: 'Apartment_View.jpg', link: 'https://bharatprops.com/i/456' },
            { id: 'p3', name: 'Commercial Plot (Mohali)', attachmentType: 'video', fileName: 'Plot_Walkthrough.mp4', link: 'https://bharatprops.com/v/789' }
        ],
        booking: [
            { id: 'b1', name: 'Unit A-402 (Highland Park)', attachmentType: 'pdf', fileName: 'Booking_Receipt_A402.pdf' },
            { id: 'b2', name: 'Plot 45 (Eco City)', attachmentType: 'pdf', fileName: 'Booking_Confirmation_45.pdf' }
        ],
        invoice: [
            { id: 'inv1', name: 'INV-2023-001 (₹50k)', attachmentType: 'pdf', fileName: 'Invoice_001_Signed.pdf' },
            { id: 'inv2', name: 'INV-2023-005 (₹1.25L)', attachmentType: 'pdf', fileName: 'Invoice_005_Signed.pdf' }
        ]
    };

    // Scheduling
    const [showSchedule, setShowSchedule] = useState(false);
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');

    const textAreaRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            setChannel('SMS');
            setRecipients(initialRecipients);
            setMessageBody('');
            setTemplateId('');
            setRcsTitle('');
            setRcsMedia(null);
            setRcsActions([]);
            setShowSchedule(false);
            setScheduleDate('');
            setScheduleTime('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const handleAddRecipient = (e) => {
        if (e.key === 'Enter' && recipientInput.trim()) {
            e.preventDefault();
            setRecipients([...recipients, { name: recipientInput.trim(), phone: recipientInput.trim() }]);
            setRecipientInput('');
        }
    };

    const removeRecipient = (index) => {
        setRecipients(recipients.filter((_, i) => i !== index));
    };

    const insertText = (text) => {
        const textarea = textAreaRef.current;
        if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const newText = messageBody.substring(0, start) + text + messageBody.substring(end);
            setMessageBody(newText);
            // setTimeout(() => {
            //     textarea.focus();
            //     textarea.setSelectionRange(start + text.length, start + text.length);
            // }, 0);
        } else {
            setMessageBody(prev => prev + text);
        }
    };

    const wrapSelection = (char) => {
        const textarea = textAreaRef.current;
        if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const selectedText = messageBody.substring(start, end);
            const newText = messageBody.substring(0, start) + char + selectedText + char + messageBody.substring(end);
            setMessageBody(newText);
        }
    };

    const handleTemplateChange = (e) => {
        const val = e.target.value;
        setTemplateId(val);
        if (val === 'welcome') setMessageBody("Hello {{Name}}, welcome to Bharat Properties! We're glad to have you.");
        else if (val === 'property_alert') setMessageBody("Hi {{Name}}, a new property matching your criteria in {{Location}} just got listed! Check it now: {{Link}}");
        else if (val === 'meeting_confirm') setMessageBody("Dear {{Name}}, confirming our meeting at {{Time}} tomorrow. Please reply YES to confirm.");
        else if (val === '') setMessageBody("");
    };

    const handleReferenceSelect = (type, id) => {
        setReferenceType(type);
        if (!id) {
            setSelectedReference(null);
            setAttachment(null);
            return;
        }

        const item = mockReferences[type].find(i => i.id === id);
        setSelectedReference(item);

        if (item) {
            setAttachment({
                type: item.attachmentType,
                name: item.fileName,
                url: item.link || '#'
            });
        }
    };

    const handleSend = (isScheduled) => {
        const data = {
            channel,
            recipients,
            content: {
                body: messageBody,
                templateId,
                rcs: { title: rcsTitle, actions: rcsActions }
            },
            schedule: isScheduled && showSchedule ? { date: scheduleDate, time: scheduleTime } : null
        };
        if (onSend) onSend(data);
        onClose();
    };

    if (!isOpen) return null;

    // --- LOGIC HELPERS ---
    const charCount = messageBody.length;
    const segments = Math.ceil(charCount / 160) || 1;

    // --- STYLES ---
    const overlayStyle = {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(5px)',
        zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center'
    };

    const modalStyle = {
        backgroundColor: '#fff', width: '1100px', height: '90vh',
        borderRadius: '20px', display: 'flex', overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
    };

    const leftPanelStyle = {
        flex: 3, padding: '40px', overflowY: 'auto',
        borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column'
    };

    const rightPanelStyle = {
        flex: 2, backgroundColor: '#f8fafc', padding: '40px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column'
    };

    const labelStyle = {
        display: 'block', fontSize: '0.85rem', fontWeight: 600,
        color: '#475569', marginBottom: '8px'
    };

    const inputStyle = {
        width: '100%', padding: '12px 16px', borderRadius: '8px',
        border: '1px solid #e2e8f0', fontSize: '0.95rem',
        outline: 'none', transition: 'border 0.2s', backgroundColor: '#fff'
    };

    const toolbarBtnStyle = {
        padding: '6px 10px', borderRadius: '4px', border: 'none', backgroundColor: 'transparent',
        color: '#64748b', cursor: 'pointer', fontSize: '0.9rem', transition: 'all 0.2s'
    };

    const channelBtnStyle = (active) => ({
        flex: 1, padding: '14px', border: 'none',
        backgroundColor: active ? '#fff' : 'transparent',
        color: active ? (channel === 'RCS' ? '#4285F4' : channel === 'WHATSAPP' ? '#059669' : '#2563eb') : '#64748b',
        boxShadow: active ? '0 4px 6px -1px rgba(0,0,0,0.1)' : 'none',
        borderRadius: '12px', fontWeight: 700, fontSize: '0.95rem',
        cursor: 'pointer', transition: 'all 0.2s',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
    });

    return (
        <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={modalStyle}>

                {/* --- LEFT PANEL: CONFIGURATION --- */}
                <div style={leftPanelStyle}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>Send Message</h2>
                    <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '32px' }}>Configure your campaign details and recipients.</p>


                    {/* 1. Recipients */}
                    <div style={{ marginBottom: '32px' }}>
                        <label style={labelStyle}>Recipients</label>
                        <div style={{ ...inputStyle, display: 'flex', flexWrap: 'wrap', gap: '8px', minHeight: '52px', alignItems: 'center' }}>
                            {recipients.map((r, i) => (
                                <span key={i} style={{
                                    background: '#eff6ff', color: '#2563eb', padding: '4px 12px',
                                    borderRadius: '50px', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center',
                                    border: '1px solid #dbeafe'
                                }}>
                                    {r.name}
                                    <i className="fas fa-times" style={{ marginLeft: '8px', cursor: 'pointer', opacity: 0.6, fontSize: '0.8rem' }} onClick={() => removeRecipient(i)}></i>
                                </span>
                            ))}
                            <input
                                value={recipientInput}
                                onChange={e => setRecipientInput(e.target.value)}
                                onKeyDown={handleAddRecipient}
                                placeholder={recipients.length ? "" : "Type name or number & press Enter..."}
                                style={{ border: 'none', outline: 'none', flex: 1, minWidth: '150px', fontSize: '0.95rem' }}
                            />
                        </div>
                    </div>


                    {/* 2. Channel Selection */}
                    <div style={{ marginBottom: '32px' }}>
                        <label style={labelStyle}>Select Channel</label>
                        <div style={{ display: 'flex', backgroundColor: '#f1f5f9', padding: '6px', borderRadius: '16px', gap: '6px' }}>
                            <button type="button" onClick={() => setChannel('SMS')} style={channelBtnStyle(channel === 'SMS')}>
                                <i className="fas fa-comment-alt"></i> SMS
                            </button>
                            <button type="button" onClick={() => setChannel('WHATSAPP')} style={channelBtnStyle(channel === 'WHATSAPP')}>
                                <i className="fab fa-whatsapp"></i> WhatsApp
                            </button>
                            <button type="button" onClick={() => setChannel('RCS')} style={channelBtnStyle(channel === 'RCS')}>
                                <i className="fas fa-comment-dots"></i> RCS
                            </button>
                        </div>
                    </div>



                    {/* 2.5 Reference / Attachment Selection */}
                    <div style={{ marginBottom: '32px', padding: '20px', backgroundColor: '#f0f9ff', borderRadius: '16px', border: '1px solid #bae6fd' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                            <i className="fas fa-paperclip" style={{ color: '#0284c7' }}></i>
                            <label style={{ ...labelStyle, marginBottom: 0, color: '#0369a1' }}>Attach Documents / Media</label>
                        </div>

                        <div style={{ display: 'flex', gap: '16px', marginBottom: attachment ? '16px' : '0' }}>
                            <div style={{ flex: 1 }}>
                                <select
                                    style={inputStyle}
                                    value={referenceType}
                                    onChange={(e) => {
                                        setReferenceType(e.target.value);
                                        setSelectedReference(null);
                                        setAttachment(null);
                                    }}
                                >
                                    <option value="">-- Select Type --</option>
                                    <option value="property">Property Brochure/Video</option>
                                    <option value="booking">Booking Receipt</option>
                                    <option value="invoice">Invoice (Signed)</option>
                                </select>
                            </div>
                            <div style={{ flex: 2 }}>
                                <select
                                    style={inputStyle}
                                    value={selectedReference?.id || ''}
                                    onChange={(e) => handleReferenceSelect(referenceType, e.target.value)}
                                    disabled={!referenceType}
                                >
                                    <option value="">-- Select Item --</option>
                                    {referenceType && mockReferences[referenceType].map(item => (
                                        <option key={item.id} value={item.id}>
                                            {item.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {attachment && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#fff', borderRadius: '8px', border: '1px solid #e0f2fe' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7' }}>
                                    <i className={`fas ${attachment.type === 'pdf' ? 'fa-file-pdf' : attachment.type === 'image' ? 'fa-image' : 'fa-video'}`} style={{ fontSize: '1.2rem' }}></i>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a' }}>{attachment.name}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Ready to send • 2.4 MB</div>
                                </div>
                                <i className="fas fa-check-circle" style={{ color: '#10b981', fontSize: '1.2rem' }}></i>
                            </div>
                        )}
                    </div>


                    {/* 3. Dynamic Fields */}
                    <div style={{ flex: 1 }}>

                        {/* ================= SMS VIEW ================= */}
                        {channel === 'SMS' && (
                            <div className="animate-fade-in">
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <label style={labelStyle}>Text Message</label>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>GSM 7-bit</div>
                                </div>
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                    {/* Toolbar (Variables only) */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 12px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                                        <button style={toolbarBtnStyle} onClick={() => insertText('{{Name}}')} title="Insert Name"><i className="fas fa-user-tag" style={{ marginRight: '4px' }}></i> Name</button>
                                        <button style={toolbarBtnStyle} onClick={() => insertText('{{Phone}}')} title="Insert Phone"><i className="fas fa-phone" style={{ marginRight: '4px' }}></i> Phone</button>
                                        <button style={toolbarBtnStyle} onClick={() => insertText('{{Link}}')} title="Insert Link"><i className="fas fa-link" style={{ marginRight: '4px' }}></i> Link</button>
                                    </div>
                                    <textarea
                                        ref={textAreaRef}
                                        style={{ ...inputStyle, border: 'none', minHeight: '180px', resize: 'vertical', lineHeight: '1.6' }}
                                        placeholder="Type your SMS message here..."
                                        value={messageBody}
                                        onChange={e => setMessageBody(e.target.value)}
                                    />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#64748b', marginTop: '8px', paddingLeft: '4px' }}>
                                    <span>Used characters: <strong>{charCount}</strong></span>
                                    <span>Segments: <strong>{segments}</strong></span>
                                </div>
                            </div>
                        )}

                        {/* ================= WHATSAPP VIEW ================= */}
                        {channel === 'WHATSAPP' && (
                            <div className="animate-fade-in">
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={labelStyle}>Select Template</label>
                                    <select
                                        value={templateId}
                                        onChange={handleTemplateChange}
                                        style={inputStyle}
                                    >
                                        <option value="">-- Choose a Template --</option>
                                        <option value="welcome">Welcome Message</option>
                                        <option value="property_alert">Property Alert</option>
                                        <option value="meeting_confirm">Meeting Confirmation</option>
                                    </select>
                                </div>

                                <div style={{ marginBottom: '8px' }}>
                                    <label style={labelStyle}>Message Body</label>
                                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                        {/* Full Toolbar */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 12px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                                            <button style={toolbarBtnStyle} onClick={() => wrapSelection('*')} title="Bold"><i className="fas fa-bold"></i></button>
                                            <button style={toolbarBtnStyle} onClick={() => wrapSelection('_')} title="Italic"><i className="fas fa-italic"></i></button>
                                            <button style={toolbarBtnStyle} onClick={() => wrapSelection('~')} title="Strikethrough"><i className="fas fa-strikethrough"></i></button>
                                            <div style={{ width: '1px', height: '18px', backgroundColor: '#e2e8f0', margin: '0 6px' }}></div>
                                            <button style={toolbarBtnStyle} onClick={() => insertText('{{Name}}')} title="Insert Name"><i className="fas fa-user-tag" style={{ marginRight: '4px' }}></i> Name</button>
                                            <button style={toolbarBtnStyle} onClick={() => insertText('{{Link}}')} title="Insert Link"><i className="fas fa-link" style={{ marginRight: '4px' }}></i> Link</button>
                                        </div>
                                        <textarea
                                            ref={textAreaRef}
                                            style={{ ...inputStyle, border: 'none', minHeight: '150px', resize: 'vertical', lineHeight: '1.6' }}
                                            placeholder="Select a template or type..."
                                            value={messageBody}
                                            onChange={e => setMessageBody(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div style={{ padding: '12px 16px', background: '#ecfdf5', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#065f46', display: 'flex', gap: '8px' }}>
                                        <i className="fas fa-info-circle" style={{ marginTop: '2px' }}></i>
                                        <span>Use pre-approved templates for initial contact.</span>
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* ================= RCS VIEW ================= */}
                        {channel === 'RCS' && (
                            <div className="animate-fade-in">
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={labelStyle}>Card Title</label>
                                    <input
                                        style={inputStyle}
                                        placeholder="e.g. Exclusive Launch Offer"
                                        value={rcsTitle}
                                        onChange={e => setRcsTitle(e.target.value)}
                                    />
                                </div>

                                <div style={{ marginBottom: '20px' }}>
                                    <label style={labelStyle}>Description / Body</label>
                                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 12px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                                            <button style={toolbarBtnStyle} onClick={() => insertText('{{Name}}')} title="Insert Name"><i className="fas fa-user-tag" style={{ marginRight: '4px' }}></i> Name</button>
                                            <button style={toolbarBtnStyle} onClick={() => insertText('{{Link}}')} title="Insert Link"><i className="fas fa-link" style={{ marginRight: '4px' }}></i> Link</button>
                                        </div>
                                        <textarea
                                            ref={textAreaRef}
                                            style={{ ...inputStyle, border: 'none', minHeight: '120px', resize: 'vertical', lineHeight: '1.6' }}
                                            placeholder="Describe your offer in detail..."
                                            value={messageBody}
                                            onChange={e => setMessageBody(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* Rich Media */}
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={labelStyle}>Rich Media</label>
                                    <div style={{ padding: '20px', border: '2px dashed #cbd5e1', borderRadius: '12px', textAlign: 'center', cursor: 'pointer', background: '#f8fafc', transition: 'all 0.2s', color: '#64748b', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                        <i className="fas fa-cloud-upload-alt" style={{ fontSize: '1.5rem', color: '#94a3b8' }}></i>
                                        <div>
                                            <span style={{ fontWeight: 600, color: '#475569' }}>Click to upload</span>
                                            <span style={{ fontSize: '0.8rem', display: 'block' }}>Image or Video (Max 10MB)</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions / Buttons */}
                                <div>
                                    <label style={labelStyle}>Suggested Actions (Buttons)</label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {rcsActions.map((action, idx) => (
                                            <div key={idx} style={{ display: 'flex', gap: '8px' }}>
                                                <input style={{ ...inputStyle, flex: 1 }} placeholder="Button Label" value={action.label} readOnly />
                                                <button onClick={() => setRcsActions(rcsActions.filter((_, i) => i !== idx))} style={{ ...toolbarBtnStyle, color: '#ef4444' }}><i className="fas fa-trash"></i></button>
                                            </div>
                                        ))}
                                        {rcsActions.length < 3 && (
                                            <button
                                                onClick={() => setRcsActions([...rcsActions, { label: 'Visit Website', type: 'url' }])}
                                                style={{ ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#2563eb', fontWeight: 600, cursor: 'pointer', background: '#f0f9ff', borderColor: '#bae6fd' }}
                                            >
                                                <i className="fas fa-plus-circle"></i> Add Action Button
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>

                    {/* Footer Actions */}
                    <div style={{ marginTop: '32px' }}>
                        {showSchedule && (
                            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', animation: 'fadeIn 0.2s' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>Date</label>
                                    <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} style={inputStyle} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>Time</label>
                                    <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} style={inputStyle} />
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <button onClick={onClose} style={{ padding: '12px 24px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>Cancel</button>

                            <div style={{ flex: 1 }}></div>

                            <button
                                onClick={() => setShowSchedule(!showSchedule)}
                                style={{
                                    padding: '12px 24px', borderRadius: '10px', border: '1px solid #cbd5e1',
                                    background: showSchedule ? '#e2e8f0' : '#fff', color: '#475569', fontWeight: 700, cursor: 'pointer',
                                    fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px'
                                }}
                            >
                                <i className="far fa-clock"></i> {showSchedule ? 'Hide Schedule' : 'Schedule'}
                            </button>

                            <button
                                onClick={() => handleSend(showSchedule)}
                                style={{
                                    padding: '12px 32px', borderRadius: '10px', border: 'none',
                                    background: 'var(--primary-color)', color: '#fff', fontWeight: 700, cursor: 'pointer',
                                    fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px',
                                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
                                }}
                            >
                                <i className="fas fa-paper-plane"></i> {showSchedule ? 'Schedule Campaign' : 'Send Now'}
                            </button>
                        </div>
                    </div>

                </div>

                {/* --- RIGHT PANEL: PREVIEW --- */}
                <div style={rightPanelStyle}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#94a3b8', marginBottom: '24px', letterSpacing: '1px', textTransform: 'uppercase' }}>Live Preview</h3>

                    {/* Device Frame */}
                    <div style={{
                        width: '320px', height: '640px', backgroundColor: '#1e293b',
                        borderRadius: '40px', padding: '12px', position: 'relative',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 0 0 2px #334155'
                    }}>
                        {/* Notch */}
                        <div style={{ position: 'absolute', top: '0', left: '50%', transform: 'translateX(-50%)', width: '120px', height: '24px', background: '#1e293b', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px', zIndex: 10 }}></div>

                        {/* Screen */}
                        <div style={{
                            width: '100%', height: '100%', backgroundColor: '#fff',
                            borderRadius: '32px', overflow: 'hidden', display: 'flex', flexDirection: 'column'
                        }}>
                            {/* Status Bar Mock */}
                            <div style={{ height: '30px', background: channel === 'WHATSAPP' ? '#075e54' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', fontSize: '10px', color: channel === 'WHATSAPP' ? '#fff' : '#000' }}>
                                <span>9:41</span>
                                <span><i className="fas fa-signal"></i> <i className="fas fa-wifi"></i> <i className="fas fa-battery-full"></i></span>
                            </div>

                            {/* App Header */}
                            <div style={{
                                padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '12px',
                                background: channel === 'WHATSAPP' ? '#075e54' : '#fff',
                                color: channel === 'WHATSAPP' ? '#fff' : '#000',
                                borderBottom: channel !== 'WHATSAPP' ? '1px solid #e2e8f0' : 'none'
                            }}>
                                <i className="fas fa-arrow-left"></i>
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                                    <i className="fas fa-building"></i>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Bharat Properties</div>
                                    {channel === 'WHATSAPP' && <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>Business Account</div>}
                                </div>
                            </div>

                            {/* Chat Area */}
                            <div style={{ flex: 1, backgroundColor: channel === 'WHATSAPP' ? '#efeae2' : '#fff', padding: '16px', backgroundImage: channel === 'WHATSAPP' ? 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")' : 'none', backgroundSize: 'contain' }}>

                                {/* Date Label */}
                                <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                                    <span style={{ backgroundColor: 'rgba(0,0,0,0.1)', padding: '4px 8px', borderRadius: '8px', fontSize: '0.7rem', color: '#555' }}>Today</span>
                                </div>

                                {/* Message Bubble */}
                                <div style={{
                                    backgroundColor: channel === 'WHATSAPP' ? '#fff' : channel === 'SMS' ? '#e2e8f0' : '#e8f0fe', // SMS gray, RCS blue tint
                                    padding: '0',
                                    borderRadius: '12px',
                                    maxWidth: '85%',
                                    alignSelf: 'flex-start',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                    overflow: 'hidden'
                                }}>
                                    {/* RCS Rich Media */}
                                    {channel === 'RCS' && (
                                        <div style={{ height: '120px', background: '#cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <i className="fas fa-image" style={{ fontSize: '2rem', color: '#fff' }}></i>
                                        </div>
                                    )}

                                    {/* Attachment Preview (PDF/Image/Video) */}
                                    {attachment && (
                                        <div style={{ margin: '4px', marginBottom: '8px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                                            {attachment.type === 'image' ? (
                                                <div style={{ height: '120px', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                                                    <i className="fas fa-image" style={{ fontSize: '2rem' }}></i>
                                                </div>
                                            ) : attachment.type === 'video' ? (
                                                <div style={{ height: '120px', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                                                    <i className="fas fa-play-circle" style={{ fontSize: '2rem' }}></i>
                                                </div>
                                            ) : (
                                                <div style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{ width: '32px', height: '32px', background: '#ffeded', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                                                        <i className="fas fa-file-pdf"></i>
                                                    </div>
                                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                                        <div style={{ fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{attachment.name}</div>
                                                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>PDF • 1 Page</div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div style={{ padding: '12px' }}>
                                        {channel === 'RCS' && rcsTitle && (
                                            <div style={{ fontWeight: 700, marginBottom: '4px', fontSize: '0.9rem' }}>{rcsTitle}</div>
                                        )}

                                        <div style={{ fontSize: '0.85rem', lineHeight: '1.4', whiteSpace: 'pre-wrap' }}>
                                            {messageBody || (templateId ? "Hello! This is a preview of the selected template..." : "Your message content will appear here.")}
                                        </div>

                                        <div style={{ textAlign: 'right', fontSize: '0.65rem', color: '#94a3b8', marginTop: '6px' }}>
                                            10:30 AM {channel === 'WHATSAPP' && <i className="fas fa-check-double" style={{ color: '#34b7f1', marginLeft: '2px' }}></i>}
                                        </div>
                                    </div>

                                    {/* RCS Actions */}
                                    {channel === 'RCS' && (
                                        <div style={{ borderTop: '1px solid #bfdbfe' }}>
                                            <div style={{ padding: '10px', textAlign: 'center', color: '#2563eb', fontWeight: 600, fontSize: '0.85rem' }}>
                                                View Details
                                            </div>
                                        </div>
                                    )}
                                </div>

                            </div>

                            {/* Input Bar Mock */}
                            <div style={{ height: '60px', background: '#f0f2f5', display: 'flex', alignItems: 'center', padding: '0 12px', gap: '8px' }}>
                                <i className="fas fa-plus" style={{ color: '#007bff' }}></i>
                                <div style={{ flex: 1, height: '36px', background: '#fff', borderRadius: '18px', border: '1px solid #e2e8f0' }}></div>
                                <i className="fas fa-microphone" style={{ color: '#007bff' }}></i>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default SendMessageModal;
