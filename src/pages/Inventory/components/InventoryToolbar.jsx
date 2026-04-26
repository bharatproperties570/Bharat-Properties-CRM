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
    inventoryItems
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
                                onMouseEnter={(e) => { if (!(currentPage <= 1 || loading)) e.currentTarget.style.background = '#f1f5f9'; }}
                                onMouseLeave={(e) => { if (!(currentPage <= 1 || loading)) e.currentTarget.style.background = '#fff'; }}
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
                                onMouseEnter={(e) => { if (!(currentPage >= totalPages || loading)) e.currentTarget.style.background = '#f1f5f9'; }}
                                onMouseLeave={(e) => { if (!(currentPage >= totalPages || loading)) e.currentTarget.style.background = '#fff'; }}
                            >
                                Next <i className="fas fa-chevron-right" style={{ fontSize: '0.65rem' }}></i>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default React.memo(InventoryToolbar);
