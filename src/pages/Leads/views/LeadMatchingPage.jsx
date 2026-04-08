import { useMemo, useState, useEffect } from 'react';
import { whatsappTemplates } from '../../../constants/templates';
import ComposeEmailModal from '../../Communication/components/ComposeEmailModal';
import SendMessageModal from '../../../components/SendMessageModal';
import CreateActivityModal from '../../../components/CreateActivityModal';
import AlgorithmSettingsModal from '../components/AlgorithmSettingsModal';
import toast from 'react-hot-toast';
import { api } from '../../../utils/api';
import { parseBudget, parseSizeSqYard } from '../../../utils/matchingLogic'; // Keeping for parsing utilities
import { useActivities } from '../../../context/ActivityContext';
import { renderValue } from '../../../utils/renderUtils';

const LeadMatchingPage = ({ onNavigate, leadId }) => {
    const { addActivity } = useActivities();
    const [lead, setLead] = useState(null);
    const [inventoryItems, setInventoryItems] = useState([]);
    const [loading, setLoading] = useState(true);

    // Selection State
    const [selectedItems, setSelectedItems] = useState([]);

    // Refinement State
    const [budgetFlexibility, setBudgetFlexibility] = useState(10); // % flexibility
    const [sizeFlexibility, setSizeFlexibility] = useState(10); // % flexibility
    const [includeNearby, setIncludeNearby] = useState(true);
    const [isTypeFlexible] = useState(false);
    const [isSizeFlexible] = useState(false);
    const [minMatchScore, setMinMatchScore] = useState(20);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [weights, setWeights] = useState({
        location: 30,
        type: 20,
        budget: 25,
        size: 25
    });

    useEffect(() => {
        const timer = setTimeout(() => {
            const fetchData = async () => {
                setLoading(true);
                try {
                    // 1. Fetch specific lead
                    const leadRes = await api.get(`leads/${leadId}`);
                    if (leadRes.data && leadRes.data.success) {
                        setLead(leadRes.data.data);
                    }

                    // 2. Fetch professional matches from backend engine with dynamic params
                    const matchRes = await api.get('deals/match', { 
                        params: { 
                            leadId, 
                            budgetFlexibility, 
                            sizeFlexibility, 
                            weights: JSON.stringify(weights) 
                        } 
                    });
                    
                    if (matchRes.data && matchRes.data.success) {
                        const mappedMatches = (matchRes.data.data || []).map(item => ({
                            ...item,
                            matchPercentage: item.score || 0,
                            gaps: item.score < 100 ? ["Partial match on fine details"] : [],
                            thumbnail: item.inventoryId?.images?.[0] || `https://picsum.photos/seed/${item._id}/200/150`
                        }));
                        setInventoryItems(mappedMatches);
                    }
                } catch (error) {
                    console.error("Error fetching match data:", error);
                    toast.error("Failed to load match data");
                } finally {
                    setLoading(false);
                }
            };

            fetchData();
        }, 600); // 600ms debounce for sliders

        return () => clearTimeout(timer);
    }, [leadId, budgetFlexibility, sizeFlexibility, weights]);

    // Communication Modals State
    const [isMailOpen, setIsMailOpen] = useState(false);
    const [isMessageOpen, setIsMessageOpen] = useState(false);
    const [isActivityOpen, setIsActivityOpen] = useState(false);
    const [, setSelectedItemsForAction] = useState([]);
    const [activityInitialData, setActivityInitialData] = useState(null);
    const [mailSubject, setMailSubject] = useState('');
    const [mailBody, setMailBody] = useState('');
    const [mailAttachments, setMailAttachments] = useState([]);
    const [mailTemplateId, setMailTemplateId] = useState('');

    // 2. Pre-parse Lead Context (Simplified for display only)
    const leadContext = useMemo(() => {
        if (!lead) return null;

        if (!lead.name) {
            lead.name = lead.contactDetails?.name || (lead.firstName ? `${lead.salutation || ""} ${lead.firstName} ${lead.lastName || ""}`.trim() : (lead.name || "Unknown"));
        }
        lead.mobile = lead.contactDetails?.mobile || lead.mobile;

        return {
            leadType: (lead.requirement?.lookup_value || "").toLowerCase(),
            leadLocation: (lead.location?.lookup_value || "").toLowerCase(),
        };
    }, [lead]);

    // 3. Centralized Logic moved to Server-Side
    const matchedItems = useMemo(() => {
        return inventoryItems; // Already fetched and mapped in useEffect
    }, [inventoryItems]);

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
        const template = whatsappTemplates.find(t => t.name === 'Property Presentation');
        let message = template.content;

        // Inject variables
        message = message.replace('{{ContactName}}', lead.name);
        message = message.replace('{{PropertyType}}', item.propertyType || item.type || 'Property');
        message = message.replace('{{Location}}', item.location);
        message = message.replace('{{Size}}', item.size);
        message = message.replace('{{Price}}', item.price);
        message = message.replace('{{PropertyLink}}', `http://bharatproperties.in/p/${item.id || item.unitNo}`);

        window.open(`https://wa.me/91${lead.mobile}?text=${encodeURIComponent(message)}`, '_blank');
        logActivity('WhatsApp Sent', item);
    };

    if (loading) {
        return (
            <div style={{ padding: '40px', textAlign: 'center' }}>
                <div className="loading-spinner"></div>
                <p>Loading matching properties...</p>
            </div>
        );
    }

    const handleSendPortfolio = () => {
        const selectedDeals = matchedItems.filter(item => selectedItems.includes(item.id || item.unitNo));
        if (selectedDeals.length === 0) {
            toast.error('Please select at least one property to send.');
            return;
        }

        const template = whatsappTemplates.find(t => t.name === 'Property Portfolio');
        let message = template.content;

        // Group properties list
        const propertyListText = selectedDeals.map((item, index) => {
            return `${index + 1}. *${item.propertyType || item.type || 'Property'}* in ${item.location}\n📐 ${item.size} | 💰 ₹${item.price}\n🔗 http://bharatproperties.in/p/${item.id || item.unitNo}`;
        }).join('\n\n');

        // Inject variables
        message = message.replace('{{ContactName}}', lead.name);
        message = message.replace('{{PropertiesCount}}', selectedDeals.length);
        message = message.replace('{{PropertyList}}', propertyListText);

        window.open(`https://wa.me/91${lead.mobile}?text=${encodeURIComponent(message)}`, '_blank');

        selectedDeals.forEach(item => logActivity('Portfolio Shared', item));
        setSelectedItems([]);
        toast.success(`Portfolio of ${selectedDeals.length} deals sent to ${lead.name}`);
    };

    const generateEmailContent = (items) => {
        const subject = `🔥 Priority Selected: Top ${items.length} Property Matches for your Requirement!`;
        let body = `Dear ${lead.name},<br><br>`;
        body += `We've been working hard to find the perfect properties for you. Based on our latest market analysis, we have identified these <strong>Top ${items.length} Matches</strong> that perfectly align with your requirements.<br><br>`;

        items.forEach((item, index) => {
            body += `<div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 20px; font-family: sans-serif; background: #fff;">`;
            body += `<div style="display: flex; gap: 16px; align-items: flex-start;">`;

            // Image Preview (if available)
            if (item.images && item.images.length > 0) {
                body += `<div style="width: 120px; height: 90px; border-radius: 8px; overflow: hidden; flex-shrink: 0; background: #f1f5f9;">`;
                body += `<img src="${item.images[0]}" style="width: 100%; height: 100%; object-fit: cover;">`;
                body += `</div>`;
            } else if (item.thumbnail) {
                body += `<div style="width: 120px; height: 90px; border-radius: 8px; overflow: hidden; flex-shrink: 0; background: #f1f5f9;">`;
                body += `<img src="${item.thumbnail}" style="width: 100%; height: 100%; object-fit: cover;">`;
                body += `</div>`;
            }

            body += `<div>`;
            body += `<h3 style="margin: 0; color: #1e293b; font-size: 1.1rem;">🏠 MATCH #${index + 1}: ${item.projectName || 'Premium Listing'}</h3>`;
            body += `<p style="margin: 4px 0; color: #64748b; font-size: 0.9rem;"><i class="fas fa-map-marker-alt"></i> ${item.location}</p>`;
            body += `<p style="margin: 4px 0; color: #475569; font-size: 0.85rem;">🏢 Type: <strong>${item.propertyType || item.type}</strong> | 📏 Size: <strong>${item.size}</strong></p>`;
            body += `<p style="margin: 8px 0; color: #10b981; font-weight: 800; font-size: 1.1rem;">💰 Exclusive Price: ₹${item.price}</p>`;
            body += `<div style="display: inline-block; background: #ecfdf5; color: #059669; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">✨ Match Accuracy: ${item.matchPercentage}%</div>`;
            body += `</div>`;
            body += `</div>`;
            body += `</div>`;
        });

        body += `<br>These properties are currently seeing high interest and are moving fast. I'd love to show them to you this week.<br><br>`;
        body += `<strong>Can we schedule a visit or a brief call today to discuss these?</strong><br><br>`;
        body += `Looking forward to helping you find your ideal property.<br><br>`;
        body += `Best regards,<br>`;
        body += `<strong>Bharat Properties Team</strong><br>`;
        body += `Ph: +91-XXXXX-XXXXX`;

        // Aggregate Attachments
        const attachments = [];
        items.forEach(item => {
            if (item.images) {
                item.images.forEach((url, i) => attachments.push({ type: 'image', url, name: `${item.projectName || 'Property'}_Img_${i + 1}.jpg` }));
            }
            if (item.video) {
                attachments.push({ type: 'video', url: item.video, name: `${item.projectName || 'Property'}_Video.mp4` });
            }
        });

        return { subject, body, attachments };
    };

    if (!lead) {
        return (
            <div style={{ padding: '40px', textAlign: 'center' }}>
                <h2>Lead not found</h2>
                <button onClick={() => onNavigate('leads')} className="btn-primary">Go back to Leads</button>
            </div>
        );
    }

    /*
    const getStatusColor = (status) => {
        switch (status) {
            case 'match': return '#10b981';
            case 'partial': return '#f59e0b';
            default: return '#94a3b8';
        }
    };
    */

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
                            <span
                                style={{ fontSize: '0.85rem', fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', textDecoration: 'none' }}
                                onClick={() => onNavigate('contact-detail', lead.mobile)}
                                onMouseOver={(e) => e.target.style.textDecoration = 'underline'}
                                onMouseOut={(e) => e.target.style.textDecoration = 'none'}
                            >
                                {lead.name} | {lead.mobile}
                            </span>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ padding: '8px 16px', background: '#ecfdf5', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #b9f6ca' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#166534' }}>Strict AI Engine Active</span>
                    </div>
                    <button
                        className="btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        onClick={() => {
                            const topMatches = matchedItems.slice(0, 5);
                            const { subject, body, attachments } = generateEmailContent(topMatches);
                            setMailSubject(subject);
                            setMailBody(body);
                            setMailAttachments(attachments);
                            setSelectedItemsForAction(topMatches);
                            setMailTemplateId('8'); // Property Presentation
                            setIsMailOpen(true);
                            toast.success(`Generated multimedia email for top ${topMatches.length} matches`);
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
                                <div style={{ padding: '0 0 16px 0', borderBottom: '1px solid #f1f5f9', marginBottom: '20px' }}>
                                    <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>{lead.req?.type}</p>
                                    <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}><i className="fas fa-map-marker-alt"></i> {lead.location}</p>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px' }}>
                                        <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Size</label>
                                        <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', margin: '2px 0' }}>{renderValue(lead.req?.size)}</p>
                                    </div>
                                    <div style={{ background: '#eff6ff', padding: '12px', borderRadius: '12px' }}>
                                        <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase' }}>Budget</label>
                                        <p style={{ fontSize: '0.85rem', fontWeight: 800, color: '#2563eb', margin: '2px 0' }}>{renderValue(lead.budget)}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Interactive Refinement */}
                    <div style={{ background: '#fff', borderRadius: '20px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', position: 'sticky', top: '24px' }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#64748b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            <i className="fas fa-shield-alt" style={{ color: '#10b981' }}></i> Match Controls
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {/* Flexibility Sliders */}
                            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Budget Flexibility</label>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#2563eb' }}>{budgetFlexibility}%</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0" max="50" 
                                        value={budgetFlexibility} 
                                        onChange={(e) => setBudgetFlexibility(parseInt(e.target.value))}
                                        style={{ width: '100%', cursor: 'pointer' }}
                                    />
                                </div>
                                <div style={{ marginBottom: '4px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Size Flexibility</label>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#2563eb' }}>{sizeFlexibility}%</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0" max="50" 
                                        value={sizeFlexibility} 
                                        onChange={(e) => setSizeFlexibility(parseInt(e.target.value))}
                                        style={{ width: '100%', cursor: 'pointer' }}
                                    />
                                </div>
                            </div>

                            {/* Scoring Weights */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <p style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Engine Weighting</p>
                                {[
                                    { key: 'location', label: '📍 Location Weight', color: '#3b82f6' },
                                    { key: 'type', label: '🏢 Type Symmetry', color: '#8b5cf6' },
                                    { key: 'budget', label: '💰 Price Match', color: '#10b981' },
                                    { key: 'size', label: '📐 Size/Specs', color: '#f59e0b' }
                                ].map(w => (
                                    <div key={w.key} style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: '10px', padding: '10px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569' }}>{w.label}</span>
                                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: w.color }}>{weights[w.key]}%</span>
                                        </div>
                                        <input 
                                            type="range" min="0" max="100" 
                                            value={weights[w.key]} 
                                            onChange={(e) => setWeights({...weights, [w.key]: parseInt(e.target.value)})}
                                            style={{ width: '100%', height: '4px' }}
                                        />
                                    </div>
                                ))}
                            </div>
                            
                            <div style={{ background: '#ecfdf5', padding: '12px', borderRadius: '10px', border: '1px solid #b9f6ca', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <i className="fas fa-check-circle" style={{ color: '#10b981' }}></i>
                                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#166534' }}>AI Backend Re-Syncing Live</span>
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
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{
                                        background: item.matchPercentage > 80 ? '#dcfce7' : item.matchPercentage > 50 ? '#fef3c7' : '#f1f5f9',
                                        color: item.matchPercentage > 80 ? '#166534' : item.matchPercentage > 50 ? '#92400e' : '#475569',
                                        padding: '4px 12px',
                                        borderRadius: '8px',
                                        fontSize: '1.2rem',
                                        fontWeight: 900,
                                        minWidth: '60px',
                                        textAlign: 'center',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                        border: `1px solid ${item.matchPercentage > 80 ? '#b9f6ca' : item.matchPercentage > 50 ? '#fde68a' : '#e2e8f0'}`
                                    }}>
                                        {item.unitNo || 'N/A'}
                                    </div>
                                    <span style={{ fontSize: '1rem', fontWeight: 800, color: '#10b981', background: '#ecfdf5', padding: '4px 12px', borderRadius: '100px', border: '1px solid #b9f6ca' }}>
                                        ₹{renderValue(item.price)}
                                    </span>
                                </div>

                                <div style={{ marginBottom: '12px' }}>
                                    <p style={{ fontSize: '0.9rem', color: '#0f172a', margin: '0 0 4px 0', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="fas fa-map-marker-alt" style={{ color: '#ef4444', fontSize: '0.8rem' }}></i>
                                        {renderValue(item.inventoryId?.projectName || item.projectName || 'Premium Listing')}
                                    </p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {item.inventoryId?.sector && (
                                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>
                                                {item.inventoryId.sector}
                                            </span>
                                        )}
                                        {item.inventoryId?.city && (
                                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: '4px' }}>
                                                {item.inventoryId.city}
                                            </span>
                                        )}
                                        {item.inventoryId?.address?.locality && (
                                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#10b981', background: '#ecfdf5', padding: '2px 8px', borderRadius: '4px' }}>
                                                {renderValue(item.inventoryId.address.locality)}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px', alignItems: 'center' }}>
                                    <div style={{ background: '#f1f5f9', padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <i className="fas fa-building" style={{ color: '#94a3b8', fontSize: '0.7rem' }}></i>
                                        Type: <span style={{ color: '#2563eb' }}>{item.propertyType || item.type || 'N/A'}</span>
                                    </div>
                                    <span style={{ width: '1px', height: '14px', background: '#e2e8f0', margin: '0 4px' }}></span>
                                    <div style={{ background: '#f8fafc', padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #e2e8f0' }}>
                                        <i className="fas fa-ruler-combined" style={{ color: '#94a3b8', fontSize: '0.7rem' }}></i>
                                        Size: <span style={{ color: '#0f172a' }}>{renderValue(item.size)}</span>
                                    </div>
                                </div>

                                {/* Professional Match Logic Tags */}
                                <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    {(item.matchDetails || []).map((detail, i) => {
                                        let tagBg = '#f1f5f9';
                                        let tagColor = '#475569';
                                        if (detail.includes("Budget")) { tagBg = '#dcfce7'; tagColor = '#166534'; }
                                        if (detail.includes("Orientation")) { tagBg = '#fef3c7'; tagColor = '#92400e'; }
                                        if (detail.includes("Unit") || detail.includes("Category")) { tagBg = '#e0f2fe'; tagColor = '#0369a1'; }
                                        
                                        return (
                                            <span key={i} style={{ fontSize: '0.65rem', fontWeight: 800, color: tagColor, background: tagBg, padding: '2px 8px', borderRadius: '6px', border: `1px solid ${tagColor}30`, textTransform: 'uppercase' }}>
                                                {detail}
                                            </span>
                                        );
                                    })}
                                </div>
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
                                            const { subject, body, attachments } = generateEmailContent([item]);
                                            setMailSubject(subject);
                                            setMailBody(body);
                                            setMailAttachments(attachments);
                                            setSelectedItemsForAction([item]);
                                            setMailTemplateId('8'); // ID for 'Property Presentation'
                                            setIsMailOpen(true);
                                        }}
                                        title="Email Presentation"
                                        style={{ flex: 1, height: '44px', borderRadius: '14px', border: '1px solid #eef2ff', background: '#f5f3ff', color: '#4338ca', cursor: 'pointer' }}
                                    >
                                        <i className="fas fa-envelope-open-text"></i>
                                    </button>
                                    <button
                                        onClick={() => {
                                            const toastId = toast.loading('Generating Professional PDF...');
                                            setTimeout(() => {
                                                toast.success('Professional Listing PDF Generated!', { id: toastId });
                                                logActivity('PDF Shared', item);
                                            }, 1500);
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
                                        // Improved project matching logic
                                        const areaText = (item.area || item.location || '').toLowerCase();
                                        const matchingProject = [].find(p =>
                                            areaText.includes(p.name.toLowerCase()) ||
                                            p.name.toLowerCase().includes(areaText)
                                        );

                                        setActivityInitialData({
                                            activityType: 'Site Visit',
                                            status: 'Not Started',
                                            purpose: 'Property Visit',
                                            relatedTo: [{ id: lead.mobile, name: lead.name }],
                                            visitedProperties: [{
                                                project: matchingProject ? matchingProject.name : (item.area || item.location || item.propertyType || item.type),
                                                block: item.location || 'A Block',
                                                property: item.unitNo || item.id,
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
                            onClick={handleSendPortfolio}
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
            <ComposeEmailModal
                isOpen={isMailOpen}
                onClose={() => setIsMailOpen(false)}
                recipients={[lead]}
                initialSubject={mailSubject}
                initialBody={mailBody}
                autoAttachments={mailAttachments}
                initialTemplateId={mailTemplateId}
            />
            <SendMessageModal
                isOpen={isMessageOpen}
                onClose={() => setIsMessageOpen(false)}
                initialRecipients={[{
                    ...lead,
                    name: lead.name || 'Lead',
                    phone: lead.mobile || lead.phone
                }]}
                onSend={(data, res) => {
                    toast.success(res?.message || 'Message Sent!');
                    setIsMessageOpen(false);
                }}
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

export default LeadMatchingPage;
