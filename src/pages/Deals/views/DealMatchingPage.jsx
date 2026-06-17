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

const DealMatchingPage = ({ onNavigate, dealId }) => {
    const { isDark } = useTheme();
    const { addActivity } = useActivities();
    const { lookups, projects } = usePropertyConfig();
    
    // Core Data State
    const [deal, setDeal] = useState(null);
    const [matchedLeads, setMatchedLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [matchingLoading, setMatchingLoading] = useState(false);

    // Refinement State (Matching Parameters)
    const [budgetFlexibility, setBudgetFlexibility] = useState(20); 
    const [sizeFlexibility, setSizeFlexibility] = useState(20); 

    // Selection & Communication State
    const [selectedLeads, setSelectedLeads] = useState([]);
    const [isMailOpen, setIsMailOpen] = useState(false);
    const [isMessageOpen, setIsMessageOpen] = useState(false);
    const [isActivityOpen, setIsActivityOpen] = useState(false);
    const [selectedContactsForMail, setSelectedContactsForMail] = useState([]);
    const [selectedContactsForMessage, setSelectedContactsForMessage] = useState([]);
    const [activityInitialData, setActivityInitialData] = useState(null);
    const [mailSubject, setMailSubject] = useState('');
    const [mailBody, setMailBody] = useState('');

    // 1. Initial Deal Particulars Fetch
    useEffect(() => {
        if (!dealId) return;
        const fetchDeal = async () => {
            setLoading(true);
            try {
                const res = await api.get(`deals/${dealId}`);
                if (res.data?.success) setDeal(res.data.deal);
            } catch (err) {
                console.error("Deal Fetch Error:", err);
                toast.error("Failed to load deal particulars");
            } finally {
                setLoading(false);
            }
        };
        fetchDeal();
    }, [dealId]);

    // 2. Matching Engine Implementation (Server-Side)
    const fetchMatches = useCallback(async () => {
        if (!dealId) return;
        setMatchingLoading(true);
        try {
            const res = await api.get('leads/match', {
                params: {
                    dealId,
                    budgetFlexibility,
                    sizeFlexibility
                }
            });
            if (res.data?.success) {
                setMatchedLeads(res.data.matchingLeads || []);
            }
        } catch (err) {
            console.error("Matching Engine Failure:", err);
            toast.error("Matching engine encountered a technical error");
        } finally {
            setMatchingLoading(false);
        }
    }, [dealId, budgetFlexibility, sizeFlexibility]);

    // Debounced matching to prevent server strain during slider movement
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchMatches();
        }, 400);
        return () => clearTimeout(timer);
    }, [fetchMatches]);

    // 🚀 ENTERPRISE HYDRATION RESOLVER
    const renderVal = useCallback((v, type = null) => {
        if (v === null || v === undefined || v === '') return 'N/A';
        
        // A. Handle Measurement Objects { value, unit }
        if (typeof v === 'object' && v.value !== undefined) {
            return `${v.value} ${v.unit || ''}`.trim();
        }

        // B. Handle Populated Lookup Objects
        if (typeof v === 'object' && (v.lookup_value || v.name || v.label)) {
            return v.lookup_value || v.name || v.label;
        }

        // C. Handle IDs (Resolve from context)
        if (typeof v === 'string' && v.match(/^[0-9a-fA-F]{24}$/)) {
            // Check Projects
            const project = projects?.find(p => p._id === v || p.id === v);
            if (project) return project.name;

            // Check Lookups
            if (lookups) {
                for (const group of Object.values(lookups)) {
                    const found = group.find(l => l._id === v || l.id === v);
                    if (found) return found.lookup_value;
                }
            }
        }

        // D. Handle Arrays
        if (Array.isArray(v)) {
            if (v.length === 0) return 'N/A';
            return v.map(item => renderVal(item)).join(', ');
        }

        // E. Prevent [object Object]
        if (typeof v === 'object') {
            try {
                return v.lookup_value || v.name || v.value || JSON.stringify(v);
            } catch (e) {
                return 'Complex Data';
            }
        }

        return String(v);
    }, [lookups, projects]);

    // Batch Communication Handlers (missing functions that were causing ReferenceError)
    const handleBatchMail = () => {
        const contactsForMail = matchedLeads.filter(l => selectedLeads.includes(l.mobile));
        setSelectedContactsForMail(contactsForMail);
        setMailSubject(`Property Match: ${renderVal(deal.propertyType)} at ${renderVal(deal.location)}`);
        setMailBody(`Dear Lead,\n\nWe have found a matching property for your requirement.\n\nProperty: ${renderVal(deal.propertyType)}\nLocation: ${renderVal(deal.location)}\nPrice: ${formatIndianCurrency(deal.price)}\n\nPlease contact us for more details.`);
        setIsMailOpen(true);
    };

    const handleBatchMessage = () => {
        const contactsForMsg = matchedLeads.filter(l => selectedLeads.includes(l.mobile));
        setSelectedContactsForMessage(contactsForMsg);
        setIsMessageOpen(true);
    };

    const handleBatchWhatsApp = () => {
        const selected = matchedLeads.filter(l => selectedLeads.includes(l.mobile));
        const loc = deal ? renderVal(deal.location) : '';
        const price = deal ? formatIndianCurrency(deal.price || 0) : '';
        selected.forEach(l => {
            const msg = `Hi ${l.firstName}, we have a property matching your requirement at ${loc}. Price: ${price}. Interested?`;
            window.open(`https://wa.me/91${l.mobile}?text=${encodeURIComponent(msg)}`, '_blank');
        });
    };

    // Communication Handlers
    const handleWhatsApp = (lead) => {
        const msg = `Hi ${lead.firstName}, I found a property matching your requirement: ${renderVal(deal.propertyType)} at ${renderVal(deal.location)}. Price: ${formatIndianCurrency(deal.price)}. Interested?`;
        window.open(`https://wa.me/91${lead.mobile}?text=${encodeURIComponent(msg)}`, '_blank');
    };

    const handleSelectLead = (mobile) => {
        setSelectedLeads(prev => prev.includes(mobile) ? prev.filter(m => m !== mobile) : [...prev, mobile]);
    };

    if (loading) return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '20px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc' }}>
            <div className="loading-spinner"></div>
            <h3 style={{ fontWeight: 800, color: isDark ? 'var(--text-main)' : '#1e293b' }}>Initializing Matching Engine...</h3>
        </div>
    );

    if (!deal) return <div style={{ padding: '40px', textAlign: 'center' }}>Deal not found.</div>;

    return (
        <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f1f5f9', minHeight: '100vh', padding: '24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button
                        onClick={() => onNavigate('deals')}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', color: isDark ? 'var(--text-main)' : '#475569', transition: 'all 0.2s' }}
                        onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                        onMouseOut={e => e.currentTarget.style.background = '#fff'}
                    >
                        <i className="fas fa-arrow-left" style={{ fontSize: '0.8rem' }}></i> Back to Deals
                    </button>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: isDark ? 'var(--text-main)' : '#0f172a', margin: 0 }}>Deal Match Center</h1>
                        <p style={{ margin: 0, color: isDark ? 'var(--text-muted)' : '#64748b', fontSize: '0.85rem' }}>
                            <span style={{ fontWeight: 700, color: '#2563eb' }}>{renderVal(deal.propertyType)}</span> in {renderVal(deal.location)}
                        </p>
                    </div>
                </div>
                <button className="btn-primary" onClick={() => toast.success("Deal link copied!") }>
                    <i className="fas fa-share-alt"></i> Share Deal
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '24px' }}>
                {/* Side Control Panel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', borderRadius: '20px', padding: '24px', border: '1px solid #e2e8f0' }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: isDark ? 'var(--text-muted)' : '#64748b', textTransform: 'uppercase', marginBottom: '20px' }}>Deal Snapshot</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', padding: '12px', borderRadius: '12px', gridColumn: '1 / span 2' }}>
                                <small style={{ fontWeight: 700, color: '#94a3b8', fontSize: '0.65rem' }}>UNIT PRICE</small>
                                <p style={{ margin: 0, fontWeight: 900, fontSize: '1.2rem', color: '#059669' }}>{formatIndianCurrency(deal.price || deal.quotePrice)}</p>
                            </div>
                            <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', padding: '10px', borderRadius: '10px' }}>
                                <small style={{ fontWeight: 700, color: '#94a3b8', fontSize: '0.6rem' }}>SIZE / AREA</small>
                                <p style={{ margin: 0, fontWeight: 800, fontSize: '0.85rem' }}>
                                    {(() => {
                                        const s = deal.size?.value || deal.size || 0;
                                        if (s > 0) return `${s} ${deal.sizeUnit || 'Sq.Ft.'}`;
                                        if (deal.inventoryId?.length && deal.inventoryId?.width) {
                                            return `${deal.inventoryId.length * deal.inventoryId.width} ${deal.sizeUnit || 'Sq.Ft.'} (Calc)`;
                                        }
                                        return 'N/A';
                                    })()}
                                </p>
                            </div>
                            <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', padding: '10px', borderRadius: '10px' }}>
                                <small style={{ fontWeight: 700, color: '#94a3b8', fontSize: '0.6rem' }}>STATUS</small>
                                <p style={{ margin: 0, fontWeight: 800, fontSize: '0.85rem', color: '#f59e0b' }}>{renderVal(deal.stage || 'Open')}</p>
                            </div>
                            
                            <div style={{ gridColumn: '1 / span 2', borderTop: '1px solid #f1f5f9', paddingTop: '12px', marginTop: '4px' }}>
                                <div style={{ marginBottom: '10px' }}>
                                    <small style={{ fontWeight: 700, color: '#94a3b8', fontSize: '0.6rem', textTransform: 'uppercase' }}>Project</small>
                                    <div style={{ fontWeight: 800, fontSize: '0.85rem', color: isDark ? 'var(--text-main)' : '#1e293b' }}>{renderVal(deal.projectName || deal.inventoryId?.projectName)}</div>
                                </div>
                                <div style={{ display: 'flex', gap: '20px' }}>
                                    <div>
                                        <small style={{ fontWeight: 700, color: '#94a3b8', fontSize: '0.6rem', textTransform: 'uppercase' }}>Unit No</small>
                                        <div style={{ fontWeight: 800, fontSize: '0.85rem' }}>{deal.unitNo || deal.inventoryId?.unitNo || '-'}</div>
                                    </div>
                                    <div>
                                        <small style={{ fontWeight: 700, color: '#94a3b8', fontSize: '0.6rem', textTransform: 'uppercase' }}>Block</small>
                                        <div style={{ fontWeight: 800, fontSize: '0.85rem' }}>{renderVal(deal.block || deal.inventoryId?.block) || '-'}</div>
                                    </div>
                                </div>
                                <div style={{ marginTop: '10px' }}>
                                    <small style={{ fontWeight: 700, color: '#94a3b8', fontSize: '0.6rem', textTransform: 'uppercase' }}>Locality</small>
                                    <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#2563eb' }}>{renderVal(deal.location || deal.inventoryId?.address?.locality)}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', borderRadius: '20px', padding: '24px', border: '1px solid #e2e8f0', position: 'sticky', top: '24px' }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: isDark ? 'var(--text-muted)' : '#64748b', textTransform: 'uppercase', marginBottom: '20px' }}>Refinement Engine</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 700 }}>Budget Tolerance</label>
                                    <span style={{ color: '#2563eb', fontWeight: 800 }}>±{budgetFlexibility}%</span>
                                </div>
                                <input type="range" min="0" max="100" value={budgetFlexibility} onChange={(e) => setBudgetFlexibility(parseInt(e.target.value))} style={{ width: '100%' }} />
                            </div>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 700 }}>Size Tolerance</label>
                                    <span style={{ color: '#10b981', fontWeight: 800 }}>±{sizeFlexibility}%</span>
                                </div>
                                <input type="range" min="0" max="100" value={sizeFlexibility} onChange={(e) => setSizeFlexibility(parseInt(e.target.value))} style={{ width: '100%' }} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Match Results List */}
                <div style={{ position: 'relative' }}>
                    {matchingLoading && (
                        <div style={{ position: 'absolute', top: '-15px', left: '50%', transform: 'translateX(-50%)', background: '#2563eb', color: '#fff', padding: '4px 16px', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 800, zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                            <i className="fas fa-sync fa-spin"></i> UPDATING MATCHES...
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', opacity: matchingLoading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
                        {matchedLeads.length === 0 ? (
                            <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', padding: '80px', borderRadius: '20px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                                <i className="fas fa-user-slash" style={{ fontSize: '2.5rem', color: '#cbd5e1', marginBottom: '16px' }}></i>
                                <h3 style={{ color: isDark ? 'var(--text-main)' : '#1e293b' }}>No Matching Leads Found</h3>
                                <p style={{ color: isDark ? 'var(--text-muted)' : '#64748b' }}>Broaden your tolerance filters to see potential prospects.</p>
                            </div>
                        ) : (
                            matchedLeads.map((lead) => (
                                <div key={lead._id} style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', borderRadius: '16px', padding: '20px 24px', border: `1px solid ${selectedLeads.includes(lead.mobile) ? '#2563eb' : '#e2e8f0'}`, boxShadow: selectedLeads.includes(lead.mobile) ? '0 0 0 3px rgba(37,99,235,0.1)' : '0 1px 3px rgba(0,0,0,0.04)', display: 'grid', gridTemplateColumns: '32px 64px 1fr auto', gap: '16px', alignItems: 'center', transition: 'all 0.2s' }}>
                                    <input type="checkbox" checked={selectedLeads.includes(lead.mobile)} onChange={() => handleSelectLead(lead.mobile)} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#2563eb' }} />

                                    <div style={{ position: 'relative', width: '60px', height: '60px', flexShrink: 0 }}>
                                        <svg width="60" height="60" viewBox="0 0 64 64">
                                            <circle cx="32" cy="32" r="28" fill="none" stroke="#f1f5f9" strokeWidth="5" />
                                            <circle cx="32" cy="32" r="28" fill="none" stroke={lead.score >= 80 ? '#10b981' : lead.score >= 50 ? '#f59e0b' : '#3b82f6'} strokeWidth="5" strokeDasharray="176" strokeDashoffset={176 * (1 - lead.score / 100)} transform="rotate(-90 32 32)" strokeLinecap="round" />
                                        </svg>
                                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                            <span style={{ fontWeight: 900, fontSize: '0.8rem', color: isDark ? 'var(--text-main)' : '#0f172a', lineHeight: 1 }}>{lead.score}%</span>
                                            <span style={{ fontSize: '0.5rem', color: '#94a3b8', fontWeight: 600 }}>MATCH</span>
                                        </div>
                                    </div>

                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                                            <h4 style={{ margin: 0, color: isDark ? 'var(--text-main)' : '#0f172a', fontSize: '1rem', fontWeight: 800 }}>{lead.firstName} {lead.lastName}</h4>
                                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#2563eb', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#eff6ff', padding: '1px 7px', borderRadius: '20px', border: '1px solid #bfdbfe', flexShrink: 0 }}>{renderVal(lead.stage) !== 'N/A' ? renderVal(lead.stage) : 'Lead'}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isDark ? 'var(--text-muted)' : '#64748b', fontSize: '0.8rem', marginBottom: '6px' }}>
                                            <i className="fas fa-map-marker-alt" style={{ color: '#ef4444', fontSize: '0.7rem' }}></i>
                                            <span>{renderVal(lead.location) !== 'N/A' ? renderVal(lead.location) : lead.locArea || 'Location N/A'}</span>
                                            {lead.mobile && <><span style={{ color: '#e2e8f0' }}>·</span><span>{lead.mobile}</span></>}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                                            {formatLeadBudget(lead) !== 'TBA' && <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 700, background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f0fdf4', padding: '2px 8px', borderRadius: '6px', border: '1px solid #bbf7d0' }}>{formatLeadBudget(lead)}</span>}
                                            {lead.areaMin > 0 && <span style={{ fontSize: '0.72rem', color: '#7c3aed', fontWeight: 700, background: '#faf5ff', padding: '2px 8px', borderRadius: '6px', border: '1px solid #e9d5ff' }}>{lead.areaMin}–{lead.areaMax} {lead.areaMetric || 'Sq.Yd.'}</span>}
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                            {(lead.matchReasons || []).map((reason, i) => (
                                                <span key={i} style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{reason}</span>
                                            ))}
                                            {(!lead.matchReasons || lead.matchReasons.length === 0) && (
                                                <span style={{ fontSize: '0.62rem', color: '#94a3b8', fontStyle: 'italic' }}>Partial Match</span>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <button
                                                title="Call"
                                                onClick={() => window.open(`tel:${lead.mobile}`)}
                                                style={{ width: '36px', height: '36px', borderRadius: '10px', border: '1px solid #dcfce7', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f0fdf4', color: '#15803d', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', transition: 'all 0.15s' }}
                                                onMouseOver={e => { e.currentTarget.style.background = '#dcfce7'; e.currentTarget.style.borderColor = '#86efac'; }}
                                                onMouseOut={e => { e.currentTarget.style.background = '#f0fdf4'; e.currentTarget.style.borderColor = '#dcfce7'; }}
                                            ><i className="fas fa-phone-alt"></i></button>
                                            <button
                                                title="WhatsApp"
                                                onClick={() => handleWhatsApp(lead)}
                                                style={{ width: '36px', height: '36px', borderRadius: '10px', border: '1px solid #dcfce7', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f0fdf4', color: '#16a34a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', transition: 'all 0.15s' }}
                                                onMouseOver={e => { e.currentTarget.style.background = '#dcfce7'; }}
                                                onMouseOut={e => { e.currentTarget.style.background = '#f0fdf4'; }}
                                            ><i className="fab fa-whatsapp"></i></button>
                                            <button
                                                title="Send SMS"
                                                onClick={() => { setSelectedContactsForMessage([lead]); setIsMessageOpen(true); }}
                                                style={{ width: '36px', height: '36px', borderRadius: '10px', border: '1px solid #dbeafe', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#eff6ff', color: '#1d4ed8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', transition: 'all 0.15s' }}
                                                onMouseOver={e => { e.currentTarget.style.background = '#dbeafe'; }}
                                                onMouseOut={e => { e.currentTarget.style.background = '#eff6ff'; }}
                                            ><i className="fas fa-comment-alt"></i></button>
                                            <button
                                                title="Email"
                                                onClick={() => { setSelectedContactsForMail([lead]); setMailSubject(`Property Match for ${lead.firstName}`); setIsMailOpen(true); }}
                                                style={{ width: '36px', height: '36px', borderRadius: '10px', border: '1px solid #ede9fe', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f5f3ff', color: '#6d28d9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', transition: 'all 0.15s' }}
                                                onMouseOver={e => { e.currentTarget.style.background = '#ede9fe'; }}
                                                onMouseOut={e => { e.currentTarget.style.background = '#f5f3ff'; }}
                                            ><i className="fas fa-envelope"></i></button>
                                        </div>
                                        <button
                                            onClick={() => { setActivityInitialData({ activityType: 'Site Visit', relatedTo: [{ id: lead.mobile, name: `${lead.firstName} ${lead.lastName || ''}`.trim() }] }); setIsActivityOpen(true); }}
                                            style={{ padding: '7px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', color: isDark ? 'var(--text-main)' : '#374151', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
                                            onMouseOver={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#94a3b8'; }}
                                            onMouseOut={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                                        ><i className="fas fa-calendar-plus" style={{ marginRight: '6px', color: '#2563eb' }}></i>Schedule Visit</button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Batch Broadcast Bar */}
            {selectedLeads.length > 0 && (
                <div style={{ position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '14px 24px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)', zIndex: 1000, border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '12px', borderRight: '1px solid rgba(255,255,255,0.12)' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.85rem', color: '#fff' }}>{selectedLeads.length}</div>
                        <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.9rem' }}>leads selected</span>
                    </div>
                    <button onClick={handleBatchWhatsApp} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 14px', borderRadius: '10px', background: '#25d366', border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', transition: 'all 0.15s' }} onMouseOver={e => e.currentTarget.style.background='#22c55e'} onMouseOut={e => e.currentTarget.style.background='#25d366'}><i className="fab fa-whatsapp"></i> WhatsApp</button>
                    <button onClick={handleBatchMail} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 14px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#e2e8f0', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', transition: 'all 0.15s' }} onMouseOver={e => e.currentTarget.style.background='rgba(255,255,255,0.15)'} onMouseOut={e => e.currentTarget.style.background='rgba(255,255,255,0.08)'}><i className="fas fa-envelope"></i> Email</button>
                    <button onClick={handleBatchMessage} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 14px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#e2e8f0', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', transition: 'all 0.15s' }} onMouseOver={e => e.currentTarget.style.background='rgba(255,255,255,0.15)'} onMouseOut={e => e.currentTarget.style.background='rgba(255,255,255,0.08)'}><i className="fas fa-comment"></i> SMS</button>
                    <button onClick={() => setSelectedLeads([])} style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', transition: 'all 0.15s' }} onMouseOver={e => e.currentTarget.style.background='rgba(255,255,255,0.12)'} onMouseOut={e => e.currentTarget.style.background='rgba(255,255,255,0.06)'}><i className="fas fa-times"></i></button>
                </div>
            )}

            {/* Modals */}
            <ComposeEmailModal isOpen={isMailOpen} onClose={() => setIsMailOpen(false)} recipients={selectedContactsForMail} initialSubject={mailSubject} initialBody={mailBody} />
            <SendMessageModal isOpen={isMessageOpen} onClose={() => setIsMessageOpen(false)} initialRecipients={selectedContactsForMessage.map(c => ({ ...c, phone: c.mobile }))} onSend={() => setIsMessageOpen(false)} />
            <CreateActivityModal isOpen={isActivityOpen} onClose={() => setIsActivityOpen(false)} initialData={activityInitialData} onSave={(data) => { addActivity(data); setIsActivityOpen(false); }} />
        </div>
    );
};

export default DealMatchingPage;
