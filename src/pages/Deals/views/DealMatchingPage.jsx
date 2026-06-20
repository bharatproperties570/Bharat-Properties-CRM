import { useTheme } from '../../../context/ThemeContext';
import { useMemo, useState, useEffect, useCallback } from 'react';
import ComposeEmailModal from '../../Communication/components/ComposeEmailModal';
import SendMessageModal from '../../../components/SendMessageModal';
import CreateActivityModal from '../../../components/CreateActivityModal';
import toast from 'react-hot-toast';
import { api } from '../../../utils/api';
import { useActivities } from '../../../context/ActivityContext';
import { usePropertyConfig } from '../../../context/PropertyConfigContext';
import { formatIndianCurrency, formatLeadBudget } from '../../../utils/numberToWords';

// Deal Match Template ID (from constants/templates.js)
const DEAL_MATCH_TEMPLATE_ID = 8;
const DEAL_MATCH_SMS_TEMPLATE_ID = 10;

const DealMatchingPage = ({ onNavigate, dealId }) => {
    const { isDark } = useTheme();
    const { addActivity } = useActivities();
    const { lookups, projects } = usePropertyConfig();

    // Core State
    const [deal, setDeal]                   = useState(null);
    const [matchedLeads, setMatchedLeads]   = useState([]);
    const [excludedLeads, setExcludedLeads] = useState([]);
    const [suggestions, setSuggestions]     = useState([]);
    const [preferredCount, setPreferredCount] = useState(0);
    const [excludedCount, setExcludedCount] = useState(0);
    const [loading, setLoading]             = useState(true);
    const [matchingLoading, setMatchingLoading] = useState(false);

    // UI State
    const [budgetFlexibility, setBudgetFlexibility] = useState(20);
    const [sizeFlexibility, setSizeFlexibility]     = useState(20);
    const [showOtherCities, setShowOtherCities]     = useState(false);
    const [showExcluded, setShowExcluded]           = useState(false);
    const [showSuggestions, setShowSuggestions]     = useState(true);
    const [selectedLeads, setSelectedLeads]         = useState([]);
    const [isMailOpen, setIsMailOpen]               = useState(false);
    const [isMessageOpen, setIsMessageOpen]         = useState(false);
    const [isActivityOpen, setIsActivityOpen]       = useState(false);
    const [selectedContactsForMail, setSelectedContactsForMail]       = useState([]);
    const [selectedContactsForMessage, setSelectedContactsForMessage] = useState([]);
    const [activityInitialData, setActivityInitialData]               = useState(null);
    const [mailSubject, setMailSubject] = useState('');
    const [mailBody, setMailBody]       = useState('');

    // 1. Fetch Deal
    useEffect(() => {
        if (!dealId) return;
        const fetchDeal = async () => {
            setLoading(true);
            try {
                const res = await api.get(`deals/${dealId}`);
                if (res.data?.success) setDeal(res.data.deal);
            } catch (err) {
                toast.error('Failed to load deal');
            } finally {
                setLoading(false);
            }
        };
        fetchDeal();
    }, [dealId]);

    // 2. Matching Engine
    const fetchMatches = useCallback(async () => {
        if (!dealId) return;
        setMatchingLoading(true);
        try {
            const res = await api.get('leads/match', {
                params: { dealId, budgetFlexibility, sizeFlexibility, showOtherCities }
            });
            if (res.data?.success) {
                setMatchedLeads(res.data.matchingLeads || []);
                setExcludedLeads(res.data.excluded || []);
                setSuggestions(res.data.suggestions || []);
                setPreferredCount(res.data.preferredCount || 0);
                setExcludedCount(res.data.excludedCount || 0);
            }
        } catch (err) {
            toast.error('Matching engine error');
        } finally {
            setMatchingLoading(false);
        }
    }, [dealId, budgetFlexibility, sizeFlexibility, showOtherCities]);

    useEffect(() => {
        const timer = setTimeout(fetchMatches, 400);
        return () => clearTimeout(timer);
    }, [fetchMatches]);

    // Resolver
    const renderVal = useCallback((v) => {
        if (v === null || v === undefined || v === '') return 'N/A';
        if (typeof v === 'object' && v.value !== undefined) return `${v.value} ${v.unit || ''}`.trim();
        if (typeof v === 'object' && (v.lookup_value || v.name || v.label)) return v.lookup_value || v.name || v.label;
        if (typeof v === 'string' && v.match(/^[0-9a-fA-F]{24}$/)) {
            const proj = projects?.find(p => p._id === v);
            if (proj) return proj.name;
            if (lookups) for (const g of Object.values(lookups)) { const f = g.find(l => l._id === v); if (f) return f.lookup_value; }
        }
        if (Array.isArray(v)) return v.length === 0 ? 'N/A' : v.map(i => renderVal(i)).join(', ');
        if (typeof v === 'object') return v.lookup_value || v.name || v.value || '';
        return String(v);
    }, [lookups, projects]);

    // WhatsApp Handlers (bypass for preferred matches, web for others)
    const handleWhatsApp = (lead) => {
        const msg = `Hi ${lead.firstName || 'there'}, I found a property matching your requirement: ${renderVal(deal?.propertyType)} at ${renderVal(deal?.location)}. Price: ${formatIndianCurrency(deal?.price)}. Interested?`;
        const encoded = encodeURIComponent(msg);
        if (lead.isPreferredMatch) {
            window.location.href = `whatsapp://send?phone=91${lead.mobile}&text=${encoded}`;
        } else {
            window.open(`https://wa.me/91${lead.mobile}?text=${encoded}`, '_blank');
        }
    };

    const handleBatchWhatsApp = () => {
        const selected = matchedLeads.filter(l => selectedLeads.includes(l.mobile));
        const loc = deal ? renderVal(deal.location) : '';
        const price = deal ? formatIndianCurrency(deal.price || 0) : '';
        selected.forEach(l => {
            const msg = `Hi ${l.firstName || 'there'}, we have a property matching your requirement at ${loc}. Price: ${price}. Interested?`;
            const encoded = encodeURIComponent(msg);
            if (l.isPreferredMatch) {
                window.location.href = `whatsapp://send?phone=91${l.mobile}&text=${encoded}`;
            } else {
                window.open(`https://wa.me/91${l.mobile}?text=${encoded}`, '_blank');
            }
        });
    };

    // Injects real deal data into the Deal Property Match template variables
    const buildDealEmailBody = useCallback((templateContent) => {
        if (!deal || !templateContent) return templateContent;
        const size = deal.size?.value || deal.size || 0;
        const sizeStr = size > 0 ? `${size} ${deal.sizeUnit || 'Sq.Ft.'}` : 'N/A';
        return templateContent
            .replace(/\{\{DealProject\}\}/g, deal.projectName || deal.inventoryId?.projectName || 'N/A')
            .replace(/\{\{DealLocation\}\}/g, renderVal(deal.location || deal.inventoryId?.address?.locality))
            .replace(/\{\{DealPrice\}\}/g, formatIndianCurrency(deal.price || deal.quotePrice || 0))
            .replace(/\{\{DealUnit\}\}/g, deal.unitNo || deal.inventoryId?.unitNo || 'N/A')
            .replace(/\{\{DealSize\}\}/g, sizeStr)
            .replace(/\{\{DealCategory\}\}/g, renderVal(deal.category || deal.inventoryId?.category))
            .replace(/\{\{DealSubCategory\}\}/g, renderVal(deal.subCategory || deal.inventoryId?.subCategory) !== 'N/A' ? renderVal(deal.subCategory || deal.inventoryId?.subCategory) : 'N/A')
            .replace(/\{\{DealBlock\}\}/g, deal.block || deal.inventoryId?.block || 'N/A')
            .replace(/\{\{DealStage\}\}/g, renderVal(deal.stage) || 'Available');
    }, [deal, renderVal]);

    const handleBatchMail = () => {
        const contactsForMail = matchedLeads.filter(l => selectedLeads.includes(l.mobile));
        setSelectedContactsForMail(contactsForMail);
        setIsMailOpen(true);
    };

    const handleBatchMessage = () => {
        setSelectedContactsForMessage(matchedLeads.filter(l => selectedLeads.includes(l.mobile)));
        setIsMessageOpen(true);
    };

    const handleSelectLead = (mobile) => {
        setSelectedLeads(prev => prev.includes(mobile) ? prev.filter(m => m !== mobile) : [...prev, mobile]);
    };

    const handleSelectAll = (e) => {
        setSelectedLeads(e.target.checked ? matchedLeads.map(l => l.mobile) : []);
    };

    // Score breakdown color
    const getScoreColor = (score) => score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#3b82f6';

    const getSeverityColor = (sev) => ({ high: '#ef4444', medium: '#f59e0b', low: '#3b82f6' })[sev] || '#6366f1';

    if (loading) return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '20px', background: isDark ? '#0f172a' : '#f8fafc' }}>
            <div className="loading-spinner"></div>
            <h3 style={{ fontWeight: 800, color: isDark ? '#e2e8f0' : '#1e293b' }}>Initializing Deal Match Engine...</h3>
        </div>
    );

    if (!deal) return <div style={{ padding: '40px', textAlign: 'center', color: isDark ? '#e2e8f0' : '#1e293b' }}>Deal not found.</div>;

    const bg   = isDark ? '#0f172a' : '#f1f5f9';
    const card = isDark ? 'rgba(255,255,255,0.04)' : '#ffffff';
    const brd  = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0';
    const txt  = isDark ? '#e2e8f0' : '#0f172a';
    const sub  = isDark ? '#94a3b8' : '#64748b';

    return (
        <div style={{ background: bg, minHeight: '100vh', padding: '24px', fontFamily: "'Inter', sans-serif" }}>

            {/* ─── HEADER ─── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button onClick={() => onNavigate('deals')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: card, border: `1px solid ${brd}`, borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', color: sub, transition: 'all 0.2s' }}>
                        <i className="fas fa-arrow-left" style={{ fontSize: '0.8rem' }}></i> Back to Deals
                    </button>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: txt, margin: 0 }}>Deal Match Center</h1>
                        <p style={{ margin: 0, color: sub, fontSize: '0.85rem' }}>
                            <span style={{ fontWeight: 700, color: '#2563eb' }}>{renderVal(deal.propertyType)}</span>
                            {deal.projectName ? ` · ${deal.projectName}` : ''}
                            {deal.unitNo ? ` · Unit ${deal.unitNo}` : ''}
                        </p>
                    </div>
                </div>
            </div>

            {/* ─── STATS BAR ─── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
                {[
                    { label: 'Total Matches', value: matchedLeads.length, icon: 'fa-users', color: '#2563eb', bg: isDark ? 'rgba(37,99,235,0.15)' : '#eff6ff' },
                    { label: 'Preferred Matches', value: preferredCount, icon: 'fa-star', color: '#f59e0b', bg: isDark ? 'rgba(245,158,11,0.15)' : '#fffbeb' },
                    { label: 'Excluded Leads', value: excludedCount, icon: 'fa-user-slash', color: '#ef4444', bg: isDark ? 'rgba(239,68,68,0.15)' : '#fef2f2' },
                    { label: 'Deal Price', value: formatIndianCurrency(deal.price || deal.quotePrice || 0), icon: 'fa-rupee-sign', color: '#10b981', bg: isDark ? 'rgba(16,185,129,0.15)' : '#ecfdf5' },
                ].map((stat, i) => (
                    <div key={i} style={{ background: stat.bg, border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'transparent'}`, borderRadius: '14px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className={`fas ${stat.icon}`} style={{ color: stat.color, fontSize: '1rem' }}></i>
                        </div>
                        <div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: stat.color, lineHeight: 1 }}>{matchingLoading ? '…' : stat.value}</div>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: sub, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{stat.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* ─── SMART SUGGESTIONS ─── */}
            {suggestions.length > 0 && (
                <div style={{ background: card, border: `1px solid ${brd}`, borderRadius: '16px', padding: '16px 20px', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showSuggestions ? '14px' : 0, cursor: 'pointer' }} onClick={() => setShowSuggestions(p => !p)}>
                        <span style={{ fontWeight: 800, fontSize: '0.85rem', color: txt, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-lightbulb" style={{ color: '#f59e0b' }}></i> AI Match Intelligence ({suggestions.length})
                        </span>
                        <i className={`fas fa-chevron-${showSuggestions ? 'up' : 'down'}`} style={{ color: sub, fontSize: '0.8rem' }}></i>
                    </div>
                    {showSuggestions && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {suggestions.map((s, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '10px 14px', borderRadius: '10px', background: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc', border: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9'}` }}>
                                    <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: getSeverityColor(s.severity) + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <i className={`fas ${s.icon}`} style={{ color: getSeverityColor(s.severity), fontSize: '0.75rem' }}></i>
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 800, fontSize: '0.82rem', color: txt, marginBottom: '2px' }}>{s.title}</div>
                                        <div style={{ fontSize: '0.75rem', color: sub }}>{s.message}</div>
                                    </div>
                                    <span style={{ marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', background: getSeverityColor(s.severity) + '20', color: getSeverityColor(s.severity), flexShrink: 0, alignSelf: 'flex-start' }}>
                                        {s.severity.toUpperCase()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px' }}>

                {/* ─── SIDE PANEL ─── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    {/* Deal Snapshot */}
                    <div style={{ background: card, border: `1px solid ${brd}`, borderRadius: '16px', padding: '20px' }}>
                        <h3 style={{ fontSize: '0.8rem', fontWeight: 800, color: sub, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>Deal Snapshot</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {[
                                { label: 'Project', value: deal.projectName || deal.inventoryId?.projectName || 'N/A' },
                                { label: 'Unit No', value: deal.unitNo || deal.inventoryId?.unitNo || '-' },
                                { label: 'Price', value: formatIndianCurrency(deal.price || deal.quotePrice), accent: true },
                                { label: 'Category', value: renderVal(deal.category || deal.inventoryId?.category) },
                                { label: 'Location', value: renderVal(deal.location || deal.inventoryId?.address?.locality) },
                                { label: 'Size', value: (() => { const s = deal.size?.value || deal.size || 0; if (s > 0) return `${s} ${deal.sizeUnit || 'Sq.Ft.'}`; return 'N/A'; })() },
                                { label: 'Stage', value: renderVal(deal.stage || 'Open') },
                            ].map((row, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < 6 ? `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc'}` : 'none' }}>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: sub, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{row.label}</span>
                                    <span style={{ fontSize: '0.82rem', fontWeight: 800, color: row.accent ? '#10b981' : txt }}>{row.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Refinement Engine */}
                    <div style={{ background: card, border: `1px solid ${brd}`, borderRadius: '16px', padding: '20px', position: 'sticky', top: '24px' }}>
                        <h3 style={{ fontSize: '0.8rem', fontWeight: 800, color: sub, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '20px' }}>Refinement Engine</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {[
                                { label: 'Budget Tolerance', value: budgetFlexibility, setter: setBudgetFlexibility, color: '#2563eb' },
                                { label: 'Size Tolerance', setter: setSizeFlexibility, value: sizeFlexibility, color: '#10b981' },
                            ].map((ctrl, i) => (
                                <div key={i}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <label style={{ fontSize: '0.82rem', fontWeight: 700, color: txt }}>{ctrl.label}</label>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: ctrl.color }}>±{ctrl.value}%</span>
                                    </div>
                                    <input type="range" min="0" max="100" value={ctrl.value} onChange={e => ctrl.setter(parseInt(e.target.value))} style={{ width: '100%', accentColor: ctrl.color, cursor: 'pointer' }} />
                                </div>
                            ))}

                            {/* City Toggle */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: '10px', background: showOtherCities ? (isDark ? 'rgba(37,99,235,0.15)' : '#eff6ff') : (isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc'), border: `1px solid ${showOtherCities ? '#bfdbfe' : brd}`, cursor: 'pointer', transition: 'all 0.2s' }} onClick={() => setShowOtherCities(p => !p)}>
                                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: showOtherCities ? '#2563eb' : sub }}>
                                    {showOtherCities ? '🌐 Showing All Cities' : '📍 Target City Only'}
                                </span>
                                <div style={{ width: '36px', height: '20px', background: showOtherCities ? '#3b82f6' : '#cbd5e1', borderRadius: '10px', position: 'relative', transition: 'background 0.2s' }}>
                                    <div style={{ width: '16px', height: '16px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: showOtherCities ? '18px' : '2px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Excluded Panel */}
                    {excludedCount > 0 && (
                        <div style={{ background: card, border: `1px solid ${isDark ? 'rgba(239,68,68,0.2)' : '#fecaca'}`, borderRadius: '16px', padding: '16px 20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: showExcluded ? '12px' : 0 }} onClick={() => setShowExcluded(p => !p)}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <i className="fas fa-user-slash"></i> {excludedCount} Leads Excluded
                                </span>
                                <i className={`fas fa-chevron-${showExcluded ? 'up' : 'down'}`} style={{ color: '#ef4444', fontSize: '0.75rem' }}></i>
                            </div>
                            {showExcluded && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
                                    {excludedLeads.map((l, i) => (
                                        <div key={i} style={{ padding: '8px 10px', borderRadius: '8px', background: isDark ? 'rgba(239,68,68,0.08)' : '#fef2f2', border: `1px solid ${isDark ? 'rgba(239,68,68,0.15)' : '#fecaca'}` }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.78rem', color: txt, marginBottom: '2px' }}>{l.name || 'Unknown'}</div>
                                            <div style={{ fontSize: '0.68rem', color: '#ef4444' }}>{l.excludeReason}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ─── MATCH RESULTS ─── */}
                <div style={{ position: 'relative' }}>
                    {matchingLoading && (
                        <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: '#2563eb', color: '#fff', padding: '4px 16px', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 800, zIndex: 10, boxShadow: '0 4px 12px rgba(37,99,235,0.3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className="fas fa-sync fa-spin"></i> UPDATING MATCHES...
                        </div>
                    )}

                    {/* Select All Bar */}
                    {matchedLeads.length > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px', marginBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <input type="checkbox" onChange={handleSelectAll} checked={selectedLeads.length === matchedLeads.length && matchedLeads.length > 0} style={{ width: '16px', height: '16px', accentColor: '#2563eb', cursor: 'pointer' }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: txt }}>{matchedLeads.length} Leads Matched</span>
                                    {preferredCount > 0 && (
                                        <span style={{ fontSize: '0.72rem', fontWeight: 800, background: '#f59e0b', color: '#fff', padding: '2px 8px', borderRadius: '100px' }}>
                                            <i className="fas fa-star" style={{ marginRight: '4px', fontSize: '0.6rem' }}></i>{preferredCount} Preferred
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', opacity: matchingLoading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
                        {matchedLeads.length === 0 ? (
                            <div style={{ background: card, border: `1px solid ${brd}`, padding: '80px', borderRadius: '20px', textAlign: 'center' }}>
                                <i className="fas fa-user-slash" style={{ fontSize: '2.5rem', color: '#cbd5e1', marginBottom: '16px' }}></i>
                                <h3 style={{ color: txt }}>No Matching Leads Found</h3>
                                <p style={{ color: sub }}>Try broadening budget/size tolerance or enable Show All Cities.</p>
                            </div>
                        ) : (
                            matchedLeads.map((lead) => {
                                const sb = lead.scoreBreakdown || {};
                                const isSelected = selectedLeads.includes(lead.mobile);
                                return (
                                    <div key={lead._id} style={{
                                        background: lead.isPreferredMatch ? (isDark ? 'rgba(245,158,11,0.06)' : '#fffdf0') : card,
                                        borderRadius: '16px',
                                        padding: '18px 20px',
                                        border: `1px solid ${isSelected ? '#2563eb' : lead.isPreferredMatch ? '#fde68a' : brd}`,
                                        boxShadow: isSelected ? '0 0 0 3px rgba(37,99,235,0.1)' : lead.isPreferredMatch ? '0 2px 8px rgba(245,158,11,0.1)' : '0 1px 3px rgba(0,0,0,0.04)',
                                        transition: 'all 0.2s'
                                    }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '24px 56px 1fr auto', gap: '14px', alignItems: 'start' }}>
                                            <input type="checkbox" checked={isSelected} onChange={() => handleSelectLead(lead.mobile)} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#2563eb', marginTop: '4px' }} />

                                            {/* Score Ring */}
                                            <div style={{ position: 'relative', width: '56px', height: '56px', flexShrink: 0 }}>
                                                <svg width="56" height="56" viewBox="0 0 64 64">
                                                    <circle cx="32" cy="32" r="28" fill="none" stroke={isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9'} strokeWidth="5" />
                                                    <circle cx="32" cy="32" r="28" fill="none" stroke={getScoreColor(lead.score)} strokeWidth="5" strokeDasharray="176" strokeDashoffset={176 * (1 - lead.score / 100)} transform="rotate(-90 32 32)" strokeLinecap="round" />
                                                </svg>
                                                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                                    <span style={{ fontWeight: 900, fontSize: '0.75rem', color: txt, lineHeight: 1 }}>{lead.score}%</span>
                                                    <span style={{ fontSize: '0.45rem', color: sub, fontWeight: 600 }}>MATCH</span>
                                                </div>
                                            </div>

                                            {/* Lead Info */}
                                            <div style={{ minWidth: 0 }}>
                                                {/* Name Row */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                                    <h4 style={{ margin: 0, color: txt, fontSize: '0.98rem', fontWeight: 800 }}>{lead.firstName} {lead.lastName}</h4>
                                                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#2563eb', background: isDark ? 'rgba(37,99,235,0.15)' : '#eff6ff', padding: '1px 7px', borderRadius: '20px', border: '1px solid #bfdbfe' }}>
                                                        {renderVal(lead.stage) !== 'N/A' ? renderVal(lead.stage) : 'Lead'}
                                                    </span>
                                                    {lead.isPreferredMatch && (
                                                        <span style={{ background: 'linear-gradient(135deg, #fef08a 0%, #f59e0b 100%)', color: '#78350f', padding: '2px 8px', borderRadius: '6px', fontSize: '0.62rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', boxShadow: '0 1px 4px rgba(245,158,11,0.3)' }}>
                                                            <i className="fas fa-star" style={{ marginRight: '4px' }}></i>Preferred
                                                        </span>
                                                    )}
                                                    {lead.sharedStatus && (
                                                        <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '1px 7px', borderRadius: '6px', background: lead.sharedStatus === 'hot' ? '#fef2f2' : lead.sharedStatus === 'recent' ? '#fffbeb' : '#f8fafc', color: lead.sharedStatus === 'hot' ? '#dc2626' : lead.sharedStatus === 'recent' ? '#d97706' : '#64748b', border: `1px solid ${lead.sharedStatus === 'hot' ? '#fecaca' : lead.sharedStatus === 'recent' ? '#fde68a' : '#e2e8f0'}` }}>
                                                            {lead.sharedStatus === 'hot' ? `🔥 Sent ${lead.daysSinceShared}d ago` : lead.sharedStatus === 'recent' ? `📤 Sent ${lead.daysSinceShared}d ago` : `📨 Sent ${lead.daysSinceShared}d ago`}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Location + Mobile */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: sub, fontSize: '0.78rem', marginBottom: '8px' }}>
                                                    <i className="fas fa-map-marker-alt" style={{ color: '#ef4444', fontSize: '0.65rem' }}></i>
                                                    <span>{renderVal(lead.location) !== 'N/A' ? renderVal(lead.location) : lead.locArea || 'Location N/A'}</span>
                                                    {lead.mobile && <><span style={{ color: brd }}>·</span><span>{lead.mobile}</span></>}
                                                </div>

                                                {/* Budget + Area */}
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                                    {formatLeadBudget(lead) !== 'TBA' && (
                                                        <span style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 700, background: isDark ? 'rgba(5,150,105,0.1)' : '#f0fdf4', padding: '2px 8px', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                                                            <i className="fas fa-rupee-sign" style={{ marginRight: '3px', fontSize: '0.6rem' }}></i>{formatLeadBudget(lead)}
                                                        </span>
                                                    )}
                                                    {lead.areaMin > 0 && (
                                                        <span style={{ fontSize: '0.7rem', color: '#7c3aed', fontWeight: 700, background: isDark ? 'rgba(124,58,237,0.1)' : '#faf5ff', padding: '2px 8px', borderRadius: '6px', border: '1px solid #e9d5ff' }}>
                                                            {lead.areaMin}–{lead.areaMax} {lead.areaMetric || 'Sq.Yd.'}
                                                        </span>
                                                    )}
                                                    {(Array.isArray(lead.propertyType) ? lead.propertyType : []).slice(0, 2).map((pt, j) => (
                                                        <span key={j} style={{ fontSize: '0.7rem', fontWeight: 700, color: '#0284c7', background: isDark ? 'rgba(2,132,199,0.1)' : '#f0f9ff', padding: '2px 8px', borderRadius: '6px', border: '1px solid #bae6fd' }}>
                                                            {renderVal(pt)}
                                                        </span>
                                                    ))}
                                                </div>

                                                {/* Score Breakdown */}
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                                                    {[
                                                        { key: 'location', label: 'Location', icon: 'fa-map-marker-alt' },
                                                        { key: 'type',     label: 'Type',     icon: 'fa-tag' },
                                                        { key: 'budget',   label: 'Budget',   icon: 'fa-rupee-sign' },
                                                        { key: 'size',     label: 'Size',     icon: 'fa-ruler-combined' },
                                                    ].map(dim => {
                                                        const d = sb[dim.key] || { earned: 0, max: 25 };
                                                        const pct = d.max > 0 ? Math.round((d.earned / d.max) * 100) : 0;
                                                        const col = pct >= 80 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444';
                                                        return (
                                                            <div key={dim.key} title={d.label || ''} style={{ background: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc', borderRadius: '8px', padding: '6px 8px', cursor: 'help' }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                                    <span style={{ fontSize: '0.58rem', fontWeight: 700, color: sub, textTransform: 'uppercase' }}>{dim.label}</span>
                                                                    <span style={{ fontSize: '0.6rem', fontWeight: 900, color: col }}>{d.earned}/{d.max}</span>
                                                                </div>
                                                                <div style={{ height: '3px', borderRadius: '2px', background: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0' }}>
                                                                    <div style={{ height: '100%', borderRadius: '2px', background: col, width: `${pct}%`, transition: 'width 0.4s ease' }}></div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {/* Match reasons */}
                                                {lead.matchDetails?.length > 0 && (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                                                        {lead.matchDetails.map((r, i) => (
                                                            <span key={i} style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', background: isDark ? 'rgba(16,185,129,0.12)' : '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{r}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Action Buttons */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                                                <div style={{ display: 'flex', gap: '5px' }}>
                                                    <button title="Call" onClick={() => window.open(`tel:${lead.mobile}`)} style={{ width: '34px', height: '34px', borderRadius: '9px', border: '1px solid #dcfce7', background: isDark ? 'rgba(16,185,129,0.1)' : '#f0fdf4', color: '#15803d', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', transition: 'all 0.15s' }}>
                                                        <i className="fas fa-phone-alt"></i>
                                                    </button>
                                                    <button title={lead.isPreferredMatch ? 'WhatsApp (Desktop App)' : 'WhatsApp'} onClick={() => handleWhatsApp(lead)} style={{ width: '34px', height: '34px', borderRadius: '9px', border: '1px solid #dcfce7', background: isDark ? 'rgba(37,211,102,0.1)' : '#f0fdf4', color: '#16a34a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', transition: 'all 0.15s' }}>
                                                        <i className="fab fa-whatsapp"></i>
                                                    </button>
                                                    <button title="SMS" onClick={() => { setSelectedContactsForMessage([lead]); setIsMessageOpen(true); }} style={{ width: '34px', height: '34px', borderRadius: '9px', border: '1px solid #dbeafe', background: isDark ? 'rgba(37,99,235,0.1)' : '#eff6ff', color: '#1d4ed8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', transition: 'all 0.15s' }}>
                                                        <i className="fas fa-comment-alt"></i>
                                                    </button>
                                                    <button title="Email" onClick={() => { setSelectedContactsForMail([lead]); setIsMailOpen(true); }} style={{ width: '34px', height: '34px', borderRadius: '9px', border: '1px solid #ede9fe', background: isDark ? 'rgba(109,40,217,0.1)' : '#f5f3ff', color: '#6d28d9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', transition: 'all 0.15s' }}>
                                                        <i className="fas fa-envelope"></i>
                                                    </button>
                                                </div>
                                                <button onClick={() => { setActivityInitialData({ activityType: 'Site Visit', relatedTo: [{ id: lead.mobile, name: `${lead.firstName} ${lead.lastName || ''}`.trim() }] }); setIsActivityOpen(true); }} style={{ padding: '6px 12px', borderRadius: '8px', border: `1px solid ${brd}`, background: card, color: txt, fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
                                                    <i className="fas fa-calendar-plus" style={{ marginRight: '5px', color: '#2563eb' }}></i>Schedule Visit
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* ─── BATCH BAR ─── */}
            {selectedLeads.length > 0 && (
                <div style={{ position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '14px 24px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', zIndex: 1000, border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '12px', borderRight: '1px solid rgba(255,255,255,0.12)' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.85rem', color: '#fff' }}>{selectedLeads.length}</div>
                        <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.9rem' }}>leads selected</span>
                    </div>
                    <button onClick={handleBatchWhatsApp} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 14px', borderRadius: '10px', background: '#25d366', border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                        <i className="fab fa-whatsapp"></i> WhatsApp
                    </button>
                    <button onClick={handleBatchMail} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 14px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#e2e8f0', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                        <i className="fas fa-envelope"></i> Email
                    </button>
                    <button onClick={handleBatchMessage} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 14px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#e2e8f0', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                        <i className="fas fa-comment"></i> SMS
                    </button>
                    <button onClick={() => setSelectedLeads([])} style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>
            )}

            {/* Modals */}
            <ComposeEmailModal
                isOpen={isMailOpen}
                onClose={() => setIsMailOpen(false)}
                recipients={selectedContactsForMail}
                initialSubject={`🏠 Exclusive Property Match Found for You | ${deal?.projectName || deal?.inventoryId?.projectName || ''}`}
                initialTemplateId={DEAL_MATCH_TEMPLATE_ID}
                dealData={deal}
                dealDataBuilder={buildDealEmailBody}
            />
            <SendMessageModal 
                isOpen={isMessageOpen} 
                onClose={() => setIsMessageOpen(false)} 
                initialRecipients={selectedContactsForMessage.map(c => ({ ...c, phone: c.mobile }))} 
                onSend={() => setIsMessageOpen(false)} 
                initialTemplateId={DEAL_MATCH_SMS_TEMPLATE_ID}
                initialChannel="SMS"
                initialProperty={deal}
            />
            <CreateActivityModal isOpen={isActivityOpen} onClose={() => setIsActivityOpen(false)} initialData={activityInitialData} onSave={(data) => { addActivity(data); setIsActivityOpen(false); }} />
        </div>
    );
};

export default DealMatchingPage;
