import React, { useState } from 'react';
import AddContactModal from '../components/AddContactModal';
import SendMailModal from '../components/SendMailModal';

const FormsHubView = () => {
    const [isAddContactModalOpen, setIsAddContactModalOpen] = useState(false);
    const [isSendMailOpen, setIsSendMailOpen] = useState(false);

    const handleAddContact = (contactData) => {
        console.log('New contact:', contactData);
        alert('Contact added successfully!');
        setIsAddContactModalOpen(false);
    };

    const formsList = [
        { id: 'add-contact', label: 'Add Contact', icon: 'fa-user-plus', description: 'Create a new contact with detailed information' },
        { id: 'add-user', label: 'Add User', icon: 'fa-user-shield', description: 'Add a new user to the system' },
        { id: 'add-lead', label: 'Add Lead', icon: 'fa-filter', description: 'Create a new lead entry' },
        { id: 'add-deal', label: 'Add Deal', icon: 'fa-handshake', description: 'Create a new deal' },
        { id: 'add-property', label: 'Add Property', icon: 'fa-building', description: 'Add a new property to inventory' },
        { id: 'send-email', label: 'Send Email', icon: 'fa-envelope', description: 'Compose and send emails to contacts' }
    ];
    return (
        <>
            <section id="formsHubView" className="view-section active" style={{ display: 'flex', flexDirection: 'row', overflow: 'hidden', height: '100%', flex: 1 }}>
                {/* Sidebar */}
                <div className="profile-side-nav" style={{ width: '240px', background: '#f8fafc', borderRight: '1px solid #e2e8f0', height: '100%', overflowY: 'auto', padding: '24px 0', flexShrink: 0 }}>
                    <div style={{ marginBottom: '24px' }}>
                        <div style={{ padding: '0 24px 8px 24px', fontSize: '0.75rem', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>MANAGEMENT</div>
                        <div className="nav-items-group">
                            {formsList.map(form => (
                                <div
                                    key={form.id}
                                    onClick={() => {
                                        if (form.id === 'add-contact') {
                                            setIsAddContactModalOpen(true);
                                        } else if (form.id === 'send-email') {
                                            setIsSendMailOpen(true);
                                        }
                                    }}
                                    style={{
                                        padding: '8px 24px',
                                        fontSize: '0.85rem',
                                        fontWeight: 500,
                                        color: '#64748b',
                                        background: 'transparent',
                                        cursor: (form.id === 'add-contact' || form.id === 'send-email') ? 'pointer' : 'default',
                                        borderLeft: '4px solid transparent',
                                        transition: 'all 0.2s',
                                        opacity: (form.id === 'add-contact' || form.id === 'send-email') ? 1 : 0.6
                                    }}
                                >
                                    {form.label}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>
                    {/* Header */}
                    <div style={{ padding: '32px 40px 0 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--primary-color)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>FORMS</div>
                            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Forms Management</h1>
                        </div>
                    </div>

                    {/* Forms Grid */}
                    <div style={{ flex: 1, padding: '32px 40px', overflow: 'auto' }}>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                            gap: '24px'
                        }}>
                            {formsList.map(form => {
                                const isAddContact = form.id === 'add-contact';
                                const isSendMail = form.id === 'send-email';
                                const isClickable = isAddContact || isSendMail;
                                return (
                                    <div
                                        key={form.id}
                                        onClick={() => {
                                            if (isAddContact) {
                                                setIsAddContactModalOpen(true);
                                            } else if (isSendMail) {
                                                setIsSendMailOpen(true);
                                            }
                                        }}
                                        style={{
                                            background: '#fff',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '12px',
                                            padding: '24px',
                                            cursor: isClickable ? 'pointer' : 'default',
                                            transition: 'all 0.2s',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                            opacity: isClickable ? 1 : 0.6
                                        }}
                                        onMouseEnter={(e) => {
                                            if (isClickable) {
                                                e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.1)';
                                                e.currentTarget.style.transform = 'translateY(-2px)';
                                                e.currentTarget.style.borderColor = 'var(--primary-color)';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
                                            e.currentTarget.style.transform = 'translateY(0)';
                                            e.currentTarget.style.borderColor = '#e2e8f0';
                                        }}
                                    >
                                        <div style={{
                                            width: '48px',
                                            height: '48px',
                                            borderRadius: '12px',
                                            background: 'var(--primary-color)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            marginBottom: '16px'
                                        }}>
                                            <i className={`fas ${form.icon}`} style={{ fontSize: '1.2rem', color: '#fff' }}></i>
                                        </div>
                                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>{form.label}</h3>
                                        <p style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: '1.4', marginBottom: '12px' }}>{form.description}</p>
                                        {!isAddContact && form.id !== 'send-email' && (
                                            <div style={{
                                                display: 'inline-block',
                                                background: '#f1f5f9',
                                                color: '#475569',
                                                fontSize: '0.7rem',
                                                fontWeight: 600,
                                                padding: '4px 8px',
                                                borderRadius: '4px',
                                                textTransform: 'uppercase'
                                            }}>
                                                Coming Soon
                                            </div>
                                        )}
                                        {isAddContact && (
                                            <div style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                color: 'var(--primary-color)',
                                                fontSize: '0.8rem',
                                                fontWeight: 600
                                            }}>
                                                Open Form <i className="fas fa-arrow-right" style={{ fontSize: '0.7rem' }}></i>
                                            </div>
                                        )}
                                        {isSendMail && (
                                            <div style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                color: 'var(--primary-color)',
                                                fontSize: '0.8rem',
                                                fontWeight: 600
                                            }}>
                                                Open Form <i className="fas fa-arrow-right" style={{ fontSize: '0.7rem' }}></i>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Info Section */}
                        <div style={{
                            marginTop: '40px',
                            padding: '24px',
                            background: '#f8fafc',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0'
                        }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', marginBottom: '12px' }}>
                                <i className="fas fa-info-circle" style={{ color: 'var(--primary-color)', marginRight: '8px' }}></i>
                                About Forms
                            </h3>
                            <p style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: '1.6' }}>
                                Forms allow you to create and manage different types of data entries in your CRM. Each form is designed to capture specific information relevant to its category. Click on any available form card to open and start entering data.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Add Contact Modal */}
            <AddContactModal
                isOpen={isAddContactModalOpen}
                onClose={() => setIsAddContactModalOpen(false)}
                onAdd={handleAddContact}
            />

            {/* Send Mail Modal */}
            <SendMailModal
                isOpen={isSendMailOpen}
                onClose={() => setIsSendMailOpen(false)}
                recipients={[]} // Empty for new form
                onSend={(payload) => {
                    alert('Email sent successfully!');
                }}
            />
        </>
    );
};

export default FormsHubView;
