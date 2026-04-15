import { useState } from 'react';
import { Calculator } from 'lucide-react';
import { renderValue } from '../../utils/renderUtils';
import { formatIndianCurrency } from '../../utils/numberToWords';

const DealDetailHeader = ({
    deal,
    onBack,
    liveScoreData,
    stageAlerts,
    isMarkingLost,
    setIsMarkingLost,
    handleTogglePublish,
    onAddActivity,
    getLookupValue,
    setIsCallModalOpen,
    setIsMessageOpen,
    setIsMailOpen,
    setIsTagsModalOpen,
    setIsBookingModalOpen,
    setIsUploadModalOpen,
    setIsDocumentModalOpen,
    setIsNoteModalOpen,
    setIsQuoteModalOpen,
    handleSocialClick,
    enrichDealIntelligence
}) => {
    const [showMoreMenu, setShowMoreMenu] = useState(false);



    return (
        <header style={{
            position: 'sticky', top: 0, zIndex: 1000,
            background: 'rgba(255, 255, 255, 0.85)', borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
            padding: '16px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            boxShadow: '0 4px 20px rgba(0,0,0,0.03)', backdropFilter: 'blur(20px)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
                <button onClick={onBack} style={{
                    background: '#fff', border: '1px solid #e2e8f0',
                    borderRadius: '14px', width: '44px', height: '44px',
                    cursor: 'pointer', color: '#475569', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }} className="hover:border-indigo-400 hover:text-indigo-600 hover:shadow-md">
                    <i className="fas fa-chevron-left" style={{ fontSize: '1.1rem' }}></i>
                </button>

                {/* Deal Score Indicator */}
                <div className={`score-indicator ${liveScoreData.score >= 80 ? 'super-hot' : liveScoreData.score >= 55 ? 'hot' : liveScoreData.score >= 30 ? 'warm' : 'cold'}`}
                    style={{
                        background: `linear-gradient(135deg, ${liveScoreData.color}, ${liveScoreData.color}dd)`,
                        width: '52px', height: '52px', borderRadius: '16px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.1rem', fontWeight: 900, color: '#fff',
                        boxShadow: `0 8px 16px ${liveScoreData.color}44`,
                        border: '2px solid #fff',
                        transform: 'rotate(-5deg)'
                    }}
                    title={`Live Deal Intelligence Score: ${liveScoreData.score}% (${liveScoreData.label})`}
                >
                    {liveScoreData.score || '0'}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                        <span style={{ 
                            fontSize: '0.65rem', 
                            fontWeight: 900, 
                            color: '#fff', 
                            background: liveScoreData.color,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            textTransform: 'uppercase', 
                            letterSpacing: '0.08em' 
                        }}>{liveScoreData.label}</span>
                        
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.03em', display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                            {renderValue(deal.unitNo)}
                            <span style={{ fontSize: '1rem', fontWeight: 600, color: '#64748b' }}>
                                {renderValue(deal.unitType) || 'Unit'}
                            </span>
                        </h1>

                        {/* Status elements and alerts */}
                        {stageAlerts.dealDeath?.stalled && (
                            <span style={{
                                backgroundColor: stageAlerts.dealDeath.severity === 'critical' ? '#fef2f2' : '#fffbeb',
                                color: stageAlerts.dealDeath.severity === 'critical' ? '#991b1b' : '#92400e',
                                padding: '4px 10px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 800,
                                display: 'flex', alignItems: 'center', gap: '5px',
                                border: `1px solid ${stageAlerts.dealDeath.severity === 'critical' ? '#fecaca' : '#fde68a'}`
                            }}>
                                <i className={`fas ${stageAlerts.dealDeath.severity === 'critical' ? 'fa-skull' : 'fa-pause-circle'}`} />
                                {stageAlerts.dealDeath.severity === 'critical' ? 'STALLED — DEAD DEAL' : 'STALLING'}
                            </span>
                        )}

                        {stageAlerts.leakage?.leakage && (
                            <span style={{
                                backgroundColor: stageAlerts.leakage.severity === 'critical' ? '#fef2f2' : '#fffbeb',
                                color: stageAlerts.leakage.severity === 'critical' ? '#991b1b' : '#92400e',
                                padding: '4px 10px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 800,
                                display: 'flex', alignItems: 'center', gap: '5px',
                                border: `1px solid ${stageAlerts.leakage.severity === 'critical' ? '#fecaca' : '#fde68a'}`
                            }}>
                                <i className="fas fa-exclamation-circle" />
                                COMMISSION RISK: {formatIndianCurrency((deal.price || 0) * 0.02)}
                            </span>
                        )}

                        {stageAlerts.health && (
                            <span
                                title={`Health Details — Score: ${stageAlerts.health.score}% | Activity Score: ${stageAlerts.health.activityScore}/25 | Owner: ${stageAlerts.health.ownerRisk.label} (${stageAlerts.health.ownerRisk.rate}%)`}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                                    background: stageAlerts.health.color + '18',
                                    color: stageAlerts.health.color,
                                    border: `1px solid ${stageAlerts.health.color}40`,
                                    borderRadius: '6px', padding: '4px 10px',
                                    fontSize: '0.65rem', fontWeight: 800, cursor: 'help'
                                }}
                            >
                                <i className={`fas ${stageAlerts.health.icon}`} style={{ fontSize: '0.6rem' }} />
                                {stageAlerts.health.label}
                            </span>
                        )}

                        {deal.negotiation_window && (
                            <span style={{
                                backgroundColor: '#fef3c7', color: '#92400e',
                                padding: '4px 12px', borderRadius: '6px',
                                fontSize: '0.7rem', fontWeight: 900,
                                display: 'flex', alignItems: 'center', gap: '6px',
                                textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid #fcd34d',
                                boxShadow: '0 2px 4px rgba(251, 191, 36, 0.2)'
                            }}>
                                <i className="fas fa-bolt" style={{ color: '#f59e0b' }}></i> High Margin
                            </span>
                        )}

                        <button
                            onClick={handleTogglePublish}
                            style={{
                                backgroundColor: deal.isPublished ? '#eff6ff' : '#f8fafc',
                                color: deal.isPublished ? '#2563eb' : '#64748b',
                                padding: '4px 12px', borderRadius: '6px',
                                fontSize: '0.7rem', fontWeight: 800,
                                display: 'flex', alignItems: 'center', gap: '6px',
                                textTransform: 'uppercase', letterSpacing: '0.05em',
                                border: `1px solid ${deal.isPublished ? '#3b82f644' : '#e2e8f0'}`,
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                            className="hover:shadow-sm"
                        >
                            <i className={`fas fa-globe ${deal.isPublished ? 'text-blue-500' : 'text-slate-400'}`}></i>
                            {deal.isPublished ? 'Published' : 'Draft'}
                        </button>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, margin: 0 }}>
                        {renderValue(deal.projectName)} • {renderValue(deal.block)}
                        <span className="mx-2 opacity-30">|</span>
                        <i className="fas fa-calendar-alt mr-1 opacity-50"></i> Created on {new Date(deal.createdAt || deal.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        <span className="mx-2 opacity-30">|</span>
                        Source: <span style={{ color: '#1e293b', fontWeight: 700 }}>{getLookupValue('Source', deal.source) || deal.source || 'Walk-in'}</span>
                    </p>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto', marginRight: '20px' }}>
                {deal.stage !== 'Closed Won' && deal.stage !== 'Closed Lost' && deal.stage !== 'Cancelled' && (
                    <button
                        onClick={() => setIsMarkingLost(!isMarkingLost)}
                        style={{
                            background: isMarkingLost ? '#ef4444' : '#fef2f2',
                            color: isMarkingLost ? '#fff' : '#ef4444',
                            border: `1px solid ${isMarkingLost ? '#ef4444' : '#fee2e2'}`,
                            padding: '8px 14px',
                            borderRadius: '10px',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: isMarkingLost ? '0 4px 12px rgba(239, 68, 68, 0.2)' : 'none'
                        }}
                        className="hover:scale-105 transition-all"
                    >
                        <i className={`fas ${isMarkingLost ? 'fa-times' : 'fa-handshake-slash'}`}></i>
                        {isMarkingLost ? 'Cancel Loss' : 'Mark as Lost'}
                    </button>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                        onClick={() => setIsCallModalOpen(true)}
                        style={{ border: 'none', background: 'rgba(241, 245, 249, 0.8)', color: '#475569', padding: '8px 14px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <i className="fas fa-phone-alt" style={{ color: '#16a34a' }}></i> CALL
                    </button>
                    <button
                        onClick={() => setIsMessageOpen(true)}
                        style={{ border: 'none', background: 'rgba(241, 245, 249, 0.8)', color: '#475569', padding: '8px 14px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <i className="fas fa-comment-alt" style={{ color: '#3b82f6' }}></i> SMS
                    </button>
                    <button
                        onClick={() => setIsMailOpen(true)}
                        style={{ border: 'none', background: 'rgba(241, 245, 249, 0.8)', color: '#475569', padding: '8px 14px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <i className="fas fa-envelope" style={{ color: '#8b5cf6' }}></i> EMAIL
                    </button>
                    <button
                        onClick={(e) => {
                            if (e && e.stopPropagation) e.stopPropagation();
                            handleSocialClick(e);
                        }}
                        style={{ 
                            border: 'none', 
                            background: 'rgba(241, 245, 249, 0.8)', 
                            color: '#475569', 
                            padding: '8px 14px', 
                            borderRadius: '10px', 
                            fontSize: '0.75rem', 
                            fontWeight: 800, 
                            cursor: 'pointer', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                        className="hover:bg-amber-50 hover:text-amber-700 hover:shadow-sm active:scale-95"
                    >
                        <i className="fas fa-share-alt" style={{ color: '#f59e0b' }}></i> SHARE
                    </button>
                </div>


                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setShowMoreMenu(!showMoreMenu)}
                        style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}
                        className="hover:bg-slate-50 transition-all"
                    >
                        <i className="fas fa-ellipsis-v"></i>
                    </button>

                    {showMoreMenu && (
                        <div style={{
                            position: 'absolute', top: '100%', right: 0, marginTop: '8px',
                            background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px',
                            boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 1000, minWidth: '200px',
                            padding: '8px 0', overflow: 'hidden'
                        }}>
                            <button
                                onClick={() => { setIsBookingModalOpen(true); setShowMoreMenu(false); }}
                                style={{ width: '100%', textAlign: 'left', padding: '10px 16px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                                className="hover:bg-slate-50"
                            >
                                <i className="fas fa-book-medical" style={{ color: '#10b981', width: '16px' }}></i> Create Booking
                            </button>
                            <button
                                onClick={() => { setIsTagsModalOpen(true); setShowMoreMenu(false); }}
                                style={{ width: '100%', textAlign: 'left', padding: '10px 16px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                                className="hover:bg-slate-50"
                            >
                                <i className="fas fa-tags" style={{ color: '#8b5cf6', width: '16px' }}></i> Manage Tags
                            </button>
                            <button
                                onClick={() => { setIsUploadModalOpen(true); setShowMoreMenu(false); }}
                                style={{ width: '100%', textAlign: 'left', padding: '10px 16px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                                className="hover:bg-slate-50"
                            >
                                <i className="fas fa-cloud-upload-alt" style={{ color: '#f59e0b', width: '16px' }}></i> Upload
                            </button>
                            <button
                                onClick={() => { setIsDocumentModalOpen(true); setShowMoreMenu(false); }}
                                style={{ width: '100%', textAlign: 'left', padding: '10px 16px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                                className="hover:bg-slate-50"
                            >
                                <i className="fas fa-file-alt" style={{ color: '#64748b', width: '16px' }}></i> Document
                            </button>
                            <div style={{ height: '1px', background: '#e2e8f0', margin: '4px 0' }}></div>
                            <button
                                onClick={() => {
                                    setShowMoreMenu(false);
                                    setIsQuoteModalOpen(true);
                                }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    width: '100%',
                                    padding: '10px 16px',
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#475569',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    textAlign: 'left'
                                }}
                                className="hover:bg-slate-50 transition-colors"
                            >
                                <Calculator size={14} className="text-blue-500" /> Quotation
                            </button>
                            <button
                                onClick={() => {
                                    setShowMoreMenu(false);
                                    enrichDealIntelligence();
                                }}
                                style={{ width: '100%', textAlign: 'left', padding: '10px 16px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 700, color: '#16a34a', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                                className="hover:bg-green-50"
                            >
                                <i className="fas fa-magic" style={{ width: '16px' }}></i> Enrichment Intelligence
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '4px 12px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>
                        {deal.assignedTo?.name || deal.partyStructure?.internalRM?.name || 'Unassigned'}
                    </span>
                    <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>
                        {deal.team?.name || getLookupValue('Team', deal.assignedTo?.team) || 'Standard Team'}
                    </span>
                </div>

                <div style={{ width: '1px', height: '18px', background: '#cbd5e1' }}></div>

                <div title={`Visibility: ${deal.visibleTo || 'Everyone'}`} style={{ display: 'flex', alignItems: 'center' }}>
                    {(() => {
                        const v = (deal.visibleTo || 'Everyone').toLowerCase();
                        if (v === 'private') return <i className="fas fa-lock" style={{ color: '#ef4444', fontSize: '0.85rem' }}></i>;
                        if (v === 'team') return <i className="fas fa-users" style={{ color: '#3b82f6', fontSize: '0.85rem' }}></i>;
                        return <i className="fas fa-globe" style={{ color: '#10b981', fontSize: '0.85rem' }}></i>;
                    })()}
                </div>
            </div>
        </header>
    );
};

export default DealDetailHeader;
