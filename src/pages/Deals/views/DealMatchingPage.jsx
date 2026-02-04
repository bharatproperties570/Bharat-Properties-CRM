import React, { useMemo, useState, useEffect } from 'react';
import { dealsData, leadData } from '../../../data/mockData';
import SendMailModal from '../../Contacts/components/SendMailModal';
import SendMessageModal from '../../../components/SendMessageModal';
import toast from 'react-hot-toast';

const DealMatchingPage = ({ onNavigate, dealId }) => {
    const deal = useMemo(() => dealsData.find(d => d.id === dealId), [dealId]);

    // State for Bulk Selection
    const [selectedLeads, setSelectedLeads] = useState([]);

    // Communication Modals State
    const [isMailOpen, setIsMailOpen] = useState(false);
    const [isMessageOpen, setIsMessageOpen] = useState(false);
    const [selectedContactsForMail, setSelectedContactsForMail] = useState([]);
    const [selectedContactsForMessage, setSelectedContactsForMessage] = useState([]);

    const parsePrice = (priceStr) => {
        if (!priceStr) return 0;
        return parseFloat(priceStr.replace(/,/g, '').replace(/[^\d.]/g, ''));
    };

    const parseBudget = (budgetStr) => {
        if (!budgetStr) return { min: 0, max: 0 };
        const numbers = budgetStr.replace(/[^\d-]/g, '').split('-').map(n => parseFloat(n) || 0);
        if (numbers.length === 1) return { min: numbers[0], max: numbers[0] };
        return { min: numbers[0], max: numbers[1] };
    };

    const parseSizeSqYard = (sizeStr) => {
        if (!sizeStr) return 0;
        const match = sizeStr.match(/\(([\d.]+)\s*Sq Yard\)/);
        if (match) return parseFloat(match[1]);
        const marlaMatch = sizeStr.match(/([\d.]+)\s*Marla/);
        if (marlaMatch) return parseFloat(marlaMatch[1]) * 30.25;
        return parseFloat(sizeStr.replace(/[^\d.]/g, '')) || 0;
    };

    const matchedLeads = useMemo(() => {
        if (!deal) return [];

        const dealPrice = parsePrice(deal.price);
        const dealSize = parseSizeSqYard(deal.size);

        return leadData.map((lead, index) => {
            let score = 0;
            const details = {
                project: 'mismatch',
                type: 'mismatch',
                budget: 'mismatch',
                size: 'mismatch'
            };

            // Project/Location Match (30 points)
            const projectMatch = deal.projectName && lead.location && lead.location.toLowerCase().includes(deal.projectName.toLowerCase());
            const locationMatch = deal.location && lead.location && lead.location.toLowerCase().includes(deal.location.toLowerCase());

            if (projectMatch || locationMatch) {
                score += 30;
                details.project = 'match';
            }

            // Type Match (20 points)
            const dealType = deal.propertyType ? deal.propertyType.toLowerCase() : '';
            const leadType = lead.req?.type ? lead.req.type.toLowerCase() : '';
            if (dealType && leadType && (dealType.includes(leadType) || leadType.includes(dealType))) {
                score += 20;
                details.type = 'match';
            }

            // Budget Match (25 points)
            const budget = parseBudget(lead.budget);
            if (dealPrice >= budget.min && dealPrice <= budget.max) {
                score += 25;
                details.budget = 'match';
            } else if (dealPrice > 0 && budget.max > 0) {
                const diff = Math.abs(dealPrice - (budget.min + budget.max) / 2);
                const avg = (budget.min + budget.max) / 2;
                const proximity = Math.max(0, 25 - (diff / avg) * 50);
                score += proximity;
                if (proximity > 15) details.budget = 'partial';
            }

            // Size Match (25 points)
            if (lead.req?.size) {
                const leadSize = parseSizeSqYard(lead.req.size);
                if (leadSize > 0 && dealSize > 0) {
                    const diff = Math.abs(dealSize - leadSize);
                    const proximity = Math.max(0, 25 - (diff / leadSize) * 100);
                    score += proximity;
                    if (proximity > 20) details.size = 'match';
                    else if (proximity > 10) details.size = 'partial';
                } else {
                    score += 10;
                    details.size = 'partial';
                }
            }

            // Add mock stage and score if missing for professional feel
            // In a real app, these would come from the database
            const mockScores = [92, 78, 45, 88, 62, 35];
            const mockStages = ['Site Visit', 'Follow-up', 'Negotiation', 'Prospect', 'Initial Contact', 'Closure'];

            return {
                ...lead,
                matchPercentage: Math.round(score),
                matchDetails: details,
                leadScore: lead.score?.val || mockScores[index % mockScores.length],
                leadStage: lead.stage || mockStages[index % mockStages.length]
            };
        }).sort((a, b) => b.matchPercentage - a.matchPercentage);
    }, [deal]);

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedLeads(matchedLeads.map(l => l.mobile));
        } else {
            setSelectedLeads([]);
        }
    };

    const handleSelectLead = (mobile) => {
        setSelectedLeads(prev =>
            prev.includes(mobile) ? prev.filter(m => m !== mobile) : [...prev, mobile]
        );
    };

    const handleBatchMail = () => {
        const selected = matchedLeads.filter(l => selectedLeads.includes(l.mobile));
        setSelectedContactsForMail(selected);
        setIsMailOpen(true);
    };

    const handleBatchMessage = () => {
        const selected = matchedLeads.filter(l => selectedLeads.includes(l.mobile));
        setSelectedContactsForMessage(selected);
        setIsMessageOpen(true);
    };

    const handleWhatsApp = (mobile, name) => {
        const message = `Hi ${name}, I have a property that perfectly matches your requirement: ${deal.propertyType} at ${deal.location}. Price: ₹${deal.price}. Let me know if you are interested!`;
        window.open(`https://wa.me/91${mobile}?text=${encodeURIComponent(message)}`, '_blank');
    };

    if (!deal) {
        return (
            <div style={{ padding: '40px', textAlign: 'center' }}>
                <h2>Deal not found</h2>
                <button onClick={() => onNavigate('deals')} className="btn-primary">Go back to Deals</button>
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
        <div style={{ background: '#f1f5f9', minHeight: '100vh', padding: '24px', pb: '100px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button
                        onClick={() => onNavigate('deals')}
                        style={{ border: 'none', background: '#fff', width: '40px', height: '40px', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
                    >
                        <i className="fas fa-arrow-left" style={{ color: '#1e293b' }}></i>
                    </button>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Deal Match Center</h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Matching leads for:</span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: '4px' }}>{deal.propertyType} | {deal.id}</span>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff' }}>
                        <i className="fas fa-filter"></i> Filters
                    </button>
                    <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="fas fa-share-alt"></i> Share Deal
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '24px' }}>
                {/* Deal Snapshot */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ background: '#fff', borderRadius: '20px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', position: 'sticky', top: '24px' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-info-circle" style={{ color: '#3b82f6' }}></i> Deal Particulars
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px' }}>
                                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Property Info</label>
                                <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', margin: '4px 0' }}>{deal.propertyType}</p>
                                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>{deal.location} {deal.projectName ? `| ${deal.projectName}` : ''}</p>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px' }}>
                                    <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Size</label>
                                    <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', margin: '2px 0' }}>{deal.size.split('(')[0]}</p>
                                </div>
                                <div style={{ background: '#ecfdf5', padding: '12px', borderRadius: '12px' }}>
                                    <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>Price</label>
                                    <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#059669', margin: '2px 0' }}>₹{deal.price}</p>
                                </div>
                            </div>

                            <div>
                                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Assigned Agent</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ width: '36px', height: '36px', background: '#3b82f6', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 800, color: '#fff' }}>
                                        {deal.assigned?.charAt(0) || 'S'}
                                    </div>
                                    <div>
                                        <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>{deal.assigned || 'Suraj Keshwar'}</p>
                                        <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>Sales Manager</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Match Results List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* List Controls */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <input
                                type="checkbox"
                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                onChange={handleSelectAll}
                                checked={selectedLeads.length === matchedLeads.length && matchedLeads.length > 0}
                            />
                            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#64748b' }}>Select All Verified Matches</span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                            Sorted by <span style={{ fontWeight: 700, color: '#0f172a' }}>Match Accuracy</span>
                        </div>
                    </div>

                    {matchedLeads.map((lead, idx) => (
                        <div
                            key={lead.mobile + idx}
                            style={{
                                background: '#fff',
                                borderRadius: '20px',
                                padding: '24px',
                                boxShadow: selectedLeads.includes(lead.mobile) ? '0 0 0 2px #3b82f6, 0 4px 6px -1px rgba(0, 0, 0, 0.1)' : '0 1px 3px rgba(0,0,0,0.05)',
                                border: '1px solid #e2e8f0',
                                display: 'grid',
                                gridTemplateColumns: '40px 80px 1fr 240px',
                                gap: '20px',
                                alignItems: 'center',
                                transition: 'all 0.2s',
                                cursor: 'default'
                            }}
                        >
                            <input
                                type="checkbox"
                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                checked={selectedLeads.includes(lead.mobile)}
                                onChange={() => handleSelectLead(lead.mobile)}
                            />

                            {/* Match Score Thermometer */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                <div style={{ position: 'relative', width: '64px', height: '64px' }}>
                                    <svg width="64" height="64" viewBox="0 0 64 64">
                                        <circle cx="32" cy="32" r="28" fill="none" stroke="#f1f5f9" strokeWidth="6" />
                                        <circle
                                            cx="32" cy="32" r="28" fill="none"
                                            stroke={lead.matchPercentage > 70 ? '#10b981' : lead.matchPercentage > 40 ? '#f59e0b' : '#3b82f6'}
                                            strokeWidth="6"
                                            strokeDasharray={2 * Math.PI * 28}
                                            strokeDashoffset={2 * Math.PI * 28 * (1 - lead.matchPercentage / 100)}
                                            strokeLinecap="round"
                                            transform="rotate(-90 32 32)"
                                        />
                                    </svg>
                                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                        <span style={{ fontSize: '0.9rem', fontWeight: 900, color: '#0f172a' }}>{lead.matchPercentage}%</span>
                                    </div>
                                </div>
                            </div>

                            {/* Lead Info */}
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>{lead.name}</h4>
                                    <div style={{ background: lead.leadScore > 80 ? '#fef2f2' : '#f0f9ff', color: lead.leadScore > 80 ? '#dc2626' : '#2563eb', padding: '2px 8px', borderRadius: '100px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <i className={`fas fa-thermometer-${lead.leadScore > 80 ? 'full' : lead.leadScore > 50 ? 'half' : 'empty'}`}></i>
                                        {lead.leadScore > 80 ? 'Hot' : 'Warm'} ({lead.leadScore})
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
                                    <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <i className="fas fa-map-marker-alt" style={{ fontSize: '0.75rem' }}></i> {lead.location}
                                    </span>
                                    <span style={{ fontSize: '0.8rem', color: '#2563eb', fontWeight: 700, background: '#eff6ff', padding: '2px 8px', borderRadius: '4px' }}>
                                        {lead.leadStage}
                                    </span>
                                </div>

                                {/* Match Analysis Badges */}
                                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 700, padding: '4px 8px', borderRadius: '6px', border: `1px solid ${getStatusColor(lead.matchDetails.project)}`, color: getStatusColor(lead.matchDetails.project), display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <i className={`fas fa-${lead.matchDetails.project === 'match' ? 'check-circle' : 'circle'}`}></i> PROJECT
                                    </div>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 700, padding: '4px 8px', borderRadius: '6px', border: `1px solid ${getStatusColor(lead.matchDetails.type)}`, color: getStatusColor(lead.matchDetails.type), display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <i className={`fas fa-${lead.matchDetails.type === 'match' ? 'check-circle' : 'circle'}`}></i> TYPE
                                    </div>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 700, padding: '4px 8px', borderRadius: '6px', border: `1px solid ${getStatusColor(lead.matchDetails.budget)}`, color: getStatusColor(lead.matchDetails.budget), display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <i className={`fas fa-${lead.matchDetails.budget === 'match' ? 'check-circle' : 'circle'}`}></i> BUDGET
                                    </div>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 700, padding: '4px 8px', borderRadius: '6px', border: `1px solid ${getStatusColor(lead.matchDetails.size)}`, color: getStatusColor(lead.matchDetails.size), display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <i className={`fas fa-${lead.matchDetails.size === 'match' ? 'check-circle' : 'circle'}`}></i> SIZE
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={() => handleWhatsApp(lead.mobile, lead.name)}
                                        title="WhatsApp"
                                        style={{ flex: 1, padding: '10px', borderRadius: '12px', border: '1px solid #dcfce7', background: '#f0fdf4', color: '#166534', cursor: 'pointer' }}
                                    >
                                        <i className="fab fa-whatsapp"></i>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSelectedContactsForMessage([lead]);
                                            setIsMessageOpen(true);
                                        }}
                                        title="Send SMS"
                                        style={{ flex: 1, padding: '10px', borderRadius: '12px', border: '1px solid #eff6ff', background: '#f0f9ff', color: '#1e40af', cursor: 'pointer' }}
                                    >
                                        <i className="fas fa-comment-alt"></i>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSelectedContactsForMail([lead]);
                                            setIsMailOpen(true);
                                        }}
                                        title="Sent Email"
                                        style={{ flex: 1, padding: '10px', borderRadius: '12px', border: '1px solid #f8fafc', background: '#f1f5f9', color: '#334155', cursor: 'pointer' }}
                                    >
                                        <i className="fas fa-envelope"></i>
                                    </button>
                                </div>
                                <button
                                    className="btn-primary"
                                    style={{ width: '100%', padding: '12px', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 700 }}
                                    onClick={() => onNavigate('contact-detail', lead.mobile)}
                                >
                                    View Full Profile
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Batch Action Bar */}
            {selectedLeads.length > 0 && (
                <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: '#0f172a', padding: '16px 32px', borderRadius: '100px', display: 'flex', alignItems: 'center', gap: '32px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)', zIndex: 1000, border: '1px solid #334155' }}>
                    <div style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 600 }}>
                        <span style={{ color: '#3b82f6', fontSize: '1.1rem', fontWeight: 800 }}>{selectedLeads.length}</span> leads selected for broadcast
                    </div>
                    <div style={{ height: '24px', width: '1px', background: '#334155' }}></div>
                    <div style={{ display: 'flex', gap: '16px' }}>
                        <button
                            onClick={handleBatchMail}
                            style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                            <i className="fas fa-envelope" style={{ color: '#94a3b8' }}></i> Batch Email
                        </button>
                        <button
                            onClick={handleBatchMessage}
                            style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                            <i className="fas fa-comment-alt" style={{ color: '#94a3b8' }}></i> Batch SMS
                        </button>
                        <button
                            onClick={() => {
                                toast.success(`Shared Deal ID ${deal.id} with ${selectedLeads.length} contacts!`);
                                setSelectedLeads([]);
                            }}
                            style={{ background: '#3b82f6', border: 'none', color: '#fff', padding: '8px 20px', borderRadius: '100px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                            <i className="fab fa-whatsapp"></i> Broadcast on WA
                        </button>
                    </div>
                    <button
                        onClick={() => setSelectedLeads([])}
                        style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>
            )}

            {/* Communication Modals */}
            <SendMailModal
                isOpen={isMailOpen}
                onClose={() => setIsMailOpen(false)}
                selectedContacts={selectedContactsForMail}
            />
            <SendMessageModal
                isOpen={isMessageOpen}
                onClose={() => setIsMessageOpen(false)}
                selectedContacts={selectedContactsForMessage}
            />
        </div>
    );
};

export default DealMatchingPage;
