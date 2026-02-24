import React, { useState, useCallback, useEffect } from 'react';
import { useUserContext } from '../../context/UserContext';
import { getInitials } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { useTriggers } from '../../context/TriggersContext';
import { useCall } from '../../context/CallContext';
import { usePropertyConfig } from '../../context/PropertyConfigContext';
import { PROJECTS_LIST } from '../../data/projectData';
import { renderValue } from '../../utils/renderUtils';
import { dealIntakeData } from '../../data/dealIntakeData';
import { api } from "../../utils/api";

import UploadModal from '../../components/UploadModal';
import AddInventoryDocumentModal from '../../components/AddInventoryDocumentModal';
import AddInventoryModal from '../../components/AddInventoryModal';
import AddOwnerModal from '../../components/AddOwnerModal';
import ComposeEmailModal from '../Communication/components/ComposeEmailModal';
import SendMessageModal from '../../components/SendMessageModal';
import ManageTagsModal from '../../components/ManageTagsModal';
import InventoryFeedbackModal from '../../components/InventoryFeedbackModal';
import InventoryFilterPanel from './components/InventoryFilterPanel';
import { applyInventoryFilters } from '../../utils/inventoryFilterLogic';
import { getCoordinates, getPinPosition } from '../../utils/mapUtils';
import AddDealModal from '../../components/AddDealModal';

export default function InventoryPage({ onNavigate, onAddActivity }) {
    const { teams, users } = useUserContext();
    const { fireEvent } = useTriggers();
    const { startCall } = useCall();
    const { masterFields, getLookupValue } = usePropertyConfig();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'map'
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
    const [isEditInventoryModalOpen, setIsEditInventoryModalOpen] = useState(false);
    const [selectedProperty, setSelectedProperty] = useState(null);
    const [inventoryItems, setInventoryItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [totalRecords, setTotalRecords] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [recordsPerPage, setRecordsPerPage] = useState(25);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Advanced Filtering State
    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
    const [filters, setFilters] = useState({});

    // Missing State Definitions
    const [isOwnerModalOpen, setIsOwnerModalOpen] = useState(false);
    const [currentOwners, setCurrentOwners] = useState([]);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
    const [isTagsModalOpen, setIsTagsModalOpen] = useState(false);
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
    const [isAddDealModalOpen, setIsAddDealModalOpen] = useState(false);
    const [selectedDealData, setSelectedDealData] = useState(null);
    const [modalData, setModalData] = useState([]);

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
            return ownerValue.name || ownerValue.lookup_value || "Admin";
        }
        const found = users.find(u => (u._id === ownerValue) || (u.id === ownerValue));
        return found ? (found.firstName ? `${found.firstName} ${found.lastName}` : (found.name || found.username)) : ownerValue;
    }, [users]);

    const fetchInventory = useCallback(async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams({
                page: currentPage,
                limit: recordsPerPage,
                search: searchTerm,
            });

            const response = await api.get(`inventory?${queryParams.toString()}`);

            if (response.data && response.data.success) {
                // Backend returns 'records' not 'data' for paginated results
                setInventoryItems(response.data.records || []);
                setTotalRecords(response.data.totalCount || 0);
            } else {
                toast.error("Failed to fetch inventory");
                setInventoryItems([]);
                setTotalRecords(0);
            }
        } catch (error) {
            console.error("Error fetching inventory:", error);
            toast.error("Error loading inventory");
            setInventoryItems([]);
            setTotalRecords(0);
        } finally {
            setLoading(false);
        }
    }, [currentPage, recordsPerPage, searchTerm, refreshTrigger]);

    useEffect(() => {
        fetchInventory();

        // Listen for global inventory updates (e.g., from MainLayout modal)
        const handleInventoryUpdate = () => {
            console.log("Global inventory update triggered");
            fetchInventory();
        };

        window.addEventListener('inventory-updated', handleInventoryUpdate);

        return () => {
            window.removeEventListener('inventory-updated', handleInventoryUpdate);
        };
    }, [currentPage, filters, viewMode, fetchInventory]);

    // Helper: Parse Price (e.g. "1.25 Cr" -> 12500000)
    const parsePrice = (priceStr) => {
        if (!priceStr) return 0;
        const cleanStr = priceStr.toString().toLowerCase().replace(/,/g, '').trim();
        let multiplier = 1;
        if (cleanStr.includes('cr')) multiplier = 10000000;
        else if (cleanStr.includes('lac') || cleanStr.includes('lakh')) multiplier = 100000;
        else if (cleanStr.includes('k')) multiplier = 1000;

        const num = parseFloat(cleanStr.replace(/[a-z]/g, ''));
        return isNaN(num) ? 0 : num * multiplier;
    };

    // Helper: Parse Size (e.g. "10 Marla" -> 10) - Simplistic for now
    const parseSize = (sizeStr) => {
        if (!sizeStr) return 0;
        const num = parseFloat(sizeStr.replace(/,/g, '')); // simplistic
        return isNaN(num) ? 0 : num;
    };

    // Use the extracted filter logic
    const filteredInventory = applyInventoryFilters(inventoryItems, filters, PROJECTS_LIST);


    const getSelectedProperty = () => inventoryItems.find(p => p._id === selectedIds[0]);

    const handleUploadClick = () => {
        const property = getSelectedProperty();
        if (property) {
            setSelectedProperty(property);
            setIsUploadModalOpen(true);
        }
    };

    const handleEditClick = () => {
        const property = getSelectedProperty();
        if (property) {
            setSelectedProperty(property);
            setIsEditInventoryModalOpen(true);
        }
    };

    const handleDocumentClick = () => {
        const property = getSelectedProperty();
        if (property) {
            setSelectedProperty(property);
            setIsDocumentModalOpen(true);
        }
    };

    // --- New Action Handlers ---

    const handleOwnerClick = () => {
        const property = getSelectedProperty();
        if (property) {
            // Mock parsing owner data from flat mock data
            const owners = [];
            if (property.owners && property.owners.length > 0) {
                property.owners.forEach(owner => {
                    owners.push({
                        name: owner.name,
                        mobile: owner.phones?.[0]?.number || owner.mobile || '',
                        role: 'Property Owner'
                    });
                });
            } else if (property.ownerName) {
                owners.push({ name: property.ownerName, mobile: property.ownerPhone, role: 'Property Owner' });
            }

            if (property.associates && property.associates.length > 0) {
                property.associates.forEach(assoc => {
                    owners.push({
                        name: assoc.name,
                        mobile: assoc.phones?.[0]?.number || assoc.mobile || '',
                        role: 'Associate',
                        relationship: assoc.relationship || 'Broker'
                    });
                });
            } else if (property.associatedContact) {
                owners.push({ name: property.associatedContact, mobile: property.associatedPhone, role: 'Associate', relationship: 'Broker' });
            }

            setCurrentOwners(owners);
            setSelectedProperty(property);
            setIsOwnerModalOpen(true);
        }
    };

    const handleSaveOwners = async (owners) => {
        if (!selectedProperty) return;

        try {
            // Persist to Backend
            const response = await api.put(`inventory/${selectedProperty._id}`, {
                owners: owners.filter(o => o.role === 'Property Owner'),
                associates: owners.filter(o => o.role === 'Associate')
            });

            if (response.data && response.data.success) {
                toast.success('Owner details updated successfully');
                fetchInventory(); // Refresh list to show updated data
                setIsOwnerModalOpen(false);
            } else {
                toast.error('Failed to update owner details');
            }
        } catch (error) {
            console.error("Error updating owners:", error);
            toast.error("Error saving owner details");
        }
    };

    const getTargetContacts = () => {
        // Collect owners/associates from selected properties
        const targets = [];
        selectedIds.forEach(id => {
            const prop = inventoryItems.find(p => p._id === id);
            if (prop) {
                if (prop.owners && prop.owners.length > 0) {
                    prop.owners.forEach(owner => {
                        targets.push({
                            name: owner.name,
                            mobile: owner.phones?.[0]?.number || owner.mobile || '',
                            email: owner.emails?.[0]?.address || owner.ownerEmail || 'owner@example.com'
                        });
                    });
                } else if (prop.ownerName) {
                    targets.push({ name: prop.ownerName, mobile: prop.ownerPhone, email: prop.ownerEmail || 'owner@example.com' });
                }

                if (prop.associates && prop.associates.length > 0) {
                    prop.associates.forEach(assoc => {
                        targets.push({
                            name: assoc.name,
                            mobile: assoc.phones?.[0]?.number || assoc.mobile || '',
                            email: assoc.emails?.[0]?.address || assoc.associatedEmail || 'associate@example.com'
                        });
                    });
                } else if (prop.associatedContact) {
                    targets.push({ name: prop.associatedContact, mobile: prop.associatedPhone, email: prop.associatedEmail || 'associate@example.com' });
                }
            }
        });
        return targets;
    };

    const handleEmailClick = () => {
        const targets = getTargetContacts();
        if (targets.length > 0) {
            setModalData(targets); // Pass to email modal
            setIsEmailModalOpen(true);
        }
    };

    const handleMessageClick = () => {
        const targets = getTargetContacts().map(t => ({ name: t.name, phone: t.mobile }));
        if (targets.length > 0) {
            setModalData(targets);
            setIsMessageModalOpen(true);
        }
    };

    const handleTagClick = () => {
        const targets = getTargetContacts();
        if (targets.length > 0) {
            setModalData(targets);
            setIsTagsModalOpen(true);
        }
    };

    const handleFeedbackClick = () => {
        const property = getSelectedProperty();
        if (property) {
            setSelectedProperty(property);
            setIsFeedbackModalOpen(true);
        }
    };

    const handleSaveFeedback = async (data) => {
        if (!selectedProperty) return;

        try {
            const now = new Date();
            const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

            // Construct useful remark string
            let newRemark = `${data.result}`;
            if (data.reason) newRemark += ` (${data.reason})`; // Add sub-reason
            if (data.feedback) newRemark += `: ${data.feedback}`;
            if (data.nextActionDate) {
                newRemark += ` | Next: ${data.nextActionType} on ${data.nextActionDate} @ ${data.nextActionTime}`;
            }

            // Automation: Mark as Sold/Rented/Inactive
            let newStatus = selectedProperty.status;
            if (data.markAsSold && data.reason) {
                if (String(data.reason).includes('Sold Out')) {
                    newStatus = 'Sold Out';
                } else if (String(data.reason).includes('Rented Out')) {
                    newStatus = 'Rented Out';
                } else {
                    newStatus = 'Inactive';
                }
            }

            // Create History Entry
            const newInteraction = {
                id: Date.now(),
                date: dateStr,
                time: timeStr,
                user: 'You',
                action: data.nextActionType || 'Call',
                result: data.result,
                reason: data.reason, // Store specific reason for filtering
                note: newRemark
            };

            const currentHistory = selectedProperty.history || [];

            const updates = {
                lastContactDate: dateStr,
                lastContactTime: timeStr,
                lastContactUser: 'You',
                remarks: newRemark, // Keep showing latest remark in main view
                status: newStatus,
                history: [newInteraction, ...currentHistory] // Add new at top
            };

            // Persist to Backend
            const response = await api.put(`inventory/${selectedProperty._id}`, updates);

            if (response.data && response.data.success) {
                toast.success("Feedback recorded successfully");
                fetchInventory(); // Refresh list to show updated data
            } else {
                toast.error("Failed to save feedback");
            }
        } catch (error) {
            console.error("Error saving feedback:", error);
            toast.error("Error saving feedback");
        }
    };

    const handleCreateDeal = () => {
        const property = getSelectedProperty();
        if (property) {
            setSelectedDealData({
                projectName: property.projectName || property.area || '',
                block: property.block || (String(property.location || '').split(' ')[0]) || '',
                unitNo: property.unitNo || property.unitNumber || '',
                propertyType: property.category || property.type || '',
                subCategory: property.subCategory || '',
                size: property.size || property.plotArea || '',
                owner: {
                    name: property.owners?.[0]?.name || property.ownerName || '',
                    phone: property.owners?.[0]?.phones?.[0]?.number || property.owners?.[0]?.phone || property.ownerPhone || '',
                    email: property.owners?.[0]?.emails?.[0]?.address || property.owners?.[0]?.email || property.ownerEmail || ''
                }
            });
            setIsAddDealModalOpen(true);
        }
    };

    const handleDelete = async () => {
        if (selectedIds.length === 0) return;

        const confirmMsg = selectedIds.length === 1
            ? "Are you sure you want to delete this property?"
            : `Are you sure you want to delete ${selectedIds.length} selected properties?`;

        if (!window.confirm(confirmMsg)) return;

        try {
            if (selectedIds.length === 1) {
                await api.delete(`inventory/${selectedIds[0]}`);
            } else {
                await api.post(`inventory/bulk-delete`, { ids: selectedIds });
            }

            toast.success(`${selectedIds.length} property(s) deleted successfully`);
            setSelectedIds([]);
            fetchInventory();
        } catch (error) {
            console.error("Error deleting inventory:", error);
            toast.error("Failed to delete inventory");
        }
    };

    const toggleSelect = (id) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(itemId => itemId !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedIds(filteredInventory.map(item => item._id));
        } else {
            setSelectedIds([]);
        }
    };

    // Pagination Handlers
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


    return (
        <section id="inventoryView" className="view-section active">
            {viewMode === 'list' ? (
                <div className="view-scroll-wrapper">
                    <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div className="page-title-group" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '40px', height: '40px', background: '#f0fdf4', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <i className="fas fa-warehouse" style={{ color: '#16a34a', fontSize: '1.2rem' }}></i>
                            </div>
                            <div>
                                <h1 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>Inventory</h1>
                                <p style={{ fontSize: '0.9rem', color: '#64748b' }}>Manage your property listings</p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <div className="view-toggle-group" style={{ marginRight: '10px' }}>
                                <button
                                    className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                                    onClick={() => setViewMode('list')}
                                >
                                    <i className="fas fa-list"></i> List View
                                </button>
                                <button
                                    className={`view-toggle-btn ${viewMode === 'map' ? 'active' : ''}`}
                                    onClick={() => setViewMode('map')}
                                >
                                    <i className="fas fa-map-marked-alt"></i> Map View
                                </button>
                            </div>
                            <button
                                className="toolbar-btn"
                                onClick={() => setIsFilterPanelOpen(true)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
                                    backgroundColor: Object.keys(filters).length > 0 ? '#eff6ff' : '#fff',
                                    color: Object.keys(filters).length > 0 ? '#2563eb' : '#64748b',
                                    border: Object.keys(filters).length > 0 ? '1px solid #2563eb' : '1px solid #e2e8f0',
                                    borderRadius: '8px', cursor: 'pointer', fontWeight: 600
                                }}
                            >
                                <i className="fas fa-filter"></i> Filters
                                {Object.keys(filters).length > 0 && <span style={{ background: '#2563eb', color: '#fff', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '10px' }}>{Object.keys(filters).length}</span>}
                            </button>
                        </div>
                        {/* Filter Panel */}
                        <InventoryFilterPanel
                            isOpen={isFilterPanelOpen}
                            onClose={() => setIsFilterPanelOpen(false)}
                            filters={filters}
                            onFilterChange={setFilters}
                        />
                    </div>

                    <div className="inventory-stats-row" style={{ padding: '12px 25px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', gap: '15px' }}>
                            <div className="status-card" style={{ padding: '8px 15px', maxWidth: '200px' }}>
                                <div className="stat-icon-dot dot-active"></div>
                                <div className="stat-card-info">
                                    <h3 style={{ fontSize: '0.7rem' }}>Total Inventory</h3>
                                    <div className="stat-count" style={{ fontSize: '1.2rem', color: '#2563eb' }}>{totalRecords.toLocaleString()}</div>
                                </div>
                            </div>
                            <div className="status-card" style={{ padding: '8px 15px', maxWidth: '180px' }}>
                                <div className="stat-icon-dot" style={{ background: '#94a3b8' }}></div>
                                <div className="stat-card-info">
                                    <h3 style={{ fontSize: '0.7rem' }}>Showing</h3>
                                    <div className="stat-count" style={{ fontSize: '1.2rem', color: '#64748b' }}>{inventoryItems.length}</div>
                                </div>
                            </div>
                        </div>

                        {/* Deal Intake Icon moved here */}
                        <div
                            style={{ position: 'relative', cursor: 'pointer', marginLeft: 'auto' }}
                            onClick={() => onNavigate && onNavigate('deal-intake')}
                            title="Deal Intake Inbox"
                        >
                            <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#fff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                <i className="fas fa-inbox" style={{ color: '#64748b', fontSize: '1.1rem' }}></i>
                            </div>
                            {dealIntakeData && dealIntakeData.length > 0 && (
                                <div style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#ef4444', color: '#fff', fontSize: '0.7rem', fontWeight: 800, width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>
                                    {dealIntakeData.length}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="content-body" style={{ overflowY: 'visible', paddingTop: 0 }}>
                        <div className="toolbar-container" style={{ position: 'sticky', top: 0, zIndex: 1000, padding: '5px 2rem', borderBottom: '1px solid #eef2f5', minHeight: '45px', display: 'flex', alignItems: 'center', background: '#fff' }}>
                            {selectedIds.length > 0 ? (
                                <div className="action-panel" style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', overflowX: 'auto', paddingTop: '4px', paddingBottom: '2px' }}>
                                    <div className="selection-count" style={{ marginRight: '10px', fontWeight: 600, color: 'var(--primary-color)', whiteSpace: 'nowrap' }}>
                                        {selectedIds.length} Selected
                                    </div>

                                    {/* Single Selection Only Actions */}
                                    {selectedIds.length === 1 && (
                                        <>
                                            <button className="action-btn" title="Edit Property" style={{ flexShrink: 0 }} onClick={handleEditClick}><i className="fas fa-edit"></i> Edit</button>
                                            <button
                                                className="action-btn"
                                                title="Add Activity"
                                                style={{ flexShrink: 0 }}
                                                onClick={() => {
                                                    const property = getSelectedProperty();
                                                    if (property && onAddActivity) {
                                                        onAddActivity([{ type: 'Inventory', id: property._id, name: property.unitNo, model: 'Inventory' }], { inventory: property });
                                                    }
                                                }}
                                            >
                                                <i className="fas fa-calendar-plus"></i> Activity
                                            </button>
                                            <button className="action-btn" title="Create Deal" style={{ flexShrink: 0 }} onClick={handleCreateDeal}><i className="fas fa-plus-circle"></i> Deal</button>
                                            <button
                                                className="action-btn"
                                                title="Match Lead"
                                                style={{ flexShrink: 0 }}
                                                onClick={() => {
                                                    const property = getSelectedProperty();
                                                    if (property) {
                                                        fireEvent('inventory_matching_requested', property, {
                                                            entityType: 'inventory',
                                                            recommendationDepth: 'high'
                                                        });
                                                        toast.success(`Searching for leads matching ${property.unitNo}...`);
                                                    }
                                                }}
                                            >
                                                <i className="fas fa-handshake"></i> Match
                                            </button>
                                            <button className="action-btn" title="Add Owner" style={{ flexShrink: 0 }} onClick={handleOwnerClick}><i className="fas fa-user-plus"></i> Owner</button>
                                            <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px', flexShrink: 0 }}></div>
                                            <button
                                                className="action-btn"
                                                title="Call Owner"
                                                style={{ flexShrink: 0 }}
                                                onClick={() => {
                                                    const property = getSelectedProperty();
                                                    if (property) {
                                                        startCall({
                                                            name: property.owners?.[0]?.name || property.ownerName || 'Unknown Owner',
                                                            mobile: property.owners?.[0]?.phones?.[0]?.number || property.ownerPhone
                                                        }, {
                                                            purpose: 'Owner Update',
                                                            entityId: property.id,
                                                            entityType: 'inventory'
                                                        });
                                                    }
                                                }}
                                            >
                                                <i className="fas fa-phone-alt" style={{ transform: 'scaleX(-1) rotate(5deg)' }}></i> Call
                                            </button>
                                            <button className="action-btn" title="Message Owner" style={{ flexShrink: 0 }} onClick={handleMessageClick}><i className="fas fa-comment-alt"></i> Message</button>
                                            <button className="action-btn" title="Email Owner" style={{ flexShrink: 0 }} onClick={handleEmailClick}><i className="fas fa-envelope"></i> Email</button>
                                            <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px', flexShrink: 0 }}></div>
                                        </>
                                    )}

                                    {/* Available for Both Single and Multi */}
                                    <button className="action-btn" title="Add Tag" style={{ flexShrink: 0 }} onClick={handleTagClick}><i className="fas fa-tag"></i> Tag</button>

                                    {/* Single Selection Only Actions (Files/Feedback) */}
                                    {selectedIds.length === 1 && (
                                        <>
                                            <button className="action-btn" title="Upload Files" style={{ flexShrink: 0 }} onClick={handleUploadClick}><i className="fas fa-cloud-upload-alt"></i> Upload</button>
                                            <button className="action-btn" title="Manage Documents" style={{ flexShrink: 0 }} onClick={handleDocumentClick}><i className="fas fa-file-alt"></i> Document</button>
                                            <button className="action-btn" title="Feedback" style={{ flexShrink: 0 }} onClick={handleFeedbackClick}><i className="fas fa-comment-dots"></i> Feedback</button>
                                        </>
                                    )}

                                    <div style={{ marginLeft: 'auto' }}>
                                        <button className="action-btn danger" title="Delete" onClick={handleDelete}><i className="fas fa-trash-alt"></i></button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                    <div style={{ position: 'relative' }}>
                                        <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.85rem' }}></i>
                                        <input
                                            type="text"
                                            placeholder="Search by ID, Project or Owner..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            style={{ width: '400px', padding: '8px 15px 8px 45px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '0.85rem', outline: 'none' }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                        <div style={{ fontSize: '0.85rem', color: '#68737d', fontWeight: 500 }}>
                                            Total: <strong>{totalRecords}</strong> Properties
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

                        <div className="list-header inventory-list-grid" style={{ position: 'sticky', top: '45px', zIndex: 99, padding: '12px 1.5rem', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <div><input type="checkbox" onChange={handleSelectAll} checked={selectedIds.length === filteredInventory.length && filteredInventory.length > 0} /></div>
                            <div>Property Details</div>
                            <div>Project & Location</div>
                            <div>Orientation</div>
                            <div>Owner Profile</div>
                            <div>Associate Contact</div>
                            <div>Status</div>
                            <div style={{ textAlign: 'right' }}>Assignment</div>
                        </div>

                        <div className="list-content">
                            {filteredInventory.length === 0 ? (
                                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                    <i className="fas fa-search" style={{ fontSize: '2rem', marginBottom: '10px', opacity: 0.5 }}></i>
                                    <p>No inventory items match your filters.</p>
                                    <button onClick={() => setFilters({})} style={{ marginTop: '10px', border: 'none', background: 'transparent', color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }}>Clear Filters</button>
                                </div>
                            ) : (
                                filteredInventory.map((item) => (
                                    <div key={item._id} className="list-item inventory-list-grid" style={{ padding: '10px 1.5rem', alignItems: 'flex-start' }}>
                                        <input
                                            type="checkbox"
                                            className="item-check"
                                            checked={selectedIds.includes(item._id)}
                                            onChange={() => toggleSelect(item._id)}
                                            style={{ marginTop: '8px' }}
                                        />

                                        <div className="super-cell">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                                <div
                                                    className={`project-thumbnail ${item.status === 'Active' ? 'thumb-active' : 'thumb-inactive'}`}
                                                    onClick={() => onNavigate('inventory-detail', item._id)}
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
                                                    {renderValue(item.unitNo) || renderValue(item.unitNumber) || 'N/A'}
                                                </div>
                                                <div style={{ fontSize: '0.62rem', color: 'var(--primary-color)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                    {renderValue(getLookupValue('UnitType', item.unitType)) || renderValue(getLookupValue('Facing', item.facing)) || ''}
                                                </div>
                                            </div>
                                            <div style={{ paddingLeft: '2px' }}>
                                                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1e293b', lineHeight: 1.1 }}>
                                                    {renderValue(getLookupValue('Category', item.category)) || renderValue(getLookupValue('PropertyType', item.type)) || 'N/A'} - {renderValue(getLookupValue('SubCategory', item.subCategory)) || ''}
                                                </div>
                                                <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600, marginTop: '2px' }}>
                                                    {renderValue(item.size) || renderValue(item.plotArea) || 'N/A'}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="super-cell">
                                            <div className="cell-value-main text-ellipsis" style={{ fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.2, color: '#0f172a' }}>
                                                {renderValue(item.projectName) || renderValue(item.area) || 'Unknown Project'}
                                            </div>
                                            <div className="cell-value-sub text-ellipsis" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>
                                                {renderValue(item.locationSearch) || renderValue(item.location) || 'No Location'}
                                            </div>
                                            <div style={{ marginTop: '6px' }}>
                                                <span className="verified-badge text-ellipsis" style={{ fontSize: '0.58rem', padding: '2px 10px', background: '#f1f5f9', color: '#475569', fontWeight: 800, display: 'inline-block', maxWidth: '100%' }}>
                                                    BLOCK: {renderValue(item.block) || (String(item.location || '').split(' ')[0]) || 'N/A'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="super-cell">
                                            <div className="cell-label" style={{ marginTop: 0, color: '#94a3b8' }}>Facing & Directions</div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                {(renderValue(item.direction) && renderValue(item.direction) !== '-') && <div style={{ fontSize: '0.75rem', color: '#334155', fontWeight: 500 }}><i className="fas fa-compass" style={{ color: '#3b82f6', width: '14px' }}></i> {renderValue(getLookupValue('Direction', item.direction))}</div>}
                                                {(renderValue(item.facing) && renderValue(item.facing) !== '-') && <div style={{ fontSize: '0.75rem', color: '#334155', fontWeight: 500 }}><i className="fas fa-map-signs" style={{ color: '#f59e0b', width: '14px' }}></i> {renderValue(getLookupValue('Facing', item.facing))}</div>}
                                                {(renderValue(item.roadWidth) || renderValue(item.road)) && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}><i className="fas fa-road" style={{ width: '14px' }}></i> {renderValue(getLookupValue('RoadWidth', item.roadWidth || item.road))}</div>}
                                            </div>
                                        </div>

                                        <div className="super-cell">
                                            {/* Handle legacy owner fields AND new owners array */}
                                            {((item.owners && item.owners.length > 0) || item.ownerName) ? (
                                                <>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                                                        <div className="text-ellipsis" style={{
                                                            fontWeight: 800,
                                                            color: (renderValue(item.status) === 'Sold Out') ? '#94a3b8' : 'var(--primary-color)',
                                                            fontSize: '0.85rem'
                                                        }}>
                                                            {item.owners && item.owners.length > 0 ? renderValue(item.owners[0]?.name) : renderValue(item.ownerName)}
                                                        </div>
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1e293b', marginBottom: '2px' }}>
                                                        {item.owners && item.owners.length > 0 ? renderValue(item.owners[0]?.phones?.[0]?.number || 'No Phone') : renderValue(item.ownerPhone)}
                                                    </div>
                                                    <div className="address-clamp" style={{ fontSize: '0.68rem', lineHeight: '1.2' }} title={renderValue(item.ownerAddress)}>
                                                        {item.address ? `${renderValue(item.address.location || '')} ${renderValue(item.address.city || '')}` : renderValue(item.ownerAddress)}
                                                    </div>
                                                </>
                                            ) : <div style={{ color: '#cbd5e1', fontStyle: 'italic', fontSize: '0.75rem' }}>No owner data</div>}
                                        </div>

                                        <div className="super-cell">
                                            {(() => {
                                                const associate = (item.associates && item.associates.length > 0) ? item.associates[0] : item.owners?.find(o => o.role === 'Associate' || o.link_role === 'Associate');
                                                if (associate) {
                                                    return (
                                                        <>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                                                                <div style={{ fontWeight: 800, color: '#6366f1', fontSize: '0.85rem' }}>{renderValue(associate.name)}</div>
                                                            </div>
                                                            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1e293b', marginBottom: '2px' }}>{renderValue(associate.phones?.[0]?.number || associate.mobile)}</div>
                                                            <div className="address-clamp" style={{ fontSize: '0.68rem', lineHeight: '1.2', color: '#94a3b8' }}>
                                                                {renderValue(associate.relationship) ? `Associate (${renderValue(associate.relationship)})` : 'Verified Associate'}
                                                            </div>
                                                        </>
                                                    );
                                                } else if (item.associatedContact) {
                                                    // Fallback for legacy data
                                                    return (
                                                        <>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                                                                <div style={{ fontWeight: 800, color: '#6366f1', fontSize: '0.85rem' }}>{renderValue(item.associatedContact)}</div>
                                                            </div>
                                                            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1e293b', marginBottom: '2px' }}>{renderValue(item.associatedPhone)}</div>
                                                            <div className="address-clamp" style={{ fontSize: '0.68rem', lineHeight: '1.2', color: '#94a3b8' }}>
                                                                Verified Associate Representative
                                                            </div>
                                                        </>
                                                    );
                                                } else {
                                                    return <div style={{ color: '#cbd5e1', fontStyle: 'italic', fontSize: '0.75rem' }}>No associate</div>;
                                                }
                                            })()}
                                        </div>

                                        <div className="super-cell">
                                            <div style={{
                                                fontSize: '0.75rem',
                                                fontWeight: 700,
                                                color: renderValue(item.status) === 'Active' ? '#10b981' : (renderValue(item.status) === 'Sold Out' || renderValue(item.status) === 'Rented Out') ? '#f59e0b' : '#64748b',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                marginBottom: '4px'
                                            }}>
                                                <div style={{
                                                    width: '8px',
                                                    height: '8px',
                                                    borderRadius: '50%',
                                                    background: renderValue(item.status) === 'Active' ? '#10b981' : (renderValue(item.status) === 'Sold Out' || renderValue(item.status) === 'Rented Out') ? '#f59e0b' : '#64748b'
                                                }}></div>
                                                {renderValue(item.status) || 'Active'}
                                            </div>
                                            {(item.remarks || (item.history && item.history.length > 0)) && (
                                                <div style={{
                                                    fontSize: '0.7rem',
                                                    color: '#475569',
                                                    lineHeight: '1.2',
                                                    background: '#f8fafc',
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    border: '1px solid #e2e8f0',
                                                    maxWidth: '200px'
                                                }} className="text-ellipsis" title={renderValue(item.remarks) || (item.history && item.history[0]?.note) || (item.history && item.history[0]?.result)}>
                                                    {renderValue(item.remarks) || (item.history && item.history[0]?.note) || (item.history && item.history[0]?.result) || ''}
                                                </div>
                                            )}
                                        </div>

                                        <div className="super-cell col-assignment" style={{ alignItems: 'flex-end', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'flex-end' }}>
                                                <div style={{ lineHeight: 1.2, textAlign: 'right' }}>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a' }}>
                                                        {getUserName(item.assignedTo || item.lastContactUser || item.createdBy)}
                                                    </div>
                                                    <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>
                                                        {getTeamName(item.team || item.assignment?.team)}
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', fontSize: '0.62rem', color: '#94a3b8', justifyContent: 'flex-end' }}>
                                                        <i className="far fa-clock" style={{ fontSize: '0.6rem' }}></i>
                                                        {item.createdAt ? new Date(item.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : (renderValue(item.lastContactDate) || '-')}
                                                    </div>
                                                </div>
                                                <div className="avatar-circle" style={{ width: '32px', height: '32px', fontSize: '0.8rem', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', flexShrink: 0 }}>
                                                    {getInitials(getUserName(item.assignedTo || item.lastContactUser || item.createdBy))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <div className="page-header">
                        <div className="page-title-group">
                            <i className="fas fa-bars" style={{ color: '#68737d' }}></i>
                            <div>
                                <span className="working-list-label">Global Inventory</span>
                                <h1>Properties Dashboard</h1>
                            </div>
                        </div>
                        <div className="header-actions" style={{ display: 'flex', gap: '12px' }}>
                            <div className="view-toggle-group">
                                <button
                                    className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                                    onClick={() => setViewMode('list')}
                                >
                                    <i className="fas fa-list"></i> List View
                                </button>
                                <button
                                    className={`view-toggle-btn ${viewMode === 'map' ? 'active' : ''}`}
                                    onClick={() => setViewMode('map')}
                                >
                                    <i className="fas fa-map-marked-alt"></i> Map View
                                </button>
                            </div>
                            <button className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-filter"></i> Filters
                            </button>

                        </div>
                    </div>
                    <div className="content-body" style={{ paddingTop: 0 }}>
                        <div style={{ height: 'calc(100vh - 250px)', position: 'relative', margin: '0', display: 'flex' }}>
                            {/* Left Sidebar with Properties List */}
                            <div style={{ width: '320px', background: '#fff', borderRight: '1px solid #e2e8f0', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ padding: '15px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
                                        <i className="fas fa-map-pin" style={{ color: '#ef4444', marginRight: '6px' }}></i>
                                        Properties by Location ({inventoryItems.length})
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Search properties by ID, area or owner..."
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '6px',
                                            fontSize: '0.8rem',
                                            outline: 'none'
                                        }}
                                    />
                                </div>
                                <div style={{ flex: 1, overflowY: 'auto' }}>
                                    {(inventoryItems || []).map((item, idx) => {
                                        if (!item) return null;
                                        return (
                                            <div
                                                key={idx}
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
                                                        background: renderValue(item.status) === 'Active' ? '#10b981' : '#ef4444',
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
                                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary-color)' }}>Unit #{renderValue(item.unitNo)}</div>
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#0f172a', fontWeight: 600, marginBottom: '4px' }}>
                                                    {renderValue(item.area)}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '4px' }}>
                                                    {renderValue(item.type)} - {renderValue(item.size)}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                                    <i className="fas fa-user" style={{ marginRight: '4px' }}></i>
                                                    {renderValue(item.ownerName)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Google Map with Pins */}
                            <div style={{ flex: 1, position: 'relative' }}>
                                <iframe
                                    width="100%"
                                    height="100%"
                                    style={{ border: 0 }}
                                    loading="lazy"
                                    allowFullScreen
                                    src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d109782.91037748405!2d76.69036504285265!3d30.698544258807534!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x390fed0be66c4021%3A0xa59fbc01d248358!2sMohali%2C%20Punjab!5e0!3m2!1sen!2sin!4v1705330000000!5m2!1sen!2sin"
                                ></iframe>

                                {/* Property Pin Markers Overlay */}
                                {(inventoryItems || []).map((item, idx) => {
                                    if (!item) return null;

                                    const coords = getCoordinates(item);
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
                                            title={`Unit ${renderValue(item.unitNo) || renderValue(item.unitNumber)} - ${renderValue(item.projectName)}`}
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
                                                        fill={renderValue(item.status) === 'Active' ? '#10b981' : '#ef4444'}
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
                            </div>
                        </div>
                    </div>

                </>
            )}

            <footer className="summary-footer" style={{ height: '55px', background: '#f8fafc' }}>
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                    <div className="summary-label" style={{ background: '#334155', color: '#fff', borderRadius: '8px', fontSize: '0.65rem', padding: '4px 12px', fontWeight: 800 }}>PROPERTY SYNC</div>
                    <div className="stat-pill"><span style={{ color: '#6366f1' }}>RES:</span> <span className="stat-val-bold">29,588</span></div>
                    <div className="stat-pill"><span style={{ color: 'var(--primary-color)' }}>COMM:</span> <span className="stat-val-bold">962</span></div>
                    <div className="stat-pill"><span style={{ color: '#f59e0b' }}>AGRI:</span> <span className="stat-val-bold">02</span></div>
                </div>
            </footer>

            <AddInventoryModal
                isOpen={isEditInventoryModalOpen}
                onClose={() => setIsEditInventoryModalOpen(false)}
                onSave={(data) => {
                    console.log("Updated Inventory:", data);
                    fetchInventory();
                }}
                property={selectedProperty}
            />

            {/* Upload Modal */}
            <UploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                onSave={(data) => console.log("Saved Uploads:", data)}
                project={selectedProperty}
                type="property"
            />

            {/* Document Modal */}
            <AddInventoryDocumentModal
                isOpen={isDocumentModalOpen}
                onClose={() => setIsDocumentModalOpen(false)}
                onSave={(data) => console.log("Saved Documents:", data)}
                project={selectedProperty}
            />



            <AddOwnerModal
                isOpen={isOwnerModalOpen}
                onClose={() => setIsOwnerModalOpen(false)}
                onSave={handleSaveOwners}
                currentOwners={currentOwners}
            />

            {/* Email Modal */}
            <ComposeEmailModal
                isOpen={isEmailModalOpen}
                onClose={() => setIsEmailModalOpen(false)}
                recipients={modalData}
            />

            {/* Message Modal */}
            <SendMessageModal
                isOpen={isMessageModalOpen}
                onClose={() => setIsMessageModalOpen(false)}
                selectedContacts={modalData}
            />

            {/* Tags Modal */}
            <ManageTagsModal
                isOpen={isTagsModalOpen}
                onClose={() => setIsTagsModalOpen(false)}
                selectedContacts={modalData}
                onUpdateTags={(tags) => console.log('Tags Updated:', tags)}
            />

            <InventoryFeedbackModal
                isOpen={isFeedbackModalOpen}
                onClose={() => setIsFeedbackModalOpen(false)}
                inventory={selectedProperty}
                onSave={handleSaveFeedback}
            />

            <AddDealModal
                isOpen={isAddDealModalOpen}
                onClose={() => {
                    setIsAddDealModalOpen(false);
                    setSelectedDealData(null);
                }}
                onSave={() => {
                    setIsAddDealModalOpen(false);
                    setSelectedDealData(null);
                    fetchInventory();
                }}
                deal={selectedDealData}
            />
        </section >
    );
}
