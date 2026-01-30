import React, { useState } from 'react';
import { useTriggers } from '../../../context/TriggersContext';
import CreateTriggerModal from '../../../components/CreateTriggerModal';

const TriggersSettingsPage = () => {
    const { triggers, toggleTrigger, deleteTrigger, duplicateTrigger, getTriggerStats, stats } = useTriggers();
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingTrigger, setEditingTrigger] = useState(null);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [triggerToDelete, setTriggerToDelete] = useState(null);
    const [filterModule, setFilterModule] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [sortBy, setSortBy] = useState('priority');
    const [sortOrder, setSortOrder] = useState('asc');

    // Filter triggers
    let filteredTriggers = triggers.filter(t => {
        const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesModule = filterModule === 'all' || t.module === filterModule;
        const matchesStatus = filterStatus === 'all' ||
            (filterStatus === 'active' && t.isActive) ||
            (filterStatus === 'inactive' && !t.isActive);
        return matchesSearch && matchesModule && matchesStatus;
    });

    // Sort triggers
    filteredTriggers.sort((a, b) => {
        let comparison = 0;
        if (sortBy === 'name') {
            comparison = a.name.localeCompare(b.name);
        } else if (sortBy === 'priority') {
            comparison = (a.priority || 99) - (b.priority || 99);
        } else if (sortBy === 'module') {
            comparison = a.module.localeCompare(b.module);
        }
        return sortOrder === 'asc' ? comparison : -comparison;
    });

    const handleEdit = (trigger) => {
        setEditingTrigger(trigger);
        setIsEditModalOpen(true);
    };

    const handleDelete = (trigger) => {
        setTriggerToDelete(trigger);
        setIsDeleteConfirmOpen(true);
    };

    const confirmDelete = () => {
        if (triggerToDelete) {
            const result = deleteTrigger(triggerToDelete.id);
            if (!result.success) {
                alert(result.message);
            }
        }
        setIsDeleteConfirmOpen(false);
        setTriggerToDelete(null);
    };

    const getEventLabel = (event) => {
        const labels = {
            lead_created: 'Lead Created',
            lead_stage_changed: 'Lead Stage Changed',
            lead_score_changed: 'Lead Score Changed',
            lead_status_changed: 'Lead Status Changed',
            lead_inactivity: 'Lead Inactivity',
            activity_created: 'Activity Created',
            activity_completed: 'Activity Completed',
            activity_overdue: 'Activity Overdue',
            call_logged: 'Call Logged',
            call_outcome_selected: 'Call Outcome Selected',
            message_received: 'Message Received',
            inventory_status_changed: 'Inventory Status Changed',
            deal_created: 'Deal Created',
            deal_stage_changed: 'Deal Stage Changed',
            payment_received: 'Payment Received'
        };
        return labels[event] || event;
    };

    const getModuleColor = (module) => {
        const colors = {
            leads: '#3b82f6',
            activities: '#10b981',
            communication: '#8b5cf6',
            inventory: '#f59e0b',
            deals: '#ef4444',
            post_sale: '#6366f1'
        };
        return colors[module] || '#6b7280';
    };

    const [activeTab, setActiveTab] = useState('list'); // list, logs
    const { executionLogs, getExecutionLogs } = useTriggers();

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#111827' }}>Triggers</h2>
                    <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '14px' }}>
                        Event-driven automation that reacts to system changes
                    </p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    style={{
                        padding: '10px 20px',
                        background: '#3b82f6',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    <i className="fas fa-plus"></i> Create Trigger
                </button>
            </div>

            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                {[
                    { label: 'Active Triggers', value: triggers.filter(t => t.isActive).length, icon: 'fa-bolt', color: '#3b82f6' },
                    { label: 'Total Fired', value: stats.totalFired, icon: 'fa-fire', color: '#f59e0b' },
                    { label: 'Success Rate', value: stats.totalFired > 0 ? `${Math.round((stats.successCount / stats.totalFired) * 100)}%` : '0%', icon: 'fa-check-circle', color: '#10b981' },
                    { label: 'Avg Execution', value: `${Math.round(executionLogs.reduce((acc, log) => acc + (log.totalExecutionTime || 0), 0) / (executionLogs.length || 1))}ms`, icon: 'fa-clock', color: '#8b5cf6' }
                ].map((stat, i) => (
                    <div key={i} style={{ background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>{stat.label}</span>
                            <i className={`fas ${stat.icon}`} style={{ color: stat.color }}></i>
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: '#111827' }}>{stat.value}</div>
                    </div>
                ))}
            </div>

            {/* View Toggle */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: '#f3f4f6', padding: '4px', borderRadius: '10px', width: 'fit-content' }}>
                <button
                    onClick={() => setActiveTab('list')}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: 'none',
                        background: activeTab === 'list' ? '#fff' : 'transparent',
                        color: activeTab === 'list' ? '#111827' : '#6b7280',
                        fontWeight: '600',
                        cursor: 'pointer',
                        boxShadow: activeTab === 'list' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                    }}
                >
                    Trigger List
                </button>
                <button
                    onClick={() => setActiveTab('logs')}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: 'none',
                        background: activeTab === 'logs' ? '#fff' : 'transparent',
                        color: activeTab === 'logs' ? '#111827' : '#6b7280',
                        fontWeight: '600',
                        cursor: 'pointer',
                        boxShadow: activeTab === 'logs' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                    }}
                >
                    Execution Logs
                </button>
            </div>

            {activeTab === 'list' ? (
                <>
                    {/* Search and Filters */}
                    <div style={{ marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}></i>
                            <input
                                type="text"
                                placeholder="Search triggers..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px 10px 40px',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    outline: 'none'
                                }}
                            />
                        </div>
                        <select
                            value={filterModule}
                            onChange={(e) => setFilterModule(e.target.value)}
                            style={{ padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                        >
                            <option value="all">All Modules</option>
                            <option value="leads">Leads</option>
                            <option value="activities">Activities</option>
                            <option value="communication">Communication</option>
                            <option value="inventory">Inventory</option>
                            <option value="deals">Deals</option>
                            <option value="post_sale">Post-Sale</option>
                        </select>
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            style={{ padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                        >
                            <option value="all">All Status</option>
                            <option value="active">Active Only</option>
                            <option value="inactive">Inactive Only</option>
                        </select>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            style={{ padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                        >
                            <option value="priority">Sort by Priority</option>
                            <option value="name">Sort by Name</option>
                            <option value="module">Sort by Module</option>
                        </select>
                        <button
                            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                            style={{ padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff', cursor: 'pointer' }}
                        >
                            <i className={`fas fa-sort-${sortOrder === 'asc' ? 'up' : 'down'}`}></i>
                        </button>
                    </div>

                    {/* Triggers Table */}
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                <tr>
                                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Trigger Name</th>
                                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Module</th>
                                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Event</th>
                                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Actions</th>
                                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Priority</th>
                                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Stats</th>
                                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Status</th>
                                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTriggers.map((trigger) => {
                                    const triggerStats = getTriggerStats(trigger.id);
                                    return (
                                        <tr key={trigger.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                            <td style={{ padding: '16px' }}>
                                                <div style={{ fontWeight: '600', color: '#111827' }}>{trigger.name}</div>
                                                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                                    {trigger.conditions?.rules?.length || 0} condition(s)
                                                </div>
                                            </td>
                                            <td style={{ padding: '16px' }}>
                                                <span style={{
                                                    fontSize: '13px',
                                                    color: '#fff',
                                                    background: getModuleColor(trigger.module),
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    textTransform: 'capitalize'
                                                }}>
                                                    {trigger.module}
                                                </span>
                                            </td>
                                            <td style={{ padding: '16px' }}>
                                                <div style={{ fontSize: '13px', color: '#374151' }}>
                                                    {getEventLabel(trigger.event)}
                                                </div>
                                            </td>
                                            <td style={{ padding: '16px' }}>
                                                <div style={{ fontSize: '13px', color: '#374151' }}>
                                                    {trigger.actions?.length || 0} action(s)
                                                </div>
                                            </td>
                                            <td style={{ padding: '16px' }}>
                                                <div style={{
                                                    fontSize: '14px',
                                                    fontWeight: '700',
                                                    color: trigger.priority <= 3 ? '#ef4444' : trigger.priority <= 6 ? '#f59e0b' : '#6b7280'
                                                }}>
                                                    {trigger.priority || '-'}
                                                </div>
                                            </td>
                                            <td style={{ padding: '16px' }}>
                                                <div style={{ fontSize: '12px', color: '#374151' }}>
                                                    <div>Fired: {triggerStats.totalFired}</div>
                                                    <div style={{ color: triggerStats.successRate >= 80 ? '#10b981' : '#f59e0b' }}>
                                                        Success: {triggerStats.successRate}%
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '16px' }}>
                                                <button
                                                    onClick={() => toggleTrigger(trigger.id)}
                                                    style={{
                                                        padding: '4px 12px',
                                                        borderRadius: '20px',
                                                        fontSize: '12px',
                                                        fontWeight: '600',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        background: trigger.isActive ? '#dcfce7' : '#fee2e2',
                                                        color: trigger.isActive ? '#166534' : '#991b1b'
                                                    }}
                                                >
                                                    {trigger.isActive ? 'Active' : 'Inactive'}
                                                </button>
                                            </td>
                                            <td style={{ padding: '16px' }}>
                                                <div style={{ display: 'flex', gap: '12px', color: '#9ca3af' }}>
                                                    <i
                                                        className="fas fa-edit"
                                                        style={{ cursor: 'pointer', transition: 'color 0.2s' }}
                                                        onClick={() => handleEdit(trigger)}
                                                        onMouseEnter={(e) => e.target.style.color = '#3b82f6'}
                                                        onMouseLeave={(e) => e.target.style.color = '#9ca3af'}
                                                        title="Edit Trigger"
                                                    ></i>
                                                    <i
                                                        className="fas fa-copy"
                                                        style={{ cursor: 'pointer', transition: 'color 0.2s' }}
                                                        onClick={() => {
                                                            const duplicate = duplicateTrigger(trigger.id);
                                                            if (duplicate) {
                                                                setEditingTrigger(duplicate);
                                                                setIsEditModalOpen(true);
                                                            }
                                                        }}
                                                        onMouseEnter={(e) => e.target.style.color = '#10b981'}
                                                        onMouseLeave={(e) => e.target.style.color = '#9ca3af'}
                                                        title="Duplicate Trigger"
                                                    ></i>
                                                    <i
                                                        className="fas fa-trash-alt"
                                                        style={{ cursor: 'pointer', transition: 'color 0.2s' }}
                                                        onClick={() => handleDelete(trigger)}
                                                        onMouseEnter={(e) => e.target.style.color = '#ef4444'}
                                                        onMouseLeave={(e) => e.target.style.color = '#9ca3af'}
                                                        title="Delete Trigger"
                                                    ></i>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        {/* Empty State */}
                        {filteredTriggers.length === 0 && (
                            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#9ca3af' }}>
                                <i className="fas fa-bolt" style={{ fontSize: '48px', marginBottom: '16px', display: 'block' }}></i>
                                <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>No triggers found</div>
                                <div style={{ fontSize: '14px' }}>
                                    {searchTerm ? 'Try adjusting your search or filters' : 'Create your first trigger to automate responses to system events'}
                                </div>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                            <tr>
                                <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Timestamp</th>
                                <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Trigger</th>
                                <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Event</th>
                                <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Status</th>
                                <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Time</th>
                                <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Actions taken</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(executionLogs || []).map((log, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                    <td style={{ padding: '16px', fontSize: '13px', color: '#6b7280' }}>
                                        {new Date(log.executedAt).toLocaleString()}
                                    </td>
                                    <td style={{ padding: '16px', fontSize: '13px', fontWeight: '600' }}>
                                        {log.triggerName}
                                    </td>
                                    <td style={{ padding: '16px', fontSize: '13px' }}>
                                        {log.event}
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <span style={{
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            fontSize: '11px',
                                            fontWeight: '700',
                                            background: log.success ? '#dcfce7' : '#fee2e2',
                                            color: log.success ? '#166534' : '#991b1b'
                                        }}>
                                            {log.success ? 'SUCCESS' : 'FAILED'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '16px', fontSize: '13px' }}>
                                        {log.totalExecutionTime}ms
                                    </td>
                                    <td style={{ padding: '16px', fontSize: '13px', color: '#4b5563' }}>
                                        {log.actionLogs?.map(a => `${a.action}: ${a.status}`).join(', ')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {(!executionLogs || executionLogs.length === 0) && (
                        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#9ca3af' }}>
                            <i className="fas fa-history" style={{ fontSize: '48px', marginBottom: '16px', display: 'block' }}></i>
                            <div style={{ fontSize: '16px', fontWeight: '600' }}>No execution logs yet</div>
                        </div>
                    )}
                </div>
            )}

            {/* Create/Edit Modal */}
            <CreateTriggerModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
            />

            {isEditModalOpen && (
                <CreateTriggerModal
                    isOpen={isEditModalOpen}
                    onClose={() => {
                        setIsEditModalOpen(false);
                        setEditingTrigger(null);
                    }}
                    editData={editingTrigger}
                />
            )}

            {/* Delete Confirmation Modal */}
            {isDeleteConfirmOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', maxWidth: '400px', width: '90%' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: '700' }}>Delete Trigger?</h3>
                        <p style={{ margin: '0 0 24px', color: '#6b7280', fontSize: '14px' }}>
                            Are you sure you want to delete <strong>{triggerToDelete?.name}</strong>? This action cannot be undone.
                        </p>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setIsDeleteConfirmOpen(false)}
                                style={{ padding: '10px 20px', background: '#fff', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                style={{ padding: '10px 20px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TriggersSettingsPage;
