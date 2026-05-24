import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../../utils/api';
import toast from 'react-hot-toast';

function AssignGroupModal({ isOpen, onClose, selectedCompanies, onComplete }) {
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedGroupId, setSelectedGroupId] = useState('');
    const [actionType, setActionType] = useState('add');

    const activeGroupIds = useMemo(() => {
        const ids = new Set();
        if (selectedCompanies && selectedCompanies.length > 0) {
            selectedCompanies.forEach(c => {
                if (c.groups && Array.isArray(c.groups)) {
                    c.groups.forEach(g => {
                        ids.add(typeof g === 'object' ? g._id : g);
                    });
                }
            });
        }
        return ids;
    }, [selectedCompanies]);

    useEffect(() => {
        if (isOpen) {
            fetchGroups();
            setActionType('add');
            setSelectedGroupId('');
        }
    }, [isOpen]);

    const fetchGroups = async () => {
        try {
            const res = await api.get('/company-groups');
            if (res.data && res.data.success) {
                setGroups(res.data.data || []);
            }
        } catch (error) {
            toast.error("Failed to load groups");
        }
    };

    const handleAssign = async () => {
        if (!selectedGroupId) {
            toast.error("Please select a group");
            return;
        }
        setLoading(true);
        try {
            const companyIds = selectedCompanies.map(c => c._id);
            await api.post('/company-groups/bulk-assign', { 
                companyIds: companyIds, 
                groupIds: [selectedGroupId],
                action: actionType
            });
            toast.success(actionType === 'add' ? "Companies assigned to group" : "Companies removed from group");
            onComplete();
            onClose();
        } catch (error) {
            toast.error("Failed to update group");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const overlayStyle = {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
        zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.2s ease-out'
    };

    const modalStyle = {
        backgroundColor: '#fff', borderRadius: '16px',
        width: '450px', maxWidth: '95vw', maxHeight: '90vh',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
    };

    return (
        <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <style>
                {`
                    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                    @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                `}
            </style>
            <div style={modalStyle}>
                <div className="modal-header" style={{ padding: '24px', borderBottom: '1px solid #f1f5f9' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}><i className="fas fa-folder-plus" style={{ color: 'var(--primary-color)', marginRight: '10px' }}></i> Manage Group Assignment</h3>
                    <button className="close-btn" onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
                </div>
                <div className="modal-body" style={{ padding: '24px' }}>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '15px' }}>
                        Updating group assignment for <strong>{selectedCompanies.length}</strong> companies.
                    </p>

                    <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600, color: actionType === 'add' ? 'var(--primary-color)' : '#64748b' }}>
                            <input type="radio" name="actionType" value="add" checked={actionType === 'add'} onChange={() => { setActionType('add'); setSelectedGroupId(''); }} style={{ cursor: 'pointer' }} />
                            Add to Group
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: activeGroupIds.size > 0 ? 'pointer' : 'not-allowed', fontWeight: 600, color: activeGroupIds.size === 0 ? '#cbd5e1' : (actionType === 'remove' ? '#ef4444' : '#64748b') }}>
                            <input type="radio" name="actionType" value="remove" checked={actionType === 'remove'} onChange={() => { setActionType('remove'); setSelectedGroupId(''); }} style={{ cursor: activeGroupIds.size > 0 ? 'pointer' : 'not-allowed' }} disabled={activeGroupIds.size === 0} />
                            Remove from Group
                        </label>
                    </div>

                    <div className="form-group">
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: '5px', display: 'block' }}>Select Group</label>
                        <select 
                            className="form-control"
                            value={selectedGroupId}
                            onChange={e => setSelectedGroupId(e.target.value)}
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                        >
                            <option value="">-- Choose Group --</option>
                            {groups.map(g => {
                                const isAssigned = activeGroupIds.has(g._id);
                                const isDisabled = actionType === 'remove' && !isAssigned;
                                return (
                                    <option 
                                        key={g._id} 
                                        value={g._id} 
                                        disabled={isDisabled}
                                        style={{ color: isDisabled ? '#94a3b8' : 'inherit' }}
                                    >
                                        {g.name} ({g.category}){isDisabled ? ' (Not Assigned)' : ''}
                                    </option>
                                );
                            })}
                        </select>
                    </div>
                </div>
                <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button className="btn-outline" onClick={onClose} style={{ padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', border: '1px solid #cbd5e1', background: '#fff' }}>Cancel</button>
                    <button className="btn-primary" onClick={handleAssign} disabled={loading} style={{ padding: '10px 24px', borderRadius: '8px', background: actionType === 'remove' ? '#ef4444' : 'var(--primary-color)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>
                        {loading ? <i className="fas fa-spinner fa-spin"></i> : actionType === 'remove' ? "Remove" : "Assign Now"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default AssignGroupModal;
