import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const eventDotColors = {
  status_changed: '#22c55e',
  completed: '#22c55e',
  failed: '#ef4444',
  error: '#ef4444',
  progress_update: '#3b82f6',
  warning: '#f59e0b',
  stalled: '#f59e0b',
  created: '#3b82f6',
  started: '#3b82f6',
  paused: '#f59e0b',
  resumed: '#f59e0b',
  cancelled: '#6b7280',
  retried: '#a855f7',
};

const eventBadgeColors = {
  status_changed: { bg: '#dcfce7', text: '#166534' },
  completed: { bg: '#dcfce7', text: '#166534' },
  failed: { bg: '#fee2e2', text: '#991b1b' },
  error: { bg: '#fee2e2', text: '#991b1b' },
  progress_update: { bg: '#dbeafe', text: '#1e40af' },
  warning: { bg: '#fef3c7', text: '#92400e' },
  stalled: { bg: '#fef3c7', text: '#92400e' },
  created: { bg: '#dbeafe', text: '#1e40af' },
  started: { bg: '#dbeafe', text: '#1e40af' },
  paused: { bg: '#fef3c7', text: '#92400e' },
  resumed: { bg: '#fef3c7', text: '#92400e' },
  cancelled: { bg: '#f3f4f6', text: '#374151' },
  retried: { bg: '#ede9fe', text: '#5b21b6' },
};

const defaultDotColor = '#6b7280';
const defaultBadge = { bg: '#f3f4f6', text: '#374151' };

function timeAgo(date) {
  if (!date) return '';
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 0) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

function formatEventType(type) {
  if (!type) return 'Event';
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function EventTimelineItem({ event, isLast = false }) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const { type = '', message = '', createdAt, actorName, metadata } = event || {};
  const dotColor = eventDotColors[type] || defaultDotColor;
  const badge = eventBadgeColors[type] || defaultBadge;
  const hasMetadata = metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0;

  return (
    <div className="flex gap-3" style={{ minHeight: '2.5rem' }}>
      {/* Left: dot + connector line */}
      <div className="flex flex-col items-center" style={{ width: '16px' }}>
        {/* Dot */}
        <div
          className="rounded-full flex-shrink-0"
          style={{
            width: '8px',
            height: '8px',
            backgroundColor: dotColor,
            marginTop: '5px',
          }}
        />
        {/* Connector line */}
        {!isLast && (
          <div
            className="flex-1"
            style={{
              width: '2px',
              backgroundColor: 'var(--border-color)',
              minHeight: '1.5rem',
            }}
          />
        )}
      </div>

      {/* Right: content */}
      <div className="flex-1 pb-4" style={{ fontSize: '13px' }}>
        {/* Top row: badge + timestamp */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Event type badge */}
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 font-medium"
            style={{
              fontSize: '11px',
              backgroundColor: badge.bg,
              color: badge.text,
              lineHeight: '1.4',
            }}
          >
            {formatEventType(type)}
          </span>
          {/* Timestamp */}
          <span
            className="whitespace-nowrap"
            style={{ fontSize: '11px', color: 'var(--text-muted)' }}
          >
            {timeAgo(createdAt)}
          </span>
          {/* Actor name */}
          {actorName && (
            <span
              className="whitespace-nowrap"
              style={{ fontSize: '11px', color: 'var(--text-secondary)' }}
            >
              by {actorName}
            </span>
          )}
        </div>

        {/* Message */}
        {message && (
          <p
            className="mt-1 leading-snug"
            style={{ color: 'var(--text-primary)', fontSize: '13px' }}
          >
            {message}
          </p>
        )}

        {/* Collapsible metadata details */}
        {hasMetadata && (
          <div className="mt-1.5">
            <button
              onClick={() => setDetailsOpen((prev) => !prev)}
              className="flex items-center gap-1 cursor-pointer bg-transparent border-none p-0"
              style={{ fontSize: '12px', color: 'var(--text-muted)' }}
            >
              {detailsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Details
            </button>
            {detailsOpen && (
              <div
                className="mt-1 rounded-md px-2.5 py-2 overflow-x-auto"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                }}
              >
                {Object.entries(metadata).map(([key, val]) => (
                  <div key={key} className="flex gap-2 py-0.5">
                    <span className="font-medium" style={{ color: 'var(--text-muted)', minWidth: '5rem' }}>
                      {key}:
                    </span>
                    <span style={{ color: 'var(--text-primary)' }}>
                      {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
