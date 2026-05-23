import React, { useState, useEffect } from 'react';
import { api } from '../../../utils/api';
import toast from 'react-hot-toast';

function AssignGroupModal({ isOpen, onClose, selectedContacts, onComplete }) {
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedGroupId, setSelectedGroupId] = useState('');

    useEffect(() => {
        if (isOpen) fetchGroups();
    }, [isOpen]);

    const fetchGroups = async () => {
        try {
            const res = await api.get('/contact-groups');
            if (res.data && res.data.success) {
                setGroups(res.data.data || []);
            }
        } catch (error) {
            toast.error("Failed to load contact groups");
        }
    };

    const handleAssign = async () => {
        if (!selectedGroupId) {
            toast.error("Please select a group");
            return;
        }
        setLoading(true);
        try {
            const contactIds = selectedContacts.map(c => c._id);
            await api.post('/contact-groups/bulk-assign', { 
                contactIds: contactIds, 
                groupIds: [selectedGroupId],
                action: 'add'
            });
            toast.success("Contacts assigned to group");
            onComplete();
            onClose();
        } catch (error) {
            toast.error("Failed to assign group");
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
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}><i className="fas fa-folder-plus" style={{ color: 'var(--primary-color)', marginRight: '10px' }}></i> Assign to Group</h3>
                    <button className="close-btn" onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
                </div>
                <div className="modal-body" style={{ padding: '24px' }}>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '15px' }}>
                        Assigning <strong>{selectedContacts.length}</strong> contacts to a specific group.
                    </p>
                    <div className="form-group">
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: '5px', display: 'block' }}>Select Group</label>
                        <select 
                            className="form-control"
                            value={selectedGroupId}
                            onChange={e => setSelectedGroupId(e.target.value)}
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                        >
                            <option value="">-- Choose Group --</option>
                            {groups.map(g => (
                                <option key={g._id} value={g._id}>{g.name} ({g.category})</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button className="btn-outline" onClick={onClose} style={{ padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', border: '1px solid #cbd5e1', background: '#fff' }}>Cancel</button>
                    <button className="btn-primary" onClick={handleAssign} disabled={loading} style={{ padding: '10px 24px', borderRadius: '8px', background: 'var(--primary-color)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>
                        {loading ? <i className="fas fa-spinner fa-spin"></i> : "Assign Now"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default AssignGroupModal;
