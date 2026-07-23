import { useTheme } from '../../context/ThemeContext';

import React, { useState } from 'react';
import RevivalModal from '../RevivalModal';
import { api, activitiesAPI } from '../../utils/api';

const ContactDetailHeader = React.memo(function ContactDetailHeader({
    contact,
    recordType,
    onBack,
    getInitials,
    renderLookup,
    liveScoreData,
    aiStats,
    dealStatus,
    setDealStatus,
    showNotification,
    setIsCallModalOpen,
    setIsMessageModalOpen,
    setIsEmailModalOpen,
    showMoreMenu,
    setShowMoreMenu,
    enrichmentAPI,
    contactId,
    setIsTagsModalOpen,
    setIsAssignModalOpen,
    setIsActivityModalOpen,
    getLookupId
}) {
    const { isDark } = useTheme();
    const [isRevivalModalOpen, setIsRevivalModalOpen] = useState(false);
    const [isMarkLostModalOpen, setIsMarkLostModalOpen] = useState(false);
    const [lostReasonPreset, setLostReasonPreset] = useState('');
    const [lostReasonText, setLostReasonText] = useState('');
    const [isSavingLost, setIsSavingLost] = useState(false);

    const handleMarkLost = async () => {
        if (!lostReasonPreset && !lostReasonText) {
            showNotification('Please select or enter a reason for marking the lead as lost.');
            return;
        }
        setIsSavingLost(true);
        try {
            const lostStageId = getLookupId('Stage', 'Closed (Lost)');
            if (!lostStageId) {
                throw new Error('Lost Stage not found in configuration.');
            }
            
            // Update Lead Stage
            const payload = { stage: lostStageId };
            await api.put(`/leads/${contactId}`, payload);
            
            // Log Activity
            const finalReason = lostReasonPreset ? (lostReasonText ? `${lostReasonPreset} - ${lostReasonText}` : lostReasonPreset) : lostReasonText;
            await activitiesAPI.create({
                type: 'Status Change',
                subject: 'Lead Marked as Closed (Lost)',
                status: 'Completed',
                entityId: contactId,
                entityType: 'Lead',
                description: `Reason: ${finalReason}`,
                dueDate: new Date()
            });
            
            showNotification('Lead successfully marked as Closed (Lost).');
            setDealStatus('lost');
            setIsMarkLostModalOpen(false);
            
            // Refresh to show updated timeline and stage
            setTimeout(() => {
                window.location.reload();
            }, 1000);
            
        } catch (error) {
            console.error('Failed to mark lead as lost:', error);
            showNotification('An error occurred while marking the lead as lost.');
        } finally {
            setIsSavingLost(false);
        }
    };
    return (
        <header style={{
            background: 'var(--header-bg-translucent)',
            backdropFilter: 'var(--header-blur)',
            WebkitBackdropFilter: 'var(--header-blur)',
            borderBottom: '1px solid var(--border-color)',
            padding: '10px 2rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 100,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <button onClick={() => onBack(recordType)} style={{ border: 'none', background: 'var(--badge-prof-bg)', color: 'var(--badge-prof-color)', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div className="avatar-circle avatar-1" style={{ width: '48px', height: '48px', fontSize: '1.2rem', fontWeight: 800, border: '3px solid var(--bg-light)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                        {getInitials(contact.name)}
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: 'var(--contact-name-color)', letterSpacing: '-0.5px' }}>
                                {`${contact.title ? renderLookup(contact.title) + ' ' : ''}${contact.name ? contact.name : (contact.firstName || '') + ' ' + (contact.surname || contact.lastName || '')}`.trim()}
                            </h1>
                            {recordType === 'lead' && contact && (
                                <div
                                    className={`score-indicator ${(liveScoreData.score > 0 && liveScoreData.tempClass) ? liveScoreData.tempClass : (aiStats.leadScore.temp?.class || 'cold')}`}
                                    style={{
                                        width: '32px',
                                        height: '32px',
                                        fontSize: '0.8rem',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: '800',
                                        border: '2px solid var(--bg-light)',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                                        background: liveScoreData.score > 0 ? liveScoreData.color : (aiStats.leadScore.temp?.color || '#94a3b8'),
                                        color: '#fff'
                                    }}
                                    title={`Live Score: ${liveScoreData.score || aiStats.leadScore.total}`}
                                >
                                    {liveScoreData.score > 0 ? liveScoreData.score : aiStats.leadScore.total}
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: '4px' }}>
                                {recordType === 'lead' && (
                                    <span style={{
                                        background: 'var(--stat-property-bg)',
                                        color: 'var(--stat-property-color)',
                                        fontSize: '0.6rem',
                                        padding: '2px 8px',
                                        borderRadius: '6px',
                                        fontWeight: 800,
                                        border: '1px solid rgba(16, 185, 129, 0.2)'
                                    }}>
                                        LEAD
                                    </span>
                                )}
                                {contact.lead_classification && (
                                    <span style={{
                                        background: 'var(--stat-investor-bg)',
                                        color: 'var(--stat-investor-color)',
                                        fontSize: '0.6rem',
                                        padding: '2px 8px',
                                        borderRadius: '6px',
                                        fontWeight: 800,
                                        border: '1px solid rgba(239, 68, 68, 0.2)'
                                    }}>
                                        {contact.lead_classification.toUpperCase()}
                                    </span>
                                )}
                                <span style={{
                                    background: `${aiStats.persona.color}15`,
                                    color: aiStats.persona.color,
                                    fontSize: '0.6rem',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    border: `1px solid ${aiStats.persona.color}30`,
                                    fontWeight: 800,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    boxShadow: `0 0 10px ${aiStats.persona.color}10`
                                }}>
                                    <i className={`fas fa-${aiStats.persona.icon}`} style={{ fontSize: '0.6rem' }}></i> {aiStats.persona.label}
                                </span>
                                {contact.intent_tags && contact.intent_tags.map((tag, idx) => (
                                    <span key={idx} style={{
                                        background: 'var(--badge-prof-bg)',
                                        color: 'var(--badge-prof-color)',
                                        fontSize: '0.6rem',
                                        padding: '2px 8px',
                                        borderRadius: '6px',
                                        fontWeight: 700,
                                        border: '1px solid var(--border-color)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}>
                                        <i className="fas fa-tag" style={{ fontSize: '0.5rem', opacity: 0.5 }}></i> {tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><i className="fas fa-briefcase" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}></i> {renderLookup(contact.designation, 'Unknown Designation')}</span>
                            <span style={{ color: 'var(--border-color)' }}>|</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><i className="fas fa-building" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}></i> {contact.company || 'Unknown Company'}</span>
                            <span style={{ color: 'var(--border-color)' }}>|</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><i className="fas fa-bullhorn" style={{ fontSize: '0.75rem', color: 'var(--marketing-orange)' }}></i> {renderLookup(contact.source, 'Direct')}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="detail-header-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {recordType === 'lead' && dealStatus !== 'lost' && (
                    <button
                        onClick={() => setIsMarkLostModalOpen(true)}
                        style={{
                            background: dealStatus === 'active' ? 'var(--danger-bg)' : 'var(--stat-property-bg)',
                            color: dealStatus === 'active' ? 'var(--danger-color)' : 'var(--stat-property-color)',
                            border: `1px solid ${dealStatus === 'active' ? 'var(--danger-color)' : 'var(--stat-property-color)'}`,
                            padding: '6px 12px',
                            borderRadius: '8px',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <i className={`fas fa-${dealStatus === 'active' ? 'times-circle' : 'check-circle'}`}></i>
                        {dealStatus === 'active' ? 'Mark as Lost' : 'Mark as Active'}
                    </button>
                )}
                <button className="action-btn" title="Call" onClick={() => setIsCallModalOpen(true)}><i className="fas fa-phone-alt" style={{ color: '#16a34a' }}></i> Call</button>
                <button className="action-btn" title="Message" onClick={() => setIsMessageModalOpen(true)}><i className="fas fa-comment-alt" style={{ color: '#3b82f6' }}></i> Message</button>
                <button className="action-btn" title="Email" onClick={() => setIsEmailModalOpen(true)}><i className="fas fa-envelope" style={{ color: '#8b5cf6' }}></i> Email</button>

                {/* Lead Revival Button */}
                {recordType === 'lead' && (contact.stage?.lookup_value === 'Dormant' || contact.stage === 'Dormant') && (
                    <button
                        className="action-btn"
                        onClick={() => setIsRevivalModalOpen(true)}
                        style={{
                            background: 'linear-gradient(to right, #8b5cf6, #7c3aed)',
                            color: '#fff',
                            border: 'none',
                            boxShadow: '0 4px 6px -1px rgba(124, 58, 237, 0.3)'
                        }}
                    >
                        <i className="fas fa-sync-alt"></i> Revive Lead
                    </button>
                )}

                <div style={{ position: 'relative' }}>
                    <button className="action-btn" title="More" onClick={() => setShowMoreMenu(!showMoreMenu)}><i className="fas fa-ellipsis-v"></i></button>
                    {showMoreMenu && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            right: 0,
                            marginTop: '8px',
                            background: 'var(--header-bg-translucent)',
                            backdropFilter: 'var(--header-blur)',
                            WebkitBackdropFilter: 'var(--header-blur)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '12px',
                            boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                            zIndex: 1000,
                            minWidth: '180px',
                            padding: '10px 0',
                            overflow: 'hidden'
                        }}>
                            <button
                                style={{ width: '100%', textAlign: 'left', padding: '10px 20px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '10px' }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = 'var(--contact-row-hover)';
                                    e.currentTarget.style.color = 'var(--text-main)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = 'var(--text-muted)';
                                }}
                                onClick={async () => {
                                    setShowMoreMenu(false);
                                    try {
                                        const res = await enrichmentAPI.runLead(contactId);
                                        if (res.success) {
                                            showNotification('Intelligence Enrichment Complete!');
                                            window.location.reload();
                                        }
                                    } catch (e) {
                                        showNotification('Enrichment failed');
                                    }
                                }}
                            >
                                <i className="fas fa-magic" style={{ color: '#10b981', width: '16px' }}></i> Enrich Intelligence
                            </button>

                            <button
                                style={{ width: '100%', textAlign: 'left', padding: '10px 20px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '10px' }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = 'var(--contact-row-hover)';
                                    e.currentTarget.style.color = 'var(--text-main)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = 'var(--text-muted)';
                                }}
                                onClick={() => { setIsTagsModalOpen(true); setShowMoreMenu(false); }}
                            >
                                <i className="fas fa-tag" style={{ width: '16px' }}></i> Manage Tags
                            </button>

                            <button
                                style={{ width: '100%', textAlign: 'left', padding: '10px 20px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '10px' }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = 'var(--contact-row-hover)';
                                    e.currentTarget.style.color = 'var(--text-main)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = 'var(--text-muted)';
                                }}
                                onClick={() => { setIsAssignModalOpen(true); setShowMoreMenu(false); }}
                            >
                                <i className="fas fa-user-plus" style={{ width: '16px' }}></i> Assign Lead
                            </button>

                            <button
                                style={{ width: '100%', textAlign: 'left', padding: '10px 20px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '10px' }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = 'var(--contact-row-hover)';
                                    e.currentTarget.style.color = 'var(--text-main)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = 'var(--text-muted)';
                                }}
                                onClick={() => { setIsActivityModalOpen(true); setShowMoreMenu(false); }}
                            >
                                <i className="fas fa-calendar-plus" style={{ color: '#ec4899', width: '16px' }}></i> Create Activity
                            </button>

                            <div style={{ height: '1px', background: 'var(--border-color)', margin: '5px 0' }}></div>

                            <button 
                                style={{ width: '100%', textAlign: 'left', padding: '10px 20px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '10px' }} 
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = 'var(--contact-row-hover)';
                                    e.currentTarget.style.color = 'var(--text-main)';
                                }} 
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = 'var(--text-muted)';
                                }} 
                                onClick={() => { showNotification('Contact marked dormant.'); setShowMoreMenu(false); }}
                            >
                                <i className="fas fa-moon" style={{ width: '16px' }}></i> Mark Dormant
                            </button>

                            <button 
                                style={{ width: '100%', textAlign: 'left', padding: '10px 20px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: 'var(--danger-color)', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '10px' }} 
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = 'var(--danger-bg)';
                                    e.currentTarget.style.color = 'var(--danger-color)';
                                }} 
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = 'var(--danger-color)';
                                }} 
                                onClick={() => { showNotification('Exporting contact data...'); setShowMoreMenu(false); }}
                            >
                                <i className="fas fa-file-export" style={{ width: '16px' }}></i> Export Contact
                            </button>
                        </div>
                    )}
                </div>

                {/* Refined Assignment Plate */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '4px 12px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    marginLeft: '4px'
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                            {contact.assignment?.assignedTo?.fullName || contact.assignment?.assignedTo?.name || contact.owner?.fullName || contact.owner?.name || 'Unassigned'}
                        </span>
                        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {renderLookup(contact.assignment?.team?.[0] || contact.assignment?.team || contact.team) || 'Standard Team'}
                        </span>
                        { (contact.assignment?.assignedAt || contact.updatedAt) && (
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', marginTop: '2px' }}>
                                {new Date(contact.assignment?.assignedAt || contact.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })} {new Date(contact.assignment?.assignedAt || contact.updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                {contact.assignment?.assignedBy && ` by ${contact.assignment.assignedBy.fullName || contact.assignment.assignedBy.name || 'Admin'}`}
                            </span>
                        )}
                    </div>

                    <div style={{ width: '1px', height: '18px', background: 'var(--border-color)' }}></div>

                    <div title={`Visibility: ${contact.visibleTo || 'Everyone'}`} style={{ display: 'flex', alignItems: 'center' }}>
                        {(() => {
                            const v = (contact.visibleTo || 'Everyone').toLowerCase();
                            if (v === 'private') return <i className="fas fa-lock" style={{ color: 'var(--danger-color)', fontSize: '0.85rem' }}></i>;
                            if (v === 'team') return <i className="fas fa-users" style={{ color: '#3b82f6', fontSize: '0.85rem' }}></i>;
                            return <i className="fas fa-globe" style={{ color: '#10b981', fontSize: '0.85rem' }}></i>;
                        })()}
                    </div>
                </div>
            </div>

            <RevivalModal 
                isOpen={isRevivalModalOpen} 
                onClose={() => setIsRevivalModalOpen(false)} 
                lead={contact}
                onRevived={(newStage) => {
                    showNotification(`Lead successfully revived to ${newStage.toUpperCase()}`);
                    window.location.reload();
                }}
            />

            {/* Mark Lost Modal */}
            {isMarkLostModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0, 0, 0, 0.4)', zIndex: 10000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(4px)'
                }}>
                    <div style={{
                        background: 'var(--card-bg)', width: '450px', borderRadius: '16px',
                        padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                        border: '1px solid var(--border-color)', color: 'var(--text-main)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-times-circle" style={{ color: 'var(--danger-color)' }}></i> Mark as Lost
                            </h2>
                            <button onClick={() => setIsMarkLostModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                            Are you sure you want to mark this lead as Closed (Lost)? This action will update the lead's stage and log an activity in the timeline.
                        </p>
                        
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Primary Reason</label>
                            <select
                                value={lostReasonPreset}
                                onChange={(e) => setLostReasonPreset(e.target.value)}
                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-main)', fontSize: '0.95rem' }}
                            >
                                <option value="">Select a reason...</option>
                                <option value="Lost Interest">Lost Interest</option>
                                <option value="Bought Elsewhere">Bought Elsewhere</option>
                                <option value="High Price / Over Budget">High Price / Over Budget</option>
                                <option value="No Response">No Response</option>
                                <option value="Not Qualified">Not Qualified</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>

                        <div style={{ marginBottom: '24px' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Additional Notes (Optional)</label>
                            <textarea
                                value={lostReasonText}
                                onChange={(e) => setLostReasonText(e.target.value)}
                                placeholder="Enter any extra details about why this lead was lost..."
                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-main)', fontSize: '0.95rem', minHeight: '80px', resize: 'vertical' }}
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button onClick={() => setIsMarkLostModalOpen(false)} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-main)', cursor: 'pointer', fontWeight: 600 }}>
                                Cancel
                            </button>
                            <button onClick={handleMarkLost} disabled={isSavingLost} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'var(--danger-color)', color: '#fff', cursor: isSavingLost ? 'not-allowed' : 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {isSavingLost ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check"></i>}
                                Confirm & Mark Lost
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </header>
    );
});

ContactDetailHeader.displayName = 'ContactDetailHeader';

export default ContactDetailHeader;
