import React, { useState, useRef, useEffect, useCallback } from 'react';
import AddDealModal from '../../components/AddDealModal';
import DealsFilterPanel from './components/DealsFilterPanel';
import ActiveFiltersChips from '../../components/ActiveFiltersChips';
import { useCall } from '../../context/CallContext';
import { sizeData } from '../../data/sizeData';
import { applyDealsFilters } from '../../utils/dealsFilterLogic';
import UploadModal from '../../components/UploadModal';
import AddInventoryDocumentModal from '../../components/AddInventoryDocumentModal';
import SendMailModal from '../Contacts/components/SendMailModal';
import SendMessageModal from '../../components/SendMessageModal';
import ManageTagsModal from '../../components/ManageTagsModal';
import toast from 'react-hot-toast';
import { api } from "../../utils/api";
import { getCoordinates, getPinPosition } from '../../utils/mapUtils';
import { formatIndianCurrency, numberToIndianWords } from '../../utils/numberToWords';

function DealsPage({ onNavigate, onAddActivity }) {
    const { startCall } = useCall();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);
    const [currentView, setCurrentView] = useState('list'); // 'list' or 'map'
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
    const [filters, setFilters] = useState({});
    const [deals, setDeals] = useState([]);
    const [loading, setLoading] = useState(false);
    const [totalRecords, setTotalRecords] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [recordsPerPage, setRecordsPerPage] = useState(25);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const fetchDeals = useCallback(async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams({
                page: currentPage,
                limit: recordsPerPage,
                search: searchTerm,
            });

            const response = await api.get(`deals?${queryParams.toString()}`);

            if (response.data && response.data.success) {
                setDeals(response.data.records || []);
                setTotalRecords(response.data.totalCount || 0);
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
    }, [currentPage, recordsPerPage, searchTerm, refreshTrigger]);

    useEffect(() => {
        fetchDeals();
    }, [fetchDeals]);

    // Action Modal States
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
    const [selectedDealState, setSelectedDealState] = useState(null);

    const [isSendMailOpen, setIsSendMailOpen] = useState(false);
    const [selectedDealsForMail, setSelectedDealsForMail] = useState([]);

    const [isSendMessageOpen, setIsSendMessageOpen] = useState(false);
    const [selectedDealsForMessage, setSelectedDealsForMessage] = useState([]);

    const [isManageTagsOpen, setIsManageTagsOpen] = useState(false);
    const [selectedDealsForTags, setSelectedDealsForTags] = useState([]);

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
        const search = searchTerm.toLowerCase();

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
            setSelectedDealState(deal);
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

    const handleSaveUploads = (data) => {
        if (!selectedDealState) return;
        const updatedDeals = deals.map(d =>
            d.id === selectedDealState.id ? { ...d, ...data } : d
        );
        setDeals(updatedDeals);
        toast.success('Media uploaded successfully');
    };

    const handleSaveDocuments = (docs) => {
        if (!selectedDealState) return;
        const updatedDeals = deals.map(d =>
            d.id === selectedDealState.id ? { ...d, inventoryDocuments: docs } : d
        );
        setDeals(updatedDeals);
        toast.success('Documents updated successfully');
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

    const handleDelete = async () => {
        if (selectedIds.length === 0) return;

        const confirmMsg = selectedIds.length === 1
            ? "Are you sure you want to delete this deal?"
            : `Are you sure you want to delete ${selectedIds.length} selected deals?`;

        if (!window.confirm(confirmMsg)) return;

        try {
            if (selectedIds.length === 1) {
                await api.delete(`deals/${selectedIds[0]}`);
            } else {
                await api.post(`deals/bulk-delete`, { ids: selectedIds });
            }

            toast.success(`${selectedIds.length} deal(s) deleted successfully`);
            setSelectedIds([]);
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
                <div className="pipeline-dashboard">
                    <PipelineItem label="OPEN" value="3" percent="45%" />
                    <PipelineItem label="QUOTE" value="1" percent="15%" />
                    <PipelineItem label="NEGOTIATION" value="1" percent="15%" />
                    <PipelineItem label="BOOKED" value="0" percent="0%" />
                    <ClosedPipelineItem />
                </div>

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
                                        <button className="action-btn" title="Edit Deal" onClick={handleEditClick}><i className="fas fa-edit"></i> Edit</button>
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
                                        <button className="action-btn" title="Move Stage"><i className="fas fa-step-forward"></i> Move</button>
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
                                        <button className="action-btn" title="View Quote"><i className="fas fa-file-invoice-dollar"></i> Quote</button>
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
                                    <button className="action-btn danger" title="Delete" onClick={handleDelete}><i className="fas fa-trash-alt"></i></button>
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
                                            <option value={700}>700</option>
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
                            <div><input type="checkbox" /></div>
                            <div>Score</div>
                            <div>Property Details</div>
                            <div>Location & Project</div>
                            <div>Match</div>
                            <div>Expectation</div>
                            <div>Owner_Details</div>
                            <div>Associate</div>
                            <div>Status</div>
                            <div>Interaction</div>
                            <div>Assignment</div>
                        </div>
                    )}

                    {currentView === 'list' ? (
                        <div className="list-content" style={{ background: '#fafbfc' }}>
                            <div className="list-group">
                                {filteredDeals.map((deal, index) => (<div key={deal._id} className="list-item deals-list-grid" style={{ padding: '18px 1.5rem', borderBottom: '1px solid #e2e8f0', transition: 'all 0.2s ease', background: '#fff', marginBottom: '2px' }}>
                                    <input
                                        type="checkbox"
                                        className="item-check"
                                        checked={selectedIds.includes(deal._id)}
                                        onChange={() => toggleSelect(deal._id)}
                                    />

                                    {/* Col 1: Score */}
                                    <div className={`score-indicator ${deal.score?.class || 'warm'}`} style={{ width: '40px', height: '40px', fontSize: '0.9rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', border: '2px solid rgba(0,0,0,0.05)' }}>
                                        {deal.score?.val || 0}
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
                                                    aspectRatio: 'auto',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {deal.unitNo || 'N/A'}
                                            </div>
                                            <div style={{ fontSize: '0.62rem', color: 'var(--primary-color)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                {deal.unitType || deal.corner || ''}
                                            </div>
                                        </div>
                                        <div style={{ paddingLeft: '2px' }}>
                                            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1e293b', lineHeight: 1.1 }}>
                                                {(deal.category?.lookup_value || deal.category || deal.propertyType?.lookup_value || deal.propertyType || 'N/A')}
                                                {deal.subCategory ? ` - ${deal.subCategory?.lookup_value || deal.subCategory}` : ''}
                                            </div>
                                            <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600, marginTop: '2px' }}>
                                                {deal.size || 'N/A'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Col 3: Location & Project */}
                                    <div className="super-cell">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                            <i className="fas fa-map-marker-alt" style={{ color: '#ef4444', fontSize: '0.75rem' }}></i>
                                            <span className="text-ellipsis" style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{deal.location?.lookup_value || deal.location}</span>
                                        </div>
                                        {deal.projectName && (
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>
                                                <i className="fas fa-building" style={{ marginRight: '4px', fontSize: '0.7rem' }}></i>
                                                {deal.projectName}
                                            </div>
                                        )}
                                        {deal.block && (
                                            <span className="verified-badge" style={{ fontSize: '0.58rem', padding: '2px 10px', background: '#f1f5f9', color: '#475569', fontWeight: 800 }}>BLOCK: {deal.block}</span>
                                        )}
                                    </div>

                                    {/* Col 4: Match */}
                                    <div style={{ lineHeight: 1.4, padding: '8px', background: '#f8fafc', borderRadius: '6px' }}>
                                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.8rem', textTransform: 'capitalize', marginBottom: '4px' }}>{deal.intent?.lookup_value || deal.intent}</div>
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
                                        <div className="text-ellipsis" style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.8rem', marginBottom: '4px' }}>{deal.owner?.name || 'Unknown'}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#8e44ad', fontWeight: 600, marginBottom: '2px' }}>
                                            <i className="fas fa-mobile-alt" style={{ marginRight: '4px' }}></i>{deal.owner?.phone || 'N/A'}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                            <i className="fas fa-envelope" style={{ marginRight: '4px' }}></i>{deal.owner?.email || 'N/A'}
                                        </div>
                                    </div>

                                    {/* Col 7: Associate */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                        {deal.associatedContact?.name ? (
                                            <>
                                                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.8rem' }}>{deal.associatedContact.name}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#8e44ad', fontWeight: 600 }}>
                                                    <i className="fas fa-mobile-alt" style={{ marginRight: '4px' }}></i>{deal.associatedContact.phone}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                                    <i className="fas fa-envelope" style={{ marginRight: '4px' }}></i>{deal.associatedContact.email}
                                                </div>
                                            </>
                                        ) : (
                                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>--</div>
                                        )}
                                    </div>

                                    {/* Col 8: Status */}
                                    <div>
                                        <span className={`status-badge ${(deal.status?.lookup_value || deal.status) === 'Open' ? 'hot' : (deal.status?.lookup_value || deal.status) === 'Quote' ? 'warm' : 'cold'}`} style={{ fontSize: '0.7rem', padding: '4px 10px', borderRadius: '12px', fontWeight: 700 }}>
                                            {(deal.status?.lookup_value || deal.status || 'Unknown').toUpperCase()}
                                        </span>
                                    </div>

                                    {/* Col 9: Interaction (Remarks + Latest Activity) */}
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
                                                    {deal.lastActivity.type}
                                                </div>
                                                <div className="text-ellipsis" style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 500 }}>
                                                    {deal.lastActivity.content}
                                                </div>
                                                <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: '2px' }}>
                                                    {new Date(deal.lastActivity.performedAt).toLocaleDateString()} {new Date(deal.lastActivity.performedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: '0.7rem', color: '#cbd5e1' }}>No Recent Activity</div>
                                        )}
                                    </div>

                                    {/* Col 10: Assignment (Assigned To + Time) */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: '#4338ca', fontWeight: 800 }}>
                                                {(deal.assignedTo?.name || deal.assigned || 'U')[0].toUpperCase()}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: '#0f172a', fontWeight: 700 }}>
                                                {deal.assignedTo?.name || deal.assigned || 'Unassigned'}
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600, paddingLeft: '26px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <i className="far fa-calendar-alt" style={{ fontSize: '0.6rem' }}></i>
                                                {new Date(deal.createdAt || deal.date).toLocaleDateString()}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '1px' }}>
                                                <i className="far fa-clock" style={{ fontSize: '0.6rem' }}></i>
                                                {new Date(deal.createdAt || deal.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
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
                                                {deal.location}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '4px' }}>
                                                {deal.propertyType} - {deal.size}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981' }}>
                                                ₹{deal.price}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Google Map with Pins */}
                            <div style={{ flex: 1, position: 'relative' }}>
                                <iframe
                                    src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d221096.81984827753!2d76.6395!3d30.3398!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x390fb6000000001%3A0x4e8b6e8b6e8b6e8b!2sMohali%2C%20Punjab!5e0!3m2!1sen!2sin!4v1234567890123!5m2!1sen!2sin"
                                    width="100%"
                                    height="100%"
                                    style={{ border: 0 }}
                                    allowFullScreen=""
                                    loading="lazy"
                                    referrerPolicy="no-referrer-when-downgrade"
                                ></iframe>

                                {/* Deal Pin Markers Overlay */}
                                {filteredDeals.map((deal, idx) => {
                                    const coords = getCoordinates(deal);
                                    if (!coords) return null;

                                    const position = getPinPosition(coords.lat, coords.lng);

                                    return (
                                        <div
                                            key={idx}
                                            style={{
                                                position: 'absolute',
                                                left: position.left,
                                                top: position.top,
                                                transform: 'translate(-50%, -100%)',
                                                cursor: 'pointer',
                                                zIndex: 10,
                                                transition: 'all 0.2s'
                                            }}
                                            title={`${deal.id} - ${deal.location}`}
                                        >
                                            {/* Pin Marker */}
                                            <div style={{
                                                width: '32px',
                                                height: '40px',
                                                position: 'relative',
                                                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                                            }}>
                                                {/* Pin Shape */}
                                                <svg width="32" height="40" viewBox="0 0 32 40" style={{ position: 'absolute', top: 0, left: 0 }}>
                                                    <path
                                                        d="M16 0C7.163 0 0 7.163 0 16c0 8.837 16 24 16 24s16-15.163 16-24C32 7.163 24.837 0 16 0z"
                                                        fill="#ef4444"
                                                        stroke="#fff"
                                                        strokeWidth="2"
                                                    />
                                                </svg>
                                                {/* Pin Number */}
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '6px',
                                                    left: '50%',
                                                    transform: 'translateX(-50%)',
                                                    color: '#fff',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 800,
                                                    textAlign: 'center',
                                                    width: '100%'
                                                }}>
                                                    {idx + 1}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}

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

                    {/* Footer - Shows in both list and map view */}
                    <div className="list-footer" style={{ padding: '15px 2rem', background: '#fff', borderTop: '1px solid #eef2f5', display: 'flex', gap: '20px', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>Summary</div>
                        <div style={{ fontSize: '0.9rem', color: '#334155' }}>Total Deals <span style={{ fontWeight: 800, color: '#10b981', fontSize: '1rem', marginLeft: '5px' }}>{totalRecords}</span></div>
                    </div>
                </div>
            </div >

            <AddDealModal
                isOpen={isAddModalOpen}
                deal={selectedDealState}
                onClose={() => {
                    setIsAddModalOpen(false);
                    setSelectedDealState(null);
                }}
                onSave={(updatedData) => {
                    if (selectedDealState) {
                        setDeals(prev => prev.map(d => d.id === selectedDealState.id ? { ...d, ...updatedData } : d));
                    } else {
                        const formattedDeal = {
                            ...updatedData,
                            id: `D${Math.floor(Math.random() * 10000)}`,
                            score: { val: 60, class: 'warm' } // Mock initial score
                        };
                        setDeals(prev => [formattedDeal, ...prev]);
                    }
                    setIsAddModalOpen(false);
                    setSelectedDealState(null);
                }}
            />

            <SendMailModal
                isOpen={isSendMailOpen}
                onClose={() => setIsSendMailOpen(false)}
                selectedContacts={selectedDealsForMail}
            />

            <SendMessageModal
                isOpen={isSendMessageOpen}
                onClose={() => setIsSendMessageOpen(false)}
                selectedContacts={selectedDealsForMessage}
            />

            <ManageTagsModal
                isOpen={isManageTagsOpen}
                onClose={() => setIsManageTagsOpen(false)}
                selectedItems={selectedDealsForTags}
                entityType="deals"
                onSave={(updatedItems) => {
                    const updatedIds = updatedItems.map(item => item.id);
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
        </section >
    );
}

// Helper Components for Pipeline Dashboard
function PipelineItem({ label, value, percent }) {
    return (
        <div className="pipeline-item">
            <div className="pipeline-content-wrapper">
                <div>
                    <div className="pipeline-label">{label}</div>
                    <div className="pipeline-value">{value}</div>
                </div>
                <div className="pipeline-percent">{percent}</div>
            </div>
        </div>
    );
}

function ClosedPipelineItem() {
    const [isOpen, setIsOpen] = useState(false);
    const itemRef = useRef(null);
    const [menuStyle, setMenuStyle] = useState({});

    const handleMouseEnter = () => {
        if (itemRef.current) {
            const rect = itemRef.current.getBoundingClientRect();
            setMenuStyle({
                position: 'fixed',
                top: `${rect.bottom}px`,
                left: `${rect.left}px`,
                width: `${rect.width}px`,
                display: 'block',
                zIndex: 1000
            });
            setIsOpen(true);
        }
    };

    const handleMouseLeave = () => {
        setIsOpen(false);
    };

    useEffect(() => {
        const handleScroll = () => {
            if (isOpen) setIsOpen(false);
        };
        if (isOpen) {
            window.addEventListener('scroll', handleScroll, { passive: true });
        }
        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, [isOpen]);

    return (
        <div
            className="pipeline-item"
            ref={itemRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{ cursor: 'pointer' }}
        >
            <div className="pipeline-content-wrapper">
                <div>
                    <div className="pipeline-label">CLOSED</div>
                    <div className="pipeline-value">
                        <i className="fas fa-chevron-down" style={{ fontSize: '0.8rem' }}></i>
                    </div>
                </div>
                <div className="pipeline-percent">25%</div>
            </div>
            {isOpen && (
                <div className="pipeline-sub-stages show" style={menuStyle}>
                    <div className="sub-stage-item success">
                        <div className="sub-label">Won</div>
                        <div className="sub-stats">
                            <span className="sub-val">2</span>
                            <span className="sub-percent">20%</span>
                        </div>
                    </div>
                    <div className="sub-stage-item danger">
                        <div className="sub-label">Lost</div>
                        <div className="sub-stats">
                            <span className="sub-val">0</span>
                            <span className="sub-percent">5%</span>
                        </div>
                    </div>
                    <div className="sub-stage-item warning">
                        <div className="sub-label">Reject</div>
                        <div className="sub-stats">
                            <span className="sub-val">0</span>
                            <span className="sub-percent">0%</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const DealsPageWrapper = () => (
    <>
        <DealsPage />
    </>
);

export default DealsPage;
