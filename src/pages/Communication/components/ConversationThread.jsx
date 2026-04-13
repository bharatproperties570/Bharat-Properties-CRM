import React from 'react';
import './ConversationThread.css';

const ConversationThread = ({ messages, participantName, onClose }) => {
    if (!messages || messages.length === 0) {
        return (
            <div className="thread-empty">
                <i className="fas fa-comments-alt"></i>
                <p>No message history available.</p>
            </div>
        );
    }

    return (
        <div className="thread-container">
            <div className="thread-header">
                <div className="participant-info">
                    <div className="avatar-small">
                        {participantName?.charAt(0) || 'W'}
                    </div>
                    <div>
                        <h4>{participantName}</h4>
                        <span className="status-online">WhatsApp Live</span>
                    </div>
                </div>
                <button className="btn-close-thread" onClick={onClose}>
                    <i className="fas fa-times"></i>
                </button>
            </div>

            <div className="thread-body">
                {messages.map((msg, index) => (
                    <div key={index} className={`message-wrapper ${msg.sender === 'customer' ? 'inbound' : 'outbound'}`}>
                        <div className="message-bubble">
                            {msg.sender === 'ai' && (
                                <div className="bot-tag">
                                    <i className="fas fa-robot"></i> AI
                                </div>
                            )}
                            <div className="message-content">{msg.text}</div>
                            <div className="message-time">
                                {new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="thread-footer">
                <div className="reply-input-group">
                    <input type="text" placeholder="Type a message to take over..." disabled />
                    <button className="btn-send-disabled" title="AI is currently handling this chat">
                        <i className="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConversationThread;
