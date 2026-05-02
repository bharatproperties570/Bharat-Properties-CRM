import React from 'react';
import { renderValue } from '../../../utils/renderUtils';
import usePermissions, { PermissionGate } from '../../../hooks/usePermissions';

const InventoryToolbar = ({
    selectedIds,
    searchTerm,
    setSearchTerm,
    totalRecords,
    recordsPerPage,
    setRecordsPerPage,
    currentPage,
    totalPages,
    goToPreviousPage,
    goToNextPage,
    loading,
    handleEditClick,
    onAddActivity,
    handleCreateDeal,
    handleMatchClick,
    handleOwnerClick,
    handleMessageClick,
    handleEmailClick,
    handleTagClick,
    handleUploadClick,
    handleDocumentClick,
    handleFeedbackClick,
    handleDelete,
    inventoryItems,
    sortConfig,
    setSortConfig,
    isSortOpen,
    setIsSortOpen,
    filters,
    setIsFilterPanelOpen
}) => {
    const getSelectedProperty = () => inventoryItems.find(p => p._id === selectedIds[0]);

    return (
        <div className="toolbar-container" style={{ position: 'sticky', top: 0, zIndex: 1000, padding: '5px 2rem', borderBottom: '1px solid #eef2f5', minHeight: '45px', display: 'flex', alignItems: 'center', background: '#fff' }}>
            {selectedIds.length > 0 ? (
                <div className="action-panel" style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', overflowX: 'auto', paddingTop: '4px', paddingBottom: '2px' }}>
                    <div className="selection-count" style={{ marginRight: '10px', fontWeight: 600, color: 'var(--primary-color)', whiteSpace: 'nowrap' }}>
                        {selectedIds.length} Selected
                    </div>

                    {selectedIds.length === 1 && (
                        <>
                            <PermissionGate module="inventory" action="edit">
                                <button className="action-btn" title="Edit Property" onClick={handleEditClick}><i className="fas fa-edit"></i> Edit</button>
                            </PermissionGate>
                            <button className="action-btn" title="Add Activity" onClick={() => {
                                const p = getSelectedProperty();
                                if (p) {
                                    const relatedTo = [{ type: 'Inventory', id: p._id, name: p.unitNo, model: 'Inventory' }];
                                    
                                    // Add Owner if exists
                                    if (p.owners && p.owners[0]) {
                                        const owner = p.owners[0];
                                        relatedTo.push({ 
                                            type: 'Contact', 
                                            id: owner._id || owner.id, 
                                            name: owner.name, 
                                            model: 'Contact' 
                                        });
                                    }
                                    
                                    // Add Associate if exists
                                    if (p.associate) {
                                        relatedTo.push({ 
                                            type: 'Contact', 
                                            id: p.associate._id || p.associate.id, 
                                            name: p.associate.name, 
                                            model: 'Contact' 
                                        });
                                    }

                                    onAddActivity(relatedTo, { inventory: p });
                                }
                            }}><i className="fas fa-calendar-plus"></i> Activity</button>
                            <button className="action-btn" title="Create Deal" onClick={handleCreateDeal}><i className="fas fa-plus-circle"></i> Deal</button>
                            <button className="action-btn" title="Match Lead" onClick={handleMatchClick}><i className="fas fa-handshake"></i> Match</button>
                            <button className="action-btn" title="Add Owner" onClick={handleOwnerClick}><i className="fas fa-user-plus"></i> Owner</button>
                            <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px', flexShrink: 0 }}></div>
                            <button className="action-btn" title="Message Owner" onClick={handleMessageClick}><i className="fas fa-comment-alt"></i> Message</button>
                            <button className="action-btn" title="Email Owner" onClick={handleEmailClick}><i className="fas fa-envelope"></i> Email</button>
                            <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px', flexShrink: 0 }}></div>
                            <button className="action-btn" title="Upload Files" onClick={handleUploadClick}><i className="fas fa-cloud-upload-alt"></i> Upload</button>
                            <button className="action-btn" title="Manage Documents" onClick={handleDocumentClick}><i className="fas fa-file-alt"></i> Document</button>
                            <button className="action-btn" title="Feedback" onClick={handleFeedbackClick}><i className="fas fa-comment-dots"></i> Feedback</button>
                        </>
                    )}

                    <button className="action-btn" title="Add Tag" onClick={handleTagClick}><i className="fas fa-tag"></i> Tag</button>
                    <div style={{ marginLeft: 'auto' }}>
                        <PermissionGate module="inventory" action="delete">
                            <button className="action-btn danger" title="Delete" onClick={handleDelete}><i className="fas fa-trash-alt"></i></button>
                        </PermissionGate>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        {/* Premium Search Input */}
                        <div style={{ position: 'relative', width: '350px' }}>
                            <input
                                type="text"
                                className="search-input-premium"
                                placeholder="Search by ID, Project or Owner..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <i className={`fas fa-search search-icon-premium ${searchTerm ? 'active' : ''}`}></i>
                        </div>

                        {/* Professional Sort Icon (Moved next to search) */}
                        <div style={{ position: 'relative' }}>
                            <button 
                                className="btn-pagination-icon" 
                                style={{ 
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                    width: '32px', height: '32px', borderRadius: '8px',
                                    border: '1px solid #e2e8f0',
                                    background: isSortOpen ? 'var(--primary-color)' : '#fff',
                                    color: isSortOpen ? '#fff' : '#64748b',
                                    cursor: 'pointer', transition: 'all 0.2s'
                                }}
                                onClick={() => setIsSortOpen(!isSortOpen)}
                                title={`Sort: ${sortConfig.label}`}
                            >
                                <i className="fas fa-sort-amount-down-alt"></i>
                            </button>
                            {isSortOpen && (
                                <React.Fragment>
                                    <div 
                                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }} 
                                        onClick={() => setIsSortOpen(false)} 
                                    />
                                    <ul className="shadow-lg border-0" style={{ 
                                        position: 'absolute', top: '100%', left: 0, zIndex: 999,
                                        backgroundColor: '#fff', borderRadius: '16px', padding: '10px', 
                                        minWidth: '220px', marginTop: '8px', listStyle: 'none',
                                        border: '1px solid #eef2f5'
                                    }}>
                                        <li><h6 style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', padding: '10px 15px', margin: 0 }}>Advanced Sort</h6></li>
                                        {[
                                            { label: 'Unit Sequence', by: 'unitNo', order: 1, icon: 'fa-sort-numeric-down' },
                                            { label: 'Sector/Locality', by: 'address.locality', order: 1, icon: 'fa-map-marker-alt' },
                                            { label: 'Recently Updated', by: 'updatedAt', order: -1, icon: 'fa-bolt' },
                                            { label: 'Price (Low to High)', by: 'pricing.expectedPrice', order: 1, icon: 'fa-sort-amount-down' },
                                            { label: 'Price (High to Low)', by: 'pricing.expectedPrice', order: -1, icon: 'fa-sort-amount-up' },
                                            { label: 'Size (Smallest)', by: 'area.size', order: 1, icon: 'fa-compress-arrows-alt' },
                                        ].map((opt) => (
                                            <li key={opt.label}>
                                                <button 
                                                    className={`d-flex align-items-center gap-3`} 
                                                    style={{ 
                                                        width: '100%', border: 'none', textAlign: 'left',
                                                        borderRadius: '10px', 
                                                        padding: '10px 15px', 
                                                        fontSize: '0.85rem',
                                                        fontWeight: sortConfig.label === opt.label ? 700 : 500,
                                                        color: sortConfig.label === opt.label ? '#fff' : '#1e293b',
                                                        background: sortConfig.label === opt.label ? 'var(--primary-color)' : 'transparent',
                                                        cursor: 'pointer',
                                                        marginBottom: '2px',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onClick={() => {
                                                        setSortConfig(opt);
                                                        setIsSortOpen(false);
                                                    }}
                                                >
                                                    <i className={`fas ${opt.icon}`} style={{ width: '18px', opacity: sortConfig.label === opt.label ? 1 : 0.6 }}></i>
                                                    {opt.label}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </React.Fragment>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <div style={{ fontSize: '0.8rem', color: '#68737d', fontWeight: 600 }}>
                            Total: <strong style={{ color: '#0f172a' }}>{renderValue(totalRecords)} Properties</strong>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>
                            <span>Show:</span>
                            <select value={recordsPerPage} onChange={(e) => setRecordsPerPage(Number(e.target.value))} style={{ padding: "4px 12px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 700, color: "#0f172a", outline: "none", cursor: "pointer", background: "#f8fafc" }}>
                                {[10, 25, 50, 100, 300, 500, 750, 1000].map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0" }}>
                                <button 
                                    onClick={goToPreviousPage} 
                                    disabled={currentPage <= 1 || loading} 
                                    className="pagination-btn"
                                    style={{ 
                                        display: 'flex', alignItems: 'center', gap: '6px', 
                                        padding: '6px 12px', border: '1px solid #e2e8f0', borderRight: 'none', 
                                        borderRadius: '6px 0 0 6px', 
                                        background: (currentPage <= 1 || loading) ? '#f8fafc' : '#fff', 
                                        fontSize: '0.75rem', fontWeight: 700, 
                                        color: (currentPage <= 1 || loading) ? '#cbd5e1' : '#64748b', 
                                        cursor: (currentPage <= 1 || loading) ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    <i className="fas fa-chevron-left" style={{ fontSize: '0.65rem' }}></i> Prev
                                </button>
                                <div style={{ padding: '6px 15px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', minWidth: '55px', textAlign: 'center' }}>
                                    {renderValue(currentPage)} / {renderValue(totalPages) || 1}
                                </div>
                                <button 
                                    onClick={goToNextPage} 
                                    disabled={currentPage >= totalPages || loading} 
                                    className="pagination-btn"
                                    style={{ 
                                        display: 'flex', alignItems: 'center', gap: '6px', 
                                        padding: '6px 12px', border: '1px solid #e2e8f0', borderLeft: 'none', 
                                        borderRadius: '0 6px 6px 0', 
                                        background: (currentPage >= totalPages || loading) ? '#f8fafc' : '#fff', 
                                        fontSize: '0.75rem', fontWeight: 700, 
                                        color: (currentPage >= totalPages || loading) ? '#cbd5e1' : '#64748b', 
                                        cursor: (currentPage >= totalPages || loading) ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    Next <i className="fas fa-chevron-right" style={{ fontSize: '0.65rem' }}></i>
                                </button>
                            </div>

                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default React.memo(InventoryToolbar);
