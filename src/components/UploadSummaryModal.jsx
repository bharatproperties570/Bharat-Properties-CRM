import React, { useState } from 'react';

const UploadSummaryModal = ({ isOpen, onClose, summaryData }) => {
    const [showDuplicates, setShowDuplicates] = useState(false);

    if (!isOpen || !summaryData) return null;

    const { stats, duplicatesList, totalUploaded, fileName } = summaryData;

    const getCategoryColor = (category) => {
        const colors = {
            new: '#10b981',
            repeat1x: '#f59e0b',
            repeat2x: '#f97316',
            repeat3x: '#ef4444',
            repeat3plus: '#991b1b'
        };
        return colors[category] || '#64748b';
    };

    const getCategoryLabel = (category) => {
        const labels = {
            new: 'New',
            repeat1x: 'Repeat 1x',
            repeat2x: 'Repeat 2x',
            repeat3x: 'Repeat 3x',
            repeat3plus: 'Repeat 3+'
        };
        return labels[category] || category;
    };

    const totalDuplicates = stats.repeat1x + stats.repeat2x + stats.repeat3x + stats.repeat3plus;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
            <div style={{ background: '#fff', width: '600px', maxHeight: '80vh', borderRadius: '12px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', overflow: 'auto' }}>
                {/* Header */}
                <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ marginTop: 0, fontSize: '1.3rem', fontWeight: 800, color: '#1e293b' }}>
                        <i className="fas fa-chart-pie" style={{ color: '#3b82f6', marginRight: '8px' }}></i>
                        Upload Summary
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '4px 0 0 0' }}>
                        <i className="fas fa-file" style={{ marginRight: '6px' }}></i>
                        {fileName}
                    </p>
                </div>

                {/* Stats Overview */}
                <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div style={{ textAlign: 'center', padding: '12px', background: '#fff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#3b82f6' }}>{totalUploaded}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Total Uploaded</div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '12px', background: '#fff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '2rem', fontWeight: 800, color: totalDuplicates > 0 ? '#ef4444' : '#10b981' }}>
                                {totalDuplicates}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Duplicates Found</div>
                        </div>
                    </div>
                </div>

                {/* Category Breakdown */}
                <div style={{ marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#475569', marginBottom: '12px' }}>
                        Category Breakdown
                    </h4>
                    {Object.entries(stats).filter(([key]) => key !== 'total').map(([category, count]) => {
                        const percentage = totalUploaded > 0 ? (count / totalUploaded * 100).toFixed(1) : 0;
                        const color = getCategoryColor(category);

                        return (
                            <div key={category} style={{ marginBottom: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: color }}></div>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>
                                            {getCategoryLabel(category)}
                                        </span>
                                    </div>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>
                                        {count} ({percentage}%)
                                    </span>
                                </div>
                                <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{ width: `${percentage}%`, height: '100%', background: color, transition: 'width 0.3s ease' }}></div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Duplicates List */}
                {totalDuplicates > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                        <button
                            onClick={() => setShowDuplicates(!showDuplicates)}
                            style={{
                                width: '100%',
                                padding: '12px',
                                background: '#fef3c7',
                                border: '1px solid #fbbf24',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                fontWeight: 600,
                                color: '#92400e'
                            }}
                        >
                            <span>
                                <i className="fas fa-exclamation-triangle" style={{ marginRight: '8px' }}></i>
                                View {totalDuplicates} Duplicate{totalDuplicates > 1 ? 's' : ''}
                            </span>
                            <i className={`fas fa-chevron-${showDuplicates ? 'up' : 'down'}`}></i>
                        </button>

                        {showDuplicates && (
                            <div style={{ marginTop: '12px', maxHeight: '200px', overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px' }}>
                                {duplicatesList.map((item, index) => {
                                    const details = item.duplicateInfo?.matchDetails || {};
                                    const displayText = [
                                        details.unitNumber ? `Unit: ${details.unitNumber}` : '',
                                        details.project ? `Project: ${details.project}` : '',
                                        details.location ? `Location: ${details.location}` : '',
                                        details.category || details.type ? `${details.category || ''} ${details.type || ''}`.trim() : ''
                                    ].filter(Boolean).join(' | ') || 'Property details not extracted';

                                    return (
                                        <div key={index} style={{ padding: '8px', background: '#f8fafc', borderRadius: '4px', marginBottom: '6px', fontSize: '0.8rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                <span style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.75rem' }}>
                                                    {displayText}
                                                </span>
                                                <span style={{
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 600,
                                                    background: getCategoryColor(item.category),
                                                    color: '#fff'
                                                }}>
                                                    {getCategoryLabel(item.category)}
                                                </span>
                                            </div>
                                            <div style={{ color: '#64748b', fontSize: '0.75rem' }}>
                                                {item.content.substring(0, 100)}...
                                            </div>
                                            {item.duplicateInfo.lastSeen && (
                                                <div style={{ color: '#94a3b8', fontSize: '0.7rem', marginTop: '4px' }}>
                                                    Last seen: {new Date(item.duplicateInfo.lastSeen).toLocaleDateString()}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Action Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e2e8f0' }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '10px 24px',
                            borderRadius: '6px',
                            border: 'none',
                            background: '#3b82f6',
                            color: '#fff',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '0.9rem'
                        }}
                    >
                        <i className="fas fa-check" style={{ marginRight: '6px' }}></i>
                        Got it
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UploadSummaryModal;
