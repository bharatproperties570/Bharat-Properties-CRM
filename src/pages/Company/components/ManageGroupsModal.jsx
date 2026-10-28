import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../../utils/api';
import { useCompanyGroups, useAddCompanyGroupMutation, useDeleteCompanyGroupMutation } from '../../../utils/crmHooks';
import { DataTable } from '../../../components/ui/DataTable/DataTable';

import toast from 'react-hot-toast';

function ManageGroupsModal({ isOpen, onClose }) {
    const { data: groups = [], isLoading: loading } = useCompanyGroups();
    const addGroupMutation = useAddCompanyGroupMutation();
    const deleteGroupMutation = useDeleteCompanyGroupMutation();
    const [newGroup, setNewGroup] = useState({ name: '', description: '', category: 'Broker', color: '#6366f1' });

    

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            const res = await addGroupMutation.mutateAsync(newGroup);
            if (res && res.success) {
                toast.success("Group created");
                setNewGroup({ name: '', description: '', category: 'Broker', color: '#6366f1' });
            }
        } catch (error) {
            toast.error("Failed to create group");
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure?")) return;
        try {
            await deleteGroupMutation.mutateAsync(id);
            toast.success("Group deleted");
        } catch (error) {
            toast.error("Failed to delete group");
        }
    };

    const groupData = useMemo(() => {
        return (groups || []).map((group, idx) => ({
            ...group,
            id: group._id || group.id || `company-group-${idx}`
        }));
    }, [groups]);

    const groupColumns = useMemo(() => [
        {
            key: 'name',
            header: 'NAME',
            headerStyle: { textAlign: 'left', padding: '12px', fontSize: '0.75rem', color: '#64748b' },
            cellStyle: { padding: '12px' },
            render: (group) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 600 }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: group.color || '#6366f1', flexShrink: 0 }}></span>
                    <span>{group.name}</span>
                </div>
            )
        },
        {
            key: 'category',
            header: 'CATEGORY',
            headerStyle: { textAlign: 'left', padding: '12px', fontSize: '0.75rem', color: '#64748b' },
            cellStyle: { padding: '12px', fontSize: '0.8rem', color: '#64748b' },
            render: (group) => group.category || '-'
        },
        {
            key: 'action',
            header: 'ACTION',
            headerStyle: { textAlign: 'right', padding: '12px', fontSize: '0.75rem', color: '#64748b' },
            cellStyle: { padding: '12px', textAlign: 'right' },
            render: (group) => (
                <button
                    className="btn-icon danger"
                    onClick={() => handleDelete(group._id || group.id)}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                    title="Delete Group"
                    aria-label={`Delete group ${group.name}`}
                >
                    <i className="fas fa-trash"></i>
                </button>
            )
        }
    ], []);

    if (!isOpen) return null;

    const overlayStyle = {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
        zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.2s ease-out'
    };

    const modalStyle = {
        backgroundColor: '#fff', borderRadius: '16px',
        width: '600px', maxWidth: '95vw', maxHeight: '90vh',
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
                <div className="modal-header" style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}><i className="fas fa-layer-group" style={{ color: 'var(--primary-color)', marginRight: '10px' }}></i> Manage Broker Groups</h3>
                    <button className="close-btn" onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
                </div>
                <div className="modal-body" style={{ padding: '24px', overflowY: 'auto' }}>
                    {/* Create New Group */}
                    <form onSubmit={handleCreate} style={{ background: '#f8fafc', padding: '15px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: '5px', display: 'block' }}>Group Name</label>
                                <input 
                                    type="text" 
                                    className="form-control" 
                                    value={newGroup.name} 
                                    onChange={e => setNewGroup({...newGroup, name: e.target.value})} 
                                    placeholder="e.g. Premium Brokers"
                                    required
                                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: '5px', display: 'block' }}>Color</label>
                                <input 
                                    type="color" 
                                    className="form-control" 
                                    style={{ height: '38px', padding: '2px', width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                                    value={newGroup.color} 
                                    onChange={e => setNewGroup({...newGroup, color: e.target.value})} 
                                />
                            </div>
                            <button className="btn-primary" type="submit" style={{ padding: '8px 16px', borderRadius: '6px', background: 'var(--primary-color)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Add</button>
                        </div>
                    </form>

                    {/* Groups List */}
                    <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: '8px' }}>
                        {loading ? <div className="text-center p-4"><i className="fas fa-spinner fa-spin"></i></div> : (
                            <DataTable
                                columns={groupColumns}
                                data={groupData}
                                keyField="id"
                                emptyMessage="No groups created yet"
                            />
                        )}
                    </div>
                </div>
                <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn-outline" onClick={onClose} style={{ padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', border: '1px solid #cbd5e1', background: '#fff' }}>Close</button>
                </div>
            </div>
        </div>
    );
}

export default ManageGroupsModal;
