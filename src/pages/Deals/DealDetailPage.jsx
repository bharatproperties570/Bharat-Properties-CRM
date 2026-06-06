import { useState, useEffect, useCallback, useMemo } from 'react';
import Swal from 'sweetalert2';
import { api, activitiesAPI } from '../../utils/api';
import toast from 'react-hot-toast';
import AddOfferModal from '../../components/AddOfferModal';
import AddOwnerModal from '../../components/AddOwnerModal';
import UnifiedActivitySection from '../../components/Activities/UnifiedActivitySection';
import { useCall } from '../../context/CallContext';
import { useUserContext } from '../../context/UserContext';

import AddNoteModal from '../../components/AddNoteModal';
import UploadModal from '../../components/UploadModal';
import AddQuoteModal from '../../components/AddQuoteModal';
import AddBookingModal from '../../components/AddBookingModal';
import AddInventoryDocumentModal from '../../components/AddInventoryDocumentModal';
import AddBuiltupDetailsModal from '../../components/modals/AddBuiltupDetailsModal';
import { usePropertyConfig } from '../../context/PropertyConfigContext';
import { renderValue } from '../../utils/renderUtils';
import { formatIndianCurrency } from '../../utils/numberToWords';
import { getInitials, fixDriveUrl, getYoutubeId } from '../../utils/helpers';

// Inventory Components
import InventorySpecsPanel from '../Inventory/components/InventorySpecsPanel';
import LocationDetailsCard from '../Inventory/components/LocationDetailsCard';
import BuiltupDetailsCard from '../Inventory/components/BuiltupDetailsCard';
import PropertyOwnerSection from '../../components/Shared/PropertyOwnerSection';
import MediaVaultSection from '../../components/Shared/MediaVaultSection';

// Hooks & Components
import { useDealFinancials } from '../../hooks/useDealFinancials';
import { useDealIntelligence } from '../../hooks/useDealIntelligence';
import DealDetailHeader from '../../components/DealDetail/DealDetailHeader';
import DealLifecycle from '../../components/DealDetail/DealLifecycle';
import DealTechnicalSpecs from '../../components/DealDetail/DealTechnicalSpecs';
import DealGeography from '../../components/DealDetail/DealGeography';
import DealBuiltupDetails from '../../components/DealDetail/DealBuiltupDetails';
import DealFinancialSection from '../../components/DealDetail/DealFinancialSection';
// Shared Components
import MatchedLeadsCard from '../../components/MatchedLeadsCard';
import DealAnalysis from '../../components/DealDetail/DealAnalysis';
import LandedCostSheet from '../../components/DealDetail/DealCostSheet';
import { MediaViewerModal } from '../../components/DealDetail/DealCommon';
import SocialPostModal from '../../components/SocialPostModal';
import SendMessageModal from '../../components/SendMessageModal';
import ComposeEmailModal from '../Communication/components/ComposeEmailModal';
import ManageTagsModal from '../../components/ManageTagsModal';
import MarketingTab from './components/MarketingTab';
import PriceIntelligenceCard from '../../components/PriceIntelligenceCard';
import DealPriceJourneyCard from '../../components/DealPriceJourneyCard';

const DealDetailPage = ({ dealId, onBack, onNavigate, onAddActivity }) => {
    const { user } = useUserContext();
    const { getLookupValue } = usePropertyConfig();
    const [deal, setDeal] = useState(null);
    const [inventory, setInventory] = useState(null);
    const [loading, setLoading] = useState(true);
    const [matchingLeads, setMatchingLeads] = useState([]);
    const [allLeads, setAllLeads] = useState([]);
    const [isOfferModalOpen, setIsOfferModalOpen] = useState(false);
    
    // Custom Hooks
    const { financials } = useDealFinancials(deal);

    const [activities, setActivities] = useState([]);
    const [liveScoreData, setLiveScoreData] = useState({ score: 0, color: '#94a3b8', label: 'Warm' });
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const { startCall } = useCall();
    const [isMailOpen, setIsMailOpen] = useState(false);
    const [isMessageOpen, setIsMessageOpen] = useState(false);
    const [isTagsModalOpen, setIsTagsModalOpen] = useState(false);
    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
    const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
    const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
    const [isBuiltupModalOpen, setIsBuiltupModalOpen] = useState(false);
    const [isActivityOpen, setIsActivityOpen] = useState(false);
    const [isOwnerModalOpen, setIsOwnerModalOpen] = useState(false);
    const [isMarkingLost, setIsMarkingLost] = useState(false);
    const [isSocialModalOpen, setIsSocialModalOpen] = useState(false);
    const [activeCenterTab, setActiveCenterTab] = useState('activities'); // 'activities' or 'marketing'
    const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
    const [isGeneratingAi, setIsGeneratingAi] = useState(false);
    const [publishFormDescription, setPublishFormDescription] = useState('');
    const [publishFormShareUnitNumber, setPublishFormShareUnitNumber] = useState(true);
    const [publishFormShareLocation, setPublishFormShareLocation] = useState(true);
    const [savingPublishSettings, setSavingPublishSettings] = useState(false);

    const [activityInitialData, setActivityInitialData] = useState(null);
    const [selectedContactsForMail, setSelectedContactsForMail] = useState([]);
    const [selectedContactsForMessage, setSelectedContactsForMessage] = useState([]);
    const [mailSubject, setMailSubject] = useState('');
    const [mailBody, setMailBody] = useState('');
    const [mailAttachments, setMailAttachments] = useState([]);

    const [mediaViewer, setMediaViewer] = useState({ isOpen: false, data: null });

    const currentStage = deal?.stage || 'Open';
    const stageAlerts = useDealIntelligence(deal, currentStage);

    // Sync liveScoreData with intelligence health
    useEffect(() => {
        if (stageAlerts.health) {
            setLiveScoreData({
                score: stageAlerts.health.score,
                color: stageAlerts.health.color,
                label: stageAlerts.health.label
            });
        }
    }, [stageAlerts.health]);

    // Handlers
    const handleAddOffer = async (newOffer) => {
        try {
            const offerData = {
                round: (deal.negotiationRounds || []).length + 1,
                date: newOffer.date,
                offerBy: newOffer.leadName,
                amount: newOffer.amount,
                counterAmount: newOffer.counterAmount,
                conditions: newOffer.conditions,
                note: newOffer.conditions || newOffer.note,
                status: newOffer.status || 'Active'
            };
            const response = await api.post(`deals/${dealId}/offers`, offerData);
            if (response.data && response.data.success) {
                await api.put(`deals/${dealId}`, { 
                    stage: 'Negotiation',
                    triggeredBy: 'manual_pipeline_override'
                });
                toast.success("Offer added & Deal moved to Negotiation stage");
                fetchDealDetails();
            }
        } catch (error) {
            console.error("Error adding offer:", error);
            toast.error("Failed to add offer");
        }
    };
    
    const handleSocialClick = (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        setIsSocialModalOpen(true);
    };

    const enrichDealIntelligence = () => {
        toast.promise(
            api.get(`stage-engine/deals/enrich?dealId=${dealId}`),
            {
                loading: 'Analyzing transaction health...',
                success: (res) => {
                    fetchDealDetails();
                    fetchLiveScore();
                    return 'Intelligence data refreshed! ✨';
                },
                error: 'Failed to enrich deal data'
            }
        );
    };

    const fetchDealDetails = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`deals/${dealId}?unified=true`);
            if (res.data && (res.data.success || res.data.status === 'success')) {
                const dealData = res.data.data;
                setDeal(dealData);

                // --- 🚀 UNIFIED API DATA SINK ---
                if (res.data.activities) setActivities(res.data.activities);
                if (res.data.matchingLeads) setMatchingLeads(res.data.matchingLeads);
                if (res.data.liveScore) setLiveScoreData(res.data.liveScore);

                // --- [ENTERPRISE HARDENING]: Instant Data Initialization ---
                // If the deal already has enriched inventory data from the backend, 
                // use it immediately to prevent UI flicker or "disappearing" owners.
                if (dealData.inventoryId && typeof dealData.inventoryId === 'object') {
                    setInventory(prev => ({
                        ...dealData.inventoryId,
                        // Priority merge: Ensure owners and associates from Deal enrichment are used
                        owners: dealData.owner ? [dealData.owner] : (dealData.inventoryId.owners || []),
                        associates: dealData.associatedContact ? [{ contact: dealData.associatedContact }] : (dealData.inventoryId.associates || [])
                    }));
                }

                // Fetch full Inventory for technical specs only if available
                const invId = dealData.inventoryId?._id || (typeof dealData.inventoryId === 'string' ? dealData.inventoryId : null);
                if (invId) {
                    api.get(`inventory/${invId}`)
                        .then(invRes => { 
                            if (invRes.data?.success) {
                                // Merge full technical details (built-up, specs) but keep owners stable
                                setInventory(prev => ({
                                    ...prev,
                                    ...invRes.data.data,
                                    // Preserve stable owner/associate data from Deal or initialization
                                    owners: (prev?.owners?.length > 0) ? prev.owners : (invRes.data.data.owners || []),
                                    associates: (prev?.associates?.length > 0) ? prev.associates : (invRes.data.data.associates || [])
                                }));
                            }
                        })
                        .catch(err => console.error("Error fetching inventory for sidebar:", err));
                }
            } else {
                toast.error('Failed to load deal details');
            }
        } catch (error) {
            console.error("Error fetching deal details:", error);
            toast.error('Error loading deal details');
        } finally {
            setLoading(false);
        }
    }, [dealId]);

    const openPublishModal = () => {
        setPublishFormDescription(deal?.description || deal?.websiteMetadata?.description || '');
        setPublishFormShareUnitNumber(deal?.websiteMetadata?.shareUnitNumber !== false);
        setPublishFormShareLocation(deal?.websiteMetadata?.shareLocation !== false);
        setIsPublishModalOpen(true);
    };

    const handleTogglePublish = () => {
        openPublishModal();
    };

    const handleSavePublishSettings = async (shouldPublish) => {
        setSavingPublishSettings(true);
        const toastId = toast.loading(shouldPublish ? 'Publishing listing...' : 'Saving settings...');
        
        try {
            const payload = {
                isPublished: shouldPublish,
                publishedAt: shouldPublish ? new Date() : (deal.publishedAt || new Date()),
                websiteMetadata: {
                    ...deal.websiteMetadata,
                    shareUnitNumber: publishFormShareUnitNumber,
                    shareLocation: publishFormShareLocation,
                    description: publishFormDescription
                },
                description: publishFormDescription // Sync with deal description
            };

            const res = await api.put(`deals/${dealId}`, payload);
            if (res.data && (res.data.success || res.data.status === 'success')) {
                setDeal(prev => ({ 
                    ...prev, 
                    isPublished: shouldPublish,
                    description: publishFormDescription,
                    websiteMetadata: payload.websiteMetadata
                }));
                toast.success(shouldPublish ? 'Listing published to Website!' : 'Settings updated successfully!', { id: toastId });
                setIsPublishModalOpen(false);
            }
        } catch (error) {
            console.error("Error saving publication settings:", error);
            toast.error('Failed to update publication status', { id: toastId });
        } finally {
            setSavingPublishSettings(false);
        }
    };

    const handleUnpublishListing = async () => {
        setSavingPublishSettings(true);
        const toastId = toast.loading('Unpublishing listing...');
        
        try {
            const payload = {
                isPublished: false,
                publishedAt: null
            };

            const res = await api.put(`deals/${dealId}`, payload);
            if (res.data && (res.data.success || res.data.status === 'success')) {
                setDeal(prev => ({ 
                    ...prev, 
                    isPublished: false
                }));
                toast.success('Listing removed from Website', { id: toastId });
                setIsPublishModalOpen(false);
            }
        } catch (error) {
            console.error("Error unpublishing listing:", error);
            toast.error('Failed to unpublish listing', { id: toastId });
        } finally {
            setSavingPublishSettings(false);
        }
    };

    const handleGenerateAiDescription = async () => {
        setIsGeneratingAi(true);
        const toastId = toast.loading('AI is drafting a premium property description...');

        try {
            const projectNameStr = deal.projectName?.name || deal.projectName || '';
            const blockStr = typeof deal.block === 'object' ? (deal.block?.name || '') : (deal.block || '');
            const unitDetailStr = `Project: ${projectNameStr}${blockStr ? `, Block: ${blockStr}` : ''}${deal.unitNo ? `, Unit No: ${deal.unitNo}` : ''} (${deal.propertyType || 'Residential'})`;
            const locationStr = `${deal.locationDetails?.locality || deal.location || ''} ${deal.locationDetails?.city || 'Kurukshetra'}`.trim();
            
            // Builtup Area
            const carpet = deal.unitSpecification?.carpetArea;
            const builtup = deal.unitSpecification?.builtUpArea;
            const saleable = deal.unitSpecification?.totalSaleableArea;
            const builtupStr = `Size: ${deal.size || ''} ${deal.sizeUnit || ''}${builtup ? `, Built-up Area: ${builtup} Sq.Ft.` : ''}${carpet ? `, Carpet Area: ${carpet} Sq.Ft.` : ''}${saleable ? `, Saleable Area: ${saleable} Sq.Ft.` : ''}`;
            
            // Expected Price
            const priceVal = deal.price || deal.quotePrice;
            const expectedPriceStr = priceVal ? `₹${new Intl.NumberFormat('en-IN').format(priceVal)} ${deal.pricingMode === 'Rate' ? `per ${deal.priceUnit || 'Sq.Ft.'}` : '(Total Expected Price)'}` : 'Price on Request';
            
            // Deal Details
            const dealDetailsStr = `Deal Status: ${deal.stage || deal.status || ''}, Deal Type: ${deal.dealType || ''}, Transaction Type: ${deal.transactionType || ''}, Lead/Deal Source: ${deal.source || ''}`;

            // Furnishing details
            const furnishType = deal.furnishing?.furnishType || '';
            const possessionStatus = deal.furnishing?.possessionStatus || '';
            const constructionAge = deal.furnishing?.constructionAge || '';
            const furnishedItems = Array.isArray(deal.furnishing?.furnishedItems) ? deal.furnishing.furnishedItems.filter(Boolean).join(', ') : '';
            const furnishingStr = [
                furnishType ? `Furnishing Status: ${furnishType}` : '',
                possessionStatus ? `Possession: ${possessionStatus}` : '',
                constructionAge ? `Age of Construction: ${constructionAge} years` : '',
                furnishedItems ? `Amenities/Furnished Items: ${furnishedItems}` : ''
            ].filter(Boolean).join(', ');

            // Specification details
            const facing = deal.unitSpecification?.facing || '';
            const orientation = deal.unitSpecification?.orientation || '';
            const roadWidth = deal.unitSpecification?.roadWidth || '';
            const ownership = deal.unitSpecification?.ownership || '';
            const specsStr = [
                facing ? `Facing: ${facing}` : '',
                orientation ? `Orientation: ${orientation}` : '',
                roadWidth ? `Road Width: ${roadWidth}` : '',
                ownership ? `Ownership: ${ownership}` : ''
            ].filter(Boolean).join(', ');

            // Category and Intent
            const intent = deal.intent || '';
            const category = deal.category || '';
            const subCategory = deal.subCategory || '';
            const categoryStr = [
                intent ? `Transaction Intent: For ${intent}` : '',
                category ? `Category: ${category}` : '',
                subCategory ? `Sub-category: ${subCategory}` : ''
            ].filter(Boolean).join(', ');

            const systemPrompt = `You are a world-class luxury real estate copywriter and SEO expert. Write a highly engaging, sophisticated, and professional description for a property listing that ranks high on Google Search.

CRITICAL FORMATTING & WRITING RULES:
1. PARAGRAPH LENGTH: Write ONLY short, concise paragraphs (maximum 2-3 sentences per paragraph). Use 3-4 short paragraphs in total.
2. SEO OPTIMIZATION: Seamlessly integrate relevant keywords like project name, locality, city, property type, and key features so the listing ranks high on Google Search.
3. TONE & STYLE: Premium, high-converting, and elegant (SaaS Real Estate standard). Emphasize key selling points, prime location attributes, built-up configuration, pricing value, furnishing, and transaction clarity. Do not use generic placeholders or templates.
4. CALL TO ACTION: Include a brief, compelling, professional call to action at the end to get in touch.

Return ONLY the final description. Do not include any intro, metadata, or titles.`;

            const userPrompt = `Draft a premium, SEO-friendly, high-converting real estate description based on these property specifications:
- **Unit Details**: ${unitDetailStr}
- **Location**: ${locationStr}${deal.locationDetails?.landmark ? ` (Landmark: ${deal.locationDetails.landmark})` : ''}
- **Built-up Details**: ${builtupStr}
- **Expected Price**: ${expectedPriceStr}
- **Transaction Details**: ${categoryStr}
- **Furnishing & Possession**: ${furnishingStr || 'Not Specified'}
- **Property Specifications**: ${specsStr || 'Not Specified'}
- **Deal Details (Status, Type, Transaction, Source)**: ${dealDetailsStr}
- **Additional Context / Remarks**: ${deal.remarks || 'Prime property with excellent connectivity.'}

Write a highly engaging, SEO-optimized description with short, readable paragraphs (maximum 2-3 sentences each) suitable for publication on our public website directory.`;

            const response = await api.post('/marketing/generate-with-model', {
                provider: 'claude',
                model: 'claude-3-haiku-20240307',
                prompt: userPrompt,
                systemPrompt: systemPrompt
            });

            if (response.data && response.data.success && response.data.content) {
                const generatedText = response.data.content;
                setPublishFormDescription(generatedText);
                toast.success('Description successfully generated!', { id: toastId });
            } else {
                throw new Error("Could not extract generated content");
            }
        } catch (error) {
            console.error("AI Generation Error:", error);
            toast.error("Failed to generate description with AI. Please try again.", { id: toastId });
        } finally {
            setIsGeneratingAi(false);
        }
    };

    const handleMarkAsLost = async (reasons = null) => {
        if (!reasons && !isMarkingLost) {
            setIsMarkingLost(true);
            return;
        }

        const result = await Swal.fire({
            title: 'Confirm Deal Loss?',
            text: "This will move the deal to 'Closed Lost' stage and record the reasons.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Yes, mark as lost'
        });

        if (result.isConfirmed) {
            try {
                const res = await api.put(`deals/${dealId}`, {
                    stage: 'Closed Lost',
                    triggeredBy: 'manual_override',
                    closingDetails: {
                        isClosed: true,
                        closingDate: new Date(),
                        remarks: reasons?.remarks || deal.closingDetails?.remarks || '',
                        lossReasons: reasons?.primaryReasons || deal.closingDetails?.lossReasons || []
                    }
                });
                if (res.data && (res.data.success || res.data.status === 'success')) {
                    toast.success('Deal marked as LOST');
                    setIsMarkingLost(false);
                    fetchDealDetails();
                }
            } catch (error) {
                console.error("Error marking deal as lost:", error);
                toast.error('Error updating status');
            }
        }
    };

    const fetchLiveScore = useCallback(async () => {
        if (!dealId) return;
        try {
            const res = await api.get(`stage-engine/deals/scores?dealId=${dealId}`);
            if (res.data && res.data.success) {
                const scores = res.data.scores || {};
                const live = scores[dealId] || Object.values(scores)[0];
                if (live) {
                    setLiveScoreData({
                        score: Math.round(live.score || 0),
                        color: live.color || '#94a3b8',
                        label: live.label || 'Warm'
                    });
                }
            }
        } catch (err) {
            console.error("Error fetching live score:", err);
        }
    }, [dealId]);

    const handleStageChange = async (newStage) => {
        if (newStage === 'Quote') {
            setIsQuoteModalOpen(true);
            return;
        }
        if (newStage === 'Negotiation') {
            setIsOfferModalOpen(true);
            return;
        }
        if (newStage === 'Booked') {
            setIsBookingModalOpen(true);
            return;
        }

        // 🚀 OPTIMISTIC UI: Update state immediately
        const previousStage = deal.stage;
        setDeal(prev => ({ ...prev, stage: newStage }));
        toast.success(`Transaction moved to ${newStage} stage!`);

        try {
            const res = await api.put(`deals/${dealId}`, { 
                stage: newStage,
                triggeredBy: 'manual_pipeline_override'
            });
            
            if (res.data && (res.data.success || res.data.status === 'success')) {
                // Refresh background data for consistency
                fetchDealDetails();
                fetchLiveScore();
                fetchDealActivities();
                enrichDealIntelligence();
            } else {
                throw new Error("Server rejected status update");
            }
        } catch (error) {
            console.error("Error updating deal stage:", error);
            // ROLLBACK on failure
            setDeal(prev => ({ ...prev, stage: previousStage }));
            toast.error("Failed to update status. Reverting changes.");
        }
    };

    const fetchMatchingLeads = useCallback(async () => {
        if (!dealId) return;
        try {
            const response = await api.get(`leads/match?dealId=${dealId}`);
            if (response.data && response.data.success) {
                const mapped = (response.data.matchingLeads || []).map(l => ({
                    ...l,
                    name: l.name || `${l.firstName || ''} ${l.lastName || ''}`.trim() || 'Unknown',
                    mobile: l.mobile || l.phone || ''
                }));
                setMatchingLeads(mapped);
            }
        } catch (error) {
            console.error("Error fetching matching leads:", error);
        }
    }, [dealId]);

    const fetchAllLeads = useCallback(async () => {
        try {
            const response = await api.get('leads', { params: { limit: 1000 } });
            if (response.data && response.data.success) {
                const mapped = (response.data.records || response.data.data || []).map(l => ({
                    ...l,
                    name: l.name || (l.contactDetails ? `${l.contactDetails.name || ''} ${l.contactDetails.surname || ''}`.trim() : 'Unknown'),
                    mobile: l.mobile || l.phone || (l.contactDetails?.phones?.[0]?.number) || ''
                }));
                setAllLeads(mapped);
            }
        } catch (error) {
            console.error("Error fetching all leads:", error);
        }
    }, []);


    const fetchDealActivities = useCallback(async () => {
        try {
            const res = await activitiesAPI.getUnified('Deal', dealId);
            if (res.data && res.data.success) {
                setActivities(res.data.data || []);
            }
        } catch (err) {
            console.error("Error fetching deal activities:", err);
        }
    }, [dealId]);


    // Effects (RESTORING MISSING DATA FETCHING)
    useEffect(() => {
        fetchDealDetails();
        // fetchLiveScore(); // Replaced by Unified API
        fetchAllLeads();
        // fetchDealActivities(); // Replaced by Unified API
    }, [dealId, fetchDealDetails, fetchAllLeads]);

    useEffect(() => {
        if (dealId) {
            fetchMatchingLeads();
        }
    }, [dealId, fetchMatchingLeads]);

    const stageStyle = useMemo(() => {
        const stageColors = {
            'Open': { bg: '#e0f2fe', text: '#0369a1', dot: '#0ea5e9' },
            'Quote': { bg: '#fff7ed', text: '#9a3412', dot: '#f97316' },
            'Negotiation': { bg: '#f5f3ff', text: '#5b21b6', dot: '#8b5cf6' },
            'Booked': { bg: '#ecfdf5', text: '#065f46', dot: '#10b981' },
            'Closed': { bg: '#f0fdf4', text: '#166534', dot: '#22c55e' },
            'Closed Lost': { bg: '#fef2f2', text: '#991b1b', dot: '#ef4444' },
            'Stalled': { bg: '#fafaf9', text: '#57534e', dot: '#78716c' },
        };
        return stageColors[currentStage] || stageColors['Open'];
    }, [currentStage]);

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc' }}>
            <div className="loader"></div>
            <span style={{ marginLeft: '12px', fontWeight: 600, color: '#64748b' }}>Loading Transaction Command Center...</span>
        </div>
    );
    if (!deal) return <div className="error-state">Deal not found</div>;

    return (
        <div className="deal-detail-page bg-slate-50 min-h-screen" style={{ fontFamily: '"Inter", sans-serif' }}>
            <DealDetailHeader 
                deal={deal} 
                liveScoreData={liveScoreData} 
                stageAlerts={stageAlerts}
                onBack={onBack}
                handleTogglePublish={handleTogglePublish}
                setIsMarkingLost={setIsMarkingLost}
                isMarkingLost={isMarkingLost}
                setIsCallModalOpen={(val) => {
                    if (val) {
                        const contactToCall = typeof val === 'object' ? val : deal.contactId;
                        startCall(contactToCall, { entityId: dealId, entityType: 'Deal' });
                    }
                }}
                setIsMessageOpen={setIsMessageOpen}
                setIsMailOpen={setIsMailOpen}
                setShowMoreMenu={setShowMoreMenu}
                showMoreMenu={showMoreMenu}
                onAddActivity={onAddActivity}
                setIsBookingModalOpen={setIsBookingModalOpen}
                setIsTagsModalOpen={setIsTagsModalOpen}
                setIsUploadModalOpen={setIsUploadModalOpen}
                setIsDocumentModalOpen={setIsDocumentModalOpen}
                setIsNoteModalOpen={setIsNoteModalOpen}
                setIsQuoteModalOpen={setIsQuoteModalOpen}
                setIsBuiltupModalOpen={setIsBuiltupModalOpen}
                handleSocialClick={handleSocialClick}
                enrichDealIntelligence={enrichDealIntelligence}
                fetchDealDetails={fetchDealDetails}
                getLookupValue={getLookupValue}
                onNavigate={onNavigate}
            />

            <DealLifecycle 
                deal={deal}
                activities={activities}
                currentStage={currentStage}
                stageStyle={stageStyle}
                stageInfo={{ label: currentStage }}
                onStageChange={handleStageChange}
            />

            {/* MAIN CONTENT SPLIT - 3 COLUMN LAYOUT */}
            <div style={{ maxWidth: '100%', margin: '12px auto', padding: '0 24px', display: 'flex', gap: '16px', height: 'calc(100vh - 120px)', overflow: 'hidden' }}>
                
                {/* COLUMN 1: LEFT - UNIT & LOCATION INTELLIGENCE (400px) */}
                <div style={{ flex: '0 0 400px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', minHeight: 0, paddingBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <i className="fas fa-building" style={{ color: '#4f46e5' }}></i>
                        <span style={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Unit & Location Intelligence</span>
                    </div>

                    {inventory ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flexShrink: 0 }}>
                            <InventorySpecsPanel 
                                inventory={inventory} 
                                getLookupValue={getLookupValue}
                                isInventoryActive={inventory.status === 'Active' || (typeof inventory.status === 'object' && inventory.status.lookup_value === 'Active')}
                                onFeedback={() => {}} 
                                hideConsole={true}
                            />

                            <LocationDetailsCard 
                                inventory={inventory} 
                                getLookupValue={getLookupValue} 
                            />

                            <BuiltupDetailsCard 
                                inventory={inventory} 
                                getLookupValue={getLookupValue} 
                            />
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flexShrink: 0 }}>
                            <DealTechnicalSpecs 
                                deal={deal} 
                                inventory={inventory}
                                getLookupValue={getLookupValue}
                                getStrictLookupValue={(field, val) => getLookupValue(field, val)}
                            />

                            <DealGeography 
                                deal={deal} 
                                inventory={inventory}
                                getLookupValue={getLookupValue} 
                            />

                            <DealBuiltupDetails 
                                deal={deal} 
                                inventory={inventory}
                                getLookupValue={getLookupValue} 
                                onRefresh={fetchDealDetails}
                            />
                        </div>
                    )}
                </div>

                {/* COLUMN 2: CENTER - INTERACTION INTELLIGENCE */}
                <div style={{ flex: '1', display: 'flex', flexDirection: 'column', background: '#f8fafc', overflowY: 'auto', minHeight: 0, minWidth: '0', position: 'relative', paddingBottom: '20px' }}>
                    <div className="glass-card" style={{ 
                        background: '#fff',
                        borderRadius: '16px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: '100%'
                    }}>
                        <div style={{ padding: '0 20px', borderBottom: '1px solid #f1f5f9', background: '#fff', display: 'flex', alignItems: 'center', gap: '24px', borderTopLeftRadius: '16px', borderTopRightRadius: '16px' }}>
                            <button 
                                onClick={() => setActiveCenterTab('activities')}
                                style={{ 
                                    padding: '16px 0', 
                                    fontSize: '0.75rem', 
                                    fontWeight: 900, 
                                    color: activeCenterTab === 'activities' ? '#4f46e5' : '#64748b', 
                                    textTransform: 'uppercase', 
                                    letterSpacing: '0.5px',
                                    borderBottom: activeCenterTab === 'activities' ? '2px solid #4f46e5' : 'none',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                <i className="fas fa-bolt" style={{ marginRight: '8px' }}></i> Activities
                            </button>
                            <button 
                                onClick={() => setActiveCenterTab('marketing')}
                                style={{ 
                                    padding: '16px 0', 
                                    fontSize: '0.75rem', 
                                    fontWeight: 900, 
                                    color: activeCenterTab === 'marketing' ? '#4f46e5' : '#64748b', 
                                    textTransform: 'uppercase', 
                                    letterSpacing: '0.5px',
                                    borderBottom: activeCenterTab === 'marketing' ? '2px solid #4f46e5' : 'none',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                <i className="fas fa-bullhorn" style={{ marginRight: '8px' }}></i> Marketing & BNA
                            </button>
                        </div>
                        <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
                            {activeCenterTab === 'activities' ? (
                                (() => {
                                    const relatedEntities = [{ type: 'Deal', id: dealId }];
                                    if (deal.contactId?._id || deal.contactId) {
                                        relatedEntities.push({ type: 'Contact', id: deal.contactId?._id || deal.contactId });
                                    }
                                    if (inventory) {
                                        relatedEntities.push({ type: 'Inventory', id: inventory._id || inventory.id });
                                        if (inventory.owners && Array.isArray(inventory.owners)) {
                                            inventory.owners.forEach(o => { if (o._id || o.id) relatedEntities.push({ type: 'Contact', id: o._id || o.id }); });
                                        }
                                        if (inventory.associates && Array.isArray(inventory.associates)) {
                                            inventory.associates.forEach(a => {
                                                const cId = a.contact?._id || a.contact?.id || a.id;
                                                if (cId) relatedEntities.push({ type: 'Contact', id: cId });
                                            });
                                        }
                                    }

                                    return (
                                        <UnifiedActivitySection 
                                            entityId={dealId} 
                                            entityType="Deal" 
                                            entityData={deal}
                                            onActivitySaved={fetchDealDetails}
                                            relatedEntities={relatedEntities}
                                        />
                                    );
                                })()
                            ) : (
                                <MarketingTab 
                                    dealId={dealId} 
                                    deal={deal} 
                                    onRefresh={fetchDealDetails} 
                                />
                            )}
                        </div>
                    </div>
                </div>

                {/* COLUMN 3: RIGHT - PRICING & LOGISTICS */}
                <div style={{ flex: '0 0 400px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', minHeight: 0, paddingBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexShrink: 0 }}>
                        <i className="fas fa-file-invoice-dollar" style={{ color: '#4f46e5' }}></i>
                        <span style={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pricing & Logistics</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flexShrink: 0 }}>
                        <DealAnalysis 
                            deal={deal} 
                            isMarkingLost={isMarkingLost} 
                            handleMarkAsLost={handleMarkAsLost}
                            setDeal={setDeal}
                        />

                        <DealFinancialSection 
                            deal={deal} 
                            financials={financials} 
                            setIsOfferModalOpen={setIsOfferModalOpen} 
                        />

                        {/* ── Price Intelligence + Deal Journey ── */}
                        <PriceIntelligenceCard dealId={dealId} compact />
                        <DealPriceJourneyCard dealId={dealId} deal={deal} />

                        <MatchedLeadsCard 
                            matchingLeads={matchingLeads} 
                            onNavigate={onNavigate} 
                            entityId={dealId}
                            entityType="deal"
                        />

                        <PropertyOwnerSection 
                            inventory={inventory || { 
                                _id: null, 
                                owners: deal.owner ? [deal.owner] : [], 
                                associates: deal.associatedContact ? [{ contact: deal.associatedContact }] : [],
                                ownerName: deal.ownerName || deal.owner?.name,
                                ownerPhone: deal.ownerPhone || (deal.owner?.phones?.[0]?.number || deal.owner?.mobile)
                            }} 
                            onOwnerClick={() => setIsOwnerModalOpen(true)}
                        />

                        <MediaVaultSection 
                            inventory={inventory}
                            deal={deal}
                            onMediaClick={() => {
                                if (!inventory?._id) {
                                    toast.error('Please link an inventory to manage media archive.');
                                    return;
                                }
                                setIsUploadModalOpen(true);
                            }}
                            onMediaView={(m) => setMediaViewer({ isOpen: true, data: m })}
                            onUploadClick={() => {
                                if (!inventory?._id) {
                                    toast.error('Please link an inventory to upload media.');
                                    return;
                                }
                                setIsUploadModalOpen(true);
                            }}
                            onDocumentClick={() => {
                                if (!inventory?._id) {
                                    toast.error('Please link an inventory to manage documents.');
                                    return;
                                }
                                setIsDocumentModalOpen(true);
                            }}
                        />

                        <LandedCostSheet financials={financials} deal={deal} />

                        {/* Property History */}
                        <div className="glass-card">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                                <div style={{ width: '32px', height: '32px', background: 'rgba(100, 116, 139, 0.1)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <i className="fas fa-history" style={{ color: '#64748b', fontSize: '0.8rem' }}></i>
                                </div>
                                <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 900, color: '#0f172a' }}>Property History</h3>
                            </div>
                            <div style={{ paddingLeft: '14px', borderLeft: '2px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {inventory ? (
                                    (inventory.ownerHistory || []).length > 0 ? (
                                        (inventory.ownerHistory || []).reverse().slice(0, 5).map((item, idx) => (
                                            <div key={idx} style={{ position: 'relative' }}>
                                                <div style={{ position: 'absolute', left: '-20px', top: '4px', width: '8px', height: '8px', background: '#10b981', borderRadius: '50%', border: '2px solid #fff' }}></div>
                                                <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 800, color: '#1e293b' }}>{renderValue(item.contactName)}</p>
                                                <p style={{ margin: 0, fontSize: '0.6rem', color: '#64748b' }}>{new Date(item.date).toLocaleDateString()}</p>
                                            </div>
                                        ))
                                    ) : (
                                        <p style={{ fontSize: '0.7rem', color: '#64748b', margin: 0 }}>No history recorded.</p>
                                    )
                                ) : (
                                    <p style={{ fontSize: '0.7rem', color: '#64748b', margin: 0 }}>No inventory linked.</p>
                                )}
                            </div>
                        </div>

                        {/* Inventory Lifecycle */}
                        <div className="glass-card">
                            <h3 style={{ fontSize: '0.75rem', fontWeight: 900, color: '#0f172a', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Lifecycle Analytics</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <LifecycleMetric label="Acquired" value={inventory?.createdAt ? new Date(inventory.createdAt).toLocaleDateString() : '-'} icon="calendar-plus" color="#10b981" />
                                <LifecycleMetric label="Modified" value={inventory?.updatedAt ? new Date(inventory.updatedAt).toLocaleDateString() : '-'} icon="edit" color="#3b82f6" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* MODALS */}
            {isOfferModalOpen && (
                <AddOfferModal
                    isOpen={isOfferModalOpen}
                    onClose={() => setIsOfferModalOpen(false)}
                    onSave={handleAddOffer}
                    leads={matchingLeads.length > 0 ? matchingLeads : allLeads}
                    deal={deal}
                />
            )}

            {isMessageOpen && (
                <SendMessageModal
                    isOpen={isMessageOpen}
                    onClose={() => setIsMessageOpen(false)}
                    entityType="Deal"
                    entityId={dealId}
                    phoneNumber={deal.contactDetails?.phones?.[0]?.number}
                    onActivitySaved={fetchDealDetails}
                />
            )}

            {isMailOpen && (
                <ComposeEmailModal
                    isOpen={isMailOpen}
                    onClose={() => setIsMailOpen(false)}
                    recipientEmail={deal.contactDetails?.emails?.[0]?.address}
                    entityType="Deal"
                    entityId={dealId}
                    onActivitySaved={fetchDealDetails}
                />
            )}

            {isTagsModalOpen && (
                <ManageTagsModal
                    isOpen={isTagsModalOpen}
                    onClose={() => setIsTagsModalOpen(false)}
                    entityType="Deal"
                    entityId={dealId}
                    initialTags={deal.tags}
                    onSaved={fetchDealDetails}
                />
            )}

            {isBuiltupModalOpen && (
                <AddBuiltupDetailsModal
                    isOpen={isBuiltupModalOpen}
                    onClose={() => setIsBuiltupModalOpen(false)}
                    entityType="Deal"
                    entityId={dealId}
                    entityData={deal}
                    onSave={fetchDealDetails}
                />
            )}

            {isBookingModalOpen && (
                <AddBookingModal
                    isOpen={isBookingModalOpen}
                    onClose={() => setIsBookingModalOpen(false)}
                    deal={deal}
                    onSaved={fetchDealDetails}
                />
            )}

            {isUploadModalOpen && (
                <UploadModal
                    isOpen={isUploadModalOpen}
                    onClose={() => setIsUploadModalOpen(false)}
                    entityType="Inventory"
                    entityId={inventory?._id || inventory?.id}
                    onUploaded={fetchDealDetails}
                    project={inventory}
                    type="property"
                />
            )}

            {isNoteModalOpen && (
                <AddNoteModal
                    isOpen={isNoteModalOpen}
                    onClose={() => setIsNoteModalOpen(false)}
                    entityType="Deal"
                    entityId={dealId}
                    onSaved={fetchDealDetails}
                />
            )}

            {isQuoteModalOpen && (
                <AddQuoteModal
                    isOpen={isQuoteModalOpen}
                    onClose={() => setIsQuoteModalOpen(false)}
                    deal={deal}
                    onSaved={fetchDealDetails}
                />
            )}

            {isDocumentModalOpen && (
                <AddInventoryDocumentModal
                    isOpen={isDocumentModalOpen}
                    onClose={() => setIsDocumentModalOpen(false)}
                    inventoryId={deal.inventoryId?._id || deal.inventoryId}
                    onSaved={fetchDealDetails}
                    project={inventory}
                />
            )}

            <MediaViewerModal 
                isOpen={mediaViewer.isOpen} 
                onClose={() => setMediaViewer({ isOpen: false, data: null })} 
                data={mediaViewer.data} 
            />

            {isOwnerModalOpen && (
                <AddOwnerModal 
                    isOpen={isOwnerModalOpen}
                    onClose={() => setIsOwnerModalOpen(false)}
                    currentOwners={inventory ? [
                        ...(inventory.owners || []).map(o => ({ id: o._id, name: o.name, mobile: o.phones?.[0]?.number || o.mobile, role: 'Property Owner' })),
                        ...(inventory.associates || []).map(a => ({ id: a.contact?._id, name: a.contact?.name || a.name, mobile: a.contact?.phones?.[0]?.number || a.mobile, role: 'Associate', relationship: a.relationship }))
                    ] : []}
                    onSave={async (newOwners) => {
                        if (!inventory || !inventory._id) {
                            toast.error("Please link an inventory to this deal first to manage owner group.");
                            return;
                        }
                        const inventoryId = inventory._id || inventory.id;
                        const currentOwnersIds = (inventory.owners || []).map(o => o._id || o.id);
                        const currentAssociatesIds = (inventory.associates || []).map(a => a.contact?._id || a.contact?.id || a.id);
                        const allCurrentIds = [...currentOwnersIds, ...currentAssociatesIds];

                        const historyEntries = [];
                        
                        // Track additions
                        newOwners.forEach(no => {
                            if (!allCurrentIds.includes(no.id)) {
                                historyEntries.push({
                                    contactName: no.name,
                                    contactMobile: no.mobile,
                                    contactId: no.id,
                                    role: no.role,
                                    author: user?._id || null,
                                    source: no.source || 'Update data',
                                    date: no.date || new Date().toISOString(),
                                    type: 'Added'
                                });
                            }
                        });

                        // Track removals
                        const newOwnersIds = newOwners.map(no => no.id);
                        [...(inventory.owners || []), ...(inventory.associates || [])].forEach(old => {
                            const oldId = old._id || old.id || (old.contact?._id || old.contact?.id);
                            if (oldId && !newOwnersIds.includes(oldId)) {
                                historyEntries.push({
                                    contactName: old.name || old.contact?.name || 'Unknown',
                                    contactMobile: old.mobile || old.contact?.mobile || (old.contact?.phones?.[0]?.number) || '',
                                    contactId: oldId,
                                    role: old.role || (old.contact ? 'Associate' : 'Property Owner'),
                                    author: user?._id || null,
                                    source: 'Removed from current profile',
                                    date: new Date().toISOString(),
                                    type: 'Removed'
                                });
                            }
                        });

                        const updates = {
                            owners: newOwners.filter(o => o.role === 'Property Owner').map(o => o.id),
                            associates: newOwners.filter(o => o.role === 'Associate').map(o => ({ contact: o.id, relationship: o.relationship })),
                            ownerHistory: [...(inventory.ownerHistory || []), ...historyEntries]
                        };

                        const res = await api.put(`inventory/${inventoryId}`, updates);
                        if (res.data?.success) {
                            toast.success("Contacts updated");
                            fetchDealDetails();
                            setIsOwnerModalOpen(false);
                        }
                    }}
                />
            )}

            <SocialPostModal
                isOpen={isSocialModalOpen}
                onClose={() => setIsSocialModalOpen(false)}
                initialData={deal ? {
                    id: deal._id,
                    name: `${deal.projectName?.name || deal.projectName || 'Premium Property'} - ${deal.unitNo}`,
                    title: `${deal.unitNo} | ${deal.projectName?.name || deal.projectName || 'Exclusive Listing'}`,
                    location: deal.location || deal.address?.location || inventory?.address?.location || 'Prime Location',
                    price: deal.price ? formatIndianCurrency(deal.price) : (inventory?.price ? formatIndianCurrency(inventory.price) : "Contact for Price"),
                    description: deal.notes || inventory?.description || `Excited to showcase this high-potential listing at ${deal.projectName?.name || deal.projectName || 'our latest project'}. View details of Unit ${deal.unitNo} now!`,
                    imageUrl: deal.primaryImage || (inventory?.media?.[0]?.url) || (inventory?.images?.[0]) || deal.projectId?.primaryImage
                } : null}
            />

            {isPublishModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)' }}>
                    <div style={{ background: '#fff', width: '95%', maxWidth: '600px', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                        
                        {/* Header */}
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '38px', height: '38px', background: '#eff6ff', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <i className="fas fa-globe" style={{ color: '#2563eb', fontSize: '1.1rem' }}></i>
                                </div>
                                <div>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Website Publishing Settings</h3>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>Configure privacy and listing description</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setIsPublishModalOpen(false)} 
                                style={{ border: 'none', background: 'transparent', fontSize: '1.2rem', color: '#94a3b8', cursor: 'pointer' }}
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        {/* Body */}
                        <div style={{ padding: '24px', overflowY: 'auto', maxHeight: '70vh', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            
                            {/* Privacy Settings Card */}
                            <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                <h5 style={{ margin: '0 0 14px 0', fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <i className="fas fa-shield-alt" style={{ color: '#2563eb' }}></i> Privacy & Display Settings
                                </h5>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', display: 'block' }}>Display Unit Number</span>
                                            <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Show the exact unit number on the public website.</span>
                                        </div>
                                        <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '40px', height: '20px' }}>
                                            <input 
                                                type="checkbox" 
                                                checked={publishFormShareUnitNumber}
                                                onChange={(e) => setPublishFormShareUnitNumber(e.target.checked)}
                                                style={{ opacity: 0, width: 0, height: 0 }}
                                            />
                                            <span className="slider round" style={{
                                                position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                                                backgroundColor: publishFormShareUnitNumber ? '#2563eb' : '#cbd5e1',
                                                transition: '.4s', borderRadius: '20px'
                                            }}>
                                                <span style={{
                                                    position: 'absolute', content: '""', height: '14px', width: '14px', left: publishFormShareUnitNumber ? '22px' : '3px', bottom: '3px',
                                                    backgroundColor: 'white', transition: '.4s', borderRadius: '50%'
                                                }} />
                                            </span>
                                        </label>
                                    </div>
                                    
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px dashed #e2e8f0', paddingTop: '12px' }}>
                                        <div>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', display: 'block' }}>Display Map Location</span>
                                            <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Share precise geographical details on website maps.</span>
                                        </div>
                                        <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '40px', height: '20px' }}>
                                            <input 
                                                type="checkbox" 
                                                checked={publishFormShareLocation}
                                                onChange={(e) => setPublishFormShareLocation(e.target.checked)}
                                                style={{ opacity: 0, width: 0, height: 0 }}
                                            />
                                            <span className="slider round" style={{
                                                position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                                                backgroundColor: publishFormShareLocation ? '#2563eb' : '#cbd5e1',
                                                transition: '.4s', borderRadius: '20px'
                                            }}>
                                                <span style={{
                                                    position: 'absolute', content: '""', height: '14px', width: '14px', left: publishFormShareLocation ? '22px' : '3px', bottom: '3px',
                                                    backgroundColor: 'white', transition: '.4s', borderRadius: '50%'
                                                }} />
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* AI Listing Description Card */}
                            <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '120px', height: '120px', background: 'radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, rgba(255,255,255,0) 70%)', pointerEvents: 'none' }}></div>
                                
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <label style={{ fontSize: '0.85rem', color: '#1e293b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="fas fa-globe text-blue-600"></i> Public Website Listing Description
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleGenerateAiDescription}
                                        disabled={isGeneratingAi}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '6px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid #c7d2fe',
                                            background: 'linear-gradient(135deg, #e0e7ff 0%, #eef2ff 100%)',
                                            color: '#4f46e5',
                                            fontSize: '0.72rem',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                            boxShadow: '0 2px 4px rgba(79, 70, 229, 0.1)',
                                            transition: 'all 0.2s',
                                            opacity: isGeneratingAi ? 0.7 : 1
                                        }}
                                    >
                                        <i className={isGeneratingAi ? "fas fa-spinner fa-spin" : "fas fa-magic"}></i>
                                        {isGeneratingAi ? "Generating listing..." : "Generate with AI"}
                                    </button>
                                </div>
                                
                                <textarea
                                    style={{ 
                                        width: '100%', 
                                        padding: '10px 12px', 
                                        borderRadius: '8px', 
                                        border: '1px solid #cbd5e1', 
                                        fontSize: '0.85rem', 
                                        outline: 'none', 
                                        minHeight: '160px', 
                                        resize: 'vertical', 
                                        background: '#fff', 
                                        lineHeight: '1.5' 
                                    }}
                                    value={publishFormDescription}
                                    onChange={e => setPublishFormDescription(e.target.value)}
                                    placeholder="Write a premium description for the public website. (Tip: Use the AI Generator above to draft an engaging, high-converting listing automatically using your selected property details!)"
                                />
                                
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                                    <i className="fas fa-info-circle text-blue-500"></i>
                                    <span>This description will be published to the public portal for prospective buyers.</span>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#fff' }}>
                            <button 
                                onClick={() => setIsPublishModalOpen(false)} 
                                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}
                            >
                                Cancel
                            </button>
                            {deal.isPublished && (
                                <button
                                    onClick={handleUnpublishListing}
                                    disabled={savingPublishSettings}
                                    style={{
                                        padding: '8px 16px', borderRadius: '8px', border: '1px solid #fca5a5', background: '#fef2f2', color: '#ef4444', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem',
                                        opacity: savingPublishSettings ? 0.7 : 1
                                    }}
                                >
                                    {savingPublishSettings ? 'Updating...' : 'Unpublish Listing'}
                                </button>
                            )}
                            <button
                                onClick={() => handleSavePublishSettings(true)}
                                disabled={savingPublishSettings}
                                style={{
                                    padding: '8px 20px', borderRadius: '8px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem',
                                    opacity: savingPublishSettings ? 0.7 : 1
                                }}
                            >
                                {savingPublishSettings ? 'Saving...' : (deal.isPublished ? 'Save Settings' : 'Publish Listing')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};


const LifecycleMetric = ({ label, value, icon, color }) => (
    <div style={{ padding: '10px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <i className={`fas fa-${icon}`} style={{ fontSize: '0.6rem', color: color }}></i>
            <span style={{ fontSize: '0.5rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>{label}</span>
        </div>
        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1e293b' }}>{value}</div>
    </div>
);

export default DealDetailPage;
