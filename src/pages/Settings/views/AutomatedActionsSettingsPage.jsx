import React, { useState } from 'react';
import { useAutomatedActions } from '../../../context/AutomatedActionsContext';
import CreateAutomatedActionModal from '../../../components/CreateAutomatedActionModal';

const AutomatedActionsSettingsPage = () => {
    const { actions, auditLogs, toggleAction, deleteAction } = useAutomatedActions();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAction, setEditingAction] = useState(null);
    const [activeTab, setActiveTab] = useState('list'); // 'list' or 'audit'

    const handleEdit = (action) => {
        setEditingAction(action);
        setIsModalOpen(true);
    };

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
                            color: activeTab === 'list' ? 'var(--primary-color)' : '#94a3b8',
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
                            color: activeTab === 'audit' ? 'var(--primary-color)' : '#94a3b8',
                            cursor: 'pointer',
                            borderBottom: activeTab === 'audit' ? '2px solid var(--primary-color)' : 'none',
                            paddingBottom: '4px'
                        }}
                    >
                        Audit Logs
                    </div>
                </div>
                {activeTab === 'list' && (
                    <button
                        className="btn-primary"
                        onClick={() => { setEditingAction(null); setIsModalOpen(true); }}
                        style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '0.85rem' }}
                    >
                        + Create Action
                    </button>
                )}
            </div>

            {/* Content Area */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {activeTab === 'list' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {actions.map(action => (
                            <div key={action.id} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{action.name}</h4>
                                        <span style={{ fontSize: '0.65rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', color: '#64748b', fontWeight: 700 }}>{action.id}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem', color: '#64748b' }}>
                                        <span><i className="fas fa-bullseye" style={{ marginRight: '4px' }}></i>Target: <b>{action.targetModule}</b></span>
                                        <span><i className="fas fa-bolt" style={{ marginRight: '4px' }}></i>Type: <b>{action.actionType.replace('_', ' ')}</b></span>
                                        <span><i className="fas fa-link" style={{ marginRight: '4px' }}></i>Invoked by: <b>{action.invokedByTrigger}</b></span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div
                                        onClick={() => toggleAction(action.id)}
                                        style={{
                                            width: '36px',
                                            height: '20px',
                                            background: action.isActive ? 'var(--primary-color)' : '#cbd5e1',
                                            borderRadius: '10px',
                                            padding: '2px',
                                            cursor: 'pointer',
                                            position: 'relative'
                                        }}
                                    >
                                        <div style={{ width: '16px', height: '16px', background: '#fff', borderRadius: '50%', position: 'absolute', right: action.isActive ? '2px' : 'auto', left: action.isActive ? 'auto' : '2px', transition: '0.2s' }}></div>
                                    </div>
                                    <button onClick={() => handleEdit(action)} style={{ background: 'none', border: '1px solid #e2e8f0', padding: '6px', borderRadius: '6px', cursor: 'pointer', color: '#64748b' }}><i className="fas fa-edit"></i></button>
                                    <button onClick={() => deleteAction(action.id)} style={{ background: 'none', border: '1px solid #fee2e2', padding: '6px', borderRadius: '6px', cursor: 'pointer', color: '#ef4444' }}><i className="fas fa-trash"></i></button>
                                </div>
                            </div>
                        ))}

                        {actions.length === 0 && (
                            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                                <i className="fas fa-robot" style={{ fontSize: '3rem', marginBottom: '16px' }}></i>
                                <h3>No Automated Actions defined yet</h3>
                                <p>Create safe, repetitive tasks that system can execute automatically.</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Time</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Action</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Entity</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Status</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Execution</th>
                                </tr>
                            </thead>
                            <tbody>
                                {auditLogs.map((log, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '12px', color: '#64748b' }}>{new Date(log.timestamp).toLocaleTimeString()}</td>
                                        <td style={{ padding: '12px', fontWeight: 700 }}>{log.actionName}</td>
                                        <td style={{ padding: '12px' }}>{log.entityId}</td>
                                        <td style={{ padding: '12px' }}>
                                            <span style={{
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                fontSize: '0.7rem',
                                                background: log.success ? '#dcfce7' : '#fee2e2',
                                                color: log.success ? '#166534' : '#991b1b',
                                                fontWeight: 800
                                            }}>
                                                {log.success ? 'SUCCESS' : 'FAILED'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px', color: '#64748b' }}>{log.executionTime}ms</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {auditLogs.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No logs yet</div>}
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
