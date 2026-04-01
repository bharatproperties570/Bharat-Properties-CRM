import { useState, useEffect } from 'react';
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
            <div style={{ minHeight: '100vh', background: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: "'Inter', sans-serif" }}>
                <div style={{ background: 'rgba(30, 41, 59, 0.5)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.1)', maxWidth: '500px', width: '100%', borderRadius: '32px', padding: '60px 40px', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
                    <div style={{ width: '80px', height: '80px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', margin: '0 auto 32px', boxShadow: '0 0 20px rgba(16, 185, 129, 0.2)' }}>
                        <LucideCheckCircle size={40} />
                    </div>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#fff', marginBottom: '16px', letterSpacing: '-0.02em' }}>Feedback Received!</h2>
                    <p style={{ color: '#94a3b8', lineHeight: '1.6', fontSize: '1.1rem' }}>{form.settings?.successMessage}</p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: '#020617', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', fontFamily: "'Inter', sans-serif" }}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
                .feedback-glass-card {
                    background: rgba(30, 41, 59, 0.4);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 32px;
                    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
                }
                .nps-btn-premium {
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    border: 1px solid rgba(255,255,255,0.1) !important;
                }
                .nps-btn-premium:hover:not(.active) {
                    background: rgba(255,255,255,0.05);
                    border-color: rgba(255,255,255,0.2) !important;
                }
                .text-area-premium {
                    background: rgba(15, 23, 42, 0.6) !important;
                    border: 1px solid rgba(255,255,255,0.1) !important;
                    color: #f8fafc !important;
                    transition: all 0.2s ease;
                }
                .text-area-premium:focus {
                    border-color: #c9921a !important;
                    box-shadow: 0 0 0 4px rgba(201, 146, 26, 0.15) !important;
                }
            `}</style>

            <div className="feedback-glass-card" style={{ width: '100%', maxWidth: '650px', padding: '50px 40px' }}>
                <div style={{ textAlign: 'center', marginBottom: '50px' }}>
                    <h1 style={{ fontSize: '2.25rem', fontWeight: 900, color: '#fff', marginBottom: '12px', letterSpacing: '-0.03em' }}>{form.name}</h1>
                    <p style={{ color: '#94a3b8', fontSize: '1rem', lineHeight: '1.6' }}>{form.description}</p>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
                    {form.sections.map(section => (
                        <div key={section.id}>
                            {section.fields.map(field => (
                                <div key={field.id} style={{ marginBottom: '32px' }}>
                                    <label style={{ fontSize: '0.9rem', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {field.label} {field.required && <span style={{ color: '#ef4444' }}>*</span>}
                                    </label>

                                    {field.type === 'rating' && (
                                        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', padding: '10px 0' }}>
                                            {[1,2,3,4,5].map(star => (
                                                <button
                                                    key={star}
                                                    type="button"
                                                    onClick={() => setResponses({ ...responses, [field.id]: star })}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'transform 0.2s' }}
                                                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
                                                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                                >
                                                    <LucideStar 
                                                        size={42} 
                                                        fill={responses[field.id] >= star ? '#f59e0b' : 'none'} 
                                                        color={responses[field.id] >= star ? '#f59e0b' : 'rgba(255,255,255,0.1)'} 
                                                        style={{ filter: responses[field.id] >= star ? 'drop-shadow(0 0 8px rgba(245, 158, 11, 0.4))' : 'none' }}
                                                    />
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {field.type === 'nps' && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                                            {[...Array(11).keys()].map(n => (
                                                <button
                                                    key={n}
                                                    type="button"
                                                    onClick={() => setResponses({ ...responses, [field.id]: n })}
                                                    className={`nps-btn-premium ${responses[field.id] === n ? 'active' : ''}`}
                                                    style={{ 
                                                        width: '44px', height: '44px', borderRadius: '12px', 
                                                        background: responses[field.id] === n ? '#c9921a' : 'rgba(15, 23, 42, 0.4)',
                                                        color: responses[field.id] === n ? '#020617' : '#94a3b8',
                                                        fontWeight: 800, cursor: 'pointer',
                                                        fontSize: '1rem',
                                                        boxShadow: responses[field.id] === n ? '0 0 15px rgba(201, 146, 26, 0.4)' : 'none'
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
                                            placeholder={field.placeholder || "Tell us more about your experience..."}
                                            className="text-area-premium"
                                            style={{ width: '100%', minHeight: '140px', padding: '20px', borderRadius: '20px', fontSize: '1rem', outline: 'none', resize: 'none' }}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    ))}

                    <button
                        type="submit"
                        style={{ 
                            background: 'linear-gradient(135deg, #c9921a 0%, #b08014 100%)', 
                            color: '#020617', 
                            border: 'none', 
                            padding: '20px', 
                            borderRadius: '16px', 
                            fontSize: '1.1rem', 
                            fontWeight: 900, 
                            cursor: 'pointer', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            gap: '12px', 
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            boxShadow: '0 10px 25px -5px rgba(201, 146, 26, 0.4)',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 15px 30px -5px rgba(201, 146, 26, 0.5)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(201, 146, 26, 0.4)';
                        }}
                    >
                        Submit Feedback <LucideSend size={20} />
                    </button>
                </form>

                {/* Footer */}
                <div style={{ marginTop: '40px', paddingTop: '30px', borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        <i className="fas fa-heart" style={{ color: '#ef4444' }}></i>
                        Your feedback helps us grow
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PublicFeedbackForm;
