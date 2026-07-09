import { useTheme } from '../../context/ThemeContext';

import React, { useState, useEffect } from 'react';
import { api, enrichmentAPI } from '../../utils/api';
import { renderValue } from '../../utils/renderUtils';
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
import SendMessageModal from '../../components/SendMessageModal';
import CreateActivityModal from '../../components/CreateActivityModal';




import EnterprisePipeline from '../../components/EnterprisePipeline';
import UnifiedActivitySection from '../../components/Activities/UnifiedActivitySection';
import { useContactIntelligence } from '../../hooks/useContactIntelligence';
import ContactDetailHeader from '../../components/ContactDetail/ContactDetailHeader';
import ContactCoreInfo from '../../components/ContactDetail/ContactCoreInfo';
import ContactPreferences from '../../components/ContactDetail/ContactPreferences';
import ContactPropertyRequirement from '../../components/ContactDetail/ContactPropertyRequirement';
import ContactAIIntelligence from '../../components/ContactDetail/ContactAIIntelligence';
import ContactRelatedDeals from '../../components/ContactDetail/ContactRelatedDeals';
import ContactOwnedProperties from '../../components/ContactDetail/ContactOwnedProperties';
import ContactDocuments from '../../components/ContactDetail/ContactDocuments';
import ContactAutomation from '../../components/ContactDetail/ContactAutomation';
import ContactHistory from '../../components/ContactDetail/ContactHistory';
import ContactBookings from '../../components/ContactDetail/ContactBookings';

const ContactDetail = ({ contactId, onBack, onNavigate }) => {
    const { isDark } = useTheme();
    const { scoringAttributes, activityMasterFields, scoreBands, getLookupValue } = usePropertyConfig(); // Inject Context
    const { sequences, enrollments, updateEnrollmentStatus } = useSequences();
    const [contact, setContact] = useState(null);
    const [expandedSections, setExpandedSections] = useState(['core', 'professional', 'location', 'financial', 'education', 'personal', 'pref', 'property_req', 'journey', 'negotiation', 'ai', 'ownership', 'documents', 'matching', 'probability']);
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
    const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'activities', 'deals', 'inventory'
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);



    const [unifiedTimeline, setUnifiedTimeline] = useState([]);

    // New states for backend data
    const [ownedProperties, setOwnedProperties] = useState([]);
    const [historyProperties, setHistoryProperties] = useState([]);
    const [activeDeals, setActiveDeals] = useState([]);
    const [contactDocuments, setContactDocuments] = useState([]);
    const [matchedDeals, setMatchedDeals] = useState([]);
    const [loadingMatches, setLoadingMatches] = useState(false);
    const [contactBookings, setContactBookings] = useState([]);
    // Live score state with sensible defaults; will be populated for lead records via live API
    const [liveScoreData, setLiveScoreData] = useState({ score: 0, label: 'Cold', color: 'var(--text-muted)', tempClass: 'cold' });

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

            // Fetch Bookings where contact is involved
            try {
                const bookingsRes = await api.get(`bookings?contactId=${id}`);
                if (bookingsRes.data && bookingsRes.data.success) {
                    setContactBookings(bookingsRes.data.data || []);
                }
            } catch (err) {
                console.error("Error fetching bookings:", err);
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
                    // ── Rule: Show deals where contact/lead is the OWNER or ASSOCIATE.
                    // Sending a quotation to a lead does NOT qualify — buyers/quotation recipients excluded.

                    // 1. Filter out closed/cancelled deals
                    const closedStages = ['lost', 'won', 'Cancelled', 'Closed Won', 'Closed Lost'];
                    if (closedStages.some(s => d.stage?.toLowerCase()?.includes(s.toLowerCase()))) return false;

                    const matchIdentity = (entity) => {
                        if (!entity) return false;
                        const entityId = entity._id || entity;
                        if (entityId === id) return true;

                        // Smart match by phone/email for lead <-> contact cross linking
                        if (typeof entity === 'object') {
                            const phonesMatch = Array.isArray(entity.phones) && entity.phones.some(p => normalize(p.number) === contactPhone);
                            const emailsMatch = Array.isArray(entity.emails) && entity.emails.some(e => e.address === contactEmail);
                            return !!((contactPhone && phonesMatch) || (contactEmail && emailsMatch));
                        }

                        // If it's a legacy string (phone or email)
                        const strVal = String(entity);
                        return !!((contactPhone && normalize(strVal) === contactPhone) || (contactEmail && strVal === contactEmail));
                    };

                    // 2a. Formal OWNER match (d.owner or partyStructure.owner)
                    const isOwnerFormal = matchIdentity(d.owner) || matchIdentity(d.partyStructure?.owner);

                    // 2b. Formal ASSOCIATE match — only d.associates[] which is set via "Add Owner" form.
                    //     d.associatedContact is auto-set when a quotation is sent — do NOT use it here.
                    const isAssociateFormal =
                        Array.isArray(d.associates) && d.associates.some(a => matchIdentity(a.contact || a));

                    if (isOwnerFormal || isAssociateFormal) return true;

                    // 3. Heuristic fallback for legacy/unlinked data — match owner phone/email only (NOT buyer)
                    let dOwnerPhone = null;
                    let dOwnerEmail = null;
                    if (d.owner && typeof d.owner === 'object') {
                        if (Array.isArray(d.owner.phones) && d.owner.phones.length > 0) {
                            dOwnerPhone = normalize(d.owner.phones[0]?.number);
                        }
                        if (Array.isArray(d.owner.emails) && d.owner.emails.length > 0) {
                            dOwnerEmail = d.owner.emails[0]?.address;
                        }
                    } else if (typeof d.owner === 'string') {
                        if (d.owner.includes('@')) {
                            dOwnerEmail = d.owner;
                        } else {
                            dOwnerPhone = normalize(d.owner);
                        }
                    }

                    const phoneMatch = contactPhone && dOwnerPhone === contactPhone;
                    const emailMatch = contactEmail && dOwnerEmail === contactEmail;

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
                    
                    // 🚀 [ENTERPRISE] Check ownerHistory array for true removal tracking
                    const wasRemoved = item.ownerHistory && Array.isArray(item.ownerHistory) && item.ownerHistory.some(h => 
                        (h.contactId && (h.contactId._id || h.contactId).toString() === id.toString()) && 
                        h.type === 'Removed' && h.role === 'Owner'
                    );

                    // Check main owner fields (legacy + new tracking)
                    if (wasRemoved || (contactPhone && prevOwnerPhone === contactPhone)) {
                        history.push(item);
                    }

                    const matchIdentity = (entity) => {
                        if (!entity) return false;
                        const entityId = entity._id || entity;
                        if (entityId === id) return true;

                        // Smart match by phone/email for lead <-> contact cross linking
                        if (typeof entity === 'object') {
                            const phonesMatch = Array.isArray(entity.phones) && entity.phones.some(p => normalize(p.number) === contactPhone);
                            const emailsMatch = Array.isArray(entity.emails) && entity.emails.some(e => e.address === contactEmail);
                            return !!((contactPhone && phonesMatch) || (contactEmail && emailsMatch));
                        }

                        // If it's a legacy string (phone or email)
                        const strVal = String(entity);
                        return !!((contactPhone && normalize(strVal) === contactPhone) || (contactEmail && strVal === contactEmail));
                    };

                    // Check formal owner link
                    const isFormalOwner = item.owners?.some(o => matchIdentity(o));
                    if (isFormalOwner) {
                        owned.push({ ...item, matchRole: 'OWNER' });
                        return;
                    }

                    // Check formal associate link
                    const associateMatch = item.associates?.find(a => matchIdentity(a.contact || a));
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
                    let budgetFlexibility = 10;
                    let sizeFlexibility = 10;
                    let weights = { location: 30, type: 20, budget: 25, size: 25 };
                    
                    const savedWeights = localStorage.getItem(`match_weights_${id}`);
                    const savedFlex = localStorage.getItem(`match_flex_${id}`);
                    if (savedWeights) {
                        try {
                            weights = JSON.parse(savedWeights);
                        } catch (e) {
                            console.warn("Failed to parse weights settings:", e);
                        }
                    }
                    if (savedFlex) {
                        try { 
                            const { budget, size } = JSON.parse(savedFlex);
                            budgetFlexibility = budget;
                            sizeFlexibility = size;
                        } catch (e) {
                            console.warn("Failed to parse flexibility settings:", e);
                        }
                    }

                    const matchRes = await api.get('deals/match', { 
                        params: { 
                            leadId: id, 
                            budgetFlexibility, 
                            sizeFlexibility, 
                            weights: JSON.stringify(weights),
                            showOtherCities: false
                        } 
                    });

                    if (matchRes.data && matchRes.data.success) {
                        const rawMatches = matchRes.data.data || [];
                        const mappedMatches = rawMatches.map(item => {
                            const subCatVal = renderLookup(item.subCategory, null) || renderLookup(item.inventoryId?.subCategory, null) || renderLookup(item.category, null) || renderLookup(item.inventoryId?.category, null) || 'Unit';
                            const locationVal = renderLookup(item.location, null) || renderLookup(item.inventoryId?.address?.locality, null) || '';
                            
                            // Format Size safely including lookup resolution
                            let sizeVal = '';
                            const sizeConfigVal = renderLookup(item.sizeConfig, null) || renderLookup(item.inventoryId?.sizeConfig, null);
                            if (sizeConfigVal && sizeConfigVal !== '-') {
                                sizeVal = sizeConfigVal;
                            } else {
                                const sz = item.size || item.inventoryId?.size;
                                if (sz) {
                                    if (typeof sz === 'object') {
                                        if (sz.value) {
                                            sizeVal = `${sz.value} ${sz.unit || 'Sq.Yd.'}`;
                                        } else if (sz.lookup_value) {
                                            sizeVal = sz.lookup_value;
                                        } else {
                                            sizeVal = JSON.stringify(sz);
                                        }
                                    } else {
                                        sizeVal = String(sz);
                                    }
                                } else {
                                    sizeVal = 'Size N/A';
                                }
                            }

                            return {
                                ...item,
                                matchPercentage: item.score || 0,
                                subCategory: subCatVal,
                                location: locationVal,
                                imageUrl: item.imageUrl || item.inventoryId?.imageUrl || item.inventoryId?.propertyImages?.[0] || item.inventoryId?.images?.[0] || '',
                                size: sizeVal,
                                price: item.price || item.quotePrice || 0,
                                projectName: item.projectName || item.inventoryId?.projectName || 'Unnamed Project'
                            };
                        });
                        console.log(`[Matching] Found ${mappedMatches.length} matching deals for lead ${id}`);
                        setMatchedDeals(mappedMatches.slice(0, 5));
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
                const scores = res.data.scores || {};
                const live = scores[id] || Object.values(scores)[0];

                if (live) {
                    setLiveScoreData({
                        score: Math.round(live.score || 0),
                        label: live.label || 'Unknown',
                        color: live.color || 'var(--text-muted)',
                        tempClass: live.tempClass || 'cold'
                    });
                }
            }
        } catch (err) {
            console.error("Error fetching live score:", err);
            // Fallback placeholder data for live score when API fails
            setLiveScoreData({
                score: 0,
                label: 'N/A',
                color: 'var(--text-muted)',
                tempClass: 'cold'
            });
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
                    // Ensure live score is fetched for fallback lead records
                    fetchLiveScore(contactId);
                } else {
                    // No data found, keep contact null for graceful UI handling
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
        // Triggered by various modals after data changes
        const handleRefresh = (e) => {
            const { entityId } = e.detail || {};
            
            // If it's a specific entity update, check if it matches current page
            if (entityId && entityId !== contactId) return;

            console.info(`[ContactDetail] ${e.type} event caught. Refreshing data...`);
            fetchData();
            if (recordType === 'lead') {
                fetchLiveScore(contactId);
            }
        };

        const syncEvents = [
            'activity-completed', 
            'lead-updated', 
            'contact-updated', 
            'deal-updated', 
            'inventory-updated',
            'note-added',
            'STAGE_UPDATED'
        ];

        syncEvents.forEach(evt => window.addEventListener(evt, handleRefresh));
        return () => syncEvents.forEach(evt => window.removeEventListener(evt, handleRefresh));
    }, [contactId, fetchData, fetchLiveScore, recordType]);

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
        <div className="contact-detail-page" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-light)', overflow: 'hidden' }}>


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
                        borderBottom: '1px solid var(--border-color)',
                        background: 'var(--contact-card-bg)',
                        position: 'relative'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 900, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-chart-line" style={{ color: isDark ? 'var(--bg-card)' : 'var(--premium-blue)' }}></i> Enterprise Lead Pipeline
                            </span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                                TECHNICAL STATUS: <span style={{ color: isDark ? 'var(--bg-card)' : 'var(--premium-blue)', fontWeight: 900 }}>{String(renderLookup(contact.stage) || 'New').toUpperCase()}</span>
                            </span>
                        </div>
                        <EnterprisePipeline
                            contact={contact}
                            activities={unifiedTimeline}
                        />
                    </div>
                )}

                {/* MOBILE TAB NAV - Sticky */}
                {isMobile && (
                    <div className="mobile-tab-nav">
                        <button className={`mobile-tab-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Overview</button>
                        <button className={`mobile-tab-btn ${activeTab === 'activities' ? 'active' : ''}`} onClick={() => setActiveTab('activities')}>Interaction</button>
                        <button className={`mobile-tab-btn ${activeTab === 'deals' ? 'active' : ''}`} onClick={() => setActiveTab('deals')}>Deals</button>
                        <button className={`mobile-tab-btn ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>Properties</button>
                    </div>
                )}

                {/* THREE COLUMN GRID - PROFESSIONAL DASHBOARD */}
                <div className="no-scrollbar desktop-grid" style={{ flex: 1, display: 'flex', gap: '16px', padding: '12px 24px', height: 'calc(100vh - 250px)', overflow: 'hidden', background: 'var(--bg-light)' }}>
                    
                    {/* COLUMN 1: LEFT - Profile & Preferences */}
                    <div className={`mobile-col ${isMobile && activeTab !== 'overview' ? 'hide-mobile' : ''}`} style={{ flex: '0 0 400px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', minHeight: 0, paddingBottom: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <i className="fas fa-id-card" style={{ color: isDark ? 'var(--bg-card)' : 'var(--premium-blue)' }}></i>
                            <span style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Contact Intelligence</span>
                        </div>
                        
                        <ContactCoreInfo 
                            contact={contact}
                            recordType={recordType}
                            expandedSections={expandedSections}
                            toggleSection={toggleSection}
                            handleAutoSave={handleAutoSave}
                            renderLookup={renderLookup}
                        />



                        <ContactPreferences 
                            contact={contact}
                            aiStats={aiStats}
                            expandedSections={expandedSections}
                            toggleSection={toggleSection}
                            renderLookup={renderLookup}
                        />
                    </div>

                    {/* COLUMN 2: CENTER - Interaction Intelligence */}
                    <div className={`mobile-col ${isMobile && activeTab !== 'activities' ? 'hide-mobile' : ''}`} style={{ flex: '1', display: 'flex', flexDirection: 'column', minWidth: '0', minHeight: 0, position: 'relative', overflowY: 'auto', paddingBottom: '20px' }}>
                        <div className="/* Inline styles moved to index.css */ activity-timeline-container" style={{ 
                            background: 'var(--contact-card-bg)',
                            borderRadius: '16px',
                            border: '1px solid var(--border-color)',
                            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                            display: 'flex',
                            flexDirection: 'column',
                            minHeight: '100%'
                        }}>
                            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', background: 'var(--contact-card-bg)', display: 'flex', alignItems: 'center', gap: '8px', borderTopLeftRadius: '16px', borderTopRightRadius: '16px' }}>
                                <i className="fas fa-bolt" style={{ color: isDark ? 'var(--bg-card)' : 'var(--premium-blue)' }}></i>
                                <span style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Interaction Intelligence</span>
                            </div>
                            <div style={{ padding: '20px', flex: 1, overflow: 'visible' }}>
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
                    </div>

                    {/* COLUMN 3: RIGHT - Secondary Dashboard */}
                    <div className={`mobile-col ${isMobile && (activeTab !== 'deals' && activeTab !== 'inventory') ? 'hide-mobile' : ''}`} style={{ flex: '0 0 400px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', minHeight: 0, paddingBottom: '20px' }}>
                        {/* Deals Section logic in mobile tab */}
                        {isMobile && activeTab === 'inventory' ? (
                            <ContactOwnedProperties
                                expandedSections={expandedSections}
                                toggleSection={toggleSection}
                                ownedProperties={ownedProperties}
                                setIsInventoryModalOpen={setIsInventoryModalOpen}
                                renderValue={renderValue}
                                renderLookup={renderLookup}
                                onNavigate={onNavigate}
                            />
                        ) : isMobile && activeTab === 'deals' ? (
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
                                renderLookup={renderLookup}
                                onNavigate={onNavigate}
                            />
                        ) : (
                            <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <i className="fas fa-chart-line" style={{ color: isDark ? 'var(--bg-card)' : 'var(--premium-blue)' }}></i>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Strategic Monitoring</span>
                                </div>
                                {recordType === 'lead' && (
                                    <ContactPropertyRequirement
                                        contact={contact}
                                        aiStats={aiStats}
                                        expandedSections={expandedSections}
                                        toggleSection={toggleSection}
                                        renderLookup={renderLookup}
                                        onEdit={() => setIsAddLeadModalOpen(true)}
                                    />
                                )}

                                <div className={isMobile ? 'hide-mobile' : ''}>
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
                                        renderLookup={renderLookup}
                                        onNavigate={onNavigate}
                                    />
                                </div>

                                <div className={isMobile ? 'hide-mobile' : ''}>
                                    <ContactOwnedProperties
                                        expandedSections={expandedSections}
                                        toggleSection={toggleSection}
                                        ownedProperties={ownedProperties}
                                        setIsInventoryModalOpen={setIsInventoryModalOpen}
                                        renderValue={renderValue}
                                        renderLookup={renderLookup}
                                        onNavigate={onNavigate}
                                    />
                                </div>
                                
                                <ContactBookings
                                    expandedSections={expandedSections}
                                    toggleSection={toggleSection}
                                    contactBookings={contactBookings}
                                    renderValue={renderValue}
                                    renderLookup={renderLookup}
                                    onNavigate={onNavigate}
                                />
                            </>
                        )}

                        {/* Strategic Intelligence Sections */}
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




                        <ContactDocuments
                            expandedSections={expandedSections}
                            toggleSection={toggleSection}
                            contactDocuments={contactDocuments}
                            setIsDocumentModalOpen={setIsDocumentModalOpen}
                            renderLookup={renderLookup}
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
                    onEnroll={() => {
                        setIsEnrollModalOpen(false);
                    }}
                />

                {/* MOBILE BOTTOM BAR */}
                <div className="mobile-bottom-bar" style={{
                    display: 'none',
                    position: 'fixed',
                    bottom: 0,
                    width: '100%',
                    background: 'var(--glass-bg)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    borderTop: '1px solid rgba(226, 232, 240, 0.8)',
                    padding: '12px 0 30px',
                    zIndex: 1000,
                    justifyContent: 'space-around',
                    boxShadow: '0 -10px 25px rgba(0,0,0,0.08)'
                }}>
                    <button 
                        onClick={() => startCall(contact, { entityId: contactId, entityType: recordType.charAt(0).toUpperCase() + recordType.slice(1) }, handleCallComplete)}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'transparent', border: 'none', gap: '4px', cursor: 'pointer' }}
                    >
                        <div style={{ width: '42px', height: '42px', background: 'var(--stat-property-bg)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2px', border: '1px solid var(--border-color)' }}>
                            <i className="fas fa-phone-alt" style={{ color: 'var(--success-color)', fontSize: '1.1rem' }}></i>
                        </div>
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--success-color)' }}>Call</span>
                    </button>
                    <button 
                        onClick={() => {
                            const mobile = contact.mobile || contact.phones?.[0]?.number;
                            if (mobile) window.open(`https://wa.me/91${mobile.replace(/\D/g, '')}`, '_blank');
                        }}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'transparent', border: 'none', gap: '4px', cursor: 'pointer' }}
                    >
                        <div style={{ width: '42px', height: '42px', background: 'var(--stat-property-bg)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2px', border: '1px solid var(--stat-property-bg)' }}>
                            <i className="fab fa-whatsapp" style={{ color: 'var(--success-color)', fontSize: '1.2rem' }}></i>
                        </div>
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--success-color)' }}>WA</span>
                    </button>
                    <button 
                        onClick={() => setIsEmailModalOpen(true)}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'transparent', border: 'none', gap: '4px', cursor: 'pointer' }}
                    >
                        <div style={{ width: '42px', height: '42px', background: 'var(--stat-sales-bg)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2px', border: '1px solid var(--stat-sales-bg)' }}>
                            <i className="fas fa-envelope" style={{ color: 'var(--stat-sales-color)', fontSize: '1.1rem' }}></i>
                        </div>
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--stat-sales-color)' }}>Email</span>
                    </button>
                    <div style={{ padding: '0 12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                            onClick={() => {
                                if (recordType === 'lead') {
                                    const res = LeadConversionService.evaluateAutoConversion(contact, 'create_deal_clicked');
                                    if (res.success) showNotification(res.message);
                                } else {
                                    setIsAddDealModalOpen(true);
                                }
                            }}
                            style={{
                                background: isDark ? 'var(--bg-card)' : 'var(--premium-blue)',
                                color: 'var(--text-inverse)',
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
                        <div style={{ position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)', background: isDark ? 'var(--bg-card)' : 'var(--premium-blue)',
color: 'var(--text-inverse)',
padding: '12px 18px', borderRadius: '8px', zIndex: 2000, display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', fontSize: '0.85rem', fontWeight: 600 }}>
                            <i className="fas fa-check-circle" style={{ color: 'var(--success-color)' }}></i>
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
                            }).catch(err => console.error("Error refetching contact:", err));
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
                            }).catch(err => console.error("Error refetching docs:", err));
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
                            }).catch(err => console.error("Error refetching properties:", err));
                        }}
                    />
                )}

                {isAddLeadModalOpen && (
                    <AddLeadModal
                        isOpen={isAddLeadModalOpen}
                        onClose={() => setIsAddLeadModalOpen(false)}
                        contactData={recordType === 'contact' ? contact : null}
                        initialData={recordType === 'lead' ? contact : null}
                        mode={recordType === 'lead' ? 'edit' : 'add'}
                        onAdd={() => {
                            setIsAddLeadModalOpen(false);
                            showNotification(recordType === 'lead' ? 'Lead updated successfully' : 'Lead created successfully');
                            fetchData(); // Refresh requirements and matching
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
                            }).catch(err => console.error("Error refetching deals:", err));
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
