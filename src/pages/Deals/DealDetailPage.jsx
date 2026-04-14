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
import { usePropertyConfig } from '../../context/PropertyConfigContext';
import { renderValue } from '../../utils/renderUtils';
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
    const [isActivityOpen, setIsActivityOpen] = useState(false);
    const [isOwnerModalOpen, setIsOwnerModalOpen] = useState(false);
    const [isMarkingLost, setIsMarkingLost] = useState(false);
    const [isSocialModalOpen, setIsSocialModalOpen] = useState(false);

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
                note: newOffer.note
            };
            const response = await api.post(`deals/${dealId}/offers`, offerData);
            if (response.data && response.data.success) {
                toast.success("Offer added successfully");
                fetchDealDetails();
            }
        } catch (error) {
            console.error("Error adding offer:", error);
            toast.error("Failed to add offer");
        }
    };
    
    const handleSocialClick = () => {
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
            const res = await api.get(`deals/${dealId}`);
            if (res.data && (res.data.success || res.data.status === 'success')) {
                const dealData = res.data.data;
                setDeal(dealData);

                // Fetch Inventory if available
                const invId = dealData.inventoryId?._id || (typeof dealData.inventoryId === 'string' ? dealData.inventoryId : null);
                if (invId) {
                    api.get(`inventory/${invId}`)
                        .then(invRes => { if (invRes.data?.success) setInventory(invRes.data.data); })
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

    const handleTogglePublish = async () => {
        const newStatus = !deal.isPublished;
        let shareUnitNumber = deal.websiteMetadata?.shareUnitNumber || false;
        let shareLocation = deal.websiteMetadata?.shareLocation || false;

        if (newStatus) {
            const unitResult = await Swal.fire({
                title: 'Unit Number Privacy',
                text: "Do you want to share the Unit Number publicly on the website?",
                icon: 'question',
                showCancelButton: true,
                showDenyButton: true,
                confirmButtonColor: '#3b82f6',
                denyButtonColor: '#64748b',
                confirmButtonText: 'Yes, Share Unit No',
                denyButtonText: 'No, Keep Confidential',
                cancelButtonText: 'Cancel Toggle'
            });

            if (unitResult.isDismissed && !unitResult.isDenied) return;
            shareUnitNumber = unitResult.isConfirmed;

            const locationResult = await Swal.fire({
                title: 'Location Privacy',
                text: "Do you want to share the exact House/Plot Number and Street publicly?",
                icon: 'question',
                showCancelButton: true,
                showDenyButton: true,
                confirmButtonColor: '#3b82f6',
                denyButtonColor: '#64748b',
                confirmButtonText: 'Yes, Share Location',
                denyButtonText: 'No, Keep Confidential',
                cancelButtonText: 'Cancel Toggle'
            });

            if (locationResult.isDismissed && !locationResult.isDenied) return;
            shareLocation = locationResult.isConfirmed;
        }

        try {
            const payload = {
                isPublished: newStatus,
                publishedAt: newStatus ? new Date() : null,
                websiteMetadata: {
                    ...deal.websiteMetadata,
                    shareUnitNumber: shareUnitNumber,
                    shareLocation: shareLocation
                }
            };

            const res = await api.put(`deals/${dealId}`, payload);
            if (res.data && (res.data.success || res.data.status === 'success')) {
                setDeal(prev => ({ 
                    ...prev, 
                    isPublished: newStatus,
                    websiteMetadata: payload.websiteMetadata
                }));
                toast.success(newStatus ? 'Listing published to Website!' : 'Listing removed from Website');
            }
        } catch (error) {
            console.error("Error toggling publication:", error);
            toast.error('Error updating publication status');
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

    const fetchMatchingLeads = useCallback(async (inventoryId) => {
        try {
            const response = await api.get(`inventory/match?inventoryId=${inventoryId}`);
            if (response.data && response.data.success) {
                const mapped = (response.data.data || []).map(l => ({
                    ...l,
                    name: l.name || (l.contactDetails ? `${l.contactDetails.name || ''} ${l.contactDetails.surname || ''}`.trim() : 'Unknown'),
                    mobile: l.mobile || l.phone || (l.contactDetails?.phones?.[0]?.number) || ''
                }));
                setMatchingLeads(mapped);
            }
        } catch (error) {
            console.error("Error fetching matching leads:", error);
        }
    }, []);

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


    // Effects (RESTORING MISSING DATA FETCHING)
    useEffect(() => {
        fetchDealDetails();
        fetchLiveScore();
        fetchAllLeads();
    }, [dealId, fetchDealDetails, fetchLiveScore, fetchAllLeads]);

    useEffect(() => {
        const invId = deal?.inventoryId?._id || (typeof deal?.inventoryId === 'string' ? deal.inventoryId : null);
        if (invId) {
            fetchMatchingLeads(invId);
        }
    }, [deal, fetchMatchingLeads]);

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
                    if (val) startCall(deal.contactId, { entityId: dealId, entityType: 'Deal' });
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
                handleSocialClick={handleSocialClick}
                enrichDealIntelligence={enrichDealIntelligence}
                fetchDealDetails={fetchDealDetails}
                getLookupValue={getLookupValue}
                onNavigate={onNavigate}
            />

            {/* MAIN CONTENT SPLIT - 3 COLUMN LAYOUT */}
            <div style={{ maxWidth: '100%', margin: '12px auto', padding: '0 24px', display: 'flex', gap: '16px', height: 'calc(100vh - 120px)', overflow: 'hidden' }}>
                
                {/* COLUMN 1: LEFT - UNIT & LOCATION INTELLIGENCE (400px) */}
                <div className="no-scrollbar" style={{ flex: '0 0 400px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', paddingBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <i className="fas fa-building" style={{ color: '#4f46e5' }}></i>
                        <span style={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Unit & Location Intelligence</span>
                    </div>

                    {inventory ? (
                        <>
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
                        </>
                    ) : (
                        <>
                            <DealTechnicalSpecs 
                                deal={deal} 
                                getLookupValue={getLookupValue}
                                getStrictLookupValue={(field, val) => getLookupValue(field, val)}
                            />

                            <DealGeography 
                                deal={deal} 
                                getLookupValue={getLookupValue} 
                            />

                            <DealBuiltupDetails 
                                deal={deal} 
                                getLookupValue={getLookupValue} 
                            />
                        </>
                    )}
                </div>

                {/* COLUMN 2: CENTER - INTERACTION INTELLIGENCE */}
                <div className="no-scrollbar" style={{ flex: '1', display: 'flex', flexDirection: 'column', background: '#f8fafc', overflowY: 'auto', minWidth: '0', position: 'relative' }}>
                    <div className="glass-card" style={{ 
                        background: '#fff',
                        borderRadius: '16px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: '100%'
                    }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#fff', display: 'flex', alignItems: 'center', gap: '8px', borderTopLeftRadius: '16px', borderTopRightRadius: '16px' }}>
                            <i className="fas fa-bolt" style={{ color: '#4f46e5' }}></i>
                            <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Interaction Intelligence</span>
                        </div>
                        <div style={{ padding: '20px', flex: 1 }}>
                            {(() => {
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
                                        hideComposer={true}
                                        relatedEntities={relatedEntities}
                                    />
                                );
                            })()}
                        </div>
                    </div>
                </div>

                {/* COLUMN 3: RIGHT - PRICING & LOGISTICS */}
                <div className="no-scrollbar" style={{ flex: '0 0 400px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', paddingBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <i className="fas fa-file-invoice-dollar" style={{ color: '#4f46e5' }}></i>
                        <span style={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pricing & Logistics</span>
                    </div>

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

                    <LandedCostSheet financials={financials} deal={deal} />

                    <MatchedLeadsCard 
                        matchingLeads={matchingLeads} 
                        onNavigate={onNavigate} 
                        entityId={dealId}
                        entityType="deal"
                    />

                    <PropertyOwnerSection 
                        inventory={inventory || { _id: null, owners: [], associates: [] }} 
                        onOwnerClick={() => setIsOwnerModalOpen(true)}
                    />

                    <MediaVaultSection 
                        inventory={inventory}
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
                />
            )}

            <MediaViewerModal 
                isOpen={mediaViewer.isOpen} 
                onClose={() => setMediaViewer({ isOpen: false, data: null })} 
                data={mediaViewer.data} 
            />

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
