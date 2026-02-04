import React, { useMemo, useState, useEffect } from 'react';
import { dealsData, leadData, inventoryData } from '../../../data/mockData';
import SendMailModal from '../../Contacts/components/SendMailModal';
import SendMessageModal from '../../../components/SendMessageModal';
import AlgorithmSettingsModal from '../components/AlgorithmSettingsModal';
import toast from 'react-hot-toast';
import { parseBudget, parseSizeSqYard, calculateMatch } from '../../../utils/matchingLogic';

const LeadMatchingPage = ({ onNavigate, leadId }) => {
    const lead = useMemo(() => leadData.find(l => l.mobile === leadId), [leadId]);

    // Selection State
    const [selectedItems, setSelectedItems] = useState([]);

    // Refinement State
    const [budgetFlexibility, setBudgetFlexibility] = useState(10); // % flexibility
    const [includeNearby, setIncludeNearby] = useState(true);
    const [minMatchScore, setMinMatchScore] = useState(20);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [weights, setWeights] = useState({
        location: 30,
        type: 20,
        budget: 25,
        size: 25
    });

    // Communication Modals State
    const [isMailOpen, setIsMailOpen] = useState(false);
    const [isMessageOpen, setIsMessageOpen] = useState(false);
    const [selectedItemsForAction, setSelectedItemsForAction] = useState([]);

    // 2. Pre-parse Lead Context
    const leadContext = useMemo(() => {
        if (!lead) return null;
        const baseBudget = parseBudget(lead.budget);
        return {
            baseBudget,
            leadSize: lead.req?.size ? parseSizeSqYard(lead.req.size) : 0,
            leadType: lead.req?.type ? lead.req.type.toLowerCase() : '',
            leadLocation: lead.location ? lead.location.toLowerCase() : '',
            leadLocationSectors: (lead.location ? lead.location.toLowerCase() : '').split(',').map(s => s.trim()).filter(Boolean)
        };
    }, [lead]);

    // 3. Optimize regions with Centralized Logic
    const matchedItems = useMemo(() => {
        return calculateMatch(lead, leadContext, weights, {
            budgetFlexibility,
            includeNearby,
            minMatchScore
        });
    }, [lead, leadContext, budgetFlexibility, includeNearby, minMatchScore, weights]);

    // Progressive Rendering
    const [visibleCount, setVisibleCount] = useState(15);
    const displayedItems = useMemo(() => matchedItems.slice(0, visibleCount), [matchedItems, visibleCount]);

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedItems(matchedItems.map(item => item.id || item.unitNo));
        } else {
            setSelectedItems([]);
        }
    };

    const handleSelectItem = (id) => {
        setSelectedItems(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const logActivity = (action, item) => {
        toast.success(`Logged: ${action} for ${item.itemType} (Ref: ${item.id || item.unitNo})`);
    };

    const handleWhatsApp = (item) => {
        const message = `Hi ${lead.name}, I found a ${item.itemType} that matches your requirement: ${item.propertyType} at ${item.location}. Price: ₹${item.price}. Link: http://bharatproperties.in/p/${item.id || item.unitNo}`;
        window.open(`https://wa.me/91${lead.mobile}?text=${encodeURIComponent(message)}`, '_blank');
        logActivity('WhatsApp Sent', item);
    };

    if (!lead) {
        return (
            <div style={{ padding: '40px', textAlign: 'center' }}>
                <h2>Lead not found</h2>
                <button onClick={() => onNavigate('leads')} className="btn-primary">Go back to Leads</button>
            </div>
        );
    }

    const getStatusColor = (status) => {
        switch (status) {
            case 'match': return '#10b981';
            case 'partial': return '#f59e0b';
            default: return '#94a3b8';
        }
    };

    return (
        <div style={{ background: '#f8fafc', minHeight: '100vh', padding: '24px', paddingBottom: '100px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button
                        onClick={() => onNavigate('leads')}
                        style={{ border: 'none', background: '#fff', width: '40px', height: '40px', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
                    >
                        <i className="fas fa-arrow-left" style={{ color: '#1e293b' }}></i>
                    </button>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Requirement Match Center</h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Finding matches for Lead:</span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: '4px' }}>{lead.name} | {lead.mobile}</span>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        className="btn-outline"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff' }}
                        onClick={() => setIsSettingsOpen(true)}
                    >
                        <i className="fas fa-cog"></i> Algorithm Settings
                    </button>
                    <button
                        className="btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        onClick={() => {
                            toast.success(`Broadcasting top ${selectedItems.length || 5} matches to ${lead.name}`);
                        }}
                    >
                        <i className="fas fa-paper-plane"></i> Send All Top Matches
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '24px' }}>
                {/* Left Panel: Context & Refinement */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Lead Card */}
                    <div style={{ background: '#fff', borderRadius: '20px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#64748b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            <i className="fas fa-user-circle" style={{ color: '#3b82f6' }}></i> Lead Requirement
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px' }}>
                                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Target</label>
                                <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>{lead.req?.type}</p>
                                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}><i className="fas fa-map-marker-alt"></i> {lead.location}</p>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px' }}>
                                    <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Size</label>
                                    <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', margin: '2px 0' }}>{lead.req?.size}</p>
                                </div>
                                <div style={{ background: '#eff6ff', padding: '12px', borderRadius: '12px' }}>
                                    <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase' }}>Budget</label>
                                    <p style={{ fontSize: '0.85rem', fontWeight: 800, color: '#2563eb', margin: '2px 0' }}>{lead.budget}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Interactive Refinement */}
                    <div style={{ background: '#fff', borderRadius: '20px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', position: 'sticky', top: '24px' }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#64748b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            <i className="fas fa-filter" style={{ color: '#f59e0b' }}></i> Refine Search
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b' }}>Budget Flexibility</label>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#3b82f6' }}>±{budgetFlexibility}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0" max="30"
                                    value={budgetFlexibility}
                                    onChange={(e) => setBudgetFlexibility(parseInt(e.target.value))}
                                    style={{ width: '100%', cursor: 'pointer', accentColor: '#3b82f6' }}
                                />
                                <p style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '4px' }}>Includes properties slightly above lead budget.</p>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '12px', borderRadius: '12px' }}>
                                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b' }}>Include Nearby Sectors</label>
                                <input
                                    type="checkbox"
                                    checked={includeNearby}
                                    onChange={(e) => setIncludeNearby(e.target.checked)}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                />
                            </div>

                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', display: 'block', marginBottom: '8px' }}>Min. Match Accuracy</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {[20, 50, 75].map(score => (
                                        <button
                                            key={score}
                                            onClick={() => setMinMatchScore(score)}
                                            style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: minMatchScore === score ? '#1e293b' : '#fff', color: minMatchScore === score ? '#fff' : '#64748b', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                                        >
                                            {score}%+
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Panel: Match Results */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <input
                                type="checkbox"
                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                onChange={handleSelectAll}
                                checked={selectedItems.length === matchedItems.length && matchedItems.length > 0}
                            />
                            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>{matchedItems.length} Professional Matches Found</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#64748b' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></div> High
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#64748b' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }}></div> Medium
                            </div>
                        </div>
                    </div>

                    {displayedItems.map((item, idx) => (
                        <div
                            key={(item.id || item.unitNo) + idx}
                            style={{
                                background: '#fff',
                                borderRadius: '24px',
                                padding: '20px',
                                boxShadow: selectedItems.includes(item.id || item.unitNo) ? '0 0 0 2px #3b82f6, 0 10px 15px -3px rgba(0, 0, 0, 0.1)' : '0 1px 3px rgba(0,0,0,0.05)',
                                border: '1px solid #e2e8f0',
                                display: 'grid',
                                gridTemplateColumns: '40px 140px 1fr 240px',
                                gap: '20px',
                                alignItems: 'start',
                                transition: 'all 0.3s ease'
                            }}
                        >
                            <div style={{ paddingTop: '50px' }}>
                                <input
                                    type="checkbox"
                                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                    checked={selectedItems.includes(item.id || item.unitNo)}
                                    onChange={() => handleSelectItem(item.id || item.unitNo)}
                                />
                            </div>

                            {/* Property Image & Badge */}
                            <div style={{ position: 'relative' }}>
                                <img
                                    src={item.thumbnail}
                                    alt="Property"
                                    style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '16px', background: '#f1f5f9' }}
                                />
                                <div style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(15, 23, 42, 0.8)', color: '#fff', fontSize: '0.6rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', backdropFilter: 'blur(4px)' }}>
                                    {item.itemType}
                                </div>
                                <div style={{ position: 'absolute', bottom: '-10px', right: '10px', background: '#fff', width: '40px', height: '40px', borderRadius: '50%', border: '3px solid #f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 900, color: item.matchPercentage > 70 ? '#10b981' : '#f59e0b' }}>{item.matchPercentage}%</span>
                                </div>
                            </div>

                            {/* Item Info */}
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <h4 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>{item.propertyType}</h4>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: item.marketStatus === 'Below Market' ? '#10b981' : '#64748b', background: item.marketStatus === 'Below Market' ? '#ecfdf5' : '#f8fafc', padding: '2px 8px', borderRadius: '100px' }}>
                                        <i className="fas fa-chart-line"></i> {item.marketStatus}
                                    </span>
                                </div>

                                <p style={{ fontSize: '0.9rem', color: '#475569', margin: '4px 0', fontWeight: 500 }}>
                                    <i className="fas fa-map-marker-alt" style={{ color: '#94a3b8' }}></i> {item.location} {item.projectName ? `| ${item.projectName}` : ''}
                                </p>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                                    <span style={{ fontSize: '1rem', color: '#2563eb', fontWeight: 800 }}>₹{item.price}</span>
                                    <span style={{ width: '1px', height: '12px', background: '#e2e8f0' }}></span>
                                    <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>{item.size}</span>
                                </div>

                                {/* Mismatch Reasoning */}
                                {item.gaps.length > 0 && (
                                    <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {item.gaps.slice(0, 2).map((gap, i) => (
                                            <span key={i} style={{ fontSize: '0.65rem', fontWeight: 600, color: '#ef4444', background: '#fef2f2', padding: '2px 8px', borderRadius: '6px', border: '1px solid #fee2e2' }}>
                                                <i className="fas fa-exclamation-triangle"></i> {gap}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Actions Column */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={() => handleWhatsApp(item)}
                                        title="Send on WhatsApp"
                                        style={{ flex: 1, height: '44px', borderRadius: '14px', border: '1px solid #dcfce7', background: '#f0fdf4', color: '#166534', cursor: 'pointer', transition: 'all 0.2s' }}
                                    >
                                        <i className="fab fa-whatsapp" style={{ fontSize: '1.1rem' }}></i>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSelectedItemsForAction([item]);
                                            setIsMailOpen(true);
                                        }}
                                        title="Email Presentation"
                                        style={{ flex: 1, height: '44px', borderRadius: '14px', border: '1px solid #eef2ff', background: '#f5f3ff', color: '#4338ca', cursor: 'pointer' }}
                                    >
                                        <i className="fas fa-envelope-open-text"></i>
                                    </button>
                                    <button
                                        onClick={() => {
                                            toast.success('Professional Listing PDF Generated!');
                                            logActivity('PDF Shared', item);
                                        }}
                                        title="Generate Professional PDF"
                                        style={{ flex: 1, height: '44px', borderRadius: '14px', border: '1px solid #f1f5f9', background: '#fff', color: '#64748b', cursor: 'pointer' }}
                                    >
                                        <i className="fas fa-file-pdf"></i>
                                    </button>
                                </div>
                                <button
                                    className="btn-primary"
                                    style={{ width: '100%', height: '48px', borderRadius: '14px', fontSize: '0.9rem', fontWeight: 800, boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.2)' }}
                                    onClick={() => {
                                        toast.success(`Reserved for Site Visit: ${item.propertyType}`);
                                        logActivity('Site Visit Interest', item);
                                    }}
                                >
                                    Log Site Visit Interest
                                </button>
                            </div>
                        </div>
                    ))}

                    {matchedItems.length > visibleCount && (
                        <button
                            onClick={() => setVisibleCount(prev => prev + 15)}
                            style={{ padding: '16px', borderRadius: '15px', border: '2px dashed #cbd5e1', background: '#f1f5f9', color: '#64748b', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                            onMouseOver={(e) => { e.target.style.background = '#e2e8f0'; e.target.style.borderColor = '#94a3b8'; }}
                            onMouseOut={(e) => { e.target.style.background = '#f1f5f9'; e.target.style.borderColor = '#cbd5e1'; }}
                        >
                            <i className="fas fa-plus-circle"></i> Load More Matches ({matchedItems.length - visibleCount} remaining)
                        </button>
                    )}

                    {matchedItems.length === 0 && (
                        <div style={{ padding: '60px', textAlign: 'center', background: '#fff', borderRadius: '24px', border: '2px dashed #e2e8f0' }}>
                            <i className="fas fa-search-minus" style={{ fontSize: '3rem', color: '#cbd5e1', marginBottom: '16px' }}></i>
                            <h3 style={{ color: '#475569', marginBottom: '8px' }}>No exact matches found</h3>
                            <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Try adjusting the "Budget Flexibility" or "Match Accuracy" in the left panel.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Professional Batch Action Bar */}
            {selectedItems.length > 0 && (
                <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: '#0f172a', padding: '12px 24px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '32px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)', zIndex: 1000, border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>
                    <div style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 600 }}>
                        <span style={{ color: '#3b82f6', fontWeight: 900, fontSize: '1.2rem' }}>{selectedItems.length}</span> properties selected
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                            className="btn-primary"
                            style={{ background: '#25d366', borderColor: '#25d366', borderRadius: '12px', padding: '10px 24px', fontSize: '0.9rem' }}
                            onClick={() => {
                                toast.success(`Portfolio of ${selectedItems.length} deals sent to ${lead.name}`);
                                setSelectedItems([]);
                            }}
                        >
                            <i className="fab fa-whatsapp"></i> Send Portfolio
                        </button>
                        <button
                            className="btn-outline"
                            style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.2)', borderRadius: '12px', padding: '10px 24px', fontSize: '0.9rem' }}
                            onClick={() => {
                                toast.success(`Generated Comparison Sheet for ${selectedItems.length} items`);
                                setSelectedItems([]);
                            }}
                        >
                            <i className="fas fa-columns"></i> Compare Deals
                        </button>
                    </div>
                    <button
                        onClick={() => setSelectedItems([])}
                        style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}
                    >
                        <i className="fas fa-times-circle"></i>
                    </button>
                </div>
            )}

            {/* Communication Modals */}
            <SendMailModal
                isOpen={isMailOpen}
                onClose={() => setIsMailOpen(false)}
                selectedContacts={[lead]} // In Lead matching, the target is always this lead
            />
            <SendMessageModal
                isOpen={isMessageOpen}
                onClose={() => setIsMessageOpen(false)}
                selectedContacts={[lead]}
            />
            <AlgorithmSettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                weights={weights}
                onSave={(newWeights) => {
                    setWeights(newWeights);
                    setIsSettingsOpen(false);
                    toast.success('Algorithm weights updated!');
                }}
            />
        </div>
    );
};

export default LeadMatchingPage;
