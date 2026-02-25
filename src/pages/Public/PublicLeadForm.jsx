import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast, Toaster } from 'react-hot-toast';

const PublicLeadForm = ({ slug }) => {
    const [formConfig, setFormConfig] = useState(null);
    const [formData, setFormData] = useState({});
    const [status, setStatus] = useState('loading'); // loading, ready, submitting, success, error
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchForm = async () => {
            try {
                setStatus('loading');
                const response = await axios.get(`/api/lead-forms/public/${slug}`);
                setFormConfig(response.data.data);
                setStatus('ready');
            } catch (err) {
                setError(err.response?.data?.message || 'Form not found');
                setStatus('error');
            }
        };
        fetchForm();
    }, [slug]);

    const handleInputChange = (fieldId, value) => {
        setFormData({ ...formData, [fieldId]: value });
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

            const response = await axios.post(`/api/lead-forms/public/${slug}/submit`, {
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
            toast.error(err.response?.data?.message || 'Submission failed');
            setStatus('ready');
        }
    };

    if (status === 'loading') {
        return (
            <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTopColor: '#10b981', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }}></div>
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
            <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
                <div style={{ textAlign: 'center', padding: '60px', background: '#fff', borderRadius: '32px', boxShadow: '0 20px 50px -12px rgba(0,0,0,0.1)', maxWidth: '500px' }}>
                    <div style={{ width: '80px', height: '80px', background: '#dcfce7', color: '#10b981', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', margin: '0 auto 24px' }}>
                        <i className="fas fa-check"></i>
                    </div>
                    <h2 style={{ margin: 0, color: '#1e293b', fontSize: '1.75rem', fontWeight: 900 }}>Submission Sent!</h2>
                    <p style={{ color: '#64748b', marginTop: '16px', lineHeight: '1.6', fontSize: '1.1rem' }}>{formConfig.settings.successMessage}</p>
                    {formConfig.settings.redirectUrl && (
                        <p style={{ marginTop: '24px', color: '#94a3b8', fontSize: '0.9rem' }}>Redirecting you shortly...</p>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '40px 20px' }}>
            <Toaster position="top-right" />
            <div style={{ maxWidth: '700px', margin: '0 auto', background: '#fff', borderRadius: '32px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.08)', overflow: 'hidden' }}>

                {/* Header */}
                <div style={{ padding: '60px 40px', textAlign: 'center', background: `linear-gradient(135deg, ${formConfig.settings.theme?.primaryColor || '#10b981'}05 0%, #ffffff 100%)`, borderBottom: '1px solid #f1f5f9' }}>
                    <h1 style={{ margin: 0, fontSize: '2.25rem', fontWeight: 900, color: '#1e293b' }}>{formConfig.name}</h1>
                    {formConfig.description && (
                        <p style={{ margin: '16px 0 0', color: '#64748b', fontSize: '1.1rem', lineHeight: '1.6' }}>{formConfig.description}</p>
                    )}
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ padding: '40px' }}>
                    {formConfig.sections.map(section => (
                        <div key={section.id} style={{ marginBottom: '40px' }}>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ width: '4px', height: '24px', background: formConfig.settings.theme?.primaryColor || '#10b981', borderRadius: '2px' }}></span>
                                {section.title}
                            </h3>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
                                {section.fields.map(field => (
                                    <div key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ fontSize: '0.95rem', fontWeight: 700, color: '#475569' }}>
                                            {field.label}
                                            {field.required && <span style={{ color: '#ef4444', marginLeft: '4px' }}>*</span>}
                                        </label>

                                        {field.type === 'select' || field.type === 'multi-select' ? (
                                            <select
                                                required={field.required}
                                                multiple={field.type === 'multi-select'}
                                                onChange={e => handleInputChange(field.id, field.type === 'multi-select' ? Array.from(e.target.selectedOptions, option => option.value) : e.target.value)}
                                                style={{ padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '1rem', outline: 'none', transition: 'border-color 0.2s' }}
                                                onFocus={e => e.target.style.borderColor = formConfig.settings.theme?.primaryColor || '#10b981'}
                                                onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                            >
                                                <option value="">Select an option</option>
                                                {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                            </select>
                                        ) : field.type === 'radio' ? (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '4px' }}>
                                                {field.options.map(opt => (
                                                    <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.95rem' }}>
                                                        <input
                                                            type="radio"
                                                            name={field.id}
                                                            value={opt}
                                                            onChange={e => handleInputChange(field.id, e.target.value)}
                                                            required={field.required}
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
                                                onChange={e => handleInputChange(field.id, e.target.value)}
                                                style={{ padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none', transition: 'all 0.2s' }}
                                                onFocus={e => {
                                                    e.target.style.borderColor = formConfig.settings.theme?.primaryColor || '#10b981';
                                                    e.target.style.boxShadow = `0 0 0 4px ${formConfig.settings.theme?.primaryColor || '#10b981'}10`;
                                                }}
                                                onBlur={e => {
                                                    e.target.style.borderColor = '#e2e8f0';
                                                    e.target.style.boxShadow = 'none';
                                                }}
                                            />
                                        )}
                                        {field.helpText && <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{field.helpText}</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}

                    <button
                        type="submit"
                        disabled={status === 'submitting'}
                        style={{
                            width: '100%',
                            padding: '18px',
                            borderRadius: '16px',
                            border: 'none',
                            background: formConfig.settings.theme?.primaryColor || '#10b981',
                            color: '#fff',
                            fontWeight: 900,
                            fontSize: '1.2rem',
                            cursor: 'pointer',
                            marginTop: '20px',
                            boxShadow: `0 15px 30px -10px ${formConfig.settings.theme?.primaryColor || '#10b981'}60`,
                            transition: 'all 0.3s ease',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '12px'
                        }}
                    >
                        {status === 'submitting' ? (
                            <><i className="fas fa-spinner fa-spin"></i> Submitting...</>
                        ) : (
                            'Submit Interest'
                        )}
                    </button>
                </form>

                {/* Footer */}
                <div style={{ padding: '24px 40px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <i className="fas fa-shield-alt"></i>
                        Powered by Bharat Properties Secure Form Engine
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PublicLeadForm;
