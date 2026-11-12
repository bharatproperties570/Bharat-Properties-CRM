/**
 * StatusBadge — Color-coded status indicator for operations.
 */
import React from 'react';

const STATUS_CONFIG = {
  created:          { label: 'Created',          bg: 'bg-gray-100',    text: 'text-gray-700',    dot: 'bg-gray-400' },
  validating:       { label: 'Validating',       bg: 'bg-blue-50',     text: 'text-blue-700',    dot: 'bg-blue-400' },
  queued:           { label: 'Queued',            bg: 'bg-indigo-50',   text: 'text-indigo-700',  dot: 'bg-indigo-400' },
  initializing:     { label: 'Initializing',     bg: 'bg-blue-50',     text: 'text-blue-700',    dot: 'bg-blue-400' },
  waiting_approval: { label: 'Awaiting Approval', bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400' },
  running:          { label: 'Running',           bg: 'bg-blue-50',     text: 'text-blue-700',    dot: 'bg-blue-500', pulse: true },
  paused:           { label: 'Paused',            bg: 'bg-orange-50',   text: 'text-orange-700',  dot: 'bg-orange-400' },
  blocked:          { label: 'Blocked',           bg: 'bg-red-50',      text: 'text-red-700',     dot: 'bg-red-400' },
  retrying:         { label: 'Retrying',          bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-500', pulse: true },
  partial:          { label: 'Partial',           bg: 'bg-yellow-50',   text: 'text-yellow-700',  dot: 'bg-yellow-500' },
  stalled:          { label: 'Stalled',           bg: 'bg-red-50',      text: 'text-red-700',     dot: 'bg-red-500', pulse: true },
  completed:        { label: 'Completed',         bg: 'bg-green-50',    text: 'text-green-700',   dot: 'bg-green-500' },
  failed:           { label: 'Failed',            bg: 'bg-red-50',      text: 'text-red-700',     dot: 'bg-red-500' },
  cancelled:        { label: 'Cancelled',         bg: 'bg-gray-100',    text: 'text-gray-500',    dot: 'bg-gray-400' },
  recovery_pending: { label: 'Recovery Pending',  bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-500' },
};

export default function StatusBadge({ status, size = 'sm' }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.created;
  const sizeClasses = size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${cfg.bg} ${cfg.text} ${sizeClasses}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${cfg.pulse ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  );
}
