import React, { useState, useEffect } from 'react';
import { useAutomatedActions } from '../context/AutomatedActionsContext';

const CreateAutomatedActionModal = ({ isOpen, onClose, editData }) => {
    const { addAction } = useAutomatedActions();
    const [formData, setFormData] = useState({
        name: '',
        targetModule: 'leads',
        actionType: 'update_field',
        invokedByTrigger: '',
        isActive: true,
        fieldMapping: {},
        rollbackPolicy: 'Manual'
    });

    useEffect(() => {
        if (editData) setFormData(editData);
    }, [editData]);

    if (!isOpen) return null;

    const modules = ['Leads', 'Contacts', 'Activities', 'Communication', 'Inventory', 'Deals', 'Post Sale'];

    // Safety Restrictions Map for UI
    const restrictionMap = {
        Inventory: ['update_field', 'lock_inventory', 'unlock_inventory'],
        Deals: ['update_field', 'send_notification', 'create_record'],
        Leads: ['update_field', 'create_record', 'add_tag', 'send_notification'],
        Activities: ['update_field', 'create_record'],
        Other: ['update_field', 'send_notification', 'create_record']
    };

    const actionTypes = [
        { value: 'update_field', label: 'Update Field' },
        { value: 'create_record', label: 'Create Record' },
        { value: 'add_tag', label: 'Add/Remove Tag' },
        { value: 'send_notification', label: 'Send Notification' },
        { value: 'lock_inventory', label: 'Lock Inventory' },
        { value: 'unlock_inventory', label: 'Unlock Inventory' }
    ];

    const handleSave = () => {
        addAction(formData);
        onClose();
    };

    const isActionAllowed = (type) => {
        const allowed = restrictionMap[formData.targetModule] || restrictionMap.Other;
        return allowed.includes(type);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
            <div style={{ background: '#fff', width: '600px', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                {/* Header */}
                <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>{editData ? 'Edit Automated Action' : 'Create Automated Action'}</h3>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>Define system-controlled repetitive tasks.</p>
                    </div>
                    <i className="fas fa-times" style={{ cursor: 'pointer', color: '#94a3b8' }} onClick={onClose}></i>
                </div>

                {/* Body */}
                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>Action Name</label>
                        <input
                            type="text"
                            placeholder="e.g. Lock House on Booking"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem' }}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>Target Module</label>
                            <select
                                value={formData.targetModule}
                                onChange={e => setFormData({ ...formData, targetModule: e.target.value })}
                                style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem' }}
                            >
                                {modules.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>Action Type</label>
                            <select
                                value={formData.actionType}
                                onChange={e => setFormData({ ...formData, actionType: e.target.value })}
                                style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem' }}
                            >
                                {actionTypes.map(at => (
                                    <option key={at.value} value={at.value} disabled={!isActionAllowed(at.value)}>
                                        {at.label} {!isActionAllowed(at.value) && '(Restricted)'}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>Invoked By Trigger (ID)</label>
                        <input
                            type="text"
                            placeholder="e.g. trigger_deal_booked"
                            value={formData.invokedByTrigger}
                            onChange={e => setFormData({ ...formData, invokedByTrigger: e.target.value })}
                            style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem' }}
                        />
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.7rem', color: '#94a3b8' }}>Automated actions cannot run without a trigger.</p>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b', marginBottom: '8px' }}>
                            <i className="fas fa-shield-alt" style={{ color: 'var(--primary-color)' }}></i>
                            <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>Safety Governance</span>
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.75rem', color: '#64748b' }}>
                            <li>Will not bypass Field Rules.</li>
                            <li>Critical financial fields are read-only for this engine.</li>
                            <li>Full audit trail will be generated in real-time.</li>
                        </ul>
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '20px 24px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button onClick={onClose} style={{ padding: '10px 20px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} style={{ padding: '10px 24px', background: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
                        {editData ? 'Update Action' : 'Save Action'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateAutomatedActionModal;
