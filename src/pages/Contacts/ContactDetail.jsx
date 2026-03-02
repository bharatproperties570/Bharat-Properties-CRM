import React, { useState, useEffect } from 'react';
import { api, enrichmentAPI } from '../../utils/api';
import { contactData, leadData, inventoryData, suggestedTags } from '../../data/mockData';
import { getInitials } from '../../utils/helpers';
import LeadConversionService from '../../services/LeadConversionService';
import { calculateLeadScore, getLeadTemperature } from '../../utils/leadScoring';
import { usePropertyConfig } from '../../context/PropertyConfigContext';
import { useSequences } from '../../context/SequenceContext';
import { useUserContext } from '../../context/UserContext';
import { activitiesAPI, usersAPI } from '../../utils/api';
import EnrollSequenceModal from '../../components/EnrollSequenceModal';
import CallModal from '../../components/CallModal';
import SendMessageModal from '../../components/SendMessageModal';
import ComposeEmailModal from '../Communication/components/ComposeEmailModal';
import ManageTagsModal from '../../components/ManageTagsModal';
import AssignContactModal from '../../components/AssignContactModal';
import DocumentUploadModal from '../../components/DocumentUploadModal';
import { STAGE_PIPELINE } from '../../utils/stageEngine';
import '../../index.css';
import AddInventoryModal from '../../components/AddInventoryModal';
import AddLeadModal from '../../components/AddLeadModal';
import AddDealModal from '../../components/AddDealModal';
import CreateActivityModal from '../../components/CreateActivityModal';
import { parseBudget, parseSizeSqYard, calculateMatch } from '../../utils/matchingLogic';



import EnterprisePipeline from '../../components/EnterprisePipeline';
import UnifiedActivitySection from '../../components/Activities/UnifiedActivitySection';

const ContactDetail = ({ contactId, onBack, onAddActivity }) => {
    const { scoringAttributes, activityMasterFields } = usePropertyConfig(); // Inject Context
    const { sequences, enrollments, updateEnrollmentStatus } = useSequences();
    const { users: contextUsers } = useUserContext();
    const [contact, setContact] = useState(null);
    const [composerTab, setComposerTab] = useState('note');
    const [expandedSections, setExpandedSections] = useState(['core', 'professional', 'location', 'financial', 'education', 'personal', 'pref', 'journey', 'negotiation', 'ai', 'ownership', 'documents', 'matching', 'probability']);
    const [timelineFilter, setTimelineFilter] = useState('all');
    const [userFilter, setUserFilter] = useState('all');
    const [tagFilter, setTagFilter] = useState('all');
    const [allTags, setAllTags] = useState([]);
    const [showStarredOnly, setShowStarredOnly] = useState(false);

    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [showScoreBreakdown, setShowScoreBreakdown] = useState(false);
    const [toast, setToast] = useState(null);
    const [dealStatus, setDealStatus] = useState('active'); // 'active' or 'lost'
    const [recordType, setRecordType] = useState('contact'); // 'contact' or 'lead'
    const [pendingTasks, setPendingTasks] = useState([{ id: Date.now(), subject: '', dueDate: '', reminder: false }]);
    const [composerContent, setComposerContent] = useState('');
    const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
    const [isCallModalOpen, setIsCallModalOpen] = useState(false);
    const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isTagsModalOpen, setIsTagsModalOpen] = useState(false);
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
    const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
    const [isAddLeadModalOpen, setIsAddLeadModalOpen] = useState(false);
    const [isAddDealModalOpen, setIsAddDealModalOpen] = useState(false);
    const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);



    const [unifiedTimeline, setUnifiedTimeline] = useState([]);
    const [loadingTimeline, setLoadingTimeline] = useState(false);

    // New states for backend data
    const [ownedProperties, setOwnedProperties] = useState([]);
    const [historyProperties, setHistoryProperties] = useState([]);
    const [activeDeals, setActiveDeals] = useState([]);
    const [contactDocuments, setContactDocuments] = useState([]);
    const [matchedDeals, setMatchedDeals] = useState([]);
    const [loadingMatches, setLoadingMatches] = useState(false);

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

    const fetchUnifiedTimeline = async (id, type) => {
        setLoadingTimeline(true);
        try {
            const res = await api.get(`activities/unified/${type}/${id}`);
            if (res.data && res.data.success) {
                const timeline = res.data.data || [];
                setUnifiedTimeline(timeline);
                // Extract unique tags
                const tags = new Set(suggestedTags);
                timeline.forEach(item => {
                    if (item.tags && Array.isArray(item.tags)) {
                        item.tags.forEach(t => tags.add(t));
                    }
                });
                setAllTags(Array.from(tags));
            }
        } catch (error) {
            console.error("Error fetching unified timeline:", error);
        } finally {
            setLoadingTimeline(false);
        }
    };

    const handleToggleStar = async (item) => {
        if (item.source !== 'activity') return;
        try {
            const newStarredStatus = !item.isStarred;
            const res = await activitiesAPI.update(item._id, { isStarred: newStarredStatus });
            if (res && res.success) {
                setUnifiedTimeline(prev => prev.map(t =>
                    t._id === item._id ? { ...t, isStarred: newStarredStatus } : t
                ));
                showNotification(newStarredStatus ? 'Activity starred' : 'Activity unstarred');
            }
        } catch (error) {
            console.error("Error toggling star:", error);
            showNotification('Failed to update star status');
        }
    };

    const handleSaveActivity = async () => {
        if (!contactId || !recordType) return;

        try {
            let type = composerTab.charAt(0).toUpperCase() + composerTab.slice(1);
            if (composerTab === 'whatsapp') type = 'WhatsApp';
            if (composerTab === 'call') type = 'Call';
            if (composerTab === 'note') type = 'Note';

            let backendData = {
                type: type,
                subject: composerTab === 'task' ? 'Multiple Tasks Created' : `${type} Logged`,
                status: 'Completed',
                priority: 'Normal',
                entityId: contactId,
                entityType: recordType.charAt(0).toUpperCase() + recordType.slice(1),
                relatedTo: [{ id: contactId, name: contact?.fullName || contact?.name || 'Unknown', model: recordType.charAt(0).toUpperCase() + recordType.slice(1) }],
                description: composerContent,
                details: {
                    purpose: composerTab,
                    content: composerContent
                }
            };

            if (composerTab === 'task') {
                const tasksToSave = pendingTasks.filter(t => t.subject.trim());
                if (tasksToSave.length === 0) {
                    showNotification('Please enter at least one task subject.');
                    return;
                }
                backendData.tasks = tasksToSave.map(t => ({
                    subject: t.subject,
                    dueDate: t.dueDate,
                    reminder: t.reminder
                }));
                backendData.subject = tasksToSave.length === 1 ? tasksToSave[0].subject : `New Tasks (${tasksToSave.length})`;
                backendData.status = 'Pending';
            }

            const res = await activitiesAPI.create(backendData);
            if (res && res.success) {
                showNotification(`${composerTab.charAt(0).toUpperCase() + composerTab.slice(1)} saved successfully!`);
                setComposerContent('');
                setPendingTasks([{ id: Date.now(), subject: '', dueDate: new Date().toISOString().slice(0, 16), reminder: false }]);
                fetchUnifiedTimeline(contactId, recordType);
            } else {
                showNotification('Failed to save activity');
            }
        } catch (error) {
            console.error("Error saving activity:", error);
            showNotification('Error saving activity');
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

                    // Robust Record Type Detection
                    let finalType = foundType;
                    if (data.type === 'Lead' || data.isLead || data.requirement || recordType === 'lead') {
                        finalType = 'lead';
                    }

                    setRecordType(finalType);
                    fetchUnifiedTimeline(contactId, finalType);

                    // Users are now fetched via UserContext

                    // Fetch related data
                    fetchRelatedData(contactId, finalType, data);
                } else {
                    setContact(null);
                }
            } catch (error) {
                // If it fails, try lead if it was contact or vice versa
                try {
                    const leadRes = await api.get(`leads/${contactId}`);
                    if (leadRes.data && leadRes.data.success) {
                        const leadData = leadRes.data.data;
                        setContact(leadData);
                        setRecordType('lead');
                        fetchUnifiedTimeline(contactId, 'lead');

                        // Fetch related data
                        fetchRelatedData(contactId, 'lead', leadData);
                    } else {
                        setContact(null);
                    }
                } catch (e) {
                    console.error("Error fetching record details:", e);
                    setContact(null);
                }
            }
        };

        const fetchRelatedData = async (id, type, recordData) => {
            try {
                // Fetch Documents (already in recordData.documents typically, but if not we can set it)
                if (recordData.documents && Array.isArray(recordData.documents)) {
                    setContactDocuments(recordData.documents);
                }

                // Fetch Deals where contact is involved
                const dealsRes = await api.get(`deals?contactId=${id}`);
                if (dealsRes.data && dealsRes.data.success) {
                    // Filter active deals specifically to owner or associate roles
                    const deals = dealsRes.data.records || [];
                    setActiveDeals(deals.filter(d => {
                        // Skip inactive/closed
                        if (d.stage === 'lost' || d.stage === 'won' || d.stage === 'Cancelled') return false;

                        // Check if contact acts as owner or associate
                        const isOwner = (d.owner && (d.owner._id === id || d.owner === id)) ||
                            (d.partyStructure?.owner && (d.partyStructure.owner._id === id || d.partyStructure.owner === id));
                        const isAssociate = d.associatedContact && (d.associatedContact._id === id || d.associatedContact === id);

                        return isOwner || isAssociate;
                    }));
                }

                // Fetch Inventory where contact is owner
                const invRes = await api.get(`inventory?search=${recordData.mobile || recordData.name || ''}`);
                if (invRes.data && invRes.data.success) {
                    const inventory = invRes.data.records || [];

                    const owned = [];
                    const history = [];

                    const normalize = (phone) => phone?.toString()?.replace(/\D/g, '')?.slice(-10);
                    const contactPhone = normalize(recordData?.mobile);

                    inventory.forEach(item => {
                        const ownerPhone = normalize(item.ownerPhone);
                        const prevOwnerPhone = normalize(item.previousOwnerPhone);

                        if (ownerPhone === contactPhone) {
                            owned.push(item);
                        } else if (prevOwnerPhone === contactPhone) {
                            history.push(item);
                        }
                    });

                    setOwnedProperties(owned);
                    setHistoryProperties(history);
                }

                // Match Deals Logic for Leads
                if (type === 'lead') {
                    setLoadingMatches(true);
                    try {
                        const inventoryRes = await api.get('inventory', { params: { limit: 100 } });
                        if (inventoryRes.data && inventoryRes.data.success) {
                            const inventoryItems = inventoryRes.data.records || [];

                            const requirementVal = renderLookup(recordData.requirement, "");
                            const locationVal = renderLookup(recordData.searchLocation || recordData.location, "");
                            const budgetVal = (recordData.budgetMin || recordData.budgetMax)
                                ? `₹${recordData.budgetMin} - ₹${recordData.budgetMax}`
                                : renderLookup(recordData.budget, "");
                            const sizeVal = `${recordData.areaMin || ""}-${recordData.areaMax || ""} ${renderLookup(recordData.areaMetric, "")}`.trim();

                            const baseBudget = parseBudget(budgetVal);
                            const leadSize = parseSizeSqYard(sizeVal);

                            const leadContext = {
                                baseBudget,
                                leadSize,
                                leadType: requirementVal.toLowerCase(),
                                leadLocation: locationVal.toLowerCase(),
                                leadLocationSectors: locationVal.toLowerCase().split(',').map(s => s.trim()).filter(Boolean)
                            };

                            const weights = { location: 30, type: 20, budget: 25, size: 25 };
                            const options = { budgetFlexibility: 20, sizeFlexibility: 20, includeNearby: true, minMatchScore: 40 };

                            const matches = calculateMatch(recordData, leadContext, weights, options, inventoryItems);
                            setMatchedDeals(matches.slice(0, 5)); // Only show top 5 for the compact view
                        }
                    } catch (matchErr) {
                        console.error("Error matching deals:", matchErr);
                    } finally {
                        setLoadingMatches(false);
                    }
                }
            } catch (err) {
                console.error("Error fetching related dynamic data", err);
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
            total: contact?.leadScore || scoring.total,
            formScore: scoring.formScore,
            activityScore: scoring.activityScore,
            detail: scoring.breakdown,
            intent: scoring.intent,
            temp: scoring.temperature,
            categorized,
            ownedProperties: ownedProperties || [] // Injected from useEffect fetch
        };

        // Real Deal Probability mapping
        const dealProbScore = contact?.dealProbability || leadScore.total;
        const dealProbability = {
            score: dealProbScore,
            trend: 'up',
            factors: [
                leadScore.total > 70 ? 'High intent index' : 'Consistent engagement',
                categorized.completed.length > 5 ? 'High activity volume' : 'Active follow-up',
                'Matched requirements'
            ]
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

        // AI Intelligence: Real Intent Mapping
        const purchaseIntent = {
            level: contact?.lead_classification || leadScore.intent,
            emoji: (contact?.intent_index || leadScore.total) >= 80 ? '🔥' : (contact?.intent_index || leadScore.total) >= 60 ? '🌤' : '❄',
            confidence: contact?.lead_classification ? 'AI Qualified' : '95%',
            color: leadScore.temp.color
        };

        // AI Intelligence: Real Risk Calculation
        const lastActDate = contact?.lastActivityAt || contact?.updatedAt || contact?.createdAt;
        const daysSinceLastAct = lastActDate ? Math.floor((new Date() - new Date(lastActDate)) / 86400000) : 0;

        let riskStatus = 'Stable';
        let riskReason = 'Active engagement';
        let riskColor = '#0ea5e9';

        if (daysSinceLastAct > 14) {
            riskStatus = 'High Risk';
            riskReason = `No activity for ${daysSinceLastAct} days`;
            riskColor = '#ef4444';
        } else if (daysSinceLastAct > 7) {
            riskStatus = 'At Risk';
            riskReason = 'Slow follow-up cadence';
            riskColor = '#f59e0b';
        }

        const riskLevel = {
            status: riskStatus,
            reason: riskReason,
            color: riskColor
        };

        const priority = {
            level: leadScore.total >= 80 ? 'P1' : leadScore.total >= 60 ? 'P2' : 'P3',
            reason: riskStatus === 'High Risk' ? 'Urgent Re-engagement' : 'Negotiation Phase',
            color: leadScore.total >= 80 ? '#ef4444' : '#64748b'
        };

        const preferences = {
            locations: contact?.searchLocation ? [contact.searchLocation] : (contact?.locations?.length > 0 ? contact.locations.map(l => renderLookup(l)) : []),
            budget: (contact?.budgetMin || contact?.budgetMax) ?
                `₹${Number(contact.budgetMin || 0).toLocaleString()} - ${Number(contact.budgetMax || 0).toLocaleString()}` :
                (renderLookup(contact?.budget) || '-'),
            flexibility: contact?.whitePortion ? `${contact.whitePortion}%` : '0%',
            type: contact?.propertyType?.[0] ? renderLookup(contact.propertyType[0]) : (renderLookup(contact?.propertyCategory) || '-'),
            urgency: renderLookup(contact?.timeline) || (leadScore.total >= 80 ? 'Extreme' : 'Moderate'),
            dealType: renderLookup(contact?.requirement) || 'Direct Purchase',
            // Added live fields for the new UI categories
            source: renderLookup(contact?.source) || '-',
            subSource: renderLookup(contact?.subSource) || '-',
            campaign: renderLookup(contact?.campaign) || '-',
            tags: contact?.tags || [],
            description: contact?.description || '',
            subType: (contact?.subType || []).map(s => renderLookup(s)),
            area: (contact?.areaMin || contact?.areaMax) ? `${contact.areaMin || 0} - ${contact.areaMax || 0} ${renderLookup(contact.areaMetric) || ''}` : '-',
            unitType: (contact?.unitType || []).map(u => renderLookup(u)),
            transactionType: renderLookup(contact?.transactionType) || '-',
            funding: renderLookup(contact?.funding) || '-',
            furnishing: renderLookup(contact?.furnishing) || '-',
            range: contact?.range || '-'
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
            insight: `Engagement velocity: ${categorized.completed.length} total activities.`,
            history: `Last activity: ${daysSinceLastAct} days ago.`
        };

        // NEXT BEST ACTION (Agent Playbook) logic
        let playbookAction = "Send PPT and schedule site visit";
        if (!contact?.budget) {
            playbookAction = "Clarify budget requirement for better matching";
        } else if (daysSinceLastAct > 5) {
            playbookAction = "Follow up regarding previous discussion";
        } else if (leadScore.total > 80) {
            playbookAction = "Prepare final draft of the offer";
        }

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
            type: contact?.role_type || 'Buyer',
            label: contact?.role_type || 'Buyer',
            icon: (contact?.role_type || '').toLowerCase().includes('investor') ? 'briefcase' : 'user',
            color: '#8b5cf6',
            metrics: [
                { label: 'ROI', value: '18% Expected' },
                { label: 'Rental Yield', value: '4.2%' },
                { label: 'Exit Value (3y)', value: '₹1.8 Cr' }
            ],
            pitch: 'Share ROI sheet & discuss Bulk Deal'
        };

        const lossAnalysis = {
            summary: "Analysis based on historical patterns for similar leads.",
            primaryReasons: [
                { label: 'Price Mismatch', type: 'auto', confidence: 92, icon: 'tag' },
                { label: 'Delayed Follow-up', type: 'auto', confidence: 85, icon: 'clock' }
            ],
            contributingFactors: [
                { label: 'High Price Point', impact: 'High' }
            ],
            recoveryOptions: [
                { label: 'Offer lower budget alternatives', icon: 'home', description: 'Re-engage with budget-friendly options.' }
            ],
            couldHaveSaved: [
                { label: 'Faster Response', description: 'Leads followed within 24h have 40% higher conversion.' }
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
            matchedDeals: activeDeals.length
        };

        return { leadScore, dealProbability, priceInsight, ownerIntelligence, journeySteps, rejectionAlert, purchaseIntent, riskLevel, priority, preferences, closingProbability, commission, persona, lossAnalysis, propertyContext, financialDetails, playbookAction };
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
                
                /* Property Deal Journey Pipeline Styles */
                .pipeline-container {
                    display: flex;
                    width: 100%;
                    gap: 4px;
                    padding: 8px 0;
                    overflow-x: auto;
                    margin-bottom: 8px;
                }
                .pipeline-step {
                    flex: 1;
                    min-width: 100px;
                    height: 40px;
                    position: relative;
                    display: flex;
                    alignItems: center;
                    justifyContent: center;
                    font-size: 0.65rem;
                    font-weight: 800;
                    text-transform: uppercase;
                    color: #fff;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    clip-path: polygon(calc(100% - 10px) 0%, 100% 50%, calc(100% - 10px) 100%, 0% 100%, 10px 50%, 0% 0%);
                }
                .pipeline-step:first-child {
                    clip-path: polygon(calc(100% - 10px) 0%, 100% 50%, calc(100% - 10px) 100%, 0% 100%, 0% 0%);
                    border-top-left-radius: 8px;
                    border-bottom-left-radius: 8px;
                }
                .pipeline-step:last-child {
                    clip-path: polygon(100% 0%, 100% 100%, 0% 100%, 10px 50%, 0% 0%);
                    border-top-right-radius: 8px;
                    border-bottom-right-radius: 8px;
                }
                .pipeline-step.active {
                    animation: glow 1.5s infinite ease-in-out;
                    z-index: 2;
                    transform: scale(1.02);
                }
                .pipeline-step.completed {
                    opacity: 0.85;
                }
                .pipeline-step.future {
                    background: #f1f5f9 !important;
                    color: #94a3b8 !important;
                }
                @keyframes glow {
                    0% { filter: drop-shadow(0 0 2px var(--glow-color)); }
                    50% { filter: drop-shadow(0 0 8px var(--glow-color)); }
                    100% { filter: drop-shadow(0 0 2px var(--glow-color)); }
                }
                .pipeline-step:hover {
                    filter: brightness(1.1);
                    transform: translateY(-2px);
                }
                #pipeline-wrapper {
                    position: sticky;
                    top: 0;
                    z-index: 50;
                    background: rgba(255, 255, 255, 0.9);
                    backdrop-filter: blur(8px);
                    padding: 12px 0;
                    margin: -1.5rem -2rem 1.5rem -2rem;
                    padding-left: 2rem;
                    padding-right: 2rem;
                    border-bottom: 1px solid #e2e8f0;
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
                                <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.5px' }}>
                                    {`${contact.title ? renderLookup(contact.title) + ' ' : ''}${contact.name ? contact.name : (contact.firstName || '') + ' ' + (contact.surname || contact.lastName || '')}`.trim()}
                                </h1>
                                {recordType === 'lead' && contact && (
                                    <div className={`score-indicator ${aiStats.leadScore.temp.class}`} style={{ width: '32px', height: '32px', fontSize: '0.8rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', border: '2px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', background: aiStats.leadScore.temp.color, color: '#fff' }}>
                                        {aiStats.leadScore.total}
                                    </div>
                                )}
                                {recordType === 'lead' && contact.intent_index > 0 && (
                                    <div title="Intent Index" style={{ width: '32px', height: '32px', fontSize: '0.8rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', border: '2px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', background: contact.intent_index >= 70 ? '#10b981' : contact.intent_index >= 40 ? '#f59e0b' : '#ef4444', color: '#fff' }}>
                                        {contact.intent_index}
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    {recordType === 'lead' && (
                                        <span style={{
                                            background: '#ecfdf5',
                                            color: '#059669',
                                            fontSize: '0.6rem',
                                            padding: '2px 8px',
                                            borderRadius: '6px',
                                            fontWeight: 800,
                                            border: '1px solid #d1fae5'
                                        }}>
                                            LEAD
                                        </span>
                                    )}
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
                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><i className="fas fa-briefcase" style={{ fontSize: '0.75rem', color: '#475569' }}></i> {renderLookup(contact.designation, 'Unknown Designation')}</span>
                                <span style={{ color: '#cbd5e1' }}>|</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><i className="fas fa-building" style={{ fontSize: '0.75rem', color: '#475569' }}></i> {contact.company || 'Unknown Company'}</span>
                                <span style={{ color: '#cbd5e1' }}>|</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><i className="fas fa-bullhorn" style={{ fontSize: '0.75rem', color: '#f59e0b' }}></i> {renderLookup(contact.source, 'Direct')}</span>
                                <span style={{ color: '#cbd5e1' }}>|</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><i className="fas fa-history" style={{ fontSize: '0.75rem', color: '#475569' }}></i> {contact.activity || '12 Activities'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="detail-header-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {recordType === 'lead' && (
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
                    )}
                    <button className="action-btn" title="Call" onClick={() => setIsCallModalOpen(true)}><i className="fas fa-phone-alt" style={{ color: '#16a34a' }}></i> Call</button>
                    <button className="action-btn" title="Message" onClick={() => setIsMessageModalOpen(true)}><i className="fas fa-comment-alt" style={{ color: '#3b82f6' }}></i> Message</button>
                    <button className="action-btn" title="Email" onClick={() => setIsEmailModalOpen(true)}><i className="fas fa-envelope" style={{ color: '#8b5cf6' }}></i> Email</button>

                    <div style={{ position: 'relative' }}>
                        <button className="action-btn" title="More" onClick={() => setShowMoreMenu(!showMoreMenu)}><i className="fas fa-ellipsis-v"></i></button>
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
                                <button
                                    style={{ width: '100%', textAlign: 'left', padding: '10px 20px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '10px' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(241, 245, 249, 0.8)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    onClick={async () => {
                                        setShowMoreMenu(false);
                                        try {
                                            const res = await enrichmentAPI.runLead(contactId);
                                            if (res.success) {
                                                showNotification('Intelligence Enrichment Complete!');
                                                window.location.reload();
                                            }
                                        } catch (e) {
                                            showNotification('Enrichment failed');
                                        }
                                    }}
                                >
                                    <i className="fas fa-magic" style={{ color: '#10b981', width: '16px' }}></i> Enrich Intelligence
                                </button>

                                <button
                                    style={{ width: '100%', textAlign: 'left', padding: '10px 20px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '10px' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(241, 245, 249, 0.8)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    onClick={() => { setIsTagsModalOpen(true); setShowMoreMenu(false); }}
                                >
                                    <i className="fas fa-tag" style={{ width: '16px' }}></i> Manage Tags
                                </button>

                                <button
                                    style={{ width: '100%', textAlign: 'left', padding: '10px 20px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '10px' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(241, 245, 249, 0.8)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    onClick={() => { setIsAssignModalOpen(true); setShowMoreMenu(false); }}
                                >
                                    <i className="fas fa-user-plus" style={{ width: '16px' }}></i> Assign Lead
                                </button>

                                <button
                                    style={{ width: '100%', textAlign: 'left', padding: '10px 20px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '10px' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(241, 245, 249, 0.8)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    onClick={() => { setIsActivityModalOpen(true); setShowMoreMenu(false); }}
                                >
                                    <i className="fas fa-calendar-plus" style={{ color: '#ec4899', width: '16px' }}></i> Create Activity
                                </button>

                                <div style={{ height: '1px', background: '#f1f5f9', margin: '5px 0' }}></div>

                                <button style={{ width: '100%', textAlign: 'left', padding: '10px 20px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '10px' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(241, 245, 249, 0.8)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'} onClick={() => { showNotification('Contact marked dormant.'); setShowMoreMenu(false); }}>
                                    <i className="fas fa-moon" style={{ width: '16px' }}></i> Mark Dormant
                                </button>

                                <button style={{ width: '100%', textAlign: 'left', padding: '10px 20px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#ef4444', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '10px' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(254, 242, 242, 1)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'} onClick={() => { showNotification('Exporting contact data...'); setShowMoreMenu(false); }}>
                                    <i className="fas fa-file-export" style={{ width: '16px' }}></i> Export Contact
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Refined Assignment Plate */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '4px 12px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        marginLeft: '4px'
                    }}>
                        {/* Name Stack */}
                        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>
                                {contact.owner?.name || 'Unassigned'}
                            </span>
                            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>
                                {renderLookup(contact.team) || 'Standard Team'}
                            </span>
                        </div>

                        {/* Divider */}
                        <div style={{ width: '1px', height: '18px', background: '#cbd5e1' }}></div>

                        {/* Visibility Icon */}
                        <div title={`Visibility: ${contact.visibleTo || 'Everyone'}`} style={{ display: 'flex', alignItems: 'center' }}>
                            {(() => {
                                const v = (contact.visibleTo || 'Everyone').toLowerCase();
                                if (v === 'private') return <i className="fas fa-lock" style={{ color: '#ef4444', fontSize: '0.85rem' }}></i>;
                                if (v === 'team') return <i className="fas fa-users" style={{ color: '#3b82f6', fontSize: '0.85rem' }}></i>;
                                return <i className="fas fa-globe" style={{ color: '#10b981', fontSize: '0.85rem' }}></i>;
                            })()}
                        </div>
                    </div>
                </div>
            </header>

            {/* MAIN CONTENT AREA - STACKED LAYOUT */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* 0. Full Width Enterprise Lead Pipeline */}
                {recordType === 'lead' && (
                    <div className="no-scrollbar" style={{
                        width: '100%',
                        padding: '1.5rem 2rem 0.5rem 2rem',
                        borderBottom: '1px solid #e2e8f0',
                        background: '#fff',
                        zIndex: 40
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-chart-line" style={{ color: '#4f46e5' }}></i> Enterprise Lead Pipeline
                            </span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>
                                TECHNICAL STATUS: <span style={{ color: '#4f46e5', fontWeight: 900 }}>{String(renderLookup(contact.stage) || 'New').toUpperCase()}</span>
                            </span>
                        </div>
                        <EnterprisePipeline
                            contact={contact}
                            activities={unifiedTimeline}
                        />
                    </div>
                )}

                {/* TWO COLUMN GRID BELOW PIPELINE */}
                <div className="detail-main-content" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>


                    {/* LEFT COLUMN - Primary */}
                    <div className="detail-left-col no-scrollbar" style={{ flex: '1.5', overflowY: 'auto', padding: '1.5rem 2rem', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>


                        {/* 1. Unified Profile 360° Dashboard */}
                        <div className="glass-card" style={{ borderRadius: '16px' }}>
                            <div onClick={() => toggleSection('core')} style={{ padding: '14px 20px', background: 'rgba(248, 250, 252, 0.5)', borderBottom: '1px solid rgba(226, 232, 240, 0.8)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '1px' }}>{recordType === 'lead' ? 'Lead' : 'Contact'} 360° Unified Dashboard</span>
                                <i className={`fas fa-chevron-${expandedSections.includes('core') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#94a3b8' }}></i>
                            </div>
                            {
                                expandedSections.includes('core') && (
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
                                                <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <i className="fas fa-briefcase"></i> Professional Identity
                                                </h4>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                                    <div>
                                                        <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Branch / Office</label>
                                                        <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Branch', e.target.innerText)} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#10b981' }}>{contact.workOffice || 'Main Office'}</div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '12px' }}>
                                                        <div style={{ flex: 1, padding: '12px', background: 'rgba(79, 70, 229, 0.02)', borderRadius: '10px', border: '1px solid #eef2f6' }}>
                                                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Category</div>
                                                            <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Category', e.target.innerText)} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{renderLookup(contact.professionCategory)}</div>
                                                        </div>
                                                        <div style={{ flex: 1, padding: '12px', background: 'rgba(79, 70, 229, 0.02)', borderRadius: '10px', border: '1px solid #eef2f6' }}>
                                                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Sub-Category</div>
                                                            <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Sub-Category', e.target.innerText)} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{renderLookup(contact.professionSubCategory)}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ height: '1px', background: '#f1f5f9', margin: '4px 0' }}></div>

                                        {/* Row 1.5: Education & Financial Strength */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '32px' }}>
                                            {/* Education */}
                                            <div>
                                                <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#3b82f6', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <i className="fas fa-user-graduate"></i> Academic Background
                                                </h4>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                                    {contact.educations?.map((edu, i) => (
                                                        <div key={i} style={{ paddingLeft: '12px', borderLeft: '2px solid #e2e8f0' }}>
                                                            <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Degree', e.target.innerText)} style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a' }}>{renderLookup(edu.degree)}</div>
                                                            <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('School', e.target.innerText)} style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>{edu.school || '-'}</div>
                                                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '2px' }}>{renderLookup(edu.education)}</div>
                                                        </div>
                                                    )) || <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No education details provided</div>}
                                                </div>
                                            </div>

                                            {/* Financial Strength (Incomes & Loans) */}
                                            <div style={{ gridColumn: 'span 2', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                                                <div>
                                                    <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#059669', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <i className="fas fa-money-bill-wave"></i> Income Profiles
                                                    </h4>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                                )
                            }
                        </div>




                        {recordType === 'lead' && (
                            <div className="glass-card" style={{ borderRadius: '16px' }}>
                                <div onClick={() => toggleSection('pref')} style={{ padding: '14px 20px', background: 'rgba(248, 250, 252, 0.5)', borderBottom: '1px solid rgba(226, 232, 240, 0.8)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '1px' }}>Property Preferences</span>
                                    <i className={`fas fa-chevron-${expandedSections.includes('pref') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#94a3b8' }}></i>
                                </div>
                                {expandedSections.includes('pref') && (
                                    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '32px', background: 'transparent' }}>

                                        {/* Group 1: Acquisition Intelligence */}
                                        <div>
                                            <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#6366f1', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '0.5px' }}>
                                                <i className="fas fa-bullhorn"></i> Acquisition Intelligence
                                            </h4>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }}>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Lead Source</label>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.source}</div>
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Sub-Source</label>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.subSource}</div>
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Campaign</label>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.campaign}</div>
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Visibility Scope</label>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{contact.visibleTo || 'Everyone'}</div>
                                                </div>
                                                <div style={{ gridColumn: 'span 4' }}>
                                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Lead Description</label>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                                                        {aiStats.preferences.description || 'No description provided.'}
                                                    </div>
                                                </div>
                                                <div style={{ gridColumn: 'span 4' }}>
                                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>Lead Tags</label>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                        {aiStats.preferences.tags.length > 0 ? aiStats.preferences.tags.map((tag, idx) => (
                                                            <span key={idx} style={{ padding: '4px 12px', background: '#eff6ff', color: '#3b82f6', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, border: '1px solid #dbeafe' }}>{tag}</span>
                                                        )) : <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No tags assigned</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ height: '1px', background: '#f1f5f9' }}></div>

                                        {/* Group 2: Property Requirement Details */}
                                        <div>
                                            <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#10b981', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '0.5px' }}>
                                                <i className="fas fa-home"></i> Property Requirement
                                            </h4>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Intent Type</label>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.dealType}</div>
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Property Category</label>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.type}</div>
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Sub-Categories</label>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>{aiStats.preferences.subType.join(', ') || '-'}</div>
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Area Specs</label>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.area}</div>
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Preferred Sizes</label>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>{aiStats.preferences.unitType.join(', ') || '-'}</div>
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Furnishing Status</label>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.furnishing}</div>
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ height: '1px', background: '#f1f5f9' }}></div>

                                        {/* Group 3: Financials & Location Search */}
                                        <div>
                                            <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#f59e0b', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '0.5px' }}>
                                                <i className="fas fa-coins"></i> Transaction & Geography
                                            </h4>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Budget Bracket</label>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.budget}</div>
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Transaction Type</label>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.transactionType} <span style={{ color: '#6366f1', fontSize: '0.75rem' }}>(W: {aiStats.preferences.flexibility})</span></div>
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Funding</label>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.funding}</div>
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Timeline</label>
                                                    <span className="pill" style={{ background: '#fff7ed', color: '#9a3412', fontSize: '0.7rem', fontWeight: 800 }}>{aiStats.preferences.urgency.toUpperCase()}</span>
                                                </div>
                                                <div style={{ gridColumn: 'span 2' }}>
                                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Search Locations (Radius: {aiStats.preferences.range})</label>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <i className="fas fa-map-marker-alt" style={{ color: '#ef4444', fontSize: '0.8rem' }}></i>
                                                        {aiStats.preferences.locations.join(', ') || 'No locations specified'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* AI Rejection Alert Overlay */}
                                        {aiStats.rejectionAlert && (
                                            <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <i className="fas fa-exclamation-triangle" style={{ color: '#ef4444' }}></i>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 800, color: '#991b1b', textTransform: 'uppercase' }}>AI Constraint Warning</label>
                                                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#ef4444' }}>{aiStats.rejectionAlert}</div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                            </div>
                        )}


                        {/* 3. Omnichannel Timeline */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e293b' }}>Activities Timeline</h3>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={() => setShowStarredOnly(!showStarredOnly)}
                                        style={{
                                            background: showStarredOnly ? '#fef3c7' : 'transparent',
                                            border: showStarredOnly ? '1px solid #fde68a' : '1px solid #e2e8f0',
                                            color: showStarredOnly ? '#d97706' : '#94a3b8',
                                            borderRadius: '6px',
                                            padding: '4px 10px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            transition: 'all 0.2s',
                                            outline: 'none'
                                        }}
                                        title={showStarredOnly ? "Clear Starred Filter" : "Show Starred Only"}
                                    >
                                        <i className={`${showStarredOnly ? 'fas' : 'far'} fa-star`} style={{ fontSize: '0.8rem' }}></i>
                                    </button>
                                    <select
                                        value={userFilter}
                                        onChange={(e) => setUserFilter(e.target.value)}
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
                                        <option value="all">All Users</option>
                                        {contextUsers.map(u => {
                                            const fullName = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.name;
                                            return (
                                                <option key={u._id || u.id} value={fullName}>
                                                    {u.name || fullName} ({u.role?.name || u.role || 'Member'})
                                                </option>
                                            );
                                        })}
                                    </select>
                                    <select
                                        value={tagFilter}
                                        onChange={(e) => setTagFilter(e.target.value)}
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
                                        <option value="all">All Tags</option>
                                        {allTags.map(tag => (
                                            <option key={tag} value={tag}>{tag}</option>
                                        ))}
                                    </select>
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

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingLeft: '24px', borderLeft: '2px solid #f1f5f9', marginLeft: '12px', minHeight: '100px' }}>
                                {loadingTimeline ? (
                                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center', padding: '20px' }}>
                                        <i className="fas fa-spinner fa-spin" style={{ marginRight: '8px' }}></i> Loading timeline...
                                    </div>
                                ) : unifiedTimeline.length > 0 ? (
                                    unifiedTimeline
                                        .filter(item => {
                                            const matchesType = timelineFilter === 'all' ||
                                                (timelineFilter === 'call' && item.type.toLowerCase().includes('call')) ||
                                                (timelineFilter === 'whatsapp' && item.type.toLowerCase().includes('whatsapp')) ||
                                                (timelineFilter === 'email' && item.type.toLowerCase().includes('email')) ||
                                                (timelineFilter === 'ai' && item.source === 'ai');

                                            const matchesUser = userFilter === 'all' || item.actor === userFilter;
                                            const matchesTag = tagFilter === 'all' || (item.tags && item.tags.includes(tagFilter));
                                            const matchesStarred = !showStarredOnly || item.isStarred;

                                            return matchesType && matchesUser && matchesTag && matchesStarred;
                                        })
                                        .map((item, idx) => {
                                            // Determine icon and color based on type
                                            let icon = 'clock';
                                            let color = '#64748b';
                                            let bg = '#f8fafc';
                                            let isBrand = false;

                                            if (item.source === 'audit') {
                                                icon = 'history';
                                                color = '#8b5cf6';
                                                bg = '#f5f3ff';
                                            } else if (item.type.toLowerCase().includes('call')) {
                                                icon = 'phone-alt';
                                                color = '#3b82f6';
                                                bg = '#eff6ff';
                                            } else if (item.type.toLowerCase().includes('whatsapp')) {
                                                icon = 'whatsapp';
                                                color = '#25d366';
                                                bg = '#f0fdf4';
                                                isBrand = true;
                                            } else if (item.type.toLowerCase().includes('meeting')) {
                                                icon = 'users';
                                                color = '#10b981';
                                                bg = '#f0fdf4';
                                            } else if (item.type.toLowerCase().includes('task')) {
                                                icon = 'tasks';
                                                color = '#f59e0b';
                                                bg = '#fffbeb';
                                            } else if (item.type.toLowerCase().includes('email')) {
                                                icon = 'envelope';
                                                color = '#ef4444';
                                                bg = '#fef2f2';
                                            }

                                            return (
                                                <div key={item._id} style={{ position: 'relative' }}>
                                                    <div style={{
                                                        position: 'absolute',
                                                        left: '-36px',
                                                        top: '0',
                                                        background: color,
                                                        color: '#fff',
                                                        width: '24px',
                                                        height: '24px',
                                                        borderRadius: '50%',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '0.7rem',
                                                        border: '3px solid #fff',
                                                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                                                        zIndex: 2
                                                    }}>
                                                        <i className={`${isBrand ? 'fab' : 'fas'} fa-${icon}`}></i>
                                                    </div>
                                                    <div className="glass-card" style={{
                                                        borderRadius: '14px',
                                                        padding: '12px',
                                                        border: `1px solid ${bg === '#f8fafc' ? 'rgba(226, 232, 240, 0.8)' : bg.replace(')', ', 0.3)')}`,
                                                        background: bg
                                                    }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', alignItems: 'center', gap: '8px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                                                                <div style={{ fontWeight: 800, fontSize: '0.8rem', color: '#1e293b' }}>
                                                                    {item.title}
                                                                </div>
                                                                {item.source === 'activity' && (
                                                                    <button
                                                                        onClick={() => handleToggleStar(item)}
                                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: item.isStarred ? '#f59e0b' : '#cbd5e1', fontSize: '0.85rem' }}
                                                                    >
                                                                        <i className={`${item.isStarred ? 'fas' : 'far'} fa-star`}></i>
                                                                    </button>
                                                                )}
                                                            </div>
                                                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                                                {new Date(item.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                            </div>
                                                        </div>
                                                        {item.description && (
                                                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '4px', lineHeight: '1.4' }}>
                                                                {item.description}
                                                            </div>
                                                        )}
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                                                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>
                                                                By {typeof item.actor === 'object' && item.actor ? (item.actor.fullName || item.actor.name || item.actor.username || 'System') : (item.actor || 'System')}
                                                            </div>
                                                            {item.status && (
                                                                <div style={{
                                                                    fontSize: '0.6rem',
                                                                    padding: '2px 8px',
                                                                    borderRadius: '4px',
                                                                    background: item.status === 'Completed' ? '#dcfce7' : '#fee2e2',
                                                                    color: item.status === 'Completed' ? '#166534' : '#991b1b',
                                                                    fontWeight: 800
                                                                }}>
                                                                    {item.status.toUpperCase()}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                ) : (
                                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center', padding: '20px' }}>
                                        No activities tracked yet.
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>{/* End detail-left-col */}

                    {/* RIGHT COLUMN - Secondary Dashboard */}
                    <div className="detail-right-col no-scrollbar" style={{
                        flex: '1',
                        background: '#fff',
                        padding: '1.5rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1.5rem',
                        borderLeft: '1px solid #e2e8f0',
                        height: '100%'
                    }}>

                        {/* 1. AI Closing Probability Timeline - Visible only for leads */}
                        {
                            recordType === 'lead' && (
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
                            )
                        }

                        {/* Match Deal Section - Primary Visibility for Requirements */}
                        {(recordType === 'lead' || contact?.requirement || contact?.searchLocation || (matchedDeals && matchedDeals.length > 0)) && (
                            <div className="glass-card" style={{
                                borderRadius: '16px',
                                border: '2px solid #10b981', // More prominent border
                                boxShadow: '0 12px 40px rgba(16, 185, 129, 0.15)',
                                overflow: 'hidden',
                                minHeight: '120px' // Ensure it occupies space
                            }}>
                                <div onClick={() => toggleSection('matching')} style={{
                                    padding: '14px 20px',
                                    background: 'rgba(16, 185, 129, 0.05)',
                                    borderBottom: '1px solid rgba(16, 185, 129, 0.1)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    cursor: 'pointer'
                                }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#059669', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="fas fa-bullseye"></i> Match Deal Center
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        {matchedDeals.length > 0 && (
                                            <span style={{ background: '#10b981', color: '#fff', fontSize: '0.65rem', padding: '2px 8px', borderRadius: '10px', fontWeight: 800 }}>
                                                {matchedDeals.length} MATCHES
                                            </span>
                                        )}
                                        <i className={`fas fa-chevron-${expandedSections.includes('matching') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#059669' }}></i>
                                    </div>
                                </div>
                                {expandedSections.includes('matching') && (
                                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {loadingMatches ? (
                                            <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '0.8rem' }}>
                                                <i className="fas fa-spinner fa-spin"></i> Calculating matches...
                                            </div>
                                        ) : matchedDeals.length > 0 ? (
                                            <>
                                                {matchedDeals.map((deal, idx) => (
                                                    <div key={idx} style={{
                                                        background: '#f8fafc',
                                                        borderRadius: '12px',
                                                        padding: '12px',
                                                        border: '1px solid #e2e8f0',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        transition: 'all 0.2s'
                                                    }}>
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                                <span style={{ fontSize: '0.85rem', fontWeight: 900, color: '#0f172a' }}>{deal.unitNo || 'Unit'}</span>
                                                                <span style={{ fontSize: '0.65rem', background: '#ecfdf5', color: '#059669', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                                                                    {deal.matchPercentage}% MATCH
                                                                </span>
                                                            </div>
                                                            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <i className="fas fa-building" style={{ fontSize: '0.6rem' }}></i> {deal.projectName || 'Project'}
                                                                <span style={{ color: '#cbd5e1' }}>|</span>
                                                                <i className="fas fa-layer-group" style={{ fontSize: '0.6rem' }}></i> {deal.location || 'Block'}
                                                            </div>
                                                        </div>
                                                        <div style={{ textAlign: 'right' }}>
                                                            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#10b981' }}>₹{deal.price}</div>
                                                            <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 700 }}>{deal.size}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                                <button
                                                    onClick={() => showNotification('Redirecting to Match Center...')}
                                                    style={{
                                                        width: '100%',
                                                        padding: '10px',
                                                        borderRadius: '10px',
                                                        border: '1px solid #d1fae5',
                                                        background: '#ecfdf5',
                                                        color: '#059669',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 800,
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: '8px'
                                                    }}
                                                >
                                                    View Match Center <i className="fas fa-external-link-alt" style={{ fontSize: '0.65rem' }}></i>
                                                </button>
                                            </>
                                        ) : (
                                            <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '0.8rem' }}>
                                                No matches found for this lead.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* AI Deal Loss Analysis Module - Visible only when deal is lost and only for leads */}
                        {
                            recordType === 'lead' && dealStatus === 'lost' && (
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
                            )
                        }

                        {/* 2. AI Intelligence Panel */}
                        {
                            recordType === 'lead' && (
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
                                                    {aiStats.playbookAction}
                                                </div>
                                                <div style={{ display: 'flex', gap: '10px' }}>
                                                    <button style={{ flex: 1, padding: '10px', fontSize: '0.75rem', fontWeight: 900, background: '#fff', color: 'var(--premium-blue)', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Create Task</button>
                                                    <button style={{ flex: 1, padding: '10px', fontSize: '0.75rem', fontWeight: 900, background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', backdropFilter: 'blur(4px)' }}>WhatsApp</button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        }

                        {/* Property Icon Helper */}
                        {
                            (() => {
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
                            })()
                        }

                        {/* 1. Active Deals Section (Moved to Top) */}
                        <div className="glass-card" style={{ borderRadius: '16px', border: '1px solid rgba(234, 88, 12, 0.3)', boxShadow: '0 8px 32px 0 rgba(234, 88, 12, 0.08)' }}>
                            <div onClick={() => toggleSection('deals')} style={{ padding: '14px 20px', background: 'rgba(234, 88, 12, 0.05)', borderBottom: '1px solid rgba(234, 88, 12, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#ea580c', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <i className="fas fa-briefcase"></i> Active Deals
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setIsAddDealModalOpen(true);
                                        }}
                                        style={{
                                            background: '#ea580c',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '50%',
                                            width: '24px',
                                            height: '24px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            boxShadow: '0 2px 4px rgba(234, 88, 12, 0.2)',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                    >
                                        <i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i>
                                    </button>
                                    <i className={`fas fa-chevron-${expandedSections.includes('deals') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#ea580c' }}></i>
                                </div>
                            </div>
                            {expandedSections.includes('deals') && (
                                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {activeDeals.length > 0 ? (
                                        activeDeals.map((deal, idx) => (
                                            <div key={idx} style={{ background: '#fff7ed', padding: '12px', borderRadius: '12px', border: '1px solid #ffedd5', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
                                                        ₹{renderValue(deal.budgetMin) || renderValue(deal.price) || 'Price TBA'} Deal
                                                    </div>
                                                    <span style={{ background: '#ea580c', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 700 }}>
                                                        {(renderLookup(deal.stage) || 'ACTIVE').toUpperCase()}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#9a3412', fontWeight: 700, marginBottom: '2px' }}>
                                                    {renderLookup(deal.project) || 'General Category'}
                                                </div>
                                                <div style={{ fontSize: '0.65rem', color: '#9a3412', fontWeight: 600, opacity: 0.8 }}>
                                                    at {renderLookup(deal.location) || deal.locArea || 'TBD Location'}
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: '#fff7ed', borderRadius: '12px', border: '1px dashed #fed7aa' }}>
                                            <div style={{ width: '32px', height: '32px', background: '#ffedd5', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <i className="fas fa-handshake-slash" style={{ color: '#ea580c', fontSize: '0.9rem' }}></i>
                                            </div>
                                            <span style={{ fontSize: '0.75rem', color: '#9a3412', fontWeight: 600 }}>No Active Deals for this Contact</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* 2. Owned Properties Section */}
                        <div className="glass-card" style={{ borderRadius: '16px', border: '1px solid rgba(16, 185, 129, 0.3)', boxShadow: '0 8px 32px 0 rgba(16, 185, 129, 0.08)' }}>
                            <div onClick={() => toggleSection('owned')} style={{ padding: '14px 20px', background: 'rgba(16, 185, 129, 0.05)', borderBottom: '1px solid rgba(16, 185, 129, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#059669', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <i className="fas fa-building"></i> Owned Properties
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setIsInventoryModalOpen(true);
                                        }}
                                        style={{
                                            background: '#059669',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '50%',
                                            width: '24px',
                                            height: '24px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            boxShadow: '0 2px 4px rgba(5, 150, 105, 0.2)',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                    >
                                        <i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i>
                                    </button>
                                    <i className={`fas fa-chevron-${expandedSections.includes('owned') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#059669' }}></i>
                                </div>
                            </div>
                            {expandedSections.includes('owned') && (
                                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {ownedProperties.length > 0 ? (
                                        ownedProperties.map((prop, idx) => (
                                            <div key={idx} style={{
                                                padding: '10px 14px',
                                                border: '1px solid #f1f5f9',
                                                borderRadius: '12px',
                                                background: '#fff',
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                                                position: 'relative'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                                    <div style={{
                                                        width: '40px', height: '40px',
                                                        background: '#f0fdf4',
                                                        border: '1px solid #dcfce7',
                                                        borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                                    }}>
                                                        <i className={`fas ${(() => {
                                                            const t = prop.type?.toLowerCase() || '';
                                                            if (t.includes('plot')) return 'fa-map-location-dot';
                                                            if (t.includes('shop') || t.includes('showroom') || t.includes('sco')) return 'fa-store';
                                                            if (t.includes('house') || t.includes('apartment')) return 'fa-home';
                                                            if (t.includes('school') || t.includes('institutional')) return 'fa-university';
                                                            return 'fa-building';
                                                        })()}`} style={{ color: '#10b981', fontSize: '1rem' }}></i>
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                                                            <div>
                                                                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a' }}>
                                                                    {(prop.unitNumber || prop.unitNo) && `Unit #${prop.unitNumber || prop.unitNo} • `}{prop.type}
                                                                </div>
                                                                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>{renderLookup(prop.location) || renderLookup(prop.area)}</div>
                                                            </div>
                                                            <span style={{
                                                                background: '#ecfdf5',
                                                                color: '#059669',
                                                                fontSize: '0.5rem',
                                                                padding: '2px 6px',
                                                                borderRadius: '4px',
                                                                fontWeight: 900,
                                                                border: '1px solid #d1fae5',
                                                                textTransform: 'uppercase',
                                                                whiteSpace: 'nowrap'
                                                            }}>
                                                                OWNED
                                                            </span>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
                                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                                <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700 }}>{prop.size || 'Size N/A'}</span>
                                                                <span style={{ width: '3px', height: '3px', background: '#e2e8f0', borderRadius: '50%' }}></span>
                                                                <span style={{ fontSize: '0.65rem', color: prop.status === 'Active' ? '#10b981' : '#ef4444', fontWeight: 800 }}>{renderLookup(prop.status)}</span>
                                                            </div>
                                                            <button className="btn-outline" style={{ padding: '4px 10px', fontSize: '0.6rem', borderRadius: '6px' }}>View Record</button>
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
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setIsDocumentModalOpen(true);
                                        }}
                                        style={{
                                            background: '#4f46e5',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '50%',
                                            width: '24px',
                                            height: '24px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            boxShadow: '0 2px 4px rgba(79, 70, 229, 0.2)',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                    >
                                        <i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i>
                                    </button>
                                    <i className={`fas fa-chevron-${expandedSections.includes('documents') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#4f46e5' }}></i>
                                </div>

                            </div>
                            {expandedSections.includes('documents') && (
                                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {contactDocuments.length > 0 ? (
                                        contactDocuments.map((doc, idx) => (
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





                        {/* 4. Automation & Sequences */}
                        <div className="glass-card" style={{ borderRadius: '16px', border: '1px solid rgba(59, 130, 246, 0.2)', boxShadow: '0 8px 32px 0 rgba(59, 130, 246, 0.05)' }}>
                            <div style={{ padding: '14px 20px', background: 'rgba(59, 130, 246, 0.05)', borderBottom: '1px solid rgba(59, 130, 246, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <i className="fas fa-robot"></i> Automation & Sequences
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <button
                                        onClick={() => setIsEnrollModalOpen(true)}
                                        style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '0.6rem', fontWeight: 900, cursor: 'pointer' }}
                                    >
                                        <i className="fas fa-plus"></i> ENROLL
                                    </button>
                                </div>
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

                        {/* 5. History Section (Moved to Bottom) */}
                        <div className="glass-card" style={{ borderRadius: '16px', border: '1px solid rgba(148, 163, 184, 0.3)', boxShadow: '0 8px 32px 0 rgba(148, 163, 184, 0.05)' }}>
                            <div onClick={() => toggleSection('history')} style={{ padding: '14px 20px', background: 'rgba(148, 163, 184, 0.05)', borderBottom: '1px solid rgba(148, 163, 184, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <i className="fas fa-history"></i> History (Previously Owned)
                                </span>
                                <i className={`fas fa-chevron-${expandedSections.includes('history') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#64748b' }}></i>
                            </div>
                            {expandedSections.includes('history') && (
                                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {historyProperties.length > 0 ? (
                                        historyProperties.map((prop, idx) => (
                                            <div key={idx} style={{
                                                padding: '10px 14px',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '12px',
                                                background: '#f8fafc',
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                                                position: 'relative',
                                                opacity: 0.85
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                                    <div style={{
                                                        width: '40px', height: '40px',
                                                        background: '#f1f5f9',
                                                        border: '1px solid #e2e8f0',
                                                        borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                                    }}>
                                                        <i className={`fas ${(() => {
                                                            const t = prop.type?.toLowerCase() || '';
                                                            if (t.includes('plot')) return 'fa-map-location-dot';
                                                            if (t.includes('shop') || t.includes('showroom') || t.includes('sco')) return 'fa-store';
                                                            if (t.includes('house') || t.includes('apartment')) return 'fa-home';
                                                            if (t.includes('school') || t.includes('institutional')) return 'fa-university';
                                                            return 'fa-building';
                                                        })()}`} style={{ color: '#94a3b8', fontSize: '1rem' }}></i>
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                                                            <div>
                                                                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#475569', textDecoration: 'line-through' }}>
                                                                    {(prop.unitNumber || prop.unitNo) && `Unit #${prop.unitNumber || prop.unitNo} • `}{prop.type}
                                                                </div>
                                                                <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>{prop.location || prop.area}</div>
                                                            </div>
                                                            <span style={{
                                                                background: '#f1f5f9',
                                                                color: '#64748b',
                                                                fontSize: '0.5rem',
                                                                padding: '2px 6px',
                                                                borderRadius: '4px',
                                                                fontWeight: 900,
                                                                border: '1px solid #e2e8f0',
                                                                textTransform: 'uppercase',
                                                                whiteSpace: 'nowrap'
                                                            }}>
                                                                Sold / Transferred
                                                            </span>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
                                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                                <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700 }}>{prop.size}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', padding: '10px' }}>No previous property history found.</div>
                                    )}
                                </div>
                            )}
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

                {/* ACTION MODALS */}
                {
                    isCallModalOpen && (
                        <CallModal
                            isOpen={isCallModalOpen}
                            onClose={() => setIsCallModalOpen(false)}
                            lead={{ _id: contactId, name: contact?.name, phone: contact?.mobile }}
                        />
                    )
                }

                {
                    isEmailModalOpen && (
                        <ComposeEmailModal
                            isOpen={isEmailModalOpen}
                            onClose={() => setIsEmailModalOpen(false)}
                            recipients={[{ id: contact?._id, name: contact?.name, email: contact?.email }]}
                            onSend={(data) => {
                                handleAutoSave('Email', data);
                            }}
                        />)
                }

                {
                    isTagsModalOpen && (
                        <ManageTagsModal
                            isOpen={isTagsModalOpen}
                            onClose={() => setIsTagsModalOpen(false)}
                            itemType={recordType === 'lead' ? 'lead' : 'contact'}
                            itemId={contactId}
                            currentTags={contact?.intent_tags || []}
                            onSave={(newTags) => {
                                showNotification('Tags updated successfully');
                                setIsTagsModalOpen(false);
                            }}
                        />
                    )
                }

                {isAssignModalOpen && (
                    <AssignContactModal
                        isOpen={isAssignModalOpen}
                        onClose={() => setIsAssignModalOpen(false)}
                        contacts={[contact]}
                        onUpdate={() => {
                            // Refetch contact data
                            api.get(`contacts/${contactId}`).then(res => {
                                if (res.data.success) setContact(res.data.data);
                            });
                        }}
                    />
                )}

                {isDocumentModalOpen && (
                    <DocumentUploadModal
                        isOpen={isDocumentModalOpen}
                        onClose={() => setIsDocumentModalOpen(false)}
                        ownerId={contact?._id}
                        ownerType={recordType === 'lead' ? 'Lead' : 'Contact'}
                        ownerName={contact?.name}
                        onUpdate={() => {
                            // Refetch documents
                            api.get(`contacts/${contactId}`).then(res => {
                                if (res.data.success) {
                                    setContactDocuments(res.data.data.documents || []);
                                }
                            });
                        }}
                    />
                )}

                {isInventoryModalOpen && (
                    <AddInventoryModal
                        isOpen={isInventoryModalOpen}
                        onClose={() => setIsInventoryModalOpen(false)}
                        onSave={(newInventory) => {
                            setIsInventoryModalOpen(false);
                            showNotification('Inventory added successfully');
                            // Refetch owned properties
                            api.get(`contacts/${contactId}`).then(res => {
                                if (res.data.success) {
                                    setContact(res.data.data);
                                    // The owned properties are derived from recordData.ownedProperties in fetchContactData
                                    // Let's trigger a full fetch
                                    window.location.reload(); // Quickest way to ensure all linked data is refreshed
                                }
                            });
                        }}
                    />
                )}

                {isAddLeadModalOpen && (
                    <AddLeadModal
                        isOpen={isAddLeadModalOpen}
                        onClose={() => setIsAddLeadModalOpen(false)}
                        contactData={contact}
                        onAdd={(newLead) => {
                            setIsAddLeadModalOpen(false);
                            showNotification('Lead created successfully');
                            // Refetch deals if needed
                        }}
                    />
                )}

                {isAddDealModalOpen && (
                    <AddDealModal
                        isOpen={isAddDealModalOpen}
                        title="Create Deal"
                        restrictToProperties={ownedProperties}
                        onClose={() => setIsAddDealModalOpen(false)}
                        deal={{
                            associatedContact: {
                                _id: contact?._id,
                                name: contact?.name,
                                phone: contact?.mobile,
                                email: contact?.email
                            }
                        }}
                        onSave={(newDeal) => {
                            setIsAddDealModalOpen(false);
                            showNotification('Deal created successfully');
                            // Refetch deals
                            api.get(`leads?contactId=${contactId}`).then(res => {
                                if (res.data.success) {
                                    setActiveDeals(res.data.data);
                                }
                            });
                        }}
                    />
                )}
                {isMessageModalOpen && (
                    <SendMessageModal
                        isOpen={isMessageModalOpen}
                        onClose={() => setIsMessageModalOpen(false)}
                        initialRecipients={contact ? [{
                            ...contact,
                            name: contact.name,
                            phone: contact.mobile || contact.phone
                        }] : []}
                        onSend={(data, res) => {
                            showNotification(res?.message || 'Message sent successfully!');
                            setIsMessageModalOpen(false);
                        }}
                    />
                )}
                {isActivityModalOpen && (
                    <CreateActivityModal
                        isOpen={isActivityModalOpen}
                        onClose={() => setIsActivityModalOpen(false)}
                        onSave={(newActivity) => {
                            showNotification('Activity created successfully!');
                            fetchUnifiedTimeline(contactId, recordType);
                        }}
                        initialData={{
                            relatedTo: [{
                                id: contact?._id,
                                name: contact?.name,
                                mobile: contact?.mobile,
                                model: recordType === 'lead' ? 'Lead' : 'Contact'
                            }]
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default ContactDetail;
