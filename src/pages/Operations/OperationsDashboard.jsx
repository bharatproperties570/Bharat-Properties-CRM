/**
 * OperationsDashboard — Full Operations Center page.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, Server, RefreshCw, Upload, Download } from 'lucide-react';
import { useOperationsContext } from '../../context/OperationsContext';
import {
  useOperations, useWorkerHealth, useQueueHealth, useAlerts,
} from '../../hooks/useOperations';
import StatusBadge from '../../components/Operations/StatusBadge';
import ProgressBar from '../../components/Operations/ProgressBar';
import ChannelIcon, { getChannelLabel } from '../../components/Operations/ChannelIcon';
import AlertCard from '../../components/Operations/AlertCard';

const STATUS_OPTIONS = ['all', 'processing', 'running', 'queued', 'completed', 'failed', 'paused', 'cancelled', 'stalled'];
const CATEGORY_OPTIONS = ['all', 'communication', 'marketing', 'property_distribution', 'ai', 'import', 'export', 'system'];

function elapsed(d) {
  if (!d) return '-';
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d`;
}

export default function OperationsDashboard() {
  const nav = useNavigate();
  const { summary, isConnected } = useOperationsContext();
  const [filters, setFilters] = useState({ status: 'all', category: 'all', page: 1, limit: 20 });

  const queryFilters = {};
  if (filters.status !== 'all') queryFilters.status = filters.status;
  if (filters.category !== 'all') queryFilters.category = filters.category;
  queryFilters.page = filters.page;
  queryFilters.limit = filters.limit;

  const { data: opsResult, isLoading } = useOperations(queryFilters);
  const { data: workersData } = useWorkerHealth();
  const { data: queueData } = useQueueHealth();
  const { data: alertsData } = useAlerts({ limit: 5 });

  const ops = opsResult?.data || [];
  const pagination = opsResult?.pagination || {};
  const workers = Array.isArray(workersData) ? workersData : workersData?.workers || [];
  const queues = Array.isArray(queueData) ? queueData : queueData?.queues || [];
  const alerts = Array.isArray(alertsData) ? alertsData : alertsData?.data || [];

  const statCards = [
    { label: 'Active', value: summary.active, color: '#3b82f6', icon: Activity },
    { label: 'Queued', value: summary.queued, color: '#6b7280', icon: RefreshCw },
    { label: 'Completed', value: summary.completed, color: '#22c55e', icon: Activity },
    { label: 'Failed', value: summary.failed, color: '#ef4444', icon: AlertTriangle },
    { label: 'Attention', value: summary.attention ?? 0, color: '#f59e0b', icon: AlertTriangle },
  ];

  const selectStyle = {
    padding: '6px 10px', fontSize: 12, borderRadius: 6,
    border: '1px solid var(--border-color)', background: 'var(--bg-primary)',
    color: 'var(--text-primary)', cursor: 'pointer',
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Operations Center
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Live monitoring of all background operations
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: isConnected ? '#22c55e' : '#ef4444',
            boxShadow: isConnected ? '0 0 6px #22c55e60' : undefined,
          }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {isConnected ? 'Live Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
        {statCards.map(s => (
          <div key={s.label} style={{
            padding: '16px', borderRadius: 10, background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <s.icon size={16} color={s.color} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.label}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value ?? 0}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap',
        padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 10,
        border: '1px solid var(--border-color)',
      }}>
        <select
          value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))}
          style={selectStyle}
        >
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <select
          value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value, page: 1 }))}
          style={selectStyle}
        >
          {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c.replace(/_/g, ' ').replace(/\b\w/g, x => x.toUpperCase())}</option>)}
        </select>
      </div>

      {/* Operations table */}
      <div style={{
        borderRadius: 10, border: '1px solid var(--border-color)',
        overflow: 'hidden', marginBottom: 24, background: 'var(--bg-primary)',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
              {['Channel', 'Name', 'Status', 'Progress', 'Processed', 'Elapsed', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</td></tr>
            )}
            {!isLoading && ops.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No operations found</td></tr>
            )}
            {ops.map(op => {
              const p = op.progress || {};
              const pct = p.percentage ?? (p.total ? Math.round((p.processed / p.total) * 100) : 0);
              return (
                <tr
                  key={op._id}
                  onClick={() => nav(`/operations/${op._id}`)}
                  style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '10px 14px' }}><ChannelIcon channel={op.channel || op.category} size={18} /></td>
                  <td style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--text-primary)', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {op.name || 'Untitled'}
                  </td>
                  <td style={{ padding: '10px 14px' }}><StatusBadge status={op.status} /></td>
                  <td style={{ padding: '10px 14px', minWidth: 120 }}>
                    <ProgressBar value={pct} status={op.status} size="sm" showLabel />
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
                    {p.processed ?? 0}/{p.total ?? 0}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>{elapsed(op.createdAt)}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--primary-color)', fontWeight: 500 }}>View →</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
          {Array.from({ length: Math.min(pagination.totalPages, 10) }, (_, i) => i + 1).map(p => (
            <button
              key={p} onClick={() => setFilters(f => ({ ...f, page: p }))}
              style={{
                padding: '6px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                border: '1px solid var(--border-color)',
                background: filters.page === p ? 'var(--primary-color)' : 'var(--bg-primary)',
                color: filters.page === p ? '#fff' : 'var(--text-primary)',
                fontWeight: filters.page === p ? 600 : 400,
              }}
            >{p}</button>
          ))}
        </div>
      )}

      {/* Bottom grid: workers, queues, alerts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        {/* Workers */}
        <div style={{ borderRadius: 10, border: '1px solid var(--border-color)', overflow: 'hidden', background: 'var(--bg-primary)' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Server size={14} color="var(--text-muted)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Workers</span>
          </div>
          {workers.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>No workers</div>
          ) : workers.map(w => (
            <div key={w.workerName || w._id} style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: w.status === 'healthy' ? '#22c55e' : w.status === 'degraded' ? '#f59e0b' : '#ef4444' }} />
              <span style={{ flex: 1, color: 'var(--text-primary)' }}>{w.workerName}</span>
              <span style={{ color: 'var(--text-muted)' }}>{w.queue}</span>
            </div>
          ))}
        </div>

        {/* Queues */}
        <div style={{ borderRadius: 10, border: '1px solid var(--border-color)', overflow: 'hidden', background: 'var(--bg-primary)' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <RefreshCw size={14} color="var(--text-muted)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Queue Health</span>
          </div>
          {queues.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>No queue data</div>
          ) : queues.map(q => (
            <div key={q.name} style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-color)', fontSize: 12 }}>
              <div style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>{q.name}</div>
              <div style={{ display: 'flex', gap: 10, color: 'var(--text-muted)' }}>
                <span>W: {q.waiting ?? 0}</span>
                <span>A: {q.active ?? 0}</span>
                <span style={{ color: '#22c55e' }}>C: {q.completed ?? 0}</span>
                <span style={{ color: '#ef4444' }}>F: {q.failed ?? 0}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Recent alerts */}
        <div style={{ borderRadius: 10, border: '1px solid var(--border-color)', overflow: 'hidden', background: 'var(--bg-primary)' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={14} color="var(--text-muted)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Recent Alerts</span>
          </div>
          {alerts.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>No alerts</div>
          ) : alerts.slice(0, 5).map(a => <AlertCard key={a._id} alert={a} />)}
        </div>
      </div>
    </div>
  );
}
