import React, { useState, useEffect } from 'react';
import { useUserContext } from '../context/UserContext';
import { getInitials } from '../utils/helpers';
import Toast from './Toast';

const CreateTeamModal = ({ isOpen, onClose, onSave, team, isEdit }) => {
    const { users, addTeam, updateTeam } = useUserContext();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [manager, setManager] = useState('');
    const [department, setDepartment] = useState('sales');
    const [parentTeam, setParentTeam] = useState('');
    const [selectedMembers, setSelectedMembers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            if (isEdit && team) {
                setName(team.name || '');
                setDescription(team.description || '');
                setManager(team.manager?._id || team.manager || '');
                setDepartment(team.department || 'sales');
                setParentTeam(team.parentTeam?._id || team.parentTeam || '');

                // Pre-select members based on current team assignment
                // Note: This relies on 'users' being loaded in context and having 'team' populated/set
                const currentMembers = users.filter(u =>
                    (u.team?._id === team._id) || (u.team === team._id)
                ).map(u => u._id);
                setSelectedMembers(currentMembers);
            } else {
                setName('');
                setDescription('');
                setManager('');
                setDepartment('sales');
                setParentTeam('');
                setSelectedMembers([]);
            }
            setError('');
        }
    }, [isOpen, isEdit, team, users]);

    const toggleMember = (userId) => {
        setSelectedMembers(prev => {
            if (prev.includes(userId)) {
                return prev.filter(id => id !== userId);
            } else {
                return [...prev, userId];
            }
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!name.trim()) {
            setError('Team name is required');
            return;
        }

        setLoading(true);
        setError('');

        const teamData = {
            name,
            description,
            manager: manager || null,
            department,
            parentTeam: parentTeam || null,
            members: selectedMembers
        };

        try {
            let result;
            if (isEdit && team?._id) {
                result = await updateTeam(team._id, teamData);
            } else {
                result = await addTeam(teamData);
            }

            if (result.success) {
                if (onSave) onSave(result.data);
                onClose();
            } else {
                setError(result.error || 'Failed to save team');
            }
        } catch (err) {
            console.error(err);
            setError('An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    // Filter potential managers (users with role 'Manager' or similar could be filtered here if needed)
    // For now, allow any user to be manager
    const potentialManagers = users.filter(u =>
        u.isActive &&
        (department === 'all' || u.department === department)
    );

    // Filter available members (exclude users already in other teams UNLESS they are in this team)
    const availableMembers = users.filter(u => {
        // Include if user has no team
        if (!u.team) return true;
        // Include if user is already in THIS team
        if (team && (u.team._id === team._id || u.team === team._id)) return true;
        // Otherwise (user in another team), exclude or show as disabled?
        // Let's show all but indicate if they are in another team in UI
        return true;
    });

    const departments = [
        { id: 'sales', name: 'Sales' },
        { id: 'marketing', name: 'Marketing' },
        { id: 'inventory', name: 'Inventory' },
        { id: 'accounts', name: 'Accounts' }
    ];

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
        }}>
            <div style={{
                background: '#fff',
                width: '500px',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
                maxHeight: '90vh'
            }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                        {isEdit ? 'Edit Team' : 'Create New Team'}
                    </h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                        {isEdit ? 'Update team details' : 'Define a new team and assign a manager'}
                    </p>
                </div>

                <div style={{ padding: '24px', overflowY: 'auto' }}>
                    {error && (
                        <div style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#dc2626', fontSize: '0.85rem', marginBottom: '16px' }}>
                            {error}
                        </div>
                    )}

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', marginBottom: '6px' }}>Team Name <span style={{ color: '#ef4444' }}>*</span></label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Alpha Squad"
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
                        />
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Team Members</label>
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', maxHeight: '150px', overflowY: 'auto', padding: '8px' }}>
                            {availableMembers.length > 0 ? (
                                availableMembers.map(user => {
                                    const isSelected = selectedMembers.includes(user._id);
                                    const isInAnotherTeam = user.team && (!team || (user.team._id !== team._id && user.team !== team._id));

                                    return (
                                        <div
                                            key={user._id}
                                            onClick={() => toggleMember(user._id)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                padding: '6px 8px',
                                                cursor: 'pointer',
                                                background: isSelected ? '#f0fdf4' : 'transparent',
                                                borderRadius: '4px',
                                                marginBottom: '2px'
                                            }}
                                        >
                                            <div style={{
                                                width: '16px',
                                                height: '16px',
                                                border: isSelected ? '1px solid #22c55e' : '1px solid #cbd5e1',
                                                borderRadius: '3px',
                                                marginRight: '10px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background: isSelected ? '#22c55e' : '#fff'
                                            }}>
                                                {isSelected && <i className="fas fa-check" style={{ color: '#fff', fontSize: '0.6rem' }}></i>}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '0.85rem', color: '#1e293b' }}>{user.fullName || user.name}</div>
                                                {isInAnotherTeam && (
                                                    <div style={{ fontSize: '0.7rem', color: '#f59e0b' }}>
                                                        Currently in: {user.team.name || 'Another Team'}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div style={{ padding: '8px', color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center' }}>No users available</div>
                            )}
                        </div>
                        <div style={{ marginTop: '4px', fontSize: '0.75rem', color: '#64748b' }}>
                            {selectedMembers.length} member{selectedMembers.length !== 1 && 's'} selected
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', marginBottom: '6px' }}>Department</label>
                            <select
                                value={department}
                                onChange={(e) => setDepartment(e.target.value)}
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem', background: '#fff' }}
                            >
                                {departments.map(dept => (
                                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', marginBottom: '6px' }}>Team Manager</label>
                            <select
                                value={manager}
                                onChange={(e) => setManager(e.target.value)}
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem', background: '#fff' }}
                            >
                                <option value="">Select Manager</option>
                                {potentialManagers.map(user => (
                                    <option key={user._id} value={user._id}>{user.fullName}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', marginBottom: '6px' }}>Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Enter description..."
                            rows="3"
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem', resize: 'none' }}
                        />
                    </div>
                </div>

                <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button
                        onClick={onClose}
                        className="btn-outline"
                        style={{ padding: '8px 20px', borderRadius: '6px', background: '#fff', border: '1px solid #e2e8f0', fontWeight: 600 }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="btn-primary"
                        style={{ padding: '8px 20px', borderRadius: '6px', fontWeight: 700, opacity: loading ? 0.7 : 1 }}
                    >
                        {loading ? 'Saving...' : (isEdit ? 'Update Team' : 'Create Team')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateTeamModal;
