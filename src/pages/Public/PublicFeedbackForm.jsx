import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { toast } from 'react-hot-toast';
import { LucideStar, LucideCheckCircle, LucideSend } from 'lucide-react';

const PublicFeedbackForm = ({ slug }) => {
    const [form, setForm] = useState(null);
    const [responses, setResponses] = useState({});
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchForm = async () => {
            try {
                const res = await api.get(`/feedback-forms/public/${slug}`);
                setForm(res.data.data);
            } catch (err) {
                toast.error("Form not found");
            } finally {
                setIsLoading(false);
            }
        };
        fetchForm();
    }, [slug]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.post(`/feedback-forms/public/${slug}/submit`, {
                responses,
                sourceMeta: {
                    userAgent: navigator.userAgent,
                    referrer: document.referrer
                }
            });
            setIsSubmitted(true);
        } catch (err) {
            toast.error("Failed to submit feedback");
        }
    };

    if (isLoading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
    if (!form) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Form not found</div>;

    if (isSubmitted) {
        return (
            <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                <div style={{ background: '#fff', maxWidth: '500px', width: '100%', borderRadius: '32px', padding: '60px 40px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.05)' }}>
                    <div style={{ width: '80px', height: '80px', background: '#f0fdf4', borderRadius: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', margin: '0 auto 32px' }}>
                        <LucideCheckCircle size={40} />
                    </div>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#1e293b', marginBottom: '16px' }}>Feedback Received!</h2>
                    <p style={{ color: '#64748b', lineHeight: '1.6', fontSize: '1.1rem' }}>{form.settings?.successMessage}</p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px' }}>
            <div style={{ width: '100%', maxWidth: '600px', background: '#fff', borderRadius: '32px', padding: '40px', boxShadow: '0 20px 50px rgba(0,0,0,0.05)' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#1e293b', textAlign: 'center', marginBottom: '8px' }}>{form.name}</h1>
                <p style={{ color: '#64748b', textAlign: 'center', marginBottom: '40px', fontSize: '0.9rem' }}>{form.description}</p>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                    {form.sections.map(section => (
                        <div key={section.id}>
                            {section.fields.map(field => (
                                <div key={field.id} style={{ marginBottom: '24px' }}>
                                    <label style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', display: 'block', marginBottom: '12px' }}>
                                        {field.label} {field.required && <span style={{ color: '#ef4444' }}>*</span>}
                                    </label>

                                    {field.type === 'rating' && (
                                        <div style={{ display: 'flex', gap: '12px' }}>
                                            {[1,2,3,4,5].map(star => (
                                                <button
                                                    key={star}
                                                    type="button"
                                                    onClick={() => setResponses({ ...responses, [field.id]: star })}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                                >
                                                    <LucideStar 
                                                        size={36} 
                                                        fill={responses[field.id] >= star ? '#f59e0b' : 'none'} 
                                                        color={responses[field.id] >= star ? '#f59e0b' : '#e2e8f0'} 
                                                    />
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {field.type === 'nps' && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                            {[...Array(11).keys()].map(n => (
                                                <button
                                                    key={n}
                                                    type="button"
                                                    onClick={() => setResponses({ ...responses, [field.id]: n })}
                                                    style={{ 
                                                        width: '40px', height: '40px', borderRadius: '10px', 
                                                        border: `1px solid ${responses[field.id] === n ? '#2563eb' : '#e2e8f0'}`,
                                                        background: responses[field.id] === n ? '#2563eb' : '#fff',
                                                        color: responses[field.id] === n ? '#fff' : '#1e293b',
                                                        fontWeight: 700, cursor: 'pointer'
                                                    }}
                                                >
                                                    {n}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {field.type === 'text' && (
                                        <textarea
                                            required={field.required}
                                            value={responses[field.id] || ''}
                                            onChange={e => setResponses({ ...responses, [field.id]: e.target.value })}
                                            placeholder={field.placeholder || "Tell us more..."}
                                            style={{ width: '100%', minHeight: '120px', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '1rem', outline: 'none' }}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    ))}

                    <button
                        type="submit"
                        style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '16px', borderRadius: '16px', fontSize: '1.1rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.4)' }}
                    >
                        Submit Feedback <LucideSend size={18} />
                    </button>
                </form>
            </div>
        </div>
    );
};

export default PublicFeedbackForm;
