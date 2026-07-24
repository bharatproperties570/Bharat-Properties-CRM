import { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { toast, Toaster } from 'react-hot-toast';

const PublicLeadForm = ({ slug }) => {
    const [formConfig, setFormConfig] = useState(null);
    const [formData, setFormData] = useState({});
    const [preFillLead, setPreFillLead] = useState(null); // Stores VIP lead info
    const [status, setStatus] = useState('loading'); // loading, ready, submitting, success, error
    const [error, setError] = useState(null);
    const [dynamicOptions, setDynamicOptions] = useState({});

    // 🚀 ENTERPRISE TWEAK: Default to Light Mode (White Screen) as requested
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [showPropertyFields, setShowPropertyFields] = useState(false);

    useEffect(() => {
        const fetchForm = async () => {
            try {
                setStatus('loading');
                const response = await api.get(`/lead-forms/public/${slug}`);
                const config = response.data.data;
                setFormConfig(config);
                
                // 🚀 SMART PRE-FILL: Check for token in URL
                const urlParams = new URLSearchParams(window.location.search);
                const refToken = urlParams.get('ref');
                let preFillData = {};

                if (refToken) {
                    try {
                        const tokenRes = await api.get(`/dynamic-forms/public/resolve-token/${refToken}`);
                        if (tokenRes.data.success) {
                            const { lead, matchedProject, properties, hideUnit } = tokenRes.data.data;
                            setPreFillLead(lead);
                            
                            // Set property fields visibility based on hideUnit flag
                            setShowPropertyFields(!hideUnit);
                            
                            const firstProp = properties && properties.length > 0 ? properties[0] : null;

                            // Map lead data to form fields based on mappingField
                            config.sections.forEach(section => {
                                section.fields.forEach(field => {
                                    if (field.mappingField === 'firstName' || field.mappingField === 'name') preFillData[field.id] = lead.firstName || lead.name;
                                    if (field.mappingField === 'lastName') preFillData[field.id] = lead.lastName;
                                    if (field.mappingField === 'mobile') preFillData[field.id] = lead.mobile;
                                    if (field.mappingField === 'email') preFillData[field.id] = lead.email;
                                    
                                    // Pre-select property details from the new token structure
                                    if (field.dynamicSource === 'projects' || field.id === 'f_project') {
                                        preFillData[field.id] = firstProp ? (firstProp.id || matchedProject) : matchedProject;
                                    }
                                    if (field.id === 'f_block' && firstProp && firstProp.block) {
                                        preFillData[field.id] = firstProp.block;
                                    }
                                    if (field.id === 'f_unitNo' && firstProp && firstProp.unit) {
                                        preFillData[field.id] = [firstProp.unit]; // unitNo is multi-select usually, so array
                                    }
                                });
                            });
                            
                            setFormData(prev => ({ ...prev, ...preFillData }));
                        }
                    } catch (e) {
                        console.warn("Could not resolve token for pre-fill");
                    }
                }

                // 🚀 Fetch Dynamic Options if any field requires them
                const dynamicFields = config.sections.flatMap(s => s.fields).filter(f => f.dynamicSource);
                if (dynamicFields.length > 0) {
                    const optionsMap = { ...dynamicOptions };
                    await Promise.all(dynamicFields.map(async (field) => {
                        if (field.dynamicSource) {
                            try {
                                const optRes = await api.get(`/dynamic-forms/public/options/${field.dynamicSource}`);
                                optionsMap[field.id] = optRes.data.data;
                            } catch (e) {
                                console.error(`Failed to fetch ${field.dynamicSource}`, e);
                            }
                        }
                    }));
                    setDynamicOptions(optionsMap);
                }

                setStatus('ready');
            } catch (err) {
                setError(err.response?.data?.message || 'Form not found');
                setStatus('error');
            }
        };
        fetchForm();
    }, [slug]);

    // 🚀 CASCADING DROPDOWNS: Fetch Blocks when Project changes
    useEffect(() => {
        const fetchBlocks = async () => {
            if (!formData['f_project']) {
                setDynamicOptions(prev => ({ ...prev, 'f_block': [], 'f_unitNo': [] }));
                return;
            }
            try {
                const res = await api.get(`/deal-forms/public/inventory/blocks?projectName=${encodeURIComponent(formData['f_project'])}`);
                setDynamicOptions(prev => ({ ...prev, 'f_block': res.data.data }));
            } catch (e) {
                console.error("Failed to fetch blocks", e);
            }
        };
        fetchBlocks();
    }, [formData['f_project']]);

    // 🚀 CASCADING DROPDOWNS: Fetch Units when Block changes
    useEffect(() => {
        const fetchUnits = async () => {
            if (!formData['f_project'] || !formData['f_block']) {
                setDynamicOptions(prev => ({ ...prev, 'f_unitNo': [] }));
                return;
            }
            try {
                const res = await api.get(`/deal-forms/public/inventory/units?projectName=${encodeURIComponent(formData['f_project'])}&block=${encodeURIComponent(formData['f_block'])}`);
                setDynamicOptions(prev => ({ ...prev, 'f_unitNo': res.data.data }));
            } catch (e) {
                console.error("Failed to fetch units", e);
            }
        };
        fetchUnits();
    }, [formData['f_project'], formData['f_block']]);

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

    const handleInputChange = (fieldId, value) => {
        setFormData(prev => {
            const newData = { ...prev, [fieldId]: value };
            // Cascading clear logic
            if (fieldId === 'f_project') {
                newData['f_block'] = '';
                newData['f_unitNo'] = [];
            } else if (fieldId === 'f_block') {
                newData['f_unitNo'] = [];
            }
            return newData;
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // 🚀 ENTERPRISE TWEAK: Don't validate fields that are smartly hidden!
        const isFieldHidden = (field) => {
            if (!preFillLead) return false;
            
            // Property fields are hidden if showPropertyFields is false
            if (['f_project', 'f_block', 'f_unitNo'].includes(field.id) && !showPropertyFields) return true;
            
            const label = (field.label || '').toLowerCase();
            const mapping = (field.mappingField || '').toLowerCase();
            const id = (field.id || '').toLowerCase();

            const isName = label.includes('name') || mapping.includes('name') || id.includes('name');
            const isMobile = label.includes('mobile') || label.includes('phone') || mapping.includes('mobile') || id.includes('mobile');
            const isEmail = label.includes('email') || mapping.includes('email') || id.includes('email');

            return isName || isMobile || isEmail;
        };

        const missingRequired = formConfig.sections.flatMap(s => s.fields)
            .filter(f => f.required && !formData[f.id] && !isFieldHidden(f));

        if (missingRequired.length > 0) {
            toast.error(`Please fill in required fields: ${missingRequired.map(f => f.label).join(', ')}`);
            return;
        }

        try {
            setStatus('submitting');
            const urlParams = new URLSearchParams(window.location.search);
            const sourceMeta = {
                utm_source: urlParams.get('utm_source'),
                utm_medium: urlParams.get('utm_medium'),
                referrer: document.referrer,
                search: window.location.search,
                userAgent: navigator.userAgent
            };

            await api.post(`/lead-forms/public/${slug}/submit`, {
                formData,
                sourceMeta,
                refToken: urlParams.get('ref'), // 🚀 Enterprise: Pass the token back to backend
                leadId: preFillLead ? preFillLead._id : null
            });

            setStatus('success');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Submission failed');
            setStatus('ready');
        }
    };

    if (status === 'loading') {
        return (
            <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDarkMode ? '#020617' : '#f8fafc' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ width: '50px', height: '50px', border: '4px solid #e2e8f0', borderTopColor: '#c9921a', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }}></div>
                    <p style={{ marginTop: '20px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.8rem' }}>Bharat Properties</p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDarkMode ? '#020617' : '#f8fafc', padding: '20px' }}>
                <div style={{ textAlign: 'center', padding: '60px', background: isDarkMode ? '#1e293b' : '#fff', borderRadius: '32px', boxShadow: '0 20px 50px rgba(0,0,0,0.1)', maxWidth: '500px' }}>
                    <i className="fas fa-exclamation-triangle" style={{ color: '#ef4444', fontSize: '4rem', marginBottom: '24px' }}></i>
                    <h2 style={{ margin: 0, color: isDarkMode ? '#fff' : '#1e293b', fontSize: '1.5rem', fontWeight: 900 }}>Form Unavailable</h2>
                    <p style={{ color: '#64748b', marginTop: '16px', lineHeight: '1.6' }}>{error}</p>
                </div>
            </div>
        );
    }

    if (status === 'success') {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDarkMode ? '#020617' : '#f8fafc', padding: '20px' }}>
                <div style={{ textAlign: 'center', padding: '60px', background: isDarkMode ? '#1e293b' : '#fff', borderRadius: '40px', boxShadow: '0 30px 60px rgba(0,0,0,0.12)', maxWidth: '600px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                    <div style={{ width: '100px', height: '100px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', margin: '0 auto 32px' }}>
                        <i className="fas fa-check-double"></i>
                    </div>
                    <h2 style={{ margin: 0, color: isDarkMode ? '#fff' : '#1e293b', fontSize: '2.5rem', fontWeight: 900 }}>Scheduled!</h2>
                    <p style={{ color: '#64748b', marginTop: '20px', fontSize: '1.2rem', lineHeight: '1.6' }}>{formConfig.settings.successMessage || 'Your visit has been successfully scheduled. Our representative will contact you shortly.'}</p>
                    <button onClick={() => window.location.reload()} style={{ marginTop: '40px', padding: '16px 32px', borderRadius: '14px', border: 'none', background: '#10b981', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Close</button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ 
            minHeight: '100vh', 
            background: isDarkMode ? '#020617' : '#f8fafc', 
            padding: '40px 20px', 
            fontFamily: "'Inter', sans-serif",
            transition: 'background 0.3s ease'
        }}>
            <Toaster position="top-right" />
            <style>
                {`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800;900&display=swap');
                
                body { margin: 0; padding: 0; }
                
                .main-container {
                    min-height: 100vh;
                    background: ${isDarkMode 
                        ? 'radial-gradient(circle at top right, #1e293b 0%, #0f172a 100%)' 
                        : 'radial-gradient(circle at top right, #f1f5f9 0%, #f8fafc 100%)'};
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 60px 20px;
                    position: relative;
                    overflow: hidden;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                }

                /* Decorative Background Elements */
                .main-container::before {
                    content: "";
                    position: absolute;
                    width: 1000px;
                    height: 1000px;
                    background: radial-gradient(circle, ${isDarkMode ? 'rgba(201, 146, 26, 0.03)' : 'rgba(201, 146, 26, 0.05)'} 0%, transparent 70%);
                    top: -400px;
                    right: -300px;
                    z-index: 0;
                }

                .main-container::after {
                    content: "";
                    position: absolute;
                    width: 600px;
                    height: 600px;
                    background: radial-gradient(circle, ${isDarkMode ? 'rgba(59, 130, 246, 0.02)' : 'rgba(59, 130, 246, 0.04)'} 0%, transparent 70%);
                    bottom: -200px;
                    left: -100px;
                    z-index: 0;
                }

                .glass-card {
                    background: ${isDarkMode ? 'rgba(30, 41, 59, 0.7)' : 'rgba(255, 255, 255, 0.9)'};
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(201, 146, 26, 0.2)'};
                    border-radius: 40px;
                    width: 100%;
                    max-width: 700px;
                    box-shadow: 0 50px 100px -20px rgba(0, 0, 0, 0.15);
                    position: relative;
                    z-index: 10;
                    overflow: hidden;
                    transition: all 0.3s ease;
                }

                .welcome-plate {
                    background: linear-gradient(135deg, #c9921a 0%, #9e710f 100%);
                    color: #fff;
                    padding: 50px 60px;
                    display: flex;
                    align-items: center;
                    gap: 32px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    position: relative;
                }

                .form-section {
                    padding: 50px 60px;
                }
                .form-label {
                    font-size: 0.8rem;
                    font-weight: 800;
                    color: ${isDarkMode ? '#94a3b8' : '#64748b'};
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    margin-bottom: 12px;
                    display: block;
                }
                .form-control {
                    width: 100%;
                    padding: 18px 24px;
                    border-radius: 20px;
                    font-size: 1.1rem;
                    background: ${isDarkMode ? '#0f172a' : '#f1f5f9'};
                    border: 2px solid transparent;
                    color: ${isDarkMode ? '#f8fafc' : '#1e293b'};
                    transition: all 0.2s ease;
                    box-sizing: border-box;
                    font-weight: 500;
                }
                .form-control:focus {
                    border-color: #c9921a;
                    background: ${isDarkMode ? '#0f172a' : '#fff'};
                    box-shadow: 0 0 0 5px rgba(201, 146, 26, 0.1);
                    outline: none;
                }
                .form-control option {
                    background: ${isDarkMode ? '#0f172a' : '#fff'};
                    color: ${isDarkMode ? '#f8fafc' : '#1e293b'};
                }
                .submit-btn {
                    width: 100%;
                    padding: 22px;
                    border-radius: 24px;
                    border: none;
                    background: linear-gradient(135deg, #c9921a 0%, #9e710f 100%);
                    color: #fff;
                    font-weight: 800;
                    font-size: 1.1rem;
                    text-transform: uppercase;
                    letter-spacing: 0.12em;
                    cursor: pointer;
                    box-shadow: 0 20px 40px -10px rgba(201, 146, 26, 0.4);
                    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                }
                .submit-btn:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 25px 50px -10px rgba(201, 146, 26, 0.5);
                }
                @media (max-width: 640px) {
                    .form-section { padding: 30px 20px; }
                    .welcome-plate { padding: 35px 20px; gap: 20px; flex-direction: column; text-align: center; }
                    .glass-card { border-radius: 0; }
                    .main-container { padding: 0; }
                }
            `}</style>

            <div className="main-container">
                <div className="glass-card">
                {/* Theme Toggle Button */}
                <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 10 }}>
                    <button onClick={() => setIsDarkMode(!isDarkMode)} style={{ background: isDarkMode ? '#1e293b' : '#fff', border: 'none', width: '44px', height: '44px', borderRadius: '50%', cursor: 'pointer', color: isDarkMode ? '#fbbf24' : '#64748b', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                        <i className={isDarkMode ? 'fas fa-sun' : 'fas fa-moon'}></i>
                    </button>
                </div>

                {/* VIP Welcome Plate */}
                {preFillLead ? (
                    <div className="welcome-plate">
                        <div style={{ width: '80px', height: '80px', background: 'rgba(255,255,255,0.2)', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>
                            <i className="fas fa-user-check"></i>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.15em' }}>VIP Access Verified</div>
                            <div style={{ fontSize: '2.2rem', fontWeight: 900, letterSpacing: '-0.03em', margin: '4px 0' }}>{preFillLead.firstName || preFillLead.name} {preFillLead.lastName || ''}</div>
                            
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginTop: '12px' }}>
                                <div style={{ fontSize: '0.95rem', background: 'rgba(0,0,0,0.15)', padding: '6px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <i className="fas fa-phone-alt" style={{ fontSize: '0.8rem' }}></i> {preFillLead.mobile}
                                </div>
                                {preFillLead.email && (
                                    <div style={{ fontSize: '0.95rem', background: 'rgba(0,0,0,0.15)', padding: '6px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="fas fa-envelope" style={{ fontSize: '0.8rem' }}></i> {preFillLead.email}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div style={{ padding: '60px 60px 40px', textAlign: 'center' }}>
                        <div style={{ width: '60px', height: '60px', background: '#c9921a', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.5rem', margin: '0 auto 24px' }}>
                            <i className="fas fa-calendar-check"></i>
                        </div>
                        <h1 style={{ margin: 0, fontSize: '2.5rem', fontWeight: 900, color: isDarkMode ? '#fff' : '#1e293b', letterSpacing: '-0.04em' }}>{formConfig.name}</h1>
                        <p style={{ marginTop: '12px', color: isDarkMode ? '#94a3b8' : '#64748b', fontSize: '1.1rem' }}>Please provide your details to schedule a premium site visit.</p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="form-section">
                    {formConfig.sections.map(section => {
                        // 🧠 AGGRESSIVE SMART HIDING:
                        const isPropertySection = section.fields.some(f => ['f_project', 'f_block', 'f_unitNo'].includes(f.id));
                        
                        const visibleFields = section.fields.filter(field => {
                            if (!preFillLead && !['f_project', 'f_block', 'f_unitNo'].includes(field.id)) return true;
                            
                            // Check if it's a property field
                            if (['f_project', 'f_block', 'f_unitNo'].includes(field.id)) {
                                return showPropertyFields;
                            }

                            if (!preFillLead) return true;
                            
                            const label = (field.label || '').toLowerCase();
                            const mapping = (field.mappingField || '').toLowerCase();
                            const id = (field.id || '').toLowerCase();

                            const isName = label.includes('name') || mapping.includes('name') || id.includes('name');
                            const isMobile = label.includes('mobile') || label.includes('phone') || mapping.includes('mobile') || id.includes('mobile');
                            const isEmail = label.includes('email') || mapping.includes('email') || id.includes('email');

                            return !(isName || isMobile || isEmail);
                        });

                        if (visibleFields.length === 0 && !isPropertySection) return null;

                        return (
                            <div key={section.id} style={{ marginBottom: '50px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '30px' }}>
                                    <div style={{ width: '40px', height: '2px', background: isDarkMode ? '#c9921a' : '#9e710f', borderRadius: '2px' }}></div>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: isDarkMode ? '#c9921a' : '#9e710f', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{section.title}</h3>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '32px' }}>
                                    {visibleFields.map(field => {
                                        const fieldType = field.id === 'f_unitNo' ? 'multi-select' : field.type;
                                        return (
                                        <div key={field.id}>
                                            <label className="form-label">
                                                {field.label} {field.required && <span style={{ color: '#ef4444' }}>*</span>}
                                            </label>

                                            {fieldType === 'select' || fieldType === 'multi-select' ? (
                                                <select
                                                    required={field.required}
                                                    multiple={fieldType === 'multi-select'}
                                                    value={fieldType === 'multi-select' ? (Array.isArray(formData[field.id]) ? formData[field.id] : []) : (formData[field.id] || '')}
                                                    onChange={e => handleInputChange(field.id, fieldType === 'multi-select' ? Array.from(e.target.selectedOptions, option => option.value) : e.target.value)}
                                                    className="form-control"
                                                    style={{ height: fieldType === 'multi-select' ? '120px' : '64px' }}
                                                >
                                                    <option value="" disabled={fieldType === 'multi-select'}>Select Option</option>
                                                    {(dynamicOptions[field.id] || field.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                </select>
                                            ) : fieldType === 'radio' ? (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                                                    {(dynamicOptions[field.id] || field.options || []).map(opt => (
                                                        <label key={opt} style={{ 
                                                            padding: '16px 24px', 
                                                            background: formData[field.id] === opt ? (isDarkMode ? 'rgba(201, 146, 26, 0.15)' : 'rgba(158, 113, 15, 0.1)') : (isDarkMode ? '#1e293b' : '#f1f5f9'),
                                                            border: `2px solid ${formData[field.id] === opt ? (isDarkMode ? '#c9921a' : '#9e710f') : 'transparent'}`,
                                                            borderRadius: '16px',
                                                            cursor: 'pointer',
                                                            color: formData[field.id] === opt ? (isDarkMode ? '#c9921a' : '#9e710f') : (isDarkMode ? '#e2e8f0' : '#1e293b'),
                                                            fontWeight: 700,
                                                            transition: 'all 0.2s ease'
                                                        }}>
                                                            <input
                                                                type="radio"
                                                                name={field.id}
                                                                value={opt}
                                                                checked={formData[field.id] === opt}
                                                                onChange={e => handleInputChange(field.id, e.target.value)}
                                                                required={field.required}
                                                                style={{ display: 'none' }}
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
                                                    value={formData[field.id] || ''}
                                                    onChange={e => handleInputChange(field.id, e.target.value)}
                                                    className="form-control"
                                                />
                                            )}
                                        </div>
                                        );
                                    })}
                                </div>
                                
                                {isPropertySection && !showPropertyFields && (
                                    <div style={{ marginTop: '30px', textAlign: 'center' }}>
                                        <button 
                                            type="button" 
                                            onClick={() => setShowPropertyFields(true)}
                                            style={{
                                                background: 'transparent',
                                                border: '2px dashed rgba(201, 146, 26, 0.5)',
                                                color: '#c9921a',
                                                padding: '14px 24px',
                                                borderRadius: '16px',
                                                fontSize: '0.95rem',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                transition: 'all 0.2s ease'
                                            }}
                                            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(201, 146, 26, 0.05)'; e.currentTarget.style.borderColor = '#c9921a'; }}
                                            onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(201, 146, 26, 0.5)'; }}
                                        >
                                            <i className="fas fa-plus-circle"></i> Add Specific Property Details (Optional)
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    <button type="submit" disabled={status === 'submitting'} className="submit-btn">
                        {status === 'submitting' ? (
                            <><i className="fas fa-circle-notch fa-spin"></i> Processing...</>
                        ) : (
                            <>{preFillLead ? 'Confirm Site Visit' : 'Schedule Site Visit'} <i className="fas fa-chevron-right" style={{ marginLeft: '10px', fontSize: '0.9rem' }}></i></>
                        )}
                    </button>
                </form>

                {/* Secure Footer */}
                <div style={{ padding: '30px', textAlign: 'center', background: isDarkMode ? 'rgba(0,0,0,0.2)' : '#f8fafc', borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '30px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700 }}>
                            <i className="fas fa-lock" style={{ color: '#10b981' }}></i> End-to-End Encrypted
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700 }}>
                            <i className="fas fa-check-shield" style={{ color: '#3b82f6' }}></i> Verified Partner
                        </div>
                    </div>
                </div>
            </div>
        </div>

            <div style={{ textAlign: 'center', marginTop: '30px', position: 'relative', zIndex: 10 }}>
                <a 
                    href="https://bharatproperties.co" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '10px', 
                        padding: '12px 24px', 
                        background: 'rgba(201, 146, 26, 0.1)', 
                        border: '1px solid rgba(201, 146, 26, 0.2)', 
                        borderRadius: '12px', 
                        color: '#c9921a', 
                        textDecoration: 'none', 
                        fontSize: '0.9rem', 
                        fontWeight: 700,
                        transition: 'all 0.3s ease'
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(201, 146, 26, 0.2)'; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(201, 146, 26, 0.1)'; }}
                >
                    <i className="fas fa-globe"></i> Visit Official Website
                </a>

                <div style={{ marginTop: '24px', color: '#64748b', fontSize: '0.8rem', fontWeight: 500 }}>
                    &copy; 2026 Bharat Properties CRM Enterprise. All rights reserved.
                </div>
            </div>
        </div>
    );
};

export default PublicLeadForm;

