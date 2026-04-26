import React, { useState, useEffect, useCallback } from 'react';
import { useUserContext } from '../../context/UserContext';
import { getInitials } from '../../utils/helpers';
import AddDealModal from '../../components/AddDealModal';
import AddBookingModal from '../../components/AddBookingModal';
import DealsFilterPanel from './components/DealsFilterPanel';
import ActiveFiltersChips from '../../components/ActiveFiltersChips';
import { useCall } from '../../context/CallContext';
import { applyDealsFilters } from '../../utils/dealsFilterLogic';
import UploadModal from '../../components/UploadModal';
import AddInventoryDocumentModal from '../../components/AddInventoryDocumentModal';
import ComposeEmailModal from '../Communication/components/ComposeEmailModal';
import SendMessageModal from '../../components/SendMessageModal';
import ManageTagsModal from '../../components/ManageTagsModal';
import AddQuoteModal from '../../components/AddQuoteModal';
import AddOfferModal from '../../components/AddOfferModal';
import toast from 'react-hot-toast';
import { api } from "../../utils/api";
import ProfessionalMap from '../../components/ProfessionalMap';
import { formatIndianCurrency, numberToIndianWords } from '../../utils/numberToWords';
import { usePropertyConfig } from '../../context/PropertyConfigContext';
import { STAGE_PIPELINE, getStageProbability } from '../../utils/stageEngine';
import { renderValue } from "../../utils/renderUtils";
import PipelineDashboard from '../../components/PipelineDashboard';
import useDebounce from '../../hooks/useDebounce';
import { PermissionGate } from '../../hooks/usePermissions';
import SocialPostModal from '../../components/SocialPostModal';

// Helper: colored stage chip for deals
const DealStageChip = ({ stage }) => {
    // Map legacy deal stages to STAGE_PIPELINE
    const STAGE_MAP = {
        'Open': 'New', 'Quote': 'Opportunity', 'Negotiation': 'Negotiation',
        'Booked': 'Booked', 'Closed': 'Closed Won', 'Closed Won': 'Closed Won',
        'Closed Lost': 'Closed Lost', 'Stalled': 'Stalled',
    };
    const mappedStage = STAGE_MAP[stage] || stage || 'New';
    const info = STAGE_PIPELINE.find(s => s.label === mappedStage) || STAGE_PIPELINE[0];
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            background: info.color + '18', color: info.color,
            border: `1px solid ${info.color}40`,
            borderRadius: '6px', padding: '3px 8px',
            fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em'
        }}>
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: info.color, flexShrink: 0 }} />
            {stage || 'Open'}
            <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>{getStageProbability(mappedStage)}%</span>
        </span>
    );
};

function DealsPage({ onNavigate, onAddActivity }) {
    const { teams, users } = useUserContext();
    const { startCall } = useCall();
    const { getLookupValue } = usePropertyConfig();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);
    const [currentView, setCurrentView] = useState('list'); // 'list' or 'map'
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
    const [isOfferModalOpen, setIsOfferModalOpen] = useState(false);
    const [activeRowMenu, setActiveRowMenu] = useState(null); // dealId of open menu
    const [editingDeal, setEditingDeal] = useState(null);
    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
    const [filters, setFilters] = useState({});
    const [deals, setDeals] = useState([]);
    const [loading, setLoading] = useState(false);
    const [totalRecords, setTotalRecords] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [recordsPerPage, setRecordsPerPage] = useState(25);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [isSocialModalOpen, setIsSocialModalOpen] = useState(false);
    const [selectedSocialData, setSelectedSocialData] = useState(null);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
    const [isSendMailOpen, setIsSendMailOpen] = useState(false);
    const [isSendMessageOpen, setIsSendMessageOpen] = useState(false);
    const [isManageTagsOpen, setIsManageTagsOpen] = useState(false);
    const [isAddBookingOpen, setIsAddBookingOpen] = useState(false);
    const [selectedDealsForMail, setSelectedDealsForMail] = useState([]);
    const [selectedDealsForMessage, setSelectedDealsForMessage] = useState([]);
    const [selectedDealsForTags, setSelectedDealsForTags] = useState([]);
    const [selectedDealState, setSelectedDealState] = useState(null);

    // ── STAGE ENGINE SYNC ──────────────────────────────────────────
    useEffect(() => {
        const handleActivitySync = () => setRefreshTrigger(prev => prev + 1);
        const handleDealUpdate = () => setRefreshTrigger(prev => prev + 1);

        window.addEventListener('activity-completed', handleActivitySync);
        window.addEventListener('deal-updated', handleDealUpdate);

        return () => {
            window.removeEventListener('activity-completed', handleActivitySync);
            window.removeEventListener('deal-updated', handleDealUpdate);
        };
    }, []);
    // ────────────────────────────────────────────────────────────────
    const [dealScores, setDealScores] = useState({}); // { dealId: { score, color, label } } from stage engine
    const [categoryStats, setCategoryStats] = useState([]);

    // --- OPTIMIZATION: Debounced Search Term ---
    const debouncedSearchTerm = useDebounce(searchTerm, 500);

    const fetchDeals = useCallback(async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams({
                page: currentPage,
                limit: recordsPerPage,
                search: debouncedSearchTerm,
            });

            const response = await api.get(`deals?${queryParams.toString()}`);

            if (response.data && response.data.success) {
                setDeals(response.data.records || []);
                setTotalRecords(response.data.totalCount || 0);
                setCategoryStats(response.data.categoryStats || []);

                // ── Stage Engine: fetch live deal scores ──
                api.get('stage-engine/deals/scores')
                    .then(r => { if (r.data?.success) setDealScores(r.data.scores); })
                    .catch(() => { }); // non-blocking
            } else {
                toast.error("Failed to fetch deals");
                setDeals([]);
                setTotalRecords(0);
            }
        } catch (error) {
            console.error("Error fetching deals:", error);
            toast.error("Error loading deals");
            setDeals([]);
            setTotalRecords(0);
        } finally {
            setLoading(false);
        }
    }, [currentPage, recordsPerPage, debouncedSearchTerm]);

    const handleSaveUploads = async (mediaData) => {
        try {
            const dealId = selectedIds[0];
            const response = await api.put(`deals/${dealId}`, {
                propertyImages: mediaData.images,
                propertyVideos: mediaData.videos
            });

            if (response.data.success) {
                toast.success("Files uploaded and saved successfully");
                fetchDeals();
            } else {
                toast.error("Failed to save file links to deal");
            }
        } catch (error) {
            console.error("Error saving uploads:", error);
            toast.error("Error saving uploaded files");
        } finally {
            setIsUploadModalOpen(false);
            setSelectedIds([]);
        }
    };

    const handleSaveDocuments = async (documents) => {
        try {
            const dealId = selectedIds[0];
            const formattedDocs = documents.map(doc => ({
                name: doc.documentName || doc.documentType || 'Document',
                type: doc.documentType || 'General',
                url: doc.url,
                uploadedAt: new Date()
            }));

            const response = await api.put(`deals/${dealId}`, {
                documents: formattedDocs
            });

            if (response.data.success) {
                toast.success("Documents saved successfully");
                fetchDeals();
            } else {
                toast.error("Failed to save documents to deal");
            }
        } catch (error) {
            console.error("Error saving documents:", error);
            toast.error("Error saving documents");
        } finally {
            setIsDocumentModalOpen(false);
            setSelectedIds([]);
        }
    };

    const getTeamName = useCallback((teamValue) => {
        if (!teamValue) return "General Team";
        if (typeof teamValue === 'object') {
            return teamValue.name || teamValue.lookup_value || "General Team";
        }
        const found = teams.find(t => (t._id === teamValue) || (t.id === teamValue));
        return found ? (found.name || found.lookup_value) : teamValue;
    }, [teams]);

    const getUserName = useCallback((ownerValue) => {
        if (!ownerValue) return "Admin";
        if (typeof ownerValue === 'object') {
            return ownerValue.fullName || ownerValue.name || ownerValue.lookup_value || "Admin";
        }
        const found = users.find(u => (u._id === ownerValue) || (u.id === ownerValue));
        return found ? (found.fullName || (found.firstName ? `${found.firstName} ${found.lastName}` : (found.name || found.username))) : ownerValue;
    }, [users]);

    useEffect(() => {
        fetchDeals();
    }, [fetchDeals, refreshTrigger]);


    // Filter Removal Handlers
    const handleRemoveFilter = (key) => {
        const newFilters = { ...filters };
        delete newFilters[key];
        setFilters(newFilters);
    };

    const handleClearAll = () => {
        setFilters({});
    };


    const filteredDeals = deals.filter(deal => {
        if (deal.isVisible === false) return false;
        const search = debouncedSearchTerm.toLowerCase();

        const dealId = deal.id || deal._id;
        const ownerName = deal.owner?.name || deal.owner;
        const location = deal.location?.lookup_value || deal.location;
        const propertyType = deal.propertyType?.lookup_value || deal.propertyType;
        const assigned = deal.assigned;

        // Basic Search
        const matchesSearch = (
            (dealId && dealId.toString().toLowerCase().includes(search)) ||
            (ownerName && ownerName.toString().toLowerCase().includes(search)) ||
            (location && location.toString().toLowerCase().includes(search)) ||
            (propertyType && propertyType.toString().toLowerCase().includes(search)) ||
            (assigned && assigned.toString().toLowerCase().includes(search))
        );

        if (!matchesSearch) return false;

        // Advanced Filters via Utility
        return applyDealsFilters(deal, filters);
    });

    const toggleSelect = (id) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(v => v !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const getSelectedDeal = () => deals.find(d => d._id === selectedIds[0]);

    const handleEditClick = () => {
        const deal = getSelectedDeal();
        if (deal) {
            setEditingDeal(deal);
            setIsAddModalOpen(true);
        }
    };

    const handleUploadClick = () => {
        const deal = getSelectedDeal();
        if (deal) {
            setSelectedDealState(deal);
            setIsUploadModalOpen(true);
        }
    };

    const handleDocumentClick = () => {
        const deal = getSelectedDeal();
        if (deal) {
            setSelectedDealState(deal);
            setIsDocumentModalOpen(true);
        }
    };

    const handleQuoteClick = () => {
        if (selectedIds.length === 1) {
            setIsQuoteModalOpen(true);
        } else {
            toast.error("Please select exactly one deal to generate a quote.");
        }
    };

    const getSelectedDealsFull = () => {
        return deals.filter(d => selectedIds.includes(d._id));
    };

    const handleEmailClick = () => {
        const selectedDeals = getSelectedDealsFull();
        if (selectedDeals.length > 0) {
            const recipients = selectedDeals.map(d => ({
                id: d.id,
                name: d.owner?.name || 'Owner',
                email: d.owner?.email || ''
            })).filter(r => r.email);

            if (recipients.length === 0) {
                toast.error("Selected deals do not have email addresses");
                return;
            }

            setSelectedDealsForMail(recipients);
            setIsSendMailOpen(true);
        }
    };

    const handleMessageClick = () => {
        const selectedDeals = getSelectedDealsFull();
        if (selectedDeals.length > 0) {
            const recipients = selectedDeals.map(d => ({
                id: d.id,
                name: d.owner?.name || 'Owner',
                phone: d.owner?.phone || ''
            })).filter(r => r.phone);

            if (recipients.length === 0) {
                toast.error("Selected deals do not have phone numbers");
                return;
            }

            setSelectedDealsForMessage(recipients);
            setIsSendMessageOpen(true);
        }
    };

    const handleTagClick = () => {
        const selectedDeals = getSelectedDealsFull();
        if (selectedDeals.length > 0) {
            setSelectedDealsForTags(selectedDeals);
            setIsManageTagsOpen(true);
        }
    };


    const totalPages = Math.ceil(totalRecords / recordsPerPage);

    const goToNextPage = () => {
        if (currentPage < totalPages) setCurrentPage(currentPage + 1);
    };

    const goToPreviousPage = () => {
        if (currentPage > 1) setCurrentPage(currentPage - 1);
    };

    const handleRecordsPerPageChange = (e) => {
        setRecordsPerPage(Number(e.target.value));
        setCurrentPage(1);
    };

    const handleDelete = async (id = null) => {
        // If id is an event object or not a string, treat it as null (use selectedIds)
        const targetId = (typeof id === 'string') ? id : null;
        const idsToDelete = targetId ? [targetId] : selectedIds;
        if (idsToDelete.length === 0) return;

        const confirmMsg = idsToDelete.length === 1
            ? "Are you sure you want to delete this deal?"
            : `Are you sure you want to delete ${idsToDelete.length} selected deals?`;

        if (!window.confirm(confirmMsg)) return;

        try {
            if (idsToDelete.length === 1) {
                await api.delete(`deals/${idsToDelete[0]}`);
            } else {
                await api.post(`deals/bulk-delete`, { ids: idsToDelete });
            }

            toast.success(`${idsToDelete.length} deal(s) deleted successfully`);
            if (id) {
                setSelectedIds(prev => prev.filter(currId => currId !== id));
            } else {
                setSelectedIds([]);
            }
            fetchDeals();
        } catch (error) {
            console.error("Error deleting deals:", error);
            toast.error("Failed to delete deals");
        }
    };

    return (
        <section id="dealsView" className="view-section active">
            <div className="view-scroll-wrapper">
                <div className="page-header">
                    <div className="page-title-group" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '40px', height: '40px', background: '#eff6ff', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-handshake" style={{ color: '#2563eb', fontSize: '1.2rem' }}></i>
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Deals</h1>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>Sales Operations</span>
                            </div>
                            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '2px 0 0 0' }}>Manage your property transactions pipeline</p>
                        </div>
                    </div>
                    <div className="header-actions" style={{ display: 'flex', gap: '12px' }}>
                        <div className="view-toggle-group">
                            <button
                                className={`view-toggle-btn ${currentView === 'list' ? 'active' : ''}`}
                                onClick={() => setCurrentView('list')}
                            >
                                <i className="fas fa-list"></i> List View
                            </button>
                            <button
                                className={`view-toggle-btn ${currentView === 'map' ? 'active' : ''}`}
                                onClick={() => setCurrentView('map')}
                            >
                                <i className="fas fa-map-marked-alt"></i> Map View
                            </button>
                        </div>
                        <button
                            className="btn-outline"
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}
                            onClick={() => setIsFilterPanelOpen(true)}
                        >
                            <i className="fas fa-filter"></i> Filters
                            {Object.keys(filters).length > 0 && (
                                <span style={{
                                    position: 'absolute', top: '-5px', right: '-5px',
                                    width: '10px', height: '10px', background: 'red', borderRadius: '50%'
                                }}></span>
                            )}
                        </button>

                    </div>
                </div>

                {/* Pipeline Dashboard - Enhanced with Percentages */}
                <PipelineDashboard entityType="deal" refreshTrigger={refreshTrigger} />

                <div className="content-body" style={{ overflowY: 'visible', paddingTop: 0 }}>
                    {/* Toolbar */}
                    <div className="toolbar-container" style={{ position: 'sticky', top: 0, zIndex: 1000, padding: '5px 2rem', borderBottom: '1px solid #eef2f5', minHeight: '45px', display: 'flex', alignItems: 'center', background: '#fff' }}>
                        {selectedIds.length > 0 ? (
                            <div className="action-panel" style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', overflowX: 'auto', paddingTop: '4px', paddingBottom: '2px' }}>
                                <div className="selection-count" style={{ marginRight: '10px', fontWeight: 600, color: 'var(--primary-color)', whiteSpace: 'nowrap' }}>
                                    {selectedIds.length} Selected
                                </div>

                                {selectedIds.length === 1 && (
                                    <>
                                        <PermissionGate module="deals" action="edit">
                                            <button className="action-btn" title="Edit Deal" onClick={handleEditClick}><i className="fas fa-edit"></i> Edit</button>
                                        </PermissionGate>
                                        <button
                                            className="action-btn"
                                            title="Add Activity"
                                            onClick={() => {
                                                const selectedDeal = deals.find(d => d._id === selectedIds[0]);
                                                if (selectedDeal && onAddActivity) {
                                                    onAddActivity([{ type: 'Deal', id: selectedDeal._id, name: selectedDeal.dealNo || selectedDeal.dealId || 'Deal', model: 'Deal' }], { deal: selectedDeal });
                                                }
                                            }}
                                        >
                                            <i className="fas fa-calendar-plus"></i> Activity
                                        </button>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#6b7280', background: '#f1f5f9', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '6px 12px' }} title="Stage is auto-computed from activities">
                                            <i className="fas fa-lock" style={{ fontSize: '0.6rem', color: '#94a3b8' }} /> Auto-Stage
                                        </span>
                                        <button
                                            className="action-btn"
                                            title="Call Owner"
                                            onClick={() => {
                                                const selectedDeal = deals.find(d => d.id === selectedIds[0]);
                                                if (selectedDeal && selectedDeal.owner) {
                                                    startCall({
                                                        name: selectedDeal.owner.name,
                                                        mobile: selectedDeal.owner.phone
                                                    }, {
                                                        purpose: 'Deal Update',
                                                        entityId: selectedDeal.id,
                                                        entityType: 'deal'
                                                    });
                                                }
                                            }}
                                        >
                                            <i className="fas fa-phone-alt" style={{ transform: 'scaleX(-1) rotate(5deg)' }}></i> Call
                                        </button>
                                        <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px' }}></div>
                                        <button className="action-btn" title="View Quote" onClick={handleQuoteClick}><i className="fas fa-file-invoice-dollar"></i> Quote</button>
                                        <button
                                            className="action-btn"
                                            title="Edit Deal"
                                            style={{ background: '#fffbeb', color: '#b45309', borderColor: '#fef3c7' }}
                                            onClick={() => {
                                                const deal = getSelectedDeal();
                                                if (deal) {
                                                    setEditingDeal(deal);
                                                    setIsAddModalOpen(true);
                                                }
                                            }}
                                        >
                                            <i className="fas fa-edit"></i> Edit
                                        </button>

                                        <button
                                            className="action-btn"
                                            title="Quote"
                                            onClick={() => {
                                                const deal = getSelectedDeal();
                                                if (deal) {
                                                    setEditingDeal(deal);
                                                    setIsQuoteModalOpen(true);
                                                }
                                            }}
                                        >
                                            <i className="fas fa-file-invoice"></i> Quote
                                        </button>

                                        <button
                                            className="action-btn"
                                            title="Offer"
                                            onClick={() => {
                                                const deal = getSelectedDeal();
                                                if (deal) {
                                                    setEditingDeal(deal);
                                                    setIsOfferModalOpen(true);
                                                }
                                            }}
                                        >
                                            <i className="fas fa-handshake"></i> Offer
                                        </button>

                                        <button
                                            className="action-btn"
                                            title="Book Deal"
                                            style={{ background: '#ecfdf5', color: '#059669', borderColor: '#d1fae5' }}
                                            onClick={() => setIsAddBookingOpen(true)}
                                        >
                                            <i className="fas fa-bookmark"></i> Book
                                        </button>
                                        
                                        <button
                                            className="action-btn"
                                            title="Share Deal"
                                            onClick={() => {
                                                const d = getSelectedDeal();
                                                if (d) {
                                                    setSelectedSocialData({
                                                        id: d._id,
                                                        unitNo: d.unitNo,
                                                        projectName: d.projectName,
                                                        price: d.price,
                                                        location: getLookupValue('Locality', d.location) || getLookupValue('Area', d.location) || getLookupValue('Location', d.location),
                                                        images: d.propertyImages || []
                                                    });
                                                    setIsSocialModalOpen(true);
                                                }
                                            }}
                                        >
                                            <i className="fas fa-share-alt"></i> Share
                                        </button>
                                    </>
                                )}

                                <button
                                    className="action-btn"
                                    title="Match"
                                    onClick={() => {
                                        const deal = getSelectedDeal();
                                        if (deal) onNavigate('deal-matching', deal._id);
                                    }}
                                >
                                    <i className="fas fa-sync-alt"></i> Match
                                </button>
                                <button className="action-btn" title="Email" onClick={handleEmailClick}><i className="fas fa-envelope"></i> Email</button>
                                <button className="action-btn" title="Message" onClick={handleMessageClick}><i className="fas fa-comment-alt"></i> Message</button>
                                <button className="action-btn" title="Tag" onClick={handleTagClick}><i className="fas fa-tag"></i> Tag</button>

                                {selectedIds.length === 1 && (
                                    <>
                                        <button className="action-btn" title="Upload Files" onClick={handleUploadClick}><i className="fas fa-cloud-upload-alt"></i> Upload</button>
                                        <button className="action-btn" title="Manage Documents" onClick={handleDocumentClick}><i className="fas fa-file-contract"></i> Document</button>
                                    </>
                                )}

                                <button className="action-btn" title="Add Note"><i className="fas fa-sticky-note"></i> Note</button>

                                <div style={{ marginLeft: 'auto' }}>
                                    <PermissionGate module="deals" action="delete">
                                        <button className="action-btn danger" title="Delete" onClick={() => handleDelete()}><i className="fas fa-trash-alt"></i></button>
                                    </PermissionGate>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                <div style={{ position: 'relative', width: '380px' }}>
                                    <input
                                        type="text"
                                        className="search-input-premium"
                                        placeholder="Search deals by ID, property or owner..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        style={{ width: '100%' }}
                                    />
                                    <i className={`fas fa-search search-icon-premium ${searchTerm ? 'active' : ''}`}></i>
                                </div>
                                <div
                                    style={{ display: 'flex', alignItems: 'center', gap: '15px' }}
                                >
                                    <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                                        Showing: <strong>{deals.length}</strong> /{" "}
                                        <strong>{totalRecords}</strong>
                                    </div>

                                    {/* Records Per Page */}
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "8px",
                                            fontSize: "0.8rem",
                                            color: "#64748b",
                                        }}
                                    >
                                        <span>Show:</span>
                                        <select
                                            value={recordsPerPage}
                                            onChange={handleRecordsPerPageChange}
                                            style={{
                                                padding: "4px 8px",
                                                border: "1px solid #e2e8f0",
                                                borderRadius: "6px",
                                                fontSize: "0.8rem",
                                                fontWeight: 600,
                                                color: "#0f172a",
                                                outline: "none",
                                                cursor: "pointer",
                                            }}
                                        >
                                            <option value={10}>10</option>
                                            <option value={25}>25</option>
                                            <option value={50}>50</option>
                                            <option value={100}>100</option>
                                            <option value={300}>300</option>
                                            <option value={500}>500</option>
                                            <option value={750}>750</option>
                                            <option value={1000}>1000</option>
                                        </select>
                                    </div>

                                    {/* Pagination Controls */}
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "8px",
                                        }}
                                    >
                                        <button
                                            onClick={goToPreviousPage}
                                            disabled={currentPage === 1 || loading}
                                            style={{
                                                padding: "6px 12px",
                                                border: "1px solid #e2e8f0",
                                                borderRadius: "6px",
                                                background: currentPage === 1 ? "#f8fafc" : "#fff",
                                                color: currentPage === 1 ? "#cbd5e1" : "#0f172a",
                                                cursor: currentPage === 1 ? "not-allowed" : "pointer",
                                                fontSize: "0.75rem",
                                                fontWeight: 600,
                                            }}
                                        >
                                            <i className="fas fa-chevron-left"></i> Prev
                                        </button>
                                        <span
                                            style={{
                                                fontSize: "0.8rem",
                                                fontWeight: 600,
                                                color: "#0f172a",
                                                minWidth: "80px",
                                                textAlign: "center",
                                            }}
                                        >
                                            {currentPage} / {totalPages || 1}
                                        </span>
                                        <button
                                            onClick={goToNextPage}
                                            disabled={currentPage >= totalPages || loading}
                                            style={{
                                                padding: "6px 12px",
                                                border: "1px solid #e2e8f0",
                                                borderRadius: "6px",
                                                background:
                                                    currentPage >= totalPages ? "#f8fafc" : "#fff",
                                                color:
                                                    currentPage >= totalPages ? "#cbd5e1" : "#0f172a",
                                                cursor:
                                                    currentPage >= totalPages ? "not-allowed" : "pointer",
                                                fontSize: "0.75rem",
                                                fontWeight: 600,
                                            }}
                                        >
                                            Next <i className="fas fa-chevron-right"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>



                    {/* Active Filters Chips */}
                    <ActiveFiltersChips
                        filters={filters}
                        onRemoveFilter={handleRemoveFilter}
                        onClearAll={handleClearAll}
                    />

                    {/* Header */}
                    {currentView === 'list' && (
                        <div className="list-header deals-list-grid" style={{ position: 'sticky', top: '45px', zIndex: 99, padding: '15px 1.5rem', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            <div>
                                <input
                                    type="checkbox"
                                    checked={filteredDeals.length > 0 && selectedIds.length === filteredDeals.length}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setSelectedIds(filteredDeals.map(d => d._id));
                                        } else {
                                            setSelectedIds([]);
                                        }
                                    }}
                                />
                            </div>
                            <div>Score</div>
                            <div>Property Details</div>
                            <div>Location & Project</div>
                            <div>Match</div>
                            <div>Expectation</div>
                            <div>Owner_Details</div>
                            <div>Associate</div>
                            <div>Status</div>
                            <div>Interaction</div>
                            <div style={{ textAlign: 'center' }}>Assignment</div>
                        </div>
                    )}

                    {currentView === 'list' ? (
                        <div className="list-content" style={{ background: '#fafbfc' }}>
                            <div className="list-group">
                                {filteredDeals.map((deal, index) => (
                                    <DealRow
                                        key={deal._id || index}
                                        deal={deal}
                                        index={index}
                                        selected={selectedIds.includes(deal._id)}
                                        onSelect={(id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])}
                                        onNavigate={onNavigate}
                                        getLookupValue={getLookupValue}
                                        activeRowMenu={activeRowMenu}
                                        setActiveRowMenu={setActiveRowMenu}
                                        getUserName={getUserName}
                                        getTeamName={getTeamName}
                                        onAction={(type, d) => {
                                            setEditingDeal(d);
                                            if (type === 'quote') setIsQuoteModalOpen(true);
                                            if (type === 'offer') setIsOfferModalOpen(true);
                                            if (type === 'share') {
                                                setSelectedSocialData({
                                                    id: d._id,
                                                    unitNo: d.unitNo,
                                                    projectName: d.projectName,
                                                    price: d.price,
                                                    location: getLookupValue('Locality', d.location) || getLookupValue('Area', d.location) || getLookupValue('Location', d.location),
                                                    images: d.propertyImages || []
                                                });
                                                setIsSocialModalOpen(true);
                                            }
                                            if (type === 'edit') {
                                                setEditingDeal(d);
                                                setIsAddModalOpen(true);
                                            }
                                            if (type === 'delete') {
                                                if (window.confirm('Are you sure you want to delete this deal?')) {
                                                    api.delete(`deals/${d._id}`).then(() => {
                                                        toast.success('Deal deleted successfully');
                                                        fetchDeals();
                                                    }).catch(err => {
                                                        toast.error('Failed to delete deal');
                                                    });
                                                }
                                            }
                                            setActiveRowMenu(null);
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="map-view-container" style={{ height: 'calc(100vh - 250px)', position: 'relative', margin: '0', display: 'flex' }}>
                            {/* Left Sidebar with Deals List */}
                            <div style={{ width: '320px', background: '#fff', borderRight: '1px solid #e2e8f0', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ padding: '15px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
                                        <i className="fas fa-map-pin" style={{ color: '#ef4444', marginRight: '6px' }}></i>
                                        Deals by Location ({filteredDeals.length})
                                    </div>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type="text"
                                            className="search-input-premium"
                                            placeholder="Filter deals..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            style={{ width: '100%', padding: '8px 12px 8px 35px', fontSize: '0.8rem' }}
                                        />
                                        <i className={`fas fa-search search-icon-premium ${searchTerm ? 'active' : ''}`} style={{ fontSize: '0.75rem', left: '10px' }}></i>
                                    </div>
                                </div>
                                <div style={{ flex: 1, overflowY: 'auto' }}>
                                    {filteredDeals.map((deal, idx) => (
                                        <div
                                            key={deal.id}
                                            style={{
                                                padding: '12px 15px',
                                                borderBottom: '1px solid #f1f5f9',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                background: '#fff'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                                <div style={{
                                                    width: '24px',
                                                    height: '24px',
                                                    background: '#ef4444',
                                                    borderRadius: '50%',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: '#fff',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 700
                                                }}>
                                                    {idx + 1}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary-color)' }}>#{deal.id}</div>
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#0f172a', fontWeight: 600, marginBottom: '4px' }}>
                                                {renderValue(deal.location)}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '4px' }}>
                                                {renderValue(deal.propertyType)}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981' }}>
                                                ₹{renderValue(deal.price)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Professional Interactive Map */}
                            <div style={{ flex: 1, position: 'relative' }}>
                                <ProfessionalMap
                                    items={filteredDeals}
                                    onMarkerClick={(deal) => onNavigate('deal-detail', deal._id)}
                                />
                                {/* Map Controls Overlay */}
                                <div style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <button style={{
                                        background: '#fff',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        padding: '8px 12px',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                    }}>
                                        <i className="fas fa-expand-arrows-alt" style={{ marginRight: '6px' }}></i>
                                        Fullscreen
                                    </button>
                                    <button style={{
                                        background: '#fff',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        padding: '8px 12px',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                    }}>
                                        <i className="fas fa-layer-group" style={{ marginRight: '6px' }}></i>
                                        Layers
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div >

            <AddDealModal
                isOpen={isAddModalOpen}
                onClose={() => {
                    setIsAddModalOpen(false);
                    setEditingDeal(null);
                }}
                dealData={editingDeal}
                onSave={fetchDeals}
            />

            <AddQuoteModal
                isOpen={isQuoteModalOpen}
                onClose={() => setIsQuoteModalOpen(false)}
                deal={editingDeal}
                onSuccess={() => {
                    setIsQuoteModalOpen(false);
                    fetchDeals();
                }}
            />

            <AddOfferModal 
                isOpen={isOfferModalOpen}
                onClose={() => setIsOfferModalOpen(false)}
                deal={editingDeal}
                onSave={async (offerData) => {
                    try {
                        const response = await api.post(`deals/${editingDeal._id}/offers`, offerData);
                        if (response.data.success) {
                            toast.success('Offer registered successfully');
                            setIsOfferModalOpen(false);
                            fetchDeals();
                        }
                    } catch (error) {
                        console.error('Failed to save offer:', error);
                        toast.error('Failed to register offer');
                    }
                }}
            />

            <ComposeEmailModal
                isOpen={isSendMailOpen}
                onClose={() => setIsSendMailOpen(false)}
                recipients={selectedDealsForMail}
            />

            <SendMessageModal
                isOpen={isSendMessageOpen}
                onClose={() => setIsSendMessageOpen(false)}
                initialRecipients={selectedDealsForMessage?.map(deal => ({
                    ...deal.owner,
                    name: deal.owner?.name || deal.associatedContact?.name || 'Client',
                    phone: deal.owner?.phone || deal.associatedContact?.phone,
                    _id: deal.associatedContact?._id || deal.owner?._id || deal.id
                })) || []}
                onSend={(data, res) => {
                    console.log('Message Data Outbound:', data);
                    toast.success(res?.message || 'Message Sent Successfully!');
                    setIsSendMessageOpen(false);
                }}
            />

            <ManageTagsModal
                isOpen={isManageTagsOpen}
                onClose={() => setIsManageTagsOpen(false)}
                selectedItems={selectedDealsForTags}
                entityType="deals"
                onSave={(updatedItems) => {
                    updatedItems.map(item => item.id);
                    setDeals(prev => prev.map(d => {
                        const updatedItem = updatedItems.find(item => item.id === d.id);
                        return updatedItem ? { ...d, tags: updatedItem.tags } : d;
                    }));
                }}
            />

            <DealsFilterPanel
                isOpen={isFilterPanelOpen}
                onClose={() => setIsFilterPanelOpen(false)}
                filters={filters}
                onFilterChange={setFilters}
            />

            <UploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                onSave={handleSaveUploads}
                project={selectedDealState}
                type="property"
            />

            <AddInventoryDocumentModal
                isOpen={isDocumentModalOpen}
                onClose={() => setIsDocumentModalOpen(false)}
                onSave={handleSaveDocuments}
                project={selectedDealState}
            />

            {
                isAddBookingOpen && (
                    <AddBookingModal
                        isOpen={isAddBookingOpen}
                        onClose={() => setIsAddBookingOpen(false)}
                        dealId={selectedIds[0]}
                        onSave={() => {
                            fetchDeals();
                            setSelectedIds([]);
                        }}
                    />
                )
            }

            {isSocialModalOpen && (
                <SocialPostModal
                    isOpen={isSocialModalOpen}
                    onClose={() => setIsSocialModalOpen(false)}
                    initialData={{
                        id: selectedSocialData?.id,
                        type: 'Deal',
                        text: `🏡 Fresh Deal Alert: ${selectedSocialData?.unitNo || 'New Property'} at ${selectedSocialData?.projectName || 'Prime Location'}.\n\n✨ Unit: ${selectedSocialData?.unitNo}\n📍 Location: ${selectedSocialData?.location}\n💰 Expected: ₹${selectedSocialData?.price?.toLocaleString('en-IN')}\n\nInterested? Contact us for exclusive details! #BharatProperties #RealEstate`,
                        imageUrl: selectedSocialData?.images?.[0] || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&q=80&w=1000'
                    }}
                />
            )}

            <footer className="summary-footer" style={{ height: '55px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', marginTop: 'auto' }}>
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center', padding: '0 2rem', width: '100%', overflowX: 'auto' }}>
                    <div className="summary-label" style={{ background: '#334155', color: '#fff', borderRadius: '8px', fontSize: '0.65rem', padding: '4px 12px', fontWeight: 800, whiteSpace: 'nowrap' }}>SUMMARY</div>
                    {categoryStats && categoryStats.length > 0 ? (
                        categoryStats.map((stat, idx) => {
                            const colors = ['#6366f1', 'var(--primary-color)', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6'];
                            const color = colors[idx % colors.length];
                            const label = stat.name.toUpperCase();
                            return (
                                <div key={idx} className="stat-pill" style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                                    <span style={{ color: color, fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase' }}>{label}:</span>
                                    <span className="stat-val-bold" style={{ fontWeight: 800, fontSize: '1.1rem' }}>{stat.count.toLocaleString()}</span>
                                </div>
                            );
                        })
                    ) : (
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>Calculating distribution...</div>
                    )}
                </div>
            </footer>
        </section >
    );
}


// --- MEMOIZED COMPONENTS FOR PERFORMANCE ---

const DealRow = React.memo(({ deal, selected, onSelect, onNavigate, index, getLookupValue, activeRowMenu, setActiveRowMenu, onAction, dealScores = {}, getUserName, getTeamName }) => {
    
    const s = dealScores[deal._id];
    const scoreVal = s ? s.score : (deal.dealProbability || 0);
    const scoreColor = s ? s.color : '#94a3b8';
    const scoreLabel = s ? s.label : '';

    return (
        <div className="list-item deals-list-grid" style={{ padding: '18px 1.5rem', borderBottom: '1px solid #e2e8f0', transition: 'all 0.2s ease', background: '#fff', marginBottom: '2px' }}>
            <input
                type="checkbox"
                className="item-check"
                checked={selected}
                onChange={() => onSelect(deal._id)}
            />

            {/* Col 1: Score */}
            <div
                title={scoreLabel ? `${scoreLabel} · Score: ${scoreVal}` : `Score: ${scoreVal}`}
                style={{
                    width: '40px', height: '40px', fontSize: '0.9rem',
                    borderRadius: '50%', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontWeight: '800', cursor: 'default',
                    background: scoreColor + '18',
                    border: `2px solid ${scoreColor}`,
                    color: scoreColor
                }}
            >
                {scoreVal}
            </div>

            {/* Col 2: Property Details */}
            <div className="super-cell">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <div
                        onClick={() => onNavigate('deal-detail', deal._id)}
                        className={`project-thumbnail ${deal.status === 'Open' ? 'thumb-active' : 'thumb-inactive'}`}
                        style={{
                            width: 'auto',
                            minWidth: '60px',
                            height: '28px',
                            borderRadius: '6px',
                            padding: '0 10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.7rem',
                            fontWeight: 900,
                            letterSpacing: '0.05em',
                            cursor: 'pointer'
                        }}
                    >
                        {deal.unitNo || 'UNIT'}
                    </div>
                    <div className="text-ellipsis" style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.9rem' }}>
                        {renderValue(deal.unitType) || 'Unit'}
                    </div>
                </div>
                <div style={{ paddingLeft: '2px' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1e293b', lineHeight: 1.1 }}>
                        {renderValue(getLookupValue('Category', deal.category) || getLookupValue('PropertyType', deal.propertyType), 'N/A')}
                        {deal.subCategory ? ` - ${renderValue(getLookupValue('SubCategory', deal.subCategory))}` : ''}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {(deal.sizeLabel || deal.unitSpecification?.sizeLabel || deal.sizeConfig) ? (
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#4338ca', background: '#e0e7ff', padding: '2px 6px', borderRadius: '4px' }}>
                                {getLookupValue('Size', deal.sizeLabel || deal.unitSpecification?.sizeLabel || (typeof deal.sizeConfig === 'object' ? deal.sizeConfig?.lookup_value : deal.sizeConfig))}
                            </span>
                        ) : (
                            renderValue(deal.size, 'N/A')
                        )}
                    </div>
                </div>
            </div>

            {/* Col 3: Location & Project */}
            <div className="super-cell">
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                    <i className="fas fa-map-marker-alt" style={{ color: '#ef4444', fontSize: '0.75rem' }}></i>
                    <span className="text-ellipsis" style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{renderValue(getLookupValue('Locality', deal.location) || getLookupValue('Area', deal.location) || getLookupValue('Location', deal.location))}</span>
                </div>
                {deal.projectName && (
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>
                        <i className="fas fa-building" style={{ marginRight: '4px', fontSize: '0.7rem' }}></i>
                        {renderValue(deal.projectName)}
                    </div>
                )}
                {deal.block && (
                    <span className="verified-badge" style={{ fontSize: '0.58rem', padding: '2px 10px', background: '#f1f5f9', color: '#475569', fontWeight: 800 }}>BLOCK: {deal.block}</span>
                )}
            </div>

            {/* Col 4: Match */}
            <div style={{ lineHeight: 1.4, padding: '8px', background: '#f8fafc', borderRadius: '6px' }}>
                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.8rem', textTransform: 'capitalize', marginBottom: '4px' }}>{renderValue(getLookupValue('Intent', deal.intent))}</div>
                <div style={{ fontSize: '0.7rem' }}>
                    <span style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff', fontWeight: 700, padding: '3px 10px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(102, 126, 234, 0.3)' }}>{deal.matched} Matches</span>
                </div>
            </div>

            {/* Col 5: Expectation */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '8px', background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#15803d' }}>{formatIndianCurrency(deal.price)}</div>
                <div style={{ fontSize: '0.65rem', color: '#64748b', lineHeight: 1.2, fontStyle: 'italic' }}>
                    {deal.priceInWords || deal.priceWord || numberToIndianWords(deal.price)}
                </div>
            </div>

            {/* Col 6: Owner Details */}
            <div className="super-cell" style={{ background: '#fefce8', padding: '8px', borderRadius: '6px', borderLeft: '3px solid #eab308' }}>
                <div className="text-ellipsis" style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.8rem', marginBottom: '4px' }}>
                    {renderValue(deal.owner?.name || deal.ownerName, 'Unknown')}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#8e44ad', fontWeight: 600, marginBottom: '2px' }}>
                    <i className="fas fa-mobile-alt" style={{ marginRight: '4px' }}></i>
                    {renderValue(deal.owner?.phones?.[0]?.number || deal.owner?.mobile || deal.owner?.phone || deal.ownerPhone, 'N/A')}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                    <i className="fas fa-envelope" style={{ marginRight: '4px' }}></i>
                    {renderValue(deal.owner?.emails?.[0]?.address || deal.owner?.email || deal.ownerEmail, 'N/A')}
                </div>
            </div>

            {/* Col 7: Associate */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {(deal.associatedContact?.name || deal.associateName) ? (
                    <>
                        <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.8rem' }}>
                            {renderValue(deal.associatedContact?.name || deal.associateName)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#8e44ad', fontWeight: 600 }}>
                            <i className="fas fa-mobile-alt" style={{ marginRight: '4px' }}></i>
                            {renderValue(deal.associatedContact?.phones?.[0]?.number || deal.associatedContact?.mobile || deal.associatedContact?.phone || deal.associatePhone)}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            <i className="fas fa-envelope" style={{ marginRight: '4px' }}></i>
                            {renderValue(deal.associatedContact?.emails?.[0]?.address || deal.associatedContact?.email || deal.associateEmail)}
                        </div>
                    </>
                ) : (
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>--</div>
                )}
            </div>

            {/* Col 8: Stage */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <DealStageChip stage={deal.stage || 'Open'} />
                {deal.stageUpdatedAt && (
                    <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>
                        <i className="fas fa-robot" style={{ marginRight: '3px', fontSize: '0.58rem' }} />
                        Auto · {new Date(deal.stageUpdatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </div>
                )}
            </div>

            {/* Col 9: Interaction */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {deal.remarks ? (
                    <div className="address-clamp" style={{ fontSize: '0.78rem', color: '#1e293b', fontWeight: 600, borderLeft: '2px solid #3b82f6', paddingLeft: '6px' }}>
                        {deal.remarks}
                    </div>
                ) : (
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>No Remarks</div>
                )}

                {deal.lastActivity ? (
                    <div style={{ background: '#f8fafc', padding: '6px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '0.65rem', color: '#6366f1', fontWeight: 800, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                            <i className="fas fa-history" style={{ fontSize: '0.6rem' }}></i>
                            {renderValue(deal.lastActivity.type)}
                        </div>
                        <div className="text-ellipsis" style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 500 }}>
                            {renderValue(deal.lastActivity.content)}
                        </div>
                        <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: '2px' }}>
                            {new Date(deal.lastActivity.performedAt).toLocaleDateString()} {new Date(deal.lastActivity.performedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                ) : (
                    <div style={{ fontSize: '0.7rem', color: '#cbd5e1' }}>No Recent Activity</div>
                )}
            </div>

            {/* Col 10: Assignment */}
            <div className="col-assignment" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="avatar-circle" style={{ width: '32px', height: '32px', fontSize: '0.8rem', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', flexShrink: 0 }}>
                        {getInitials(getUserName(deal.assignedTo || deal.assigned))}
                    </div>
                    <div style={{ lineHeight: 1.2 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a' }}>
                            {getUserName(deal.assignedTo || deal.assigned)}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>
                            {getTeamName(deal.team || deal.assignment?.team)}
                        </div>
                        <div style={{ fontSize: '0.62rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                            <i className="far fa-clock" style={{ fontSize: '0.6rem' }}></i>
                            {new Date(deal.createdAt || deal.date || Date.now()).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </div>
                    </div>
                </div>
            </div>


        </div>
    );
});
DealRow.displayName = 'DealRow';

export default DealsPage;
