/**
 * OperationDetailPage — Detailed view of a single operation.
 */
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pause, Play, X, RotateCcw, Clock, User, Hash } from 'lucide-react';
import {
  useOperation, useOperationEvents, usePauseOperation,
  useResumeOperation, useCancelOperation, useRetryOperation,
} from '../../hooks/useOperations';
import StatusBadge from '../../components/Operations/StatusBadge';
import ProgressBar from '../../components/Operations/ProgressBar';
import ChannelIcon, { getChannelLabel } from '../../components/Operations/ChannelIcon';
import EventTimelineItem from '../../components/Operations/EventTimelineItem';

function elapsed(d) {
  if (!d) return '-';
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString();
}

export default function OperationDetailPage() {
  const { jobId } = useParams();
  const nav = useNavigate();
  const { data: op, isLoading } = useOperation(jobId);
  const { data: eventsData } = useOperationEvents(jobId);
  const pause = usePauseOperation();
  const resume = useResumeOperation();
  const cancel = useCancelOperation();
  const retry = useRetryOperation();

  if (isLoading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>Loading operation...</div>;
  if (!op) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>Operation not found</div>;

  const p = op.progress || {};
  const pct = p.percentage ?? (p.total ? Math.round((p.processed / p.total) * 100) : 0);
  const events = Array.isArray(eventsData) ? eventsData : eventsData?.data || [];
  const status = op.status || 'unknown';

  const actionBtn = (Icon, label, mut, color) => (
    <button
      key={label}
      onClick={() => mut.mutate(op._id)}
      disabled={mut.isPending}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 16px', fontSize: 13, fontWeight: 600,
        borderRadius: 8, border: '1px solid var(--border-color)',
        background: 'var(--bg-primary)', color, cursor: 'pointer',
      }}
    >
      <Icon size={14} />{label}
    </button>
  );

  const metaItem = (icon, label, value) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      {icon}
      <span style={{ color: 'var(--text-muted)', minWidth: 100 }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{value || '-'}</span>
    </div>
  );

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1000, margin: '0 auto' }}>
      {/* Back */}
      <button
        onClick={() => nav('/operations')}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16,
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 13, color: 'var(--primary-color)', fontWeight: 500,
        }}
      >
        <ArrowLeft size={14} /> Back to Operations
      </button>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 24, flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ChannelIcon channel={op.channel || op.category} size={24} />
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {op.name || 'Untitled Operation'}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <StatusBadge status={status} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{getChannelLabel(op.channel)}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(status === 'processing' || status === 'running') && actionBtn(Pause, 'Pause', pause, '#f59e0b')}
          {status === 'paused' && actionBtn(Play, 'Resume', resume, '#3b82f6')}
          {['processing', 'running', 'paused', 'queued'].includes(status) && actionBtn(X, 'Cancel', cancel, '#ef4444')}
          {status === 'failed' && actionBtn(RotateCcw, 'Retry', retry, '#8b5cf6')}
        </div>
      </div>

      {/* Progress section */}
      <div style={{
        padding: 20, borderRadius: 10, background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)', marginBottom: 20,
      }}>
        <div style={{ marginBottom: 12 }}>
          <ProgressBar value={pct} status={status} size="lg" showLabel />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 12 }}>
          {[
            { label: 'Total', val: p.total ?? 0, color: 'var(--text-primary)' },
            { label: 'Processed', val: p.processed ?? 0, color: '#3b82f6' },
            { label: 'Successful', val: p.successful ?? 0, color: '#22c55e' },
            { label: 'Failed', val: p.failed ?? 0, color: '#ef4444' },
            { label: 'Skipped', val: p.skipped ?? 0, color: '#f59e0b' },
            { label: 'Pending', val: (p.pending ?? (p.total - (p.processed || 0))) || 0, color: '#6b7280' },
          ].map(c => (
            <div key={c.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.val}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Metadata */}
      <div style={{
        padding: 16, borderRadius: 10, background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)', marginBottom: 20,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {metaItem(<Hash size={14} color="var(--text-muted)" />, 'Job ID', op._id)}
        {metaItem(<User size={14} color="var(--text-muted)" />, 'Initiated By', op.initiatedBy?.name || op.initiatedBy)}
        {metaItem(<Clock size={14} color="var(--text-muted)" />, 'Created', fmtDate(op.createdAt))}
        {metaItem(<Clock size={14} color="var(--text-muted)" />, 'Started', fmtDate(op.startedAt))}
        {metaItem(<Clock size={14} color="var(--text-muted)" />, 'Completed', fmtDate(op.completedAt))}
        {metaItem(<Clock size={14} color="var(--text-muted)" />, 'Elapsed', elapsed(op.createdAt))}
        {op.operationType && metaItem(<ChannelIcon channel={op.category} size={14} />, 'Type', op.operationType)}
      </div>

      {/* Error section */}
      {op.error && (
        <div style={{
          padding: 16, borderRadius: 10, border: '1px solid #fecaca',
          background: '#fef2f2', marginBottom: 20,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#dc2626', marginBottom: 6 }}>Error Details</div>
          <p style={{ fontSize: 13, color: '#991b1b', margin: 0 }}>{op.error.message}</p>
          {op.error.code && <p style={{ fontSize: 12, color: '#b91c1c', marginTop: 4 }}>Code: {op.error.code}</p>}
          {op.error.category && <p style={{ fontSize: 12, color: '#b91c1c', marginTop: 2 }}>Category: {op.error.category}</p>}
          {op.error.stack && (
            <pre style={{ fontSize: 11, color: '#7f1d1d', marginTop: 8, overflow: 'auto', maxHeight: 200 }}>
              {op.error.stack}
            </pre>
          )}
        </div>
      )}

      {/* Event timeline */}
      <div style={{
        borderRadius: 10, border: '1px solid var(--border-color)',
        background: 'var(--bg-primary)', padding: 20,
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px' }}>
          Execution Timeline ({events.length})
        </h3>
        {events.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No events recorded</div>
        ) : (
          events.map((ev, i) => (
            <EventTimelineItem key={ev._id || i} event={ev} isLast={i === events.length - 1} />
          ))
        )}
      </div>
    </div>
  );
}
