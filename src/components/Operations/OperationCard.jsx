/**
 * OperationCard — Compact card for a single operation in the drawer.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Pause, Play, X, RotateCcw } from 'lucide-react';
import StatusBadge from './StatusBadge';
import ProgressBar from './ProgressBar';
import ChannelIcon from './ChannelIcon';
import { usePauseOperation, useResumeOperation, useCancelOperation, useRetryOperation } from '../../hooks/useOperations';

function elapsed(d) {
  if (!d) return '-';
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export default function OperationCard({ operation }) {
  const nav = useNavigate();
  const pause = usePauseOperation();
  const resume = useResumeOperation();
  const cancel = useCancelOperation();
  const retry = useRetryOperation();

  const op = operation || {};
  const progress = op.progress || {};
  const pct = progress.percentage ?? (progress.total ? Math.round((progress.processed / progress.total) * 100) : 0);
  const status = op.status || 'unknown';

  const actionBtn = (Icon, label, mut, color) => (
    <button
      key={label}
      onClick={e => { e.stopPropagation(); mut.mutate(op._id); }}
      disabled={mut.isPending}
      title={label}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '3px 8px', fontSize: 11, fontWeight: 500,
        borderRadius: 4, border: '1px solid var(--border-color)',
        background: 'var(--bg-primary)', color, cursor: 'pointer',
      }}
    >
      <Icon size={12} />{label}
    </button>
  );

  return (
    <div
      onClick={() => nav(`/operations/${op._id}`)}
      style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border-color)',
        cursor: 'pointer', transition: 'background 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Row 1: icon + name + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <ChannelIcon channel={op.channel || op.category} size={16} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {op.name || 'Untitled Operation'}
        </span>
        <StatusBadge status={status} />
      </div>

      {/* Row 2: progress */}
      {(status === 'processing' || status === 'running' || status === 'paused') && (
        <div style={{ marginBottom: 6 }}>
          <ProgressBar value={pct} status={status} size="sm" showLabel />
        </div>
      )}

      {/* Row 3: counts + time */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
        {progress.total > 0 && (
          <span>{progress.processed ?? 0}/{progress.total} processed</span>
        )}
        {progress.successful > 0 && <span style={{ color: 'var(--success-color)' }}>✓ {progress.successful}</span>}
        {progress.failed > 0 && <span style={{ color: 'var(--danger-color)' }}>✗ {progress.failed}</span>}
        <span style={{ marginLeft: 'auto' }}>{elapsed(op.createdAt)}</span>
      </div>

      {/* Error */}
      {op.error?.message && (
        <p style={{ fontSize: 11, color: 'var(--danger-color)', margin: '4px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {op.error.message}
        </p>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        {(status === 'processing' || status === 'running') && actionBtn(Pause, 'Pause', pause, '#f59e0b')}
        {status === 'paused' && actionBtn(Play, 'Resume', resume, '#3b82f6')}
        {['processing', 'running', 'paused', 'queued'].includes(status) && actionBtn(X, 'Cancel', cancel, '#ef4444')}
        {status === 'failed' && actionBtn(RotateCcw, 'Retry', retry, '#8b5cf6')}
      </div>
    </div>
  );
}
