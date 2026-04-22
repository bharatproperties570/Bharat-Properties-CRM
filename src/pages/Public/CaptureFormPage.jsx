import { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { toast, Toaster } from 'react-hot-toast';

const CaptureFormPage = ({ slug = 'professional-deal-capture' }) => {
    const [formConfig, setFormConfig] = useState(null);
    const [formData, setFormData] = useState({});
    const [status, setStatus] = useState('loading');
    const [inventoryData, setInventoryData] = useState({
        projects: [],
        blocks: [],
        units: [],
        relations: []
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
            fetchRelations();
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
                background: '#f8fafc', color: '#0f172a', textAlign: 'center', padding: '20px'
            }}>
                <div className="success-card" style={{ padding: '60px', background: '#ffffff', borderRadius: '40px', border: '1px solid #e2e8f0', boxShadow: '0 20px 40px -10px rgba(0,0,0,0.05)', maxWidth: '600px', width: '100%', boxSizing: 'border-box' }}>
                    <div style={{ fontSize: '4rem', color: '#22c55e', marginBottom: '24px' }}>✓</div>
                    <h2 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '16px' }}>Mission Accomplished</h2>
                    <p style={{ fontSize: '1.2rem', color: '#475569', lineHeight: '1.6' }}>{formConfig.settings?.successMessage || 'Deal captured successfully!'}</p>
                    <button onClick={() => window.location.reload()} style={{
                        marginTop: '40px', padding: '16px 32px', borderRadius: '16px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, cursor: 'pointer', width: '100%', maxWidth: '300px'
                    }}>Capture Another Deal</button>
                </div>
            </div>
        );
    }

    return (
        <div className="capture-wrapper">
            <Toaster position="top-right" />
            <div className="capture-card">
                <div className="capture-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px', justifyContent: 'center' }}>
                        <div style={{ width: '40px', height: '4px', background: '#3b82f6', borderRadius: '2px' }}></div>
                        <span style={{ color: '#3b82f6', fontWeight: 800, letterSpacing: '2px', fontSize: '0.8rem', textTransform: 'uppercase' }}>Secure Deal Intake</span>
                    </div>
                    <h1 className="capture-title">{formConfig.name}</h1>
                    <p className="capture-desc">{formConfig.description}</p>
                </div>

                <form onSubmit={handleSubmit} className="capture-form-body">
                    {formConfig.sections.map(section => (
                        <div key={section.id} style={{ marginBottom: '50px' }}>
                            <h3 style={{ color: '#0f172a', fontSize: '1.2rem', fontWeight: 800, marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ color: '#3b82f6' }}>#</span> {section.title}
                            </h3>

                            <div className="capture-grid">
                                {section.fields.map(field => {
                                    // Conditional Logic for Relationship field
                                    if (field.mappingField === 'relationship') {
                                        const roleField = formConfig.sections.flatMap(s => s.fields).find(f => f.mappingField === 'role');
                                        if (formData[roleField?.id] !== 'Associate') return null;
                                    }

                                    return (
                                        <div key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <label style={{ color: '#475569', fontSize: '0.9rem', fontWeight: 600 }}>
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
                                            ) : field.mappingField === 'relationship' ? (
                                                <select
                                                    required={field.required}
                                                    value={formData[field.id] || ""}
                                                    onChange={e => handleInputChange(field.id, e.target.value)}
                                                    className="premium-input"
                                                >
                                                    <option value="">Select Relationship</option>
                                                    {inventoryData.relations.map(rel => <option key={rel} value={rel}>{rel}</option>)}
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
                                                        <label key={opt} style={{ color: '#0f172a', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
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

                    {/* Remarks Section */}
                    <div style={{ marginBottom: '50px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <label style={{ color: '#475569', fontSize: '0.9rem', fontWeight: 600 }}>
                            Remarks / Special Instructions
                        </label>
                        <textarea
                            placeholder="Add any additional details or notes here..."
                            value={formData['remarks'] || ""}
                            onChange={e => setFormData(prev => ({ ...prev, remarks: e.target.value }))}
                            className="premium-input"
                            style={{ minHeight: '120px', resize: 'vertical' }}
                        />
                    </div>

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

                <div className="capture-footer">
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem', fontWeight: 500 }}>
                        Powered by Bharat Properties Enterprise Engine • Encrypted Connection
                    </p>
                </div>
            </div>

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
                
                body { margin: 0; padding: 0; }
                
                .capture-wrapper {
                    min-height: 100vh;
                    background: #f8fafc;
                    padding: 60px 20px;
                    font-family: 'Inter', sans-serif;
                }
                
                .capture-card {
                    max-width: 850px;
                    margin: 0 auto;
                    background: #ffffff;
                    border-radius: 40px;
                    border: 1px solid #e2e8f0;
                    overflow: hidden;
                    box-shadow: 0 20px 40px -10px rgba(0,0,0,0.05), 0 10px 15px -3px rgba(0,0,0,0.02);
                }
                
                .capture-header {
                    padding: 60px;
                    border-bottom: 1px solid #e2e8f0;
                    background: linear-gradient(180deg, #f1f5f9 0%, #ffffff 100%);
                    text-align: center;
                }
                
                .capture-title {
                    color: #0f172a;
                    font-size: 2.5rem;
                    font-weight: 900;
                    margin: 0;
                    letter-spacing: -0.02em;
                }
                
                .capture-desc {
                    color: #475569;
                    margin-top: 16px;
                    font-size: 1.1rem;
                    max-width: 600px;
                    line-height: 1.6;
                    margin-left: auto;
                    margin-right: auto;
                }
                
                .capture-form-body {
                    padding: 40px 60px;
                }
                
                .capture-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 30px;
                }
                
                .capture-footer {
                    padding: 30px 60px;
                    background: #f8fafc;
                    border-top: 1px solid #e2e8f0;
                    text-align: center;
                }
                
                .premium-input {
                    padding: 16px 20px;
                    border-radius: 16px;
                    background: #f1f5f9;
                    border: 1px solid #cbd5e1;
                    color: #0f172a;
                    font-size: 1rem;
                    outline: none;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    width: 100%;
                    box-sizing: border-box;
                    font-family: inherit;
                }
                .premium-input:focus {
                    background: #ffffff;
                    border-color: #3b82f6;
                    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.15);
                }
                .premium-input::placeholder {
                    color: #94a3b8;
                }
                .premium-input:disabled {
                    background: #e2e8f0;
                    opacity: 0.7;
                    cursor: not-allowed;
                }
                select.premium-input option {
                    background: #ffffff;
                    color: #0f172a;
                    padding: 10px;
                }
                
                .loading-container, .error-container {
                    height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #f8fafc;
                    color: #475569;
                    font-family: 'Inter', sans-serif;
                    font-weight: 600;
                    font-size: 1.2rem;
                }
                
                /* Responsive Mobile Styling */
                @media (max-width: 768px) {
                    .capture-wrapper {
                        padding: 24px 16px;
                    }
                    .capture-grid {
                        grid-template-columns: 1fr;
                        gap: 20px;
                    }
                    .capture-header, .capture-form-body, .capture-footer {
                        padding: 30px 24px;
                    }
                    .capture-title {
                        font-size: 2rem;
                    }
                    .capture-card {
                        border-radius: 28px;
                    }
                }
                
                @media (max-width: 480px) {
                    .capture-wrapper {
                        padding: 16px 12px;
                    }
                    .capture-header {
                        padding: 24px 16px;
                    }
                    .capture-form-body {
                        padding: 24px 16px;
                    }
                    .capture-footer {
                        padding: 24px 16px;
                    }
                    .capture-title {
                        font-size: 1.75rem;
                    }
                    .premium-input {
                        padding: 14px 16px;
                    }
                }
            `}</style>
        </div>
    );
};

export default CaptureFormPage;
