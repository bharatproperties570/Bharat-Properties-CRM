import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../../../utils/api';
import { DataTable } from '../../../components/ui/DataTable/DataTable';
import { renderValue } from '../../../utils/renderUtils';

const ProjectLeadsTab = ({ projectId, projectName, onNavigate }) => {
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sourceDist, setSourceDist] = useState([]);
    const [statusDist, setStatusDist] = useState([]);
    const [totalCount, setTotalCount] = useState(0);

    const fetchLeads = useCallback(async () => {
        if (!projectId) return;
        setLoading(true);
        try {
            const res = await api.get(`projects/${projectId}/leads?limit=100`);
            if (res.data?.success) {
                setLeads(res.data.data || []);
                setTotalCount(res.data.totalCount || 0);
                setSourceDist(res.data.sourceDistribution || []);
                setStatusDist(res.data.statusDistribution || []);
            }
        } catch (err) {
            console.error("Failed to load project leads:", err);
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        fetchLeads();
    }, [fetchLeads]);

    const leadColumns = useMemo(() => [
        {
            header: 'Lead Name & ID',
            accessor: 'name',
            render: (lead) => (
                <div>
                    <div 
                        onClick={(e) => {
                            e.stopPropagation();
                            if (onNavigate) onNavigate('lead-detail', lead._id || lead.id);
                        }}
                        style={{ 
                            fontWeight: 800, 
                            color: 'var(--primary, #3b82f6)', 
                            fontSize: '0.85rem', 
                            cursor: 'pointer',
                            textDecoration: 'underline'
                        }}
                        title="Open Lead Dossier"
                    >
                        {lead.name || 'Unnamed Lead'}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        #{lead.leadId || (lead._id ? lead._id.substring(lead._id.length - 6).toUpperCase() : 'LEAD')}
                    </div>
                </div>
            )
        },
        {
            header: 'Contact Information',
            accessor: 'phone',
            render: (lead) => (
                <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.8rem' }}>
                        {lead.phone || lead.mobile || '--'}
                    </div>
                    {lead.email && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {lead.email}
                        </div>
                    )}
                </div>
            )
        },
        {
            header: 'Acquisition Source',
            accessor: 'source',
            render: (lead) => (
                <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '6px',
                    background: 'var(--bg-gray)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-main)'
                }}>
                    <i className="fas fa-bullhorn" style={{ marginRight: '4px', opacity: 0.6 }}></i>
                    {renderValue(lead.source) || 'Direct / Walk-in'}
                </span>
            )
        },
        {
            header: 'Funnel Stage',
            accessor: 'status',
            render: (lead) => {
                const statusName = typeof lead.status === 'object' && lead.status?.lookup_value
                    ? lead.status.lookup_value
                    : (renderValue(lead.status) || 'New');
                
                const isHot = statusName.toLowerCase().includes('hot') || statusName.toLowerCase().includes('negotiation');
                const isWon = statusName.toLowerCase().includes('won') || statusName.toLowerCase().includes('closed');

                return (
                    <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: isWon ? '#dcfce7' : (isHot ? '#fee2e2' : '#eff6ff'),
                        color: isWon ? '#166534' : (isHot ? '#991b1b' : '#1d4ed8')
                    }}>
                        {statusName}
                    </span>
                );
            }
        },
        {
            header: 'Relationship Manager',
            accessor: 'assignedTo',
            render: (lead) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: '#3b82f6',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.65rem',
                        fontWeight: 700
                    }}>
                        {(lead.assignedTo?.fullName || lead.assignedTo?.name || 'U')[0]}
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-main)' }}>
                        {lead.assignedTo?.fullName || lead.assignedTo?.name || 'Unassigned'}
                    </span>
                </div>
            )
        },
        {
            header: 'Last Touchpoint',
            accessor: 'updatedAt',
            align: 'right',
            render: (lead) => (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    {lead.updatedAt ? new Date(lead.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '--'}
                </span>
            )
        }
    ], [onNavigate]);

    const tableData = useMemo(() => {
        return leads.map((item, idx) => ({
            ...item,
            id: item._id || `lead-${idx}`
        }));
    }, [leads]);

    return (
        <div className="project-leads-tab" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Top Insight Strip */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                background: 'var(--bg-card)',
                padding: '14px 20px',
                borderRadius: '12px',
                border: '1px solid var(--border-color)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        background: 'rgba(245, 158, 11, 0.1)',
                        color: '#d97706',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1rem'
                    }}>
                        <i className="fas fa-users-line"></i>
                    </div>
                    <div>
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 900, color: 'var(--text-main)' }}>
                            Interested Buyers & Prospects ({totalCount})
                        </h4>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            Leads with matching preference for {projectName || 'this project'}
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {sourceDist.slice(0, 4).map((s, idx) => (
                        <span 
                            key={idx}
                            style={{
                                fontSize: '0.65rem',
                                padding: '3px 8px',
                                borderRadius: '12px',
                                background: 'var(--bg-gray)',
                                border: '1px solid var(--border-color)',
                                color: 'var(--text-main)',
                                fontWeight: 700
                            }}
                        >
                            {s.source || 'Direct'}: {s.count}
                        </span>
                    ))}
                    <button
                        onClick={fetchLeads}
                        style={{
                            padding: '4px 10px',
                            background: 'transparent',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            fontSize: '0.75rem'
                        }}
                        title="Refresh Leads Pool"
                    >
                        <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
                    </button>
                </div>
            </div>

            {/* Leads Table */}
            <div style={{
                background: 'var(--bg-card)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
                <DataTable
                    columns={leadColumns}
                    data={tableData}
                    keyField="id"
                    loading={loading}
                    emptyMessage={
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            <i className="fas fa-user-slash" style={{ fontSize: '2rem', marginBottom: '12px', opacity: 0.5, display: 'block' }}></i>
                            No buyer leads tagged to this project yet. Use Marketing Hub to broadcast inventory.
                        </div>
                    }
                />
            </div>
        </div>
    );
};

export default ProjectLeadsTab;
