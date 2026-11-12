import React from 'react';

const statusColors = {
  processing: { bg: '#3b82f6', text: '#3b82f6' },
  running: { bg: '#3b82f6', text: '#3b82f6' },
  completed: { bg: '#22c55e', text: '#22c55e' },
  failed: { bg: '#ef4444', text: '#ef4444' },
  paused: { bg: '#f59e0b', text: '#f59e0b' },
  cancelled: { bg: '#6b7280', text: '#6b7280' },
};

const sizeHeights = {
  sm: 4,
  md: 8,
  lg: 12,
};

const stripedKeyframes = `
@keyframes progress-stripe {
  0% { background-position: 1rem 0; }
  100% { background-position: 0 0; }
}
`;

export default function ProgressBar({
  value = 0,
  status = 'processing',
  size = 'md',
  showLabel = false,
  animated = true,
}) {
  const clampedValue = Math.min(100, Math.max(0, value));
  const colors = statusColors[status] || statusColors.processing;
  const height = sizeHeights[size] || sizeHeights.md;
  const isStriped = status === 'processing' || status === 'running';

  const trackStyle = {
    height: `${height}px`,
    backgroundColor: 'var(--border-color)',
    borderRadius: `${height / 2}px`,
    overflow: 'hidden',
    width: '100%',
  };

  const fillStyle = {
    height: '100%',
    width: `${clampedValue}%`,
    backgroundColor: colors.bg,
    borderRadius: `${height / 2}px`,
    transition: animated ? 'width 0.5s ease' : 'none',
    ...(isStriped && animated
      ? {
          backgroundImage:
            'linear-gradient(45deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.15) 75%, transparent 75%, transparent)',
          backgroundSize: '1rem 1rem',
          animation: 'progress-stripe 1s linear infinite',
        }
      : {}),
  };

  return (
    <>
      <style>{stripedKeyframes}</style>
      <div className="flex items-center gap-2 w-full">
        <div style={trackStyle}>
          <div style={fillStyle} />
        </div>
        {showLabel && (
          <span
            className="text-xs font-medium whitespace-nowrap"
            style={{ color: colors.text, minWidth: '2.5rem', textAlign: 'right' }}
          >
            {Math.round(clampedValue)}%
          </span>
        )}
      </div>
    </>
  );
}
