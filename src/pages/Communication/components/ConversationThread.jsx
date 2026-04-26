import React, { useState } from 'react';
import './ConversationThread.css';

const ConversationThread = ({ messages, participantName, onClose, onSendMessage }) => {
    const [selectedChannel, setSelectedChannel] = useState('WhatsApp');
    const [replyText, setReplyText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [pendingFile, setPendingFile] = useState(null);

    if (!messages || messages.length === 0) {
        return (
            <div className="thread-empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', padding: '2rem', textAlign: 'center' }}>
                <i className="fas fa-comments" style={{ fontSize: '3rem', marginBottom: '1.5rem', opacity: 0.2 }}></i>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#475569' }}>Historical Continuity</h3>
                <p style={{ fontSize: '0.85rem' }}>Synchronizing past interactions for {participantName}. Select a thread to view live analytics.</p>
            </div>
        );
    }

    const handleSend = async () => {
        if (!replyText.trim() && !pendingFile && isSending) return;
        setIsSending(true);
        try {
            if (pendingFile) {
                await onSendMessage(replyText, selectedChannel, { type: pendingFile.type, file: pendingFile.file });
                setPendingFile(null);
            } else {
                await onSendMessage(replyText, selectedChannel);
            }
            setReplyText('');
        } finally {
            setIsSending(false);
        }
    };

    const triggerFileSelect = (type) => {
        const input = document.getElementById('chat-file-input');
        input.accept = type === 'image' ? 'image/*' : '*/*';
        input.click();
        setShowAttachMenu(false);
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const type = file.type.startsWith('image/') ? 'image' : 'document';
            setPendingFile({ file, type, name: file.name });
            setReplyText(`Sending ${file.name}...`);
        }
    };

    const handleSpecialAttach = (type) => {
        setShowAttachMenu(false);
        if (type === 'location') {
            // Mock Location for now, or trigger a modal
            onSendMessage('Sending location...', selectedChannel, { 
                type: 'location', 
                location: { latitude: 29.9695, longitude: 76.8783, name: 'Bharat Properties', address: 'Sector 4, Kurukshetra' } 
            });
        } else if (type === 'contact') {
            // Mock Contact
            onSendMessage('Sending contact card...', selectedChannel, {
                type: 'contacts',
                contacts: [{
                    name: { first_name: 'Bharat', last_name: 'Properties', formatted_name: 'Bharat Properties' },
                    phones: [{ phone: '919999999999', type: 'WORK' }]
                }]
            });
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') handleSend();
    };

    return (
        <div className="thread-container">
            {/* 🛡️ Console Header */}
            <div className="thread-header">
                <div className="participant-info">
                    <div className="avatar-small">
                        {participantName?.charAt(0) || 'P'}
                    </div>
                    <div>
                        <h4>{participantName}</h4>
                        <div className="status-label">
                            <span style={{ width: '6px', height: '6px', background: '#059669', borderRadius: '50%' }}></span>
                            Neural Bot Active
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn-close-thread" title="Minimize Hub">
                        <i className="fas fa-minus"></i>
                    </button>
                    <button className="btn-close-thread" onClick={onClose} title="Close Thread">
                        <i className="fas fa-times"></i>
                    </button>
                </div>
            </div>

            {/* 💬 Historical Stream */}
            <div className="thread-body">
                {messages.map((msg, index) => (
                    <div key={index} className={`message-wrapper ${msg.sender === 'customer' ? 'inbound' : 'outbound'}`}>
                        <div className="message-bubble">
                            {msg.sender === 'ai' ? (
                                <div className="bot-tag">
                                    <i className="fas fa-brain"></i> AI AGENT
                                </div>
                            ) : msg.sender === 'agent' ? (
                                <div className="bot-tag" style={{ background: '#059669' }}>
                                    <i className="fas fa-user-tie"></i> MANUAL REPLY
                                </div>
                            ) : null}
                            <div className="message-content">
                                {/* 🚀 Rich Media Renderer */}
                                {msg.metadata?.attachment && (
                                    <div style={{ marginBottom: msg.text ? '8px' : 0 }}>
                                        {msg.metadata.attachment.type === 'image' && (
                                            <img src={msg.metadata.attachment.url} alt="Shared" style={{ maxWidth: '100%', borderRadius: '8px', cursor: 'pointer', display: 'block' }} onClick={() => window.open(msg.metadata.attachment.url)} />
                                        )}
                                        {msg.metadata.attachment.type === 'video' && (
                                            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <i className="fas fa-play-circle" style={{ fontSize: '1.5rem' }}></i>
                                                <span>Video File</span>
                                            </div>
                                        )}
                                        {msg.metadata.attachment.type === 'document' && (
                                            <a href={msg.metadata.attachment.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '10px', color: msg.sender==='customer' ? '#cbd5e1' : '#fff', textDecoration: 'none', background: 'rgba(255,255,255,0.1)', padding: '8px', borderRadius: '6px' }}>
                                                <i className="fas fa-file-alt"></i>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{msg.metadata.attachment.filename || 'Document'}</span>
                                            </a>
                                        )}
                                        {msg.metadata.attachment.type === 'location' && (
                                            <div style={{ background: 'rgba(0,0,0,0.1)', borderRadius: '8px', overflow: 'hidden' }}>
                                                <div style={{ padding: '8px' }}>
                                                    <div style={{ fontWeight: 700, fontSize: '0.75rem' }}>📍 {msg.metadata.attachment.location?.name || 'Location Shared'}</div>
                                                    <div style={{ fontSize: '0.68rem', opacity: 0.8, marginTop: '2px' }}>{msg.metadata.attachment.location?.address}</div>
                                                </div>
                                                <a href={`https://www.google.com/maps/search/?api=1&query=${msg.metadata.attachment.location?.latitude},${msg.metadata.attachment.location?.longitude}`} target="_blank" rel="noreferrer" 
                                                    style={{ display: 'block', textAlign: 'center', padding: '6px', background: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: '0.7rem', fontWeight: 800, textDecoration: 'none' }}>
                                                    VIEW ON MAP
                                                </a>
                                            </div>
                                        )}
                                        {msg.metadata.attachment.type === 'contacts' && (
                                            <div style={{ background: 'rgba(255,255,255,0.1)', padding: '10px', borderRadius: '8px' }}>
                                                <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '4px' }}>👤 Contact Card</div>
                                                {msg.metadata.attachment.contacts?.map((c, idx) => (
                                                    <div key={idx} style={{ fontSize: '0.72rem' }}>
                                                        <div style={{ fontWeight: 600 }}>{c.name?.formatted_name}</div>
                                                        <div style={{ opacity: 0.8 }}>{c.phones?.[0]?.phone}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {msg.text}
                            </div>
                            <div className="message-time">
                                {new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                {msg.sender !== 'customer' && <i className="fas fa-check-double" style={{ color: '#0ea5e9', marginLeft: '4px' }}></i>}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* 🛠️ Enterprise Input Console */}
            <div className="thread-footer">
                <div className="channel-switcher">
                    {['WhatsApp', 'SMS', 'RCS', 'Email'].map(ch => (
                        <button 
                            key={ch} 
                            onClick={() => setSelectedChannel(ch)}
                            className={`channel-btn ${selectedChannel === ch ? 'active' : ''}`}
                        >
                            {ch}
                        </button>
                    ))}
                </div>
                
                <div className="console-input-group">
                    <div className="attachment-dropdown" style={{ position: 'relative' }}>
                        <button 
                            className="btn-attach" 
                            onClick={() => setShowAttachMenu(!showAttachMenu)}
                            title="Attach Media"
                        >
                            <i className="fas fa-plus"></i>
                        </button>
                        
                        {showAttachMenu && (
                            <div className="attach-menu">
                                <div className="attach-item" onClick={() => triggerFileSelect('image')}>
                                    <div className="attach-icon" style={{ background: '#ec4899' }}><i className="fas fa-image"></i></div>
                                    <span>Photo</span>
                                </div>
                                <div className="attach-item" onClick={() => triggerFileSelect('document')}>
                                    <div className="attach-icon" style={{ background: '#a855f7' }}><i className="fas fa-file-pdf"></i></div>
                                    <span>Document</span>
                                </div>
                                <div className="attach-item" onClick={() => handleSpecialAttach('contact')}>
                                    <div className="attach-icon" style={{ background: '#0ea5e9' }}><i className="fas fa-user"></i></div>
                                    <span>Contact</span>
                                </div>
                                <div className="attach-item" onClick={() => handleSpecialAttach('location')}>
                                    <div className="attach-icon" style={{ background: '#059669' }}><i className="fas fa-map-marker-alt"></i></div>
                                    <span>Location</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <input 
                        type="text" 
                        placeholder={`Reply via ${selectedChannel}...`} 
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyPress={handleKeyPress}
                        disabled={isSending}
                    />

                    {/* Hidden File Input */}
                    <input 
                        type="file" 
                        id="chat-file-input" 
                        style={{ display: 'none' }} 
                        onChange={handleFileChange}
                    />
                    <button 
                        className="btn-send-console" 
                        onClick={handleSend}
                        disabled={isSending}
                        title={`Send via ${selectedChannel}`}
                    >
                        {isSending ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-paper-plane"></i>}
                    </button>
                </div>
                <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '8px', textAlign: 'center' }}>
                    Agent Takeover Mode: AI will pause for 15 mins after manual response.
                </div>
            </div>
        </div>
    );
};

export default ConversationThread;

