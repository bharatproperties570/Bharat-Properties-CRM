import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { toast, Toaster } from 'react-hot-toast';

const CaptureFormPage = ({ slug = 'professional-deal-capture' }) => {
    const [formConfig, setFormConfig] = useState(null);
    const [formData, setFormData] = useState({});
    const [status, setStatus] = useState('loading');
    const [inventoryData, setInventoryData] = useState({
        projects: [],
        blocks: [],
        units: []
    });

    useEffect(() => {
        const fetchForm = async () => {
            try {
                const response = await api.get(`/deal-forms/public/${slug}`);
                setFormConfig(response.data.data);
                setStatus('ready');
            } catch (err) {
                console.error("Error fetching form", err);
                toast.error("Form not found");
                setStatus('error');
            }
        };
        fetchForm();
    }, [slug]);

    useEffect(() => {
        if (status === 'ready') {
            fetchProjects();
        }
    }, [status]);

    // Fix for scrolling on standalone pages
    useEffect(() => {
        const originalOverflow = document.body.style.overflow;
        const originalHeight = document.body.style.height;

        document.body.style.overflow = 'auto';
        document.body.style.height = 'auto';

        return () => {
            document.body.style.overflow = originalOverflow;
            document.body.style.height = originalHeight;
        };
    }, []);

    const fetchProjects = async () => {
        try {
            const res = await api.get('/deal-forms/public/inventory/projects');
            setInventoryData(prev => ({ ...prev, projects: res.data.data }));
        } catch (err) {
            console.error("Error fetching projects", err);
        }
    };

    const fetchBlocks = async (projectName) => {
        try {
            const res = await api.get(`/deal-forms/public/inventory/blocks?projectName=${projectName}`);
            setInventoryData(prev => ({ ...prev, blocks: res.data.data, units: [] }));
        } catch (err) {
            console.error("Error fetching blocks", err);
        }
    };

    const fetchUnits = async (projectName, block) => {
        try {
            const res = await api.get(`/deal-forms/public/inventory/units?projectName=${projectName}&block=${block}`);
            setInventoryData(prev => ({ ...prev, units: res.data.data }));
        } catch (err) {
            console.error("Error fetching units", err);
        }
    };

    const handleInputChange = (fieldId, value) => {
        setFormData(prev => {
            const newData = { ...prev, [fieldId]: value };

            const field = formConfig.sections.flatMap(s => s.fields).find(f => f.id === fieldId);

            if (field?.mappingField === 'projectName') {
                const bField = formConfig.sections.flatMap(s => s.fields).find(f => f.mappingField === 'block');
                const uField = formConfig.sections.flatMap(s => s.fields).find(f => f.mappingField === 'unitNo');
                if (bField) newData[bField.id] = "";
                if (uField) newData[uField.id] = "";

                setInventoryData(prevInv => ({ ...prevInv, blocks: [], units: [] }));
                if (value) fetchBlocks(value);
            } else if (field?.mappingField === 'block') {
                const uField = formConfig.sections.flatMap(s => s.fields).find(f => f.mappingField === 'unitNo');
                if (uField) newData[uField.id] = "";

                setInventoryData(prevInv => ({ ...prevInv, units: [] }));
                const pField = formConfig.sections.flatMap(s => s.fields).find(f => f.mappingField === 'projectName');
                const pValue = newData[pField?.id];
                if (value && pValue) fetchUnits(pValue, value);
            }

            return newData;
        });
    };

    // Static field logic removed as requested

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus('submitting');

        try {
            await api.post(`/deal-forms/public/${slug}/submit`, {
                formData,
                sourceMeta: {
                    userAgent: navigator.userAgent,
                    referrer: document.referrer,
                    url: window.location.href
                }
            });

            setStatus('success');
            toast.success("Deal captured successfully!");
        } catch (err) {
            console.error("Submission error", err);
            toast.error(err.response?.data?.message || "Submission failed");
            setStatus('ready');
        }
    };

    if (status === 'loading') return <div className="loading-container">Loading form infrastructure...</div>;
    if (status === 'error') return <div className="error-container">Failed to load form. Please check the URL.</div>;

    if (status === 'success') {
        return (
            <div className="success-overlay" style={{
                height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#fff', textAlign: 'center'
            }}>
                <div style={{ padding: '60px', background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)', borderRadius: '40px', border: '1px solid rgba(255,255,255,0.1)', maxWidth: '600px' }}>
                    <div style={{ fontSize: '4rem', color: '#22c55e', marginBottom: '24px' }}>✓</div>
                    <h2 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '16px' }}>Mission Accomplished</h2>
                    <p style={{ fontSize: '1.2rem', color: '#94a3b8', lineHeight: '1.6' }}>{formConfig.settings.successMessage}</p>
                    <button onClick={() => window.location.reload()} style={{
                        marginTop: '40px', padding: '16px 32px', borderRadius: '16px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, cursor: 'pointer'
                    }}>Capture Another Deal</button>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            minHeight: '100vh',
            background: '#0f172a',
            backgroundImage: 'radial-gradient(circle at 0% 0%, rgba(59, 130, 246, 0.1) 0%, transparent 50%), radial-gradient(circle at 100% 100%, rgba(147, 51, 234, 0.1) 0%, transparent 50%)',
            padding: '60px 20px',
            fontFamily: "'Inter', sans-serif"
        }}>
            <Toaster position="top-right" />
            <div style={{
                maxWidth: '850px',
                margin: '0 auto',
                background: 'rgba(255, 255, 255, 0.02)',
                backdropFilter: 'blur(30px)',
                borderRadius: '40px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
                boxShadow: '0 50px 100px -20px rgba(0,0,0,0.5)'
            }}>
                <div style={{ padding: '60px 60px 40px 60px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
                        <div style={{ width: '40px', height: '4px', background: '#3b82f6', borderRadius: '2px' }}></div>
                        <span style={{ color: '#3b82f6', fontWeight: 800, letterSpacing: '2px', fontSize: '0.8rem', textTransform: 'uppercase' }}>Secure Deal Intake</span>
                    </div>
                    <h1 style={{ color: '#fff', fontSize: '2.5rem', fontWeight: 900, margin: 0 }}>{formConfig.name}</h1>
                    <p style={{ color: '#94a3b8', marginTop: '16px', fontSize: '1.1rem', maxWidth: '600px', lineHeight: '1.6' }}>{formConfig.description}</p>
                </div>

                <form onSubmit={handleSubmit} style={{ padding: '40px 60px' }}>
                    {formConfig.sections.map(section => (
                        <div key={section.id} style={{ marginBottom: '50px' }}>
                            <h3 style={{ color: '#f1f5f9', fontSize: '1.2rem', fontWeight: 800, marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ color: '#3b82f6' }}>#</span> {section.title}
                            </h3>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                                {section.fields.map(field => {
                                    // Conditional Logic for Relationship field
                                    if (field.mappingField === 'relationship') {
                                        const roleField = formConfig.sections.flatMap(s => s.fields).find(f => f.mappingField === 'role');
                                        if (formData[roleField?.id] !== 'Associate') return null;
                                    }

                                    return (
                                        <div key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <label style={{ color: '#94a3b8', fontSize: '0.9rem', fontWeight: 600 }}>
                                                {field.label} {field.required && <span style={{ color: '#ef4444' }}>*</span>}
                                            </label>

                                            {field.mappingField === 'projectName' ? (
                                                <select
                                                    required={field.required}
                                                    value={formData[field.id] || ""}
                                                    onChange={e => handleInputChange(field.id, e.target.value)}
                                                    className="premium-input"
                                                >
                                                    <option value="">Select Project</option>
                                                    {inventoryData.projects.map(p => <option key={p} value={p}>{p}</option>)}
                                                </select>
                                            ) : field.mappingField === 'block' ? (
                                                <select
                                                    required={field.required}
                                                    value={formData[field.id] || ""}
                                                    onChange={e => handleInputChange(field.id, e.target.value)}
                                                    disabled={!formData[formConfig.sections.flatMap(s => s.fields).find(f => f.mappingField === 'projectName')?.id]}
                                                    className="premium-input"
                                                >
                                                    <option value="">Select Block</option>
                                                    {inventoryData.blocks.map(b => <option key={b} value={b}>{b}</option>)}
                                                </select>
                                            ) : field.mappingField === 'unitNo' ? (
                                                <select
                                                    required={field.required}
                                                    value={formData[field.id] || ""}
                                                    onChange={e => handleInputChange(field.id, e.target.value)}
                                                    disabled={!formData[formConfig.sections.flatMap(s => s.fields).find(f => f.mappingField === 'block')?.id]}
                                                    className="premium-input"
                                                >
                                                    <option value="">Select Unit</option>
                                                    {inventoryData.units.map(u => <option key={u} value={u}>{u}</option>)}
                                                </select>
                                            ) : field.type === 'select' ? (
                                                <select
                                                    required={field.required}
                                                    value={formData[field.id] || ""}
                                                    onChange={e => handleInputChange(field.id, e.target.value)}
                                                    className="premium-input"
                                                >
                                                    <option value="">{field.placeholder || 'Select Answer'}</option>
                                                    {field.options && field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                </select>
                                            ) : field.type === 'radio' ? (
                                                <div style={{ display: 'flex', gap: '20px', padding: '10px 0' }}>
                                                    {field.options && field.options.map(opt => (
                                                        <label key={opt} style={{ color: '#f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <input
                                                                type="radio"
                                                                name={field.id}
                                                                value={opt}
                                                                checked={formData[field.id] === opt}
                                                                onChange={e => handleInputChange(field.id, e.target.value)}
                                                                required={field.required}
                                                                style={{ accentColor: '#3b82f6' }}
                                                            />
                                                            {opt}
                                                        </label>
                                                    ))}
                                                </div>
                                            ) : (
                                                <input
                                                    type={field.type === 'phone' ? 'tel' : field.type}
                                                    placeholder={field.placeholder}
                                                    required={field.required}
                                                    value={formData[field.id] || ""}
                                                    onChange={e => handleInputChange(field.id, e.target.value)}
                                                    className="premium-input"
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {/* Simple Footer Text */}

                    <button
                        type="submit"
                        disabled={status === 'submitting'}
                        style={{
                            width: '100%', padding: '24px', borderRadius: '20px', border: 'none',
                            background: '#3b82f6', color: '#fff', fontSize: '1.25rem', fontWeight: 900,
                            cursor: 'pointer', boxShadow: '0 20px 40px -10px rgba(59, 130, 246, 0.5)',
                            transition: 'all 0.3s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px'
                        }}
                    >
                        {status === 'submitting' ? 'PROCCESING...' : 'CAPTURE DEAL PROFESSIONALLY'}
                    </button>
                </form>

                <div style={{ padding: '30px 60px', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
                    <p style={{ color: '#475569', fontSize: '0.85rem', fontWeight: 500 }}>
                        Powered by Bharat Properties Enterprise Engine • Encrypted Connection
                    </p>
                </div>
            </div>

            <style>{`
                .premium-input {
                    padding: 16px 20px;
                    border-radius: 16px;
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    color: #fff;
                    font-size: 1rem;
                    outline: none;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    width: 100%;
                    box-sizing: border-box;
                }
                .premium-input:focus {
                    background: rgba(255, 255, 255, 0.05);
                    border-color: #3b82f6;
                    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
                }
                .premium-input::placeholder {
                    color: #475569;
                }
                select.premium-input option {
                    background: #1e293b;
                    color: #fff;
                    padding: 10px;
                }
                .loading-container, .error-container {
                    height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #0f172a;
                    color: #94a3b8;
                    font-family: 'Inter', sans-serif;
                    font-weight: 600;
                }
            `}</style>
        </div>
    );
};

export default CaptureFormPage;
