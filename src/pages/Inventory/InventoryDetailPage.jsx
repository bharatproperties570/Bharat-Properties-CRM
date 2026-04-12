import React, { useState, useCallback, useMemo } from 'react';
import { renderValue } from '../../utils/renderUtils';
import { getInitials, fixDriveUrl, getYoutubeId } from '../../utils/helpers';
import { useUserContext } from '../../context/UserContext';
import { useTriggers } from '../../context/TriggersContext';
import { useCall } from '../../context/CallContext';
import { usePropertyConfig } from '../../context/PropertyConfigContext';
import { api } from "../../utils/api";
import toast from 'react-hot-toast';

// Custom Hooks
import { useInventoryDetails } from '../../hooks/useInventoryDetails';
import { useInventoryActions } from '../../hooks/useInventoryActions';

// Inventory Components
import InventoryDetailHeader from './components/InventoryDetailHeader';
import InventorySpecsPanel from '../Inventory/components/InventorySpecsPanel';
import LocationDetailsCard from '../Inventory/components/LocationDetailsCard';
import BuiltupDetailsCard from '../Inventory/components/BuiltupDetailsCard';
import MatchedLeadsCard from '../../components/MatchedLeadsCard';
import InventorySidebar from './components/InventorySidebar';
import UnifiedActivitySection from '../../components/Activities/UnifiedActivitySection';

// Modals
import UploadModal from '../../components/UploadModal';
import AddInventoryDocumentModal from '../../components/AddInventoryDocumentModal';
import AddInventoryModal from '../../components/AddInventoryModal';
import AddOwnerModal from '../../components/AddOwnerModal';
import ComposeEmailModal from '../Communication/components/ComposeEmailModal';
import SendMessageModal from '../../components/SendMessageModal';
import InventoryFeedbackModal from '../../components/InventoryFeedbackModal';
import ManageTagsModal from '../../components/ManageTagsModal';

export default function InventoryDetailPage({ inventoryId, onBack, onAddActivity, onAddDeal, onNavigate }) {
    useUserContext();
    useTriggers();
    const { user } = useUserContext();
    const { startCall } = useCall();
    const { getLookupValue } = usePropertyConfig();

    // -- Data Hook --
    const {
        inventory,
        setInventory,
        loading,
        matchingLeads,
        activeLeadsCount,
        refresh
    } = useInventoryDetails(inventoryId);

    // -- Actions Hook --
    const {
        isCopying,
        handleWhatsAppShare,
        handleCopyDetails,
        handleCreateDeal,
        handleToggleIntent
    } = useInventoryActions(inventory, setInventory, null, onAddDeal);

    // -- Local UI State --
    // const [activeTab, setActiveTab] = useState('details');
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isOwnerModalOpen, setIsOwnerModalOpen] = useState(false);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
    const [isTagsModalOpen, setIsTagsModalOpen] = useState(false);
    const [modalData, setModalData] = useState(null);
    const [feedbackContext, setFeedbackContext] = useState(null); // Track Sell/Rent/Lease intent during feedback
    const [mediaViewer, setMediaViewer] = useState({ isOpen: false, data: null });
    // const [contactPicker, setContactPicker] = useState({ isOpen: false, type: 'call', contacts: [] });

    // -- Handlers --
    const getTargetContacts = useCallback(() => {
        if (!inventory) return [];
        const targets = [];
        if (inventory.owners?.length > 0) {
            inventory.owners.forEach(o => targets.push({ name: o.name, mobile: o.phones?.[0]?.number || o.mobile, email: o.emails?.[0]?.address || o.email }));
        } else if (inventory.ownerName) {
            targets.push({ name: inventory.ownerName, mobile: inventory.ownerPhone, email: inventory.ownerEmail });
        }
        if (inventory.associates?.length > 0) {
            inventory.associates.forEach(a => targets.push({ name: a.contact?.name || a.name, mobile: a.contact?.phones?.[0]?.number || a.mobile, email: a.contact?.emails?.[0]?.address || a.email }));
        } else if (inventory.associatedContact) {
            targets.push({ name: inventory.associatedContact, mobile: inventory.associatedPhone, email: inventory.associatedEmail });
        }
        return targets;
    }, [inventory]);

    const handleMessageClick = () => {
        const targets = getTargetContacts();
        if (targets.length > 0) {
            setModalData(targets);
            setIsMessageModalOpen(true);
        }
    };

    const handleEmailClick = () => {
        const targets = getTargetContacts();
        if (targets.length > 0) {
            setModalData(targets);
            setIsEmailModalOpen(true);
        }
    };

    const handleTransactionFeedback = (type) => {
        setFeedbackContext(type);
        setIsFeedbackModalOpen(true);
    };

    const handleSaveFeedback = async (data) => {
        try {
            // 1. Calculate Status Update
            const isInactive = data.markAsSold || ['Not Interested', 'Wrong Number / Invalid'].includes(data.result);
            const targetStatus = isInactive ? 'Inactive' : 'Active';

            // 2. Intent Update (If engaged via Transaction buttons)
            let newIntents = [...(inventory.intent || [])].map(i => (i && typeof i === 'object' ? i.lookup_value : i));
            if (feedbackContext && !isInactive && (data.result.includes('Interested') || data.result === 'Interested')) {
                if (!newIntents.includes(feedbackContext)) {
                    newIntents.push(feedbackContext);
                }
            }

            const updates = {
                remarks: `${data.result}${data.reason ? ` (${data.reason})` : ''}: ${data.feedback}`,
                status: targetStatus,
                intent: newIntents,
                lastContactDate: new Date().toLocaleDateString('en-GB'),
                lastContactUser: 'You'
            };

            const response = await api.put(`inventory/${inventoryId}`, updates);
            if (response.data?.success) {
                toast.success(`Feedback recorded - Property is now ${targetStatus}`);
                refresh();
                setIsFeedbackModalOpen(false);

                // 3. Automated Deal Trigger
                if (feedbackContext && ['Ready to Sell Now', 'High Intent (Urgent)', 'For Sale', 'For Rent', 'For Lease'].includes(data.reason)) {
                    toast.success(`Initiating ${feedbackContext} Deal...`);
                    handleCreateDeal(feedbackContext);
                }
                
                setFeedbackContext(null); // Reset context
            }
        } catch (error) {
            console.error("Error saving feedback:", error);
            toast.error("Failed to save feedback");
        }
    };

    if (loading || !inventory) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc' }}>
                <div className="loader"></div>
            </div>
        );
    }

    return (
        <div style={{ background: '#f8fafc', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <style>
                {`
                    :root {
                        --premium-blue: #4f46e5;
                        --premium-blue-glow: rgba(79, 70, 229, 0.15);
                        --glass-bg: rgba(255, 255, 255, 0.75);
                        --glass-border: rgba(255, 255, 255, 0.4);
                        --soft-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.04);
                    }
                    .glass-card {
                        background: var(--glass-bg);
                        backdrop-filter: blur(12px);
                        -webkit-backdrop-filter: blur(12px);
                        border: 1px solid var(--glass-border);
                        box-shadow: var(--soft-shadow);
                        transition: all 0.3s ease;
                        border-radius: 24px;
                        padding: 24px;
                    }
                    .glass-card:hover {
                        box-shadow: 0 12px 40px 0 rgba(31, 38, 135, 0.08);
                        transform: translateY(-2px);
                    }
                    .no-scrollbar::-webkit-scrollbar { display: none; }
                    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                `}
            </style>

            <InventoryDetailHeader 
                inventory={inventory}
                onBack={onBack}
                getLookupValue={getLookupValue}
                handleMessageClick={handleMessageClick}
                handleEmailClick={handleEmailClick}
                handleMoreMenuClick={() => setShowMoreMenu(!showMoreMenu)}
                showMoreMenu={showMoreMenu}
                handleDocumentClick={() => setIsDocumentModalOpen(true)}
                handleUploadClick={() => setIsUploadModalOpen(true)}
                handleFeedbackClick={() => setIsFeedbackModalOpen(true)}
                handleTagsClick={() => setIsTagsModalOpen(true)}
                handleWhatsAppShare={handleWhatsAppShare}
                handleCopyDetails={handleCopyDetails}
                isCopying={isCopying}
                startCall={startCall}
                getTargetContacts={getTargetContacts}
            />

            <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* LEFT COLUMN - Primary Specs & Activity (1.5) */}
                <div className="no-scrollbar" style={{ flex: 1.5, overflowY: 'auto', padding: '24px 32px', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {(() => {
                        const activeStatusNames = ['Available', 'Active', 'Interested / Warm', 'Interested / Hot', 'Request Call Back', 'Busy / Driving', 'Market Feedback', 'General Inquiry', 'Blocked', 'Booked', 'Interested'];
                        const rawStatus = getLookupValue('Status', inventory.status) || 'Available';
                        const isActive = activeStatusNames.includes(rawStatus) || !rawStatus || rawStatus === '-';

                        return (
                            <InventorySpecsPanel 
                                inventory={inventory}
                                getLookupValue={getLookupValue}
                                handleToggleIntent={handleToggleIntent}
                                handleCreateDeal={handleCreateDeal}
                                onFeedback={handleTransactionFeedback}
                                isInventoryActive={isActive}
                            />
                        );
                    })()}

                    <LocationDetailsCard 
                        inventory={inventory} 
                        getLookupValue={getLookupValue} 
                        onUpdateLocation={() => setIsEditModalOpen(true)}
                    />
                    <BuiltupDetailsCard inventory={inventory} getLookupValue={getLookupValue} />

                    {/* Activities Timeline Section in Main Column */}
                    <div style={{ marginTop: '8px' }}>
                        {(() => {
                            const relatedEntities = [
                                { type: 'Inventory', id: inventoryId }
                            ];
                            if (inventory.owners && Array.isArray(inventory.owners)) {
                                inventory.owners.forEach(o => { if (o._id || o.id) relatedEntities.push({ type: 'Contact', id: o._id || o.id }); });
                            }
                            if (inventory.associates && Array.isArray(inventory.associates)) {
                                inventory.associates.forEach(a => {
                                    const cId = a.contact?._id || a.contact?.id || a.id;
                                    if (cId) relatedEntities.push({ type: 'Contact', id: cId });
                                });
                            }

                            return (
                                <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                                    <UnifiedActivitySection 
                                        entityId={inventoryId} 
                                        entityType="Inventory" 
                                        entityData={inventory}
                                        onActivitySaved={refresh}
                                        hideComposer={true}
                                        relatedEntities={relatedEntities}
                                    />
                                </div>
                            );
                        })()}
                    </div>
                </div>

                {/* RIGHT COLUMN - Secondary Stats & Owners (1) */}
                <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', background: '#fff', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <MatchedLeadsCard 
                        matchingLeads={matchingLeads}
                        onNavigate={onNavigate}
                        entityId={inventoryId}
                        entityType="inventory"
                    />
                    
                    <InventorySidebar 
                        inventory={inventory}
                        activeLeadsCount={activeLeadsCount}
                        onOwnerClick={() => setIsOwnerModalOpen(true)}
                        onDocumentClick={() => setIsDocumentModalOpen(true)}
                        onUploadClick={() => setIsUploadModalOpen(true)}
                        onMediaClick={() => setIsUploadModalOpen(true)}
                        onMediaView={(data) => {
                            console.log('Parent onMediaView called with:', data);
                            setMediaViewer({ isOpen: true, data });
                        }}
                    />
                </div>
            </main>

            {/* Modals */}
            <AddInventoryModal 
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                editData={inventory}
                onSuccess={refresh}
            />

            <UploadModal 
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                entityId={inventoryId}
                entityType="Inventory"
                project={inventory}
                onSuccess={refresh}
            />

            <AddInventoryDocumentModal 
                isOpen={isDocumentModalOpen}
                onClose={() => setIsDocumentModalOpen(false)}
                project={inventory}
                onSave={async (newDocs) => {
                    try {
                        const updates = {
                            inventoryDocuments: [
                                ...newDocs.map(d => ({
                                    documentNumber: d.documentNumber || 'Document',
                                    documentName: d.documentNumber || 'Document',
                                    documentCategory: d.documentName,
                                    documentType: d.documentType,
                                    url: d.url,
                                    linkedContactMobile: d.linkedContactMobile,
                                })),
                                ...(inventory.inventoryDocuments || inventory.documents || [])
                            ]
                        };
                        const response = await api.put(`inventory/${inventoryId}`, updates);
                        if (response.data?.success) {
                            toast.success("Documents archived");
                            refresh();
                            setIsDocumentModalOpen(false);
                        }
                    } catch (error) {
                        console.error("Error saving documents", error);
                        toast.error("Cloud storage sync failed");
                    }
                }}
                onSuccess={refresh}
            />

            <AddOwnerModal 
                isOpen={isOwnerModalOpen}
                onClose={() => setIsOwnerModalOpen(false)}
                currentOwners={[
                    ...(inventory.owners || []).map(o => ({ id: o._id, name: o.name, mobile: o.phones?.[0]?.number || o.mobile, role: 'Property Owner' })),
                    ...(inventory.associates || []).map(a => ({ id: a.contact?._id, name: a.contact?.name || a.name, mobile: a.contact?.phones?.[0]?.number || a.mobile, role: 'Associate', relationship: a.relationship }))
                ]}
                onSave={async (newOwners) => {
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
                        refresh();
                        setIsOwnerModalOpen(false);
                    }
                }}
            />

            <ComposeEmailModal 
                isOpen={isEmailModalOpen}
                onClose={() => setIsEmailModalOpen(false)}
                recipients={modalData}
            />

            <SendMessageModal 
                isOpen={isMessageModalOpen}
                onClose={() => setIsMessageModalOpen(false)}
                initialRecipients={modalData || []}
                initialProperty={inventory}
            />

            <InventoryFeedbackModal 
                isOpen={isFeedbackModalOpen}
                onClose={() => {
                    setIsFeedbackModalOpen(false);
                    setFeedbackContext(null);
                }}
                inventory={inventory}
                onSave={handleSaveFeedback}
                initialIntent={feedbackContext}
            />

            <ManageTagsModal 
                isOpen={isTagsModalOpen}
                onClose={() => setIsTagsModalOpen(false)}
                selectedContacts={[{ id: inventory._id, tags: inventory.tags || '-' }]}
                onUpdateTags={async (data) => {
                    const res = await api.put(`inventory/${inventoryId}`, { tags: data.tags.join(', ') });
                    if (res.data?.success) {
                        toast.success("Tags updated");
                        refresh();
                        setIsTagsModalOpen(false);
                    }
                }}
            />

            {mediaViewer.isOpen && (
                <MediaViewerModal 
                    data={mediaViewer.data}
                    onClose={() => setMediaViewer({ isOpen: false, data: null })}
                />
            )}
        </div>
    );
}

// Media Viewer Internal Component (Keep here as it's small)
const MediaViewerModal = ({ data, onClose }) => {
    console.log('MediaViewerModal Rendering with data:', data);
    const embedUrl = useMemo(() => {
        if (!data || !data.url) return null;
        const ytId = data.ytId || getYoutubeId(data.url);
        if (ytId) return `https://www.youtube.com/embed/${ytId}?autoplay=1`;
        if (data.url.includes('drive.google.com')) {
            // Transform Drive links for iframe preview
            return data.url.replace('/view', '/preview').replace('/edit', '/preview');
        }
        return fixDriveUrl(data.url);
    }, [data]);

    if (!data) return null;

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }}>
            <button onClick={onClose} style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', zIndex: 10001 }}>
                <i className="fas fa-times"></i>
            </button>
            <div style={{ maxWidth: '90%', maxHeight: '80%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {data.type === 'image' ? (
                        <img 
                            src={fixDriveUrl(data.url || data.previewUrl)} 
                            alt="media" 
                            style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain' }} 
                        />
                    ) : (
                        <div style={{ width: 'min(90vw, 1000px)', aspectRatio: '16/9' }}>
                            <iframe 
                                width="100%" 
                                height="100%" 
                                src={embedUrl} 
                                frameBorder="0" 
                                allowFullScreen 
                                allow="autoplay; encrypted-media"
                                style={{ border: 'none' }}
                            ></iframe>
                        </div>
                    )}
                </div>
                
                <div style={{ marginTop: '24px', textAlign: 'center', color: '#fff' }}>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '1.2rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
                        {data.title || (data.type === 'video' ? 'Property Video' : 'Property Image')}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: 0.8 }}>
                        <i className={`fas fa-${data.type === 'video' ? 'video' : 'camera'}`} style={{ fontSize: '0.7rem' }}></i>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            {data.category || 'Media Archive'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};
