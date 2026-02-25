import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import LeadFormBuilder from '../../../components/LeadFormBuilder/LeadFormBuilder';

const LeadCaptureSettingsPage = () => {
    const [view, setView] = useState('list'); // 'list' or 'builder'
    const [forms, setForms] = useState([]);
    const [selectedForm, setSelectedForm] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showEmbedModal, setShowEmbedModal] = useState(false);

    useEffect(() => {
        fetchForms();
    }, []);

    const fetchForms = async () => {
        try {
            setIsLoading(true);
            const response = await axios.get('/api/lead-forms');
            setForms(response.data.data);
        } catch (error) {
            toast.error('Failed to fetch lead forms');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateNew = () => {
        setSelectedForm(null);
        setView('builder');
    };

    const handleEdit = (form) => {
        setSelectedForm(form);
        setView('builder');
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this form?')) return;
        try {
            await axios.delete(`/api/lead-forms/${id}`);
            toast.success('Form deleted');
            fetchForms();
        } catch (error) {
            toast.error('Failed to delete form');
        }
    };

    const handleSave = () => {
        setView('list');
        fetchForms();
    };

    const getEmbedCode = (slug) => {
        const publicUrl = window.location.origin + '/public/form/' + slug;
        return `<iframe src="${publicUrl}" width="100%" height="600px" frameborder="0"></iframe>`;
    };

    if (view === 'builder') {
        return (
            <LeadFormBuilder
                form={selectedForm}
                onSave={handleSave}
                onCancel={() => setView('list')}
            />
        );
    }

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff' }}>
            {/* Header */}
            <div style={{ padding: '32px 40px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>LEAD CAPTURE FORMS</h2>
                    <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: '0.9rem' }}>Build intelligent forms to capture and qualify leads automatically.</p>
                </div>
                <button
                    onClick={handleCreateNew}
                    style={{ background: 'var(--primary-color)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 15px -3px rgba(16, 185, 129, 0.4)' }}
                >
                    <i className="fas fa-plus"></i>
                    Create New Form
                </button>
            </div>

            {/* List View */}
            <div style={{ flex: 1, padding: '40px', overflowY: 'auto' }}>
                {isLoading ? (
                    <div style={{ textAlign: 'center', padding: '100px' }}>
                        <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', color: 'var(--primary-color)' }}></i>
                        <p style={{ marginTop: '16px', color: '#64748b' }}>Loading forms...</p>
                    </div>
                ) : forms.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '100px', background: '#f8fafc', borderRadius: '24px', border: '2px dashed #e2e8f0' }}>
                        <div style={{ width: '80px', height: '80px', background: '#fff', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: '2rem', color: '#94a3b8' }}>
                            <i className="fas fa-file-invoice"></i>
                        </div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>No Forms Created Yet</h3>
                        <p style={{ color: '#64748b', maxWidth: '400px', margin: '0 auto 24px' }}>Start building your first lead capture form to automate your prospecting workflow.</p>
                        <button
                            onClick={handleCreateNew}
                            style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '12px 24px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', color: '#1e293b' }}
                        >
                            Build First Form
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '24px' }}>
                        {forms.map(form => (
                            <div key={form._id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '20px', overflow: 'hidden', transition: 'all 0.3s ease', position: 'relative' }}>
                                <div style={{ padding: '24px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: form.isActive ? '#10b981' : '#94a3b8', background: form.isActive ? '#10b98115' : '#f1f5f9', padding: '4px 8px', borderRadius: '6px' }}>
                                            {form.isActive ? 'ACTIVE' : 'INACTIVE'}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button onClick={() => { setSelectedForm(form); setShowEmbedModal(true); }} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }} title="Embed Code">
                                                <i className="fas fa-code"></i>
                                            </button>
                                            <button onClick={() => window.open(`/public/form/${form.slug}`, '_blank')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }} title="Public View">
                                                <i className="fas fa-external-link-alt"></i>
                                            </button>
                                        </div>
                                    </div>

                                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>{form.name}</h3>
                                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>/{form.slug}</p>

                                    {/* Stats Grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginTop: '24px', padding: '16px', background: '#f8fafc', borderRadius: '12px' }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Views</div>
                                            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b' }}>{form.analytics?.views || 0}</div>
                                        </div>
                                        <div style={{ textAlign: 'center', borderLeft: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0' }}>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Leads</div>
                                            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b' }}>{form.analytics?.submissions || 0}</div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Conv.</div>
                                            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#10b981' }}>{form.analytics?.conversions || 0}%</div>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div style={{ marginTop: '24px', display: 'flex', gap: '8px' }}>
                                        <button
                                            onClick={() => handleEdit(form)}
                                            style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', color: '#1e293b', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                                        >
                                            Edit Builder
                                        </button>
                                        <button
                                            onClick={() => handleDelete(form._id)}
                                            style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #fee2e2', background: '#fff', color: '#ef4444', cursor: 'pointer' }}
                                        >
                                            <i className="far fa-trash-alt"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Embed Modal */}
            {showEmbedModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
                    <div style={{ background: '#fff', width: '600px', borderRadius: '24px', padding: '40px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>Embed Form</h2>
                            <i className="fas fa-times" style={{ cursor: 'pointer', color: '#94a3b8' }} onClick={() => setShowEmbedModal(false)}></i>
                        </div>

                        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '24px' }}>Copy this code to embed the form on your website or landing page.</p>

                        <div style={{ background: '#1e293b', padding: '24px', borderRadius: '16px', position: 'relative' }}>
                            <pre style={{ margin: 0, color: '#94a3b8', fontSize: '0.8rem', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                                {getEmbedCode(selectedForm?.slug)}
                            </pre>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(getEmbedCode(selectedForm?.slug));
                                    toast.success('Copied to clipboard');
                                }}
                                style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                                Copy
                            </button>
                        </div>

                        <div style={{ marginTop: '32px', display: 'flex', gap: '16px', alignItems: 'center', padding: '20px', background: '#f0fdf4', borderRadius: '16px', border: '1px solid #dcfce7' }}>
                            <div style={{ width: '40px', height: '40px', background: '#10b981', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                                <i className="fas fa-qrcode"></i>
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#14532d' }}>QR Code Access</div>
                                <div style={{ fontSize: '0.8rem', color: '#166534' }}>Download QR for offline site-visit capture.</div>
                            </div>
                            <button style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, fontSize: '0.8rem', cursor: 'not-allowed' }}>Download</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LeadCaptureSettingsPage;
