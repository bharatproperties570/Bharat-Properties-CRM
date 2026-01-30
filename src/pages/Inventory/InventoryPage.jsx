import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { inventoryData } from '../../data/mockData';
import UploadModal from '../../components/UploadModal';
import AddInventoryDocumentModal from '../../components/AddInventoryDocumentModal';
import AddInventoryModal from '../../components/AddInventoryModal';
import AddOwnerModal from '../../components/AddOwnerModal';
import SendMailModal from '../Contacts/components/SendMailModal';
import SendMessageModal from '../../components/SendMessageModal';
import ManageTagsModal from '../../components/ManageTagsModal';
import InventoryFeedbackModal from '../../components/InventoryFeedbackModal';

function InventoryPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'map'
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
    const [isEditInventoryModalOpen, setIsEditInventoryModalOpen] = useState(false);
    const [selectedProperty, setSelectedProperty] = useState(null);

    // Contextual Action States
    const [isOwnerModalOpen, setIsOwnerModalOpen] = useState(false);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
    const [isTagsModalOpen, setIsTagsModalOpen] = useState(false);
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);

    // Data placeholders for modals
    const [modalData, setModalData] = useState([]);
    const [currentOwners, setCurrentOwners] = useState([]);
    const [inventoryItems, setInventoryItems] = useState(inventoryData);

    const getSelectedProperty = () => inventoryItems.find(p => p.id === selectedIds[0]);

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
            if (property.ownerName) owners.push({ name: property.ownerName, mobile: property.ownerPhone, role: 'Property Owner' });
            if (property.associatedContact) owners.push({ name: property.associatedContact, mobile: property.associatedPhone, role: 'Associate', relationship: 'Broker' });

            setCurrentOwners(owners);
            setSelectedProperty(property);
            setIsOwnerModalOpen(true);
        }
    };

    const handleSaveOwners = (owners) => {
        if (!selectedProperty) return;

        const updatedItems = inventoryItems.map(item => {
            if (item.id === selectedProperty.id) {
                const updates = {
                    ownerName: '', ownerPhone: '',
                    associatedContact: '', associatedPhone: ''
                };

                const owner = owners.find(o => o.role === 'Property Owner');
                if (owner) {
                    updates.ownerName = owner.name;
                    updates.ownerPhone = owner.mobile;
                } else {
                    updates.ownerEmail = '';
                }

                const associate = owners.find(o => o.role === 'Associate');
                if (associate) {
                    updates.associatedContact = associate.name;
                    updates.associatedPhone = associate.mobile;
                } else {
                    updates.associatedEmail = '';
                }

                return { ...item, ...updates };
            }
            return item;
        });

        setInventoryItems(updatedItems);
        const newSelected = updatedItems.find(i => i.id === selectedProperty.id);
        setSelectedProperty(newSelected);
        toast.success('Owner details updated successfully');
    };

    const getTargetContacts = () => {
        // Collect owners/associates from selected properties
        const targets = [];
        selectedIds.forEach(id => {
            const prop = inventoryItems.find(p => p.id === id);
            if (prop) {
                if (prop.ownerName) targets.push({ name: prop.ownerName, mobile: prop.ownerPhone, email: prop.ownerEmail || 'owner@example.com' });
                if (prop.associatedContact) targets.push({ name: prop.associatedContact, mobile: prop.associatedPhone, email: prop.associatedEmail || 'associate@example.com' });
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

    const handleSaveFeedback = (data) => {
        if (!selectedProperty) return;

        const updatedItems = inventoryItems.map(item => {
            if (item.id === selectedProperty.id) {
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
                let newStatus = item.status;
                if (data.markAsSold && data.reason) {
                    if (data.reason.includes('Sold Out')) {
                        newStatus = 'Sold Out';
                    } else if (data.reason.includes('Rented Out')) {
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
                    note: newRemark
                };

                const currentHistory = item.history || [];
                // If no history exists but we have old data, maybe we should preserve it? 
                // For now, we just start appending new history.

                return {
                    ...item,
                    lastContactDate: dateStr,
                    lastContactTime: timeStr,
                    lastContactUser: 'You',
                    remarks: newRemark, // Keep showing latest remark in main view
                    status: newStatus,
                    history: [newInteraction, ...currentHistory] // Add new at top
                };
            }

            return item;
        });

        setInventoryItems(updatedItems);
        // Update selected property to reflect changes immediately
        const newSelected = updatedItems.find(i => i.id === selectedProperty.id);
        setSelectedProperty(newSelected);

        toast.success("Feedback recorded successfully");
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
            setSelectedIds(inventoryItems.map(item => item.id));
        } else {
            setSelectedIds([]);
        }
    };

    return (
        <section id="inventoryView" className="view-section active">
            {viewMode === 'list' ? (
                <div className="view-scroll-wrapper">
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

                    <div className="inventory-stats-row" style={{ padding: '12px 25px' }}>
                        <div className="status-card" style={{ padding: '8px 15px', maxWidth: '180px' }}>
                            <div className="stat-icon-dot dot-active"></div>
                            <div className="stat-card-info">
                                <h3 style={{ fontSize: '0.7rem' }}>Active</h3>
                                <div className="stat-count" style={{ fontSize: '1.2rem', color: '#388E3C' }}>1,441</div>
                            </div>
                        </div>
                        <div className="status-card" style={{ padding: '8px 15px', maxWidth: '180px' }}>
                            <div className="stat-icon-dot dot-inactive"></div>
                            <div className="stat-card-info">
                                <h3 style={{ fontSize: '0.7rem' }}>Inactive</h3>
                                <div className="stat-count" style={{ fontSize: '1.2rem', color: '#D32F2F' }}>29,218</div>
                            </div>
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
                                            <button className="action-btn" title="Create Deal" style={{ flexShrink: 0 }}><i className="fas fa-plus-circle"></i> Deal</button>
                                            <button className="action-btn" title="Match Lead" style={{ flexShrink: 0 }}><i className="fas fa-handshake"></i> Match</button>
                                            <button className="action-btn" title="Add Owner" style={{ flexShrink: 0 }} onClick={handleOwnerClick}><i className="fas fa-user-plus"></i> Owner</button>
                                            <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px', flexShrink: 0 }}></div>
                                            <button className="action-btn" title="Call Owner" style={{ flexShrink: 0 }}><i className="fas fa-phone-alt" style={{ transform: 'scaleX(-1) rotate(5deg)' }}></i> Call</button>
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
                                        <button className="action-btn danger" title="Delete"><i className="fas fa-trash-alt"></i></button>
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
                                            Total: <strong>{inventoryItems.length}</strong> Properties
                                        </div>
                                        <div className="pagination-nums" style={{ display: 'flex', gap: '4px' }}>
                                            <span className="page-num active">1</span>
                                            <span className="page-num">2</span>
                                            <span className="page-num"><i className="fas fa-chevron-right" style={{ fontSize: '0.6rem' }}></i></span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="list-header inventory-list-grid" style={{ position: 'sticky', top: '45px', zIndex: 99, padding: '12px 1.5rem', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <div><input type="checkbox" onChange={handleSelectAll} checked={selectedIds.length === inventoryItems.length && inventoryItems.length > 0} /></div>
                            <div>Property Details</div>
                            <div>Project & Location</div>
                            <div>Orientation</div>
                            <div>Owner Profile</div>
                            <div>Associate Contact</div>
                            <div>Status</div>
                            <div style={{ textAlign: 'right' }}>Last History</div>
                        </div>

                        <div className="list-content">
                            {inventoryItems.map((item) => (
                                <div key={item.id} className="list-item inventory-list-grid" style={{ padding: '10px 1.5rem', alignItems: 'flex-start' }}>
                                    <input
                                        type="checkbox"
                                        className="item-check"
                                        checked={selectedIds.includes(item.id)}
                                        onChange={() => toggleSelect(item.id)}
                                        style={{ marginTop: '8px' }}
                                    />

                                    <div className="super-cell">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                            <div
                                                className={`project-thumbnail ${item.status === 'Active' ? 'thumb-active' : 'thumb-inactive'}`}
                                                style={{
                                                    width: 'auto',
                                                    minWidth: '60px',
                                                    height: '28px',
                                                    borderRadius: '6px',
                                                    padding: '0 10px',
                                                    aspectRatio: 'auto'
                                                }}
                                            >
                                                {item.unitNo}
                                            </div>
                                            <div style={{ fontSize: '0.62rem', color: 'var(--primary-color)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.corner}</div>
                                        </div>
                                        <div style={{ paddingLeft: '2px' }}>
                                            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1e293b', lineHeight: 1.1 }}>{item.type}</div>
                                            <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600, marginTop: '2px' }}>{item.size}</div>
                                        </div>
                                    </div>

                                    <div className="super-cell">
                                        <div className="cell-value-main text-ellipsis" style={{ fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.2, color: '#0f172a' }}>{item.area}</div>
                                        <div className="cell-value-sub text-ellipsis" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>{item.location}</div>
                                        <div style={{ marginTop: '6px' }}>
                                            <span className="verified-badge text-ellipsis" style={{ fontSize: '0.58rem', padding: '2px 10px', background: '#f1f5f9', color: '#475569', fontWeight: 800, display: 'inline-block', maxWidth: '100%' }}>BLOCK: {item.location?.split(' ')[0] || 'N/A'}</span>
                                        </div>
                                    </div>

                                    <div className="super-cell">
                                        <div className="cell-label" style={{ marginTop: 0, color: '#94a3b8' }}>Facing & Directions</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                            {item.direction !== '-' && <div style={{ fontSize: '0.75rem', color: '#334155', fontWeight: 500 }}><i className="fas fa-compass" style={{ color: '#3b82f6', width: '14px' }}></i> {item.direction}</div>}
                                            {item.facing !== '-' && <div style={{ fontSize: '0.75rem', color: '#334155', fontWeight: 500 }}><i className="fas fa-map-signs" style={{ color: '#f59e0b', width: '14px' }}></i> {item.facing}</div>}
                                            {item.road !== '-' && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}><i className="fas fa-road" style={{ width: '14px' }}></i> {item.road}</div>}
                                        </div>
                                    </div>

                                    <div className="super-cell">
                                        {item.ownerName ? (
                                            <>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                                                    <div className="text-ellipsis" style={{
                                                        fontWeight: 800,
                                                        color: item.status === 'Sold Out' ? '#94a3b8' : 'var(--primary-color)',
                                                        fontSize: '0.85rem'
                                                    }}>{item.ownerName}</div>
                                                </div>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1e293b', marginBottom: '2px' }}>{item.ownerPhone}</div>
                                                <div className="address-clamp" style={{ fontSize: '0.68rem', lineHeight: '1.2' }} title={item.ownerAddress}>
                                                    {item.ownerAddress}
                                                </div>
                                            </>
                                        ) : <div style={{ color: '#cbd5e1', fontStyle: 'italic', fontSize: '0.75rem' }}>No owner data</div>}
                                    </div>

                                    <div className="super-cell">
                                        {item.associatedContact ? (
                                            <>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                                                    <div style={{ fontWeight: 800, color: '#6366f1', fontSize: '0.85rem' }}>{item.associatedContact}</div>
                                                </div>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1e293b', marginBottom: '2px' }}>{item.associatedPhone}</div>
                                                <div className="address-clamp" style={{ fontSize: '0.68rem', lineHeight: '1.2', color: '#94a3b8' }}>
                                                    Verified Associate Representative for Project {item.area}
                                                </div>
                                            </>
                                        ) : <div style={{ color: '#cbd5e1', fontStyle: 'italic', fontSize: '0.75rem' }}>No associate</div>}
                                    </div>

                                    <div className="super-cell">
                                        <div style={{ marginBottom: '6px' }}>
                                            <span style={{ fontSize: '0.65rem', background: item.status === 'Active' ? 'rgba(56, 142, 60, 0.1)' : 'rgba(211, 47, 47, 0.1)', color: item.status === 'Active' ? '#388E3C' : '#D32F2F', padding: '2px 8px', borderRadius: '4px', fontWeight: 800 }}>{item.status.toUpperCase()}</span>
                                        </div>
                                        {item.remarks && (
                                            <div style={{ background: '#fffbeb', padding: '4px 8px', borderRadius: '6px', border: '1px solid #fde68a', maxWidth: '100px' }}>
                                                <div style={{ fontSize: '0.65rem', color: '#92400e', lineHeight: '1.2' }}>{item.remarks}</div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="super-cell" style={{ alignItems: 'flex-end', textAlign: 'right' }}>
                                        {item.lastContactDate !== '-' ? (
                                            <>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', justifyContent: 'flex-end' }}>
                                                    <div style={{ fontWeight: 800, fontSize: '0.8rem', color: '#334155' }}>{item.lastContactUser || 'System'}</div>
                                                    <div className="avatar-circle" style={{ width: '24px', height: '24px', fontSize: '0.65rem', background: '#f1f5f9', color: '#64748b' }}>
                                                        {item.lastContactUser?.charAt(0) || 'S'}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--primary-color)', fontWeight: 800 }}>
                                                        {item.lastContactDate} <i className="fas fa-calendar-alt" style={{ marginLeft: '6px' }}></i>
                                                    </div>
                                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, marginLeft: '2px' }}>
                                                        {item.lastContactTime} <i className="fas fa-clock" style={{ marginLeft: '6px', fontSize: '0.6rem' }}></i>
                                                    </div>
                                                </div>
                                            </>
                                        ) : <div style={{ color: '#cbd5e1', fontStyle: 'italic', fontSize: '0.75rem' }}>No record</div>}
                                    </div>
                                </div>
                            ))}
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
                            <i className="fas fa-sliders-h header-icon"></i>
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
                                    {inventoryItems.map((item, idx) => (
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
                                                    background: item.status === 'Active' ? '#10b981' : '#ef4444',
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
                                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary-color)' }}>Unit #{item.unitNo}</div>
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#0f172a', fontWeight: 600, marginBottom: '4px' }}>
                                                {item.area}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '4px' }}>
                                                {item.type} - {item.size}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                                <i className="fas fa-user" style={{ marginRight: '4px' }}></i>
                                                {item.ownerName}
                                            </div>
                                        </div>
                                    ))}
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
                                {inventoryItems.map((item, idx) => {
                                    // Convert lat/lng to approximate pixel position
                                    const centerLat = 30.6985;
                                    const centerLng = 76.7112;
                                    const latDiff = (item.lat - centerLat) * 5000;
                                    const lngDiff = (item.lng - centerLng) * 5000;

                                    return (
                                        <div
                                            key={idx}
                                            style={{
                                                position: 'absolute',
                                                left: `calc(50% + ${lngDiff}px)`,
                                                top: `calc(50% - ${latDiff}px)`,
                                                transform: 'translate(-50%, -100%)',
                                                cursor: 'pointer',
                                                zIndex: 10,
                                                transition: 'all 0.2s'
                                            }}
                                            title={`Unit ${item.unitNo} - ${item.area}`}
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
                                                        fill={item.status === 'Active' ? '#10b981' : '#ef4444'}
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
                onSave={(data) => console.log("Updated Inventory:", data)}
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
            <SendMailModal
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
        </section>
    );
}

export default InventoryPage;
