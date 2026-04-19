import React, { useState } from 'react';
import './ConversationThread.css';

const ConversationThread = ({ messages, participantName, onClose, onSendMessage }) => {
    const [selectedChannel, setSelectedChannel] = useState('WhatsApp');
    const [replyText, setReplyText] = useState('');
    const [isSending, setIsSending] = useState(false);

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
        if (!replyText.trim() || isSending) return;
        setIsSending(true);
        try {
            await onSendMessage(replyText, selectedChannel);
            setReplyText('');
        } finally {
            setIsSending(false);
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
                            <div className="message-content">{msg.text}</div>
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
                    <input 
                        type="text" 
                        placeholder={`Reply via ${selectedChannel}...`} 
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyPress={handleKeyPress}
                        disabled={isSending}
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

