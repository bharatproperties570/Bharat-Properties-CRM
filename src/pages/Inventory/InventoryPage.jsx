import { useState, useCallback, useEffect } from 'react';
import { renderValue } from '../../utils/renderUtils';
import { useUserContext } from '../../context/UserContext';
import { useTriggers } from '../../context/TriggersContext';
import { useCall } from '../../context/CallContext';
import { usePropertyConfig } from '../../context/PropertyConfigContext';
import { api } from "../../utils/api";
import toast from 'react-hot-toast';

// Custom Hooks
import { useInventoryList } from '../../hooks/useInventoryList';

// Modular Components
import InventoryPageHeader from './components/InventoryPageHeader';
import InventoryStatsBar from './components/InventoryStatsBar';
import InventoryToolbar from './components/InventoryToolbar';
import InventoryTable from './components/InventoryTable';
import ProfessionalMap from '../../components/ProfessionalMap';
import InventoryMapList from './components/InventoryMapList';

// Modals
import UploadModal from '../../components/UploadModal';
import AddInventoryDocumentModal from '../../components/AddInventoryDocumentModal';
import AddInventoryModal from '../../components/AddInventoryModal';
import AddOwnerModal from '../../components/AddOwnerModal';
import ComposeEmailModal from '../Communication/components/ComposeEmailModal';
import SendMessageModal from '../../components/SendMessageModal';
import ManageTagsModal from '../../components/ManageTagsModal';
import InventoryFeedbackModal from '../../components/InventoryFeedbackModal';
import InventoryFilterPanel from './components/InventoryFilterPanel';
import AddDealModal from '../../components/AddDealModal';
import SocialPostModal from '../../components/SocialPostModal';

export default function InventoryPage({ onNavigate, onAddActivity }) {
    const { teams, users } = useUserContext();
    const { fireEvent } = useTriggers();
    useCall();
    const { getLookupValue } = usePropertyConfig();

    // -- Data Hook --
    const {
        inventoryItems,
        loading,
        totalRecords,
        totalPages,
        currentPage,
        setCurrentPage,
        recordsPerPage,
        setRecordsPerPage,
        searchTerm,
        setSearchTerm,
        statusFilter,
        setStatusFilter,
        filters,
        setFilters,
        stats,
        refresh
    } = useInventoryList();

    // -- Local UI State --
    const [viewMode, setViewMode] = useState('list');
    const [selectedIds, setSelectedIds] = useState([]);
    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
    const [selectedProperty, setSelectedProperty] = useState(null);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isOwnerModalOpen, setIsOwnerModalOpen] = useState(false);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
    const [isTagsModalOpen, setIsTagsModalOpen] = useState(false);
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
    const [isAddDealModalOpen, setIsAddDealModalOpen] = useState(false);
    const [selectedDealData, setSelectedDealData] = useState(null);
    const [modalData, setModalData] = useState([]);
    
    // -- Social Sharing State --
    const [isSocialModalOpen, setIsSocialModalOpen] = useState(false);
    const [socialMediaData, setSocialMediaData] = useState(null);

    // -- Derived Handlers --
    const getTeamName = useCallback((tv) => {
        if (!tv) return "";
        // Case A: tv is a populated object
        if (typeof tv === 'object') {
            const name = tv.name || tv.lookup_value || tv.displayName || "";
            if (name) return String(renderValue(name));
        }
        // Case B: tv is an ID string
        const found = teams.find(t => (t._id === tv) || (t.id === tv));
        const name = found ? (found.name || found.lookup_value) : (typeof tv === 'string' ? tv : "");
        return String(renderValue(name));
    }, [teams]);

    const getUserName = useCallback((uv) => {
        if (!uv) return "";
        const found = users.find(u => (u._id === uv) || (u.id === uv));
        const name = found ? (found.fullName || found.name || found.username) : (typeof uv === 'object' ? (uv.fullName || uv.name || uv.username || "") : "");
        return String(renderValue(name));
    }, [users]);

    const getSelectedPropertyObj = () => inventoryItems.find(p => p._id === selectedIds[0]);

    const handleDelete = async () => {
        if (!window.confirm(`Delete ${selectedIds.length} properties?`)) return;
        try {
            await api.post(`inventory/bulk-delete`, { ids: selectedIds });
            toast.success("Deleted successfully");
            setSelectedIds([]);
            refresh();
        } catch (error) {
            toast.error("Failed to delete");
        }
    };

    const handleShowAll = useCallback(() => {
        setStatusFilter('');
        setFilters({});
        setSearchTerm('');
        setCurrentPage(1);
    }, [setStatusFilter, setFilters, setSearchTerm, setCurrentPage]);

    useEffect(() => {
        const handleReset = () => handleShowAll();
        window.addEventListener('inventory-reset', handleReset);
        return () => window.removeEventListener('inventory-reset', handleReset);
    }, [handleShowAll]);

    const handleCreateDeal = () => {
        const p = getSelectedPropertyObj();
        if (p) {
            setSelectedDealData({
                projectName: p.projectName || p.area || '',
                block: p.block || '',
                unitNo: p.unitNo || p.unitNumber || '',
                propertyType: p.category || '',
                size: p.size || '',
                owner: { 
                    _id: p.owners?.[0]?._id || null,
                    name: p.owners?.[0]?.name || p.ownerName || '', 
                    phone: p.owners?.[0]?.phones?.[0]?.number || p.ownerPhone || '',
                    email: p.owners?.[0]?.emails?.[0]?.address || p.ownerEmail || ''
                }
            });
            setIsAddDealModalOpen(true);
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const handleSelectAll = (e) => {
        setSelectedIds(e.target.checked ? inventoryItems.map(i => i._id) : []);
    };

    const handleRowAction = async (type, item) => {
        if (type === 'share') {
            setSocialMediaData({
                id: item._id,
                unitNo: item.unitNo,
                projectName: item.projectName,
                location: renderValue(item.address?.locality || item.address?.area),
                price: item.price || 'Market Rate',
                imageUrl: item.propertyImages?.[0]
            });
            setIsSocialModalOpen(true);
        } else if (type === 'match') {
            onNavigate('inventory-matching', item._id);
        } else if (type === 'edit') {
            setSelectedProperty(item);
            setIsEditModalOpen(true);
        } else if (type === 'delete') {
            if (window.confirm(`Are you sure you want to delete this property?`)) {
                try {
                    await api.delete(`inventory/${item._id}`);
                    toast.success("Property deleted successfully");
                    refresh();
                } catch (error) {
                    toast.error("Failed to delete property");
                }
            }
        }
    };

    return (
        <section id="inventoryView" className="view-section active">
            <div className="view-scroll-wrapper">
                <InventoryPageHeader 
                    viewMode={viewMode}
                    setViewMode={setViewMode}
                    setIsFilterPanelOpen={() => setIsFilterPanelOpen(true)}
                    activeFiltersCount={renderValue(Object.keys(filters).length)}
                    onShowAll={handleShowAll}
                />

                {viewMode === 'list' && (
                    <InventoryStatsBar 
                        statusFilter={statusFilter}
                        setStatusFilter={setStatusFilter}
                        activeCount={stats.active}
                        inactiveCount={stats.inactive}
                        setCurrentPage={setCurrentPage}
                        onNavigate={onNavigate}
                    />
                )}

                <div className="content-body" style={{ overflowY: 'visible', paddingTop: 0 }}>
                    {viewMode === 'list' ? (
                        <>
                            <InventoryToolbar 
                                selectedIds={selectedIds}
                                searchTerm={searchTerm}
                                setSearchTerm={setSearchTerm}
                                totalRecords={totalRecords}
                                recordsPerPage={recordsPerPage}
                                setRecordsPerPage={setRecordsPerPage}
                                currentPage={currentPage}
                                totalPages={totalPages}
                                goToPreviousPage={() => setCurrentPage(p => Math.max(1, p - 1))}
                                goToNextPage={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                loading={loading}
                                inventoryItems={inventoryItems}
                                handleEditClick={() => { setSelectedProperty(getSelectedPropertyObj()); setIsEditModalOpen(true); }}
                                onAddActivity={onAddActivity}
                                handleCreateDeal={handleCreateDeal}
                                handleMatchClick={() => {
                                    const p = getSelectedPropertyObj();
                                    if (p) fireEvent('inventory_matching_requested', p);
                                }}
                                handleOwnerClick={() => { setSelectedProperty(getSelectedPropertyObj()); setIsOwnerModalOpen(true); }}
                                handleMessageClick={() => {
                                    const contacts = selectedIds.map(id => {
                                        const p = inventoryItems.find(item => item._id === id);
                                        return p ? { name: p.owners?.[0]?.name || p.ownerName, mobile: p.owners?.[0]?.phones?.[0]?.number || p.ownerPhone } : null;
                                    }).filter(Boolean);
                                    setModalData(contacts);
                                    setIsMessageModalOpen(true);
                                }}
                                handleEmailClick={() => {
                                    const contacts = selectedIds.map(id => {
                                        const p = inventoryItems.find(item => item._id === id);
                                        return p ? { name: p.owners?.[0]?.name || p.ownerName, email: p.owners?.[0]?.emails?.[0]?.address || p.ownerEmail } : null;
                                    }).filter(Boolean);
                                    setModalData(contacts);
                                    setIsEmailModalOpen(true);
                                }}
                                handleTagClick={() => setIsTagsModalOpen(true)}
                                handleUploadClick={() => { setSelectedProperty(getSelectedPropertyObj()); setIsUploadModalOpen(true); }}
                                handleDocumentClick={() => { setSelectedProperty(getSelectedPropertyObj()); setIsDocumentModalOpen(true); }}
                                handleFeedbackClick={() => { setSelectedProperty(getSelectedPropertyObj()); setIsFeedbackModalOpen(true); }}
                                handleDelete={handleDelete}
                            />
                            <InventoryTable 
                                inventoryItems={inventoryItems}
                                selectedIds={selectedIds}
                                toggleSelect={toggleSelect}
                                handleSelectAll={handleSelectAll}
                                getLookupValue={getLookupValue}
                                onNavigate={onNavigate}
                                getUserName={getUserName}
                                getTeamName={getTeamName}
                                onAction={handleRowAction}
                            />
                        </>
                    ) : (
                        <div style={{ height: 'calc(100vh - 180px)', display: 'flex', position: 'relative', background: '#fff' }}>
                            <InventoryMapList 
                                items={inventoryItems}
                                onItemClick={(id) => onNavigate('inventory-detail', id)}
                                getLookupValue={getLookupValue}
                            />
                            <div style={{ flex: 1, position: 'relative' }}>
                                <ProfessionalMap 
                                    items={inventoryItems}
                                    onMarkerClick={(item) => onNavigate('inventory-detail', item?._id || item)}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <footer className="summary-footer" style={{ height: '55px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', marginTop: 'auto' }}>
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center', padding: '0 2rem', width: '100%', overflowX: 'auto' }}>
                    <div className="summary-label" style={{ background: '#334155', color: '#fff', borderRadius: '8px', fontSize: '0.65rem', padding: '4px 12px', fontWeight: 800, whiteSpace: 'nowrap' }}>SUMMARY</div>
                    {stats?.categories && stats.categories.length > 0 ? (
                        stats.categories.map((stat, idx) => {
                            const colors = ['#6366f1', '#2563eb', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6'];
                            const color = colors[idx % colors.length];
                            const rawLabel = stat.name || stat.category || 'N/A';
                            const label = (typeof rawLabel === 'object' ? (rawLabel.lookup_value || rawLabel.name || 'N/A') : String(rawLabel)).toUpperCase();
                            return (
                                <div key={idx} className="stat-pill" style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                                    <span style={{ color: color, fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase' }}>{label}:</span>
                                    <span className="stat-val-bold" style={{ fontWeight: 800, fontSize: '1.1rem' }}>{renderValue(stat.count)}</span>
                                </div>
                            );
                        })
                    ) : (
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>Calculating distribution...</div>
                    )}
                </div>
            </footer>

            {/* Modals */}
            <InventoryFilterPanel 
                isOpen={isFilterPanelOpen}
                onClose={() => setIsFilterPanelOpen(false)}
                filters={filters}
                onFilterChange={setFilters}
            />

            <AddInventoryModal 
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                property={selectedProperty}
                onSave={refresh}
            />

            <UploadModal 
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                entityId={selectedProperty?._id}
                entityType="Inventory"
                project={selectedProperty}
                onSuccess={refresh}
            />

            <AddInventoryDocumentModal 
                isOpen={isDocumentModalOpen}
                onClose={() => setIsDocumentModalOpen(false)}
                inventoryId={selectedProperty?._id}
                onSuccess={refresh}
            />

            <AddOwnerModal 
                isOpen={isOwnerModalOpen}
                onClose={() => setIsOwnerModalOpen(false)}
                currentOwners={[
                    ...(selectedProperty?.owners || []).map(o => ({ 
                        id: o._id || o.id, 
                        name: o.name, 
                        mobile: o.phones?.[0]?.number || o.mobile, 
                        role: 'Property Owner' 
                    })),
                    ...(selectedProperty?.associates || []).map(a => ({ 
                        id: a.contact?._id || a.contact?.id || a.id, 
                        name: a.contact?.name || a.name, 
                        mobile: a.contact?.phones?.[0]?.number || a.mobile, 
                        role: 'Associate', 
                        relationship: a.relationship 
                    }))
                ]}
                onSave={async (newOwners) => {
                    if (!selectedProperty?._id) return;
                    try {
                        const updates = {
                            owners: newOwners.filter(o => o.role === 'Property Owner').map(o => o.id),
                            associates: newOwners.filter(o => o.role === 'Associate').map(o => ({ 
                                contact: o.id, 
                                relationship: o.relationship 
                            }))
                        };
                        const res = await api.put(`inventory/${selectedProperty._id}`, updates);
                        if (res.data?.success) {
                            toast.success("Owners updated successfully");
                            refresh();
                            setIsOwnerModalOpen(false);
                        }
                    } catch (error) {
                        console.error("Error updating owners:", error);
                        toast.error("Failed to update owners");
                    }
                }}
            />

            <AddDealModal 
                isOpen={isAddDealModalOpen}
                onClose={() => setIsAddDealModalOpen(false)}
                initialData={selectedDealData}
            />

            {isSocialModalOpen && (
                <SocialPostModal
                    isOpen={isSocialModalOpen}
                    onClose={() => setIsSocialModalOpen(false)}
                    initialData={{
                        id: socialMediaData?.id,
                        type: 'Inventory',
                        text: `✨ Exclusive Inventory Spotlight ✨\n\nProperty: ${socialMediaData?.unitNo || 'Prime Unit'} at ${socialMediaData?.projectName || 'Prime Project'}\n📍 Location: ${socialMediaData?.location}\n💎 Status: Ready for Viewing\n\nDirect deal with verified property. DM for more details or to schedule a site visit! #BharatProperties #PremiumHomes #RealEstateIndia`,
                        imageUrl: socialMediaData?.imageUrl || 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=1000'
                    }}
                />
            )}

            <ComposeEmailModal 
                isOpen={isEmailModalOpen}
                onClose={() => setIsEmailModalOpen(false)}
                recipients={modalData}
            />

            <SendMessageModal 
                isOpen={isMessageModalOpen}
                onClose={() => setIsMessageModalOpen(false)}
                initialRecipients={modalData}
            />

            <InventoryFeedbackModal 
                isOpen={isFeedbackModalOpen}
                onClose={() => setIsFeedbackModalOpen(false)}
                inventory={selectedProperty}
                onSave={refresh}
            />

            <ManageTagsModal 
                isOpen={isTagsModalOpen}
                onClose={() => setIsTagsModalOpen(false)}
                selectedContacts={selectedIds.map(id => ({ id }))}
                onUpdateTags={refresh}
            />
        </section>
    );
}
