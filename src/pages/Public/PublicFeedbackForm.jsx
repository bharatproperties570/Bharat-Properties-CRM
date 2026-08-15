import { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { toast } from 'react-hot-toast';
import { LucideStar, LucideCheckCircle, LucideSend } from 'lucide-react';

// ─── Field Renderer — Handles ALL types from EnterpriseFormBuilder ───────────
const FieldRenderer = ({ field, value, onChange, activityDetails }) => {
    const inputBaseStyle = {
        width: '100%',
        padding: '14px 18px',
        borderRadius: '14px',
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(15, 23, 42, 0.6)',
        color: '#f8fafc',
        fontSize: '1rem',
        outline: 'none',
        fontFamily: "'Inter', sans-serif",
        transition: 'border-color 0.2s, box-shadow 0.2s',
        boxSizing: 'border-box',
    };

    const focusStyle = {
        borderColor: '#c9921a',
        boxShadow: '0 0 0 3px rgba(201, 146, 26, 0.15)',
    };

    const handleFocus = (e) => {
        e.target.style.borderColor = '#c9921a';
        e.target.style.boxShadow = '0 0 0 3px rgba(201, 146, 26, 0.15)';
    };
    const handleBlur = (e) => {
        e.target.style.borderColor = 'rgba(255,255,255,0.1)';
        e.target.style.boxShadow = 'none';
    };

    // ── Rating (Star) ──
    if (field.type === 'rating') {
        return (
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', padding: '10px 0' }}>
                {[1, 2, 3, 4, 5].map(star => (
                    <button
                        key={star}
                        type="button"
                        onClick={() => onChange(star)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'transform 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                        <LucideStar
                            size={42}
                            fill={(value || 0) >= star ? '#f59e0b' : 'none'}
                            color={(value || 0) >= star ? '#f59e0b' : 'rgba(255,255,255,0.15)'}
                            style={{ filter: (value || 0) >= star ? 'drop-shadow(0 0 8px rgba(245, 158, 11, 0.4))' : 'none' }}
                        />
                    </button>
                ))}
            </div>
        );
    }

    // ── NPS Score ──
    if (field.type === 'nps') {
        return (
            <div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                    {[...Array(11).keys()].map(n => (
                        <button
                            key={n}
                            type="button"
                            onClick={() => onChange(n)}
                            style={{
                                width: '44px', height: '44px', borderRadius: '12px',
                                background: value === n
                                    ? (n <= 6 ? '#ef4444' : n <= 8 ? '#f59e0b' : '#10b981')
                                    : 'rgba(15, 23, 42, 0.4)',
                                color: value === n ? '#fff' : '#94a3b8',
                                border: `1px solid ${value === n ? 'transparent' : 'rgba(255,255,255,0.1)'}`,
                                fontWeight: 800, cursor: 'pointer', fontSize: '1rem',
                                transition: 'all 0.2s',
                                boxShadow: value === n ? '0 0 15px rgba(201, 146, 26, 0.3)' : 'none'
                            }}
                        >
                            {n}
                        </button>
                    ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.75rem', color: '#64748b' }}>
                    <span>Not likely at all</span>
                    <span>Extremely likely</span>
                </div>
            </div>
        );
    }

    // ── Dropdown / Select ──
    if (field.type === 'dropdown' || field.type === 'select') {
        return (
            <select
                required={field.required}
                value={value || ''}
                onChange={e => onChange(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={{
                    ...inputBaseStyle,
                    appearance: 'none',
                    backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'/%3e%3c/svg%3e")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 16px center',
                    backgroundSize: '16px',
                    paddingRight: '48px',
                    cursor: 'pointer',
                }}
            >
                <option value="" style={{ background: '#0f172a' }}>{field.placeholder || 'Select an option...'}</option>
                {(field.options || []).map((opt, i) => (
                    <option key={i} value={typeof opt === 'string' ? opt : opt.value || opt.label} style={{ background: '#0f172a' }}>
                        {typeof opt === 'string' ? opt : opt.label}
                    </option>
                ))}
            </select>
        );
    }

    // ── Radio Buttons ──
    if (field.type === 'radio') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {(field.options || []).map((opt, i) => {
                    const optVal = typeof opt === 'string' ? opt : opt.value || opt.label;
                    const optLabel = typeof opt === 'string' ? opt : opt.label;
                    const isSelected = value === optVal;
                    return (
                        <label
                            key={i}
                            onClick={() => onChange(optVal)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '14px',
                                padding: '14px 18px', borderRadius: '14px', cursor: 'pointer',
                                border: `1px solid ${isSelected ? '#c9921a' : 'rgba(255,255,255,0.08)'}`,
                                background: isSelected ? 'rgba(201, 146, 26, 0.08)' : 'rgba(15, 23, 42, 0.4)',
                                transition: 'all 0.2s',
                            }}
                        >
                            <div style={{
                                width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                                border: `2px solid ${isSelected ? '#c9921a' : 'rgba(255,255,255,0.2)'}`,
                                background: isSelected ? '#c9921a' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.2s',
                            }}>
                                {isSelected && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#020617' }} />}
                            </div>
                            <span style={{ color: isSelected ? '#f8fafc' : '#94a3b8', fontWeight: isSelected ? 600 : 400 }}>{optLabel}</span>
                        </label>
                    );
                })}
            </div>
        );
    }

    // ── Checkboxes ──
    if (field.type === 'checkbox') {
        const selected = Array.isArray(value) ? value : [];
        const toggle = (optVal) => {
            if (selected.includes(optVal)) onChange(selected.filter(v => v !== optVal));
            else onChange([...selected, optVal]);
        };
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {(field.options || []).map((opt, i) => {
                    const optVal = typeof opt === 'string' ? opt : opt.value || opt.label;
                    const optLabel = typeof opt === 'string' ? opt : opt.label;
                    const isChecked = selected.includes(optVal);
                    return (
                        <label
                            key={i}
                            onClick={() => toggle(optVal)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '14px',
                                padding: '14px 18px', borderRadius: '14px', cursor: 'pointer',
                                border: `1px solid ${isChecked ? '#c9921a' : 'rgba(255,255,255,0.08)'}`,
                                background: isChecked ? 'rgba(201, 146, 26, 0.08)' : 'rgba(15, 23, 42, 0.4)',
                                transition: 'all 0.2s',
                            }}
                        >
                            <div style={{
                                width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0,
                                border: `2px solid ${isChecked ? '#c9921a' : 'rgba(255,255,255,0.2)'}`,
                                background: isChecked ? '#c9921a' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.2s',
                            }}>
                                {isChecked && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#020617" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                            </div>
                            <span style={{ color: isChecked ? '#f8fafc' : '#94a3b8', fontWeight: isChecked ? 600 : 400 }}>{optLabel}</span>
                        </label>
                    );
                })}
            </div>
        );
    }

    // ── Textarea ──
    if (field.type === 'textarea') {
        return (
            <textarea
                required={field.required}
                value={value || ''}
                onChange={e => onChange(e.target.value)}
                placeholder={field.placeholder || field.helpText || 'Type your answer here...'}
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={{ ...inputBaseStyle, minHeight: '130px', resize: 'vertical', lineHeight: '1.6' }}
            />
        );
    }

    // ── Text (single line) ──
    if (field.type === 'text') {
        return (
            <input
                type="text"
                required={field.required}
                value={value || ''}
                onChange={e => onChange(e.target.value)}
                placeholder={field.placeholder || field.helpText || 'Type your answer...'}
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={inputBaseStyle}
            />
        );
    }

    // ── Phone ──
    if (field.type === 'phone') {
        return (
            <input
                type="tel"
                required={field.required}
                value={value || ''}
                onChange={e => onChange(e.target.value)}
                placeholder={field.placeholder || 'Enter phone number...'}
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={inputBaseStyle}
            />
        );
    }

    // ── Email ──
    if (field.type === 'email') {
        return (
            <input
                type="email"
                required={field.required}
                value={value || ''}
                onChange={e => onChange(e.target.value)}
                placeholder={field.placeholder || 'Enter email address...'}
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={inputBaseStyle}
            />
        );
    }

    // ── Date ──
    if (field.type === 'date' || field.type === 'datetime') {
        return (
            <input
                type={field.type === 'datetime' ? 'datetime-local' : 'date'}
                required={field.required}
                value={value || ''}
                onChange={e => onChange(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={{ ...inputBaseStyle, colorScheme: 'dark' }}
            />
        );
    }

    // ── Property Feedback (Site Visit) ──
    if (field.type === 'property_feedback') {
        const properties = activityDetails?.visitedProperties;
        if (!properties || properties.length === 0) {
            return (
                <div style={{ color: '#64748b', fontSize: '0.9rem', fontStyle: 'italic', textAlign: 'center', padding: '24px', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    No properties found for this visit.
                </div>
            );
        }
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {properties.map((prop, idx) => (
                    <div key={idx} style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px' }}>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '12px' }}>
                            🏢 {prop.project} <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 500 }}>– {prop.property}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '8px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Outcome</label>
                                <select
                                    value={(value || {})[idx]?.result || ''}
                                    onChange={e => onChange({ ...(value || {}), [idx]: { ...(value?.[idx] || {}), result: e.target.value } })}
                                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(15, 23, 42, 0.6)', color: '#f8fafc', outline: 'none' }}
                                >
                                    <option value="" style={{ background: '#0f172a' }}>Select Result</option>
                                    {(field.options?.length ? field.options : ['Interested', 'Not Interested', 'Shortlisted', 'Booked', 'Budget Issue', 'Need Time']).map(opt => (
                                        <option key={opt} value={opt} style={{ background: '#0f172a' }}>{opt}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '8px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rating</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {[1, 2, 3, 4, 5].map(star => (
                                        <button key={star} type="button" onClick={() => onChange({ ...(value || {}), [idx]: { ...(value?.[idx] || {}), rating: star } })} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                            <LucideStar size={28} fill={((value || {})[idx]?.rating || 0) >= star ? '#f59e0b' : 'none'} color={((value || {})[idx]?.rating || 0) >= star ? '#f59e0b' : 'rgba(255,255,255,0.15)'} />
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '8px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Comments</label>
                                <textarea
                                    value={(value || {})[idx]?.comments || ''}
                                    onChange={e => onChange({ ...(value || {}), [idx]: { ...(value?.[idx] || {}), comments: e.target.value } })}
                                    placeholder="Any specific likes or dislikes?"
                                    style={{ width: '100%', minHeight: '80px', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(15, 23, 42, 0.6)', color: '#f8fafc', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    // ── Fallback for unknown types — render as text input ──
    return (
        <input
            type="text"
            required={field.required}
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            placeholder={field.placeholder || 'Type your answer...'}
            onFocus={handleFocus}
            onBlur={handleBlur}
            style={inputBaseStyle}
        />
    );
};


// ─── Main Public Feedback Form Page ─────────────────────────────────────────
const PublicFeedbackForm = ({ slug }) => {
    const [form, setForm] = useState(null);
    const [leadInfo, setLeadInfo] = useState(null);
    const [responses, setResponses] = useState({});
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activityDetails, setActivityDetails] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchForm = async () => {
            try {
                const queryParams = new URLSearchParams(window.location.search);
                const leadId = queryParams.get('leadId') || '';
                const activityId = queryParams.get('activityId') || '';

                const res = await api.get(`/feedback-forms/public/${slug}?leadId=${leadId}`);
                if (!res.data?.success || !res.data?.data) {
                    setError('Form not found or is no longer active.');
                    return;
                }
                const formData = res.data.data;
                setForm(formData);
                if (formData.leadInfo) {
                    setLeadInfo(formData.leadInfo);

                    // 🌟 Auto-prefill lead details into matching form fields if present
                    const info = formData.leadInfo;
                    const autoFields = {};
                    formData.sections?.forEach(sec => {
                        sec.fields?.forEach(f => {
                            const lbl = (f.label || '').toLowerCase();
                            if (f.type === 'phone' || lbl.includes('phone') || lbl.includes('mobile')) {
                                if (info.mobile) autoFields[f.id] = info.mobile;
                            } else if (f.type === 'email' || lbl.includes('email')) {
                                if (info.email) autoFields[f.id] = info.email;
                            } else if (lbl.includes('name') && !lbl.includes('company')) {
                                if (info.name) autoFields[f.id] = info.name;
                            }
                        });
                    });
                    setResponses(prev => ({ ...autoFields, ...prev }));
                }

                if (activityId) {
                    try {
                        const actRes = await api.get(`/activities/public/${activityId}`);
                        if (actRes.data.success) setActivityDetails(actRes.data.data);
                    } catch {
                        // Activity details are optional — don't block the form
                    }
                }
            } catch (err) {
                setError('This form could not be loaded. Please try again later.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchForm();
    }, [slug]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const queryParams = new URLSearchParams(window.location.search);
            const leadId = queryParams.get('leadId');
            const inventoryId = queryParams.get('inventoryId');
            const activityId = queryParams.get('activityId');

            await api.post(`/feedback-forms/public/${slug}/submit`, {
                responses,
                leadId,
                inventoryId,
                activityId,
                sourceMeta: { userAgent: navigator.userAgent, referrer: document.referrer }
            });
            setIsSubmitted(true);
        } catch {
            toast.error('Failed to submit feedback. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // ── Loading State ──
    if (isLoading) return (
        <div style={{ minHeight: '100vh', background: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', sans-serif" }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ width: '48px', height: '48px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#c9921a', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
                <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Loading form...</p>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    // ── Error State ──
    if (error || !form) return (
        <div style={{ minHeight: '100vh', background: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: "'Inter', sans-serif" }}>
            <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '24px', padding: '60px 40px', textAlign: 'center', maxWidth: '400px', width: '100%' }}>
                <div style={{ fontSize: '3rem', marginBottom: '20px' }}>😔</div>
                <h2 style={{ color: '#f87171', fontSize: '1.5rem', fontWeight: 800, marginBottom: '12px' }}>Form Not Available</h2>
                <p style={{ color: '#64748b', lineHeight: '1.6' }}>{error || 'This feedback form is not available.'}</p>
            </div>
        </div>
    );

    // ── Success State ──
    if (isSubmitted) return (
        <div style={{ minHeight: '100vh', background: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: "'Inter', sans-serif" }}>
            <div style={{ background: 'rgba(30,41,59,0.5)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.1)', maxWidth: '500px', width: '100%', borderRadius: '32px', padding: '60px 40px', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
                <div style={{ width: '80px', height: '80px', background: 'rgba(16,185,129,0.1)', borderRadius: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', margin: '0 auto 32px', boxShadow: '0 0 20px rgba(16, 185, 129, 0.2)' }}>
                    <LucideCheckCircle size={40} />
                </div>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#fff', marginBottom: '16px', letterSpacing: '-0.02em' }}>Feedback Received!</h2>
                <p style={{ color: '#94a3b8', lineHeight: '1.6', fontSize: '1.05rem' }}>{form.settings?.successMessage || 'Thank you for your feedback!'}</p>
            </div>
        </div>
    );

    const formTitle = form.name || form.title || 'Feedback Form';

    // ── Form Render ──
    return (
        <div style={{ minHeight: '100vh', background: '#020617', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px 80px', fontFamily: "'Inter', sans-serif" }}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
                .feedback-glass-card {
                    background: rgba(30,41,59,0.4);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 32px;
                    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
                }
            `}</style>

            <div className="feedback-glass-card" style={{ width: '100%', maxWidth: '660px', padding: '50px 44px' }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '50px' }}>
                    {leadInfo?.name && (
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: 'rgba(201, 146, 26, 0.12)',
                            border: '1px solid rgba(201, 146, 26, 0.3)',
                            borderRadius: '100px',
                            padding: '8px 22px',
                            marginBottom: '20px',
                            boxShadow: '0 4px 15px rgba(201, 146, 26, 0.15)'
                        }}>
                            <span style={{ fontSize: '0.95rem', color: '#f8fafc', fontWeight: 600 }}>
                                Welcome, <span style={{ color: '#c9921a', fontWeight: 800 }}>{leadInfo.name}</span> 👋
                            </span>
                        </div>
                    )}
                    <h1 style={{ fontSize: '2.1rem', fontWeight: 900, color: '#fff', marginBottom: '12px', letterSpacing: '-0.03em', lineHeight: 1.2 }}>
                        {formTitle}
                    </h1>
                    {form.description && (
                        <p style={{ color: '#94a3b8', fontSize: '1rem', lineHeight: '1.6' }}>{form.description}</p>
                    )}
                    {/* Section title if not default */}
                    {form.sections?.[0]?.title && form.sections[0].title !== 'Basic Information' && (
                        <div style={{ marginTop: '16px', padding: '8px 20px', background: 'rgba(201, 146, 26, 0.1)', borderRadius: '100px', display: 'inline-block' }}>
                            <span style={{ color: '#c9921a', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {form.sections[0].title}
                            </span>
                        </div>
                    )}
                    {form.sections?.[0]?.description && (
                        <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '12px', lineHeight: '1.5' }}>{form.sections[0].description}</p>
                    )}
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '36px' }}>
                    {form.sections?.map(section => (
                        <div key={section.id || section._id}>
                            {form.sections.length > 1 && (
                                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#c9921a', marginBottom: '24px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                    {section.title}
                                </h3>
                            )}
                            {section.fields?.map(field => (
                                <div key={field.id || field._id} style={{ marginBottom: '32px' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                        {field.label}
                                        {field.required && <span style={{ color: '#ef4444', marginLeft: '4px' }}>*</span>}
                                    </label>
                                    {field.helpText && (
                                        <p style={{ color: '#64748b', fontSize: '0.82rem', marginBottom: '10px', lineHeight: '1.5' }}>{field.helpText}</p>
                                    )}
                                    <FieldRenderer
                                        field={field}
                                        value={responses[field.id]}
                                        onChange={(val) => setResponses(prev => ({ ...prev, [field.id]: val }))}
                                        activityDetails={activityDetails}
                                    />
                                </div>
                            ))}
                        </div>
                    ))}

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        style={{
                            background: isSubmitting ? 'rgba(201,146,26,0.5)' : 'linear-gradient(135deg, #c9921a 0%, #b08014 100%)',
                            color: '#020617', border: 'none', padding: '20px', borderRadius: '16px',
                            fontSize: '1.05rem', fontWeight: 900, cursor: isSubmitting ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
                            textTransform: 'uppercase', letterSpacing: '0.05em',
                            boxShadow: isSubmitting ? 'none' : '0 10px 25px -5px rgba(201, 146, 26, 0.4)',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                        onMouseEnter={e => { if (!isSubmitting) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 15px 30px -5px rgba(201, 146, 26, 0.5)'; } }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(201, 146, 26, 0.4)'; }}
                    >
                        {isSubmitting ? (
                            <>
                                <div style={{ width: '18px', height: '18px', border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                                Submitting...
                            </>
                        ) : (
                            <>Submit Feedback <LucideSend size={18} /></>
                        )}
                    </button>
                </form>

                {/* Footer */}
                <div style={{ marginTop: '40px', paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
                    <p style={{ margin: 0, color: '#475569', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        <i className="fas fa-heart" style={{ color: '#ef4444', marginRight: '8px' }}></i>
                        Your feedback helps us grow
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PublicFeedbackForm;
