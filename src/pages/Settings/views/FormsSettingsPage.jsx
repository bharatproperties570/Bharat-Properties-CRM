import React from 'react';
import { LucideFileSignature, LucideStar } from 'lucide-react';

const FormsSettingsPage = ({ setActiveTab }) => {
    const forms = [
        {
            id: 'lead-capture',
            title: 'Lead Capture Forms',
            description: 'Create and manage intelligent forms for automatic lead generation and qualification.',
            icon: 'fa-file-invoice',
            color: '#10b981',
            badge: 'PROSPECTING'
        },
        {
            id: 'deal-capture',
            title: 'Deal Capture Forms',
            description: 'Build forms to record project and unit-level deal data via QR codes or shared links.',
            icon: <LucideFileSignature size={24} color="#6366f1" />,
            color: '#6366f1',
            badge: 'CONVERSION'
        },
        {
            id: 'feedback-forms',
            title: 'Site Visit Feedback',
            description: 'Create professional feedback surveys for customers after project site visits.',
            icon: <LucideStar size={24} color="#f59e0b" />,
            color: '#f59e0b',
            badge: 'FEEDBACK'
        }
    ];

    return (
        <div style={{ flex: 1, padding: '40px', background: '#f8fafc', overflowY: 'auto' }}>
            <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Forms Management</h2>
                <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '8px' }}>
                    Configure and deploy high-conversion forms to streamline your data intake across the sales cycle.
                </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
                {forms.map(form => (
                    <div 
                        key={form.id}
                        onClick={() => setActiveTab(form.id)}
                        style={{ 
                            background: '#fff', 
                            borderRadius: '24px', 
                            padding: '32px', 
                            border: '1px solid #e2e8f0',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            position: 'relative',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '20px'
                        }}
                        onMouseOver={e => {
                            e.currentTarget.style.transform = 'translateY(-4px)';
                            e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0,0,0,0.1)';
                            e.currentTarget.style.borderColor = form.color + '40';
                        }}
                        onMouseOut={e => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'none';
                            e.currentTarget.style.borderColor = '#e2e8f0';
                        }}
                    >
                        <div style={{ 
                            width: '56px', 
                            height: '56px', 
                            borderRadius: '16px', 
                            background: form.color + '15', 
                            color: form.color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.5rem'
                        }}>
                            {typeof form.icon === 'string' ? <i className={`fas ${form.icon}`}></i> : form.icon}
                        </div>

                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#1e293b' }}>{form.title}</h3>
                                <span style={{ 
                                    fontSize: '0.65rem', 
                                    fontWeight: 800, 
                                    background: form.color + '15', 
                                    color: form.color, 
                                    padding: '2px 8px', 
                                    borderRadius: '4px',
                                    letterSpacing: '0.5px'
                                }}>{form.badge}</span>
                            </div>
                            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem', lineHeight: '1.5' }}>
                                {form.description}
                            </p>
                        </div>

                        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '8px', color: form.color, fontWeight: 700, fontSize: '0.9rem' }}>
                            Configure Forms <i className="fas fa-arrow-right"></i>
                        </div>

                        <div style={{ 
                            position: 'absolute', 
                            top: '-20px', 
                            right: '-20px', 
                            width: '120px', 
                            height: '120px', 
                            borderRadius: '50%', 
                            background: form.color + '05', 
                            zIndex: 0 
                        }}></div>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: '48px', padding: '32px', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', borderRadius: '24px', color: '#fff' }}>
                <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                    <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
                        <i className="fas fa-lightbulb" style={{ color: '#fbbf24' }}></i>
                    </div>
                    <div>
                        <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Intelligent Form Deployment</h4>
                        <p style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: '0.9rem', maxWidth: '600px' }}>
                            You can embed these forms directly on your website using the iframe codes or share them as direct links. Every submission is automatically indexed and assigned according to your business rules.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FormsSettingsPage;
