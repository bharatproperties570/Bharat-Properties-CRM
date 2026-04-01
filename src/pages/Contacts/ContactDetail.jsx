import React, { useState, useEffect } from 'react';
import { api, enrichmentAPI } from '../../utils/api';
import { renderValue } from '../../utils/renderUtils';
const inventoryData = [];
import { getInitials } from '../../utils/helpers';
import LeadConversionService from '../../services/LeadConversionService';
// import { calculateLeadScore, getLeadTemperature } from '../../utils/leadScoring';
import { usePropertyConfig } from '../../context/PropertyConfigContext';
import { useSequences } from '../../context/SequenceContext';
import { activitiesAPI } from '../../utils/api';
import EnrollSequenceModal from '../../components/EnrollSequenceModal';
import { useCall } from '../../context/CallContext';
import ComposeEmailModal from '../Communication/components/ComposeEmailModal';
import ManageTagsModal from '../../components/ManageTagsModal';
import AssignContactModal from '../../components/AssignContactModal';
import DocumentUploadModal from '../../components/DocumentUploadModal';
import '../../index.css';
import AddInventoryModal from '../../components/AddInventoryModal';
import AddLeadModal from '../../components/AddLeadModal';
import AddDealModal from '../../components/AddDealModal';
import CreateActivityModal from '../../components/CreateActivityModal';
import { parseBudget, parseSizeSqYard, calculateMatch } from '../../utils/matchingLogic';



import EnterprisePipeline from '../../components/EnterprisePipeline';
import UnifiedActivitySection from '../../components/Activities/UnifiedActivitySection';
import { useContactIntelligence } from '../../hooks/useContactIntelligence';
import ContactDetailHeader from '../../components/ContactDetail/ContactDetailHeader';
import ContactCoreInfo from '../../components/ContactDetail/ContactCoreInfo';
import ContactPreferences from '../../components/ContactDetail/ContactPreferences';
import ContactAIIntelligence from '../../components/ContactDetail/ContactAIIntelligence';
import ContactRelatedDeals from '../../components/ContactDetail/ContactRelatedDeals';
import ContactOwnedProperties from '../../components/ContactDetail/ContactOwnedProperties';
import ContactDocuments from '../../components/ContactDetail/ContactDocuments';
import ContactAutomation from '../../components/ContactDetail/ContactAutomation';
import ContactHistory from '../../components/ContactDetail/ContactHistory';

const ContactDetail = ({ contactId, onBack }) => {
    const { scoringAttributes, activityMasterFields, scoreBands, getLookupValue } = usePropertyConfig(); // Inject Context
    const { sequences, enrollments, updateEnrollmentStatus } = useSequences();
    const [contact, setContact] = useState(null);
    const [expandedSections, setExpandedSections] = useState(['core', 'professional', 'location', 'financial', 'education', 'personal', 'pref', 'journey', 'negotiation', 'ai', 'ownership', 'documents', 'matching', 'probability']);
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [toast, setToast] = useState(null);
    const [dealStatus, setDealStatus] = useState('active'); // 'active' or 'lost'
    const [recordType, setRecordType] = useState('contact'); // 'contact' or 'lead'
    // const [pendingTasks, setPendingTasks] = useState([{ id: Date.now(), subject: '', dueDate: '', reminder: false }]);
    // const [composerContent, setComposerContent] = useState('');
    const { startCall } = useCall();
    const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
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

    // New states for backend data
    const [ownedProperties, setOwnedProperties] = useState([]);
    const [historyProperties, setHistoryProperties] = useState([]);
    const [activeDeals, setActiveDeals] = useState([]);
    const [contactDocuments, setContactDocuments] = useState([]);
    const [matchedDeals, setMatchedDeals] = useState([]);
    const [loadingMatches, setLoadingMatches] = useState(false);
    const [liveScoreData, setLiveScoreData] = useState({ score: 0, label: 'Cold', color: '#94a3b8', tempClass: 'cold' });

    const showNotification = (message) => {
        setToast(message);
        setTimeout(() => setToast(null), 3000);
    };

    const aiStats = useContactIntelligence({
        contact,
        activities: unifiedTimeline,
        propertyConfig: { scoringAttributes, activityMasterFields, scoreBands, getLookupValue },
        liveScoreData
    });

    const fetchUnifiedTimeline = React.useCallback(async (id, type) => {
        try {
            const res = await api.get(`activities/unified/${type}/${id}`);
            if (res.data && res.data.success) {
                const timeline = res.data.data || [];
                setUnifiedTimeline(timeline);
            }
        } catch (error) {
            console.error("Error fetching unified timeline:", error);
        }
    }, []);

    const handleCallComplete = React.useCallback(async (summary) => {
        try {
            await activitiesAPI.create({
                type: 'Call',
                subject: `Call with ${contact?.fullName || contact?.name}`,
                status: 'Completed',
                entityId: contactId,
                entityType: recordType.charAt(0).toUpperCase() + recordType.slice(1),
                participants: summary.participants,
                relatedTo: summary.relatedTo,
                description: `Call Outcome: ${summary.outcome}. Result: ${summary.result}. Notes: ${summary.notes}`,
                details: {
                    direction: 'Outgoing',
                    duration: summary.duration,
                    outcome: summary.outcome,
                    result: summary.result,
                    notes: summary.notes,
                    platform: summary.type
                },
                dueDate: new Date()
            });
            showNotification('Call activity logged successfully');
            fetchUnifiedTimeline(contactId, recordType);
        } catch (error) {
            console.error('Failed to log call activity:', error);
            showNotification('Failed to log call activity');
        }
    }, [contact, contactId, recordType, fetchUnifiedTimeline]);

    const handleAutoSave = (field) => {
        showNotification(`${field} auto-saved!`);
        // In real app: save to backend
    };

    const renderLookup = React.useCallback((field, fallback = '-') => {
        if (!field) return fallback;
        
        // 1. Handle objects (already populated)
        if (typeof field === 'object') {
            return field.lookup_value || field.name || field.projectName || field.title || field.label || fallback;
        }
        
        // 2. Handle ID strings (needs resolution)
        if (typeof field === 'string' && field.match(/^[0-9a-fA-F]{24}$/) && getLookupValue) {
            const resolved = getLookupValue(null, field);
            return resolved || fallback; // Return name or fallback, NEVER the raw ID
        }

        return typeof field === 'string' ? field : fallback;
    }, [getLookupValue]);


    // handleToggleStar removed as it is now handled by UnifiedActivitySection

    // handleSaveActivity removed as it is now handled by UnifiedActivitySection or modals


    const fetchRelatedData = React.useCallback(async (id, type, recordData) => {
        try {
            // Fetch Documents
            if (recordData.documents && Array.isArray(recordData.documents)) {
                setContactDocuments(recordData.documents);
            }

            // Fetch Deals where contact is involved
            const dealsRes = await api.get(`deals?contactId=${id}`);
            console.log(`[DEBUG] Deals for ${id}:`, dealsRes.data);
            if (dealsRes.data && dealsRes.data.success) {
                const deals = (dealsRes.data.records || dealsRes.data.data) || [];
                const normalize = (phone) => phone?.toString()?.replace(/\D/g, '')?.slice(-10);
                const contactPhone = normalize(recordData?.mobile || recordData?.phones?.[0]?.number);
                const contactEmail = recordData?.email || recordData?.emails?.[0]?.address;

                setActiveDeals(deals.filter(d => {
                    // Filter out closed/cancelled deals for the "Active" section
                    const closedStages = ['lost', 'won', 'Cancelled', 'Closed Won', 'Closed Lost'];
                    if (closedStages.some(s => d.stage?.toLowerCase()?.includes(s.toLowerCase()))) return false;

                    // Formal ID matches
                    const isOwnerFormal = (d.owner && (d.owner._id === id || d.owner === id)) ||
                        (d.partyStructure?.owner && (d.partyStructure.owner._id === id || d.partyStructure.owner === id));
                    const isAssociateFormal = d.associatedContact && (d.associatedContact._id === id || d.associatedContact === id);
                    const isBuyerFormal = d.partyStructure?.buyer && (d.partyStructure.buyer._id === id || d.partyStructure.buyer === id);
                    
                    if (isOwnerFormal || isAssociateFormal || isBuyerFormal) return true;

                    // Heuristic fallback for legacy/unlinked data
                    const dOwnerPhone = normalize(d.owner?.phone || d.owner);
                    const dBuyerPhone = normalize(d.partyStructure?.buyer?.phone || d.partyStructure?.buyer);
                    const dOwnerEmail = d.owner?.email || (typeof d.owner === 'string' && d.owner.includes('@') ? d.owner : null);
                    const dBuyerEmail = d.partyStructure?.buyer?.email || (typeof d.partyStructure?.buyer === 'string' && d.partyStructure.buyer.includes('@') ? d.partyStructure.buyer : null);

                    const phoneMatch = contactPhone && (dOwnerPhone === contactPhone || dBuyerPhone === contactPhone);
                    const emailMatch = contactEmail && (dOwnerEmail === contactEmail || dBuyerEmail === contactEmail);
                    
                    return phoneMatch || emailMatch;
                }));
            }

            // Fetch Inventory where contact is owner or associate
            const invRes = await api.get(`inventory`, { params: { contactId: id, limit: 100 } });
            console.log(`[DEBUG] Inventory for ${id}:`, invRes.data);
            if (invRes.data && invRes.data.success) {
                const inventory = (invRes.data.records || invRes.data.data) || [];
                const owned = [];
                const history = [];
                const normalize = (phone) => phone?.toString()?.replace(/\D/g, '')?.slice(-10);
                const contactPhone = normalize(recordData?.mobile || recordData?.phones?.[0]?.number);
                const contactEmail = recordData?.email || recordData?.emails?.[0]?.address;

                inventory.forEach(item => {
                    const prevOwnerPhone = normalize(item.previousOwnerPhone);
                    
                    // Check main owner fields (legacy/history)
                    if (contactPhone && prevOwnerPhone === contactPhone) {
                        history.push(item);
                    }

                    // Check formal owner link
                    const isFormalOwner = item.owners?.some(o => (o._id === id || o === id));
                    if (isFormalOwner) {
                        owned.push({ ...item, matchRole: 'OWNER' });
                        return;
                    }

                    // Check formal associate link
                    const associateMatch = item.associates?.find(a => {
                        const aContact = a.contact || a;
                        return (aContact._id === id || aContact === id);
                    });
                    if (associateMatch) {
                        owned.push({ 
                            ...item, 
                            matchRole: 'ASSOCIATE', 
                            relationship: associateMatch.relationship || 'Associate' 
                        });
                        return;
                    }

                    // Fallback to phone/email heuristic if formal link is missing (for legacy data)
                    const ownerPhone = normalize(item.ownerPhone);
                    const ownerEmail = item.ownerEmail;
                    
                    const phoneMatch = contactPhone && ownerPhone === contactPhone;
                    const emailMatch = contactEmail && ownerEmail === contactEmail;
                    
                    if (phoneMatch || emailMatch) {
                        owned.push({ ...item, matchRole: 'OWNER' });
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
                        setMatchedDeals(matches.slice(0, 5));
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
    }, [renderLookup]);

    const fetchLiveScore = React.useCallback(async (id) => {
        try {
            const res = await api.get(`stage-engine/leads/scores?leadId=${id}`);
            if (res.data && res.data.success) {
                // More robust lookup: find any key that matches or just take the first entry if filtering by leadId
                const scores = res.data.scores || {};
                const live = scores[id] || Object.values(scores)[0];

                if (live) {
                    setLiveScoreData({
                        score: Math.round(live.score || 0),
                        label: live.label || 'Unknown',
                        color: live.color || '#94a3b8',
                        tempClass: live.tempClass || 'cold'
                    });
                }
            }
        } catch (err) {
            console.error("Error fetching live score:", err);
        }
    }, []);
    const fetchData = React.useCallback(async () => {
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

                // Fetch live score for leads
                if (finalType === 'lead') {
                    fetchLiveScore(contactId);
                }

                // Fetch related data
                fetchRelatedData(contactId, finalType, data);
            } else {
                setContact(null);
            }
        } catch (error) {
            // Fallback
            try {
                const leadRes = await api.get(`leads/${contactId}`);
                if (leadRes.data && leadRes.data.success) {
                    const leadData = leadRes.data.data;
                    setContact(leadData);
                    setRecordType('lead');
                    fetchUnifiedTimeline(contactId, 'lead');
                    fetchRelatedData(contactId, 'lead', leadData);
                } else {
                    setContact(null);
                }
            } catch (e) {
                console.error("Error fetching record details:", e);
                setContact(null);
            }
        }
    }, [contactId, fetchRelatedData, fetchUnifiedTimeline, fetchLiveScore, recordType]);

    useEffect(() => {
        fetchData();

        // ── LIVE REFRESH LISTENER ───────────────────────────────────────────
        // Triggered by ActivityOutcomeModal after stage updates
        const handleRefresh = (e) => {
            const { entityId } = e.detail;
            if (entityId === contactId) {
                console.info('[ContactDetail] Activity completed event caught. Refreshing live stage...');
                fetchData();
                fetchLiveScore(contactId);
            }
        };

        window.addEventListener('activity-completed', handleRefresh);
        return () => window.removeEventListener('activity-completed', handleRefresh);
    }, [contactId, fetchData, fetchLiveScore]);

    const toggleSection = (section) => {
        setExpandedSections(prev =>
            prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]
        );
    };

    if (!contact) {
        return (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-gray)', color: 'var(--text-muted)' }}>
                <i className="fas fa-search-plus" style={{ fontSize: '3rem', marginBottom: '1.5rem', color: 'var(--primary-color)', opacity: 0.5 }}></i>
                <h2 style={{ color: 'var(--text-main)', marginBottom: '0.5rem' }}>Record Not Found</h2>
                <p>No contact or lead found with ID: {contactId}</p>
                <button onClick={() => onBack(recordType)} className="btn-primary" style={{ marginTop: '20px' }}>Back to Sales Pipeline</button>
            </div>
        );
    }

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
            <ContactDetailHeader 
                contact={contact}
                recordType={recordType}
                onBack={onBack}
                liveScoreData={liveScoreData}
                aiStats={aiStats}
                dealStatus={dealStatus}
                setDealStatus={setDealStatus}
                showNotification={showNotification}
                setIsCallModalOpen={(val) => {
                    if (val) startCall(contact, { entityId: contactId, entityType: recordType.charAt(0).toUpperCase() + recordType.slice(1) }, handleCallComplete);
                }}
                setIsMessageModalOpen={setIsMessageModalOpen}
                setIsEmailModalOpen={setIsEmailModalOpen}
                setShowMoreMenu={setShowMoreMenu}
                showMoreMenu={showMoreMenu}
                setIsTagsModalOpen={setIsTagsModalOpen}
                setIsAssignModalOpen={setIsAssignModalOpen}
                setIsActivityModalOpen={setIsActivityModalOpen}
                enrichmentAPI={enrichmentAPI}
                renderLookup={renderLookup}
                getInitials={getInitials}
            />

            {/* MAIN CONTENT AREA - STACKED LAYOUT */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* 0. Full Width Enterprise Lead Pipeline */}
                {recordType === 'lead' && (
                    <div className="no-scrollbar" style={{
                        width: '100%',
                        padding: '1.5rem 2rem 0.5rem 2rem',
                        borderBottom: '1px solid #e2e8f0',
                        background: '#fff',
                        position: 'relative'
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
                        <ContactCoreInfo 
                            contact={contact}
                            recordType={recordType}
                            expandedSections={expandedSections}
                            toggleSection={toggleSection}
                            handleAutoSave={handleAutoSave}
                            renderLookup={renderLookup}
                        />

                        {/* 2. Property Preferences */}
                        {recordType === 'lead' && (
                            <ContactPreferences 
                                contact={contact}
                                aiStats={aiStats}
                                expandedSections={expandedSections}
                                toggleSection={toggleSection}
                                renderLookup={renderLookup}
                            />
                        )}

                        {/* 3. Unified Activities Section */}
                        <div className="glass-card" style={{ borderRadius: '16px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <UnifiedActivitySection
                                entityId={contactId}
                                entityType={recordType.charAt(0).toUpperCase() + recordType.slice(1)}
                                entityData={contact}
                                onActivitySaved={() => {
                                    fetchUnifiedTimeline(contactId, recordType);
                                    fetchLiveScore(contactId);
                                }}
                            />
                        </div>

                    </div>
{/* End detail-left-col */}

                    {/* RIGHT COLUMN - Secondary Dashboard */}
                    <div className="detail-right-col no-scrollbar" style={{
                        flex: '1',
                        background: '#fff',
                        padding: '1.5rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1.5rem',
                        borderLeft: '1px solid #e2e8f0',
                        height: '100%',
                        overflowY: 'auto'
                    }}>
                        {/* AI Intelligence & Probability Sections */}
                        <ContactAIIntelligence 
                            contact={contact}
                            aiStats={aiStats}
                            recordType={recordType}
                            dealStatus={dealStatus}
                            expandedSections={expandedSections}
                            toggleSection={toggleSection}
                            renderLookup={renderLookup}
                            showNotification={showNotification}
                        />

                        <ContactRelatedDeals
                            contact={contact}
                            recordType={recordType}
                            expandedSections={expandedSections}
                            toggleSection={toggleSection}
                            matchedDeals={matchedDeals}
                            loadingMatches={loadingMatches}
                            renderValue={renderValue}
                            showNotification={showNotification}
                            activeDeals={activeDeals}
                            setIsAddDealModalOpen={setIsAddDealModalOpen}
                            renderLookup={getLookupValue}
                        />

                        <ContactOwnedProperties
                            expandedSections={expandedSections}
                            toggleSection={toggleSection}
                            ownedProperties={ownedProperties}
                            setIsInventoryModalOpen={setIsInventoryModalOpen}
                            renderValue={renderValue}
                            renderLookup={getLookupValue}
                        />




                        <ContactDocuments
                            expandedSections={expandedSections}
                            toggleSection={toggleSection}
                            contactDocuments={contactDocuments}
                            setIsDocumentModalOpen={setIsDocumentModalOpen}
                            renderLookup={getLookupValue}
                        />





                        <ContactAutomation
                            contact={contact}
                            sequences={sequences}
                            enrollments={enrollments}
                            updateEnrollmentStatus={updateEnrollmentStatus}
                            setIsEnrollModalOpen={setIsEnrollModalOpen}
                        />

                        <ContactHistory
                            expandedSections={expandedSections}
                            toggleSection={toggleSection}
                            historyProperties={historyProperties}
                            renderValue={renderValue}
                        />
                    </div>
                </div>

                <EnrollSequenceModal
                    isOpen={isEnrollModalOpen}
                    onClose={() => setIsEnrollModalOpen(false)}
                    contactId={contactId}
                    sequences={sequences}
                    enrollments={enrollments}
                    onEnroll={(seqId) => {
                        // handleEnroll(seqId);
                        setIsEnrollModalOpen(false);
                    }}
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
                            onSave={() => {
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
                        onSave={() => {
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
                        onAdd={() => {
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
                        onSave={() => {
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
                        onSend={async (data) => {
                            try {
                                await activitiesAPI.create({
                                    type: 'Messaging',
                                    subject: `Message to ${contact?.fullName || contact?.name}`,
                                    status: 'Completed',
                                    entityId: contactId,
                                    entityType: recordType.charAt(0).toUpperCase() + recordType.slice(1),
                                    participants: [{ id: contactId, name: contact?.fullName || contact?.name, model: recordType.charAt(0).toUpperCase() + recordType.slice(1) }],
                                    relatedTo: [{ id: contactId, name: contact?.fullName || contact?.name, model: recordType.charAt(0).toUpperCase() + recordType.slice(1) }],
                                    description: `Message body: ${data.body}`,
                                    details: {
                                        direction: 'Outgoing',
                                        platform: data.channel,
                                        content: data.body
                                    },
                                    dueDate: new Date()
                                });
                                showNotification('Message activity logged successfully');
                                fetchUnifiedTimeline(contactId, recordType);
                            } catch (error) {
                                console.error('Failed to log message activity:', error);
                            }
                            setIsMessageModalOpen(false);
                        }}
                        initialRecipients={contact ? [{
                            ...contact,
                            name: contact.fullName || contact.name,
                            phone: contact.mobile || contact.phone
                        }] : []}
                    />
                )}
                {isActivityModalOpen && (
                    <CreateActivityModal
                        isOpen={isActivityModalOpen}
                        onClose={() => setIsActivityModalOpen(false)}
                        onSave={() => {
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
        </div >
    );
};

export default ContactDetail;
