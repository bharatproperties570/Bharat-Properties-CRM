import { useState, useEffect } from 'react';
import { api } from '../../../utils/api';
import { toast } from 'react-hot-toast';
import { LucideCalendar, LucidePlus, LucideEye, LucideTrash2, LucideCode, LucideLink, LucideChevronLeft, LucideX, LucideQrCode } from 'lucide-react';
import UniversalFormBuilder from '../../../components/UniversalFormBuilder';

const SiteVisitSettingsPage = ({ onBack }) => {
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
            const response = await api.get('/dynamic-forms?category=site_visit');
            setForms(response.data.data);
        } catch (error) {
            toast.error('Failed to fetch site visit forms');
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
        if (!window.confirm('Delete this scheduler?')) return;
        try {
            await api.delete(`/dynamic-forms/${id}`);
            toast.success('Scheduler deleted');
            fetchForms();
        } catch (error) {
            toast.error('Delete failed');
        }
    };

    const getEmbedCode = (slug) => {
        const publicUrl = window.location.origin + '/public/form/' + slug;
        return `<iframe src="${publicUrl}" width="100%" height="600px" frameborder="0"></iframe>`;
    };

    if (view === 'builder') {
        return (
            <UniversalFormBuilder 
                form={selectedForm} 
                onSave={() => { setView('list'); fetchForms(); }}
                onCancel={() => setView('list')}
                category="site_visit"
            />
        );
    }

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff' }}>
            {/* Header */}
            <div style={{ padding: '32px 40px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {onBack && (
                        <button onClick={onBack} style={{ width: '40px', height: '40px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                            <LucideChevronLeft size={20} />
                        </button>
                    )}
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>SITE VISIT SCHEDULING</h2>
                        <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: '0.9rem' }}>Automate project tours and site-visit bookings with intelligent scheduling forms.</p>
                    </div>
                </div>
                <button
                    onClick={handleCreateNew}
                    style={{ background: '#ec4899', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 15px -3px rgba(236, 72, 153, 0.4)' }}
                >
                    <LucidePlus size={20} />
                    New Scheduler Form
                </button>
            </div>

            {/* List View */}
            <div style={{ flex: 1, padding: '40px', overflowY: 'auto', background: '#f8fafc' }}>
                {isLoading ? (
                    <div style={{ textAlign: 'center', padding: '100px' }}>
                        <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', color: '#ec4899' }}></i>
                        <p style={{ marginTop: '16px', color: '#64748b' }}>Loading schedulers...</p>
                    </div>
                ) : forms.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '100px', background: '#fff', borderRadius: '24px', border: '2px dashed #e2e8f0' }}>
                        <div style={{ width: '80px', height: '80px', background: '#fdf2f8', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: '2rem', color: '#ec4899' }}>
                            <LucideCalendar size={40} />
                        </div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>No Schedulers Created</h3>
                        <p style={{ color: '#64748b', maxWidth: '400px', margin: '0 auto 24px' }}>Create your first site visit booking form and share it with your prospects via WhatsApp or Email.</p>
                        <button
                            onClick={handleCreateNew}
                            style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '12px 24px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', color: '#1e293b' }}
                        >
                            Build Scheduling Form
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '24px' }}>
                        {forms.map(form => (
                            <div key={form._id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '20px', overflow: 'hidden', transition: 'all 0.3s ease', position: 'relative' }}>
                                <div style={{ padding: '24px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: form.isActive ? '#ec4899' : '#94a3b8', background: form.isActive ? '#fdf2f8' : '#f1f5f9', padding: '4px 8px', borderRadius: '6px' }}>
                                            {form.isActive ? 'ACTIVE' : 'DRAFT'}
                                        </div>
                                        <div style={{ display: 'flex', gap: '12px' }}>
                                            <button onClick={() => { setSelectedForm(form); setShowEmbedModal(true); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }} title="Embed Code">
                                                <LucideCode size={18} />
                                            </button>
                                            <button onClick={() => {
                                                const baseUrl = 'https://bharatproperties.co';
                                                const smartUrl = `${baseUrl}/public/form/${form.slug}?ref={{1}}`;
                                                navigator.clipboard.writeText(smartUrl);
                                                toast.success('Production Smart Link copied! Ready for Meta Template.');
                                            }} style={{ background: 'none', border: 'none', color: '#c9921a', cursor: 'pointer', padding: 0 }} title="WhatsApp Smart Link">
                                                <i className="fab fa-whatsapp" style={{ fontSize: '1.1rem' }}></i>
                                            </button>
                                            <button onClick={() => window.open(`/public/form/${form.slug}`, '_blank')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }} title="Public View">
                                                <i className="fas fa-external-link-alt"></i>
                                            </button>
                                        </div>
                                    </div>

                                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>{form.name}</h3>
                                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>{form.description || 'Project Site Visit Booking'}</p>
                                    <div style={{ fontSize: '0.75rem', color: '#ec4899', fontWeight: 600, marginTop: '8px', background: '#fdf2f8', padding: '4px 8px', borderRadius: '6px', display: 'inline-block' }}>
                                        /public/form/{form.slug}
                                    </div>

                                    <div style={{ marginTop: '24px', display: 'flex', gap: '8px' }}>
                                        <button onClick={() => handleEdit(form)} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', color: '#1e293b', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>Edit Config</button>
                                        <button onClick={() => handleDelete(form._id)} style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #fee2e2', background: '#fff', color: '#ef4444', cursor: 'pointer' }}><LucideTrash2 size={18} /></button>
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
                            <LucideX style={{ cursor: 'pointer', color: '#94a3b8' }} onClick={() => setShowEmbedModal(false)} />
                        </div>

                        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '24px' }}>Copy this code to embed the site visit scheduler on your website or project landing page.</p>

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

                        <div style={{ marginTop: '32px', display: 'flex', gap: '16px', alignItems: 'center', padding: '20px', background: '#fdf2f8', borderRadius: '16px', border: '1px solid #fbcfe8' }}>
                            <div style={{ width: '40px', height: '40px', background: '#ec4899', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                                <LucideQrCode size={20} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#831843' }}>QR Code Access</div>
                                <div style={{ fontSize: '0.8rem', color: '#9d174d' }}>Print this QR code at your site office for quick visitor check-ins.</div>
                            </div>
                            <button style={{ background: '#ec4899', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, fontSize: '0.8rem', cursor: 'not-allowed' }}>Generate</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SiteVisitSettingsPage;

