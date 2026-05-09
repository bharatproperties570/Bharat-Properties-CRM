import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, User, Phone, CheckCircle2 } from 'lucide-react';
import { publicAPI } from '../utils/api';

const PublicChatWidget = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [sessionId, setSessionId] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    // Intake State
    const [isIdentified, setIsIdentified] = useState(false);
    const [userName, setUserName] = useState('');
    const [userMobile, setUserMobile] = useState('');
    const [showIntakeForm, setShowIntakeForm] = useState(false);

    const messagesEndRef = useRef(null);

    useEffect(() => {
        // Initialize session ID
        const storedSession = localStorage.getItem('bp_chat_session');
        if (storedSession) {
            setSessionId(storedSession);
            // Optionally load history from local storage here
            const history = localStorage.getItem(`bp_chat_history_${storedSession}`);
            if (history) {
                setMessages(JSON.parse(history));
            }
        } else {
            const newSession = 'sess_' + Math.random().toString(36).substring(2, 15);
            setSessionId(newSession);
            localStorage.setItem('bp_chat_session', newSession);
            
            // Initial greeting
            setMessages([
                { role: 'assistant', content: 'Hello! Welcome to Bharat Properties. How can I help you find your dream property today?' }
            ]);
        }

        // Check if already identified
        const storedMobile = localStorage.getItem('bp_chat_mobile');
        if (storedMobile) {
            setIsIdentified(true);
            setUserMobile(storedMobile);
            setUserName(localStorage.getItem('bp_chat_name') || '');
        }
    }, []);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
        if (messages.length > 0 && sessionId) {
            localStorage.setItem(`bp_chat_history_${sessionId}`, JSON.stringify(messages));
        }
    }, [messages, isOpen, sessionId]);

    const handleSend = async () => {
        if (!inputText.trim()) return;

        const newMsg = { role: 'user', content: inputText.trim() };
        setMessages(prev => [...prev, newMsg]);
        setInputText('');
        setIsLoading(true);

        try {
            // After 2 messages from user, ask for details if not identified
            const userMsgCount = messages.filter(m => m.role === 'user').length;
            if (userMsgCount === 1 && !isIdentified && !showIntakeForm) {
                setTimeout(() => {
                    setShowIntakeForm(true);
                    setMessages(prev => [...prev, { 
                        role: 'assistant', 
                        content: 'To serve you better and save your preferences, could you please share your name and mobile number?' 
                    }]);
                    setIsLoading(false);
                }, 1000);
                return; // Stop here, wait for them to fill the form or continue
            }

            // Normal flow
            const payload = {
                sessionId,
                message: newMsg.content,
                name: userName,
                mobile: userMobile
            };

            const response = await fetch('/api/webhooks/website-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            
            if (data.success && data.reply) {
                setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
            } else {
                setMessages(prev => [...prev, { role: 'assistant', content: "I'm sorry, I am having trouble connecting to my system right now. Please try again later." }]);
            }
        } catch (error) {
            console.error("Chat error:", error);
            setMessages(prev => [...prev, { role: 'assistant', content: "Network error. Please try again." }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleIntakeSubmit = (e) => {
        e.preventDefault();
        if (userMobile.length >= 10) {
            setIsIdentified(true);
            setShowIntakeForm(false);
            localStorage.setItem('bp_chat_mobile', userMobile);
            localStorage.setItem('bp_chat_name', userName);
            
            // Resume conversation with the server
            handleSendHiddenMsg(`User provided contact info: Name=${userName}, Mobile=${userMobile}`);
        }
    };

    const handleSendHiddenMsg = async (hiddenMsg) => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/webhooks/website-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    message: hiddenMsg,
                    name: userName,
                    mobile: userMobile
                })
            });
            const data = await response.json();
            if (data.success && data.reply) {
                setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
            }
        } catch (e) { }
        setIsLoading(false);
    };

    return (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 99999 }}>
            {/* Chat Button */}
            {!isOpen && (
                <button 
                    onClick={() => setIsOpen(true)}
                    style={{
                        width: '60px', height: '60px', borderRadius: '50%',
                        backgroundColor: '#10b981', color: 'white',
                        border: 'none', cursor: 'pointer',
                        boxShadow: '0 10px 25px rgba(16, 185, 129, 0.4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'transform 0.2s',
                    }}
                    onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
                    onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                    <MessageCircle size={30} />
                </button>
            )}

            {/* Chat Window */}
            {isOpen && (
                <div style={{
                    width: '350px', height: '550px', 
                    backgroundColor: '#fff', borderRadius: '16px',
                    boxShadow: '0 15px 35px rgba(0,0,0,0.2)',
                    display: 'flex', flexDirection: 'column',
                    overflow: 'hidden', border: '1px solid #e2e8f0'
                }}>
                    {/* Header */}
                    <div style={{
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        padding: '16px 20px', color: '#fff',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>AI Assistant</h3>
                            <span style={{ fontSize: '0.8rem', opacity: 0.9 }}>Bharat Properties</span>
                        </div>
                        <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
                            <X size={20} />
                        </button>
                    </div>

                    {/* Messages Area */}
                    <div style={{ flex: 1, padding: '16px', overflowY: 'auto', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {messages.map((msg, idx) => (
                            <div key={idx} style={{
                                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                maxWidth: '85%',
                                backgroundColor: msg.role === 'user' ? '#10b981' : '#fff',
                                color: msg.role === 'user' ? '#fff' : '#1e293b',
                                padding: '12px 16px',
                                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                                fontSize: '0.9rem',
                                lineHeight: '1.4',
                                border: msg.role === 'assistant' ? '1px solid #e2e8f0' : 'none'
                            }}>
                                {msg.content}
                            </div>
                        ))}

                        {/* Intake Form */}
                        {showIntakeForm && !isIdentified && (
                            <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', marginTop: '8px' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '12px' }}>Please provide your details:</div>
                                <form onSubmit={handleIntakeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: '8px', padding: '0 10px' }}>
                                        <User size={14} color="#64748b" />
                                        <input type="text" placeholder="Your Name" required value={userName} onChange={e => setUserName(e.target.value)} style={{ border: 'none', background: 'transparent', padding: '10px', width: '100%', outline: 'none', fontSize: '0.9rem' }} />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: '8px', padding: '0 10px' }}>
                                        <Phone size={14} color="#64748b" />
                                        <input type="tel" placeholder="Mobile Number" required value={userMobile} onChange={e => setUserMobile(e.target.value)} style={{ border: 'none', background: 'transparent', padding: '10px', width: '100%', outline: 'none', fontSize: '0.9rem' }} />
                                    </div>
                                    <button type="submit" style={{ background: '#10b981', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', marginTop: '4px' }}>
                                        Continue Chat
                                    </button>
                                </form>
                            </div>
                        )}

                        {isLoading && (
                            <div style={{ alignSelf: 'flex-start', backgroundColor: '#fff', padding: '12px 16px', borderRadius: '16px 16px 16px 4px', border: '1px solid #e2e8f0' }}>
                                <div className="typing-indicator" style={{ display: 'flex', gap: '4px' }}>
                                    <span style={{ width: '6px', height: '6px', background: '#cbd5e1', borderRadius: '50%', animation: 'bounce 1.4s infinite ease-in-out both' }}></span>
                                    <span style={{ width: '6px', height: '6px', background: '#cbd5e1', borderRadius: '50%', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.2s' }}></span>
                                    <span style={{ width: '6px', height: '6px', background: '#cbd5e1', borderRadius: '50%', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.4s' }}></span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div style={{ padding: '16px', borderTop: '1px solid #e2e8f0', backgroundColor: '#fff' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="text"
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="Type your message..."
                                disabled={showIntakeForm && !isIdentified}
                                style={{
                                    flex: 1, padding: '12px 16px', border: '1px solid #e2e8f0',
                                    borderRadius: '24px', outline: 'none', fontSize: '0.95rem',
                                    backgroundColor: (showIntakeForm && !isIdentified) ? '#f1f5f9' : '#fff'
                                }}
                            />
                            <button
                                onClick={handleSend}
                                disabled={!inputText.trim() || isLoading || (showIntakeForm && !isIdentified)}
                                style={{
                                    width: '44px', height: '44px', borderRadius: '50%',
                                    backgroundColor: (!inputText.trim() || (showIntakeForm && !isIdentified)) ? '#cbd5e1' : '#10b981',
                                    color: 'white', border: 'none', cursor: (!inputText.trim() || (showIntakeForm && !isIdentified)) ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'background-color 0.2s'
                                }}
                            >
                                <Send size={18} style={{ marginLeft: '2px' }} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <style>{`
                @keyframes bounce {
                    0%, 80%, 100% { transform: scale(0); }
                    40% { transform: scale(1); }
                }
            `}</style>
        </div>
    );
};

export default PublicChatWidget;
