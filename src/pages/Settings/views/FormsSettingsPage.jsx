
import React, { useState, useEffect } from 'react';
import { LucideFileSignature, LucideStar, LucidePlus, LucideSettings, LucideEye, LucideCopy, LucideTrash2, LucideCalendar, LucideCheckCircle, LucideMousePointer2 } from 'lucide-react';
import { api } from '../../../utils/api';
import { toast } from 'react-hot-toast';

const FormsSettingsPage = ({ setActiveTab }) => {
    const [view, setView] = useState('dashboard'); // 'dashboard' or 'builder'
    const [allForms, setAllForms] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const categories = [
        {
            id: 'lead-capture',
            title: 'Lead Capture',
            description: 'Forms for landing pages and PPC.',
            icon: 'fa-user-plus',
            color: '#10b981',
            badge: 'CRM'
        },
        {
            id: 'deal-capture',
            title: 'Deal Data',
            description: 'Capture unit and project details.',
            icon: 'fa-file-invoice-dollar',
            color: '#6366f1',
            badge: 'SALES'
        },
        {
            id: 'feedback-forms',
            title: 'Site Visit Feedback',
            description: 'Post-visit surveys and NPS.',
            icon: 'fa-star',
            color: '#f59e0b',
            badge: 'SERVICE'
        },
        {
            id: 'site-visit-schedule',
            title: 'Schedule Visit',
            description: 'Automate booking of project tours.',
            icon: 'fa-calendar-alt',
            color: '#ec4899',
            badge: 'BOOKING'
        },
        {
            id: 'custom-forms',
            title: 'Custom Forms',
            description: 'Build any form for any requirement.',
            icon: 'fa-tools',
            color: '#3b82f6',
            badge: 'FLEX'
        }
    ];

    useEffect(() => {
        fetchAllForms();
    }, []);

    const fetchAllForms = async () => {
        try {
            setIsLoading(true);
            const [leads, deals, feedbacks, dynamics] = await Promise.all([
                api.get('lead-forms'),
                api.get('deal-forms'),
                api.get('feedback-forms'),
                api.get('dynamic-forms')
            ]);

            const combined = [
                ...(leads.data.data || []).map(f => ({ ...f, type: 'Lead Capture', category: 'lead-capture', color: '#10b981' })),
                ...(deals.data.data || []).map(f => ({ ...f, type: 'Deal Capture', category: 'deal-capture', color: '#6366f1' })),
                ...(feedbacks.data.data || []).map(f => ({ ...f, type: 'Feedback', category: 'feedback-forms', color: '#f59e0b' })),
                ...(dynamics.data.data || []).map(f => ({ ...f, type: f.category === 'site_visit' ? 'Site Visit' : 'Custom', category: f.category === 'site_visit' ? 'site-visit-schedule' : 'custom-forms', color: f.category === 'site_visit' ? '#ec4899' : '#3b82f6' }))
            ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            setAllForms(combined);
        } catch (error) {
            console.error('Failed to fetch forms:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateNew = () => {
        setActiveTab('custom-forms');
    };

    const filteredForms = allForms.filter(f => 
        f.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div style={{ flex: 1, padding: '40px', background: '#f8fafc', overflowY: 'auto' }}>
            {/* Header Section */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
                <div>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1e293b', margin: 0, letterSpacing: '-0.5px' }}>Forms Management</h2>
                    <p style={{ color: '#64748b', fontSize: '0.95rem', marginTop: '8px' }}>
                        Design and deploy high-performance forms for every stage of your customer journey.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ position: 'relative' }}>
                        <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}></i>
                        <input 
                            type="text" 
                            placeholder="Search forms..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ padding: '12px 16px 12px 40px', borderRadius: '12px', border: '1px solid #e2e8f0', width: '250px', outline: 'none', fontSize: '0.9rem' }}
                        />
                    </div>
                    <button 
                        onClick={handleCreateNew}
                        style={{ background: '#0f172a', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', transition: 'all 0.2s' }}
                    >
                        <LucidePlus size={20} />
                        Add New Form
                    </button>
                </div>
            </div>

            {/* Stats Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '40px' }}>
                {[
                    { label: 'Total Forms', value: allForms.length, icon: 'fa-file-alt', color: '#3b82f6' },
                    { label: 'Total Submissions', value: allForms.reduce((acc, f) => acc + (f.analytics?.submissions || 0), 0), icon: 'fa-paper-plane', color: '#10b981' },
                    { label: 'Avg. Conversion', value: '18.4%', icon: 'fa-chart-line', color: '#6366f1' },
                    { label: 'Active Forms', value: allForms.filter(f => f.isActive).length, icon: 'fa-check-circle', color: '#f59e0b' }
                ].map((stat, i) => (
                    <div key={i} style={{ background: '#fff', padding: '20px', borderRadius: '20px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: stat.color + '15', color: stat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                            <i className={`fas ${stat.icon}`}></i>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>{stat.value}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Quick Create Grid */}
            <div style={{ marginBottom: '48px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <LucideSettings size={20} /> Quick Setup Templates
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                    {categories.map(cat => (
                        <div 
                            key={cat.id}
                            onClick={() => setActiveTab(cat.id)}
                            style={{ 
                                background: '#fff', 
                                borderRadius: '20px', 
                                padding: '24px', 
                                border: '1px solid #e2e8f0',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                                position: 'relative'
                            }}
                            onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.borderColor = cat.color; }}
                            onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                        >
                            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: cat.color + '15', color: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', marginBottom: '16px' }}>
                                <i className={`fas ${cat.icon}`}></i>
                            </div>
                            <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>{cat.title}</h4>
                            <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: '0.85rem', lineHeight: '1.5' }}>{cat.description}</p>
                            <div style={{ position: 'absolute', top: '16px', right: '16px', fontSize: '0.65rem', fontWeight: 800, background: cat.color + '15', color: cat.color, padding: '4px 10px', borderRadius: '6px' }}>{cat.badge}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Active Forms List */}
            <div style={{ background: '#fff', borderRadius: '24px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>Deployed Forms</h3>
                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Showing {filteredForms.length} total forms</div>
                </div>
                
                <div style={{ padding: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}>
                                <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Form Name</th>
                                <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Type</th>
                                <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Views</th>
                                <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Submissions</th>
                                <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Status</th>
                                <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredForms.map((form, i) => (
                                <tr key={i} style={{ borderBottom: i === filteredForms.length - 1 ? 'none' : '1px solid #f8fafc' }}>
                                    <td style={{ padding: '16px 24px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: form.color + '15', color: form.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <i className="fas fa-file-alt"></i>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>{form.name}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>/public/form/{form.slug}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '16px 24px' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px' }}>{form.type}</span>
                                    </td>
                                    <td style={{ padding: '16px 24px', fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>{form.analytics?.views || 0}</td>
                                    <td style={{ padding: '16px 24px', fontSize: '0.9rem', fontWeight: 700, color: '#10b981' }}>{form.analytics?.submissions || 0}</td>
                                    <td style={{ padding: '16px 24px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: form.isActive ? '#10b981' : '#94a3b8' }}></div>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: form.isActive ? '#10b981' : '#94a3b8' }}>{form.isActive ? 'Live' : 'Draft'}</span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                            <button style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="View Public"><LucideEye size={16} /></button>
                                            <button style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Copy Link"><LucideCopy size={16} /></button>
                                            <button onClick={() => setActiveTab(form.category)} style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#3b82f6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Edit"><LucideSettings size={16} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    
                    {filteredForms.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '64px', color: '#94a3b8' }}>
                            <i className="fas fa-inbox" style={{ fontSize: '2.5rem', opacity: 0.3, marginBottom: '16px' }}></i>
                            <p style={{ margin: 0, fontWeight: 600 }}>No forms found</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Tip */}
            <div style={{ marginTop: '40px', padding: '24px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', borderRadius: '20px', color: '#fff', display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fbbf24', fontSize: '1.2rem' }}>
                    <i className="fas fa-magic"></i>
                </div>
                <div>
                    <div style={{ fontWeight: 800, fontSize: '1rem' }}>Pro Tip: High Conversion Layouts</div>
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '4px' }}>Use multi-step layouts for long forms to increase completion rates by up to 35%. Every form is mobile-optimized by default.</div>
                </div>
            </div>
        </div>
    );
};

export default FormsSettingsPage;
