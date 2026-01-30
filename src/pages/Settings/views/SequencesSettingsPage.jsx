import React, { useState } from 'react';
import { useSequences } from '../../../context/SequenceContext';
import CreateSequenceModal from '../../../components/CreateSequenceModal';

const SequencesSettingsPage = () => {
    const { sequences, toggleSequence, deleteSequence, updateSequence, getEnrollmentCount, enrollments } = useSequences();
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingSequence, setEditingSequence] = useState(null);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [sequenceToDelete, setSequenceToDelete] = useState(null);
    const [filterStatus, setFilterStatus] = useState('all'); // all, active, paused
    const [sortBy, setSortBy] = useState('name'); // name, enrolled, created
    const [sortOrder, setSortOrder] = useState('asc'); // asc, desc

    // Calculate real stats
    const totalEnrolled = enrollments.filter(e => e.status === 'active').length;
    const totalCompleted = enrollments.filter(e => e.status === 'completed').length;
    const completionRate = enrollments.length > 0 ? Math.round((totalCompleted / enrollments.length) * 100) : 0;

    // Filter and sort sequences
    let filteredSequences = sequences.filter(s => {
        const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = filterStatus === 'all' ||
            (filterStatus === 'active' && s.active) ||
            (filterStatus === 'paused' && !s.active);
        return matchesSearch && matchesStatus;
    });

    // Sort sequences
    filteredSequences.sort((a, b) => {
        let comparison = 0;
        if (sortBy === 'name') {
            comparison = a.name.localeCompare(b.name);
        } else if (sortBy === 'enrolled') {
            comparison = getEnrollmentCount(a.id) - getEnrollmentCount(b.id);
        } else if (sortBy === 'created') {
            comparison = new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
        }
        return sortOrder === 'asc' ? comparison : -comparison;
    });

    const handleEdit = (seq) => {
        setEditingSequence(seq);
        setIsEditModalOpen(true);
    };

    const handleDelete = (seq) => {
        setSequenceToDelete(seq);
        setIsDeleteConfirmOpen(true);
    };

    const confirmDelete = () => {
        if (sequenceToDelete) {
            const result = deleteSequence(sequenceToDelete.id);
            if (!result.success) {
                alert(result.message);
            }
        }
        setIsDeleteConfirmOpen(false);
        setSequenceToDelete(null);
    };

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#111827' }}>Sequences</h2>
                    <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '14px' }}>
                        Automate follow-up activities based on time and triggers.
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
                    <i className="fas fa-plus"></i> Create Sequence
                </button>
            </div>

            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                {[
                    { label: 'Active Sequences', value: sequences.filter(s => s.active).length, icon: 'fa-play', color: '#3b82f6' },
                    { label: 'Total Enrolled', value: totalEnrolled, icon: 'fa-users', color: '#10b981' },
                    { label: 'Completion Rate', value: `${completionRate}%`, icon: 'fa-check-circle', color: '#8b5cf6' },
                    { label: 'Total Sequences', value: sequences.length, icon: 'fa-list', color: '#f59e0b' }
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

            {/* Search and Filters */}
            <div style={{ marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                    <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}></i>
                    <input
                        type="text"
                        placeholder="Search sequences..."
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
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    style={{ padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                >
                    <option value="all">All Status</option>
                    <option value="active">Active Only</option>
                    <option value="paused">Paused Only</option>
                </select>
                <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    style={{ padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                >
                    <option value="name">Sort by Name</option>
                    <option value="enrolled">Sort by Enrolled</option>
                    <option value="created">Sort by Created</option>
                </select>
                <button
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    style={{ padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff', cursor: 'pointer' }}
                >
                    <i className={`fas fa-sort-${sortOrder === 'asc' ? 'up' : 'down'}`}></i>
                </button>
            </div>

            {/* Sequence Table */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                        <tr>
                            <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Sequence Name</th>
                            <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Trigger</th>
                            <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Steps</th>
                            <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Enrolled</th>
                            <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Status</th>
                            <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredSequences.map((seq) => (
                            <tr key={seq.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                <td style={{ padding: '16px' }}>
                                    <div style={{ fontWeight: '600', color: '#111827' }}>{seq.name}</div>
                                    <div style={{ fontSize: '12px', color: '#6b7280' }}>Purpose: {seq.purpose}</div>
                                </td>
                                <td style={{ padding: '16px' }}>
                                    <span style={{ fontSize: '13px', color: '#374151', background: '#f3f4f6', padding: '4px 8px', borderRadius: '4px' }}>
                                        {seq.trigger.type}
                                    </span>
                                </td>
                                <td style={{ padding: '16px' }}>
                                    <div style={{ fontSize: '13px', color: '#374151' }}>{seq.steps.length} Steps</div>
                                </td>
                                <td style={{ padding: '16px' }}>
                                    <div style={{ fontSize: '13px', color: '#374151', fontWeight: '600' }}>
                                        {getEnrollmentCount(seq.id)} Active
                                    </div>
                                </td>
                                <td style={{ padding: '16px' }}>
                                    <button
                                        onClick={() => toggleSequence(seq.id)}
                                        style={{
                                            padding: '4px 12px',
                                            borderRadius: '20px',
                                            fontSize: '12px',
                                            fontWeight: '600',
                                            border: 'none',
                                            cursor: 'pointer',
                                            background: seq.active ? '#dcfce7' : '#fee2e2',
                                            color: seq.active ? '#166534' : '#991b1b'
                                        }}
                                    >
                                        {seq.active ? 'Active' : 'Paused'}
                                    </button>
                                </td>
                                <td style={{ padding: '16px' }}>
                                    <div style={{ display: 'flex', gap: '12px', color: '#9ca3af' }}>
                                        <i
                                            className="fas fa-edit"
                                            style={{ cursor: 'pointer', transition: 'color 0.2s' }}
                                            onClick={() => handleEdit(seq)}
                                            onMouseEnter={(e) => e.target.style.color = '#3b82f6'}
                                            onMouseLeave={(e) => e.target.style.color = '#9ca3af'}
                                            title="Edit Sequence"
                                        ></i>
                                        <i
                                            className="fas fa-copy"
                                            style={{ cursor: 'pointer', transition: 'color 0.2s' }}
                                            onClick={() => {
                                                const duplicate = { ...seq, name: `${seq.name} (Copy)`, id: undefined };
                                                setEditingSequence(duplicate);
                                                setIsEditModalOpen(true);
                                            }}
                                            onMouseEnter={(e) => e.target.style.color = '#10b981'}
                                            onMouseLeave={(e) => e.target.style.color = '#9ca3af'}
                                            title="Duplicate Sequence"
                                        ></i>
                                        <i
                                            className="fas fa-trash-alt"
                                            style={{ cursor: 'pointer', transition: 'color 0.2s' }}
                                            onClick={() => handleDelete(seq)}
                                            onMouseEnter={(e) => e.target.style.color = '#ef4444'}
                                            onMouseLeave={(e) => e.target.style.color = '#9ca3af'}
                                            title="Delete Sequence"
                                        ></i>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Empty State */}
                {filteredSequences.length === 0 && (
                    <div style={{ padding: '60px 20px', textAlign: 'center', color: '#9ca3af' }}>
                        <i className="fas fa-inbox" style={{ fontSize: '48px', marginBottom: '16px', display: 'block' }}></i>
                        <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>No sequences found</div>
                        <div style={{ fontSize: '14px' }}>
                            {searchTerm ? 'Try adjusting your search or filters' : 'Create your first sequence to get started'}
                        </div>
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            <CreateSequenceModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
            />

            {isEditModalOpen && (
                <CreateSequenceModal
                    isOpen={isEditModalOpen}
                    onClose={() => {
                        setIsEditModalOpen(false);
                        setEditingSequence(null);
                    }}
                    editData={editingSequence}
                />
            )}

            {/* Delete Confirmation Modal */}
            {isDeleteConfirmOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', maxWidth: '400px', width: '90%' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: '700' }}>Delete Sequence?</h3>
                        <p style={{ margin: '0 0 24px', color: '#6b7280', fontSize: '14px' }}>
                            Are you sure you want to delete <strong>{sequenceToDelete?.name}</strong>? This action cannot be undone.
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

export default SequencesSettingsPage;
