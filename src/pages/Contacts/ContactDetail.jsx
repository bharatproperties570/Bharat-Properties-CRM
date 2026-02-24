import React, { useState, useEffect } from 'react';
import { api, enrichmentAPI } from '../../utils/api';
import { contactData, leadData, inventoryData } from '../../data/mockData';
import { getInitials } from '../../utils/helpers';
import LeadConversionService from '../../services/LeadConversionService';
import { calculateLeadScore, getLeadTemperature } from '../../utils/leadScoring';
import { useSequences } from '../../context/SequenceContext';
import EnrollSequenceModal from '../../components/EnrollSequenceModal';

import { usePropertyConfig } from '../../context/PropertyConfigContext';

const ContactDetail = ({ contactId, onBack, onAddActivity }) => {
    const { scoringAttributes, activityMasterFields } = usePropertyConfig(); // Inject Context
    const { sequences, enrollments, updateEnrollmentStatus } = useSequences();
    const [contact, setContact] = useState(null);
    const [composerTab, setComposerTab] = useState('note');
    const [expandedSections, setExpandedSections] = useState(['core', 'professional', 'location', 'financial', 'education', 'personal', 'pref', 'journey', 'negotiation', 'ai', 'ownership', 'documents']);
    const [timelineFilter, setTimelineFilter] = useState('all');

    const [showMoreMenu, setShowMoreMoreMenu] = useState(false);
    const [showScoreBreakdown, setShowScoreBreakdown] = useState(false);
    const [toast, setToast] = useState(null);
    const [dealStatus, setDealStatus] = useState('active'); // 'active' or 'lost'
    const [recordType, setRecordType] = useState('contact'); // 'contact' or 'lead'
    const [pendingTasks, setPendingTasks] = useState([{ id: Date.now(), subject: '', dueDate: '', reminder: false }]);
    const [composerContent, setComposerContent] = useState('');
    const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);

    const showNotification = (message) => {
        setToast(message);
        setTimeout(() => setToast(null), 3000);
    };

    const handleAutoSave = (field, value) => {
        showNotification(`${field} auto-saved!`);
        // In real app: save to backend
    };

    const renderLookup = (field, fallback = '-') => {
        if (!field) return fallback;
        if (typeof field === 'object' && field.lookup_value) return field.lookup_value;
        if (typeof field === 'object' && Object.keys(field).length > 0 && !field.lookup_value) return fallback;
        return typeof field === 'string' ? field : fallback;
    };

    const addTask = () => {
        setPendingTasks([...pendingTasks, { id: Date.now(), subject: '', dueDate: '', reminder: false }]);
    };

    const removeTask = (id) => {
        if (pendingTasks.length > 1) {
            setPendingTasks(pendingTasks.filter(task => task.id !== id));
        }
    };

    const updateTask = (id, field, value) => {
        setPendingTasks(pendingTasks.map(task =>
            task.id === id ? { ...task, [field]: value } : task
        ));
    };

    const handleSaveActivity = () => {
        if (composerTab === 'task') {
            const tasksToSave = pendingTasks.filter(t => t.subject.trim());
            if (tasksToSave.length === 0) {
                showNotification('Please enter at least one task subject.');
                return;
            }
            // In real app: call onAddActivity or API
            showNotification(`${tasksToSave.length} task(s) saved!`);
            setPendingTasks([{ id: Date.now(), subject: '', dueDate: '', reminder: false }]);
        } else {
            if (!composerContent.trim()) {
                showNotification('Please enter details.');
                return;
            }
            showNotification(`${composerTab.charAt(0).toUpperCase() + composerTab.slice(1)} logged!`);
            setComposerContent('');
        }
    };


    useEffect(() => {
        const fetchData = async () => {
            if (!contactId) return;

            try {
                // Try fetching as contact first
                let response = await api.get(`contacts/${contactId}`);
                let foundType = 'contact';

                if (!response.data || !response.data.success) {
                    // Try fetching as lead
                    response = await api.get(`leads/${contactId}`);
                    foundType = 'lead';
                }

                if (response.data && response.data.success) {
                    const data = response.data.data;
                    setContact(data);
                    setRecordType(foundType);
                } else {
                    setContact(null);
                }
            } catch (error) {
                // If it fails, try lead if it was contact or vice versa
                try {
                    const leadRes = await api.get(`leads/${contactId}`);
                    if (leadRes.data && leadRes.data.success) {
                        setContact(leadRes.data.data);
                        setRecordType('lead');
                    } else {
                        setContact(null);
                    }
                } catch (e) {
                    console.error("Error fetching record details:", e);
                    setContact(null);
                }
            }
        };

        fetchData();
    }, [contactId]);

    const toggleSection = (section) => {
        setExpandedSections(prev =>
            prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]
        );
    };

    // Lead Scoring Engine Integration
    const getAIStats = () => {
        const activities = contact?.activities || [];
        const today = new Date().toISOString().split('T')[0];

        const categorized = activities.reduce((acc, act) => {
            const status = act.status || (act.type ? 'Completed' : 'Upcoming');
            if (status === 'Completed' || act.type) {
                acc.completed.push(act);
            } else if (act.dueDate < today) {
                acc.due.push(act);
            } else {
                acc.upcoming.push(act);
            }
            return acc;
        }, { due: [], upcoming: [], completed: [] });

        const scoring = calculateLeadScore(contact || {}, activities, { scoringAttributes, activityMasterFields });

        // Smart Property Ownership Matching
        const normalize = (phone) => phone?.toString()?.replace(/\D/g, '')?.slice(-10);
        const contactPhone = normalize(contact?.mobile);
        const contactEmail = contact?.email?.toLowerCase()?.trim();

        const ownedProperties = inventoryData.filter(p => {
            const propPhone = normalize(p.ownerPhone);
            const propEmail = p.ownerEmail?.toLowerCase()?.trim();
            const prevPhone = normalize(p.previousOwnerPhone);
            const prevEmail = p.previousOwnerEmail?.toLowerCase()?.trim();

            return (propPhone && contactPhone && propPhone === contactPhone) ||
                (propEmail && contactEmail && propEmail === contactEmail) ||
                (prevPhone && contactPhone && prevPhone === contactPhone) ||
                (prevEmail && contactEmail && prevEmail === contactEmail);
        }).map(p => {
            const propPhone = normalize(p.ownerPhone);
            const propEmail = p.ownerEmail?.toLowerCase()?.trim();
            const isCurrentMatch = (propPhone && contactPhone && propPhone === contactPhone) ||
                (propEmail && contactEmail && propEmail === contactEmail);

            let matchType = 'Previous Owner';
            if (isCurrentMatch && p.status !== 'Sold Out') {
                const contactParts = contact?.name?.toLowerCase()?.split(' ') || [];
                const propParts = p.ownerName?.toLowerCase()?.split(' ') || [];
                const contactLast = contactParts[contactParts.length - 1] || '';
                const propLast = propParts[propParts.length - 1] || '';

                const nameMatch = (contactLast && p.ownerName?.toLowerCase()?.includes(contactLast)) ||
                    (propLast && contact?.name?.toLowerCase()?.includes(propLast));

                matchType = nameMatch ? 'Confirmed Owner' : 'Suggestion (Property Owner)';
            }

            return { ...p, matchType };
        }).sort((a, b) => {
            const order = { 'Confirmed Owner': 1, 'Suggestion (Property Owner)': 2, 'Previous Owner': 3 };
            return order[a.matchType] - order[b.matchType];
        });

        const leadScore = {
            total: scoring.total,
            formScore: scoring.formScore,
            activityScore: scoring.activityScore,
            detail: scoring.breakdown,
            intent: scoring.intent,
            temp: scoring.temperature,
            categorized, // Adding this for the timeline
            ownedProperties // Ownership Section data
        };

        const dealProbability = {
            score: leadScore.total >= 80 ? 92 : leadScore.total >= 60 ? 76 : leadScore.total >= 40 ? 55 : 32,
            trend: 'up',
            factors: ['Within negotiation range', 'Scheduled visit', 'Owner flex match']
        };

        const priceInsight = {
            listed: '₹1.30 Cr',
            suggested: '₹1.18 Cr – ₹1.24 Cr',
            reasons: [
                'Similar properties closed at ₹1.22 Cr',
                'Owner flexibility: Medium',
                'Buyer engagement: High'
            ],
            confidence: 85
        };

        const ownerIntelligence = {
            type: 'Investor',
            scope: 'Medium',
            pastBehavior: 'Accepted ₹5L below asking',
            firmness: 'Firm on price in last 2 deals',
            urgency: 'Immediate',
            tip: 'Owner likely to accept 3–5% below asking if site visit is confirmed.',
            leverage: 'Payment speed'
        };

        const journeySteps = [
            { label: 'Viewed', date: 'Jan 15', status: 'completed', property: 'Sec 17 Plot' },
            { label: 'Shortlisted', date: 'Jan 18', status: 'completed', property: 'Sec 17 Plot' },
            { label: 'Site Visit', date: 'Jan 20', status: 'completed', agent: 'Suresh K.' },
            { label: 'Negotiation', date: 'Today', status: 'active', subtext: 'AI Suggestion: ₹1.22 Cr' },
            { label: 'Deal Created', date: '-', status: 'pending' },
            { label: 'Closed', date: '-', status: 'pending' }
        ];

        const rejectionAlert = "Avoid properties above ₹1.3 Cr or in Sector 5";

        const purchaseIntent = {
            level: leadScore.intent,
            emoji: leadScore.total >= 80 ? '🔥' : leadScore.total >= 60 ? '🌤' : leadScore.total >= 40 ? '❄' : '🧊',
            confidence: '95%',
            color: leadScore.temp.color
        };

        const riskLevel = {
            status: leadScore.total >= 80 ? 'Stable' : leadScore.total >= 60 ? 'Predictable' : 'High Risk',
            reason: leadScore.total >= 80 ? 'High view frequency' : 'Delayed follow-ups',
            color: leadScore.total >= 80 ? '#0ea5e9' : '#f59e0b'
        };

        const priority = {
            level: leadScore.total >= 80 ? 'P1' : leadScore.total >= 60 ? 'P2' : 'P3',
            reason: 'Negotiation Phase',
            color: leadScore.total >= 80 ? '#ef4444' : '#64748b'
        };

        const preferences = {
            locations: ['Sector 17', 'Sector 24'],
            budget: '₹1.1 - 1.5 Cr',
            flexibility: '15%',
            type: 'Residential Plot',
            urgency: leadScore.total >= 80 ? 'Extreme' : 'Moderate',
            dealType: 'Direct Purchase'
        };

        const closingProbability = {
            current: dealProbability.score,
            stages: [
                { label: 'Inquiry', prob: 25, status: 'completed' },
                { label: 'Interest', prob: 40, status: 'completed' },
                { label: 'Shortlist', prob: 55, status: 'completed' },
                { label: 'Site Visit', prob: 70, status: 'completed' },
                { label: 'Negotiation', prob: 85, status: 'active' },
                { label: 'Closing', prob: 100, status: 'pending' }
            ],
            insight: 'Probability increased +15% after site visit.',
            history: 'Last change: +8% (Shortlisting Sec 17)'
        };

        const commission = {
            value: '₹1.25 Cr',
            type: '2%',
            total: '₹2,50,000',
            splits: [
                { label: 'Buyer Side', value: '₹1.5 L' },
                { label: 'Owner Side', value: '₹1.0 L' }
            ],
            bonus: 'Incentive of ₹25k applicable if closed by month-end',
            risks: ['Documentation dependency: Pending CC', 'Payment risk: Medium']
        };

        const persona = {
            type: 'Investor', // Could be 'End-User'
            label: 'Investor',
            icon: 'briefcase',
            color: '#8b5cf6',
            metrics: [
                { label: 'ROI', value: '18% Expected' },
                { label: 'Rental Yield', value: '4.2%' },
                { label: 'Exit Value (3y)', value: '₹1.8 Cr' }
            ],
            pitch: 'Share ROI sheet & discuss Bulk Deal'
        };

        const lossAnalysis = {
            summary: "The deal was lost primarily due to a price mismatch and the buyer selecting a competitor project (Green Valley) which offered better immediate amenities. High urgency meant they couldn't wait for the CC of this property.",
            primaryReasons: [
                { label: 'Price Mismatch', type: 'auto', confidence: 92, icon: 'tag' },
                { label: 'Competitor Selected', type: 'manual', confidence: 100, icon: 'users' },
                { label: 'Timeline Pressure', type: 'auto', confidence: 85, icon: 'clock' }
            ],
            contributingFactors: [
                { label: 'Missing CC Document', impact: 'High' },
                { label: 'Amenity Gap (Clubhouse)', impact: 'Medium' },
                { label: 'Location Connectivity', impact: 'Low' }
            ],
            recoveryOptions: [
                { label: 'Recommend Sector 24 Plots', icon: 'home', description: 'Immediate possession available, similar budget.' },
                { label: 'Re-engage in 3 Months', icon: 'calendar', description: 'CC expected soon, price may stabilize.' }
            ],
            couldHaveSaved: [
                { label: 'Early Discount', description: 'A 5% early-bird discount could have bridged the gap.' },
                { label: 'CC Assurance', description: 'Legally backed CC timeline could have retained trust.' }
            ]
        };

        const propertyContext = {
            unitNumber: 'Unit #1',
            block: 'A Block',
            corner: 'Corner',
            facing: 'Park Facing',
            roadWidth: '100 Ft. Road',
            verification: 'Verified'
        };

        const financialDetails = {
            priceWord: 'One crore twenty-five lakh only',
            matchedDeals: 12
        };

        return { leadScore, dealProbability, priceInsight, ownerIntelligence, journeySteps, rejectionAlert, purchaseIntent, riskLevel, priority, preferences, closingProbability, commission, persona, lossAnalysis, propertyContext, financialDetails };
    };

    if (!contact) {
        return (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-gray)', color: 'var(--text-muted)' }}>
                <i className="fas fa-search-plus" style={{ fontSize: '3rem', marginBottom: '1.5rem', color: 'var(--primary-color)', opacity: 0.5 }}></i>
                <h2 style={{ color: 'var(--text-main)', marginBottom: '0.5rem' }}>Record Not Found</h2>
                <p>No contact or lead found with ID: {contactId}</p>
                <button onClick={onBack} className="btn-primary" style={{ marginTop: '20px' }}>Back to Sales Pipeline</button>
            </div>
        );
    }

    const aiStats = getAIStats();

    return (
        <div className="contact-detail-page" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f8fafc', overflow: 'hidden' }}>
            <style>
                {`
                :root {
                    --premium-blue: #4f46e5;
                    --premium-blue-glow: rgba(79, 70, 229, 0.15);
                    --glass-bg: rgba(255, 255, 255, 0.7);
                    --glass-border: rgba(255, 255, 255, 0.3);
                    --soft-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.07);
                }
                .glass-card {
                    background: var(--glass-bg);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid var(--glass-border);
                    box-shadow: var(--soft-shadow);
                    transition: all 0.3s ease;
                }
                .glass-card:hover {
                    box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.12);
                    transform: translateY(-2px);
                }
                .editable-field {
                    transition: all 0.2s ease;
                    border-bottom: 2px solid transparent;
                }
                .editable-field:focus {
                    background: #f8fafc;
                    outline: none;
                    border-bottom: 2px solid var(--premium-blue);
                }
                .pulse-dot {
                    width: 8px;
                    height: 8px;
                    background: #16a34a;
                    border-radius: 50%;
                    box-shadow: 0 0 0 rgba(22, 163, 74, 0.4);
                    animation: pulse 2s infinite;
                }
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.4); }
                    70% { box-shadow: 0 0 0 10px rgba(22, 163, 74, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0); }
                }
                /* Hide scrollbar utility */
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                `}
            </style>
            {/* STICKY HEADER */}
            <header style={{
                background: 'rgba(255, 255, 255, 0.8)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
                padding: '10px 2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                position: 'sticky',
                top: 0,
                zIndex: 100,
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <button onClick={onBack} style={{ border: 'none', background: 'rgba(241, 245, 249, 0.8)', color: '#475569', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}>
                        <i className="fas fa-arrow-left"></i>
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div className="avatar-circle avatar-1" style={{ width: '48px', height: '48px', fontSize: '1.2rem', fontWeight: 800, border: '3px solid #fff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                            {getInitials(contact.name)}
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                                <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.5px' }}>{contact.name}</h1>
                                {contact && (
                                    <div className={`score-indicator ${aiStats.leadScore.temp.class}`} style={{ width: '32px', height: '32px', fontSize: '0.8rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', border: '2px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', background: aiStats.leadScore.temp.color, color: '#fff' }}>
                                        {aiStats.leadScore.total}
                                    </div>
                                )}
                                {contact.intent_index > 0 && (
                                    <div title="Intent Index" style={{ width: '32px', height: '32px', fontSize: '0.8rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', border: '2px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', background: contact.intent_index >= 70 ? '#10b981' : contact.intent_index >= 40 ? '#f59e0b' : '#ef4444', color: '#fff' }}>
                                        {contact.intent_index}
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <span style={{
                                        background: recordType === 'lead' ? '#ecfdf5' : '#eff6ff',
                                        color: recordType === 'lead' ? '#059669' : '#3b82f6',
                                        fontSize: '0.6rem',
                                        padding: '2px 8px',
                                        borderRadius: '6px',
                                        fontWeight: 800,
                                        border: `1px solid ${recordType === 'lead' ? '#d1fae5' : '#dbeafe'}`
                                    }}>
                                        {recordType.toUpperCase()}
                                    </span>
                                    {contact.lead_classification && (
                                        <span style={{
                                            background: '#fef3c7',
                                            color: '#92400e',
                                            fontSize: '0.6rem',
                                            padding: '2px 8px',
                                            borderRadius: '6px',
                                            fontWeight: 800,
                                            border: '1px solid #fcd34d'
                                        }}>
                                            {contact.lead_classification.toUpperCase()}
                                        </span>
                                    )}
                                    <span style={{
                                        background: `${aiStats.persona.color}15`,
                                        color: aiStats.persona.color,
                                        fontSize: '0.6rem',
                                        padding: '2px 8px',
                                        borderRadius: '6px',
                                        border: `1px solid ${aiStats.persona.color}30`,
                                        fontWeight: 800,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        boxShadow: `0 0 10px ${aiStats.persona.color}10`
                                    }}>
                                        <i className={`fas fa-${aiStats.persona.icon}`} style={{ fontSize: '0.6rem' }}></i> {aiStats.persona.label}
                                    </span>
                                    {contact.intent_tags && contact.intent_tags.map((tag, idx) => (
                                        <span key={idx} style={{
                                            background: '#f1f5f9',
                                            color: '#475569',
                                            fontSize: '0.6rem',
                                            padding: '2px 8px',
                                            borderRadius: '6px',
                                            fontWeight: 700,
                                            border: '1px solid #e2e8f0',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}>
                                            <i className="fas fa-tag" style={{ fontSize: '0.5rem', opacity: 0.5 }}></i> {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><i className="fas fa-user-tie" style={{ fontSize: '0.7rem' }}></i> {contact.owner?.name || contact.owner?.email || renderLookup(contact.ownership) || '-'}</span>
                                <span style={{ color: '#cbd5e1' }}>|</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><i className="fas fa-bullhorn" style={{ fontSize: '0.7rem', color: '#f59e0b' }}></i> {renderLookup(contact.source, 'Direct')}</span>
                                <span style={{ color: '#cbd5e1' }}>|</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><i className="fas fa-history" style={{ fontSize: '0.7rem' }}></i> {contact.activity || '12 Activities'}</span>
                                <span style={{ color: '#cbd5e1' }}>|</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><i className="fas fa-calendar-alt" style={{ fontSize: '0.7rem' }}></i> {contact.addOn || contact.addOnDate || 'Today'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="detail-header-actions" style={{ display: 'flex', gap: '10px' }}>
                    <button
                        onClick={() => {
                            const newStatus = dealStatus === 'active' ? 'lost' : 'active';
                            setDealStatus(newStatus);
                            showNotification(`Deal marked as ${newStatus.toUpperCase()}`);
                        }}
                        style={{
                            background: dealStatus === 'active' ? '#fee2e2' : '#f0fdf4',
                            color: dealStatus === 'active' ? '#ef4444' : '#16a34a',
                            border: `1px solid ${dealStatus === 'active' ? '#fecaca' : '#bbf7d0'}`,
                            padding: '6px 12px',
                            borderRadius: '8px',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <i className={`fas fa-${dealStatus === 'active' ? 'times-circle' : 'check-circle'}`}></i>
                        {dealStatus === 'active' ? 'Mark as Lost' : 'Mark as Active'}
                    </button>
                    <button className="action-btn" title="Run Enrichment" onClick={async () => {
                        try {
                            const res = await enrichmentAPI.runLead(contactId);
                            if (res.success) {
                                showNotification('Intelligence Enrichment Complete!');
                                window.location.reload(); // Simple way to refresh for now
                            }
                        } catch (e) {
                            showNotification('Enrichment failed');
                        }
                    }}><i className="fas fa-magic" style={{ color: '#10b981' }}></i> Enrich</button>
                    <button className="action-btn" title="Call"><i className="fas fa-phone-alt" style={{ color: '#16a34a' }}></i> Call</button>
                    <button className="action-btn" title="WhatsApp"><i className="fab fa-whatsapp" style={{ color: '#25d366' }}></i> WhatsApp</button>
                    <button className="action-btn" title="Email"><i className="fas fa-envelope" style={{ color: '#8b5cf6' }}></i> Email</button>
                    <button className="action-btn" title="Tag"><i className="fas fa-tag"></i> Tags</button>
                    <button className="action-btn" title="Assign"><i className="fas fa-user-plus"></i> Assign</button>
                    <div style={{ position: 'relative' }}>
                        <button className="action-btn" title="More" onClick={() => setShowMoreMenu(!showMoreMenu)}><i className="fas fa-ellipsis-h"></i></button>
                        {showMoreMenu && (
                            <div style={{
                                position: 'absolute',
                                top: '100%',
                                right: 0,
                                marginTop: '8px',
                                background: 'rgba(255, 255, 255, 0.9)',
                                backdropFilter: 'blur(15px)',
                                WebkitBackdropFilter: 'blur(15px)',
                                border: '1px solid rgba(226, 232, 240, 0.8)',
                                borderRadius: '12px',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                                zIndex: 1000,
                                minWidth: '180px',
                                padding: '10px 0',
                                overflow: 'hidden'
                            }}>
                                <button style={{ width: '100%', textAlign: 'left', padding: '10px 20px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => e.target.style.background = 'rgba(241, 245, 249, 0.8)'} onMouseLeave={e => e.target.style.background = 'transparent'} onClick={() => { showNotification('Creating deal...'); setShowMoreMenu(false); }}>Create Deal</button>
                                <button style={{ width: '100%', textAlign: 'left', padding: '10px 20px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => e.target.style.background = 'rgba(241, 245, 249, 0.8)'} onMouseLeave={e => e.target.style.background = 'transparent'} onClick={() => { showNotification('Contact marked dormant.'); setShowMoreMenu(false); }}>Mark Dormant</button>
                                <div style={{ height: '1px', background: '#f1f5f9', margin: '5px 0' }}></div>
                                <button style={{ width: '100%', textAlign: 'left', padding: '10px 20px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#ef4444', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => e.target.style.background = 'rgba(254, 242, 242, 1)'} onMouseLeave={e => e.target.style.background = 'transparent'} onClick={() => { showNotification('Exporting contact data...'); setShowMoreMenu(false); }}>Export Contact</button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* A. LEAD CONTEXT STRIP */}
            <div style={{
                background: 'linear-gradient(90deg, #f8fafc 0%, rgba(255, 255, 255, 0.9) 100%)',
                borderBottom: '1px solid #e2e8f0',
                padding: '8px 2rem',
                display: 'flex',
                alignItems: 'center',
                gap: '20px',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#475569',
                cursor: 'pointer',
                transition: 'all 0.2s',
                overflowX: 'auto',
                whiteSpace: 'nowrap'
            }}
                className="no-scrollbar"
                onClick={() => showNotification("Navigating to full Lead History for #L124...")}
                onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                onMouseLeave={e => e.currentTarget.style.background = 'linear-gradient(90deg, #f8fafc 0%, rgba(255, 255, 255, 0.9) 100%)'}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="fas fa-link" style={{ color: '#6366f1' }}></i>
                    <span style={{ fontWeight: 800, color: '#1e293b' }}>Converted from Lead</span>
                </div>
                <div style={{ width: '1px', height: '14px', background: '#e2e8f0' }}></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#94a3b8' }}>Lead Score:</span>
                    <span style={{ fontWeight: 800, color: aiStats.purchaseIntent.color }}>{contact.conversionMeta?.scoreAtConversion || aiStats.leadScore.total}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#94a3b8' }}>Source:</span>
                    <span style={{ fontWeight: 700 }}>{contact.conversionMeta?.source || renderLookup(contact.source, 'Direct')}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#94a3b8' }}>Converted on:</span>
                    <span style={{ fontWeight: 700 }}>{contact.conversionMeta?.date || 'Today'}</span>
                </div>
                <div style={{ marginLeft: 'auto', color: '#6366f1', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    VIEW LEAD JOURNEY <i className="fas fa-external-link-alt" style={{ fontSize: '0.65rem' }}></i>
                </div>
            </div>

            {/* MAIN CONTENT AREA */}
            <div className="detail-main-content" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* LEFT COLUMN - Primary */}
                <div className="detail-left-col no-scrollbar" style={{ flex: '1.5', overflowY: 'auto', padding: '1.5rem 2rem', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                    {/* 1. Unified Profile 360° Dashboard */}
                    <div className="glass-card" style={{ borderRadius: '16px' }}>
                        <div onClick={() => toggleSection('core')} style={{ padding: '14px 20px', background: 'rgba(248, 250, 252, 0.5)', borderBottom: '1px solid rgba(226, 232, 240, 0.8)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '1px' }}>{recordType === 'lead' ? 'Lead' : 'Contact'} 360° Unified Dashboard</span>
                            <i className={`fas fa-chevron-${expandedSections.includes('core') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#94a3b8' }}></i>
                        </div>
                        {expandedSections.includes('core') && (
                            <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {/* Row 1: Primary Identity & Lead Status */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '32px' }}>
                                    <div>
                                        <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#3b82f6', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <i className="fas fa-id-card"></i> Primary Identity
                                        </h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Phone Details</label>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    {Array.isArray(contact.phones) ? contact.phones.map((p, i) => (
                                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Phone', e.target.innerText)} style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{p.number}</div>
                                                            <span style={{ fontSize: '0.65rem', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>{p.type}</span>
                                                        </div>
                                                    )) : (
                                                        <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Phone', e.target.innerText)} style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{contact.mobile}</div>
                                                    )}
                                                </div>
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Email Details</label>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    {Array.isArray(contact.emails) ? contact.emails.map((e, i) => (
                                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Email', e.target.innerText)} style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{e.address}</div>
                                                            <span style={{ fontSize: '0.65rem', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>{e.type}</span>
                                                        </div>
                                                    )) : (
                                                        <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Email', e.target.innerText)} style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{contact.email || '-'}</div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Social Connect Icons */}
                                            {contact.socialMedia && contact.socialMedia.length > 0 && (
                                                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                                    {contact.socialMedia.filter(soc => soc && soc.url).map((soc, i) => (
                                                        <a key={i} href={String(soc.url).startsWith('http') ? soc.url : `https://${soc.url}`} target="_blank" rel="noopener noreferrer" style={{
                                                            width: '28px', height: '28px', borderRadius: '6px', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', transition: 'all 0.2s'
                                                        }} title={renderLookup(soc.platform)}>
                                                            <i className={`fab fa-${(renderLookup(soc.platform, '')).toLowerCase()}`} style={{ fontSize: '0.9rem' }}></i>
                                                        </a>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#8b5cf6', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <i className="fas fa-users-cog"></i> Family Connect
                                        </h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Father's Name</label>
                                                <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Father Name', e.target.innerText)} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{contact.fatherName || '-'}</div>
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Gender</label>
                                                <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Gender', e.target.innerText)} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{contact.gender || '-'}</div>
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Birth Date</label>
                                                <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Birth Date', e.target.innerText)} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{contact.birthDate || '-'}</div>
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Marital Status</label>
                                                <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Marital Status', e.target.innerText)} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{contact.maritalStatus || '-'}</div>
                                            </div>
                                            <div style={{ gridColumn: 'span 2' }}>
                                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Anniversary Date</label>
                                                <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Anniversary Date', e.target.innerText)} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{contact.anniversaryDate || '-'}</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#10b981', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <i className="fas fa-chart-line"></i> Intelligence
                                        </h4>
                                        <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>Lead Intensity Hub</label>
                                        <div style={{ position: 'relative' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                <div style={{ flex: 1, height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                                                    <div style={{ width: `${Math.min(aiStats.leadScore.total, 100)}%`, height: '100%', background: aiStats.purchaseIntent.color }}></div>
                                                </div>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: aiStats.purchaseIntent.color }}>{aiStats.leadScore.total}</span>
                                                <i className="fas fa-info-circle" style={{ fontSize: '0.75rem', color: '#94a3b8', cursor: 'pointer' }} onMouseEnter={() => setShowScoreBreakdown(true)} onMouseLeave={() => setShowScoreBreakdown(false)}></i>
                                            </div>
                                            {showScoreBreakdown && (
                                                <div style={{
                                                    position: 'absolute',
                                                    bottom: '100%',
                                                    right: 0,
                                                    marginBottom: '8px',
                                                    background: 'rgba(30, 41, 59, 0.95)',
                                                    backdropFilter: 'blur(12px)',
                                                    WebkitBackdropFilter: 'blur(12px)',
                                                    color: '#fff',
                                                    borderRadius: '12px',
                                                    padding: '16px',
                                                    zIndex: 1000,
                                                    minWidth: '240px',
                                                    boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                                                    border: '1px solid rgba(255,255,255,0.1)'
                                                }}>
                                                    <div style={{ fontSize: '0.7rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px' }}>Official Scoring Breakdown</div>
                                                    {[
                                                        { label: 'Requirement (32)', val: aiStats.leadScore.detail.requirement, max: 32 },
                                                        { label: 'Budget Match (10)', val: aiStats.leadScore.detail.budget, max: 10 },
                                                        { label: 'Location Match (10)', val: aiStats.leadScore.detail.location, max: 10 },
                                                        { label: 'Timeline (10)', val: aiStats.leadScore.detail.timeline, max: 10 },
                                                        { label: 'Engagement', val: aiStats.leadScore.activityScore, max: Math.max(aiStats.leadScore.activityScore, 40) }
                                                    ].map((item, idx) => (
                                                        <div key={idx} style={{ marginBottom: '8px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', marginBottom: '3px' }}>
                                                                <span style={{ opacity: 0.8 }}>{item.label}</span>
                                                                <span style={{ color: '#fff', fontWeight: 800 }}>{item.val}</span>
                                                            </div>
                                                            <div style={{ width: '100%', height: '2px', background: 'rgba(255,255,255,0.1)', borderRadius: '1px', overflow: 'hidden' }}>
                                                                <div style={{ width: `${(item.val / item.max) * 100}%`, height: '100%', background: '#3b82f6' }}></div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ height: '1px', background: '#f1f5f9', margin: '4px 0' }}></div>

                                {/* Row 2: Location Intelligence */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div style={{ gridColumn: 'span 2' }}>
                                        <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#f59e0b', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <i className="fas fa-map-marked-alt"></i> Location Portfolio
                                        </h4>
                                    </div>
                                    <div style={{ padding: '12px', background: 'rgba(248, 250, 252, 0.4)', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                                        <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Permanent Address</label>
                                        <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Permanent Address', e.target.innerText)} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', lineHeight: '1.4' }}>
                                            {[
                                                contact.personalAddress?.hNo,
                                                contact.personalAddress?.street,
                                                contact.personalAddress?.area,
                                                renderLookup(contact.personalAddress?.location, ''),
                                                renderLookup(contact.personalAddress?.city, ''),
                                                renderLookup(contact.personalAddress?.state, ''),
                                                contact.personalAddress?.pinCode
                                            ].filter(Boolean).join(', ') || 'No Permanent Address Provided'}
                                        </div>
                                    </div>
                                    <div style={{ padding: '12px', background: 'rgba(248, 250, 252, 0.4)', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                                        <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Correspondence Address</label>
                                        <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Correspondence Address', e.target.innerText)} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', lineHeight: '1.4' }}>
                                            {[
                                                contact.correspondenceAddress?.hNo,
                                                contact.correspondenceAddress?.street,
                                                contact.correspondenceAddress?.area,
                                                renderLookup(contact.correspondenceAddress?.location, ''),
                                                renderLookup(contact.correspondenceAddress?.city, ''),
                                                renderLookup(contact.correspondenceAddress?.state, ''),
                                                contact.correspondenceAddress?.pinCode
                                            ].filter(Boolean).join(', ') || 'No Correspondence Address Provided'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 1.1 Career & Education Portfolio */}
                    <div className="glass-card" style={{ borderRadius: '16px' }}>
                        <div onClick={() => toggleSection('professional')} style={{ padding: '14px 20px', background: 'rgba(248, 250, 252, 0.5)', borderBottom: '1px solid rgba(226, 232, 240, 0.8)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '1px' }}>Career & Education Portfolio</span>
                            <i className={`fas fa-chevron-${expandedSections.includes('professional') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#94a3b8' }}></i>
                        </div>
                        {expandedSections.includes('professional') && (
                            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
                                <div>
                                    <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="fas fa-briefcase"></i> Professional Identity
                                    </h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Company</label>
                                            <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Company', e.target.innerText)} style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{contact.company || '-'}</div>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Branch / Office</label>
                                            <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Branch', e.target.innerText)} style={{ fontSize: '0.9rem', fontWeight: 700, color: '#10b981' }}>{contact.workOffice || 'Main Office'}</div>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Designation</label>
                                            <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Designation', e.target.innerText)} style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{renderLookup(contact.designation)}</div>
                                        </div>
                                        <div style={{ flex: 1, padding: '16px', background: 'rgba(79, 70, 229, 0.02)', borderRadius: '12px', border: '1px solid #eef2f6' }}>
                                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Category</div>
                                            <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Category', e.target.innerText)} style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{renderLookup(contact.professionCategory)}</div>
                                        </div>
                                        <div style={{ flex: 1, padding: '16px', background: 'rgba(79, 70, 229, 0.02)', borderRadius: '12px', border: '1px solid #eef2f6' }}>
                                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Sub-Category</div>
                                            <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Sub-Category', e.target.innerText)} style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{renderLookup(contact.professionSubCategory)}</div>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ height: '1px', background: '#f1f5f9' }}></div>

                                <div>
                                    <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#3b82f6', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="fas fa-user-graduate"></i> Academic Background
                                    </h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
                                        {contact.educations?.map((edu, i) => (
                                            <div key={i} style={{ position: 'relative', paddingLeft: '16px', borderLeft: '2px solid #e2e8f0' }}>
                                                <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Degree', e.target.innerText)} style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a' }}>{renderLookup(edu.degree)}</div>
                                                <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('School', e.target.innerText)} style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>{edu.school || '-'}</div>
                                                <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '2px' }}>{renderLookup(edu.education)}</div>
                                            </div>
                                        )) || <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No education details provided</div>}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>


                    {/* 1.3 Financial Strength */}
                    <div className="glass-card" style={{ borderRadius: '16px' }}>
                        <div onClick={() => toggleSection('financial')} style={{ padding: '14px 20px', background: 'rgba(248, 250, 252, 0.5)', borderBottom: '1px solid rgba(226, 232, 240, 0.8)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '1px' }}>Financial Strength</span>
                            <i className={`fas fa-chevron-${expandedSections.includes('financial') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#94a3b8' }}></i>
                        </div>
                        {expandedSections.includes('financial') && (
                            <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                                <div>
                                    <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#059669', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="fas fa-money-bill-wave"></i> Income Profiles
                                    </h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {contact.incomes?.map((inc, i) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #dcfce7' }}>
                                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#166534' }}>{renderLookup(inc.incomeType)}</span>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 900, color: '#059669' }}>₹{Number(inc.amount || 0).toLocaleString()}</span>
                                            </div>
                                        )) || <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No income details provided</div>}
                                    </div>
                                </div>
                                <div>
                                    <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#ef4444', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="fas fa-hand-holding-usd"></i> Liability / Loans
                                    </h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {contact.loans?.map((loan, i) => (
                                            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '10px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fee2e2' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#991b1b' }}>{renderLookup(loan.loanType)}</span>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 900, color: '#ef4444' }}>₹{Number(loan.loanAmount || 0).toLocaleString()}</span>
                                                </div>
                                                <div style={{ fontSize: '0.65rem', color: '#b91c1c', fontWeight: 600 }}>{renderLookup(loan.bank)}</div>
                                            </div>
                                        )) || <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No loan details provided</div>}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>



                    <div className="glass-card" style={{ borderRadius: '16px' }}>
                        <div onClick={() => toggleSection('pref')} style={{ padding: '14px 20px', background: 'rgba(248, 250, 252, 0.5)', borderBottom: '1px solid rgba(226, 232, 240, 0.8)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '1px' }}>Property Preferences</span>
                            <i className={`fas fa-chevron-${expandedSections.includes('pref') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#94a3b8' }}></i>
                        </div>
                        {expandedSections.includes('pref') && (
                            <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', background: 'transparent' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Preferred Locations</label>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.locations.join(', ')}</div>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Budget Range</label>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.budget} <span style={{ color: '#16a34a', fontSize: '0.75rem' }}>(+{aiStats.preferences.flexibility})</span></div>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Urgency</label>
                                    <span className="pill" style={{ background: '#fee2e2', color: '#991b1b', fontSize: '0.7rem', fontWeight: 800 }}>{aiStats.preferences.urgency.toUpperCase()}</span>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Property Type</label>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.type}</div>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Deal Type</label>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.dealType}</div>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>AI Rejection Note</label>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#ef4444', lineHeight: '1.4' }}>{aiStats.rejectionAlert}</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 2. Unified Activity Composer */}
                    <div className="glass-card" style={{ borderRadius: '16px', position: 'relative' }}>
                        <div style={{ borderBottom: '1px solid rgba(226, 232, 240, 0.8)', display: 'flex', background: 'rgba(248, 250, 252, 0.3)' }}>
                            {[
                                { id: 'email', icon: 'envelope', label: 'Email' },
                                { id: 'whatsapp', icon: 'whatsapp', label: 'WhatsApp', isBrand: true },
                                { id: 'note', icon: 'sticky-note', label: 'Note' },
                                { id: 'call', icon: 'phone-alt', label: 'Call Log' },
                                { id: 'task', icon: 'calendar-check', label: 'Task' },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setComposerTab(tab.id)}
                                    style={{
                                        padding: '14px 20px',
                                        border: 'none',
                                        background: composerTab === tab.id ? 'transparent' : 'transparent',
                                        borderRight: '1px solid rgba(226, 232, 240, 0.5)',
                                        borderBottom: composerTab === tab.id ? '2px solid var(--premium-blue)' : 'none',
                                        color: composerTab === tab.id ? 'var(--premium-blue)' : '#64748b',
                                        fontSize: '0.75rem',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <i className={`${tab.isBrand ? 'fab' : 'fas'} fa-${tab.icon}`}></i>
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                        <div style={{ padding: '20px' }}>
                            {composerTab === 'task' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    {pendingTasks.map((task, index) => (
                                        <div key={task.id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                                    <input
                                                        type="text"
                                                        placeholder="Task subject..."
                                                        value={task.subject}
                                                        onChange={(e) => updateTask(task.id, 'subject', e.target.value)}
                                                        style={{ flex: 1, padding: '8px 0', border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}
                                                    />
                                                    <button onClick={addTask} style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#e0f2fe', color: '#0ea5e9', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                                                        <i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i>
                                                    </button>
                                                </div>
                                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                    <input
                                                        type="datetime-local"
                                                        value={task.dueDate}
                                                        onChange={(e) => updateTask(task.id, 'dueDate', e.target.value)}
                                                        style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.75rem', color: 'var(--premium-blue)', fontWeight: 600, outline: 'none' }}
                                                    />
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, color: task.reminder ? 'var(--premium-blue)' : '#64748b' }}>
                                                        <input type="checkbox" checked={task.reminder} onChange={(e) => updateTask(task.id, 'reminder', e.target.checked)} />
                                                        <i className={`fas fa-bell${task.reminder ? '' : '-slash'}`}></i> Alert
                                                    </label>
                                                </div>
                                            </div>
                                            {pendingTasks.length > 1 && (
                                                <button onClick={() => removeTask(task.id)} style={{ padding: '4px', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem' }}>
                                                    <i className="fas fa-times"></i>
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    <button onClick={addTask} style={{ alignSelf: 'flex-start', background: 'transparent', border: '1px dashed #cbd5e1', padding: '8px 16px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', cursor: 'pointer', transition: 'all 0.2s' }}>
                                        <i className="fas fa-plus" style={{ marginRight: '6px' }}></i> Add Another Task
                                    </button>
                                </div>
                            ) : (
                                <textarea
                                    placeholder={`Enter ${composerTab} details here...`}
                                    value={composerContent}
                                    onChange={(e) => setComposerContent(e.target.value)}
                                    style={{
                                        width: '100%',
                                        minHeight: '120px',
                                        border: '1px solid rgba(226, 232, 240, 0.8)',
                                        background: 'rgba(255, 255, 255, 0.5)',
                                        borderRadius: '12px',
                                        padding: '14px',
                                        fontSize: '0.85rem',
                                        fontWeight: 500,
                                        outline: 'none',
                                        resize: 'none',
                                        fontFamily: 'inherit',
                                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                                    }}
                                ></textarea>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                                <button
                                    onClick={handleSaveActivity}
                                    className="btn-primary"
                                    style={{ padding: '10px 20px', fontSize: '0.75rem', borderRadius: '10px', background: 'var(--premium-blue)' }}
                                >
                                    Save {composerTab === 'task' ? 'Tasks' : (composerTab.charAt(0).toUpperCase() + composerTab.slice(1))}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* 3. Omnichannel Timeline */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e293b' }}>Unified Timeline</h3>
                            <div style={{ position: 'relative' }}>
                                <select
                                    value={timelineFilter}
                                    onChange={(e) => setTimelineFilter(e.target.value)}
                                    style={{
                                        padding: '4px 10px',
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        color: '#3b82f6',
                                        background: 'transparent',
                                        border: '1px solid #dbeafe',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        outline: 'none'
                                    }}
                                >
                                    <option value="all">All Activities</option>
                                    <option value="call">Calls</option>
                                    <option value="whatsapp">WhatsApp</option>
                                    <option value="email">Emails</option>
                                    <option value="ai">AI Summaries</option>
                                </select>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingLeft: '24px', borderLeft: '2px solid #f1f5f9', marginLeft: '12px' }}>
                            {/* Render Categorized Activities */}
                            {['due', 'upcoming', 'completed'].map(cat => (
                                aiStats.leadScore.categorized[cat].length > 0 && (
                                    <div key={cat} style={{ marginBottom: '10px' }}>
                                        <div style={{
                                            fontSize: '0.65rem',
                                            fontWeight: 900,
                                            color: cat === 'due' ? '#ef4444' : cat === 'upcoming' ? 'var(--premium-blue)' : '#10b981',
                                            textTransform: 'uppercase',
                                            marginBottom: '12px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}>
                                            <i className={`fas fa-${cat === 'due' ? 'exclamation-circle' : cat === 'upcoming' ? 'calendar-alt' : 'check-circle'}`}></i>
                                            {cat} Activities
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {aiStats.leadScore.categorized[cat].map((act, idx) => (
                                                <div key={idx} style={{ position: 'relative' }}>
                                                    <div style={{
                                                        position: 'absolute',
                                                        left: '-36px',
                                                        top: '0',
                                                        background: cat === 'due' ? '#ef4444' : cat === 'upcoming' ? 'var(--premium-blue)' : '#10b981',
                                                        color: '#fff',
                                                        width: '24px',
                                                        height: '24px',
                                                        borderRadius: '50%',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '0.7rem',
                                                        border: '3px solid #fff',
                                                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                                    }}>
                                                        <i className={`fas fa-${(act.activityType || act.type).toLowerCase().includes('call') ? 'phone-alt' :
                                                            (act.activityType || act.type).toLowerCase().includes('meeting') ? 'users' :
                                                                (act.activityType || act.type).toLowerCase().includes('task') ? 'tasks' : 'envelope'
                                                            }`}></i>
                                                    </div>
                                                    <div className="glass-card" style={{
                                                        borderRadius: '14px',
                                                        padding: '12px',
                                                        border: `1px solid ${cat === 'due' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(226, 232, 240, 0.8)'}`,
                                                        background: cat === 'due' ? 'rgba(239, 68, 68, 0.02)' : 'rgba(255, 255, 255, 0.5)'
                                                    }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', alignItems: 'center' }}>
                                                            <div style={{ fontWeight: 800, fontSize: '0.8rem', color: '#1e293b' }}>
                                                                {act.subject || act.activityType || act.type.replace(/_/g, ' ')}
                                                            </div>
                                                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700 }}>
                                                                {act.dueDate ? new Date(act.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : act.date}
                                                            </div>
                                                        </div>
                                                        {act.completionResult && (
                                                            <div style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 700, marginTop: '4px' }}>
                                                                Result: {act.completionResult}
                                                            </div>
                                                        )}
                                                        {act.clientFeedback && (
                                                            <div style={{
                                                                fontSize: '0.75rem',
                                                                color: '#475569',
                                                                marginTop: '8px',
                                                                padding: '8px',
                                                                background: '#f8fafc',
                                                                borderRadius: '8px',
                                                                fontStyle: 'italic',
                                                                borderLeft: '3px solid #10b981'
                                                            }}>
                                                                "{act.clientFeedback}"
                                                            </div>
                                                        )}
                                                        {act.notes && (
                                                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '4px' }}>
                                                                {act.notes}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )
                            ))}

                            {/* Legacy Items (if any as fallback) */}
                            {(!aiStats.leadScore.categorized.due.length && !aiStats.leadScore.categorized.upcoming.length && !aiStats.leadScore.categorized.completed.length) && (
                                <div style={{ fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center', padding: '20px' }}>
                                    No activities tracked yet.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 4. Property → Deal Journey Flow */}
                    <div className="glass-card" style={{ borderRadius: '16px' }}>
                        <div onClick={() => toggleSection('journey')} style={{ padding: '14px 20px', background: 'rgba(248, 250, 252, 0.5)', borderBottom: '1px solid rgba(226, 232, 240, 0.8)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '1px' }}>Property → Deal Journey</span>
                            <i className={`fas fa-chevron-${expandedSections.includes('journey') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#94a3b8' }}></i>
                        </div>
                        {expandedSections.includes('journey') && (
                            <div style={{ padding: '24px 20px' }}>
                                <div className="journey-flow-container" style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
                                    <div className="journey-line-horizontal" style={{ position: 'absolute', top: '15px', left: '10px', right: '10px', height: '2px', background: '#f1f5f9', zIndex: 0 }}></div>
                                    <div className="journey-line-vertical" style={{ display: 'none' }}></div>
                                    {aiStats.journeySteps.map((step, idx) => (
                                        <div key={idx} style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                                            <div style={{
                                                width: '32px',
                                                height: '32px',
                                                borderRadius: '50%',
                                                background: step.status === 'completed' ? '#16a34a' : step.status === 'active' ? 'var(--premium-blue)' : '#fff',
                                                border: `2px solid ${step.status === 'completed' ? '#16a34a' : step.status === 'active' ? 'var(--premium-blue)' : '#e2e8f0'}`,
                                                color: step.status === 'completed' ? '#fff' : step.status === 'active' ? '#fff' : '#94a3b8',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '0.75rem',
                                                marginBottom: '8px',
                                                fontWeight: 800,
                                                position: 'relative',
                                                zIndex: 2,
                                                boxShadow: step.status === 'active' ? '0 0 15px rgba(79, 70, 229, 0.4)' : 'none'
                                            }}>
                                                {step.status === 'completed' ? <i className="fas fa-check"></i> : idx + 1}
                                            </div>
                                            <div style={{
                                                fontSize: '0.65rem',
                                                fontWeight: 800,
                                                color: dealStatus === 'lost' && step.status === 'active' ? '#ef4444' : step.status === 'pending' ? '#94a3b8' : '#0f172a',
                                                textAlign: 'center',
                                                textTransform: 'uppercase'
                                            }}>
                                                {dealStatus === 'lost' && step.status === 'active' ? 'DEAL TERMINATED' : step.label}
                                            </div>

                                            {step.status === 'active' && idx === 3 && (
                                                <button style={{ marginTop: '12px', padding: '6px 14px', fontSize: '0.6rem', fontWeight: 900, background: 'var(--premium-blue)', color: '#fff', border: 'none', borderRadius: '6px', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)', cursor: 'pointer' }}>
                                                    CREATE DEAL
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT COLUMN - Secondary */}
                <div className="detail-right-col no-scrollbar" style={{ flex: '1', overflowY: 'auto', background: '#fff', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* 1. AI Closing Probability Timeline */}
                    <div className="glass-card" style={{ borderRadius: '16px', border: '1px solid rgba(79, 70, 229, 0.3)', boxShadow: '0 8px 32px 0 rgba(79, 70, 229, 0.08)' }}>
                        <div onClick={() => toggleSection('probability')} style={{ padding: '14px 20px', background: 'rgba(79, 70, 229, 0.05)', borderBottom: '1px solid rgba(79, 70, 229, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--premium-blue)', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-chart-line"></i> AI Closing Probability
                            </span>
                            <i className={`fas fa-chevron-${expandedSections.includes('probability') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: 'var(--premium-blue)' }}></i>
                        </div>
                        {expandedSections.includes('probability') && (
                            <div style={{ padding: '20px' }}>
                                <div style={{ marginBottom: '24px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
                                        <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--premium-blue)', letterSpacing: '-1px' }}>{aiStats.closingProbability.current}%</div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 800, background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px' }}>{aiStats.closingProbability.history}</div>
                                    </div>
                                    <div style={{ height: '10px', background: '#f1f5f9', borderRadius: '5px', overflow: 'hidden', display: 'flex', border: '1px solid rgba(0,0,0,0.03)' }}>
                                        <div style={{ width: `${aiStats.closingProbability.current}%`, background: 'linear-gradient(90deg, #4f46e5, #818cf8)', transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)' }}></div>
                                    </div>
                                </div>
                                <div style={{ position: 'relative', paddingLeft: '24px' }}>
                                    <div style={{ position: 'absolute', left: '4px', top: '5px', bottom: '5px', width: '2px', background: 'linear-gradient(to bottom, #4f46e5, #cbd5e1)' }}></div>
                                    {aiStats.closingProbability.stages.map((st, i) => (
                                        <div key={i} style={{ position: 'relative', marginBottom: '16px' }}>
                                            <div style={{
                                                position: 'absolute',
                                                left: '-24px',
                                                top: '4px',
                                                width: '10px',
                                                height: '10px',
                                                borderRadius: '50%',
                                                background: dealStatus === 'lost' && st.status === 'active' ? '#ef4444' : st.status === 'completed' ? 'var(--premium-blue)' : st.status === 'active' ? '#ef4444' : '#e2e8f0',
                                                boxShadow: st.status === 'active' ? `0 0 10px ${dealStatus === 'lost' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.4)'}` : 'none',
                                                zIndex: 2
                                            }}></div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.8rem', fontWeight: st.status === 'active' ? 900 : 700, color: st.status === 'pending' ? '#94a3b8' : '#0f172a' }}>{st.label}</span>
                                                <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800 }}>{st.prob}%</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ background: 'linear-gradient(135deg, #eff6ff, #f0f9ff)', padding: '12px', borderRadius: '12px', border: '1px solid #dbeafe', fontSize: '0.75rem', color: '#1e40af', fontWeight: 700, marginTop: '10px', display: 'flex', gap: '8px' }}>
                                    <i className="fas fa-lightbulb" style={{ marginTop: '2px' }}></i>
                                    <span>{aiStats.closingProbability.insight}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* AI Deal Loss Analysis Module - Visible only when deal is lost */}
                    {dealStatus === 'lost' && (
                        <div className="glass-card" style={{
                            borderRadius: '16px',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            boxShadow: '0 8px 32px 0 rgba(239, 68, 68, 0.08)',
                            overflow: 'visible',
                            marginBottom: '1.5rem'
                        }}>
                            <div style={{
                                padding: '14px 20px',
                                background: 'rgba(239, 68, 68, 0.05)',
                                borderBottom: '1px solid rgba(239, 68, 68, 0.1)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                borderRadius: '16px 16px 0 0'
                            }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <i className="fas fa-exclamation-triangle"></i> AI Deal Loss Analysis
                                </span>
                                <span style={{ background: '#ef4444', color: '#fff', fontSize: '0.65rem', fontWeight: 900, padding: '2px 8px', borderRadius: '4px' }}>LOST</span>
                            </div>

                            <div style={{ padding: '20px' }}>
                                {/* AI Loss Summary */}
                                <div style={{ marginBottom: '20px' }}>
                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>AI Loss Summary</div>
                                    <div style={{
                                        padding: '12px',
                                        background: '#f8fafc',
                                        borderRadius: '12px',
                                        fontSize: '0.85rem',
                                        lineHeight: '1.5',
                                        color: '#334155',
                                        border: '1px solid #f1f5f9'
                                    }}>
                                        {aiStats.lossAnalysis.summary}
                                    </div>
                                </div>

                                {/* Primary Reasons with Manual Override */}
                                <div style={{ marginBottom: '20px' }}>
                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Primary Reasons</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                        {aiStats.lossAnalysis.primaryReasons.map((reason, i) => (
                                            <div key={i} style={{
                                                padding: '8px 12px',
                                                background: '#fff',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '10px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                                position: 'relative'
                                            }}>
                                                <i className={`fas fa-${reason.icon}`} style={{ color: reason.type === 'auto' ? '#8b5cf6' : '#f59e0b', fontSize: '0.8rem' }}></i>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f172a' }}>{reason.label}</span>
                                                <span style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 600 }}>{reason.confidence}%</span>
                                                <button
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        padding: '2px',
                                                        cursor: 'pointer',
                                                        color: '#94a3b8',
                                                        fontSize: '0.7rem'
                                                    }}
                                                    title="Override Reason"
                                                    onClick={() => showNotification('Edit Loss Reason modal opened.')}
                                                >
                                                    <i className="fas fa-edit"></i>
                                                </button>
                                            </div>
                                        ))}
                                        <button
                                            style={{
                                                padding: '8px 12px',
                                                background: 'none',
                                                border: '1px dashed #cbd5e1',
                                                borderRadius: '10px',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                color: '#64748b',
                                                cursor: 'pointer'
                                            }}
                                            onClick={() => showNotification('Add New Reason tool selected.')}
                                        >
                                            + Add Reason
                                        </button>
                                    </div>
                                </div>

                                {/* Contributing Factors */}
                                <div style={{ marginBottom: '20px' }}>
                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Contributing Factors</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {aiStats.lossAnalysis.contributingFactors.map((factor, i) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                                                <span style={{ fontSize: '0.75rem', color: '#334155', fontWeight: 600 }}>{factor.label}</span>
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    fontWeight: 800,
                                                    color: factor.impact === 'High' ? '#ef4444' : factor.impact === 'Medium' ? '#f59e0b' : '#3b82f6',
                                                    background: factor.impact === 'High' ? '#fef2f2' : factor.impact === 'Medium' ? '#fffbeb' : '#eff6ff',
                                                    padding: '2px 8px',
                                                    borderRadius: '4px'
                                                }}>{factor.impact} Impact</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Re-engagement & Recovery */}
                                <div style={{ marginBottom: '20px' }}>
                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>AI Recovery Path</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {aiStats.lossAnalysis.recoveryOptions.map((opt, i) => (
                                            <div key={i} style={{
                                                background: 'linear-gradient(135deg, #f0fdf4 0%, #fff 100%)',
                                                padding: '12px',
                                                borderRadius: '12px',
                                                border: '1px solid #dcfce7',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px'
                                            }}>
                                                <div style={{
                                                    width: '32px',
                                                    height: '32px',
                                                    borderRadius: '8px',
                                                    background: '#fff',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    boxShadow: '0 2px 8px rgba(22, 163, 74, 0.08)'
                                                }}>
                                                    <i className={`fas fa-${opt.icon}`} style={{ color: '#16a34a', fontSize: '0.8rem' }}></i>
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#065f46' }}>{opt.label}</div>
                                                    <div style={{ fontSize: '0.6rem', color: '#166534', opacity: 0.8 }}>{opt.description}</div>
                                                </div>
                                                <button
                                                    style={{
                                                        background: '#16a34a',
                                                        color: '#fff',
                                                        border: 'none',
                                                        padding: '4px 10px',
                                                        borderRadius: '6px',
                                                        fontSize: '0.6rem',
                                                        fontWeight: 900,
                                                        cursor: 'pointer'
                                                    }}
                                                    onClick={() => showNotification(`Executing: ${opt.label}`)}
                                                >
                                                    RUN
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* What could have saved this deal? */}
                                <div style={{ marginBottom: '20px', padding: '14px', background: 'rgba(79, 70, 229, 0.03)', borderRadius: '12px', border: '1px solid rgba(79, 70, 229, 0.1)' }}>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--premium-blue)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <i className="fas fa-lightbulb"></i> AI Retrospective
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {aiStats.lossAnalysis.couldHaveSaved.map((item, i) => (
                                            <div key={i}>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1e293b' }}>{item.label}</div>
                                                <div style={{ fontSize: '0.6rem', color: '#64748b' }}>{item.description}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Feedback Loop */}
                                <div style={{
                                    paddingTop: '16px',
                                    borderTop: '1px solid #f1f5f9',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>Was this analysis accurate?</span>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '0.7rem' }}
                                            onClick={() => showNotification('Feedback recorded: Helpful!')}
                                        >
                                            <i className="far fa-thumbs-up" style={{ color: '#16a34a' }}></i>
                                        </button>
                                        <button
                                            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '0.7rem' }}
                                            onClick={() => showNotification('Feedback recorded: Improvement flagged.')}
                                        >
                                            <i className="far fa-thumbs-down" style={{ color: '#ef4444' }}></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 2. AI Intelligence Panel */}
                    <div className="glass-card" style={{ borderRadius: '16px' }}>
                        <div onClick={() => toggleSection('ai')} style={{ padding: '14px 20px', background: 'rgba(248, 250, 252, 0.5)', borderBottom: '1px solid rgba(226, 232, 240, 0.8)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-microchip" style={{ color: '#8b5cf6' }}></i> AI Intelligence
                            </span>
                            <i className={`fas fa-chevron-${expandedSections.includes('ai') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#94a3b8' }}></i>
                        </div>
                        {expandedSections.includes('ai') && (
                            <div style={{ padding: '20px' }}>
                                <div style={{ marginBottom: '20px' }}>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px' }}>Lead Intelligence Continuity</div>
                                    <div style={{ background: 'rgba(79, 70, 229, 0.05)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(79, 70, 229, 0.1)' }}>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--premium-blue)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <i className="fas fa-brain"></i> Intent High due to:
                                        </div>
                                        <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.75rem', color: '#475569', lineHeight: '1.6', fontWeight: 600 }}>
                                            <li>Converted Lead with Score <span style={{ color: aiStats.purchaseIntent.color, fontWeight: 800 }}>{aiStats.leadScore.total}</span></li>
                                            <li><span style={{ fontWeight: 800, color: '#0f172a' }}>{aiStats.leadScore.detail.match * 0.7 + 5 | 0} property matches</span> identified during lead stage</li>
                                            <li><span style={{ fontWeight: 800, color: '#0f172a' }}>{(aiStats.leadScore.detail.engagement / 10).toFixed(0)} recent calls</span> (avg duration 4m 12s)</li>
                                        </ul>
                                        <div style={{ marginTop: '12px', fontSize: '0.7rem', color: '#64748b', fontStyle: 'italic', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '10px', lineHeight: '1.4' }}>
                                            <i className="fas fa-exclamation-triangle" style={{ marginRight: '6px', color: '#f59e0b' }}></i>
                                            AI Learning: Deals from <span style={{ fontWeight: 800 }}>{renderLookup(contact.source)}</span> leads with score <span style={{ color: '#ef4444' }}>&lt;{aiStats.leadScore.total < 60 ? aiStats.leadScore.total : 60}</span> have <span style={{ color: '#ef4444', fontWeight: 800 }}>28% higher</span> loss risk.
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                                    {/* Card 1: Purchase Intent */}
                                    <div style={{ background: '#fff', padding: '14px', borderRadius: '12px', border: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                        <div>
                                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Purchase Intent</div>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: aiStats.purchaseIntent.color, display: 'flex', alignItems: 'center', gap: '8px' }}>{aiStats.purchaseIntent.level} {aiStats.purchaseIntent.emoji}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 800 }}>Confidence</div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 900, color: '#0f172a' }}>{aiStats.purchaseIntent.confidence}</div>
                                        </div>
                                    </div>

                                    {/* NEW Card: Deal Probability */}
                                    <div style={{ background: 'rgba(79, 70, 229, 0.03)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(79, 70, 229, 0.1)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                            <div>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--premium-blue)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Deal Probability</div>
                                                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--premium-blue)' }}>{aiStats.dealProbability.score}% <i className={`fas fa-arrow-${aiStats.dealProbability.trend}`} style={{ fontSize: '0.8rem' }}></i></div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ background: 'var(--premium-blue)', color: '#fff', fontSize: '0.55rem', padding: '2px 8px', borderRadius: '4px', fontWeight: 900 }}>AI OPTIMIZED</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                            {aiStats.dealProbability.factors.map((f, i) => (
                                                <span key={i} style={{ fontSize: '0.65rem', background: '#fff', padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(79, 70, 229, 0.1)', color: '#4b5563', fontWeight: 600 }}>{f}</span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Card 2: Risk Level */}
                                    <div style={{ background: '#fff', padding: '14px', borderRadius: '12px', border: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                        <div>
                                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Risk Level</div>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: aiStats.riskLevel.color }}>{aiStats.riskLevel.status}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 800 }}>Market Signal</div>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>{aiStats.riskLevel.reason}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Next Best Action */}
                                <div style={{ background: 'linear-gradient(135deg, #4f46e5, #4338ca)', borderRadius: '16px', padding: '20px', color: '#fff', boxShadow: '0 10px 20px rgba(79, 70, 229, 0.3)' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 900, color: 'rgba(255,255,255,0.7)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                        <i className="fas fa-bolt"></i> Agent Playbook
                                    </div>
                                    <div style={{ fontSize: '1rem', color: '#fff', lineHeight: '1.4', fontWeight: 800, marginBottom: '20px' }}>
                                        Send PPT and schedule site visit for Sector 17
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <button style={{ flex: 1, padding: '10px', fontSize: '0.75rem', fontWeight: 900, background: '#fff', color: 'var(--premium-blue)', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Create Task</button>
                                        <button style={{ flex: 1, padding: '10px', fontSize: '0.75rem', fontWeight: 900, background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', backdropFilter: 'blur(4px)' }}>WhatsApp</button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Property Icon Helper */}
                    {(() => {
                        const getPropIcon = (type) => {
                            const t = type?.toLowerCase() || '';
                            if (t.includes('plot')) return 'fa-map-location-dot';
                            if (t.includes('shop') || t.includes('showroom') || t.includes('sco')) return 'fa-store';
                            if (t.includes('house') || t.includes('apartment')) return 'fa-home';
                            if (t.includes('school') || t.includes('institutional')) return 'fa-university';
                            return 'fa-building';
                        };
                        window._getPropIcon = getPropIcon; // Temporary exposure or just use in scope
                        return null;
                    })()}

                    {/* 0. Owned Properties Section (Smart Match) */}
                    <div className="glass-card" style={{ borderRadius: '16px', border: '1px solid rgba(16, 185, 129, 0.3)', boxShadow: '0 8px 32px 0 rgba(16, 185, 129, 0.08)' }}>
                        <div onClick={() => toggleSection('ownership')} style={{ padding: '14px 20px', background: 'rgba(16, 185, 129, 0.05)', borderBottom: '1px solid rgba(16, 185, 129, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#059669', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-key"></i> Owned Properties
                            </span>
                            <i className={`fas fa-chevron-${expandedSections.includes('ownership') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#059669' }}></i>
                        </div>
                        {expandedSections.includes('ownership') && (
                            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {aiStats.leadScore.ownedProperties.length > 0 ? (
                                    aiStats.leadScore.ownedProperties.map((prop, idx) => (
                                        <div key={idx} style={{
                                            padding: '10px 14px',
                                            border: '1px solid #f1f5f9',
                                            borderRadius: '12px',
                                            background: prop.matchType === 'Previous Owner' ? '#f8fafc' : '#fff',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                                            position: 'relative',
                                            opacity: prop.matchType === 'Previous Owner' ? 0.8 : 1
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                                <div style={{
                                                    width: '40px', height: '40px',
                                                    background: prop.matchType === 'Previous Owner' ? '#f1f5f9' : '#f0fdf4',
                                                    border: `1px solid ${prop.matchType === 'Previous Owner' ? '#e2e8f0' : '#dcfce7'}`,
                                                    borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                                }}>
                                                    <i className={`fas ${(() => {
                                                        const t = prop.type?.toLowerCase() || '';
                                                        if (t.includes('plot')) return 'fa-map-location-dot';
                                                        if (t.includes('shop') || t.includes('showroom') || t.includes('sco')) return 'fa-store';
                                                        if (t.includes('house') || t.includes('apartment')) return 'fa-home';
                                                        if (t.includes('school') || t.includes('institutional')) return 'fa-university';
                                                        return 'fa-building';
                                                    })()}`} style={{ color: prop.matchType === 'Previous Owner' ? '#94a3b8' : '#10b981', fontSize: '1rem' }}></i>
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                                                        <div>
                                                            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a' }}>
                                                                {(prop.unitNumber || prop.unitNo) && `Unit #${prop.unitNumber || prop.unitNo} • `}{prop.type}
                                                            </div>
                                                            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>{prop.location || prop.area}</div>
                                                        </div>
                                                        <span style={{
                                                            background: prop.matchType === 'Confirmed Owner' ? '#ecfdf5' :
                                                                prop.matchType === 'Previous Owner' ? '#f1f5f9' : '#fff7ed',
                                                            color: prop.matchType === 'Confirmed Owner' ? '#059669' :
                                                                prop.matchType === 'Previous Owner' ? '#64748b' : '#c2410c',
                                                            fontSize: '0.5rem',
                                                            padding: '2px 6px',
                                                            borderRadius: '4px',
                                                            fontWeight: 900,
                                                            border: `1px solid ${prop.matchType === 'Confirmed Owner' ? '#d1fae5' :
                                                                prop.matchType === 'Previous Owner' ? '#e2e8f0' : '#ffedd5'}`,
                                                            textTransform: 'uppercase',
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            {prop.matchType}
                                                        </span>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
                                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700 }}>{prop.size}</span>
                                                            <span style={{ width: '3px', height: '3px', background: '#e2e8f0', borderRadius: '50%' }}></span>
                                                            <span style={{ fontSize: '0.65rem', color: prop.status === 'Active' ? '#10b981' : '#ef4444', fontWeight: 800 }}>{prop.status}</span>
                                                        </div>
                                                        {prop.matchType !== 'Previous Owner' && (
                                                            <button className="btn-outline" style={{ padding: '4px 10px', fontSize: '0.6rem', borderRadius: '6px' }}>View Record</button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', padding: '10px' }}>No owned properties found.</div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* 3. Documents Section */}
                    <div className="glass-card" style={{ borderRadius: '16px', border: '1px solid rgba(79, 70, 229, 0.2)', boxShadow: '0 8px 32px 0 rgba(79, 70, 229, 0.05)' }}>
                        <div onClick={() => toggleSection('documents')} style={{ padding: '14px 20px', background: 'rgba(79, 70, 229, 0.05)', borderBottom: '1px solid rgba(79, 70, 229, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-file-invoice"></i> Documents & Attachments
                            </span>
                            <i className={`fas fa-chevron-${expandedSections.includes('documents') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#4f46e5' }}></i>
                        </div>
                        {expandedSections.includes('documents') && (
                            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {contact.documents && contact.documents.length > 0 ? (
                                    contact.documents.map((doc, idx) => (
                                        <div key={idx} style={{
                                            padding: '12px 15px',
                                            border: '1px solid #f1f5f9',
                                            borderRadius: '12px',
                                            background: '#fff',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '14px',
                                            transition: 'all 0.2s'
                                        }} onMouseEnter={(e) => e.currentTarget.style.borderColor = '#4f46e5'} onMouseLeave={(e) => e.currentTarget.style.borderColor = '#f1f5f9'}>
                                            <div style={{
                                                width: '40px', height: '40px',
                                                background: '#f5f3ff',
                                                border: '1px solid #ddd6fe',
                                                borderRadius: '10px',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                flexShrink: 0
                                            }}>
                                                <i className={`fas ${doc.documentPicture?.name?.endsWith('.pdf') ? 'fa-file-pdf' : 'fa-file-image'}`} style={{ color: '#7c3aed', fontSize: '1.1rem' }}></i>
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a', marginBottom: '2px' }}>{renderLookup(doc.documentName)}</div>
                                                <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>ID: {doc.documentNo}</div>
                                            </div>
                                            <button className="btn-outline" style={{ padding: '6px 12px', fontSize: '0.65rem', borderRadius: '8px', background: '#fff' }}>
                                                View
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '10px' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>No documents uploaded yet.</div>
                                        <button className="btn-outline" style={{ padding: '4px 10px', fontSize: '0.6rem', borderRadius: '6px' }}>Upload Now</button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="glass-card" style={{ borderRadius: '16px' }}>
                        <div onClick={() => toggleSection('properties')} style={{ padding: '14px 20px', background: 'rgba(248, 250, 252, 0.5)', borderBottom: '1px solid rgba(226, 232, 240, 0.8)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '1px' }}>Matching Properties</span>
                            <i className={`fas fa-chevron-${expandedSections.includes('properties') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#94a3b8' }}></i>
                        </div>
                        {expandedSections.includes('properties') && (
                            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {[
                                    { name: 'Sector 17, Kurukshetra', match: '95', price: '₹1.2 Cr', reason: 'Exact budget + Prefered Sector', confidence: 'High' },
                                    { name: 'Bharat Nagar, Kurukshetra', match: '82', price: '₹95 L', reason: 'Great ROI + Near Metro', confidence: 'Medium' }
                                ].map((prop, idx) => (
                                    <div key={idx} style={{ padding: '16px', border: '1px solid #f1f5f9', borderRadius: '12px', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
                                            <div style={{ width: '44px', height: '44px', background: '#f8fafc', border: '1px solid #eef2f6', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <i className="fas fa-building" style={{ color: 'var(--premium-blue)', fontSize: '1.2rem' }}></i>
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{prop.name}</div>
                                                    <span style={{ background: prop.confidence === 'High' ? '#ecfdf5' : '#fffbeb', color: prop.confidence === 'High' ? '#059669' : '#b45309', fontSize: '0.6rem', padding: '2px 8px', borderRadius: '6px', fontWeight: 800, border: `1px solid ${prop.confidence === 'High' ? '#d1fae5' : '#fef3c7'}` }}>{prop.confidence} CONF.</span>
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>{prop.price} • <span style={{ color: '#059669' }}>{prop.match}% Match</span></div>
                                            </div>
                                        </div>

                                        <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', marginBottom: '14px', border: '1px solid #f1f5f9' }}>
                                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>{aiStats.persona.type === 'Investor' ? 'Investment Analysis' : 'Living Score'}</div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                {aiStats.persona.metrics.map((m, i) => (
                                                    <div key={i}>
                                                        <div style={{ fontSize: '0.85rem', fontWeight: 900, color: '#1e293b' }}>{m.value}</div>
                                                        <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 700 }}>{m.label}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button className="btn-outline" style={{ flex: 1, padding: '10px', fontSize: '0.7rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#fff', borderRadius: '8px' }}>
                                                <i className="fab fa-whatsapp" style={{ color: '#25d366' }}></i> Share
                                            </button>
                                            <div style={{ flex: 1.5, position: 'relative' }}>
                                                <button
                                                    className="btn-primary"
                                                    style={{ width: '100%', padding: '10px', fontSize: '0.7rem', fontWeight: 800, background: 'var(--premium-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderRadius: '8px' }}
                                                    onClick={(e) => {
                                                        const el = e.currentTarget.nextElementSibling;
                                                        el.style.display = el.style.display === 'none' ? 'block' : 'none';
                                                    }}
                                                >
                                                    <i className="fas fa-wand-sparkles"></i> AI Price Check
                                                </button>
                                                <div style={{
                                                    display: 'none',
                                                    position: 'absolute',
                                                    bottom: '100%',
                                                    right: 0,
                                                    width: '260px',
                                                    background: '#1e293b',
                                                    color: '#fff',
                                                    borderRadius: '12px',
                                                    padding: '16px',
                                                    marginBottom: '12px',
                                                    zIndex: 1000,
                                                    boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
                                                    border: '1px solid rgba(255,255,255,0.1)'
                                                }}>
                                                    <div style={{ fontSize: '0.7rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>AI Valuation Insight</div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                                        <div>
                                                            <div style={{ fontSize: '0.6rem', color: '#94a3b8', marginBottom: '2px' }}>List Price</div>
                                                            <div style={{ fontSize: '0.9rem', fontWeight: 900 }}>{aiStats.priceInsight.listed}</div>
                                                        </div>
                                                        <div style={{ textAlign: 'right' }}>
                                                            <div style={{ fontSize: '0.6rem', color: '#4ade80', marginBottom: '2px' }}>Suggested Max</div>
                                                            <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#4ade80' }}>{aiStats.priceInsight.suggested.split('–')[1]}</div>
                                                        </div>
                                                    </div>
                                                    <div style={{ padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: '16px' }}>
                                                        {aiStats.priceInsight.reasons.map((r, i) => (
                                                            <div key={i} style={{ fontSize: '0.65rem', marginBottom: '6px', color: '#cbd5e1', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                                                <i className="fas fa-check-circle" style={{ color: '#4ade80', marginTop: '2px' }}></i> {r}
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <button style={{ width: '100%', padding: '10px', fontSize: '0.7rem', background: 'var(--premium-blue)', border: 'none', color: '#fff', borderRadius: '8px', fontWeight: 900, cursor: 'pointer' }}>Apply Suggested Offer</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 3. Property Heatmap (Analytics) */}
                    <div className="glass-card" style={{ borderRadius: '16px' }}>
                        <div onClick={() => toggleSection('heatmap')} style={{ padding: '14px 20px', background: 'rgba(248, 250, 252, 0.5)', borderBottom: '1px solid rgba(226, 232, 240, 0.8)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '1px' }}>Discovery Analytics</span>
                            <i className={`fas fa-chevron-${expandedSections.includes('heatmap') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#94a3b8' }}></i>
                        </div>
                        {expandedSections.includes('heatmap') && (
                            <div style={{ padding: '20px' }}>
                                <div style={{ marginBottom: '24px' }}>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px' }}>Sectorwise Interest</div>
                                    <div style={{ display: 'flex', gap: '4px', height: '14px', background: '#f1f5f9', borderRadius: '7px', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.03)' }}>
                                        <div style={{ width: '60%', background: 'var(--premium-blue)', borderRadius: '7px 0 0 7px' }} title="Sector 17: 60%"></div>
                                        <div style={{ width: '25%', background: '#818cf8' }} title="Sector 24: 25%"></div>
                                        <div style={{ width: '15%', background: '#c7d2fe' }} title="Others: 15%"></div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.7rem', fontWeight: 800 }}>
                                        <span style={{ color: 'var(--premium-blue)' }}>Sector 17 (60%)</span>
                                        <span style={{ color: '#64748b' }}>Sector 24 (25%)</span>
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px' }}>Budget vs Location Fit</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                                    {[0.1, 0.4, 0.9, 0.2, 0.3, 0.8, 0.4, 0.1, 0.2, 0.3, 0.1, 0.0].map((v, i) => (
                                        <div key={i} style={{ aspectRatio: '1.5', background: v > 0.5 ? `rgba(79, 70, 229, ${v})` : '#f8fafc', borderRadius: '6px', border: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {v > 0.7 && <i className="fas fa-fire-alt" style={{ color: '#fff', fontSize: '0.6rem' }}></i>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 4. Owner Negotiation Intelligence */}
                    <div style={{ background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <div onClick={() => toggleSection('negotiation')} style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                <i className="fas fa-handshake" style={{ color: '#3b82f6', marginRight: '8px' }}></i> Negotiation Intelligence
                            </span>
                            <i className={`fas fa-chevron-${expandedSections.includes('negotiation') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#94a3b8' }}></i>
                        </div>
                        {expandedSections.includes('negotiation') && (
                            <div style={{ padding: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <div>
                                        <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>Owner Type</div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a' }}>{aiStats.ownerIntelligence.type}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>Urgency</div>
                                        <div className="pill" style={{ background: '#dcfce7', color: '#166534', fontSize: '0.65rem' }}>{aiStats.ownerIntelligence.urgency.toUpperCase()}</div>
                                    </div>
                                </div>
                                <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '10px', marginBottom: '12px' }}>
                                    <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, marginBottom: '4px' }}>Expert Tip:</div>
                                    <div style={{ fontSize: '0.75rem', color: '#1e293b', fontWeight: 700, lineHeight: '1.4' }}>
                                        "{aiStats.ownerIntelligence.tip}"
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                                        <span style={{ color: '#64748b' }}>Flexibility</span>
                                        <span style={{ color: '#3b82f6', fontWeight: 800 }}>{aiStats.ownerIntelligence.scope}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                                        <span style={{ color: '#64748b' }}>Best Leverage</span>
                                        <span style={{ color: '#0f172a', fontWeight: 800 }}>{aiStats.ownerIntelligence.leverage}</span>
                                    </div>
                                    <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', padding: '6px 10px', borderRadius: '6px', fontSize: '0.65rem', color: '#991b1b', fontWeight: 600 }}>
                                        <i className="fas fa-exclamation-triangle" style={{ marginRight: '6px' }}></i> {aiStats.ownerIntelligence.firmness}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 5. Inventory Context Panel */}
                    <div style={{ background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <h4 style={{ fontSize: '0.75rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-warehouse" style={{ color: '#3b82f6' }}></i> Inventory Context
                            </h4>
                            <div
                                onClick={() => toggleSection('commission')}
                                style={{
                                    fontSize: '0.65rem',
                                    fontWeight: 800,
                                    color: 'var(--premium-blue)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: 'rgba(79, 70, 229, 0.05)',
                                    padding: '4px 10px',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(79, 70, 229, 0.1)',
                                    transition: 'all 0.2s',
                                    position: 'relative'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(79, 70, 229, 0.1)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(79, 70, 229, 0.05)'}
                            >
                                <i className="fas fa-coins"></i> COMM. INTEL
                                {expandedSections.includes('commission') && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '100%',
                                        right: 0,
                                        marginTop: '10px',
                                        background: 'rgba(30, 41, 59, 0.95)',
                                        backdropFilter: 'blur(12px)',
                                        WebkitBackdropFilter: 'blur(12px)',
                                        color: '#fff',
                                        borderRadius: '14px',
                                        padding: '18px',
                                        zIndex: 1000,
                                        minWidth: '260px',
                                        boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        cursor: 'default'
                                    }} onClick={(e) => e.stopPropagation()}>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>Commission Intelligence</div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                                            <div>
                                                <div style={{ fontSize: '0.6rem', color: '#94a3b8', marginBottom: '4px' }}>Deal Value</div>
                                                <div style={{ fontSize: '1rem', fontWeight: 900, color: '#fff' }}>{aiStats.commission.value}</div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '0.6rem', color: '#4ade80', marginBottom: '4px' }}>Exp. Comm ({aiStats.commission.type})</div>
                                                <div style={{ fontSize: '1rem', fontWeight: 900, color: '#4ade80' }}>{aiStats.commission.total}</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                            {aiStats.commission.splits.map((s, i) => (
                                                <div key={i}>
                                                    <div style={{ fontSize: '0.6rem', color: '#94a3b8', marginBottom: '4px' }}>{s.label}</div>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>{s.value}</div>
                                                </div>
                                            ))}
                                        </div>
                                        <div style={{ background: 'rgba(74, 222, 128, 0.15)', padding: '10px', borderRadius: '8px', fontSize: '0.65rem', color: '#4ade80', marginTop: '10px', border: '1px solid rgba(74, 222, 128, 0.2)', display: 'flex', gap: '8px' }}>
                                            <i className="fas fa-gift" style={{ marginTop: '2px' }}></i> <span>{aiStats.commission.bonus}</span>
                                        </div>
                                        <div style={{ marginTop: '12px' }}>
                                            {aiStats.commission.risks.map((r, i) => (
                                                <div key={i} style={{ fontSize: '0.65rem', color: '#fca5a5', marginBottom: '5px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                                    <i className="fas fa-exclamation-circle" style={{ marginTop: '2px' }}></i> {r}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                    <span style={{ color: '#64748b', fontWeight: 600 }}>Unit # / Block</span>
                                    <span style={{ color: '#0f172a', fontWeight: 800 }}>{aiStats.propertyContext.unitNumber} • {aiStats.propertyContext.block}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                    <span style={{ color: '#64748b', fontWeight: 600 }}>Corner Status</span>
                                    <span style={{ color: '#0f172a', fontWeight: 800 }}>{aiStats.propertyContext.corner}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                    <span style={{ color: '#64748b', fontWeight: 600 }}>Facing</span>
                                    <span style={{ color: '#0f172a', fontWeight: 800 }}>{aiStats.propertyContext.facing}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                    <span style={{ color: '#64748b', fontWeight: 600 }}>Road Width</span>
                                    <span style={{ color: '#3b82f6', fontWeight: 800 }}>{aiStats.propertyContext.roadWidth}</span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                    <span style={{ color: '#64748b', fontWeight: 600 }}>Freshness</span>
                                    <span style={{ color: '#16a34a', fontWeight: 800 }}>Listed 2d ago</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                    <span style={{ color: '#64748b', fontWeight: 600 }}>Owner Type</span>
                                    <span style={{ color: '#0f172a', fontWeight: 800 }}>Direct Party</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                    <span style={{ color: '#64748b', fontWeight: 600 }}>Verification</span>
                                    <span style={{ color: '#16a34a', fontWeight: 800 }}><i className="fas fa-check-double" style={{ marginRight: '4px' }}></i> {aiStats.propertyContext.verification}</span>
                                </div>
                                <div style={{ padding: '8px', background: '#fff', borderRadius: '6px', border: '1px solid #eef2f6', fontSize: '0.7rem', color: '#64748b', fontStyle: 'italic' }}>
                                    "3 similar deals closed in Sector 17 last month."
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 5. Engagement Heatmap & Graph */}
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <div onClick={() => toggleSection('engagement')} style={{ padding: '12px 16px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Interaction Intensity</span>
                            <i className={`fas fa-chevron-${expandedSections.includes('engagement') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#94a3b8' }}></i>
                        </div>
                        {expandedSections.includes('engagement') && (
                            <div style={{ padding: '16px' }}>
                                <div style={{ height: '60px', display: 'flex', alignItems: 'flex-end', gap: '6px', marginBottom: '12px' }}>
                                    {[40, 70, 30, 90, 80, 50, 60].map((h, i) => (
                                        <div key={i} style={{ flex: 1, height: `${h}%`, background: '#3b82f6', borderRadius: '3px 3px 0 0' }}></div>
                                    ))}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                                    {Array.from({ length: 28 }).map((_, i) => (
                                        <div key={i} style={{ aspectRatio: '1', background: i % 5 === 0 ? '#16a34a' : '#f1f5f9', borderRadius: '2px' }}></div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 4. Deals & Revenue */}
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px' }}>
                        <h4 style={{ fontSize: '0.75rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', marginBottom: '10px' }}>Active Deals</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {aiStats.leadScore.ownedProperties.filter(p => p.status === 'Active').length > 0 ? (
                                aiStats.leadScore.ownedProperties.filter(p => p.status === 'Active').map((deal, idx) => (
                                    <div key={idx} style={{ background: '#f0fdf4', padding: '12px', borderRadius: '12px', border: '1px solid #dcfce7', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                            <div style={{ fontSize: '0.95rem', fontWeight: 900, color: '#166534' }}>
                                                ₹{deal.price || 'Price TBA'} Deal
                                            </div>
                                            <span style={{ background: '#166534', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 700 }}>
                                                {(deal.stage || 'ACTIVE').toUpperCase()}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 700, marginBottom: '2px' }}>
                                            {deal.unitNo ? `Unit #${deal.unitNo} • ` : ''}{deal.type}
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: '#166534', fontWeight: 600, opacity: 0.8 }}>
                                            at {deal.location || deal.area}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div style={{ textAlign: 'center', padding: '20px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #e2e8f0' }}>
                                    <i className="fas fa-handshake-slash" style={{ color: '#94a3b8', fontSize: '1.2rem', marginBottom: '8px', display: 'block' }}></i>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>No Active Deals for this Contact</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 5. Automation & Sequences */}
                    <div className="glass-card" style={{ borderRadius: '16px', border: '1px solid rgba(59, 130, 246, 0.2)', boxShadow: '0 8px 32px 0 rgba(59, 130, 246, 0.05)' }}>
                        <div style={{ padding: '14px 20px', background: 'rgba(59, 130, 246, 0.05)', borderBottom: '1px solid rgba(59, 130, 246, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-robot"></i> Automation & Sequences
                            </span>
                            <button
                                onClick={() => setIsEnrollModalOpen(true)}
                                style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '0.6rem', fontWeight: 900, cursor: 'pointer' }}
                            >
                                <i className="fas fa-plus"></i> ENROLL
                            </button>
                        </div>
                        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {enrollments.filter(e => e.entityId === (contact?._id || contact?.mobile) && e.status === 'active').map(enrollment => {
                                const seq = sequences.find(s => s.id === enrollment.sequenceId);
                                if (!seq) return null;
                                return (
                                    <div key={enrollment.id} style={{ background: '#fff', border: '1px solid #eef2f6', borderRadius: '12px', padding: '12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                                            <div>
                                                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b' }}>{seq.name}</div>
                                                <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>Started {new Date(enrollment.enrolledAt).toLocaleDateString()}</div>
                                            </div>
                                            <span style={{ background: '#dcfce7', color: '#166534', fontSize: '0.6rem', padding: '2px 8px', borderRadius: '4px', fontWeight: 900 }}>ACTIVE</span>
                                        </div>
                                        <div style={{ marginBottom: '10px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', marginBottom: '4px' }}>
                                                <span style={{ color: '#64748b', fontWeight: 700 }}>Next Step: {seq.steps[enrollment.currentStep]?.type || 'Completed'}</span>
                                                <span style={{ color: '#1e293b', fontWeight: 800 }}>{Math.round((enrollment.currentStep / seq.steps.length) * 100)}%</span>
                                            </div>
                                            <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                                                <div style={{ width: `${(enrollment.currentStep / seq.steps.length) * 100}%`, height: '100%', background: '#3b82f6' }}></div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                onClick={() => updateEnrollmentStatus(contact?._id || contact?.mobile, 'paused')}
                                                style={{ flex: 1, padding: '6px', fontSize: '0.65rem', fontWeight: 800, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: '6px', cursor: 'pointer' }}
                                            >
                                                Pause
                                            </button>
                                            <button
                                                onClick={() => updateEnrollmentStatus(contact?._id || contact?.mobile, 'stopped')}
                                                style={{ flex: 1, padding: '6px', fontSize: '0.65rem', fontWeight: 800, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer' }}
                                            >
                                                Stop
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}

                            <div style={{ marginTop: '4px' }}>
                                <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Recent Logs</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {enrollments.filter(e => e.entityId === (contact?._id || contact?.mobile)).flatMap(e => e.logs || []).slice(-3).reverse().map((log, i) => (
                                        <div key={i} style={{ display: 'flex', gap: '10px', fontSize: '0.7rem' }}>
                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6', marginTop: '4px' }}></div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ color: '#1e293b', fontWeight: 600 }}>{log.message}</div>
                                                <div style={{ color: '#94a3b8', fontSize: '0.65rem' }}>{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <EnrollSequenceModal
                isOpen={isEnrollModalOpen}
                onClose={() => setIsEnrollModalOpen(false)}
                entityId={contact?._id || contact?.mobile}
                entityName={contact.name}
            />

            {/* MOBILE BOTTOM BAR */}
            <div className="mobile-bottom-bar" style={{
                display: 'none',
                position: 'fixed',
                bottom: 0,
                width: '100%',
                background: 'rgba(255, 255, 255, 0.85)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderTop: '1px solid rgba(226, 232, 240, 0.8)',
                padding: '12px 0 30px',
                zIndex: 1000,
                justifyContent: 'space-around',
                boxShadow: '0 -10px 25px rgba(0,0,0,0.08)'
            }}>
                <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'transparent', border: 'none', gap: '4px', cursor: 'pointer' }}>
                    <div style={{ width: '42px', height: '42px', background: '#ecfdf5', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2px', border: '1px solid #d1fae5' }}>
                        <i className="fas fa-phone-alt" style={{ color: '#059669', fontSize: '1.1rem' }}></i>
                    </div>
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#065f46' }}>Call</span>
                </button>
                <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'transparent', border: 'none', gap: '4px', cursor: 'pointer' }}>
                    <div style={{ width: '42px', height: '42px', background: '#f0fdf4', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2px', border: '1px solid #dcfce7' }}>
                        <i className="fab fa-whatsapp" style={{ color: '#22c55e', fontSize: '1.2rem' }}></i>
                    </div>
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#166534' }}>WA</span>
                </button>
                <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'transparent', border: 'none', gap: '4px', cursor: 'pointer' }}>
                    <div style={{ width: '42px', height: '42px', background: '#f5f3ff', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2px', border: '1px solid #ddd6fe' }}>
                        <i className="fas fa-envelope" style={{ color: '#7c3aed', fontSize: '1.1rem' }}></i>
                    </div>
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#5b21b6' }}>Email</span>
                </button>
                <div style={{ padding: '0 12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                        onClick={() => showNotification("Deal Stage Advanced: Negotiation → Closing")}
                        style={{
                            background: 'rgba(79, 70, 229, 0.1)',
                            color: 'var(--premium-blue)',
                            padding: '12px 14px',
                            borderRadius: '14px',
                            fontSize: '0.75rem',
                            fontWeight: 900,
                            border: '1px solid rgba(79, 70, 229, 0.2)',
                        }}
                    >
                        ADVANCE
                    </button>
                    <button
                        onClick={() => {
                            if (recordType === 'lead') {
                                const res = LeadConversionService.evaluateAutoConversion(contact, 'create_deal_clicked');
                                if (res.success) showNotification(res.message);
                            } else {
                                showNotification("Opening Deal Creation interface...");
                            }
                        }}
                        style={{
                            background: 'var(--premium-blue)',
                            color: '#fff',
                            padding: '12px 18px',
                            borderRadius: '14px',
                            fontSize: '0.75rem',
                            fontWeight: 900,
                            border: 'none',
                            boxShadow: '0 8px 16px rgba(79, 70, 229, 0.3)',
                            letterSpacing: '0.5px'
                        }}>
                        CREATE DEAL
                    </button>
                </div>
            </div>

            {/* TOAST NOTIFICATION */}
            {
                toast && (
                    <div style={{ position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)', background: '#1e293b', color: '#fff', padding: '10px 20px', borderRadius: '8px', zIndex: 2000, display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', fontSize: '0.85rem', fontWeight: 600 }}>
                        <i className="fas fa-check-circle" style={{ color: '#10b981' }}></i>
                        {toast}
                    </div>
                )
            }
        </div >
    );
};

export default ContactDetail;
