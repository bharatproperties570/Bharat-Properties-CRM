import { useState, useEffect } from 'react';
import { api } from '../../../utils/api';
import { toast } from 'react-hot-toast';
import { LucideFilePlus, LucidePlus, LucideEye, LucideTrash2, LucideCode, LucideLink, LucideChevronLeft, LucideDatabase, LucideX, LucideQrCode } from 'lucide-react';
import UniversalFormBuilder from '../../../components/UniversalFormBuilder';

const CustomFormsSettingsPage = ({ onBack }) => {
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
            const response = await api.get('/dynamic-forms?category=custom');
            setForms(response.data.data);
        } catch (error) {
            toast.error('Failed to fetch custom forms');
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
        if (!window.confirm('Delete this custom form?')) return;
        try {
            await api.delete(`/dynamic-forms/${id}`);
            toast.success('Form deleted');
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
                category="custom"
            />
        );
    }

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-card)' }}>
            {/* Header */}
            <div style={{ padding: '32px 40px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {onBack && (
                        <button onClick={onBack} style={{ width: '40px', height: '40px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                            <LucideChevronLeft size={20} />
                        </button>
                    )}
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)' }}>CUSTOM FORM BUILDER</h2>
                        <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Create any type of form for your unique business requirements.</p>
                    </div>
                </div>
                <button
                    onClick={handleCreateNew}
                    style={{ background: '#3b82f6', color: '#ffffff', border: 'none', padding: '12px 24px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 15px -3px rgba(59, 130, 246, 0.4)' }}
                >
                    <LucidePlus size={20} />
                    Create Custom Form
                </button>
            </div>

            {/* List View */}
            <div style={{ flex: 1, padding: '40px', overflowY: 'auto', background: 'var(--bg-light)' }}>
                {isLoading ? (
                    <div style={{ textAlign: 'center', padding: '100px' }}>
                        <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', color: '#3b82f6' }}></i>
                        <p style={{ marginTop: '16px', color: 'var(--text-muted)' }}>Loading custom forms...</p>
                    </div>
                ) : forms.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '100px', background: 'var(--bg-card)', borderRadius: '24px', border: '2px dashed rgba(148, 163, 184, 0.15)' }}>
                        <div style={{ width: '80px', height: '80px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: '2rem', color: '#3b82f6' }}>
                            <LucideDatabase size={40} />
                        </div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>No Custom Forms Yet</h3>
                        <p style={{ color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto 24px' }}>Build forms for surveys, internal check-lists, specialized lead capture, and more.</p>
                        <button
                            onClick={handleCreateNew}
                            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '12px 24px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', color: 'var(--text-main)' }}
                        >
                            Build First Custom Form
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '24px' }}>
                        {forms.map(form => (
                            <div key={form._id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '20px', overflow: 'hidden', transition: 'all 0.3s ease', position: 'relative' }}>
                                <div style={{ padding: '24px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: form.isActive ? '#3b82f6' : 'var(--text-muted)', background: form.isActive ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-light)', padding: '4px 8px', borderRadius: '6px' }}>
                                            {form.isActive ? 'ACTIVE' : 'DRAFT'}
                                        </div>
                                        <div style={{ display: 'flex', gap: '12px' }}>
                                            <button onClick={() => { setSelectedForm(form); setShowEmbedModal(true); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }} title="Embed Code">
                                                <LucideCode size={18} />
                                            </button>
                                            <button onClick={() => {
                                                const url = window.location.origin + '/public/form/' + form.slug;
                                                navigator.clipboard.writeText(url);
                                                toast.success('Public URL copied!');
                                            }} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: 0 }} title="Copy Link">
                                                <LucideLink size={18} />
                                            </button>
                                            <button onClick={() => window.open(`/public/form/${form.slug}`, '_blank')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }} title="Public View">
                                                <LucideEye size={18} />
                                            </button>
                                        </div>
                                    </div>

                                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>{form.name}</h3>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>{form.description || 'Custom business requirements form'}</p>
                                    <div style={{ fontSize: '0.75rem', color: '#3b82f6', fontWeight: 600, marginTop: '8px', background: 'rgba(59, 130, 246, 0.1)', padding: '4px 8px', borderRadius: '6px', display: 'inline-block' }}>
                                        /public/form/{form.slug}
                                    </div>

                                    <div style={{ marginTop: '24px', display: 'flex', gap: '8px' }}>
                                        <button onClick={() => handleEdit(form)} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>Edit Builder</button>
                                        <button onClick={() => handleDelete(form._id)} style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.15)', background: 'var(--bg-card)', color: '#ef4444', cursor: 'pointer' }}><LucideTrash2 size={18} /></button>
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
                            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>Embed Form</h2>
                            <LucideX style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowEmbedModal(false)} />
                        </div>

                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>Copy this code to embed this custom form on your internal dashboard or third-party site.</p>

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

                        <div style={{ marginTop: '32px', display: 'flex', gap: '16px', alignItems: 'center', padding: '20px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '16px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                            <div style={{ width: '40px', height: '40px', background: '#3b82f6', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff' }}>
                                <LucideQrCode size={20} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e3a8a' }}>QR Code Access</div>
                                <div style={{ fontSize: '0.8rem', color: '#1e40af' }}>Download a QR code to quickly share this form in offline settings.</div>
                            </div>
                            <button style={{ background: '#3b82f6', color: '#ffffff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, fontSize: '0.8rem', cursor: 'not-allowed' }}>Generate</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomFormsSettingsPage;

