import { useState, useEffect } from 'react';
import { toast, Toaster } from 'react-hot-toast';
import { api } from '../../utils/api';

const PublicDealForm = ({ slug }) => {
    const [formConfig, setFormConfig] = useState(null);
    const [formData, setFormData] = useState({});
    const [status, setStatus] = useState('loading'); // loading, ready, submitting, success, error
    const [error, setError] = useState(null);
    const [inventoryData, setInventoryData] = useState({
        projects: [],
        blocks: [],
        units: [],
        relations: []
    });

    useEffect(() => {
        const fetchForm = async () => {
            try {
                setStatus('loading');
                const response = await api.get(`/deal-forms/public/${slug}`);
                setFormConfig(response.data.data);
                setStatus('ready');
            } catch (err) {
                setError(err.message || 'Form not found');
                setStatus('error');
            }
        };
        fetchForm();
    }, [slug]);

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

    useEffect(() => {
        if (status === 'ready') {
            fetchProjects();
            fetchRelations();
        }
    }, [status]);

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

    const fetchRelations = async () => {
        try {
            const res = await api.get('/deal-forms/public/inventory/relations');
            setInventoryData(prev => ({ ...prev, relations: res.data.data }));
        } catch (err) {
            console.error("Error fetching relations", err);
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

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Simple Validation
        const missingRequired = formConfig.sections.flatMap(s => s.fields)
            .filter(f => f.required && !formData[f.id]);

        if (missingRequired.length > 0) {
            toast.error(`Please fill in required fields: ${missingRequired.map(f => f.label).join(', ')}`);
            return;
        }

        try {
            setStatus('submitting');

            // Capture UTMs
            const urlParams = new URLSearchParams(window.location.search);
            const sourceMeta = {
                utm_source: urlParams.get('utm_source'),
                utm_medium: urlParams.get('utm_medium'),
                utm_campaign: urlParams.get('utm_campaign'),
                utm_term: urlParams.get('utm_term'),
                utm_content: urlParams.get('utm_content'),
                referrer: document.referrer,
                userAgent: navigator.userAgent
            };

            const response = await api.post(`/deal-forms/public/${slug}/submit`, {
                formData,
                sourceMeta
            });

            setStatus('success');
            if (response.data.redirectUrl) {
                setTimeout(() => {
                    window.location.href = response.data.redirectUrl;
                }, 2000);
            }
        } catch (err) {
            toast.error(err.message || 'Submission failed');
            setStatus('ready');
        }
    };

    if (status === 'loading') {
        return (
            <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }}></div>
                    <p style={{ marginTop: '16px', color: '#64748b', fontWeight: 600 }}>Loading Form...</p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
                <div style={{ textAlign: 'center', padding: '40px', background: '#fff', borderRadius: '24px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}>
                    <div style={{ color: '#ef4444', fontSize: '3rem', marginBottom: '16px' }}>
                        <i className="fas fa-exclamation-circle"></i>
                    </div>
                    <h2 style={{ margin: 0, color: '#1e293b' }}>Oops!</h2>
                    <p style={{ color: '#64748b', marginTop: '8px' }}>{error}</p>
                </div>
            </div>
        );
    }

    if (status === 'success') {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020617', padding: '20px' }}>
                <div style={{ textAlign: 'center', padding: '60px', background: 'rgba(30, 41, 59, 0.5)', backdropFilter: 'blur(16px)', borderRadius: '32px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', maxWidth: '500px' }}>
                    <div style={{ width: '80px', height: '80px', background: 'rgba(201, 146, 26, 0.1)', color: '#c9921a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', margin: '0 auto 24px', boxShadow: '0 0 20px rgba(201, 146, 26, 0.2)' }}>
                        <i className="fas fa-check"></i>
                    </div>
                    <h2 style={{ margin: 0, color: '#fff', fontSize: '1.75rem', fontWeight: 900, letterSpacing: '-0.02em' }}>Deal Captured!</h2>
                    <p style={{ color: '#94a3b8', marginTop: '16px', lineHeight: '1.6', fontSize: '1.1rem' }}>{formConfig.settings.successMessage}</p>
                    {formConfig.settings.redirectUrl && (
                        <p style={{ marginTop: '24px', color: '#64748b', fontSize: '0.9rem' }}>Redirecting you shortly...</p>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: '#020617', padding: '60px 20px', fontFamily: "'Inter', sans-serif" }}>
            <Toaster position="top-right" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
                body { margin: 0; padding: 0; }
                .public-glass-card {
                    background: rgba(30, 41, 59, 0.4);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 32px;
                    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
                }
                .form-input-premium {
                    background: rgba(15, 23, 42, 0.6);
                    border: 1px solid rgba(255,255,255,0.1);
                    color: #f8fafc;
                    transition: all 0.2s ease;
                }
                .form-input-premium:focus {
                    border-color: #c9921a;
                    box-shadow: 0 0 0 4px rgba(201, 146, 26, 0.15);
                    outline: none;
                }
                .form-input-premium:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
            `}</style>
            
            <div className="public-glass-card" style={{ maxWidth: '750px', margin: '0 auto', overflow: 'hidden' }}>

                {/* Header */}
                <div style={{ padding: '60px 40px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'linear-gradient(180deg, rgba(201,146,26,0.05) 0%, transparent 100%)' }}>
                    <h1 style={{ margin: 0, fontSize: '2.5rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.03em' }}>{formConfig.name}</h1>
                    {formConfig.description && (
                        <p style={{ margin: '16px 0 0', color: '#94a3b8', fontSize: '1.1rem', lineHeight: '1.6' }}>{formConfig.description}</p>
                    )}
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ padding: '40px' }}>
                    {formConfig.sections.map(section => (
                        <div key={section.id} style={{ marginBottom: '40px' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#c9921a', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <span style={{ width: '4px', height: '20px', background: '#c9921a', borderRadius: '2px', boxShadow: '0 0 10px #c9921a' }}></span>
                                {section.title}
                            </h3>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '28px' }}>
                                {section.fields.map(field => {
                                    // Conditional Logic for Relationship field
                                    if (field.mappingField === 'relationship') {
                                        const roleField = formConfig.sections.flatMap(s => s.fields).find(f => f.mappingField === 'role');
                                        if (formData[roleField?.id] !== 'Associate') return null;
                                    }

                                    return (
                                        <div key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {field.label}
                                            {field.required && <span style={{ color: '#ef4444', marginLeft: '4px' }}>*</span>}
                                        </label>

                                        {field.mappingField === 'projectName' ? (
                                            <select
                                                required={field.required}
                                                value={formData[field.id] || ""}
                                                onChange={e => handleInputChange(field.id, e.target.value)}
                                                className="form-input-premium"
                                                style={{ padding: '16px', borderRadius: '14px', fontSize: '1rem' }}
                                            >
                                                <option value="" style={{ background: '#1e293b' }}>Select Project</option>
                                                {inventoryData.projects.map(p => <option key={p} value={p} style={{ background: '#1e293b' }}>{p}</option>)}
                                            </select>
                                        ) : field.mappingField === 'block' ? (
                                            <select
                                                required={field.required}
                                                value={formData[field.id] || ""}
                                                onChange={e => handleInputChange(field.id, e.target.value)}
                                                className="form-input-premium"
                                                style={{ padding: '16px', borderRadius: '14px', fontSize: '1rem' }}
                                                disabled={!formData[formConfig.sections.flatMap(s => s.fields).find(f => f.mappingField === 'projectName')?.id]}
                                            >
                                                <option value="" style={{ background: '#1e293b' }}>Select Block</option>
                                                {inventoryData.blocks.map(b => <option key={b} value={b} style={{ background: '#1e293b' }}>{b}</option>)}
                                            </select>
                                        ) : field.mappingField === 'unitNo' ? (
                                            <select
                                                required={field.required}
                                                value={formData[field.id] || ""}
                                                onChange={e => handleInputChange(field.id, e.target.value)}
                                                className="form-input-premium"
                                                style={{ padding: '16px', borderRadius: '14px', fontSize: '1rem' }}
                                                disabled={!formData[formConfig.sections.flatMap(s => s.fields).find(f => f.mappingField === 'block')?.id]}
                                            >
                                                <option value="" style={{ background: '#1e293b' }}>Select Unit</option>
                                                {inventoryData.units.map(u => <option key={u} value={u} style={{ background: '#1e293b' }}>{u}</option>)}
                                            </select>
                                        ) : field.mappingField === 'relationship' ? (
                                            <select
                                                required={field.required}
                                                value={formData[field.id] || ""}
                                                onChange={e => handleInputChange(field.id, e.target.value)}
                                                className="form-input-premium"
                                                style={{ padding: '16px', borderRadius: '14px', fontSize: '1rem' }}
                                            >
                                                <option value="" style={{ background: '#1e293b' }}>Select Relationship</option>
                                                {inventoryData.relations.map(rel => <option key={rel} value={rel} style={{ background: '#1e293b' }}>{rel}</option>)}
                                            </select>
                                        ) : field.type === 'select' || field.type === 'multi-select' ? (
                                            <select
                                                required={field.required}
                                                multiple={field.type === 'multi-select'}
                                                value={formData[field.id] || (field.type === 'multi-select' ? [] : "")}
                                                onChange={e => handleInputChange(field.id, field.type === 'multi-select' ? Array.from(e.target.selectedOptions, option => option.value) : e.target.value)}
                                                className="form-input-premium"
                                                style={{ padding: '16px', borderRadius: '14px', fontSize: '1rem' }}
                                            >
                                                <option value="" style={{ background: '#1e293b' }}>Select an option</option>
                                                {field.options.map(opt => <option key={opt} value={opt} style={{ background: '#1e293b' }}>{opt}</option>)}
                                            </select>
                                        ) : field.type === 'radio' ? (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginTop: '4px' }}>
                                                {field.options.map(opt => (
                                                    <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '1rem', color: '#e2e8f0' }}>
                                                        <input
                                                            type="radio"
                                                            name={field.id}
                                                            value={opt}
                                                            checked={formData[field.id] === opt}
                                                            onChange={e => handleInputChange(field.id, e.target.value)}
                                                            required={field.required}
                                                            style={{ accentColor: '#c9921a' }}
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
                                                className="form-input-premium"
                                                style={{ padding: '16px', borderRadius: '14px', fontSize: '1rem' }}
                                            />
                                        )}
                                        {field.helpText && <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{field.helpText}</span>}
                                    </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {/* Remarks Section */}
                    <div style={{ marginBottom: '40px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Remarks / Special Instructions
                        </label>
                        <textarea
                            placeholder="Add any additional details or notes here..."
                            value={formData['remarks'] || ""}
                            onChange={e => setFormData(prev => ({ ...prev, remarks: e.target.value }))}
                            className="form-input-premium"
                            style={{ 
                                padding: '16px', 
                                borderRadius: '14px', 
                                fontSize: '1rem', 
                                minHeight: '120px',
                                resize: 'none'
                            }}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={status === 'submitting'}
                        style={{
                            width: '100%',
                            padding: '20px',
                            borderRadius: '16px',
                            border: 'none',
                            background: 'linear-gradient(135deg, #c9921a 0%, #b08014 100%)',
                            color: '#020617',
                            fontWeight: 900,
                            fontSize: '1.1rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            cursor: 'pointer',
                            marginTop: '20px',
                            boxShadow: '0 10px 25px -5px rgba(201, 146, 26, 0.4)',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '12px'
                        }}
                    >
                        {status === 'submitting' ? (
                            <><i className="fas fa-spinner fa-spin"></i> Submitting...</>
                        ) : (
                            <>Submit Deal Details <i className="fas fa-arrow-right"></i></>
                        )}
                    </button>
                </form>

                {/* Footer */}
                <div style={{ padding: '30px 40px', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        <i className="fas fa-shield-alt" style={{ color: '#c9921a' }}></i>
                        Bharat Properties Secure Deal Entry
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PublicDealForm;
