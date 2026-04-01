import React from 'react';
import { renderValue } from '../../../utils/renderUtils';

const InventoryDetailHeader = ({ 
    inventory, 
    onBack, 
    getLookupValue, 
    handleMessageClick, 
    handleEmailClick, 
    handleMoreMenuClick,
    showMoreMenu,
    handleCreateActivity,
    handleDocumentClick,
    handleUploadClick,
    handleFeedbackClick,
    handleTagsClick,
    handleWhatsAppShare,
    handleCopyDetails,
    isCopying,
    startCall,
    getTargetContacts
}) => {
    const activeStatusNames = ['Available', 'Active', 'Interested / Warm', 'Interested / Hot', 'Request Call Back', 'Busy / Driving', 'Market Feedback', 'General Inquiry', 'Blocked', 'Booked', 'Interested'];
    const rawStatus = getLookupValue('Status', inventory.status) || 'Available';
    const isActive = activeStatusNames.includes(rawStatus) || !rawStatus || rawStatus === '-';
    const statusLabel = isActive ? 'Active' : 'Inactive';
    const statusColor = isActive ? '#10b981' : (rawStatus === 'Sold Out' || rawStatus === 'Rented Out') ? '#f59e0b' : '#64748b';
    const bgColor = isActive ? '#ecfdf5' : (rawStatus === 'Sold Out' || rawStatus === 'Rented Out') ? '#fffbeb' : '#f1f5f9';

    return (
        <header className="detail-sticky-header" style={{
            position: 'sticky', top: 0, zIndex: 100,
            background: 'rgba(255, 255, 255, 0.75)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
            padding: '10px 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <button onClick={onBack} style={{
                    border: 'none', background: 'rgba(241, 245, 249, 0.8)', color: '#475569', 
                    width: '36px', height: '36px', borderRadius: '10px', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', 
                    cursor: 'pointer', transition: 'all 0.2s'
                }}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ 
                        width: '48px', height: '48px', background: 'linear-gradient(135deg, #0f172a, #334155)', 
                        borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: '1.2rem', fontWeight: 900, border: '3px solid #fff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}>
                        <i className="fas fa-building"></i>
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.5px' }}>
                                {renderValue(inventory.unitNo)}
                                <span style={{ fontSize: '1rem', color: '#64748b', fontWeight: 600, marginLeft: '6px' }}>
                                    ({renderValue(getLookupValue('UnitType', inventory.unitType))})
                                </span>
                            </h1>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{
                                    backgroundColor: bgColor,
                                    color: statusColor,
                                    padding: '2px 10px', borderRadius: '20px',
                                    fontSize: '0.65rem', fontWeight: 800,
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    textTransform: 'uppercase', letterSpacing: '0.03em',
                                    border: `1px solid ${statusColor}33`
                                }}>
                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusColor }}></span>
                                    {statusLabel}
                                </span>
                                {rawStatus !== statusLabel && rawStatus !== 'Available' && (
                                    <span style={{ 
                                        fontSize: '0.65rem', fontWeight: 800, color: '#475569', 
                                        background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px', 
                                        border: '1px solid #e2e8f0', textTransform: 'uppercase' 
                                    }}>
                                        {rawStatus}
                                    </span>
                                )}
                            </div>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, display: 'flex', gap: '12px', alignItems: 'center', marginTop: '2px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i className="fas fa-project-diagram" style={{ fontSize: '0.7rem' }}></i> {renderValue(inventory.projectName)}
                            </span>
                            <span style={{ color: '#cbd5e1' }}>|</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i className="fas fa-layer-group" style={{ fontSize: '0.7rem' }}></i> {renderValue(inventory.block)}
                            </span>
                        </p>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                        onClick={() => {
                            const targets = getTargetContacts();
                            if (targets.length > 0) {
                                startCall({
                                    name: targets[0].name || 'Unknown Owner',
                                    mobile: targets[0].mobile
                                }, {
                                    purpose: 'Owner Update',
                                    entityId: inventory._id,
                                    entityType: 'inventory'
                                });
                            }
                        }}
                        style={{ border: 'none', background: 'rgba(241, 245, 249, 0.8)', color: '#475569', padding: '8px 14px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <i className="fas fa-phone-alt" style={{ color: '#16a34a' }}></i> CALL
                    </button>
                    <button
                        onClick={handleMessageClick}
                        style={{ border: 'none', background: 'rgba(241, 245, 249, 0.8)', color: '#475569', padding: '8px 14px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <i className="fas fa-comment-alt" style={{ color: '#3b82f6' }}></i> SMS
                    </button>
                    <button
                        onClick={handleEmailClick}
                        style={{ border: 'none', background: 'rgba(241, 245, 249, 0.8)', color: '#475569', padding: '8px 14px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <i className="fas fa-envelope" style={{ color: '#8b5cf6' }}></i> EMAIL
                    </button>

                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={handleMoreMenuClick}
                            style={{ border: 'none', background: 'rgba(241, 245, 249, 0.8)', color: '#475569', width: '38px', height: '38px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                        >
                            <i className="fas fa-ellipsis-v"></i>
                        </button>

                        {showMoreMenu && (
                            <div style={{
                                position: 'absolute', top: '100%', right: 0, marginTop: '8px',
                                background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(15px)',
                                WebkitBackdropFilter: 'blur(15px)', border: '1px solid rgba(226, 232, 240, 0.8)',
                                borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                                zIndex: 1000, minWidth: '200px', padding: '8px 0', overflow: 'hidden'
                            }}>
                                <button onClick={handleFeedbackClick} style={menuItemStyle}><i className="fas fa-comment-dots" style={{ color: '#f59e0b', width: '16px' }}></i> Feedback</button>
                                <button onClick={handleTagsClick} style={menuItemStyle}><i className="fas fa-tags" style={{ color: '#8b5cf6', width: '16px' }}></i> Manage Tags</button>
                                <button onClick={handleDocumentClick} style={menuItemStyle}><i className="fas fa-file-alt" style={{ color: '#64748b', width: '16px' }}></i> Document</button>
                                <button onClick={handleUploadClick} style={menuItemStyle}><i className="fas fa-cloud-upload-alt" style={{ color: '#4f46e5', width: '16px' }}></i> Upload Media</button>
                                <div style={{ height: '1px', background: '#f1f5f9', margin: '4px 0' }}></div>
                                <button onClick={handleWhatsAppShare} style={menuItemStyle}><i className="fab fa-whatsapp" style={{ color: '#25D366', width: '16px' }}></i> WhatsApp Share</button>
                                <button onClick={handleCopyDetails} style={menuItemStyle}>
                                    <i className={isCopying ? "fas fa-check" : "fas fa-copy"} style={{ color: isCopying ? '#10b981' : '#64748b', width: '16px' }}></i> 
                                    {isCopying ? 'Copied' : 'Copy Details'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '4px 12px',
                    background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px',
                    marginLeft: '8px'
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>
                            {renderValue(inventory.assignedTo?.fullName) || renderValue(inventory.assignedTo?.name) || (typeof inventory.assignedTo === 'string' && !/^[0-9a-fA-F]{24}$/.test(inventory.assignedTo) ? renderValue(inventory.assignedTo) : 'Unassigned')}
                        </span>
                        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>
                            {renderValue(inventory.team?.name) || renderValue(inventory.team?.lookup_value) || (typeof inventory.team === 'string' && !/^[0-9a-fA-F]{24}$/.test(inventory.team) ? renderValue(inventory.team) : 'Standard Team')}
                        </span>
                    </div>
                    <div style={{ width: '1px', height: '18px', background: '#cbd5e1' }}></div>
                    <div title={`Visibility: ${inventory.visibleTo || 'Everyone'}`} style={{ display: 'flex', alignItems: 'center' }}>
                        {(() => {
                            const v = (inventory.visibleTo || 'Everyone').toLowerCase();
                            if (v === 'private') return <i className="fas fa-lock" style={{ color: '#ef4444', fontSize: '0.85rem' }}></i>;
                            if (v === 'team') return <i className="fas fa-users" style={{ color: '#3b82f6', fontSize: '0.85rem' }}></i>;
                            return <i className="fas fa-globe" style={{ color: '#10b981', fontSize: '0.85rem' }}></i>;
                        })()}
                    </div>
                </div>
            </div>
        </header>
    );
};

const menuItemStyle = {
    width: '100%', textAlign: 'left', padding: '10px 16px', background: 'transparent',
    border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#475569',
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px'
};

export default React.memo(InventoryDetailHeader);
