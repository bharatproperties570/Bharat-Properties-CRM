import React, { useState, useEffect } from 'react';
import { conversationAPI } from '../../../utils/api';
import { toast } from 'react-hot-toast';

const AIConversationsTab = () => {
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchConversations = async () => {
        try {
            const res = await conversationAPI.getActive();
            if (res.success && res.data) {
                // Map the backend Conversation model to the UI structure
                const mapped = res.data.map(conv => {
                    let leadName = 'Unmatched Contact';
                    let leadScore = 'N/A';
                    let phone = conv.phoneNumber || '';

                    if (conv.lead) {
                        leadName = `${conv.lead.firstName} ${conv.lead.lastName || ''}`.trim();
                        leadScore = conv.lead.intent_index > 75 ? 'Hot' : 'Warm';
                        phone = conv.lead.mobile || phone;
                    } else if (conv.contact) {
                        leadName = `${conv.contact.firstName} ${conv.contact.lastName || ''}`.trim();
                        leadScore = 'Contact';
                        phone = conv.contact.phones?.[0]?.number || phone;
                    }

                    return {
                        id: conv._id,
                        leadName: leadName,
                        phone: phone,
                        channel: conv.channel === 'whatsapp' ? 'WhatsApp' : conv.channel.toUpperCase(),
                        leadScore,
                        isMatched: !!(conv.lead || conv.contact),
                        budget: conv.lead?.customFields?.budget || 'Pending',
                        location: conv.lead?.customFields?.location || 'Pending',
                        intent: conv.lead?.customFields?.intent || 'Pending',
                        override: conv.status === 'handed_off',
                        messages: conv.messages.map(m => ({
                            sender: m.role === 'user' ? 'user' : 'ai',
                            text: m.content,
                            time: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        }))
                    };
                });
                setConversations(mapped);
            }
        } catch (error) {
            console.error('Failed to fetch AI conversations', error);
            toast.error('Failed to load live chats');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConversations();
        const interval = setInterval(fetchConversations, 10000); // Auto-refresh every 10s
        return () => clearInterval(interval);
    }, []);

    const handleOverride = async (id, currentOverrideState) => {
        try {
            const newStatus = currentOverrideState ? 'active' : 'handed_off';
            await conversationAPI.updateStatus(id, newStatus);
            setConversations(prev => prev.map(c => 
                c.id === id ? { ...c, override: !currentOverrideState } : c
            ));
            toast.success(currentOverrideState ? 'AI Resumed' : 'Human Operator Active');
        } catch (error) {
            toast.error('Failed to update status');
        }
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '20px', padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {conversations.map(conv => (
                    <div key={conv.id} style={{
                        background: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}>
                        {/* Header */}
                        <div style={{ 
                            padding: '12px 20px', 
                            background: '#f8fafc',
                            borderBottom: '1px solid #e2e8f0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <i className={`fab fa-${conv.channel.toLowerCase()}`} style={{ 
                                    color: conv.channel === 'WhatsApp' ? '#25D366' : '#3b82f6',
                                    fontSize: '1.2rem'
                                }}></i>
                                <div>
                                    <div style={{ fontWeight: 700, color: '#1e293b' }}>{conv.leadName}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                        <i className="fas fa-phone-alt" style={{ fontSize: '0.65rem', marginRight: '4px' }}></i>
                                        {conv.phone}
                                    </div>
                                </div>
                                <span style={{
                                    marginLeft: '10px',
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    background: conv.leadScore === 'Hot' ? '#fee2e2' : '#fef3c7',
                                    color: conv.leadScore === 'Hot' ? '#ef4444' : '#d97706'
                                }}>
                                    {conv.leadScore} Lead
                                </span>
                            </div>

                            <button
                                onClick={() => handleOverride(conv.id, conv.override)}
                                style={{
                                    padding: '6px 16px',
                                    background: conv.override ? '#f8fafc' : '#ef4444',
                                    color: conv.override ? '#64748b' : '#fff',
                                    border: conv.override ? '1px solid #cbd5e1' : 'none',
                                    borderRadius: '6px',
                                    fontWeight: 600,
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <i className={conv.override ? "fas fa-play" : "fas fa-hand-paper"}></i>
                                {conv.override ? 'AI Paused (Resume)' : 'Take Over'}
                            </button>
                        </div>

                        {/* Chat Stream */}
                        <div style={{ padding: '20px', minHeight: '200px', maxHeight: '400px', overflowY: 'auto', background: '#fcfcfc', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            {conv.messages.map((msg, index) => (
                                <div key={index} style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: msg.sender === 'user' ? 'flex-start' : 'flex-end',
                                    width: '100%'
                                }}>
                                    <div style={{
                                        maxWidth: '70%',
                                        padding: '10px 15px',
                                        borderRadius: '12px',
                                        background: msg.sender === 'user' ? '#fff' : '#eff6ff',
                                        border: msg.sender === 'user' ? '1px solid #e2e8f0' : '1px solid #bfdbfe',
                                        color: msg.sender === 'user' ? '#334155' : '#1e3a8a',
                                        borderBottomLeftRadius: msg.sender === 'user' ? '2px' : '12px',
                                        borderBottomRightRadius: msg.sender === 'ai' ? '2px' : '12px',
                                        position: 'relative'
                                    }}>
                                        {msg.sender === 'ai' && (
                                            <div style={{ 
                                                position: 'absolute', 
                                                top: '-10px', 
                                                right: '-10px',
                                                background: '#0ea5e9',
                                                color: '#fff',
                                                borderRadius: '50%',
                                                width: '20px',
                                                height: '20px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '0.6rem',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                            }}>
                                                <i className="fas fa-robot"></i>
                                            </div>
                                        )}
                                        <div style={{ fontSize: '0.9rem', lineHeight: '1.4' }}>{msg.text}</div>
                                        <div style={{ 
                                            fontSize: '0.65rem', 
                                            color: msg.sender === 'user' ? '#94a3b8' : '#60a5fa', 
                                            marginTop: '5px',
                                            textAlign: 'right'
                                        }}>
                                            {msg.time}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {conv.override && (
                                <div style={{ textAlign: 'center', margin: '15px 0' }}>
                                    <span style={{ background: '#f1f5f9', color: '#64748b', padding: '4px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>
                                        AI Paused. Human operator active.
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {conversations.length === 0 && !loading && (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#64748b', background: '#f8fafc', borderRadius: '12px' }}>
                        No active AI conversations currently.
                    </div>
                )}
                {loading && (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                        <i className="fas fa-spinner fa-spin"></i> Loading live chats...
                    </div>
                )}
            </div>

            {/* Context Sidebar */}
            <div style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '20px',
                height: 'fit-content'
            }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '1rem', color: '#1e293b' }}>
                    <i className="fas fa-database" style={{ color: '#0ea5e9', marginRight: '8px' }}></i>
                    CRM Context Engine
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '20px' }}>
                    Real-time data fields extracted by AI and auto-synced to CRM.
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9' }}>
                        <span style={{ color: '#64748b', fontWeight: 600 }}>Extracted Budget</span>
                        <span style={{ color: '#0f172a', fontWeight: 700 }}>₹ 30L</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9' }}>
                        <span style={{ color: '#64748b', fontWeight: 600 }}>Target Location</span>
                        <span style={{ color: '#0f172a', fontWeight: 700 }}>Kurukshetra Sec-8</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9' }}>
                        <span style={{ color: '#64748b', fontWeight: 600 }}>Captured Intent</span>
                        <span style={{ color: '#0ea5e9', fontWeight: 700 }}>Buy (Plot)</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9' }}>
                        <span style={{ color: '#64748b', fontWeight: 600 }}>Confidence Score</span>
                        <span style={{ color: '#10b981', fontWeight: 700 }}>98% (GPT-5)</span>
                    </div>
                </div>

                <button style={{
                    marginTop: '20px',
                    width: '100%',
                    padding: '10px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    color: '#0891b2',
                    fontWeight: 600,
                    cursor: 'pointer'
                }}>
                    Open Deal Profile
                </button>
            </div>
        </div>
    );
};

export default AIConversationsTab;
