import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../utils/api';
import toast from 'react-hot-toast';
import {
    LucideNavigation,
    LucideStar,
    LucideCheckCircle2,
    LucideLock,
    LucideMapPin,
    LucidePhone,
    LucideMessageCircle,
    LucideBuilding2,
    LucideHome,
    LucideMaximize2,
    LucideCompass,
    LucideSparkles,
    LucideChevronLeft,
    LucideChevronRight,
    LucideShieldCheck,
    LucideCalendar,
    LucideClock,
    LucideAlertCircle,
    LucideSend
} from 'lucide-react';

export default function ClientSiteVisitJourneyPage() {
    const { token } = useParams();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [journey, setJourney] = useState(null);

    // Active carousel image index per property index
    const [carouselIndices, setCarouselIndices] = useState({});

    // Feedback modal state
    const [activeModalProperty, setActiveModalProperty] = useState(null);
    const [rating, setRating] = useState(5);
    const [hoverRating, setHoverRating] = useState(0);
    const [interest, setInterest] = useState('Interested');
    const [comments, setComments] = useState('');
    const [revisitRequested, setRevisitRequested] = useState(false);
    const [submittingFeedback, setSubmittingFeedback] = useState(false);

    // Fetch Journey Data
    const fetchJourney = async () => {
        try {
            const res = await api.get(`/public/site-visit/journey/${token}`);
            if (res.data?.success && res.data?.data) {
                setJourney(res.data.data);
                setError(null);
            } else {
                setError(res.data?.message || 'Unable to load site visit journey.');
            }
        } catch (err) {
            console.error('[ClientJourney] Error fetching journey:', err);
            const status = err.response?.status;
            if (status === 410) {
                setError('This site visit has been cancelled. Please contact your advisor.');
            } else if (status === 403) {
                setError('This journey link has expired or is no longer valid.');
            } else {
                setError(err.response?.data?.message || 'Unable to load site visit journey. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (token) {
            fetchJourney();
        } else {
            setError('No journey token provided.');
            setLoading(false);
        }
    }, [token]);

    // Handle Google Maps Navigation Click
    const handleNavigate = async (property) => {
        const navUrl = property.location?.navigationUrl;
        if (!navUrl) {
            toast.error('Navigation link is not available for this property.');
            return;
        }

        // Open Google Maps intent immediately for native app handoff
        window.open(navUrl, '_blank', 'noopener,noreferrer');

        // Record navigation event in backend
        try {
            const propId = property.inventoryId || property.order;
            await api.post(`/public/site-visit/journey/${token}/navigate/${propId}`);
            // Optimistically update local property status to NAVIGATED if not submitted
            setJourney(prev => {
                if (!prev) return prev;
                const updatedProps = prev.properties.map(p => {
                    if (p.order === property.order && p.status === 'READY') {
                        return { ...p, status: 'NAVIGATED', navigatedAt: new Date().toISOString() };
                    }
                    return p;
                });
                return { ...prev, properties: updatedProps };
            });
        } catch (err) {
            console.warn('[ClientJourney] Navigation log failed:', err.message);
        }
    };

    // Open Feedback Modal
    const openFeedbackModal = (property) => {
        setActiveModalProperty(property);
        setRating(5);
        setHoverRating(0);
        setInterest('Interested');
        setComments('');
        setRevisitRequested(false);
    };

    // Close Feedback Modal
    const closeFeedbackModal = () => {
        if (submittingFeedback) return;
        setActiveModalProperty(null);
    };

    // Submit Feedback
    const handleSubmitFeedback = async (e) => {
        e.preventDefault();
        if (!activeModalProperty) return;

        if (!rating || rating < 1 || rating > 5) {
            toast.error('Please select a star rating between 1 and 5.');
            return;
        }

        setSubmittingFeedback(true);
        const propId = activeModalProperty.inventoryId || activeModalProperty.order;

        try {
            const payload = {
                rating,
                interest,
                comments,
                revisitRequested
            };

            const res = await api.post(`/public/site-visit/journey/${token}/feedback/${propId}`, payload);
            if (res.data?.success) {
                toast.success(res.data?.message || 'Feedback recorded successfully!');
                setActiveModalProperty(null);
                // Refresh journey data to reveal next unlocked property
                await fetchJourney();
            } else {
                toast.error(res.data?.message || 'Failed to submit feedback.');
            }
        } catch (err) {
            console.error('[ClientJourney] Feedback error:', err);
            toast.error(err.response?.data?.message || 'Failed to submit feedback. Please try again.');
        } finally {
            setSubmittingFeedback(false);
        }
    };

    // Carousel Image Navigation
    const handleCarouselNav = (propertyIndex, direction, totalImages) => {
        setCarouselIndices(prev => {
            const current = prev[propertyIndex] || 0;
            const nextIdx = direction === 'next'
                ? (current + 1) % totalImages
                : (current - 1 + totalImages) % totalImages;
            return { ...prev, [propertyIndex]: nextIdx };
        });
    };

    // Formatted Scheduled Date
    const formattedDate = useMemo(() => {
        if (!journey?.scheduledDate) return '';
        try {
            return new Date(journey.scheduledDate).toLocaleDateString('en-IN', {
                weekday: 'long',
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (_) {
            return journey.scheduledDate;
        }
    }, [journey?.scheduledDate]);

    // Progress Percentage
    const progressPercent = useMemo(() => {
        if (!journey?.totalProperties) return 0;
        return Math.round((journey.completedProperties / journey.totalProperties) * 100);
    }, [journey]);

    // ─────────────────────────────────────────────────────────────
    // Loading State
    // ─────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #0b0f19 0%, #111827 50%, #0b0f19 100%)',
                color: '#fff',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
                fontFamily: "'Inter', -apple-system, sans-serif"
            }}>
                <div style={{
                    width: '48px',
                    height: '48px',
                    border: '3px solid rgba(217, 119, 6, 0.2)',
                    borderTopColor: '#d97706',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                }}></div>
                <div style={{ marginTop: '20px', fontSize: '1rem', fontWeight: 600, color: '#f3f4f6' }}>
                    Loading Your Site Visit Itinerary...
                </div>
                <div style={{ marginTop: '6px', fontSize: '0.8rem', color: '#9ca3af' }}>
                    Bharat Properties Experience
                </div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────────
    // Error State
    // ─────────────────────────────────────────────────────────────
    if (error) {
        return (
            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #0b0f19 0%, #111827 100%)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
                fontFamily: "'Inter', -apple-system, sans-serif"
            }}>
                <div style={{
                    maxWidth: '420px',
                    width: '100%',
                    background: 'rgba(30, 41, 59, 0.7)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '20px',
                    padding: '32px 24px',
                    textAlign: 'center'
                }}>
                    <div style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '50%',
                        background: 'rgba(239, 68, 68, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 16px',
                        color: '#ef4444'
                    }}>
                        <LucideAlertCircle size={32} />
                    </div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>
                        Notice
                    </h2>
                    <p style={{ fontSize: '0.9rem', color: '#94a3b8', lineHeight: 1.5, marginBottom: '24px' }}>
                        {error}
                    </p>
                    <a
                        href="tel:+919999999999"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            background: '#d97706',
                            color: '#fff',
                            textDecoration: 'none',
                            padding: '12px 24px',
                            borderRadius: '12px',
                            fontSize: '0.9rem',
                            fontWeight: 600
                        }}
                    >
                        <LucidePhone size={16} /> Contact Office Support
                    </a>
                </div>
            </div>
        );
    }

    const { properties = [], salesperson = {}, clientName = 'Valued Client' } = journey || {};

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(180deg, #07090e 0%, #0d121f 40%, #07090e 100%)',
            color: '#f8fafc',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            paddingBottom: '80px'
        }}>
            {/* ── TOP LUXURY BRAND HEADER ── */}
            <header style={{
                background: 'rgba(11, 15, 25, 0.85)',
                backdropFilter: 'blur(12px)',
                borderBottom: '1px solid rgba(217, 119, 6, 0.2)',
                position: 'sticky',
                top: 0,
                zIndex: 40,
                padding: '14px 20px'
            }}>
                <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            boxShadow: '0 4px 12px rgba(217, 119, 6, 0.3)'
                        }}>
                            <LucideBuilding2 size={20} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 800, letterSpacing: '0.3px', color: '#f8fafc' }}>
                                BHARAT PROPERTIES
                            </div>
                            <div style={{ fontSize: '0.65rem', color: '#d97706', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                                Client Journey Experience
                            </div>
                        </div>
                    </div>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: 'rgba(16, 185, 129, 0.1)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        borderRadius: '20px',
                        padding: '4px 10px',
                        fontSize: '0.7rem',
                        color: '#10b981',
                        fontWeight: 600
                    }}>
                        <LucideShieldCheck size={13} />
                        Verified Visit
                    </div>
                </div>
            </header>

            {/* ── MAIN CONTENT CONTAINER ── */}
            <main style={{ maxWidth: '640px', margin: '0 auto', padding: '20px 16px' }}>

                {/* ── CLIENT GREETING & SCHEDULE CARD ── */}
                <div style={{
                    background: 'radial-gradient(ellipse at top, rgba(217, 119, 6, 0.12) 0%, rgba(15, 23, 42, 0.6) 80%)',
                    border: '1px solid rgba(217, 119, 6, 0.25)',
                    borderRadius: '20px',
                    padding: '22px 20px',
                    marginBottom: '20px',
                    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.25)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#d97706', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                        <LucideSparkles size={16} />
                        Welcome to your curated tour
                    </div>
                    <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', margin: '0 0 12px' }}>
                        Hello, {clientName}
                    </h1>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', fontSize: '0.8rem', color: '#94a3b8' }}>
                        {formattedDate && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <LucideCalendar size={15} style={{ color: '#d97706' }} />
                                {formattedDate}
                            </div>
                        )}
                        {journey?.scheduledTime && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <LucideClock size={15} style={{ color: '#d97706' }} />
                                {journey.scheduledTime}
                            </div>
                        )}
                    </div>

                    {/* Progress Bar */}
                    <div style={{ marginTop: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600, marginBottom: '6px' }}>
                            <span style={{ color: '#cbd5e1' }}>Itinerary Progress</span>
                            <span style={{ color: '#d97706' }}>
                                {journey?.completedProperties} of {journey?.totalProperties} Completed ({progressPercent}%)
                            </span>
                        </div>
                        <div style={{
                            width: '100%',
                            height: '8px',
                            background: 'rgba(255, 255, 255, 0.08)',
                            borderRadius: '4px',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                width: `${progressPercent}%`,
                                height: '100%',
                                background: 'linear-gradient(90deg, #d97706 0%, #10b981 100%)',
                                borderRadius: '4px',
                                transition: 'width 0.4s ease'
                            }} />
                        </div>
                    </div>
                </div>

                {/* ── DEDICATED ADVISOR CARD ── */}
                {salesperson?.name && (
                    <div style={{
                        background: 'rgba(30, 41, 59, 0.45)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '16px',
                        padding: '14px 18px',
                        marginBottom: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                background: 'rgba(217, 119, 6, 0.15)',
                                color: '#d97706',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '1rem'
                            }}>
                                {salesperson.name.charAt(0)}
                            </div>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Dedicated Advisor
                                </div>
                                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc' }}>
                                    {salesperson.name}
                                </div>
                            </div>
                        </div>

                        {salesperson.mobile && (
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <a
                                    href={`tel:${salesperson.mobile}`}
                                    aria-label="Call Advisor"
                                    style={{
                                        width: '38px',
                                        height: '38px',
                                        borderRadius: '10px',
                                        background: 'rgba(255, 255, 255, 0.06)',
                                        border: '1px solid rgba(255, 255, 255, 0.12)',
                                        color: '#38bdf8',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        textDecoration: 'none'
                                    }}
                                >
                                    <LucidePhone size={18} />
                                </a>
                                <a
                                    href={`https://wa.me/${salesperson.mobile.replace(/[^0-9]/g, '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="WhatsApp Advisor"
                                    style={{
                                        width: '38px',
                                        height: '38px',
                                        borderRadius: '10px',
                                        background: 'rgba(37, 211, 102, 0.12)',
                                        border: '1px solid rgba(37, 211, 102, 0.3)',
                                        color: '#25d366',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        textDecoration: 'none'
                                    }}
                                >
                                    <LucideMessageCircle size={18} />
                                </a>
                            </div>
                        )}
                    </div>
                )}

                {/* ── ALL VISITS COMPLETED CELEBRATION ── */}
                {journey?.isJourneyCompleted && (
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(6, 78, 59, 0.25) 100%)',
                        border: '1px solid rgba(16, 185, 129, 0.35)',
                        borderRadius: '20px',
                        padding: '24px 20px',
                        textAlign: 'center',
                        marginBottom: '28px',
                        boxShadow: '0 8px 24px rgba(16, 185, 129, 0.1)'
                    }}>
                        <div style={{
                            width: '54px',
                            height: '54px',
                            borderRadius: '50%',
                            background: 'rgba(16, 185, 129, 0.2)',
                            color: '#10b981',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 14px'
                        }}>
                            <LucideCheckCircle2 size={32} />
                        </div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', marginBottom: '8px' }}>
                            Site Visit Journey Complete!
                        </h2>
                        <p style={{ fontSize: '0.88rem', color: '#cbd5e1', lineHeight: 1.5, maxWidth: '480px', margin: '0 auto' }}>
                            Thank you for completing feedback for all properties on today&apos;s tour. Your feedback has been synchronized with your advisor to finalize shortlisting and next steps.
                        </p>
                    </div>
                )}

                {/* ── SECTION HEADER ── */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                        Properties on Today&apos;s Tour
                    </h2>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        Sequential Gate Enabled
                    </span>
                </div>

                {/* ── PROPERTIES LIST ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {properties.map((prop, index) => {
                        const isLocked = prop.isLocked === true;
                        const isSubmitted = prop.status === 'FEEDBACK_SUBMITTED';
                        const isNavigated = prop.status === 'NAVIGATED';
                        const isReady = prop.status === 'READY';
                        const currentImgIdx = carouselIndices[index] || 0;
                        const images = Array.isArray(prop.images) && prop.images.length > 0
                            ? prop.images
                            : ['https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80'];

                        // ── LOCKED CARD RENDERING ──
                        if (isLocked) {
                            return (
                                <div
                                    key={prop.inventoryId || index}
                                    style={{
                                        background: 'rgba(15, 23, 42, 0.4)',
                                        border: '1px dashed rgba(255, 255, 255, 0.12)',
                                        borderRadius: '18px',
                                        padding: '22px 20px',
                                        opacity: 0.75,
                                        position: 'relative'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                        <div style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            background: 'rgba(255, 255, 255, 0.05)',
                                            border: '1px solid rgba(255, 255, 255, 0.1)',
                                            borderRadius: '8px',
                                            padding: '4px 10px',
                                            fontSize: '0.7rem',
                                            color: '#94a3b8',
                                            fontWeight: 700
                                        }}>
                                            STOP {index + 1}
                                        </div>
                                        <div style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            color: '#f59e0b',
                                            fontSize: '0.75rem',
                                            fontWeight: 700
                                        }}>
                                            <LucideLock size={14} />
                                            LOCKED
                                        </div>
                                    </div>

                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0', margin: '0 0 6px' }}>
                                        {prop.project || `Property ${index + 1}`}
                                    </h3>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <LucideMapPin size={14} />
                                        {prop.location?.city || 'Gurugram'} • Unit Details Protected
                                    </div>

                                    <div style={{
                                        marginTop: '16px',
                                        padding: '12px 14px',
                                        background: 'rgba(245, 158, 11, 0.06)',
                                        border: '1px solid rgba(245, 158, 11, 0.2)',
                                        borderRadius: '10px',
                                        fontSize: '0.78rem',
                                        color: '#f59e0b',
                                        lineHeight: 1.4
                                    }}>
                                        🔒 Unit number, price, and Google Maps directions will unlock automatically after you submit feedback for Property {index}.
                                    </div>
                                </div>
                            );
                        }

                        // ── UNLOCKED / ACTIVE / COMPLETED CARD RENDERING ──
                        return (
                            <div
                                key={prop.inventoryId || index}
                                style={{
                                    background: isSubmitted
                                        ? 'rgba(15, 23, 42, 0.5)'
                                        : 'rgba(30, 41, 59, 0.55)',
                                    backdropFilter: 'blur(16px)',
                                    border: isSubmitted
                                        ? '1px solid rgba(16, 185, 129, 0.3)'
                                        : (isNavigated
                                            ? '1px solid rgba(56, 189, 248, 0.45)'
                                            : '1px solid rgba(217, 119, 6, 0.4)'),
                                    borderRadius: '20px',
                                    overflow: 'hidden',
                                    boxShadow: isReady || isNavigated
                                        ? '0 12px 36px rgba(0, 0, 0, 0.35)'
                                        : 'none'
                                }}
                            >
                                {/* ── PHOTO CAROUSEL ── */}
                                <div style={{ position: 'relative', width: '100%', height: '210px', background: '#020617' }}>
                                    <img
                                        src={images[currentImgIdx]}
                                        alt={prop.project}
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'cover'
                                        }}
                                        loading="lazy"
                                    />
                                    {/* Dark Gradient Overlay */}
                                    <div style={{
                                        position: 'absolute',
                                        inset: 0,
                                        background: 'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.7) 100%)'
                                    }} />

                                    {/* Top Stop Badge & Status */}
                                    <div style={{
                                        position: 'absolute',
                                        top: '12px',
                                        left: '14px',
                                        right: '14px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <div style={{
                                            background: 'rgba(15, 23, 42, 0.85)',
                                            backdropFilter: 'blur(8px)',
                                            border: '1px solid rgba(255, 255, 255, 0.15)',
                                            borderRadius: '8px',
                                            padding: '4px 10px',
                                            fontSize: '0.7rem',
                                            fontWeight: 800,
                                            color: '#f8fafc'
                                        }}>
                                            STOP {index + 1} OF {properties.length}
                                        </div>

                                        {isSubmitted && (
                                            <div style={{
                                                background: 'rgba(16, 185, 129, 0.9)',
                                                borderRadius: '20px',
                                                padding: '4px 12px',
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                color: '#fff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '5px'
                                            }}>
                                                <LucideCheckCircle2 size={13} />
                                                Feedback Accepted
                                            </div>
                                        )}

                                        {isNavigated && !isSubmitted && (
                                            <div style={{
                                                background: 'rgba(14, 165, 233, 0.9)',
                                                borderRadius: '20px',
                                                padding: '4px 12px',
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                color: '#fff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '5px'
                                            }}>
                                                <LucideNavigation size={13} />
                                                Navigating
                                            </div>
                                        )}

                                        {isReady && !isNavigated && !isSubmitted && (
                                            <div style={{
                                                background: 'rgba(217, 119, 6, 0.95)',
                                                borderRadius: '20px',
                                                padding: '4px 12px',
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                color: '#fff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '5px'
                                            }}>
                                                🟢 Ready to Visit
                                            </div>
                                        )}
                                    </div>

                                    {/* Carousel Controls if multiple images */}
                                    {images.length > 1 && (
                                        <>
                                            <button
                                                onClick={() => handleCarouselNav(index, 'prev', images.length)}
                                                aria-label="Previous Photo"
                                                style={{
                                                    position: 'absolute',
                                                    left: '8px',
                                                    top: '50%',
                                                    transform: 'translateY(-50%)',
                                                    width: '32px',
                                                    height: '32px',
                                                    borderRadius: '50%',
                                                    background: 'rgba(15, 23, 42, 0.75)',
                                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                                    color: '#fff',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <LucideChevronLeft size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleCarouselNav(index, 'next', images.length)}
                                                aria-label="Next Photo"
                                                style={{
                                                    position: 'absolute',
                                                    right: '8px',
                                                    top: '50%',
                                                    transform: 'translateY(-50%)',
                                                    width: '32px',
                                                    height: '32px',
                                                    borderRadius: '50%',
                                                    background: 'rgba(15, 23, 42, 0.75)',
                                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                                    color: '#fff',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <LucideChevronRight size={18} />
                                            </button>

                                            {/* Dots Indicator */}
                                            <div style={{
                                                position: 'absolute',
                                                bottom: '10px',
                                                left: 0,
                                                right: 0,
                                                display: 'flex',
                                                justifyContent: 'center',
                                                gap: '6px'
                                            }}>
                                                {images.map((_, dotIdx) => (
                                                    <div
                                                        key={dotIdx}
                                                        style={{
                                                            width: dotIdx === currentImgIdx ? '16px' : '6px',
                                                            height: '6px',
                                                            borderRadius: '3px',
                                                            background: dotIdx === currentImgIdx ? '#d97706' : 'rgba(255, 255, 255, 0.4)',
                                                            transition: 'all 0.2s'
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* ── CARD DETAILS BODY ── */}
                                <div style={{ padding: '20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                                        <div>
                                            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', margin: '0 0 4px' }}>
                                                {prop.project}
                                            </h3>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#d97706' }}>
                                                {prop.unit ? `${prop.unit}` : ''} {prop.block ? `(${prop.block})` : ''}
                                            </div>
                                        </div>
                                        {prop.price && (
                                            <div style={{
                                                fontSize: '1.15rem',
                                                fontWeight: 800,
                                                color: '#10b981',
                                                background: 'rgba(16, 185, 129, 0.1)',
                                                border: '1px solid rgba(16, 185, 129, 0.25)',
                                                borderRadius: '10px',
                                                padding: '6px 12px'
                                            }}>
                                                {prop.price}
                                            </div>
                                        )}
                                    </div>

                                    {/* Location */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontSize: '0.8rem', marginBottom: '16px' }}>
                                        <LucideMapPin size={15} style={{ color: '#d97706', flexShrink: 0 }} />
                                        <span>{prop.location?.address || 'Gurugram, Haryana'}</span>
                                    </div>

                                    {/* Specification Chips */}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                                        {prop.size && (
                                            <div style={{
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                                borderRadius: '8px',
                                                padding: '5px 10px',
                                                fontSize: '0.75rem',
                                                color: '#cbd5e1',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '5px'
                                            }}>
                                                <LucideMaximize2 size={13} style={{ color: '#38bdf8' }} />
                                                {prop.size}
                                            </div>
                                        )}
                                        {prop.category && (
                                            <div style={{
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                                borderRadius: '8px',
                                                padding: '5px 10px',
                                                fontSize: '0.75rem',
                                                color: '#cbd5e1',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '5px'
                                            }}>
                                                <LucideHome size={13} style={{ color: '#a855f7' }} />
                                                {prop.category}
                                            </div>
                                        )}
                                        {prop.facing && (
                                            <div style={{
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                                borderRadius: '8px',
                                                padding: '5px 10px',
                                                fontSize: '0.75rem',
                                                color: '#cbd5e1',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '5px'
                                            }}>
                                                <LucideCompass size={13} style={{ color: '#ec4899' }} />
                                                Facing: {prop.facing}
                                            </div>
                                        )}
                                    </div>

                                    {/* ── ALREADY SUBMITTED FEEDBACK SUMMARY ── */}
                                    {isSubmitted && (
                                        <div style={{
                                            background: 'rgba(16, 185, 129, 0.07)',
                                            border: '1px solid rgba(16, 185, 129, 0.2)',
                                            borderRadius: '12px',
                                            padding: '12px 14px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '12px'
                                        }}>
                                            <div>
                                                <div style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 700, textTransform: 'uppercase' }}>
                                                    Your Rating
                                                </div>
                                                <div style={{ display: 'flex', gap: '3px', marginTop: '3px' }}>
                                                    {[1, 2, 3, 4, 5].map(s => (
                                                        <LucideStar
                                                            key={s}
                                                            size={15}
                                                            style={{
                                                                color: s <= (prop.clientRating || 5) ? '#eab308' : '#475569',
                                                                fill: s <= (prop.clientRating || 5) ? '#eab308' : 'none'
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                            {prop.clientInterest && (
                                                <div style={{
                                                    background: 'rgba(255, 255, 255, 0.06)',
                                                    borderRadius: '8px',
                                                    padding: '4px 10px',
                                                    fontSize: '0.75rem',
                                                    color: '#e2e8f0',
                                                    fontWeight: 600
                                                }}>
                                                    {prop.clientInterest}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* ── ACTION BUTTONS FOR ACTIVE / IN-PROGRESS PROPERTY ── */}
                                    {!isSubmitted && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            {/* Google Maps Driving Navigation Button */}
                                            {prop.location?.navigationUrl && (
                                                <button
                                                    onClick={() => handleNavigate(prop)}
                                                    style={{
                                                        width: '100%',
                                                        padding: '14px',
                                                        borderRadius: '12px',
                                                        border: 'none',
                                                        background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                                                        color: '#fff',
                                                        fontSize: '0.92rem',
                                                        fontWeight: 700,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: '8px',
                                                        cursor: 'pointer',
                                                        boxShadow: '0 4px 14px rgba(2, 132, 199, 0.3)'
                                                    }}
                                                >
                                                    <LucideNavigation size={18} />
                                                    Navigate with Google Maps
                                                </button>
                                            )}

                                            {/* Primary Feedback CTA */}
                                            <button
                                                onClick={() => openFeedbackModal(prop)}
                                                style={{
                                                    width: '100%',
                                                    padding: '14px',
                                                    borderRadius: '12px',
                                                    border: 'none',
                                                    background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                                                    color: '#fff',
                                                    fontSize: '0.92rem',
                                                    fontWeight: 700,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '8px',
                                                    cursor: 'pointer',
                                                    boxShadow: '0 4px 14px rgba(217, 119, 6, 0.3)'
                                                }}
                                            >
                                                <LucideStar size={18} />
                                                Submit Property Feedback
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </main>

            {/* ── PER-PROPERTY FEEDBACK MODAL ── */}
            {activeModalProperty && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 50,
                    background: 'rgba(0, 0, 0, 0.75)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    padding: '0 0 20px 0'
                }}>
                    <div style={{
                        maxWidth: '520px',
                        width: '100%',
                        background: '#0f172a',
                        border: '1px solid rgba(217, 119, 6, 0.3)',
                        borderRadius: '24px',
                        padding: '24px 20px',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                        margin: '0 12px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: '#d97706', fontWeight: 800, textTransform: 'uppercase' }}>
                                    Your Honest Impression
                                </div>
                                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f8fafc', margin: '2px 0 0' }}>
                                    {activeModalProperty.project}
                                </h3>
                                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                    {activeModalProperty.unit ? `${activeModalProperty.unit}` : ''}
                                </div>
                            </div>
                            <button
                                onClick={closeFeedbackModal}
                                disabled={submittingFeedback}
                                style={{
                                    background: 'rgba(255, 255, 255, 0.08)',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '32px',
                                    height: '32px',
                                    color: '#cbd5e1',
                                    fontSize: '1rem',
                                    cursor: 'pointer'
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSubmitFeedback}>
                            {/* Star Rating */}
                            <div style={{ textAlign: 'center', margin: '20px 0 24px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '10px' }}>
                                    How would you rate this property?
                                </label>
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                                    {[1, 2, 3, 4, 5].map(star => {
                                        const isFilled = (hoverRating || rating) >= star;
                                        return (
                                            <button
                                                key={star}
                                                type="button"
                                                onClick={() => setRating(star)}
                                                onMouseEnter={() => setHoverRating(star)}
                                                onMouseLeave={() => setHoverRating(0)}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    padding: '4px',
                                                    transition: 'transform 0.15s'
                                                }}
                                            >
                                                <LucideStar
                                                    size={34}
                                                    style={{
                                                        color: isFilled ? '#f59e0b' : '#334155',
                                                        fill: isFilled ? '#f59e0b' : 'none'
                                                    }}
                                                />
                                            </button>
                                        );
                                    })}
                                </div>
                                <div style={{ marginTop: '8px', fontSize: '0.8rem', fontWeight: 700, color: '#f59e0b' }}>
                                    {rating === 5 && 'Outstanding • Loved It'}
                                    {rating === 4 && 'Very Good • Strong Option'}
                                    {rating === 3 && 'Average • Meets Baseline'}
                                    {rating === 2 && 'Below Expectation'}
                                    {rating === 1 && 'Not Suitable'}
                                </div>
                            </div>

                            {/* Interest Level Selection */}
                            <div style={{ marginBottom: '18px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '8px' }}>
                                    Your Interest Level
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                                    {['Very Interested', 'Interested', 'Shortlisted', 'Not Interested'].map(opt => (
                                        <button
                                            key={opt}
                                            type="button"
                                            onClick={() => setInterest(opt)}
                                            style={{
                                                padding: '10px 12px',
                                                borderRadius: '10px',
                                                fontSize: '0.8rem',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                border: interest === opt ? '1px solid #d97706' : '1px solid rgba(255, 255, 255, 0.1)',
                                                background: interest === opt ? 'rgba(217, 119, 6, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                                                color: interest === opt ? '#f59e0b' : '#94a3b8'
                                            }}
                                        >
                                            {opt}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Comments Textarea */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                                    Comments or Observations (Optional)
                                </label>
                                <textarea
                                    value={comments}
                                    onChange={(e) => setComments(e.target.value)}
                                    placeholder="What stood out? (Layout, view, sunlight, pricing...)"
                                    rows={3}
                                    style={{
                                        width: '100%',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        border: '1px solid rgba(255, 255, 255, 0.12)',
                                        borderRadius: '12px',
                                        padding: '10px 14px',
                                        fontSize: '0.85rem',
                                        color: '#f8fafc',
                                        outline: 'none',
                                        resize: 'none',
                                        fontFamily: 'inherit',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            {/* Revisit Checkbox */}
                            <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                marginBottom: '22px',
                                fontSize: '0.82rem',
                                color: '#cbd5e1',
                                cursor: 'pointer'
                            }}>
                                <input
                                    type="checkbox"
                                    checked={revisitRequested}
                                    onChange={(e) => setRevisitRequested(e.target.checked)}
                                    style={{
                                        width: '18px',
                                        height: '18px',
                                        accentColor: '#d97706',
                                        cursor: 'pointer'
                                    }}
                                />
                                <span>I would like to schedule a follow-up revisit for this unit</span>
                            </label>

                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={submittingFeedback}
                                style={{
                                    width: '100%',
                                    padding: '14px',
                                    borderRadius: '12px',
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                    color: '#fff',
                                    fontSize: '0.95rem',
                                    fontWeight: 700,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    cursor: submittingFeedback ? 'not-allowed' : 'pointer',
                                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
                                    opacity: submittingFeedback ? 0.7 : 1
                                }}
                            >
                                <LucideSend size={18} />
                                {submittingFeedback ? 'Recording Feedback...' : 'Confirm & Unlock Next Property'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
