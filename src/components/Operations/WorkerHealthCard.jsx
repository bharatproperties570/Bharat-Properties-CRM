/**
 * WorkerHealthCard — Compact worker health display.
 */
import React from 'react';

const STATUS_DOTS = {
  healthy:   '#22c55e',
  degraded:  '#f59e0b',
  unhealthy: '#ef4444',
  stalled:   '#ef4444',
  offline:   '#9ca3af',
};

function timeAgo(d) {
  if (!d) return 'never';
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

export default function WorkerHealthCard({ worker }) {
  const w = worker || {};
  const dot = STATUS_DOTS[w.status] || STATUS_DOTS.offline;

  return (
    <div style={{
      padding: '10px 16px', borderBottom: '1px solid var(--border-color)',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      {/* Health dot */}
      <div style={{
        width: 8, height: 8, borderRadius: '50%', background: dot,
        boxShadow: `0 0 6px ${dot}60`, flexShrink: 0,
      }} />

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{w.workerName || 'Worker'}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{w.queue || ''}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
          <span style={{ color: '#22c55e' }}>✓ {w.jobsCompleted ?? 0}</span>
          <span style={{ color: '#ef4444' }}>✗ {w.jobsFailed ?? 0}</span>
          <span>Last: {timeAgo(w.lastHeartbeat)}</span>
        </div>
        {w.currentJobId && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Processing: {w.currentJobId}
          </div>
        )}
      </div>
    </div>
  );
}
