import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import DealFormBuilder from '../../../components/DealFormBuilder/DealFormBuilder';
import { api } from '../../../utils/api';

const DealCaptureSettingsPage = () => {
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
            const response = await api.get('/deal-forms');
            setForms(response.data.data);
        } catch (error) {
            toast.error('Failed to fetch deal forms');
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
            await api.delete(`/deal-forms/${id}`);
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
        const publicUrl = window.location.origin + '/public/deal/' + slug;
        return `<iframe src="${publicUrl}" width="100%" height="600px" frameborder="0"></iframe>`;
    };

    if (view === 'builder') {
        return (
            <DealFormBuilder
                key={selectedForm?._id || 'new'}
                form={selectedForm}
                onSave={handleSave}
                onCancel={() => setView('list')}
            />
        );
    }

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-card)' }}>
            {/* Header */}
            <div style={{ padding: '32px 40px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)' }}>DEAL CAPTURE FORMS</h2>
                    <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Build forms to capture deal info (Project, Unit, Price) via QR or Link.</p>
                </div>
                <button
                    onClick={handleCreateNew}
                    style={{ background: '#3b82f6', color: '#ffffff', border: 'none', padding: '12px 24px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 15px -3px rgba(59, 130, 246, 0.4)' }}
                >
                    <i className="fas fa-plus"></i>
                    Create New Form
                </button>
            </div>

            {/* List View */}
            <div style={{ flex: 1, padding: '40px', overflowY: 'auto' }}>
                {isLoading ? (
                    <div style={{ textAlign: 'center', padding: '100px' }}>
                        <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', color: '#3b82f6' }}></i>
                        <p style={{ marginTop: '16px', color: 'var(--text-muted)' }}>Loading forms...</p>
                    </div>
                ) : forms.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '100px', background: 'var(--bg-light)', borderRadius: '24px', border: '2px dashed #e2e8f0' }}>
                        <div style={{ width: '80px', height: '80px', background: 'var(--bg-card)', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: '2rem', color: 'var(--text-muted)' }}>
                            <i className="fas fa-handshake"></i>
                        </div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>No Deal Forms Yet</h3>
                        <p style={{ color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto 24px' }}>Start building your first deal capture form to collect project and unit details easily.</p>
                        <button
                            onClick={handleCreateNew}
                            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '12px 24px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', color: 'var(--text-main)' }}
                        >
                            Build First Form
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '24px' }}>
                        {forms.map(form => (
                            <div key={form._id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '20px', overflow: 'hidden', transition: 'all 0.3s ease', position: 'relative' }}>
                                <div style={{ padding: '24px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: form.isActive ? '#3b82f6' : 'var(--text-muted)', background: form.isActive ? '#3b82f615' : 'var(--bg-light)', padding: '4px 8px', borderRadius: '6px' }}>
                                            {form.isActive ? 'ACTIVE' : 'INACTIVE'}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button onClick={() => { setSelectedForm(form); setShowEmbedModal(true); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} title="Embed Code">
                                                <i className="fas fa-code"></i>
                                            </button>
                                            <button onClick={() => {
                                                const baseUrl = 'https://crm.bharatproperties.co';
                                                const smartUrl = `${baseUrl}/public/deal/${form.slug}?ref={{1}}`;
                                                navigator.clipboard.writeText(smartUrl);
                                                toast.success('Production Smart Link (CRM) copied!');
                                            }} style={{ background: 'none', border: 'none', color: '#c9921a', cursor: 'pointer', fontSize: '1.1rem', padding: 0 }} title="WhatsApp Smart Link">
                                                <i className="fab fa-whatsapp"></i>
                                            </button>
                                            <button onClick={() => window.open(`/capture/${form.slug}`, '_blank')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} title="Public View">
                                                <i className="fas fa-external-link-alt"></i>
                                            </button>
                                        </div>
                                    </div>

                                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>{form.name}</h3>
                                    <p style={{ fontSize: '0.85rem', color: '#3b82f6', fontWeight: 600, marginTop: '4px', background: '#eff6ff', padding: '4px 10px', borderRadius: '6px', display: 'inline-block' }}>/capture/{form.slug}</p>

                                    {/* Stats Grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginTop: '24px', padding: '16px', background: 'var(--bg-light)', borderRadius: '12px' }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Views</div>
                                            <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>{form.analytics?.views || 0}</div>
                                        </div>
                                        <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)' }}>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Deals</div>
                                            <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>{form.analytics?.submissions || 0}</div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Conv.</div>
                                            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#3b82f6' }}>{form.analytics?.conversions || 0}%</div>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div style={{ marginTop: '24px', display: 'flex', gap: '8px' }}>
                                        <button
                                            onClick={() => handleEdit(form)}
                                            style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                                        >
                                            Edit Builder
                                        </button>
                                        <button
                                            onClick={() => handleDelete(form._id)}
                                            style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #fee2e2', background: 'var(--bg-card)', color: '#ef4444', cursor: 'pointer' }}
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
                    <div style={{ background: 'var(--bg-card)', width: '600px', borderRadius: '24px', padding: '40px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>Embed Deal Form</h2>
                            <i className="fas fa-times" style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowEmbedModal(false)}></i>
                        </div>

                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>Copy this code to embed the form on your website or landing page.</p>

                        <div style={{ background: 'var(--text-main)', padding: '24px', borderRadius: '16px', position: 'relative' }}>
                            <pre style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.8rem', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                                {getEmbedCode(selectedForm?.slug)}
                            </pre>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(getEmbedCode(selectedForm?.slug));
                                    toast.success('Copied to clipboard');
                                }}
                                style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#ffffff', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                                Copy
                            </button>
                        </div>

                        <div style={{ marginTop: '32px', display: 'flex', gap: '16px', alignItems: 'center', padding: '20px', background: '#eff6ff', borderRadius: '16px', border: '1px solid #dbeafe' }}>
                            <div style={{ width: '40px', height: '40px', background: '#3b82f6', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff' }}>
                                <i className="fas fa-qrcode"></i>
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e3a8a' }}>QR Code Access</div>
                                <div style={{ fontSize: '0.8rem', color: '#1e40af' }}>Download QR for offline site-visit capture.</div>
                            </div>
                            <button style={{ background: '#3b82f6', color: '#ffffff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }} onClick={() => window.open(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(window.location.origin + '/public/deal/' + selectedForm?.slug)}`, '_blank')}>Download</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DealCaptureSettingsPage;
