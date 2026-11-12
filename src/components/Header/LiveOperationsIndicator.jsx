import { useState, lazy, Suspense } from 'react';
import { Activity, AlertTriangle } from 'lucide-react';
import { useOperationsContext } from '../../context/OperationsContext';

const OperationsDrawer = lazy(() => import('../Operations/OperationsDrawer'));

function LiveOperationsIndicator() {
    const [drawerOpen, setDrawerOpen] = useState(false);
    const { summary, alertSummary, isConnected, isLoading } = useOperationsContext();

    const criticalErrorCount = (alertSummary?.critical || 0) + (alertSummary?.error || 0);

    return (
        <>
            <div
                onClick={() => setDrawerOpen((prev) => !prev)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '20px',
                    padding: '4px 12px',
                    cursor: 'pointer',
                    transition: 'filter 0.15s ease',
                    animation: isLoading ? 'liveOpsPulse 1.8s ease-in-out infinite' : 'none',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(1)'; }}
                title="Live Operations"
            >
                {/* Connection status dot */}
                <span
                    style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: isConnected ? '#22c55e' : '#9ca3af',
                        flexShrink: 0,
                        animation: isConnected ? 'liveOpsDotPulse 2s ease-in-out infinite' : 'none',
                    }}
                />

                {/* LIVE OPS label */}
                <span
                    style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        fontVariant: 'all-small-caps',
                        letterSpacing: '0.5px',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        userSelect: 'none',
                    }}
                >
                    LIVE OPS
                </span>

                {/* Active count badge */}
                {summary?.active > 0 && (
                    <span
                        style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            backgroundColor: '#3b82f6',
                            color: '#fff',
                            borderRadius: '8px',
                            padding: '1px 6px',
                            lineHeight: '14px',
                            minWidth: '16px',
                            textAlign: 'center',
                        }}
                    >
                        {summary.active}
                    </span>
                )}

                {/* Queued count badge */}
                {summary?.queued > 0 && (
                    <span
                        style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            backgroundColor: '#6b7280',
                            color: '#fff',
                            borderRadius: '8px',
                            padding: '1px 6px',
                            lineHeight: '14px',
                            minWidth: '16px',
                            textAlign: 'center',
                        }}
                    >
                        {summary.queued}
                    </span>
                )}

                {/* Critical/Error attention badge */}
                {criticalErrorCount > 0 && (
                    <span
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px',
                            fontSize: '10px',
                            fontWeight: 600,
                            backgroundColor: '#ef4444',
                            color: '#fff',
                            borderRadius: '8px',
                            padding: '1px 6px',
                            lineHeight: '14px',
                        }}
                    >
                        <AlertTriangle size={10} />
                        {criticalErrorCount}
                    </span>
                )}
            </div>

            {/* Operations Drawer — lazy loaded */}
            <Suspense fallback={null}>
                {drawerOpen && (
                    <OperationsDrawer
                        open={drawerOpen}
                        onClose={() => setDrawerOpen(false)}
                    />
                )}
            </Suspense>
        </>
    );
}

// Inject keyframes for pulse animations
const liveOpsStyles = `
@keyframes liveOpsPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
@keyframes liveOpsDotPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.5); }
  50% { box-shadow: 0 0 0 3px rgba(34,197,94,0); }
}
`;

if (typeof document !== 'undefined') {
    const s = document.createElement('style');
    s.innerText = liveOpsStyles;
    document.head.appendChild(s);
}

export default LiveOperationsIndicator;
