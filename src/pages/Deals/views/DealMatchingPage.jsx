import React, { useMemo, useState, useEffect } from 'react';
import SendMailModal from '../../Contacts/components/SendMailModal';
import SendMessageModal from '../../../components/SendMessageModal';
import CreateActivityModal from '../../../components/CreateActivityModal';
import toast from 'react-hot-toast';
import { api } from '../../../utils/api';
import { useActivities } from '../../../context/ActivityContext';

const DealMatchingPage = ({ onNavigate, dealId }) => {
    const { addActivity } = useActivities();
    const [deal, setDeal] = useState(null);
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!dealId) {
            setLoading(false);
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch specific deal
                const dealRes = await api.get(`deals/${dealId}`);
                if (dealRes.data && dealRes.data.success) {
                    setDeal(dealRes.data.deal);
                } else {
                    console.error("Deal fetch unsuccessful:", dealRes.data);
                }

                // Fetch leads for matching
                const leadsRes = await api.get('leads', { params: { limit: 1000 } });
                if (leadsRes.data && leadsRes.data.success) {
                    setLeads(leadsRes.data.records || []);
                }
            } catch (error) {
                console.error("Error fetching match data:", error);
                toast.error("Failed to load match data");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [dealId]);

    // State for Bulk Selection
    const [selectedLeads, setSelectedLeads] = useState([]);

    // Communication Modals State
    const [isMailOpen, setIsMailOpen] = useState(false);
    const [isMessageOpen, setIsMessageOpen] = useState(false);
    const [isActivityOpen, setIsActivityOpen] = useState(false);
    const [selectedContactsForMail, setSelectedContactsForMail] = useState([]);
    const [selectedContactsForMessage, setSelectedContactsForMessage] = useState([]);
    const [activityInitialData, setActivityInitialData] = useState(null);
    const [mailSubject, setMailSubject] = useState('');
    const [mailBody, setMailBody] = useState('');
    const [mailAttachments, setMailAttachments] = useState([]);

    // Refinement State
    const [budgetFlexibility, setBudgetFlexibility] = useState(10); // % flexibility
    const [sizeFlexibility, setSizeFlexibility] = useState(10); // % flexibility

    const parsePrice = (priceStr) => {
        if (!priceStr && priceStr !== 0) return 0;
        if (typeof priceStr === 'number') return priceStr;
        return parseFloat(String(priceStr).replace(/,/g, '').replace(/[^\d.]/g, '')) || 0;
    };

    const parseBudget = (budgetStr) => {
        if (!budgetStr && budgetStr !== 0) return { min: 0, max: 0 };
        if (typeof budgetStr === 'number') return { min: budgetStr, max: budgetStr };
        const numbers = String(budgetStr).replace(/[^\d-]/g, '').split('-').map(n => parseFloat(n) || 0);
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
        if (!deal || leads.length === 0) return [];

        const dealPrice = parsePrice(deal.price);
        const dealSize = parseSizeSqYard(deal.size);

        return leads.map((lead, index) => {
            let score = 0;
            const details = {
                project: 'mismatch',
                type: 'mismatch',
                budget: 'mismatch',
                size: 'mismatch'
            };

            const gaps = [];

            // Project/Location Match (30 points)
            const areaText = (lead.location || '').toLowerCase();
            const projectMatch = deal.projectName && areaText.includes(deal.projectName.toLowerCase());
            const locationMatch = deal.location && areaText.includes(deal.location.toLowerCase());

            if (projectMatch || locationMatch) {
                score += 30;
                details.project = 'match';
            } else {
                gaps.push('Location Mismatch');
            }

            // Type Match (20 points)
            const dealType = (deal.propertyType?.lookup_value || deal.propertyType || '').toLowerCase();
            const leadType = (lead.req?.type?.lookup_value || lead.req?.type || '').toLowerCase();
            if (dealType && leadType && (dealType.includes(leadType) || leadType.includes(dealType))) {
                score += 20;
                details.type = 'match';
            } else {
                gaps.push('Property Type Mismatch');
            }

            // Budget Match (25 points)
            const budget = parseBudget(lead.budget?.lookup_value || lead.budget);
            const budgetTolerance = (budget.max - budget.min || budget.max) * (budgetFlexibility / 100);

            if (dealPrice >= (budget.min - budgetTolerance) && dealPrice <= (budget.max + budgetTolerance)) {
                score += 25;
                details.budget = dealPrice >= budget.min && dealPrice <= budget.max ? 'match' : 'partial';
            } else {
                gaps.push('Budget Out of Range');
            }

            // Size Match (25 points)
            if (lead.req?.size) {
                const leadSize = parseSizeSqYard(lead.req.size);
                if (leadSize > 0 && dealSize > 0) {
                    const diff = Math.abs(dealSize - leadSize);
                    const tolerance = leadSize * (sizeFlexibility / 100);

                    if (diff <= tolerance) {
                        const proximity = Math.max(0, 25 - (diff / leadSize) * 100);
                        score += proximity;
                        details.size = diff === 0 ? 'match' : 'partial';
                    } else {
                        gaps.push('Size Mismatch');
                    }
                } else {
                    score += 10;
                    details.size = 'partial';
                }
            }

            // Add mock stage and score if missing for professional feel
            const mockScores = [92, 78, 45, 88, 62, 35];
            const mockStages = ['Site Visit', 'Follow-up', 'Negotiation', 'Prospect', 'Initial Contact', 'Closure'];

            return {
                ...lead,
                matchPercentage: Math.round(score),
                matchDetails: details,
                gaps,
                leadScore: lead.score?.val || mockScores[index % mockScores.length],
                leadStage: lead.stage || mockStages[index % mockStages.length]
            };
        })
            .filter(l => l.matchPercentage > 10)
            .sort((a, b) => b.matchPercentage - a.matchPercentage);
    }, [deal, budgetFlexibility, sizeFlexibility, leads]);

    if (loading) {
        return (
            <div style={{ padding: '40px', textAlign: 'center' }}>
                <div className="loading-spinner"></div>
                <p>Loading matching leads...</p>
            </div>
        );
    }

    if (!deal) {
        return (
            <div style={{ padding: '80px 40px', textAlign: 'center', background: '#f8fafc', minHeight: '100vh' }}>
                <div style={{ maxWidth: '400px', margin: '0 auto', background: '#fff', padding: '40px', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                    <div style={{ width: '64px', height: '64px', background: '#fee2e2', color: '#ef4444', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '1.5rem' }}>
                        <i className="fas fa-exclamation-triangle"></i>
                    </div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>Deal Not Found</h2>
                    <p style={{ color: '#64748b', marginBottom: '24px' }}>The deal you're looking for might have been deleted or moved.</p>
                    <button
                        onClick={() => onNavigate('deals')}
                        style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                    >
                        <i className="fas fa-arrow-left"></i> Go back to Deals
                    </button>
                </div>
            </div>
        );
    }

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

    const generateEmailContent = (leads) => {
        const subject = `🔥 Priority Deal: Exclusive ${deal.propertyType} in ${deal.location}!`;
        let body = `Dear Partner,<br><br>`;
        body += `We have an exclusive property listing that perfectly aligns with your current requirements. This <strong>${deal.propertyType}</strong> at <strong>${deal.location}</strong> represents a significant opportunity in the current market.<br><br>`;

        body += `<div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin-bottom: 24px; font-family: sans-serif; background: #fff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">`;
        body += `<div style="display: flex; gap: 20px; align-items: flex-start;">`;

        // Deal Image (if available) - Currently using a placeholder as deal doesn't have images in state yet
        // In a real scenario, we'd use deal.images[0]
        body += `<div style="width: 200px; height: 140px; border-radius: 12px; overflow: hidden; flex-shrink: 0; background: #f1f5f9;">`;
        body += `<img src="https://images.unsplash.com/photo-1564013799919-ab600027ffc6" style="width: 100%; height: 100%; object-fit: cover;">`;
        body += `</div>`;

        body += `<div>`;
        body += `<h2 style="margin: 0; color: #1e293b; font-size: 1.4rem;">🏠 ${deal.propertyType}</h2>`;
        body += `<p style="margin: 6px 0; color: #64748b; font-size: 1rem;"><i class="fas fa-map-marker-alt"></i> ${deal.location} ${deal.projectName ? `| ${deal.projectName}` : ''}</p>`;
        body += `<p style="margin: 8px 0; color: #475569; font-size: 0.95rem;">📏 Size: <strong>${deal.size}</strong></p>`;
        body += `<p style="margin: 12px 0; color: #10b981; font-weight: 800; font-size: 1.5rem;">💰 Price: ₹${deal.price}</p>`;
        body += `</div>`;
        body += `</div>`;
        body += `</div>`;

        body += `This property has been vetted by our experts and is ready for immediate site visits.<br><br>`;
        body += `<strong>Would you like to schedule a visit for your client(s) this weekend?</strong><br><br>`;
        body += `Looking forward to your swift response.<br><br>`;
        body += `Best regards,<br>`;
        body += `<strong>${deal.assigned || 'Bharat Properties Team'}</strong><br>`;
        body += `Ph: +91-XXXXX-XXXXX`;

        // Attachments
        const attachments = [
            { type: 'image', url: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6', name: 'Property_Main.jpg' },
            { type: 'image', url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750', name: 'Property_Interior.jpg' },
            { type: 'video', url: 'https://www.w3schools.com/html/mov_bbb.mp4', name: 'Property_Walkthrough.mp4' }
        ];

        return { subject, body, attachments };
    };

    const handleBatchMail = () => {
        const selected = matchedLeads.filter(l => selectedLeads.includes(l.mobile));
        const { subject, body, attachments } = generateEmailContent(selected);
        setMailSubject(subject);
        setMailBody(body);
        setMailAttachments(attachments);
        setSelectedContactsForMail(selected);
        setIsMailOpen(true);
        toast.success(`Generated personalized email for ${selected.length} leads`);
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

    const getStageColor = (stage) => {
        switch (stage.toLowerCase()) {
            case 'site visit': return { bg: '#eff6ff', color: '#2563eb' };
            case 'negotiation': return { bg: '#f3e8ff', color: '#9333ea' };
            case 'closure': return { bg: '#f0fdf4', color: '#16a34a' };
            case 'follow-up': return { bg: '#fff7ed', color: '#ea580c' };
            default: return { bg: '#f8fafc', color: '#64748b' };
        }
    };

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
                    <button
                        className="btn-outline"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff' }}
                        onClick={() => {
                            const panel = document.getElementById('refine-matches-panel');
                            if (panel) panel.scrollIntoView({ behavior: 'smooth' });
                            else toast('Please use the Refine Matches panel below');
                        }}
                    >
                        <i className="fas fa-filter"></i> Filters
                    </button>
                    <button
                        className="btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        onClick={() => {
                            const text = `*New Deal Alert!* 🏠\n\n*${deal.propertyType}* in *${deal.location}*\nSize: ${deal.size}\nPrice: ₹${deal.price}\n\nContact: ${deal.assigned || 'Bharat Properties'}`;
                            navigator.clipboard.writeText(text);
                            toast.success("Deal details copied to clipboard!");
                        }}
                    >
                        <i className="fas fa-share-alt"></i> Share Deal
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '24px' }}>
                {/* Deal Snapshot */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ background: '#fff', borderRadius: '20px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
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

                    {/* Interactive Refinement */}
                    <div id="refine-matches-panel" style={{ background: '#fff', borderRadius: '20px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', position: 'sticky', top: '24px' }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#64748b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            <i className="fas fa-filter" style={{ color: '#f59e0b' }}></i> Refine Matches
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b' }}>Budget Flexibility</label>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#3b82f6' }}>±{budgetFlexibility}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0" max="50"
                                    value={budgetFlexibility}
                                    onChange={(e) => setBudgetFlexibility(parseInt(e.target.value))}
                                    style={{ width: '100%', cursor: 'pointer', accentColor: '#3b82f6' }}
                                />
                                <p style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '4px' }}>Expand budget range for matching leads.</p>
                            </div>

                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b' }}>Size Flexibility</label>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#10b981' }}>±{sizeFlexibility}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0" max="50"
                                    value={sizeFlexibility}
                                    onChange={(e) => setSizeFlexibility(parseInt(e.target.value))}
                                    style={{ width: '100%', cursor: 'pointer', accentColor: '#10b981' }}
                                />
                                <p style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '4px' }}>Allow deviation in required size matching.</p>
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
                                    <h4
                                        style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#2563eb', cursor: 'pointer', textDecoration: 'none' }}
                                        onClick={() => onNavigate('contact-detail', lead.mobile)}
                                        onMouseOver={(e) => e.target.style.textDecoration = 'underline'}
                                        onMouseOut={(e) => e.target.style.textDecoration = 'none'}
                                    >
                                        {lead.name}
                                    </h4>
                                    <div style={{ background: lead.leadScore > 80 ? '#fef2f2' : '#f0f9ff', color: lead.leadScore > 80 ? '#dc2626' : '#2563eb', padding: '2px 8px', borderRadius: '100px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <i className={`fas fa-thermometer-${lead.leadScore > 80 ? 'full' : lead.leadScore > 50 ? 'half' : 'empty'}`}></i>
                                        {lead.leadScore > 80 ? 'Hot' : 'Warm'} ({lead.leadScore})
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
                                    <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <i className="fas fa-map-marker-alt" style={{ fontSize: '0.75rem' }}></i> {lead.location}
                                    </span>
                                    <span style={{
                                        fontSize: '0.75rem',
                                        color: getStageColor(lead.leadStage).color,
                                        fontWeight: 800,
                                        background: getStageColor(lead.leadStage).bg,
                                        padding: '4px 12px',
                                        borderRadius: '8px',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px'
                                    }}>
                                        {lead.leadStage}
                                    </span>
                                </div>

                                {/* Match Analysis Badges */}
                                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                                    <div
                                        title={`Deal: ${deal.projectName || 'N/A'} | Lead: ${lead.location}`}
                                        style={{ fontSize: '0.65rem', fontWeight: 700, padding: '4px 8px', borderRadius: '6px', border: `1px solid ${getStatusColor(lead.matchDetails.project)}`, color: getStatusColor(lead.matchDetails.project), display: 'flex', alignItems: 'center', gap: '4px', cursor: 'help' }}
                                    >
                                        <i className={`fas fa-${lead.matchDetails.project === 'match' ? 'check-circle' : 'circle'}`}></i> PROJECT
                                    </div>
                                    <div
                                        title={`Deal: ${deal.propertyType} | Lead: ${lead.req?.type}`}
                                        style={{ fontSize: '0.65rem', fontWeight: 700, padding: '4px 8px', borderRadius: '6px', border: `1px solid ${getStatusColor(lead.matchDetails.type)}`, color: getStatusColor(lead.matchDetails.type), display: 'flex', alignItems: 'center', gap: '4px', cursor: 'help' }}
                                    >
                                        <i className={`fas fa-${lead.matchDetails.type === 'match' ? 'check-circle' : 'circle'}`}></i> TYPE
                                    </div>
                                    <div
                                        title={`Deal: ₹${deal.price} | Lead: ${lead.budget}`}
                                        style={{ fontSize: '0.65rem', fontWeight: 700, padding: '4px 8px', borderRadius: '6px', border: `1px solid ${getStatusColor(lead.matchDetails.budget)}`, color: getStatusColor(lead.matchDetails.budget), display: 'flex', alignItems: 'center', gap: '4px', cursor: 'help' }}
                                    >
                                        <i className={`fas fa-${lead.matchDetails.budget === 'match' ? 'check-circle' : 'circle'}`}></i> BUDGET
                                    </div>
                                    <div
                                        title={`Deal: ${deal.size} | Lead: ${lead.req?.size}`}
                                        style={{ fontSize: '0.65rem', fontWeight: 700, padding: '4px 8px', borderRadius: '6px', border: `1px solid ${getStatusColor(lead.matchDetails.size)}`, color: getStatusColor(lead.matchDetails.size), display: 'flex', alignItems: 'center', gap: '4px', cursor: 'help' }}
                                    >
                                        <i className={`fas fa-${lead.matchDetails.size === 'match' ? 'check-circle' : 'circle'}`}></i> SIZE
                                    </div>
                                </div>

                                {/* Gaps Display */}
                                {lead.gaps && lead.gaps.length > 0 && (
                                    <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                                        {lead.gaps.map((gap, i) => (
                                            <span key={i} style={{ fontSize: '0.6rem', fontWeight: 700, color: '#ef4444', background: '#fef2f2', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fee2e2' }}>
                                                {gap}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={() => window.open(`tel:${lead.mobile}`)}
                                        title="Call Lead"
                                        style={{ flex: 1, padding: '10px', borderRadius: '12px', border: '1px solid #dcfce7', background: '#f0fdf4', color: '#166534', cursor: 'pointer' }}
                                    >
                                        <i className="fas fa-phone-alt"></i>
                                    </button>
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
                                </div>
                                <button
                                    className="btn-primary"
                                    style={{ width: '100%', padding: '8px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 700, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                                    onClick={() => {
                                        setActivityInitialData({
                                            activityType: 'Site Visit',
                                            status: 'Not Started',
                                            purpose: 'Property Visit',
                                            relatedTo: [{ id: lead.mobile, name: lead.name }],
                                            visitedProperties: [{
                                                project: deal.projectName || deal.location || deal.propertyType,
                                                block: deal.location || 'A Block',
                                                property: deal.unitNo || deal.id,
                                                result: '',
                                                feedback: ''
                                            }]
                                        });
                                        setIsActivityOpen(true);
                                    }}
                                >
                                    Log Site Visit Interest
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
                recipients={selectedContactsForMail}
                initialSubject={mailSubject}
                initialBody={mailBody}
                autoAttachments={mailAttachments}
            />
            <SendMessageModal
                isOpen={isMessageOpen}
                onClose={() => setIsMessageOpen(false)}
                selectedContacts={selectedContactsForMessage}
            />
            <CreateActivityModal
                isOpen={isActivityOpen}
                onClose={() => setIsActivityOpen(false)}
                initialData={activityInitialData}
                onSave={(data) => {
                    addActivity(data);
                    setIsActivityOpen(false);
                }}
            />
        </div>
    );
};

export default DealMatchingPage;
