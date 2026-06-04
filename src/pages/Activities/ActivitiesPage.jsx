import React, { useState, useMemo, useCallback, useEffect, memo, Fragment } from 'react';
import { useActivities } from '../../context/ActivityContext';
import CreateActivityModal from '../../components/CreateActivityModal';
import ActivityOutcomeModal from '../../components/ActivityOutcomeModal';
import ActivityFilterPanel from './components/ActivityFilterPanel';
import { applyActivityFilters } from '../../utils/activityFilterLogic';
import ActiveFiltersChips from '../../components/ActiveFiltersChips';
import { STAGE_PIPELINE } from '../../utils/stageEngine';
import { renderValue } from '../../utils/renderUtils';

// ─── MEMOIZED SUB-COMPONENTS ──────────────────────────────────────────────────

// Colored stage chip using STAGE_PIPELINE data
const LeadStageChip = memo(function LeadStageChip({ stage }) {
    const info = STAGE_PIPELINE.find(s => s.label === stage) || STAGE_PIPELINE[0];
    if (!stage) return <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic' }}>--</span>;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            background: info.color + '18', color: info.color,
            border: `1px solid ${info.color}40`,
            borderRadius: '5px', padding: '2px 7px',
            fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em'
        }}>
            <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: info.color }} />
            {renderValue(stage)}
        </span>
    );
});
LeadStageChip.displayName = 'LeadStageChip';


const ActivityRow = memo(function ActivityRow({
    activity,
    isSelected,
    toggleSelect,
    selectedActivityId,
    setSelectedActivity,
    setIsOutcomeModalOpen
}) {
    const isRowSelected = selectedActivityId === activity._id;

    return (
        <div
            onClick={() => setSelectedActivity(activity)}
            style={{
                padding: '16px 12px',
                marginBottom: '8px',
                borderRadius: '8px',
                border: isRowSelected ? '2px solid #10b981' : '1px solid #e2e8f0',
                background: isRowSelected ? '#f0fdf4' : '#fff',
                display: 'grid',
                gridTemplateColumns: '35px 250px 140px 1.2fr 100px 1.2fr 130px 130px 120px',
                gap: '12px',
                alignItems: 'center',
                transition: 'all 0.2s',
                cursor: 'pointer',
                boxShadow: isRowSelected ? '0 4px 12px rgba(16, 185, 129, 0.1)' : '0 1px 2px rgba(0,0,0,0.04)',
                width: '100%',
                minWidth: '1300px'
            }}
        >
            {/* Checkbox */}
            <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                    e.stopPropagation();
                    toggleSelect(activity._id);
                }}
            />

            {/* Details */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' }}>
                <div title={renderValue(activity.entityType === 'Inventory' ? activity.participants?.[0]?.name : (activity.relatedTo?.[0]?.name || activity.participants?.[0]?.name))} className="text-ellipsis" style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a' }}>
                    {renderValue(activity.entityType === 'Inventory' 
                        ? (activity.participants?.[0]?.name || activity.contactName || 'Unknown Owner') 
                        : (activity.relatedTo?.[0]?.name || activity.participants?.[0]?.name || activity.contactName || 'Unknown Client')
                    )}
                </div>
                
                {/* Mobile / Phone - Enterprise Multi-Path Lookup */}
                <div style={{ fontSize: '0.75rem', color: '#7c3aed', fontWeight: 700 }}>
                    <i className="fas fa-phone" style={{ marginRight: '6px', transform: 'scaleX(-1) rotate(5deg)', opacity: 0.8 }}></i>
                    {renderValue(activity.participants?.[0]?.mobile || activity.details?.mobile || activity.mobile || activity.contactPhone || '--')}
                </div>

                {/* Email - Enterprise Multi-Path Lookup */}
                {(activity.contactEmail || activity.participants?.[0]?.email || activity.details?.email) && (
                    <div className="text-ellipsis" style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                        <i className="fas fa-envelope" style={{ marginRight: '6px', opacity: 0.7 }}></i>
                        {renderValue(activity.contactEmail || activity.participants?.[0]?.email || activity.details?.email)}
                    </div>
                )}
            </div>

            {/* Scheduled Date */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ fontSize: '0.8rem', color: '#0f172a', fontWeight: 700 }}>
                    <i className="far fa-calendar" style={{ marginRight: '6px', color: '#6366f1' }}></i>
                    {activity.dueDate ? new Date(activity.dueDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '--'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>
                    <i className="far fa-clock" style={{ marginRight: '6px', color: '#10b981' }}></i>
                    {activity.dueTime || (activity.dueDate && !activity.dueDate.toString().includes('00:00:00') 
                        ? new Date(activity.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                        : '--')}
                </div>
            </div>

            {/* Agenda */}
            <div style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.5, overflow: 'hidden' }}>
                <div className="address-clamp" style={{ fontStyle: 'italic' }}>
                    {(() => {
                        if (activity.details?.outcome) return <span style={{ fontWeight: 700, color: '#0f172a', fontStyle: 'normal' }}>{renderValue(activity.details.outcome)}</span>;
                        if (activity.details?.feedback && activity.details?.formSource === 'InventoryFeedbackForm') return <span style={{ fontWeight: 700, color: '#0f172a', fontStyle: 'normal' }}>{renderValue(activity.details.feedback)}</span>;
                        
                        const strToSearch = activity.details?.agenda || activity.subject || '';
                        const match = String(strToSearch).match(/discuss (.*?) for Unit/i);
                        if (match && match[1]) return <span style={{ fontWeight: 700, color: '#0f172a', fontStyle: 'normal' }}>{renderValue(match[1].trim())}</span>;

                        return renderValue(activity.subject || activity.details?.agenda);
                    })()}
                </div>
            </div>

            {/* Activity Type */}
            <div>
                <span style={{
                    fontSize: '0.7rem',
                    padding: '5px 12px',
                    borderRadius: '16px',
                    fontWeight: 700,
                    background: activity.type === 'Meeting' ? '#dbeafe' : activity.type === 'Call' || activity.type === 'Call Back' ? '#fef3c7' : '#d1fae5',
                    color: activity.type === 'Meeting' ? '#1e40af' : activity.type === 'Call' || activity.type === 'Call Back' ? '#92400e' : '#065f46',
                }}>
                    {renderValue(activity.type)}
                </span>
            </div>

            {/* Project / Feedback / Details */}
            <div style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.5, overflow: 'hidden' }}>
                {(activity.details?.visitedProperties?.[0]?.project || activity.entityType === 'Inventory') && (
                    <div className="text-ellipsis" style={{ fontSize: '0.75rem', color: '#0891b2', fontWeight: 600, marginBottom: '4px' }}>
                        <i className="fas fa-building" style={{ marginRight: '4px' }}></i>
                        {activity.entityType === 'Inventory' && activity.relatedTo?.[0]?.name 
                            ? `Unit ${activity.relatedTo[0].name}${activity.details?.project ? ` | ${activity.details.project}` : ''}${activity.details?.block ? ` (${String(activity.details.block).toLowerCase()})` : ''}`
                            : renderValue(activity.details?.visitedProperties?.[0]?.project)}
                    </div>
                )}
                {activity.details?.specificReason && (
                    <div className="address-clamp" style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 600, padding: '4px 8px', background: '#fef3c7', borderRadius: '4px', borderLeft: '3px solid #f59e0b', marginBottom: '4px' }}>
                        <i className="fas fa-info-circle" style={{ marginRight: '4px' }}></i>{renderValue(activity.details.specificReason)}
                    </div>
                )}
                {!activity.details?.specificReason && activity.description && activity.type === 'Call Back' && (
                    <div className="address-clamp" style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600, padding: '4px 8px', background: '#d1fae5', borderRadius: '4px', borderLeft: '3px solid #10b981', marginBottom: '4px' }}>
                        <i className="fas fa-comment-dots" style={{ marginRight: '4px' }}></i>{renderValue(activity.description)}
                    </div>
                )}
                {activity.details && Object.keys(activity.details).length > 0 && typeof activity.details === 'object' && !Array.isArray(activity.details) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {Object.entries(activity.details).filter(([k, v]) => v && typeof v === 'string' && !['visitedProperties', 'formSource', 'platform', 'source', 'agenda', 'outcome', 'specificReason', 'project', 'block', 'feedback', 'unitNo', 'inventoryId'].includes(k)).slice(0, 2).map(([key, value], i) => (
                            <span key={i} title={`${key}: ${renderValue(value)}`} className="text-ellipsis" style={{ maxWidth: '100%', fontSize: '0.65rem', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', border: '1px solid #e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                                <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{key}</span>: {renderValue(value)}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Scheduled By */}
            <div className="text-ellipsis" style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 600 }}>
                {renderValue(activity.assignedTo?.fullName || activity.assignedTo?.name || activity.createdBy?.fullName || activity.createdBy?.name || activity.performedBy || activity.scheduledBy || '--')}
            </div>

            {/* Scheduled For */}
            <div className="text-ellipsis" style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                {renderValue(activity.assignedTo?.fullName || activity.assignedTo?.name || (activity.performedBy || activity.createdBy ? 'Self' : '--'))}
            </div>

            {/* Stage / Status */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' }}>
                {activity.relatedTo?.[0]?.stage && (
                    <LeadStageChip stage={activity.relatedTo[0].stage} />
                )}
                <span style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '10px',
                    background: activity.status?.toLowerCase() === 'completed'
                        ? '#d1fae5'
                        : activity.status?.toLowerCase() === 'overdue'
                            ? '#fee2e2'
                            : '#fffbeb',
                    color: activity.status?.toLowerCase() === 'completed'
                        ? '#065f46'
                        : activity.status?.toLowerCase() === 'overdue'
                            ? '#991b1b'
                            : '#92400e',
                    width: 'fit-content'
                }}>
                    {renderValue(activity.status)}
                </span>
            </div>

        </div>
    );
});
ActivityRow.displayName = 'ActivityRow';


// ─── MAIN ACTIVITIES PAGE ───────────────────────────────────────────────────

function ActivitiesPage() {
    const { activities, fetchActivities, addActivity, updateActivity, deleteActivity } = useActivities();

    // UI State
    const [viewMode, setViewMode] = useState('list'); 
    const [calendarView, setCalendarView] = useState('month'); 
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedActivity, setSelectedActivity] = useState(null); 
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [activityToEdit, setActivityToEdit] = useState(null);
    const [isOutcomeModalOpen, setIsOutcomeModalOpen] = useState(false);

    // Selection State
    const [selectedIds, setSelectedIds] = useState([]);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [recordsPerPage, setRecordsPerPage] = useState(25);

    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
    const [filters, setFilters] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ label: 'Recently Created', by: 'createdAt', order: -1, icon: 'fa-calendar-plus' });
    const [isSortOpen, setIsSortOpen] = useState(false);

    // Handlers
    const handleRemoveFilter = useCallback((key) => {
        setFilters(prev => {
            const next = { ...prev };
            delete next[key];
            return next;
        });
    }, []);

    const handleClearAll = useCallback(() => setFilters({}), []);

    const handleSaveActivity = async (backendData) => {
        try {
            if (activityToEdit) {
                await updateActivity(activityToEdit._id, backendData);
            } else {
                await addActivity(backendData);
            }
            setIsCreateModalOpen(false);
            setActivityToEdit(null);
            fetchActivities();
        } catch (error) {
            console.error('Failed to save activity:', error);
        }
    };

    const handleEditActivity = () => {
        const activity = filteredActivities.find(a => a._id === selectedIds[0]);
        if (activity) {
            setActivityToEdit({ ...activity, id: activity._id }); // Pass ID for editing
            setIsCreateModalOpen(true);
        }
    };

    const handleDeleteActivities = async () => {
        if (window.confirm(`Are you sure you want to delete ${selectedIds.length} activities?`)) {
            try {
                for (const id of selectedIds) {
                    await deleteActivity(id);
                }
                setSelectedIds([]);
                fetchActivities();
            } catch (error) {
                console.error("Failed to delete activities", error);
                alert("Failed to delete some activities");
            }
        }
    };

    const handleOpenCompleteModal = useCallback((activity) => {
        setSelectedActivity(activity);
        setIsOutcomeModalOpen(true);
    }, []);

    const toggleSelect = useCallback((id) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    }, []);

    const filteredActivities = useMemo(() => {
        return applyActivityFilters(activities, filters, searchTerm);
    }, [activities, filters, searchTerm]);

    const toggleSelectAll = useCallback(() => {
        setSelectedIds(prev =>
            prev.length === filteredActivities.length ? [] : filteredActivities.map(a => a._id)
        );
    }, [filteredActivities]);

    const activeType = filters.activityType?.[0] || 'All';

    const setQuickTypeFilter = useCallback((type) => {
        if (type === 'All') {
            setFilters(prev => {
                const rest = { ...prev };
                delete rest.activityType;
                return rest;
            });
        } else {
            setFilters(prev => ({ ...prev, activityType: [type] }));
        }
    }, []);

    const setQuickStatusFilter = useCallback((statusTab) => {
        setFilters(prev => {
            let next = { ...prev };
            delete next.dateRange;
            delete next.status;

            if (statusTab === 'Today') {
                const today = new Date().toISOString().split('T')[0];
                next.dateRange = { start: today, end: today };
            } else if (statusTab === 'Upcoming') {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                const dateStr = tomorrow.toISOString().split('T')[0];
                next.dateRange = { start: dateStr };
                next.status = ['Pending', 'Upcoming'];
            } else if (statusTab === 'Overdue') {
                next.status = ['Overdue'];
            } else if (statusTab === 'Completed') {
                next.status = ['Completed'];
            } else if (statusTab === 'Custom') {
                setIsFilterPanelOpen(true);
            }
            return next;
        });
    }, []);

    const totalRecords = filteredActivities.length;
    const totalPages = Math.ceil(totalRecords / recordsPerPage);
    const paginatedActivities = useMemo(() => {
        return filteredActivities.slice(
            (currentPage - 1) * recordsPerPage,
            currentPage * recordsPerPage
        );
    }, [filteredActivities, currentPage, recordsPerPage]);

    useEffect(() => {
        fetchActivities({
            sortBy: sortConfig.by,
            sortOrder: sortConfig.order,
            search: searchTerm,
            ...filters
        });
    }, [sortConfig, filters, searchTerm]);

    const goToNextPage = () => { if (currentPage < totalPages) setCurrentPage(currentPage + 1); };
    const goToPreviousPage = () => { if (currentPage > 1) setCurrentPage(currentPage - 1); };

    const handleRecordsPerPageChange = (e) => {
        setRecordsPerPage(Number(e.target.value));
        setCurrentPage(1);
    };

    const getActiveTabRaw = useCallback(() => {
        if (filters.status?.includes('Overdue')) return 'Overdue';
        if (filters.status?.includes('Completed')) return 'Completed';
        if (filters.dateRange) {
            const today = new Date().toISOString().split('T')[0];
            if (filters.dateRange.start === today && filters.dateRange.end === today) return 'Today';
            if (filters.dateRange.start > today) return 'Upcoming';
            return 'Custom';
        }
        return 'All';
    }, [filters]);

    const currentTab = getActiveTabRaw() === 'All' ? 'Today' : getActiveTabRaw();

    const changeDate = useCallback((offset) => {
        setCurrentDate(prev => {
            const next = new Date(prev);
            if (calendarView === 'month') {
                next.setMonth(prev.getMonth() + offset);
            } else if (calendarView === 'week') {
                next.setDate(prev.getDate() + (offset * 7));
            } else {
                next.setDate(prev.getDate() + offset);
            }
            return next;
        });
    }, [calendarView]);

    // Calendar Renderers (Moved inside useMemo or left as stable functions if possible)
    const miniCalendar = useMemo(() => {
        const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
        const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
        const days = [];

        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`mini-prev-${i}`} style={{ padding: '4px', textAlign: 'center', color: '#cbd5e1' }}></div>);
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const isToday = new Date().toDateString() === new Date(currentDate.getFullYear(), currentDate.getMonth(), d).toDateString();
            days.push(
                <div key={d} style={{
                    padding: '4px', textAlign: 'center', fontSize: '0.75rem',
                    color: isToday ? '#fff' : '#475569',
                    background: isToday ? '#10b981' : 'transparent',
                    borderRadius: '50%', fontWeight: isToday ? 800 : 400,
                    cursor: 'pointer'
                }}>
                    {d}
                </div>
            );
        }

        return (
            <div style={{ padding: '16px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>
                        {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <i className="fas fa-chevron-left" style={{ cursor: 'pointer', fontSize: '0.7rem', color: '#64748b' }} onClick={() => changeDate(-1)}></i>
                        <i className="fas fa-chevron-right" style={{ cursor: 'pointer', fontSize: '0.7rem', color: '#64748b' }} onClick={() => changeDate(1)}></i>
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center' }}>
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                        <div key={idx} style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', paddingBottom: '4px' }}>{day}</div>
                    ))}
                    {days}
                </div>
            </div>
        );
    }, [currentDate, changeDate]);

    const mainCalendar = useMemo(() => {
        const monthName = currentDate.toLocaleString('default', { month: 'long' });
        const year = currentDate.getFullYear();

        const renderMonthPage = () => {
            const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
            const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
            const days = [];

            for (let i = 0; i < firstDay; i++) {
                days.push(<div key={`prev-${i}`} className="calendar-day padding" style={{ minHeight: '130px', background: '#f8fafc', border: '1px solid #e2e8f0' }}></div>);
            }

            for (let d = 1; d <= daysInMonth; d++) {
                const isToday = new Date().toDateString() === new Date(currentDate.getFullYear(), currentDate.getMonth(), d).toDateString();
                const dateStr = `${year}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const dayActivities = filteredActivities.filter(a => {
                    const aDate = a.dueDate ? new Date(a.dueDate).toISOString().split('T')[0] : '';
                    return aDate === dateStr;
                });

                days.push(
                    <div key={d} className="calendar-day" style={{ minHeight: '130px', background: '#fff', border: '1px solid #e2e8f0', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px', transition: 'all 0.2s', position: 'relative' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.8rem', color: isToday ? '#fff' : '#475569', background: isToday ? '#10b981' : 'transparent', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', marginBottom: '4px' }}>
                            {d}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', overflowY: 'auto', flex: 1 }}>
                            {dayActivities.map(a => (
                                <div
                                    key={a._id}
                                    onClick={(e) => { e.stopPropagation(); setSelectedActivity(a); }}
                                    style={{
                                        fontSize: '0.65rem', padding: '3px 8px', borderRadius: '4px',
                                        background: a.type === 'Meeting' ? '#e1f5fe' : a.type === 'Call' ? '#fff9c4' : '#e8f5e9',
                                        color: a.type === 'Meeting' ? '#0288d1' : a.type === 'Call' ? '#fbc02d' : '#2e7d32',
                                        borderLeft: `3px solid ${a.type === 'Meeting' ? '#03a9f4' : a.type === 'Call' ? '#fdd835' : '#4caf50'}`,
                                        boxShadow: selectedActivity?._id === a._id ? '0 0 0 2px #10b981' : 'none',
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', fontWeight: 700, zIndex: 2
                                    }}
                                    title={`${a.type}: ${a.subject}`}
                                >
                                    <i className={`fas ${a.type === 'Meeting' ? 'fa-users' : a.type === 'Call' ? 'fa-phone' : 'fa-map-marker-alt'}`} style={{ marginRight: '4px', opacity: 0.7 }}></i>
                                    {a.relatedTo?.[0]?.name || 'Unknown'}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            }

            return (
                <div className="calendar-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', background: '#f8fafc' }}>
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                        <div key={day} style={{ padding: '12px', background: '#fff', textAlign: 'center', fontWeight: 800, fontSize: '0.75rem', color: '#94a3b8', borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' }}>{day}</div>
                    ))}
                    {days}
                </div>
            );
        };

        const renderTimeGridPage = (viewType) => {
            const hours = Array.from({ length: 24 }, (_, i) => i);
            const numDays = viewType === 'week' ? 7 : 1;
            const startDate = new Date(currentDate);
            if (viewType === 'week') startDate.setDate(currentDate.getDate() - currentDate.getDay());

            return (
                <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(${numDays}, 1fr)`, border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', background: '#fff' }}>
                    <div style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}></div>
                    {Array.from({ length: numDays }).map((_, i) => {
                        const date = new Date(startDate);
                        date.setDate(startDate.getDate() + i);
                        const isToday = new Date().toDateString() === date.toDateString();
                        return (
                            <div key={i} style={{ padding: '12px', borderLeft: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', textAlign: 'center', background: isToday ? '#10b98110' : '#fff' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: isToday ? '#10b981' : '#94a3b8', textTransform: 'uppercase' }}>{date.toLocaleString('default', { weekday: 'short' })}</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: isToday ? '#fff' : '#1e293b', background: isToday ? '#10b981' : 'transparent', width: '32px', height: '32px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', marginTop: '4px' }}>{date.getDate()}</div>
                            </div>
                        );
                    })}
                    {hours.map(hour => (
                        <Fragment key={hour}>
                            <div style={{ padding: '10px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700 }}>{hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}</div>
                            {Array.from({ length: numDays }).map((_, i) => {
                                const date = new Date(startDate);
                                date.setDate(startDate.getDate() + i);
                                const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                                const hourActivities = filteredActivities.filter(a => {
                                    const fullDate = a.dueDate ? new Date(a.dueDate).toISOString() : '';
                                    if (!fullDate) return false;
                                    const [d, t] = fullDate.split('T');
                                    if (d !== dateStr) return false;
                                    return parseInt(t.split(':')[0]) === hour;
                                });
                                return (
                                    <div key={i} style={{ borderLeft: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', minHeight: '48px', position: 'relative', padding: '2px' }}>
                                        {hourActivities.map(a => (
                                            <div
                                                key={a._id}
                                                onClick={(e) => { e.stopPropagation(); setSelectedActivity(a); }}
                                                style={{
                                                    fontSize: '0.6rem', padding: '4px 8px', borderRadius: '4px',
                                                    background: a.type === 'Meeting' ? '#e1f5fe' : a.type === 'Call' ? '#fff9c4' : '#e8f5e9',
                                                    color: a.type === 'Meeting' ? '#0288d1' : a.type === 'Call' ? '#fbc02d' : '#2e7d32',
                                                    borderLeft: `3px solid ${a.type === 'Meeting' ? '#03a9f4' : a.type === 'Call' ? '#fdd835' : '#4caf50'}`,
                                                    boxShadow: selectedActivity?._id === a._id ? '0 0 0 2px #10b981' : 'none',
                                                    fontWeight: 800, marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', zIndex: 2
                                                }}
                                            >
                                                {a.relatedTo?.[0]?.name || 'Unknown'}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </Fragment>
                    ))}
                </div>
            );
        };

        return (
            <div className="calendar-view-container" style={{ display: 'flex', height: 'calc(100vh - 120px)', background: '#fff' }}>
                <div className="calendar-sidebar" style={{ width: '280px', borderRight: '1px solid #e2e8f0', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto' }}>
                    <button className="btn-primary" onClick={() => setIsCreateModalOpen(true)} style={{ width: '100%', padding: '12px', borderRadius: '24px', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)', marginBottom: '8px' }}>
                        <i className="fas fa-plus" style={{ marginRight: '8px' }}></i> Create
                    </button>
                    {miniCalendar}
                    <div>
                        <h4 style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '16px', letterSpacing: '0.5px' }}>My Calendars</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {['Meetings', 'Calls', 'Site Visits', 'Follow Ups'].map((label, idx) => (
                                <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '0.85rem', color: '#475569' }}>
                                    <input type="checkbox" defaultChecked style={{ accentColor: ['#4285F4', '#F4B400', '#0F9D58', '#DB4437'][idx] }} />
                                    <span style={{ flex: 1 }}>{label}</span>
                                    <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: ['#4285F4', '#F4B400', '#0F9D58', '#DB4437'][idx] }}></div>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div className="calendar-toolbar" style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>{monthName} {year}</h2>
                            <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
                                <button onClick={() => changeDate(-1)} style={{ padding: '6px 12px', border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}><i className="fas fa-chevron-left"></i></button>
                                <button onClick={() => setCurrentDate(new Date())} style={{ padding: '6px 16px', border: 'none', background: '#fff', borderRadius: '6px', color: '#475569', fontWeight: 700, fontSize: '0.85rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>Today</button>
                                <button onClick={() => changeDate(1)} style={{ padding: '6px 12px', border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}><i className="fas fa-chevron-right"></i></button>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
                            {['Month', 'Week', 'Day'].map(view => (
                                <button key={view} onClick={() => setCalendarView(view.toLowerCase())} style={{ padding: '6px 16px', border: 'none', background: calendarView === view.toLowerCase() ? '#fff' : 'none', borderRadius: '6px', color: calendarView === view.toLowerCase() ? '#10b981' : '#64748b', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', boxShadow: calendarView === view.toLowerCase() ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>{view}</button>
                            ))}
                        </div>
                    </div>
                    <div className="calendar-main-grid" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                        {calendarView === 'month' ? renderMonthPage() : renderTimeGridPage(calendarView)}
                    </div>
                </div>
            </div>
        );
    }, [currentDate, calendarView, changeDate, filteredActivities, selectedActivity, miniCalendar]);

    return (
        <section className="main-content" style={{ height: 'calc(100vh - 65px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="page-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
                <div className="page-header" style={{ background: '#fff', borderBottom: '1px solid #eef2f5', padding: '15px 0.5rem', zIndex: 110 }}>
                    <div className="page-title-group">
                        <i className="fas fa-tasks" style={{ color: '#68737d' }}></i>
                        <div>
                            <span className="working-list-label" style={{ display: 'block', whiteSpace: 'nowrap' }}>Task Management</span>
                            <h1>Activities</h1>
                        </div>
                    </div>
                    <div className="header-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div className="view-toggle-group">
                            <button onClick={() => setViewMode('list')} className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}><i className="fas fa-list"></i> List View</button>
                            <button onClick={() => setViewMode('calendar')} className={`view-toggle-btn ${viewMode === 'calendar' ? 'active' : ''}`}><i className="fas fa-calendar-alt"></i> Calendar View</button>
                        </div>
                        <button className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }} onClick={() => setIsFilterPanelOpen(true)}>
                            <i className="fas fa-filter"></i> Filter
                            {Object.keys(filters).length > 0 && <span style={{ position: 'absolute', top: '-5px', right: '-5px', width: '10px', height: '10px', background: 'red', borderRadius: '50%' }}></span>}
                        </button>
                    </div>
                </div>

                <div style={{ padding: '10px 0.5rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                        {['All', 'Follow Up', 'Site Visit', 'Meeting', 'Call', 'Task'].map(type => (
                            <button key={type} style={{ padding: '6px 16px', borderRadius: '6px', border: activeType === type ? 'none' : '1px solid #e2e8f0', background: activeType === type ? '#10b981' : '#fff', color: activeType === type ? '#fff' : '#64748b', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }} onClick={() => setQuickTypeFilter(type)}>{type}</button>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: '20px', borderBottom: '2px solid #e2e8f0', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '20px' }}>
                            {['Today', 'Upcoming', 'Overdue', 'Completed', 'Custom'].map(tab => (
                                <button key={tab} onClick={() => setQuickStatusFilter(tab)} style={{ padding: '10px 0', border: 'none', background: 'none', fontSize: '0.85rem', fontWeight: 600, color: currentTab === tab ? '#10b981' : '#64748b', borderBottom: currentTab === tab ? '2px solid #10b981' : '2px solid transparent', cursor: 'pointer', marginBottom: '-2px' }}>{tab}</button>
                            ))}
                        </div>
                        <div style={{ flex: 1 }}></div>
                    </div>
                </div>

                <div className="content-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {viewMode === 'list' ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <div className="toolbar-container" style={{ padding: '5px 0.5rem', borderBottom: '1px solid #eef2f5', minHeight: '45px', display: 'flex', alignItems: 'center', background: '#fff', zIndex: 105 }}>
                                {selectedIds.length > 0 ? (
                                    <div className="action-panel" style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', overflowX: 'auto', paddingTop: '4px', paddingBottom: '2px' }}>
                                        <div className="selection-count" style={{ marginRight: '10px', fontWeight: 600, color: 'var(--primary-color)', whiteSpace: 'nowrap' }}>{selectedIds.length} Selected</div>
                                        {selectedIds.length === 1 && (
                                            <>
                                                <button className="action-btn" title="Edit Activity" onClick={handleEditActivity}><i className="fas fa-edit"></i> Edit</button>
                                                <button className="action-btn" title="Reschedule" onClick={handleEditActivity}><i className="fas fa-calendar-alt"></i> Reschedule</button>
                                                <button className="action-btn" title="Mark Complete" onClick={() => handleOpenCompleteModal(filteredActivities.find(a => a._id === selectedIds[0]))}><i className="fas fa-check-circle"></i> Complete</button>
                                                <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px' }}></div>
                                            </>
                                        )}
                                        <button className="action-btn" title="Add Note" onClick={selectedIds.length === 1 ? handleEditActivity : () => {}}><i className="fas fa-sticky-note"></i> Note</button>
                                        <div style={{ flex: 1 }}></div>
                                        <button className="action-btn delete-btn" title="Delete Activities" onClick={handleDeleteActivities}><i className="fas fa-trash-alt"></i> Delete</button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', width: '100%' }}>
                                        <div style={{ position: 'relative', width: '350px' }}>
                                            <input
                                                type="text"
                                                className="search-input-premium"
                                                placeholder="Search activities..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                            />
                                            <i className={`fas fa-search search-icon-premium ${searchTerm ? 'active' : ''}`}></i>
                                        </div>

                                        <div style={{ flex: 1 }}></div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                            <div style={{ fontSize: '0.85rem', color: '#68737d', fontWeight: 500 }}>Total: <strong>{totalRecords}</strong> Activities</div>
                                            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8rem", color: "#64748b" }}>
                                                <span>Show:</span>
                                                <select value={recordsPerPage} onChange={handleRecordsPerPageChange} style={{ padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 600, color: "#0f172a", outline: "none", cursor: "pointer" }}>
                                                    {[10, 25, 50, 100, 300, 500, 750, 1000].map(v => <option key={v} value={v}>{v}</option>)}
                                                </select>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                <button onClick={goToPreviousPage} disabled={currentPage === 1} style={{ padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: "6px", background: currentPage === 1 ? "#f8fafc" : "#fff", color: currentPage === 1 ? "#cbd5e1" : "#0f172a", cursor: currentPage === 1 ? "not-allowed" : "pointer", fontSize: "0.75rem", fontWeight: 600 }}><i className="fas fa-chevron-left"></i> Prev</button>
                                                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#0f172a", minWidth: "80px", textAlign: "center" }}>{currentPage} / {totalPages || 1}</span>
                                                <button onClick={goToNextPage} disabled={currentPage >= totalPages} style={{ padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: "6px", background: currentPage >= totalPages ? "#f8fafc" : "#fff", color: currentPage >= totalPages ? "#cbd5e1" : "#0f172a", cursor: currentPage >= totalPages ? "not-allowed" : "pointer", fontSize: "0.75rem", fontWeight: 600 }}>Next <i className="fas fa-chevron-right"></i></button>

                                                {/* Professional Sort Icon */}
                                                <div style={{ position: 'relative', marginLeft: '10px' }}>
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
                                                                position: 'absolute', top: '100%', right: 0, zIndex: 999,
                                                                backgroundColor: '#fff', borderRadius: '16px', padding: '10px', 
                                                                minWidth: '220px', marginTop: '8px', listStyle: 'none',
                                                                border: '1px solid #eef2f5'
                                                            }}>
                                                                <li><h6 style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', padding: '10px 15px', margin: 0 }}>Advanced Sort</h6></li>
                                                                {[
                                                                    { label: 'Oldest Due', by: 'dueDate', order: 1, icon: 'fa-calendar-day' },
                                                                    { label: 'Newest Due', by: 'dueDate', order: -1, icon: 'fa-calendar-check' },
                                                                    { label: 'Recently Created', by: 'createdAt', order: -1, icon: 'fa-calendar-plus' },
                                                                    { label: 'Recently Updated', by: 'updatedAt', order: -1, icon: 'fa-bolt' },
                                                                    { label: 'Priority (High)', by: 'priority', order: -1, icon: 'fa-exclamation-triangle' },
                                                                    { label: 'A-Z Subject', by: 'subject', order: 1, icon: 'fa-sort-alpha-down' },
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
                                                                                console.log(`[ActivitySort] Changing sort to: ${opt.label} (${opt.by})`);
                                                                                setSortConfig(opt);
                                                                                setIsSortOpen(false);
                                                                            }}
                                                                        >
                                                                            <i className={`fas ${opt.icon}`} style={{ width: '18px', opacity: sortConfig.label === opt.label ? 1 : 0.6 }}></i>
                                                                            {opt.label}
                                                                            {sortConfig.label === opt.label && <i className="fas fa-check ms-auto" style={{ fontSize: '0.7rem' }}></i>}
                                                                        </button>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </React.Fragment>
                                                    )}
                                                </div>
                                            </div>

                                            </div>
                                        </div>
                                    )}
                            </div>
                            <ActiveFiltersChips filters={filters} onRemoveFilter={handleRemoveFilter} onClearAll={handleClearAll} />
                            <div className="list-scroll-area" style={{ flex: 1, overflow: 'auto' }}>
                                <div style={{ position: 'sticky', top: 0, zIndex: 99, padding: '15px 0.5rem', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'grid', gridTemplateColumns: '35px 250px 140px 1.2fr 100px 1.2fr 130px 130px 120px', gap: '12px', alignItems: 'center', width: '100%', minWidth: '1300px' }}>
                                    <div><input type="checkbox" onChange={toggleSelectAll} checked={selectedIds.length === filteredActivities.length && filteredActivities.length > 0} /></div>
                                    <div>Details</div>
                                    <div>Scheduled Date</div>
                                    <div>Agenda</div>
                                    <div>Activity Type</div>
                                    <div>Project / Feedback</div>
                                    <div>Scheduled By</div>
                                    <div>Scheduled For</div>
                                    <div>Stage / Status</div>
                                </div>
                                <div className="list-content" style={{ background: '#fafbfc', padding: '1rem 0.5rem' }}>
                                    {paginatedActivities.map((activity) => (
                                        <ActivityRow
                                            key={activity._id}
                                            activity={activity}
                                            isSelected={selectedIds.includes(activity._id)}
                                            toggleSelect={toggleSelect}
                                            selectedActivityId={selectedActivity?._id}
                                            setSelectedActivity={setSelectedActivity}
                                            setIsOutcomeModalOpen={setIsOutcomeModalOpen}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <div style={{ flex: 1, overflow: 'auto' }}>
                                {mainCalendar}
                            </div>
                        </div>
                    )}

                    <div className="activities-footer" style={{ padding: '12px 1rem', background: selectedActivity ? '#1e293b' : '#fff', color: selectedActivity ? '#fff' : 'inherit', borderTop: '1px solid #eef2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 1000, transition: 'all 0.3s ease', height: '55px', minHeight: '55px' }}>
                        {!selectedActivity ? (
                            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                                <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>Summary</div>
                                <div style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 700 }}>Total Activities <span style={{ color: '#10b981', marginLeft: '5px' }}>{totalRecords}</span></div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: '30px', alignItems: 'center', flex: 1 }}>
                                <div style={{ background: '#334155', color: '#fff', borderRadius: '6px', fontSize: '0.7rem', padding: '4px 12px', fontWeight: 800 }}>ACTIVITY SUMMARY</div>
                                <div style={{ display: 'flex', gap: '20px' }}>
                                    <div style={{ fontSize: '0.8rem' }}><span style={{ color: '#94a3b8' }}>CONTACT:</span> <span style={{ fontWeight: 800 }}>{renderValue(selectedActivity.relatedTo?.[0]?.name || 'Unknown')}</span></div>
                                    <div style={{ fontSize: '0.8rem' }}><span style={{ color: '#94a3b8' }}>TYPE:</span> <span style={{ fontWeight: 800, color: '#10b981' }}>{renderValue(selectedActivity.type)}</span></div>
                                    <div style={{ fontSize: '0.8rem', maxWidth: '400px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><span style={{ color: '#94a3b8' }}>SUBJECT:</span> <span style={{ fontWeight: 600 }}>{renderValue(selectedActivity.subject)}</span></div>
                                </div>
                                <button onClick={() => setSelectedActivity(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', marginLeft: 'auto' }}><i className="fas fa-times"></i></button>
                            </div>
                        )}
                    </div>
                </div>
            </div >
            <CreateActivityModal isOpen={isCreateModalOpen} onClose={() => { setIsCreateModalOpen(false); setActivityToEdit(null); }} onSave={handleSaveActivity} initialData={activityToEdit} />
            <ActivityFilterPanel isOpen={isFilterPanelOpen} onClose={() => setIsFilterPanelOpen(false)} filters={filters} onFilterChange={(key, value) => { if (typeof key === 'object') { setFilters(prev => ({ ...prev, ...key })); } else { setFilters(prev => ({ ...prev, [key]: value })); } }} onReset={() => setFilters({})} />
            {isOutcomeModalOpen && (
                <ActivityOutcomeModal isOpen={isOutcomeModalOpen} onClose={() => { setIsOutcomeModalOpen(false); fetchActivities(); }} activity={selectedActivity || activities.find(a => a._id === selectedIds[0])} />
            )}
        </section >
    );
}

export default ActivitiesPage;
