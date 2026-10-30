import { useTheme } from '../../context/ThemeContext';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { renderValue } from '../../utils/renderUtils';
import { useUserContext } from '../../context/UserContext';
import { useTriggers } from '../../context/TriggersContext';
import { useCall } from '../../context/CallContext';
import { usePropertyConfig } from '../../context/PropertyConfigContext';
import { api } from "../../utils/api";
import toast from 'react-hot-toast';
import { 
    useTeams, 
    useUsers, 
    useInventories, 
    useUpdateInventoryMutation, 
    useDeleteInventoryMutation, 
    useBulkDeleteInventoryMutation 
} from '../../utils/crmHooks';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../utils/queryClient';
import useDebounce from '../../hooks/useDebounce';

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
import BulkUpdateInventoryModal from '../../components/modals/BulkUpdateInventoryModal';
import BulkAuthorityVerificationModal from './components/BulkAuthorityVerificationModal';

const getCategoryColor = (catName) => {
    const norm = String(catName || '').toLowerCase().trim();
    if (norm.includes('resident')) return '#6366f1';
    if (norm.includes('commercial')) return '#2563eb';
    if (norm.includes('industrial')) return '#f59e0b';
    if (norm.includes('institution')) return '#10b981';
    if (norm.includes('agricultur')) return '#ec4899';
    return '#8b5cf6';
};

export default function InventoryPage({ onNavigate, onAddActivity }) {
    const { isDark } = useTheme();
    const { data: users = [] } = useUsers();
    
    const { data: teams = [] } = useTeams();
    const { fireEvent } = useTriggers();
    useCall();
    const { getLookupValue, propertyConfig } = usePropertyConfig();
    const { mutateAsync: updateInventory } = useUpdateInventoryMutation();
    const { mutateAsync: deleteInventory } = useDeleteInventoryMutation();
    const { mutateAsync: bulkDeleteInventory } = useBulkDeleteInventoryMutation();

    const queryClient = useQueryClient();

    // -- Hoisted UI State --
    const [currentPage, setCurrentPage] = useState(1);
    const [recordsPerPage, setRecordsPerPage] = useState(25);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [filters, setFilters] = useState({});
    const [sortConfig, setSortConfig] = useState({ label: 'Unit Sequence', by: 'unitNo', order: 1, icon: 'fa-sort-numeric-down' });

    const debouncedSearchTerm = useDebounce(searchTerm, 300);

    // -- Pagination Reset Logic --
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearchTerm, statusFilter, filters, recordsPerPage, sortConfig]);

    // -- TanStack Canonical Query --
    const queryParams = {
        page: currentPage,
        limit: recordsPerPage,
        search: debouncedSearchTerm.length >= 2 ? debouncedSearchTerm : undefined,
        statusCategory: statusFilter,
        sortBy: sortConfig.by,
        sortOrder: sortConfig.order,
        ...filters
    };

    const isSearchValid = !debouncedSearchTerm || debouncedSearchTerm.length >= 2;

    const { data: inventoryData, isLoading: loading } = useInventories(queryParams, {
        enabled: isSearchValid
    });

    // -- Response Mapping --
    const inventoryItems = inventoryData?.records || [];
    const totalRecords = inventoryData?.totalCount || 0;
    const persistentTotalInventory = useRef(0);
    const persistentCategoryStats = useRef([]);
    if (totalRecords > 0 && (!filters.category || !filters.category.length)) {
        persistentTotalInventory.current = totalRecords;
    }
    if (inventoryData?.categoryStats?.length > 1 && (!filters.category || !filters.category.length)) {
        persistentCategoryStats.current = inventoryData.categoryStats;
    }
    const totalPages = Math.max(inventoryData?.totalPages || 1, 1);
    const stats = {
        active: inventoryData?.activeCount || 0,
        inactive: inventoryData?.inactiveCount || 0,
        categories: (persistentCategoryStats.current && persistentCategoryStats.current.length > 0)
            ? persistentCategoryStats.current
            : (inventoryData?.categoryStats || []),
        subCategories: inventoryData?.subCategoryStats || []
    };

    const activeCategory = React.useMemo(() => {
        if (!filters.category) return null;
        if (Array.isArray(filters.category)) return filters.category[0] || null;
        return filters.category;
    }, [filters.category]);

    const activeSubCategory = React.useMemo(() => {
        if (!filters.subCategory) return null;
        if (Array.isArray(filters.subCategory)) return filters.subCategory[0] || null;
        return filters.subCategory;
    }, [filters.subCategory]);

    const resolvedSubCategories = React.useMemo(() => {
        if (!activeCategory) return [];
        const seen = new Set();
        const list = [];

        (inventoryData?.subCategoryStats || []).forEach(s => {
            if (!s || !s.name) return;
            const norm = String(s.name).toLowerCase().trim();
            seen.add(norm);
            list.push({ name: s.name, count: s.count });
        });

        const configured = propertyConfig?.[activeCategory]?.subCategories || [];
        configured.forEach(sub => {
            const name = typeof sub === 'string' ? sub : (sub.name || sub.lookup_value);
            if (!name) return;
            const norm = String(name).toLowerCase().trim();
            if (!seen.has(norm)) {
                seen.add(norm);
                list.push({ name, count: 0 });
            }
        });

        return list;
    }, [activeCategory, inventoryData?.subCategoryStats, propertyConfig]);

    const refresh = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.inventory.lists() });
    }, [queryClient]);

    // -- Local UI State --
    const [viewMode, setViewMode] = useState('list');
    const [selectedIds, setSelectedIds] = useState([]);
    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
    const [isSortOpen, setIsSortOpen] = useState(false);
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
    const [isBulkUpdateModalOpen, setIsBulkUpdateModalOpen] = useState(false);
    const [isBulkVerifyModalOpen, setIsBulkVerifyModalOpen] = useState(false);
    const [selectedDealData, setSelectedDealData] = useState(null);
    const [modalData, setModalData] = useState([]);
    const [visibleMapItemIds, setVisibleMapItemIds] = useState(null);
    const [activeMapItemId, setActiveMapItemId] = useState(null);
    
    // -- Social Sharing State --
    const [isSocialModalOpen, setIsSocialModalOpen] = useState(false);
    const [socialMediaData, setSocialMediaData] = useState(null);

    // -- Derived Handlers --
    const getTeamName = useCallback((teamValue) => {
        if (!teamValue) return "-";
        const teamArray = Array.isArray(teams) ? teams : (teams?.data || []);
        const resolve = (val) => {
            if (!val) return null;
            if (typeof val === 'object') {
                return val.name || val.lookup_value || (val.id || val._id ? `Team ${val.id || val._id}` : null);
            }
            const found = teamArray.find(t => t._id === val || t.id === val);
            return found ? (found.name || found.lookup_value) : val;
        };
        if (Array.isArray(teamValue)) {
            if (teamValue.length === 0) return "-";
            return teamValue.map(resolve).filter(Boolean).join(', ') || "-";
        }
        return resolve(teamValue) || "-";
    }, [teams]);

    // 🧠 SENIOR PROFESSIONAL: Robust Lookup Resolver for Inventory
    const resolveInventoryLookup = useCallback((val, type) => {
        if (!val) return null;
        if (typeof val === 'object') {
            const label = val.lookup_value || val.name || val.label;
            // If label is present and not an ID, return it
            if (label && !/^[0-9a-fA-F]{24}$/.test(String(label))) return label;
            // If label itself is an ID or missing, try resolving the ID
            val = val._id || val.id || val;
        }
        
        const resolved = getLookupValue(type, val);
        // NEVER return a raw 24-char hex string as a label
        if (!resolved || /^[0-9a-fA-F]{24}$/.test(String(resolved))) return null;
        return resolved;
    }, [getLookupValue]);

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
            await bulkDeleteInventory({ ids: selectedIds });
            toast.success("Deleted successfully");
            setSelectedIds([]);
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

    const handleRemoveFilter = useCallback((key) => {
        setFilters(prev => {
            const next = { ...prev };
            delete next[key];
            if (key === 'category') {
                delete next.subCategory;
            }
            return next;
        });
        setCurrentPage(1);
    }, []);

    const handleClearAll = useCallback(() => {
        setFilters({});
        setCurrentPage(1);
    }, []);

    const handleCategoryFilter = useCallback((catName) => {
        if (!catName) {
            setFilters(prev => {
                const next = { ...prev };
                delete next.category;
                delete next.subCategory;
                return next;
            });
            setCurrentPage(1);
            return;
        }
        setFilters(prev => {
            const current = prev.category || [];
            const isSelected = Array.isArray(current) 
                ? current.some(c => String(c).toLowerCase() === String(catName).toLowerCase()) 
                : String(current).toLowerCase() === String(catName).toLowerCase();
            if (isSelected) {
                const next = { ...prev };
                delete next.category;
                delete next.subCategory;
                return next;
            }
            const next = { ...prev, category: [catName] };
            delete next.subCategory;
            return next;
        });
        setCurrentPage(1);
    }, [setFilters, setCurrentPage]);

    const handleSubCategoryFilter = useCallback((subCatName) => {
        if (!subCatName) {
            setFilters(prev => {
                const next = { ...prev };
                delete next.subCategory;
                return next;
            });
            setCurrentPage(1);
            return;
        }
        setFilters(prev => {
            const current = prev.subCategory || [];
            const isSelected = Array.isArray(current) 
                ? current.some(c => String(c).toLowerCase() === String(subCatName).toLowerCase()) 
                : String(current).toLowerCase() === String(subCatName).toLowerCase();
            if (isSelected) {
                const next = { ...prev };
                delete next.subCategory;
                return next;
            }
            return { ...prev, subCategory: [subCatName] };
        });
        setCurrentPage(1);
    }, [setFilters, setCurrentPage]);

    useEffect(() => {
        const handleSync = () => refresh();
        const events = ['activity-completed', 'lead-updated', 'contact-updated', 'deal-updated', 'inventory-updated', 'note-added'];
        events.forEach(evt => window.addEventListener(evt, handleSync));
        return () => events.forEach(evt => window.removeEventListener(evt, handleSync));
    }, [refresh]);

    useEffect(() => {
        const handleReset = () => handleShowAll();
        window.addEventListener('inventory-reset', handleReset);
        return () => window.removeEventListener('inventory-reset', handleReset);
    }, [handleShowAll]);

    const handleCreateDeal = () => {
        const p = getSelectedPropertyObj();
        if (p) {
            setSelectedDealData({
                inventoryId: p._id,
                projectName: p.projectId?.name || renderValue(p.projectName) || renderValue(p.area) || '',
                block: renderValue(p.block),
                unitNo: renderValue(p.unitNo || p.unitNumber),
                propertyType: resolveInventoryLookup(p.category || p.propertyType, 'PropertyType') || renderValue(p.category || p.propertyType),
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
                    await deleteInventory(item._id);
                    toast.success("Property deleted successfully");
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
                    onNavigate={onNavigate}
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
                            <InventoryToolbar 
                                selectedIds={selectedIds}
                                searchTerm={searchTerm}
                                setSearchTerm={setSearchTerm}
                                totalRecords={totalRecords}
                                recordsPerPage={recordsPerPage}
                                setRecordsPerPage={setRecordsPerPage}
                                currentPage={currentPage}
                                totalPages={totalPages}
                                setCurrentPage={setCurrentPage}
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
                                        return p ? { 
                                            name: p.owners?.[0]?.name || p.associates?.[0]?.contact?.name || p.ownerName || 'Property Owner', 
                                            mobile: p.owners?.[0]?.phones?.[0]?.number || p.ownerPhone || p.associates?.[0]?.contact?.phones?.[0]?.number || p.owners?.[0]?.mobile || p.associates?.[0]?.contact?.mobile
                                        } : null;
                                    }).filter(Boolean);
                                    setModalData(contacts);
                                    setIsMessageModalOpen(true);
                                }}
                                handleEmailClick={() => {
                                    const contacts = selectedIds.map(id => {
                                        const p = inventoryItems.find(item => item._id === id);
                                        return p ? { 
                                            name: p.owners?.[0]?.name || p.associates?.[0]?.contact?.name || p.ownerName || 'Property Owner', 
                                            email: p.owners?.[0]?.emails?.[0]?.address || p.ownerEmail || p.associates?.[0]?.contact?.emails?.[0]?.address || p.owners?.[0]?.email || p.associates?.[0]?.contact?.email
                                        } : null;
                                    }).filter(Boolean);
                                    setModalData(contacts);
                                    setIsEmailModalOpen(true);
                                }}
                                handleTagClick={() => setIsTagsModalOpen(true)}
                                handleUploadClick={() => { setSelectedProperty(getSelectedPropertyObj()); setIsUploadModalOpen(true); }}
                                handleDocumentClick={() => { setSelectedProperty(getSelectedPropertyObj()); setIsDocumentModalOpen(true); }}
                                handleFeedbackClick={() => { setSelectedProperty(getSelectedPropertyObj()); setIsFeedbackModalOpen(true); }}
                                handleBulkUpdateClick={() => setIsBulkUpdateModalOpen(true)}
                                handleBulkVerifyClick={() => setIsBulkVerifyModalOpen(true)}
                                handleDelete={handleDelete}
                                sortConfig={sortConfig}
                                setSortConfig={setSortConfig}
                                isSortOpen={isSortOpen}
                                setIsSortOpen={setIsSortOpen}
                                filters={filters}
                                onRemoveFilter={handleRemoveFilter}
                                onClearAll={handleClearAll}
                                setIsFilterPanelOpen={setIsFilterPanelOpen}
                            />
                    {viewMode === 'list' ? (
                        <>
                            <InventoryTable 
                                inventoryItems={inventoryItems}
                                selectedIds={selectedIds}
                                toggleSelect={toggleSelect}
                                handleSelectAll={handleSelectAll}
                                getLookupValue={getLookupValue}
                                resolveInventoryLookup={resolveInventoryLookup}
                                onNavigate={onNavigate}
                                getUserName={getUserName}
                                getTeamName={getTeamName}
                                onAction={handleRowAction}
                                loading={loading}
                                                        />
                            {/* No Results Feedback */}
                            {!loading && inventoryItems.length === 0 && (
                                <div className="no-results" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    No inventory records found.
                                </div>
                            )}
                        </>
                    ) : (
                        <div style={{ height: 'calc(100vh - 180px)', display: 'flex', position: 'relative', background: 'var(--bg-card)' }}>
                            <InventoryMapList 
                                items={visibleMapItemIds ? inventoryItems.filter(item => visibleMapItemIds.includes(item._id || item.id)) : inventoryItems}
                                onItemClick={(id) => setActiveMapItemId(id)}
                                activeItemId={activeMapItemId}
                                getLookupValue={getLookupValue}
                            />
                            <div style={{ flex: 1, position: 'relative' }}>
                                <ProfessionalMap 
                                    items={inventoryItems}
                                    activeDealId={activeMapItemId}
                                    isInventory={true}
                                    onMarkerClick={(item) => onNavigate('inventory-detail', item?._id || item)}
                                    onVisibleItemsChange={setVisibleMapItemIds}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <footer className="summary-footer" style={{ height: '55px', background: 'var(--bg-gray)', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', marginTop: 'auto' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '0 1.5rem', width: '100%', overflowX: 'auto', scrollbarWidth: 'none' }}>
                    {activeCategory ? (
                        <>
                            {/* Reset / Return to All Categories Pill */}
                            <div 
                                className="summary-label" 
                                onClick={() => handleCategoryFilter(null)}
                                style={{ 
                                    background: isDark ? '#1e293b' : '#ffffff', 
                                    color: isDark ? '#cbd5e1' : '#1e293b', 
                                    borderRadius: '8px', 
                                    fontSize: '0.68rem', 
                                    padding: '5px 12px', 
                                    fontWeight: 700, 
                                    whiteSpace: 'nowrap', 
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    border: isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #cbd5e1',
                                    boxShadow: isDark ? '0 2px 6px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.08)',
                                    transition: 'all 0.15s ease'
                                }}
                                title="Click to clear category and view all inventory"
                            >
                                <span style={{ fontSize: '0.8rem', fontWeight: 900, pointerEvents: 'none' }}>←</span> ALL CATEGORIES
                            </div>

                            {/* Active Category Header Chip */}
                            {(() => {
                                const activeCatColor = getCategoryColor(activeCategory);
                                const activeCatCount = stats?.categories?.find(c => {
                                    const raw = c.name || c.category || '';
                                    const nameStr = typeof raw === 'object' ? (raw.lookup_value || raw.name || '') : String(raw);
                                    return nameStr.toLowerCase() === String(activeCategory).toLowerCase();
                                })?.count ?? totalRecords;

                                return (
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '7px',
                                            padding: '4px 12px',
                                            borderRadius: '10px',
                                            background: isDark ? `${activeCatColor}18` : `${activeCatColor}14`,
                                            border: `1.5px solid ${activeCatColor}`,
                                            boxShadow: isDark ? `0 0 10px ${activeCatColor}33` : `0 1px 4px ${activeCatColor}25`,
                                            fontSize: '0.75rem',
                                            fontWeight: 800,
                                            color: activeCatColor,
                                            whiteSpace: 'nowrap',
                                            letterSpacing: '0.4px'
                                        }}
                                        title={`${activeCategory}: ${activeCatCount.toLocaleString()} properties`}
                                    >
                                        <span>{activeCategory.toUpperCase()}</span>
                                        <span 
                                            className="stat-val-bold" 
                                            style={{ 
                                                fontSize: '1rem', 
                                                fontWeight: 800, 
                                                color: isDark ? '#f8fafc' : '#0f172a',
                                                marginLeft: '2px' 
                                            }}
                                        >
                                            {activeCatCount.toLocaleString()}
                                        </span>
                                        <span
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleCategoryFilter(null);
                                            }}
                                            title={`Clear ${activeCategory} filter`}
                                            style={{
                                                cursor: 'pointer',
                                                marginLeft: '4px',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                width: '16px',
                                                height: '16px',
                                                borderRadius: '50%',
                                                background: isDark ? `${activeCatColor}30` : `${activeCatColor}20`,
                                                color: activeCatColor,
                                                fontSize: '0.65rem',
                                                fontWeight: 900,
                                                lineHeight: 1,
                                                transition: 'all 0.1s ease'
                                            }}
                                        >
                                            ✕
                                        </span>
                                    </div>
                                );
                            })()}

                            {/* Subtle Divider */}
                            <div style={{ height: '20px', width: '1px', background: isDark ? 'rgba(255, 255, 255, 0.15)' : '#cbd5e1', margin: '0 4px', flexShrink: 0 }} />

                            {/* Sub-Category Pills (Slightly smaller, refined enterprise pills) */}
                            {resolvedSubCategories.length > 0 ? (
                                resolvedSubCategories.map((sub, idx) => {
                                    const subName = sub.name;
                                    const activeCatColor = getCategoryColor(activeCategory);
                                    const isSubSelected = activeSubCategory && String(activeSubCategory).toLowerCase() === String(subName).toLowerCase();
                                    return (
                                        <div
                                            key={idx}
                                            className={`stat-pill subcategory-pill ${isSubSelected ? 'active-summary-pill' : ''}`}
                                            onClick={() => handleSubCategoryFilter(subName)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '5px',
                                                whiteSpace: 'nowrap',
                                                cursor: 'pointer',
                                                padding: '2px 8px',
                                                borderRadius: '8px',
                                                fontSize: '0.72rem',
                                                fontWeight: isSubSelected ? 800 : 600,
                                                background: isSubSelected 
                                                    ? (isDark ? `${activeCatColor}28` : `${activeCatColor}18`)
                                                    : (isDark ? 'rgba(255, 255, 255, 0.05)' : '#ffffff'),
                                                border: isSubSelected 
                                                    ? `1.5px solid ${activeCatColor}` 
                                                    : (isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #cbd5e1'),
                                                boxShadow: isSubSelected ? `0 0 8px ${activeCatColor}40` : (isDark ? 'none' : '0 1px 2px rgba(0,0,0,0.04)'),
                                                color: isSubSelected ? activeCatColor : (isDark ? '#cbd5e1' : '#475569'),
                                                transition: 'all 0.15s ease-in-out',
                                                transform: isSubSelected ? 'scale(1.02)' : 'scale(1)'
                                            }}
                                            title={isSubSelected ? `Click to clear ${subName} filter` : `Filter by ${subName}`}
                                        >
                                            <span style={{ textTransform: 'capitalize' }}>
                                                {isSubSelected && <span style={{ marginRight: '4px', fontSize: '0.65rem' }}>●</span>}
                                                {subName}:
                                            </span>
                                            <span 
                                                className="stat-val-bold" 
                                                style={{ 
                                                    fontWeight: 800, 
                                                    fontSize: '0.88rem',
                                                    color: isSubSelected ? activeCatColor : (isDark ? '#f8fafc' : '#0f172a')
                                                }}
                                            >
                                                {sub.count.toLocaleString()}
                                            </span>
                                        </div>
                                    );
                                })
                            ) : (
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #64748b)', fontStyle: 'italic' }}>
                                    No sub-categories recorded for {activeCategory}
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <div 
                                className="summary-label" 
                                onClick={() => handleCategoryFilter(null)}
                                style={{ 
                                    background: isDark ? '#334155' : '#1e293b', 
                                    color: '#fff', 
                                    borderRadius: '8px', 
                                    fontSize: '0.65rem', 
                                    padding: '4px 12px', 
                                    fontWeight: 800, 
                                    whiteSpace: 'nowrap', 
                                    cursor: 'pointer',
                                    boxShadow: !filters.category?.length ? '0 0 10px rgba(99, 102, 241, 0.25)' : undefined
                                }}
                                title="Click to view all inventory"
                            >
                                SUMMARY
                            </div>

                            {/* TOTAL PROPERTIES Pill */}
                            <div 
                                className={`stat-pill ${(!filters.category || !filters.category.length) ? 'active-summary-pill' : ''}`} 
                                onClick={() => handleCategoryFilter(null)}
                                style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '5px', 
                                    whiteSpace: 'nowrap', 
                                    cursor: 'pointer',
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    fontSize: '0.7rem',
                                    fontWeight: 800,
                                    letterSpacing: '0.5px',
                                    color: isDark ? '#e2e8f0' : '#1e293b',
                                    background: (!filters.category || !filters.category.length) ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                                    border: (!filters.category || !filters.category.length) ? '1.5px solid #6366f1' : '1px solid transparent',
                                    boxShadow: (!filters.category || !filters.category.length) ? '0 0 5px rgba(99, 102, 241, 0.25)' : undefined,
                                    transition: 'all 0.15s ease-in-out'
                                }}
                                title={(!filters.category || !filters.category.length) ? "Showing all properties" : "Click to view all properties"}
                            >
                                TOTAL 
                                <span className="stat-val-bold" style={{ fontWeight: 800, fontSize: '1.1rem', color: '#10b981' }}>
                                    {(persistentTotalInventory.current || totalRecords).toLocaleString()}
                                </span>
                            </div>

                            {stats?.categories && stats.categories.length > 0 ? (
                                stats.categories.map((stat, idx) => {
                                    const rawLabel = stat.name || stat.category || 'N/A';
                                    const labelStr = typeof rawLabel === 'object' ? (rawLabel.lookup_value || rawLabel.name || 'N/A') : String(rawLabel);
                                    const color = getCategoryColor(labelStr);
                                    const label = labelStr.toUpperCase();
                                    const isSelected = Array.isArray(filters.category)
                                        ? filters.category.some(c => String(c).toLowerCase() === labelStr.toLowerCase())
                                        : String(filters.category || '').toLowerCase() === labelStr.toLowerCase();

                                    return (
                                        <div 
                                            key={idx} 
                                            className={`stat-pill ${isSelected ? 'active-summary-pill' : ''}`} 
                                            onClick={() => handleCategoryFilter(labelStr)}
                                            style={{ 
                                                display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
                                                cursor: 'pointer',
                                                padding: '2px 8px',
                                                borderRadius: '10px',
                                                background: isSelected ? `${color}20` : undefined,
                                                border: isSelected ? `1.5px solid ${color}` : '1px solid transparent',
                                                boxShadow: isSelected ? `0 0 5px ${color}40` : undefined,
                                                transition: 'all 0.15s ease-in-out'
                                            }}
                                            title={`Filter by ${labelStr}`}
                                        >
                                            <span style={{ color: color, fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase' }}>{label}:</span>
                                            <span className="stat-val-bold" style={{ fontWeight: 800, fontSize: '1.1rem', color: isDark ? '#f8fafc' : '#0f172a' }}>{renderValue(stat.count)}</span>
                                        </div>
                                    );
                                })
                            ) : (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Calculating distribution...</div>
                            )}
                        </>
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
                        await updateInventory({ id: selectedProperty._id, data: updates });
                        toast.success("Owners updated successfully");
                        setIsOwnerModalOpen(false);
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

            <BulkUpdateInventoryModal
                isOpen={isBulkUpdateModalOpen}
                onClose={() => setIsBulkUpdateModalOpen(false)}
                selectedIds={selectedIds}
                selectedProperties={inventoryItems.filter(item => selectedIds.includes(item._id))}
                onUpdateSuccess={() => {
                    setSelectedIds([]);
                    refresh();
                }}
            />

            <BulkAuthorityVerificationModal
                isOpen={isBulkVerifyModalOpen}
                onClose={() => setIsBulkVerifyModalOpen(false)}
                selectedIds={selectedIds}
                onComplete={() => {
                    setSelectedIds([]);
                    refresh();
                }}
            />
        </section>
    );
}
// Cache bust: Wed Jul 22 12:31:39 IST 2026
