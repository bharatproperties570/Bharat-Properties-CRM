import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { emailTemplates } from '../../../data/mockData';
import { getInitials } from '../../../utils/helpers';

const styles = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.6)', // slate-900/60
        backdropFilter: 'blur(4px)'
    },
    modal: {
        backgroundColor: '#fff',
        width: '100%',
        maxWidth: '900px', // max-w-4xl
        height: '90vh',
        borderRadius: '16px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'zoomIn 0.2s ease-out'
    },
    header: {
        padding: '20px 32px',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#fff'
    },
    title: { fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', margin: 0 },
    subtitle: { fontSize: '0.875rem', color: '#64748b', marginTop: '4px', margin: 0 },
    closeBtn: {
        width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#f1f5f9',
        color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer',
        fontSize: '1rem', transition: 'background-color 0.2s'
    },
    body: { flex: 1, overflowY: 'auto', padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' },
    label: { display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' },
    inputContainer: {
        minHeight: '48px', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '8px',
        display: 'flex', flexWrap: 'wrap', gap: '8px', backgroundColor: '#f8fafc'
    },
    pill: {
        display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#fff', border: '1px solid #e2e8f0',
        borderRadius: '9999px', padding: '4px 12px 4px 4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
    },
    pillAvatar: {
        width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.6rem', fontWeight: 'bold', backgroundColor: '#dbeafe', color: '#1d4ed8'
    },
    pillText: { fontSize: '0.75rem', fontWeight: 600, color: '#334155' },
    input: {
        flex: 1, backgroundColor: 'transparent', border: 'none', outline: 'none', fontSize: '0.875rem', minWidth: '100px'
    },
    textInput: {
        width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0',
        fontSize: '0.9rem', color: '#334155', outline: 'none', fontWeight: 500
    },
    editor: {
        border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#fff',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'box-shadow 0.2s'
    },
    toolbar: {
        display: 'flex', alignItems: 'center', gap: '4px', padding: '8px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#f8fafc'
    },
    toolBtn: {
        padding: '6px', borderRadius: '4px', border: 'none', backgroundColor: 'transparent', color: '#64748b',
        cursor: 'pointer', fontSize: '0.9rem'
    },
    textarea: {
        width: '100%', height: '300px', padding: '16px', border: 'none', outline: 'none', resize: 'none',
        fontSize: '0.9rem', lineHeight: '1.6', color: '#334155', fontFamily: 'inherit'
    },
    footer: {
        padding: '20px 32px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    },
    btnCancel: {
        padding: '10px 20px', fontSize: '0.875rem', fontWeight: 700, color: '#64748b',
        border: 'none', backgroundColor: 'transparent', cursor: 'pointer'
    },
    btnSchedule: {
        padding: '10px 20px', borderRadius: '8px', border: '1px solid #cbd5e1',
        backgroundColor: '#fff', color: '#475569', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '8px'
    },
    btnSend: {
        padding: '10px 24px', borderRadius: '8px', border: 'none',
        backgroundColor: '#2563eb', color: '#fff', fontWeight: 700, fontSize: '0.875rem',
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
        boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)',
        opacity: 1, transition: 'opacity 0.2s'
    },
    variablePill: {
        fontSize: '0.65rem', backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: '9999px',
        fontWeight: 700, cursor: 'pointer', border: '1px solid #dbeafe', transition: 'background-color 0.2s'
    }
};

const SendMailModal = ({ isOpen, onClose, recipients = [], onSend, initialSubject = '', initialBody = '', autoAttachments = [], initialTemplateId = '' }) => {

    const [subject, setSubject] = useState(initialSubject);
    const [body, setBody] = useState(initialBody);

    React.useEffect(() => {
        if (isOpen) {
            setSubject(initialSubject);
            setBody(initialBody);
        }
    }, [isOpen, initialSubject, initialBody]);
    const [selectedTemplate, setSelectedTemplate] = useState(initialTemplateId);

    React.useEffect(() => {
        if (isOpen && initialTemplateId) {
            setSelectedTemplate(initialTemplateId);
        }
    }, [isOpen, initialTemplateId]);
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');
    const [addSignature, setAddSignature] = useState(true);
    const [trackOpens, setTrackOpens] = useState(true);

    const variables = [
        { label: 'Contact Name', value: '{{ContactName}}' },
        { label: 'Phone', value: '{{Phone}}' },
        { label: 'Email', value: '{{Email}}' },
        { label: 'Property Name', value: '{{PropertyName}}' },
        { label: 'Assigned Agent', value: '{{AssignedAgent}}' },
    ];

    const insertHTML = (html) => {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            const el = document.createElement("div");
            el.innerHTML = html;
            const frag = document.createDocumentFragment();
            let node, lastNode;
            while ((node = el.firstChild)) {
                lastNode = frag.appendChild(node);
            }
            range.insertNode(frag);

            // Move cursor after the inserted content
            if (lastNode) {
                const newRange = document.createRange();
                newRange.setStartAfter(lastNode);
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);
            }

            // Sync body state
            const editor = document.querySelector('[contentEditable="true"]');
            if (editor) setBody(editor.innerHTML);
        } else {
            // Fallback: append to end
            setBody(prev => prev + html);
        }
    };

    const insertVariable = (variable) => {
        const html = `<span style="color: #2563eb; font-weight: 700; background: #eff6ff; padding: 2px 6px; border-radius: 4px;">{{${variable}}}</span>&nbsp;`;
        insertHTML(html);
    };

    const handleSend = () => {
        const payload = {
            recipients: recipients.map(r => r.email || r.mobile),
            subject,
            body,
            schedule: scheduleDate ? { date: scheduleDate, time: scheduleTime } : null,
            options: { addSignature, trackOpens }
        };
        console.log('Sending Mail Payload:', payload);
        onSend && onSend(payload);
        onClose();
    };

    if (!isOpen) return null;

    return createPortal(
        <div style={styles.overlay}>
            <style>
                {`
                @keyframes zoomIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                `}
            </style>
            <div style={styles.modal}>

                {/* Header */}
                <div style={styles.header}>
                    <div>
                        <h2 style={styles.title}>Send Mail</h2>
                        <p style={styles.subtitle}>Send email to <span style={{ fontWeight: 700, color: '#334155' }}>{recipients.length} selected contact(s)</span></p>
                    </div>
                    <button onClick={onClose} style={styles.closeBtn}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {/* Body */}
                <div style={styles.body}>

                    {/* Recipient Section */}
                    <div>
                        <label style={styles.label}>To:</label>
                        <div style={styles.inputContainer}>
                            {recipients.map((recipient, idx) => (
                                <div key={idx} style={styles.pill}>
                                    <div style={styles.pillAvatar}>
                                        {getInitials(recipient.name)}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={styles.pillText}>{recipient.name}</span>
                                        {recipient.email && (
                                            <span style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '-2px' }}>{recipient.email}</span>
                                        )}
                                    </div>
                                    {idx === 0 && recipients.length > 1 && (
                                        <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 500 }}>+{recipients.length - 1} others</span>
                                    )}
                                </div>
                            ))}
                            <input
                                type="text"
                                placeholder="Add more..."
                                style={styles.input}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginTop: '8px', paddingLeft: '4px' }}>
                            <span style={{ cursor: 'pointer', transition: 'color 0.2s' }} onMouseEnter={e => e.target.style.color = '#2563eb'} onMouseLeave={e => e.target.style.color = '#94a3b8'}>Cc</span>
                            <span style={{ cursor: 'pointer', transition: 'color 0.2s' }} onMouseEnter={e => e.target.style.color = '#2563eb'} onMouseLeave={e => e.target.style.color = '#94a3b8'}>Bcc</span>
                        </div>
                    </div>

                    {/* Subject Line */}
                    <div>
                        <label style={styles.label}>Subject</label>
                        <input
                            type="text"
                            style={styles.textInput}
                            placeholder="Enter email subject"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                        />
                    </div>

                    {/* Message Editor */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ ...styles.label, marginBottom: 0 }}>Message</label>

                            {/* Templates & Variables */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <select
                                    style={{ fontSize: '0.75rem', border: '1px solid #e2e8f0', borderRadius: '100px', padding: '4px 12px', outline: 'none', cursor: 'pointer', color: '#475569', maxWidth: '180px' }}
                                    value={selectedTemplate}
                                    onChange={(e) => {
                                        const templateId = e.target.value;
                                        setSelectedTemplate(templateId);
                                        if (templateId) {
                                            const tmpl = emailTemplates.find(t => t.id === parseInt(templateId));
                                            if (tmpl) {
                                                setSubject(tmpl.subject);
                                                setBody(tmpl.content);
                                                // If we have an editor div, sync it
                                                const editor = document.querySelector('[contentEditable="true"]');
                                                if (editor) editor.innerHTML = tmpl.content;
                                            }
                                        }
                                    }}
                                >
                                    <option value="">Select Template</option>
                                    {emailTemplates.map(tmpl => (
                                        <option key={tmpl.id} value={tmpl.id}>{tmpl.name}</option>
                                    ))}
                                </select>
                                <div style={{ width: '1px', height: '16px', backgroundColor: '#e2e8f0' }}></div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    {variables.slice(0, 3).map(v => (
                                        <button key={v.value} onClick={() => insertVariable(v.value)} style={styles.variablePill}>{v.label}</button>
                                    ))}
                                    <button style={{ ...styles.variablePill, backgroundColor: '#f1f5f9', color: '#64748b', borderColor: '#e2e8f0' }}>+ Variable</button>
                                </div>
                            </div>
                        </div>

                        <div style={styles.editor}>
                            {/* Toolbar */}
                            <div style={styles.toolbar}>
                                <button style={styles.toolBtn} title="Bold"><i className="fas fa-bold"></i></button>
                                <button style={styles.toolBtn} title="Italic"><i className="fas fa-italic"></i></button>
                                <button style={styles.toolBtn} title="Underline"><i className="fas fa-underline"></i></button>
                                <div style={{ width: '1px', height: '16px', backgroundColor: '#cbd5e1', margin: '0 4px' }}></div>
                                <button style={styles.toolBtn} title="List"><i className="fas fa-list-ul"></i></button>
                                <button style={styles.toolBtn} title="Ordered List"><i className="fas fa-list-ol"></i></button>
                                <div style={{ width: '1px', height: '16px', backgroundColor: '#cbd5e1', margin: '0 4px' }}></div>
                                <button style={styles.toolBtn} title="Link"><i className="fas fa-link"></i></button>
                                <button style={styles.toolBtn} title="Image"><i className="far fa-image"></i></button>
                            </div>
                            <div
                                contentEditable
                                style={{
                                    ...styles.textarea,
                                    minHeight: '200px',
                                    overflowY: 'auto'
                                }}
                                onInput={(e) => setBody(e.target.innerHTML)}
                                dangerouslySetInnerHTML={{ __html: body }}
                            />
                        </div>

                        {autoAttachments.length > 0 && (
                            <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <i className="fas fa-paperclip"></i> Auto-Attachments ({autoAttachments.length})
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {autoAttachments.map((att, idx) => (
                                        <div key={idx} style={{ position: 'relative', width: '70px', height: '54px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0', background: '#fff' }}>
                                            {att.type === 'image' ? (
                                                <img src={att.url} alt="attachment" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
                                                    <i className="fas fa-video" style={{ color: 'var(--primary-color)', fontSize: '1rem' }}></i>
                                                </div>
                                            )}
                                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '10px', padding: '1px 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>
                                                {att.name || 'Media'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Attachments */}
                    <button style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        fontSize: '0.875rem', fontWeight: 600, color: '#475569',
                        padding: '12px', border: '1px dashed #cbd5e1', borderRadius: '8px',
                        backgroundColor: '#fff', cursor: 'pointer', width: '100%', transition: 'background-color 0.2s'
                    }} onMouseEnter={e => e.target.style.backgroundColor = '#f8fafc'} onMouseLeave={e => e.target.style.backgroundColor = '#fff'}>
                        <i className="fas fa-paperclip"></i> Attach Files
                    </button>

                </div>

                {/* Footer */}
                <div style={styles.footer}>
                    <div style={{ display: 'flex', gap: '24px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={addSignature} onChange={() => setAddSignature(!addSignature)} style={{ accentColor: '#2563eb' }} />
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Add Signature</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={trackOpens} onChange={() => setTrackOpens(!trackOpens)} style={{ accentColor: '#2563eb' }} />
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Track Opens</span>
                        </label>
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button onClick={onClose} style={styles.btnCancel}>Cancel</button>
                        <button style={styles.btnSchedule}>
                            <i className="far fa-clock"></i> Schedule
                        </button>
                        <button
                            onClick={handleSend}
                            disabled={!subject || !body}
                            style={{ ...styles.btnSend, opacity: (!subject || !body) ? 0.5 : 1, cursor: (!subject || !body) ? 'not-allowed' : 'pointer' }}
                        >
                            <i className="fas fa-paper-plane"></i> Send Now
                        </button>
                    </div>
                </div>

            </div>
        </div>,
        document.body
    );
};

export default SendMailModal;
