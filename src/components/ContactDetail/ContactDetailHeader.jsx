import React from 'react';

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
    setIsActivityModalOpen
}) {
    return (
        <header style={{
            background: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
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
                <button onClick={() => onBack(recordType)} style={{ border: 'none', background: 'rgba(241, 245, 249, 0.8)', color: '#475569', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div className="avatar-circle avatar-1" style={{ width: '48px', height: '48px', fontSize: '1.2rem', fontWeight: 800, border: '3px solid #fff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                        {getInitials(contact.name)}
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.5px' }}>
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
                                        border: '2px solid #fff',
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
                                        background: '#ecfdf5',
                                        color: '#059669',
                                        fontSize: '0.6rem',
                                        padding: '2px 8px',
                                        borderRadius: '6px',
                                        fontWeight: 800,
                                        border: '1px solid #d1fae5'
                                    }}>
                                        LEAD
                                    </span>
                                )}
                                {contact.lead_classification && (
                                    <span style={{
                                        background: '#fef3c7',
                                        color: '#92400e',
                                        fontSize: '0.6rem',
                                        padding: '2px 8px',
                                        borderRadius: '6px',
                                        fontWeight: 800,
                                        border: '1px solid #fcd34d'
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
                                        background: '#f1f5f9',
                                        color: '#475569',
                                        fontSize: '0.6rem',
                                        padding: '2px 8px',
                                        borderRadius: '6px',
                                        fontWeight: 700,
                                        border: '1px solid #e2e8f0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}>
                                        <i className="fas fa-tag" style={{ fontSize: '0.5rem', opacity: 0.5 }}></i> {tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><i className="fas fa-briefcase" style={{ fontSize: '0.75rem', color: '#475569' }}></i> {renderLookup(contact.designation, 'Unknown Designation')}</span>
                            <span style={{ color: '#cbd5e1' }}>|</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><i className="fas fa-building" style={{ fontSize: '0.75rem', color: '#475569' }}></i> {contact.company || 'Unknown Company'}</span>
                            <span style={{ color: '#cbd5e1' }}>|</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><i className="fas fa-bullhorn" style={{ fontSize: '0.75rem', color: '#f59e0b' }}></i> {renderLookup(contact.source, 'Direct')}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="detail-header-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {recordType === 'lead' && (
                    <button
                        onClick={() => {
                            const newStatus = dealStatus === 'active' ? 'lost' : 'active';
                            setDealStatus(newStatus);
                            showNotification(`Deal marked as ${newStatus.toUpperCase()}`);
                        }}
                        style={{
                            background: dealStatus === 'active' ? '#fee2e2' : '#f0fdf4',
                            color: dealStatus === 'active' ? '#ef4444' : '#16a34a',
                            border: `1px solid ${dealStatus === 'active' ? '#fecaca' : '#bbf7d0'}`,
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

                <div style={{ position: 'relative' }}>
                    <button className="action-btn" title="More" onClick={() => setShowMoreMenu(!showMoreMenu)}><i className="fas fa-ellipsis-v"></i></button>
                    {showMoreMenu && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            right: 0,
                            marginTop: '8px',
                            background: 'rgba(255, 255, 255, 0.9)',
                            backdropFilter: 'blur(15px)',
                            WebkitBackdropFilter: 'blur(15px)',
                            border: '1px solid rgba(226, 232, 240, 0.8)',
                            borderRadius: '12px',
                            boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                            zIndex: 1000,
                            minWidth: '180px',
                            padding: '10px 0',
                            overflow: 'hidden'
                        }}>
                            <button
                                style={{ width: '100%', textAlign: 'left', padding: '10px 20px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '10px' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(241, 245, 249, 0.8)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
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
                                style={{ width: '100%', textAlign: 'left', padding: '10px 20px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '10px' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(241, 245, 249, 0.8)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                onClick={() => { setIsTagsModalOpen(true); setShowMoreMenu(false); }}
                            >
                                <i className="fas fa-tag" style={{ width: '16px' }}></i> Manage Tags
                            </button>

                            <button
                                style={{ width: '100%', textAlign: 'left', padding: '10px 20px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '10px' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(241, 245, 249, 0.8)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                onClick={() => { setIsAssignModalOpen(true); setShowMoreMenu(false); }}
                            >
                                <i className="fas fa-user-plus" style={{ width: '16px' }}></i> Assign Lead
                            </button>

                            <button
                                style={{ width: '100%', textAlign: 'left', padding: '10px 20px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '10px' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(241, 245, 249, 0.8)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                onClick={() => { setIsActivityModalOpen(true); setShowMoreMenu(false); }}
                            >
                                <i className="fas fa-calendar-plus" style={{ color: '#ec4899', width: '16px' }}></i> Create Activity
                            </button>

                            <div style={{ height: '1px', background: '#f1f5f9', margin: '5px 0' }}></div>

                            <button style={{ width: '100%', textAlign: 'left', padding: '10px 20px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '10px' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(241, 245, 249, 0.8)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'} onClick={() => { showNotification('Contact marked dormant.'); setShowMoreMenu(false); }}>
                                <i className="fas fa-moon" style={{ width: '16px' }}></i> Mark Dormant
                            </button>

                            <button style={{ width: '100%', textAlign: 'left', padding: '10px 20px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#ef4444', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '10px' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(254, 242, 242, 1)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'} onClick={() => { showNotification('Exporting contact data...'); setShowMoreMenu(false); }}>
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
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    marginLeft: '4px'
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>
                            {contact.assignment?.assignedTo?.fullName || contact.assignment?.assignedTo?.name || contact.owner?.fullName || contact.owner?.name || 'Unassigned'}
                        </span>
                        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>
                            {renderLookup(contact.assignment?.team?.[0] || contact.assignment?.team || contact.team) || 'Standard Team'}
                        </span>
                    </div>

                    <div style={{ width: '1px', height: '18px', background: '#cbd5e1' }}></div>

                    <div title={`Visibility: ${contact.visibleTo || 'Everyone'}`} style={{ display: 'flex', alignItems: 'center' }}>
                        {(() => {
                            const v = (contact.visibleTo || 'Everyone').toLowerCase();
                            if (v === 'private') return <i className="fas fa-lock" style={{ color: '#ef4444', fontSize: '0.85rem' }}></i>;
                            if (v === 'team') return <i className="fas fa-users" style={{ color: '#3b82f6', fontSize: '0.85rem' }}></i>;
                            return <i className="fas fa-globe" style={{ color: '#10b981', fontSize: '0.85rem' }}></i>;
                        })()}
                    </div>
                </div>
            </div>
        </header>
    );
});

ContactDetailHeader.displayName = 'ContactDetailHeader';

export default ContactDetailHeader;
