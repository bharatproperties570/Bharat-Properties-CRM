import React, { useState, useMemo } from 'react';
import { useActivities } from '../../context/ActivityContext';
import CreateActivityModal from '../../components/CreateActivityModal';
import ActivityFilterPanel from './components/ActivityFilterPanel';
import { applyActivityFilters } from '../../utils/activityFilterLogic';
import ActiveFiltersChips from '../../components/ActiveFiltersChips';

function ActivitiesPage() {
    const { activities } = useActivities(); // Use global state

    // UI State
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'calendar'
    const [calendarView, setCalendarView] = useState('month'); // 'month', 'week', 'day'
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedActivity, setSelectedActivity] = useState(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // Selection State
    const [selectedIds, setSelectedIds] = useState([]);

    // Filter State
    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
    const [filters, setFilters] = useState({});

    // Filter Handlers
    const handleRemoveFilter = (key) => {
        const newFilters = { ...filters };
        delete newFilters[key];
        setFilters(newFilters);
    };

    const handleClearAll = () => {
        setFilters({});
    };

    const [searchTerm, setSearchTerm] = useState('');

    const { addActivity } = useActivities();

    const handleSaveActivity = (activityData) => {
        const newActivity = {
            id: Date.now().toString(),
            type: activityData.activityType,
            contactName: activityData.relatedTo?.[0]?.name || 'Unknown Client',
            contactPhone: activityData.participants?.[0]?.mobile || '',
            scheduledDate: `${activityData.dueDate}T${activityData.dueTime}`,
            agenda: activityData.subject,
            activityType: activityData.activityType,
            scheduledBy: 'Current User',
            scheduledFor: 'Follow Up',
            stage: 'Pending',
            status: 'pending',
            feedback: activityData.description || '',
            project: activityData.visitedProperties?.[0]?.project || '',
            priority: activityData.priority || 'Normal'
        };
        addActivity(newActivity);
        setIsCreateModalOpen(false);
    };

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

    // Filter Logic
    const filteredActivities = useMemo(() => {
        return applyActivityFilters(activities, filters, searchTerm);
    }, [activities, filters, searchTerm]);

    // Helpers for Quick Filters (Pills)
    const activeType = filters.activityType?.[0] || 'All'; // Simplified for UI pill checks
    const activeStatus = filters.status?.[0] || 'All'; // Simplified for Tab checks

    const setQuickTypeFilter = (type) => {
        if (type === 'All') {
            const { activityType, ...rest } = filters;
            setFilters(rest);
        } else {
            setFilters(prev => ({ ...prev, activityType: [type] }));
        }
    };

    const setQuickStatusFilter = (statusTab) => {
        // Map Tabs to Filters
        let newFilters = { ...filters };

        // Reset Date Range and Status first if switching tabs broadly
        delete newFilters.dateRange;
        delete newFilters.status;

        if (statusTab === 'Today') {
            const today = new Date().toISOString().split('T')[0];
            newFilters.dateRange = { start: today, end: today };
        } else if (statusTab === 'Upcoming') {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const dateStr = tomorrow.toISOString().split('T')[0];
            newFilters.dateRange = { start: dateStr };
            newFilters.status = ['Pending', 'Upcoming']; // Ensure we don't see completed?
        } else if (statusTab === 'Overdue') {
            newFilters.status = ['Overdue'];
        } else if (statusTab === 'Completed') {
            newFilters.status = ['Completed'];
        } else if (statusTab === 'Custom') {
            // Keep existing date range if set, or open panel? 
            // For now just set a marker or minimal range
            setIsFilterPanelOpen(true);
        }

        setFilters(newFilters);
    };

    // Helper to determine active tab based on filters
    const getActiveTabRaw = () => {
        if (filters.status?.includes('Overdue')) return 'Overdue';
        if (filters.status?.includes('Completed')) return 'Completed';
        if (filters.dateRange) {
            const today = new Date().toISOString().split('T')[0];
            if (filters.dateRange.start === today && filters.dateRange.end === today) return 'Today';
            if (filters.dateRange.start > today) return 'Upcoming';
            return 'Custom';
        }
        return 'All'; // Default fallback, though "All" isn't a tab. 'Today' was default.
    };

    // Determine active tab for UI
    const currentTab = getActiveTabRaw() === 'All' ? 'Today' : getActiveTabRaw();

    // Calendar logic
    const getDaysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const getFirstDayOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

    const changeDate = (offset) => {
        const newDate = new Date(currentDate);
        if (calendarView === 'month') {
            newDate.setMonth(currentDate.getMonth() + offset);
        } else if (calendarView === 'week') {
            newDate.setDate(currentDate.getDate() + (offset * 7));
        } else {
            newDate.setDate(currentDate.getDate() + offset);
        }
        setCurrentDate(newDate);
    };

    const renderMiniCalendar = () => {
        const daysInMonth = getDaysInMonth(currentDate);
        const firstDay = getFirstDayOfMonth(currentDate);
        const days = [];

        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`mini-prev-${i}`} style={{ padding: '4px', textAlign: 'center', color: '#cbd5e1' }}></div>);
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const isToday = new Date().toDateString() === new Date(currentDate.getFullYear(), currentDate.getMonth(), d).toDateString();
            days.push(
                <div key={d} style={{
                    padding: '4px',
                    textAlign: 'center',
                    fontSize: '0.75rem',
                    color: isToday ? '#fff' : '#475569',
                    background: isToday ? '#10b981' : 'transparent',
                    borderRadius: '50%',
                    fontWeight: isToday ? 800 : 400,
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
    };

    const renderCalendar = () => {
        const monthName = currentDate.toLocaleString('default', { month: 'long' });
        const year = currentDate.getFullYear();

        const renderMonthPage = () => {
            const daysInMonth = getDaysInMonth(currentDate);
            const firstDay = getFirstDayOfMonth(currentDate);
            const days = [];

            // Previous month padding
            for (let i = 0; i < firstDay; i++) {
                days.push(<div key={`prev-${i}`} className="calendar-day padding" style={{ minHeight: '130px', background: '#f8fafc', border: '1px solid #e2e8f0' }}></div>);
            }

            // Current month days
            for (let d = 1; d <= daysInMonth; d++) {
                const isToday = new Date().toDateString() === new Date(currentDate.getFullYear(), currentDate.getMonth(), d).toDateString();
                const dateStr = `${year}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const dayActivities = filteredActivities.filter(a => {
                    const aDate = a.scheduledDate ? a.scheduledDate.split('T')[0] : a.date ? a.date.split('T')[0] : '';
                    return aDate === dateStr;
                });

                days.push(
                    <div key={d} className="calendar-day" style={{
                        minHeight: '130px',
                        background: '#fff',
                        border: '1px solid #e2e8f0',
                        padding: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        transition: 'all 0.2s',
                        position: 'relative'
                    }}>
                        <div style={{
                            fontWeight: 800,
                            fontSize: '0.8rem',
                            color: isToday ? '#fff' : '#475569',
                            background: isToday ? '#10b981' : 'transparent',
                            width: '24px',
                            height: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '50%',
                            marginBottom: '4px'
                        }}>
                            {d}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', overflowY: 'auto', flex: 1 }}>
                            {dayActivities.map(a => (
                                <div
                                    key={a.id}
                                    onClick={(e) => { e.stopPropagation(); setSelectedActivity(a); }}
                                    style={{
                                        fontSize: '0.65rem',
                                        padding: '3px 8px',
                                        borderRadius: '4px',
                                        background: a.type === 'Meeting' ? '#e1f5fe' : a.type === 'Call' ? '#fff9c4' : '#e8f5e9',
                                        color: a.type === 'Meeting' ? '#0288d1' : a.type === 'Call' ? '#fbc02d' : '#2e7d32',
                                        borderLeft: `3px solid ${a.type === 'Meeting' ? '#03a9f4' : a.type === 'Call' ? '#fdd835' : '#4caf50'}`,
                                        boxShadow: selectedActivity?.id === a.id ? '0 0 0 2px #10b981' : 'none',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        cursor: 'pointer',
                                        fontWeight: 700,
                                        zIndex: 2
                                    }}
                                    title={`${a.type}: ${a.agenda}`}
                                >
                                    <i className={`fas ${a.type === 'Meeting' ? 'fa-users' : a.type === 'Call' ? 'fa-phone' : 'fa-map-marker-alt'}`} style={{ marginRight: '4px', opacity: 0.7 }}></i>
                                    {a.contactName}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            }

            return (
                <div className="calendar-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, 1fr)',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    background: '#f8fafc'
                }}>
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                        <div key={day} style={{
                            padding: '12px',
                            background: '#fff',
                            textAlign: 'center',
                            fontWeight: 800,
                            fontSize: '0.75rem',
                            color: '#94a3b8',
                            borderBottom: '1px solid #e2e8f0',
                            textTransform: 'uppercase'
                        }}>
                            {day}
                        </div>
                    ))}
                    {days}
                </div>
            );
        };

        const renderTimeGridPage = (viewType) => {
            const hours = Array.from({ length: 24 }, (_, i) => i);
            const numDays = viewType === 'week' ? 7 : 1;

            // Get start of week/day based on currentDate
            const startDate = new Date(currentDate);
            if (viewType === 'week') {
                startDate.setDate(currentDate.getDate() - currentDate.getDay());
            }

            return (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: `60px repeat(${numDays}, 1fr)`,
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    background: '#fff'
                }}>
                    {/* Headers */}
                    <div style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}></div>
                    {Array.from({ length: numDays }).map((_, i) => {
                        const date = new Date(startDate);
                        date.setDate(startDate.getDate() + i);
                        const isToday = new Date().toDateString() === date.toDateString();
                        return (
                            <div key={i} style={{
                                padding: '12px',
                                borderLeft: '1px solid #e2e8f0',
                                borderBottom: '1px solid #e2e8f0',
                                textAlign: 'center',
                                background: isToday ? '#10b98110' : '#fff'
                            }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: isToday ? '#10b981' : '#94a3b8', textTransform: 'uppercase' }}>
                                    {date.toLocaleString('default', { weekday: 'short' })}
                                </div>
                                <div style={{
                                    fontSize: '1.2rem',
                                    fontWeight: 800,
                                    color: isToday ? '#fff' : '#1e293b',
                                    background: isToday ? '#10b981' : 'transparent',
                                    width: '32px',
                                    height: '32px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '50%',
                                    marginTop: '4px'
                                }}>
                                    {date.getDate()}
                                </div>
                            </div>
                        );
                    })}

                    {/* Time Slots */}
                    {hours.map(hour => (
                        <React.Fragment key={hour}>
                            <div style={{
                                padding: '10px 8px',
                                borderBottom: '1px solid #f1f5f9',
                                textAlign: 'right',
                                fontSize: '0.65rem',
                                color: '#94a3b8',
                                fontWeight: 700
                            }}>
                                {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                            </div>
                            {Array.from({ length: numDays }).map((_, i) => {
                                const date = new Date(startDate);
                                date.setDate(startDate.getDate() + i);
                                const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

                                const hourActivities = filteredActivities.filter(a => {
                                    const fullDate = a.scheduledDate || a.date || '';
                                    if (!fullDate) return false;
                                    const [d, t] = fullDate.split('T');
                                    if (d !== dateStr) return false;
                                    const activityHour = parseInt(t.split(':')[0]);
                                    return activityHour === hour;
                                });

                                return (
                                    <div key={i} style={{
                                        borderLeft: '1px solid #f1f5f9',
                                        borderBottom: '1px solid #f1f5f9',
                                        minHeight: '48px',
                                        position: 'relative',
                                        padding: '2px'
                                    }}>
                                        {hourActivities.map(a => (
                                            <div
                                                key={a.id}
                                                onClick={(e) => { e.stopPropagation(); setSelectedActivity(a); }}
                                                style={{
                                                    fontSize: '0.6rem',
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    background: a.type === 'Meeting' ? '#e1f5fe' : a.type === 'Call' ? '#fff9c4' : '#e8f5e9',
                                                    color: a.type === 'Meeting' ? '#0288d1' : a.type === 'Call' ? '#fbc02d' : '#2e7d32',
                                                    borderLeft: `3px solid ${a.type === 'Meeting' ? '#03a9f4' : a.type === 'Call' ? '#fdd835' : '#4caf50'}`,
                                                    boxShadow: selectedActivity?.id === a.id ? '0 0 0 2px #10b981' : 'none',
                                                    fontWeight: 800,
                                                    marginBottom: '2px',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    cursor: 'pointer',
                                                    zIndex: 2
                                                }}
                                            >
                                                {a.contactName}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </React.Fragment>
                    ))}
                </div>
            );
        };

        return (
            <div className="calendar-view-container" style={{ display: 'flex', height: 'calc(100vh - 120px)', background: '#fff' }}>
                {/* Calendar Sidebar */}
                <div className="calendar-sidebar" style={{ width: '280px', borderRight: '1px solid #e2e8f0', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto' }}>
                    <button className="btn-primary" style={{ width: '100%', padding: '12px', borderRadius: '24px', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)', marginBottom: '8px' }}>
                        <i className="fas fa-plus" style={{ marginRight: '8px' }}></i> Create
                    </button>

                    {renderMiniCalendar()}

                    <div>
                        <h4 style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '16px', letterSpacing: '0.5px' }}>My Calendars</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {[
                                { label: 'Meetings', color: '#4285F4', checked: true },
                                { label: 'Calls', color: '#F4B400', checked: true },
                                { label: 'Site Visits', color: '#0F9D58', checked: true },
                                { label: 'Follow Ups', color: '#DB4437', checked: true }
                            ].map((cal, idx) => (
                                <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '0.85rem', color: '#475569' }}>
                                    <input type="checkbox" defaultChecked={cal.checked} style={{ accentColor: cal.color }} />
                                    <span style={{ flex: 1 }}>{cal.label}</span>
                                    <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: cal.color }}></div>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Main Calendar Content */}
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
                                <button
                                    key={view}
                                    onClick={() => setCalendarView(view.toLowerCase())}
                                    style={{
                                        padding: '6px 16px',
                                        border: 'none',
                                        background: calendarView === view.toLowerCase() ? '#fff' : 'none',
                                        borderRadius: '6px',
                                        color: calendarView === view.toLowerCase() ? '#10b981' : '#64748b',
                                        fontWeight: 700,
                                        fontSize: '0.85rem',
                                        cursor: 'pointer',
                                        boxShadow: calendarView === view.toLowerCase() ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {view}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="calendar-main-grid" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                        {calendarView === 'month' ? renderMonthPage() : renderTimeGridPage(calendarView)}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <section className="main-content" style={{ height: 'calc(100vh - 65px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="page-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
                {/* Page Header */}
                <div className="page-header" style={{ background: '#fff', borderBottom: '1px solid #eef2f5', padding: '20px 2rem', zIndex: 110 }}>
                    <div className="page-title-group">
                        <i className="fas fa-tasks" style={{ color: '#68737d' }}></i>
                        <div>
                            <span className="working-list-label" style={{ display: 'block', whiteSpace: 'nowrap' }}>Task Management</span>
                            <h1>Activities</h1>
                        </div>
                    </div>
                    <div className="header-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>


                        <div className="view-toggle-group">
                            <button
                                onClick={() => setViewMode('list')}
                                className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                            >
                                <i className="fas fa-list"></i> List View
                            </button>

                            <button
                                onClick={() => setViewMode('calendar')}
                                className={`view-toggle-btn ${viewMode === 'calendar' ? 'active' : ''}`}
                            >
                                <i className="fas fa-calendar-alt"></i> Calendar View
                            </button>
                        </div>

                        <button
                            className="btn-outline"
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}
                            onClick={() => setIsFilterPanelOpen(true)}
                        >
                            <i className="fas fa-filter"></i> Filter
                            {Object.keys(filters).length > 0 && (
                                <span style={{
                                    position: 'absolute', top: '-5px', right: '-5px',
                                    width: '10px', height: '10px', background: 'red', borderRadius: '50%'
                                }}></span>
                            )}
                        </button>
                    </div>
                </div>

                <div style={{ padding: '15px 2rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                        {['All', 'Follow Up', 'Site Visit', 'Meeting', 'Call', 'Email', 'Task'].map(type => (
                            <button
                                key={type}
                                style={{
                                    padding: '6px 16px',
                                    borderRadius: '6px',
                                    border: activeType === type ? 'none' : '1px solid #e2e8f0',
                                    background: activeType === type ? '#10b981' : '#fff',
                                    color: activeType === type ? '#fff' : '#64748b',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                                onClick={() => setQuickTypeFilter(type)}
                            >
                                {type}
                            </button>
                        ))}
                    </div>

                    {/* Status Tabs */}
                    <div style={{ display: 'flex', gap: '20px', borderBottom: '2px solid #e2e8f0' }}>
                        {['Today', 'Upcoming', 'Overdue', 'Completed', 'Custom'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setQuickStatusFilter(tab)}
                                style={{
                                    padding: '10px 0',
                                    border: 'none',
                                    background: 'none',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    color: currentTab === tab ? '#10b981' : '#64748b',
                                    borderBottom: currentTab === tab ? '2px solid #10b981' : '2px solid transparent',
                                    cursor: 'pointer',
                                    marginBottom: '-2px'
                                }}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="content-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {viewMode === 'list' ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            {/* Action Bar / Toolbar */}
                            <div className="toolbar-container" style={{ padding: '5px 2rem', borderBottom: '1px solid #eef2f5', minHeight: '45px', display: 'flex', alignItems: 'center', background: '#fff', zIndex: 105 }}>
                                {selectedIds.length > 0 ? (
                                    <div className="action-panel" style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', overflowX: 'auto', paddingTop: '4px', paddingBottom: '2px' }}>
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
                                        <div className="search-box" style={{ flex: 1, maxWidth: '400px', position: 'relative' }}>
                                            <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.85rem' }}></i>
                                            <input
                                                type="text"
                                                placeholder="Search activities by contact, agenda, or type..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
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

                            {/* Active Filters Chips */}
                            <ActiveFiltersChips
                                filters={filters}
                                onRemoveFilter={handleRemoveFilter}
                                onClearAll={handleClearAll}
                            />

                            <div className="list-scroll-area" style={{ flex: 1, overflow: 'auto' }}>
                                {/* Activities List Header - Unified for all types */}
                                <div style={{ position: 'sticky', top: 0, zIndex: 99, padding: '15px 2rem', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'grid', gridTemplateColumns: '40px 200px 150px 300px 120px 300px 120px 120px 120px', gap: '1rem', alignItems: 'center', minWidth: '1600px' }}>
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
                                            onClick={() => setSelectedActivity(activity)}
                                            style={{
                                                padding: '18px 20px',
                                                marginBottom: '8px',
                                                borderRadius: '8px',
                                                border: selectedActivity?.id === activity.id ? '2px solid #10b981' : '1px solid #e2e8f0',
                                                background: selectedActivity?.id === activity.id ? '#f0fdf4' : '#fff',
                                                display: 'grid',
                                                gridTemplateColumns: '40px 200px 150px 300px 120px 300px 120px 120px 120px',
                                                gap: '1rem',
                                                alignItems: 'center',
                                                transition: 'all 0.2s',
                                                cursor: 'pointer',
                                                boxShadow: selectedActivity?.id === activity.id ? '0 4px 12px rgba(16, 185, 129, 0.1)' : '0 1px 2px rgba(0,0,0,0.04)',
                                                minWidth: '1600px'
                                            }}
                                        >
                                            {/* Checkbox */}
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(activity.id)}
                                                onChange={() => toggleSelect(activity.id)}
                                            />

                                            {/* Details */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' }}>
                                                <div className="text-ellipsis" style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{activity.contactName}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#8e44ad', fontWeight: 600 }}>
                                                    <i className="fas fa-phone" style={{ marginRight: '4px', transform: 'scaleX(-1) rotate(5deg)' }}></i>{activity.contactPhone}
                                                </div>
                                                {activity.contactEmail && (
                                                    <div className="text-ellipsis" style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                                        <i className="fas fa-envelope" style={{ marginRight: '4px' }}></i>{activity.contactEmail}
                                                    </div>
                                                )}
                                                {activity.type === 'Site Visit' && activity.lead && (
                                                    <div className="text-ellipsis" style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 600, marginTop: '4px' }}>
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
                                            </div>

                                            {/* Agenda */}
                                            <div style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.5, overflow: 'hidden' }}>
                                                <div className="address-clamp" style={{ fontStyle: 'italic' }}>{activity.agenda}</div>
                                            </div>

                                            {/* Activity Type */}
                                            <div>
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    padding: '5px 12px',
                                                    borderRadius: '16px',
                                                    fontWeight: 700,
                                                    background: activity.type === 'Meeting' ? '#dbeafe' : activity.type === 'Call' ? '#fef3c7' : '#d1fae5',
                                                    color: activity.type === 'Meeting' ? '#1e40af' : activity.type === 'Call' ? '#92400e' : '#065f46',
                                                }}>
                                                    {activity.type}
                                                </span>
                                            </div>

                                            {/* Project / Feedback */}
                                            <div style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.5, overflow: 'hidden' }}>
                                                {activity.type === 'Site Visit' && activity.project && (
                                                    <div className="text-ellipsis" style={{ fontSize: '0.75rem', color: '#0891b2', fontWeight: 600, marginBottom: '4px' }}>
                                                        <i className="fas fa-building" style={{ marginRight: '4px' }}></i>{activity.project}
                                                    </div>
                                                )}
                                                {activity.type === 'Site Visit' && activity.feedback && (
                                                    <div className="address-clamp" style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600, padding: '4px 8px', background: '#d1fae5', borderRadius: '4px', borderLeft: '3px solid #10b981' }}>
                                                        <i className="fas fa-comment-dots" style={{ marginRight: '4px' }}></i>{activity.feedback}
                                                    </div>
                                                )}
                                                {activity.type !== 'Site Visit' && (
                                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>--</div>
                                                )}
                                            </div>

                                            {/* Scheduled By */}
                                            <div className="text-ellipsis" style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 600 }}>
                                                {activity.scheduledBy || activity.scheduled || '--'}
                                            </div>

                                            {/* Scheduled For */}
                                            <div className="text-ellipsis" style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                {activity.scheduledFor || '--'}
                                            </div>

                                            {/* Stage / Status */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' }}>
                                                <span style={{
                                                    fontSize: '0.75rem',
                                                    fontWeight: 800,
                                                    padding: '4px 10px',
                                                    borderRadius: '12px',
                                                    background: activity.status === 'complete' ? '#d1fae5' : '#fee2e2',
                                                    color: activity.status === 'complete' ? '#065f46' : '#991b1b',
                                                    width: 'fit-content'
                                                }}>
                                                    {activity.status}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <div style={{ flex: 1, overflow: 'auto' }}>
                                {renderCalendar()}
                            </div>
                        </div>
                    )}

                    {/* Unified Footer - Always Visible at the Bottom */}
                    <div className="activities-footer" style={{
                        padding: '12px 2rem',
                        background: selectedActivity ? '#1e293b' : '#fff',
                        color: selectedActivity ? '#fff' : 'inherit',
                        borderTop: '1px solid #eef2f5',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        zIndex: 1000,
                        transition: 'all 0.3s ease',
                        height: '55px',
                        minHeight: '55px'
                    }}>
                        {!selectedActivity ? (
                            <>
                                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                                    <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>Summary</div>
                                    <div style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 700 }}>
                                        Total Activities <span style={{ color: '#10b981', marginLeft: '5px' }}>{filteredActivities.length}</span>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{ display: 'flex', gap: '30px', alignItems: 'center', flex: 1 }}>
                                    <div style={{ background: '#334155', color: '#fff', borderRadius: '6px', fontSize: '0.7rem', padding: '4px 12px', fontWeight: 800 }}>ACTIVITY SUMMARY</div>
                                    <div style={{ display: 'flex', gap: '20px' }}>
                                        <div style={{ fontSize: '0.8rem' }}><span style={{ color: '#94a3b8' }}>CONTACT:</span> <span style={{ fontWeight: 800 }}>{selectedActivity.contactName}</span></div>
                                        <div style={{ fontSize: '0.8rem' }}><span style={{ color: '#94a3b8' }}>TYPE:</span> <span style={{ fontWeight: 800, color: '#10b981' }}>{selectedActivity.type}</span></div>
                                        <div style={{ fontSize: '0.8rem', maxWidth: '400px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            <span style={{ color: '#94a3b8' }}>AGENDA:</span> <span style={{ fontWeight: 600 }}>{selectedActivity.agenda}</span>
                                        </div>
                                        {selectedActivity.feedback && (
                                            <div style={{ fontSize: '0.8rem', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                <span style={{ color: '#94a3b8' }}>FEEDBACK:</span> <span style={{ fontWeight: 600, color: '#fbbf24' }}>{selectedActivity.feedback}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedActivity(null)}
                                    style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
            <CreateActivityModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSave={handleSaveActivity}
            />
            <ActivityFilterPanel
                isOpen={isFilterPanelOpen}
                onClose={() => setIsFilterPanelOpen(false)}
                filters={filters}
                onFilterChange={(key, value) => {
                    // Support single key update or bulk object update
                    if (typeof key === 'object') {
                        setFilters(prev => ({ ...prev, ...key }));
                    } else {
                        setFilters(prev => ({ ...prev, [key]: value }));
                    }
                }}
                onReset={() => setFilters({})}
            />
        </section >
    );
}

export default ActivitiesPage;
