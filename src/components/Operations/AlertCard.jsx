/**
 * AlertCard — Operations alert card with acknowledge/resolve actions.
 */
import React from 'react';
import { AlertTriangle, XCircle, Info, Check, CheckCheck } from 'lucide-react';
import { useAcknowledgeAlert, useResolveAlert } from '../../hooks/useOperations';

const SEV = {
  critical: { Icon: AlertTriangle, color: '#ef4444', bg: '#fef2f2' },
  error:    { Icon: XCircle,       color: '#ef4444', bg: '#fef2f2' },
  warning:  { Icon: AlertTriangle, color: '#f59e0b', bg: '#fffbeb' },
  info:     { Icon: Info,          color: '#3b82f6', bg: '#eff6ff' },
};

function timeAgo(d) {
  if (!d) return '';
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

export default function AlertCard({ alert }) {
  const ack = useAcknowledgeAlert();
  const resolve = useResolveAlert();
  const a = alert || {};
  const { Icon, color, bg } = SEV[a.severity] || SEV.info;

  return (
    <div style={{
      padding: '10px 16px', borderBottom: '1px solid var(--border-color)',
      display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 6, background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={14} color={color} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{a.title || 'Alert'}</div>
        <p style={{
          fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {a.message}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(a.createdAt)}</span>
          {!a.acknowledged && (
            <button
              onClick={() => ack.mutate(a._id)}
              disabled={ack.isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                padding: '2px 8px', fontSize: 11, fontWeight: 500,
                borderRadius: 4, border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)', color: '#f59e0b', cursor: 'pointer',
              }}
            >
              <Check size={10} />Ack
            </button>
          )}
          {!a.resolved && (
            <button
              onClick={() => resolve.mutate(a._id)}
              disabled={resolve.isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                padding: '2px 8px', fontSize: 11, fontWeight: 500,
                borderRadius: 4, border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)', color: '#22c55e', cursor: 'pointer',
              }}
            >
              <CheckCheck size={10} />Resolve
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
