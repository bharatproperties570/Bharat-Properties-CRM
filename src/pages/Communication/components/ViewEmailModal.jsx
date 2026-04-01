import { useState, useEffect, useCallback } from 'react';
import { emailAPI } from '../../../utils/api';

const ViewEmailModal = ({ isOpen, onClose, email, onReply, onConvertToLead, onAddActivity, isActionLoading }) => {
    const [content, setContent] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const fetchContent = useCallback(async () => {
        if (!email?.id) return;
        setIsLoading(true);
        try {
            const response = await emailAPI.getContent(email.id);
            if (response && response.success) {
                setContent(response.data);
            } else {
                setContent('Failed to load email content.');
            }
        } catch (error) {
            console.error('Error fetching email content:', error);
            setContent('An error occurred while loading the email.');
        } finally {
            setIsLoading(false);
        }
    }, [email?.id]);

    useEffect(() => {
        if (isOpen && email?.id) {
            fetchContent();
        }
    }, [isOpen, email?.id, fetchContent]);

    if (!isOpen || !email) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            <div style={{
                backgroundColor: '#fff',
                borderRadius: '16px',
                width: '900px',
                maxWidth: '95vw',
                height: '85vh',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                <div style={{
                    padding: '24px',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    background: '#f8fafc'
                }}>
                    <div style={{ flex: 1 }}>
                        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', lineHeight: '1.4' }}>
                            {email.subject || '(No Subject)'}
                        </h2>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px', fontSize: '0.85rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontWeight: 700, color: '#475569' }}>From:</span>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontWeight: 600, color: '#0f172a' }}>{email.fromName || email.participant}</span>
                                    <span style={{ color: '#64748b', fontSize: '0.75rem' }}>{email.fromEmail}</span>
                                </div>
                            </div>
                            <div style={{ height: '24px', width: '1px', background: '#e2e8f0' }}></div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontWeight: 700, color: '#475569' }}>Date:</span>
                                <span style={{ color: '#475569' }}>{email.date}</span>
                            </div>
                            {email.associated && (
                                <>
                                    <div style={{ height: '24px', width: '1px', background: '#e2e8f0' }}></div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontWeight: 700, color: '#0891b2' }}>Associated:</span>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontWeight: 700, color: '#0891b2' }}>{email.associated.name}</span>
                                            {email.associated.deal && (
                                                <span style={{ fontSize: '0.75rem', color: '#0e7490' }}>
                                                    {email.associated.deal.project} - {email.associated.deal.unit}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button 
                            onClick={() => onReply(email)}
                            style={{ 
                                padding: '8px 16px', 
                                borderRadius: '8px', 
                                border: '1px solid #e2e8f0', 
                                background: '#fff', 
                                color: '#475569', 
                                cursor: 'pointer', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px',
                                fontWeight: 600
                            }}
                        >
                            <i className="fas fa-reply"></i> Reply
                        </button>
                        {!email.associated ? (
                            <button 
                                onClick={() => onConvertToLead(email.id)}
                                disabled={isActionLoading === email.id}
                                style={{ 
                                    padding: '8px 16px', 
                                    borderRadius: '8px', 
                                    border: 'none', 
                                    background: '#059669', 
                                    color: '#fff', 
                                    cursor: 'pointer', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '8px',
                                    fontWeight: 600
                                }}
                            >
                                {isActionLoading === email.id ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-user-plus"></i>}
                                Create Lead
                            </button>
                        ) : (
                            <button 
                                onClick={() => onAddActivity(email.associated)}
                                style={{ 
                                    padding: '8px 16px', 
                                    borderRadius: '8px', 
                                    border: 'none', 
                                    background: '#6366f1', 
                                    color: '#fff', 
                                    cursor: 'pointer', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '8px',
                                    fontWeight: 600
                                }}
                            >
                                <i className="fas fa-calendar-plus"></i> Add Activity
                            </button>
                        )}
                        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.4rem', color: '#64748b', padding: '0 8px' }}>
                            <i className="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                <div style={{
                    flex: 1,
                    padding: '32px',
                    overflowY: 'auto',
                    backgroundColor: '#fff',
                    lineHeight: '1.6',
                    fontSize: '0.95rem',
                    color: '#334155'
                }}>
                    {isLoading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px', color: '#94a3b8' }}>
                            <i className="fas fa-spinner fa-spin fa-2x"></i>
                            <p>Loading email content...</p>
                        </div>
                    ) : (
                        <div
                            dangerouslySetInnerHTML={{ __html: content }}
                            style={{ 
                                wordBreak: 'break-word',
                                overflowWrap: 'break-word'
                            }}
                        />
                    )}
                </div>

                <div style={{
                    padding: '16px 24px',
                    borderTop: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    background: '#f8fafc'
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '10px 24px',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            background: '#fff',
                            color: '#475569',
                            fontWeight: 700,
                            cursor: 'pointer'
                        }}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ViewEmailModal;
