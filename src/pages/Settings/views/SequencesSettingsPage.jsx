import { useState, useMemo } from 'react';
import { useSequences } from '../../../context/SequenceContext';
import CreateSequenceModal from '../../../components/CreateSequenceModal';
import { DataTable } from '../../../components/ui/DataTable/DataTable';

const SequencesSettingsPage = () => {
    const { sequences = [], toggleSequence, deleteSequence, getEnrollmentCount, enrollments = [] } = useSequences() || {};
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingSequence, setEditingSequence] = useState(null);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [sequenceToDelete, setSequenceToDelete] = useState(null);
    const [filterStatus, setFilterStatus] = useState('all'); // all, active, paused
    const [sortBy, setSortBy] = useState('name'); // name, enrolled, created
    const [sortOrder, setSortOrder] = useState('asc'); // asc, desc

    const safeSequences = Array.isArray(sequences) ? sequences : [];
    const safeEnrollments = Array.isArray(enrollments) ? enrollments : [];

    // Calculate real stats
    const totalEnrolled = safeEnrollments.filter(e => e?.status === 'active').length;
    const totalCompleted = safeEnrollments.filter(e => e?.status === 'completed').length;
    const completionRate = safeEnrollments.length > 0 ? Math.round((totalCompleted / safeEnrollments.length) * 100) : 0;

    // Filter and sort sequences
    let filteredSequences = safeSequences.filter(s => {
        if (!s) return false;
        const name = (s.name || '').toLowerCase();
        const matchesSearch = name.includes((searchTerm || '').toLowerCase());
        const matchesStatus = filterStatus === 'all' ||
            (filterStatus === 'active' && s.active) ||
            (filterStatus === 'paused' && !s.active);
        return matchesSearch && matchesStatus;
    });

    // Sort sequences
    filteredSequences.sort((a, b) => {
        let comparison = 0;
        const seqAId = a?._id || a?.id;
        const seqBId = b?._id || b?.id;
        if (sortBy === 'name') {
            comparison = (a?.name || '').localeCompare(b?.name || '');
        } else if (sortBy === 'enrolled') {
            const countA = typeof getEnrollmentCount === 'function' ? getEnrollmentCount(seqAId) : 0;
            const countB = typeof getEnrollmentCount === 'function' ? getEnrollmentCount(seqBId) : 0;
            comparison = countA - countB;
        } else if (sortBy === 'created') {
            comparison = new Date(a?.createdAt || 0) - new Date(b?.createdAt || 0);
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

    const confirmDelete = async () => {
        if (sequenceToDelete) {
            const targetId = sequenceToDelete._id || sequenceToDelete.id;
            if (typeof deleteSequence === 'function') {
                const result = await deleteSequence(targetId);
                if (result && !result.success) {
                    alert(result.message);
                }
            }
        }
        setIsDeleteConfirmOpen(false);
        setSequenceToDelete(null);
    };

    const columns = useMemo(() => [
        {
            key: 'name',
            header: 'Sequence Name',
            headerStyle: { padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' },
            cellStyle: { padding: '16px' },
            render: (seq) => (
                <div>
                    <div style={{ fontWeight: '600', color: 'var(--text-main)' }}>{seq?.name || 'Untitled Sequence'}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Purpose: {seq?.purpose || 'N/A'}</div>
                </div>
            )
        },
        {
            key: 'trigger',
            header: 'Trigger',
            headerStyle: { padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' },
            cellStyle: { padding: '16px' },
            render: (seq) => {
                const triggerLabel = seq?.trigger?.type
                    || (seq?.linkedTriggers && seq.linkedTriggers.length > 0 ? `${seq.linkedTriggers.length} Linked Triggers` : '')
                    || (seq?.module ? `On ${seq.module} Event` : 'Manual / Event');
                return (
                    <span style={{ fontSize: '13px', color: 'var(--text-main)', background: 'var(--bg-light)', padding: '4px 8px', borderRadius: '4px' }}>
                        {triggerLabel}
                    </span>
                );
            }
        },
        {
            key: 'steps',
            header: 'Steps',
            headerStyle: { padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' },
            cellStyle: { padding: '16px' },
            render: (seq) => {
                const stepsCount = Array.isArray(seq?.steps) ? seq.steps.length : 0;
                return (
                    <div style={{ fontSize: '13px', color: 'var(--text-main)' }}>{stepsCount} Steps</div>
                );
            }
        },
        {
            key: 'enrolled',
            header: 'Enrolled',
            headerStyle: { padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' },
            cellStyle: { padding: '16px' },
            render: (seq) => {
                const seqId = seq?._id || seq?.id;
                const activeCount = typeof getEnrollmentCount === 'function' ? getEnrollmentCount(seqId) : 0;
                return (
                    <div style={{ fontSize: '13px', color: 'var(--text-main)', fontWeight: '600' }}>
                        {activeCount} Active
                    </div>
                );
            }
        },
        {
            key: 'status',
            header: 'Status',
            headerStyle: { padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' },
            cellStyle: { padding: '16px' },
            render: (seq) => {
                const seqId = seq?._id || seq?.id;
                return (
                    <button
                        type="button"
                        onClick={() => typeof toggleSequence === 'function' && toggleSequence(seqId)}
                        style={{
                            padding: '4px 12px',
                            borderRadius: '20px',
                            fontSize: '12px',
                            fontWeight: '600',
                            border: 'none',
                            cursor: 'pointer',
                            background: seq?.active ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: seq?.active ? '#166534' : '#991b1b'
                        }}
                    >
                        {seq?.active ? 'Active' : 'Paused'}
                    </button>
                );
            }
        },
        {
            key: 'actions',
            header: 'Actions',
            headerStyle: { padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' },
            cellStyle: { padding: '16px' },
            render: (seq) => (
                <div style={{ display: 'flex', gap: '12px', color: 'var(--text-muted)' }}>
                    <i
                        className="fas fa-edit"
                        style={{ cursor: 'pointer', transition: 'color 0.2s' }}
                        onClick={() => handleEdit(seq)}
                        onMouseEnter={(e) => e.target.style.color = '#3b82f6'}
                        onMouseLeave={(e) => e.target.style.color = 'var(--text-muted)'}
                        title="Edit Sequence"
                    ></i>
                    <i
                        className="fas fa-copy"
                        style={{ cursor: 'pointer', transition: 'color 0.2s' }}
                        onClick={() => {
                            const duplicate = { ...seq, name: `${seq?.name || 'Sequence'} (Copy)`, id: undefined, _id: undefined };
                            setEditingSequence(duplicate);
                            setIsEditModalOpen(true);
                        }}
                        onMouseEnter={(e) => e.target.style.color = '#10b981'}
                        onMouseLeave={(e) => e.target.style.color = 'var(--text-muted)'}
                        title="Duplicate Sequence"
                    ></i>
                    <i
                        className="fas fa-trash-alt"
                        style={{ cursor: 'pointer', transition: 'color 0.2s' }}
                        onClick={() => handleDelete(seq)}
                        onMouseEnter={(e) => e.target.style.color = '#ef4444'}
                        onMouseLeave={(e) => e.target.style.color = 'var(--text-muted)'}
                        title="Delete Sequence"
                    ></i>
                </div>
            )
        }
    ], [getEnrollmentCount, toggleSequence]);

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: 'var(--text-main)' }}>Sequences</h2>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '14px' }}>
                        Automate follow-up activities based on time and triggers.
                    </p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    style={{
                        padding: '10px 20px',
                        background: '#3b82f6',
                        color: '#ffffff',
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
                    { label: 'Active Sequences', value: safeSequences.filter(s => s?.active).length, icon: 'fa-play', color: '#3b82f6' },
                    { label: 'Total Enrolled', value: totalEnrolled, icon: 'fa-users', color: '#10b981' },
                    { label: 'Completion Rate', value: `${completionRate}%`, icon: 'fa-check-circle', color: '#8b5cf6' },
                    { label: 'Total Sequences', value: safeSequences.length, icon: 'fa-list', color: '#f59e0b' }
                ].map((stat, i) => (
                    <div key={i} style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: '500' }}>{stat.label}</span>
                            <i className={`fas ${stat.icon}`} style={{ color: stat.color }}></i>
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-main)' }}>{stat.value}</div>
                    </div>
                ))}
            </div>

            {/* Search and Filters */}
            <div style={{ marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                    <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}></i>
                    <input
                        type="text"
                        placeholder="Search sequences..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '10px 12px 10px 40px',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            fontSize: '14px',
                            outline: 'none'
                        }}
                    />
                </div>
                <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    style={{ padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                >
                    <option value="all">All Status</option>
                    <option value="active">Active Only</option>
                    <option value="paused">Paused Only</option>
                </select>
                <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    style={{ padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                >
                    <option value="name">Sort by Name</option>
                    <option value="enrolled">Sort by Enrolled</option>
                    <option value="created">Sort by Created</option>
                </select>
                <button
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    style={{ padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-card)', cursor: 'pointer' }}
                >
                    <i className={`fas fa-sort-${sortOrder === 'asc' ? 'up' : 'down'}`}></i>
                </button>
            </div>

            {/* Sequence Table */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
                <DataTable
                    columns={columns}
                    data={filteredSequences}
                    keyField="_id"
                    emptyMessage={
                        <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <i className="fas fa-inbox" style={{ fontSize: '48px', marginBottom: '16px', display: 'block' }}></i>
                            <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>No sequences found</div>
                            <div style={{ fontSize: '14px' }}>
                                {searchTerm ? 'Try adjusting your search or filters' : 'Create your first sequence to get started'}
                            </div>
                        </div>
                    }
                />
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
                    <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '12px', maxWidth: '400px', width: '90%' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: '700' }}>Delete Sequence?</h3>
                        <p style={{ margin: '0 0 24px', color: 'var(--text-muted)', fontSize: '14px' }}>
                            Are you sure you want to delete <strong>{sequenceToDelete?.name}</strong>? This action cannot be undone.
                        </p>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setIsDeleteConfirmOpen(false)}
                                style={{ padding: '10px 20px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                style={{ padding: '10px 20px', background: '#ef4444', color: '#ffffff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}
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
