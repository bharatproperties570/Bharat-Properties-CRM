import React, { useState } from 'react';

function ActivitiesView() {
    const [activeTab, setActiveTab] = useState('Today');
    const [activeFilter, setActiveFilter] = useState('All');
    const [selectedIds, setSelectedIds] = useState([]);

    // Sample activities data based on reference images
    const activitiesData = [
        {
            id: 'C1',
            type: 'Meeting',
            contactName: 'Mr. Pale Ram',
            contactPhone: '9988675732',
            contactEmail: '',
            scheduledDate: '2025-12-10T17:18',
            agenda: 'MEETING with Mr. Pale Ram undefined For Requirement Meeting of at Office @ 2025-12-10T17:18.',
            activityType: 'Meeting',
            scheduledBy: 'Suresh',
            scheduledFor: 'Prospect',
            stage: 'Prospect',
            status: 'complete',
            feedback: ''
        },
        {
            id: 'C2',
            type: 'Call',
            contactName: 'Mr. Rajesh kumar Singhal',
            contactPhone: '7988275300/9410535300',
            contactEmail: '5481050305448/5@gmail.com',
            scheduledDate: '2025-12-14T12:31',
            agenda: 'Call Mr. Rajesh kumar Singhal undefined for Site Visit @ 2025-12-14T12:31.',
            activityType: 'Call',
            scheduledBy: 'Suresh',
            scheduledFor: '',
            stage: '',
            status: 'complete',
            feedback: ''
        },
        {
            id: 'C3',
            type: 'Call',
            contactName: 'Mr. Pale Ram',
            contactPhone: '9988675732',
            contactEmail: '',
            scheduledDate: '2025-12-10T17:19',
            agenda: 'Call Mr. Pale Ram undefined for Inventory Availability @ 2025-12-10T17:19.',
            activityType: 'Call',
            scheduledBy: 'Suresh',
            scheduledFor: 'Prospect',
            stage: '',
            status: 'overdue',
            feedback: ''
        },
        {
            id: '1',
            type: 'Site Visit',
            contactName: 'Mr. Rajesh kumar Singhal',
            contactPhone: '7988275300/9410535300',
            contactEmail: '5481050305448/5@gmail.com',
            lead: 'Sector 4 Kurukshetra',
            project: 'Sector 4 Kurukshetra',
            date: '2025-10-07T11:13',
            scheduled: 'Suresh',
            refreshed: '',
            agenda: 'Site Visit with Mr. Rajesh kumar Singhal undefined For 1550-Second Block-Sector 4-Kurukshetra @ 2025-10-07T11:13',
            source: '',
            feedback: 'postponed for low budget',
            stage: '',
            status: 'complete'
        },
        {
            id: '2',
            type: 'Site Visit',
            contactName: 'Mr. Karan Singh Arni',
            contactPhone: '9457200442/9',
            contactEmail: '',
            lead: 'Sector 3 Kurukshetra',
            project: 'Sector 4 Kurukshetra',
            date: '2025-11-26T11:03',
            scheduled: 'Suresh',
            refreshed: '',
            agenda: 'Site Visit with Mr. Karan Singh Arni undefined For 1550-Second Block-Sector 4 Kurukshetra @ 2025-11-26T11:03',
            source: '',
            feedback: 'interested in 800 and want 800, 850 1832, 1835 in sec 0',
            stage: '',
            status: 'complete'
        },
        {
            id: '3',
            type: 'Site Visit',
            contactName: 'Mrs. Sapna JASSI',
            contactPhone: '9992461080',
            contactEmail: '',
            lead: 'Sector 3 Kurukshetra',
            project: '',
            date: '2025-10-24T12:05',
            scheduled: 'Vivek',
            refreshed: '',
            agenda: 'Site Visit with Mrs. Sapna JASSI undefined For @ 2025-10-24T12:05',
            source: '',
            feedback: 'Visit done sector 3 booth interested in 25 (10,17).',
            stage: '',
            status: 'complete'
        },
        {
            id: '5',
            type: 'Site Visit',
            contactName: 'Mr. Satish Kumar',
            contactPhone: '9830645455',
            contactEmail: '',
            lead: 'Sector 4 Kurukshetra',
            project: 'Sector 8 Kurukshetra Sector 3 Kurukshetra',
            date: '2025-10-30T09:00',
            scheduled: 'Vivek',
            refreshed: '',
            agenda: 'Site Visit with Mr. Satish Kumar undefined For @ 2025-10-30T09:00',
            source: '',
            feedback: 'Come for visit 6m south in sector 4,8,3 budget 1,30cr Call for confirm.',
            stage: '',
            status: 'overdue'
        }
    ];

    const toggleSelect = (id) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        setSelectedIds(prev =>
            prev.length === filteredActivities.length ? [] : filteredActivities.map(a => a.id)
        );
    };

    // Filter activities based on activeFilter
    const filteredActivities = activeFilter === 'All'
        ? activitiesData
        : activitiesData.filter(a => a.type === activeFilter);

    return (
        <section className="main-content">
            <div className="page-container">
                {/* Page Header */}
                <div className="page-header" style={{ position: 'sticky', top: 0, zIndex: 100, background: '#fff', borderBottom: '1px solid #eef2f5', padding: '20px 2rem' }}>
                    <div className="page-title-group">
                        <i className="fas fa-tasks" style={{ color: '#68737d' }}></i>
                        <div>
                            <span className="working-list-label">Task Management</span>
                            <h1>Activities</h1>
                        </div>
                    </div>
                    <div className="header-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-plus"></i> Play Task
                        </button>
                        <button className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-filter"></i> Filter
                        </button>
                    </div>
                </div>

                {/* Filter Tabs */}
                <div style={{ padding: '15px 2rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                        <button
                            style={{
                                padding: '6px 16px',
                                borderRadius: '6px',
                                border: activeFilter === 'All' ? 'none' : '1px solid #e2e8f0',
                                background: activeFilter === 'All' ? '#10b981' : '#fff',
                                color: activeFilter === 'All' ? '#fff' : '#64748b',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                            onClick={() => setActiveFilter('All')}
                        >
                            All
                        </button>
                        <button
                            style={{
                                padding: '6px 16px',
                                borderRadius: '6px',
                                border: activeFilter === 'Follow Up' ? 'none' : '1px solid #e2e8f0',
                                background: activeFilter === 'Follow Up' ? '#10b981' : '#fff',
                                color: activeFilter === 'Follow Up' ? '#fff' : '#64748b',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                            onClick={() => setActiveFilter('Follow Up')}
                        >
                            Follow Up
                        </button>
                        <button
                            style={{
                                padding: '6px 16px',
                                borderRadius: '6px',
                                border: activeFilter === 'Site Visit' ? 'none' : '1px solid #e2e8f0',
                                background: activeFilter === 'Site Visit' ? '#10b981' : '#fff',
                                color: activeFilter === 'Site Visit' ? '#fff' : '#64748b',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                            onClick={() => setActiveFilter('Site Visit')}
                        >
                            Site Visit
                        </button>
                        <button
                            style={{
                                padding: '6px 16px',
                                borderRadius: '6px',
                                border: activeFilter === 'Meeting' ? 'none' : '1px solid #e2e8f0',
                                background: activeFilter === 'Meeting' ? '#10b981' : '#fff',
                                color: activeFilter === 'Meeting' ? '#fff' : '#64748b',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                            onClick={() => setActiveFilter('Meeting')}
                        >
                            Meeting
                        </button>
                    </div>

                    {/* Status Tabs */}
                    <div style={{ display: 'flex', gap: '20px', borderBottom: '2px solid #e2e8f0' }}>
                        {['Today', 'Upcoming', 'Overdue', 'Completed', 'Custom'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                style={{
                                    padding: '10px 0',
                                    border: 'none',
                                    background: 'none',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    color: activeTab === tab ? '#10b981' : '#64748b',
                                    borderBottom: activeTab === tab ? '2px solid #10b981' : '2px solid transparent',
                                    cursor: 'pointer',
                                    marginBottom: '-2px'
                                }}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="content-body" style={{ overflowY: 'visible', paddingTop: 0 }}>
                    {/* Action Bar / Toolbar */}
                    <div className="toolbar-container" style={{ position: 'sticky', top: 0, zIndex: 1000, padding: '5px 2rem', borderBottom: '1px solid #eef2f5', minHeight: '45px', display: 'flex', alignItems: 'center', background: '#fff' }}>
                        {selectedIds.length > 0 ? (
                            <div className="action-panel" style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', overflowX: 'auto', paddingBottom: '2px' }}>
                                <div className="selection-count" style={{ marginRight: '10px', fontWeight: 600, color: 'var(--primary-color)', whiteSpace: 'nowrap' }}>
                                    {selectedIds.length} Selected
                                </div>

                                {selectedIds.length === 1 && (
                                    <>
                                        <button className="action-btn" title="Edit Activity"><i className="fas fa-edit"></i> Edit</button>
                                        <button className="action-btn" title="Reschedule"><i className="fas fa-calendar-alt"></i> Reschedule</button>
                                        <button className="action-btn" title="Mark Complete"><i className="fas fa-check-circle"></i> Complete</button>
                                        <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px' }}></div>
                                    </>
                                )}

                                <button className="action-btn" title="Add Note"><i className="fas fa-sticky-note"></i> Note</button>
                                <div style={{ flex: 1 }}></div>
                                <button className="action-btn delete-btn" title="Delete Activities">
                                    <i className="fas fa-trash-alt"></i> Delete
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', width: '100%' }}>
                                <div className="search-box" style={{ flex: 1, maxWidth: '400px' }}>
                                    <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.85rem' }}></i>
                                    <input
                                        type="text"
                                        placeholder="Search activities by contact, agenda, or type..."
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px 8px 36px',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '6px',
                                            fontSize: '0.85rem',
                                            outline: 'none',
                                            transition: 'all 0.2s'
                                        }}
                                        onFocus={(e) => e.target.style.borderColor = 'var(--primary-color)'}
                                        onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                                    />
                                </div>
                                <div style={{ flex: 1 }}></div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Items: {filteredActivities.length}</span>
                                    <button style={{ padding: '4px 12px', border: '1px solid #e2e8f0', borderRadius: '4px', background: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>1</button>
                                    <button style={{ padding: '4px 12px', border: '1px solid #e2e8f0', borderRadius: '4px', background: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>2</button>
                                    <button style={{ padding: '4px 12px', border: '1px solid #e2e8f0', borderRadius: '4px', background: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>Next</button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Activities List Header - Unified for all types */}
                    <div style={{ position: 'sticky', top: '45px', zIndex: 99, padding: '15px 2rem', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'grid', gridTemplateColumns: '40px 200px 150px 300px 120px 300px 120px 120px 120px', gap: '1rem', alignItems: 'center' }}>
                        <div><input type="checkbox" onChange={toggleSelectAll} checked={selectedIds.length === filteredActivities.length} /></div>
                        <div>Details</div>
                        <div>Scheduled Date</div>
                        <div>Agenda</div>
                        <div>Activity Type</div>
                        <div>Project / Feedback</div>
                        <div>Scheduled By</div>
                        <div>Scheduled For</div>
                        <div>Stage / Status</div>
                    </div>

                    {/* Activities List - Unified Layout */}
                    <div className="list-content" style={{ background: '#fafbfc', padding: '1rem 2rem' }}>
                        {filteredActivities.map((activity, index) => (
                            <div
                                key={activity.id}
                                style={{
                                    padding: '18px 20px',
                                    marginBottom: '8px',
                                    borderRadius: '8px',
                                    border: '1px solid #e2e8f0',
                                    background: '#fff',
                                    display: 'grid',
                                    gridTemplateColumns: '40px 200px 150px 300px 120px 300px 120px 120px 120px',
                                    gap: '1rem',
                                    alignItems: 'center',
                                    transition: 'all 0.2s',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                }}
                            >
                                {/* Checkbox */}
                                <input
                                    type="checkbox"
                                    checked={selectedIds.includes(activity.id)}
                                    onChange={() => toggleSelect(activity.id)}
                                />

                                {/* Details - Name, Phone, Email, Lead (NO project) */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{activity.contactName}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#8e44ad', fontWeight: 600 }}>
                                        <i className="fas fa-phone" style={{ marginRight: '4px' }}></i>{activity.contactPhone}
                                    </div>
                                    {activity.contactEmail && (
                                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                            <i className="fas fa-envelope" style={{ marginRight: '4px' }}></i>{activity.contactEmail}
                                        </div>
                                    )}
                                    {/* Show Lead for Site Visit */}
                                    {activity.type === 'Site Visit' && activity.lead && (
                                        <div style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 600, marginTop: '4px' }}>
                                            <i className="fas fa-map-marker-alt" style={{ marginRight: '4px' }}></i>{activity.lead}
                                        </div>
                                    )}
                                </div>

                                {/* Scheduled Date */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <div style={{ fontSize: '0.8rem', color: '#0f172a', fontWeight: 700 }}>
                                        <i className="far fa-calendar" style={{ marginRight: '4px', color: '#6366f1' }}></i>
                                        {activity.scheduledDate ? activity.scheduledDate.split('T')[0] : activity.date ? activity.date.split('T')[0] : '--'}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                        <i className="far fa-clock" style={{ marginRight: '4px' }}></i>
                                        {activity.scheduledDate ? activity.scheduledDate.split('T')[1] : activity.date ? activity.date.split('T')[1] : '--'}
                                    </div>
                                    {/* Show Refreshed for Site Visit */}
                                    {activity.type === 'Site Visit' && activity.refreshed && (
                                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                                            <i className="fas fa-sync-alt" style={{ marginRight: '4px' }}></i>Refreshed: {activity.refreshed}
                                        </div>
                                    )}
                                </div>

                                {/* Agenda - NO Feedback, only Source */}
                                <div style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.5 }}>
                                    <div style={{ fontStyle: 'italic' }}>{activity.agenda}</div>
                                    {/* Show Source for Site Visit */}
                                    {activity.type === 'Site Visit' && activity.source && (
                                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '4px' }}>
                                            <i className="fas fa-tag" style={{ marginRight: '4px' }}></i>Source: {activity.source}
                                        </div>
                                    )}
                                </div>

                                {/* Activity Type */}
                                <div>
                                    <span style={{
                                        fontSize: '0.7rem',
                                        padding: '5px 12px',
                                        borderRadius: '16px',
                                        fontWeight: 700,
                                        background: activity.type === 'Meeting' ? 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)' :
                                            activity.type === 'Call' ? 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)' :
                                                'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
                                        color: activity.type === 'Meeting' ? '#1e40af' :
                                            activity.type === 'Call' ? '#92400e' : '#065f46',
                                        border: activity.type === 'Meeting' ? '1px solid #93c5fd' :
                                            activity.type === 'Call' ? '1px solid #fcd34d' : '1px solid #6ee7b7'
                                    }}>
                                        {activity.type}
                                    </span>
                                </div>

                                {/* Project / Feedback - Same width as Agenda */}
                                <div style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.5 }}>
                                    {/* Show Project for Site Visit */}
                                    {activity.type === 'Site Visit' && activity.project && (
                                        <div style={{ fontSize: '0.75rem', color: '#0891b2', fontWeight: 600, marginBottom: '4px' }}>
                                            <i className="fas fa-building" style={{ marginRight: '4px' }}></i>{activity.project}
                                        </div>
                                    )}
                                    {/* Show Feedback for Site Visit */}
                                    {activity.type === 'Site Visit' && activity.feedback && (
                                        <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600, padding: '4px 8px', background: '#d1fae5', borderRadius: '4px', borderLeft: '3px solid #10b981' }}>
                                            <i className="fas fa-comment-dots" style={{ marginRight: '4px' }}></i>{activity.feedback}
                                        </div>
                                    )}
                                    {/* Show placeholder for Meeting/Call */}
                                    {activity.type !== 'Site Visit' && (
                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>--</div>
                                    )}
                                </div>

                                {/* Scheduled By */}
                                <div style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 600 }}>
                                    <i className="fas fa-user-circle" style={{ marginRight: '4px', color: '#94a3b8' }}></i>
                                    {activity.scheduledBy || activity.scheduled || '--'}
                                </div>

                                {/* Scheduled For */}
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                    {activity.scheduledFor || '--'}
                                </div>

                                {/* Stage / Status - Grouped */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {activity.stage && (
                                        <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                                            <i className="fas fa-layer-group" style={{ marginRight: '4px' }}></i>{activity.stage}
                                        </div>
                                    )}
                                    <span style={{
                                        fontSize: '0.75rem',
                                        fontWeight: 800,
                                        padding: '4px 10px',
                                        borderRadius: '12px',
                                        background: activity.status === 'complete' ? '#d1fae5' : '#fee2e2',
                                        color: activity.status === 'complete' ? '#065f46' : '#991b1b',
                                        border: activity.status === 'complete' ? '1px solid #6ee7b7' : '1px solid #fca5a5',
                                        display: 'inline-block',
                                        width: 'fit-content'
                                    }}>
                                        {activity.status}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Summary Footer */}
                    <div className="list-footer" style={{ padding: '15px 2rem', background: '#fff', borderTop: '1px solid #eef2f5', display: 'flex', gap: '20px', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>Summary</div>
                        <div style={{ fontSize: '0.9rem', color: '#334155' }}>Total Activities <span style={{ fontWeight: 800, color: '#10b981', fontSize: '1rem', marginLeft: '5px' }}>{filteredActivities.length}</span></div>
                    </div>
                </div>
            </div>
        </section>
    );
}

export default ActivitiesView;
