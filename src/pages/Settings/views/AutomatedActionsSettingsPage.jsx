import { useState, useMemo } from 'react';
import { useAutomatedActions } from '../../../context/AutomatedActionsContext';
import CreateAutomatedActionModal from '../../../components/CreateAutomatedActionModal';
import { DataTable } from '../../../components/ui/DataTable/DataTable';

const AutomatedActionsSettingsPage = () => {
    const { actions, auditLogs, fetchAuditLogs, toggleAction, deleteAction } = useAutomatedActions();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAction, setEditingAction] = useState(null);
    const [activeTab, setActiveTab] = useState('list'); // 'list' or 'audit'

    const handleEdit = (action) => {
        setEditingAction(action);
        setIsModalOpen(true);
    };

    const auditColumns = useMemo(() => [
        {
            key: 'time',
            header: 'Time',
            headerStyle: { padding: '12px', textAlign: 'left' },
            cellStyle: { padding: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' },
            render: (log) => log.timestamp ? new Date(log.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
        },
        {
            key: 'action',
            header: 'Action / Rule',
            headerStyle: { padding: '12px', textAlign: 'left' },
            cellStyle: { padding: '12px', fontWeight: 700 },
            render: (log) => log.actionName || '—'
        },
        {
            key: 'targetModule',
            header: 'Module',
            headerStyle: { padding: '12px', textAlign: 'left' },
            cellStyle: { padding: '12px', textTransform: 'capitalize' },
            render: (log) => log.targetModule || '—'
        },
        {
            key: 'entity',
            header: 'Entity ID',
            headerStyle: { padding: '12px', textAlign: 'left' },
            cellStyle: { padding: '12px', fontSize: '0.75rem', fontFamily: 'monospace' },
            render: (log) => log.entityId ? String(log.entityId) : '—'
        },
        {
            key: 'status',
            header: 'Status',
            headerStyle: { padding: '12px', textAlign: 'left' },
            cellStyle: { padding: '12px' },
            render: (log) => {
                const status = (log.status || (log.success ? 'success' : 'failed')).toLowerCase();
                const isSuccess = status === 'success';
                const isPending = status === 'pending' || status === 'processing';
                return (
                    <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        background: isSuccess ? 'rgba(34, 197, 94, 0.15)' : isPending ? 'rgba(234, 179, 8, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: isSuccess ? '#166534' : isPending ? '#854d0e' : '#991b1b',
                        fontWeight: 800
                    }}>
                        {status.toUpperCase()}
                    </span>
                );
            }
        },
        {
            key: 'ruleType',
            header: 'Rule Type',
            headerStyle: { padding: '12px', textAlign: 'left' },
            cellStyle: { padding: '12px', color: 'var(--text-muted)', fontSize: '0.75rem' },
            render: (log) => log.ruleType || '—'
        },
        {
            key: 'execution',
            header: 'Execution',
            headerStyle: { padding: '12px', textAlign: 'left' },
            cellStyle: { padding: '12px', color: 'var(--text-muted)' },
            render: (log) => log.executionTime != null ? `${log.executionTime}ms` : '—'
        }
    ], []);

    return (
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Header / Tabs */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ display: 'flex', gap: '24px' }}>
                    <div
                        onClick={() => setActiveTab('list')}
                        style={{
                            fontSize: '0.9rem',
                            fontWeight: 700,
                            color: activeTab === 'list' ? 'var(--primary-color)' : 'var(--text-muted)',
                            cursor: 'pointer',
                            borderBottom: activeTab === 'list' ? '2px solid var(--primary-color)' : 'none',
                            paddingBottom: '4px'
                        }}
                    >
                        Action List
                    </div>
                    <div
                        onClick={() => setActiveTab('audit')}
                        style={{
                            fontSize: '0.9rem',
                            fontWeight: 700,
                            color: activeTab === 'audit' ? 'var(--primary-color)' : 'var(--text-muted)',
                            cursor: 'pointer',
                            borderBottom: activeTab === 'audit' ? '2px solid var(--primary-color)' : 'none',
                            paddingBottom: '4px'
                        }}
                    >
                        Audit Logs
                    </div>
                </div>
                {activeTab === 'list' ? (
                    <button
                        className="btn-primary"
                        onClick={() => { setEditingAction(null); setIsModalOpen(true); }}
                        style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '0.85rem' }}
                    >
                        + Create Action
                    </button>
                ) : (
                    <button
                        className="btn-secondary"
                        onClick={() => fetchAuditLogs()}
                        style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <i className="fas fa-sync-alt"></i> Refresh Logs
                    </button>
                )}
            </div>

            {/* Content Area */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {activeTab === 'list' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {actions.map(action => (
                            <div key={action._id || action.id} style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{action.name}</h4>
                                        <span style={{ fontSize: '0.65rem', background: 'var(--bg-light)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-muted)', fontWeight: 700 }}>{action._id || action.id}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        <span><i className="fas fa-bullseye" style={{ marginRight: '4px' }}></i>Target: <b>{action.targetModule}</b></span>
                                        <span><i className="fas fa-bolt" style={{ marginRight: '4px' }}></i>Type: <b>{action.actionType.replace(/_/g, ' ')}</b></span>
                                        <span><i className="fas fa-link" style={{ marginRight: '4px' }}></i>Invoked by: <b>{action.invokedByTriggerName || (action.invokedByTrigger ? (/^[0-9a-fA-F]{24}$/.test(action.invokedByTrigger) ? 'Unknown Trigger' : action.invokedByTrigger.replace(/_/g, ' ')) : '—')}</b></span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div
                                        onClick={() => toggleAction(action._id || action.id)}
                                        style={{
                                            width: '36px',
                                            height: '20px',
                                            background: action.isActive ? 'var(--primary-color)' : 'var(--border-color)',
                                            borderRadius: '10px',
                                            padding: '2px',
                                            cursor: 'pointer',
                                            position: 'relative'
                                        }}
                                    >
                                        <div style={{ width: '16px', height: '16px', background: 'var(--bg-card)', borderRadius: '50%', position: 'absolute', right: action.isActive ? '2px' : 'auto', left: action.isActive ? 'auto' : '2px', transition: '0.2s' }}></div>
                                    </div>
                                    <button onClick={() => handleEdit(action)} style={{ background: 'none', border: '1px solid var(--border-color)', padding: '6px', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-muted)' }}><i className="fas fa-edit"></i></button>
                                    <button onClick={() => deleteAction(action._id || action.id)} style={{ background: 'none', border: '1px solid rgba(239, 68, 68, 0.15)', padding: '6px', borderRadius: '6px', cursor: 'pointer', color: '#ef4444' }}><i className="fas fa-trash"></i></button>
                                </div>
                            </div>
                        ))}

                        {actions.length === 0 && (
                            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                <i className="fas fa-robot" style={{ fontSize: '3rem', marginBottom: '16px' }}></i>
                                <h3>No Automated Actions defined yet</h3>
                                <p>Create safe, repetitive tasks that system can execute automatically.</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                        <DataTable
                            columns={auditColumns}
                            data={auditLogs}
                            emptyMessage={
                                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    No audit logs yet. Logs will appear here when triggers and automated actions execute.
                                </div>
                            }
                        />
                    </div>
                )}
            </div>

            {/* Modal */}
            <CreateAutomatedActionModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                editData={editingAction}
            />
        </div>
    );
};

export default AutomatedActionsSettingsPage;
