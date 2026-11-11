import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        try {
            const errDump = JSON.stringify({
                message: error?.message || String(error),
                name: error?.name || 'Error',
                stack: error?.stack || '',
                componentStack: errorInfo?.componentStack || '',
                time: new Date().toISOString()
            });
            if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('bp_last_uncaught_error', errDump);
            if (typeof localStorage !== 'undefined') localStorage.setItem('bp_last_uncaught_error', errDump);
        } catch (_) {}
        
        // Auto-recover from chunk load errors and MIME type mismatches (Vite HMR / Vercel deployments)
        const errString = (error?.message || error?.name || '').toLowerCase();
        const isChunkOrMime = errString.includes('chunkloaderror') ||
            errString.includes('dynamically imported module') ||
            errString.includes('importing a module script failed') ||
            errString.includes('text/html') ||
            errString.includes('not a valid javascript mime type') ||
            errString.includes('expected a javascript module script') ||
            errString.includes('mime type') ||
            errString.includes("unexpected token '<'");

        if (isChunkOrMime) {
            const lastReload = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('chunk_reload_2') : null;
            const now = Date.now();
            if (!lastReload || now - Number(lastReload) > 12000) {
                if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('chunk_reload_2', String(now));
                if (window.location.search.includes('v=')) {
                    window.location.href = window.location.origin + window.location.pathname;
                } else {
                    window.location.reload();
                }
                return;
            }
        }
    }

    render() {
        if (this.state.hasError) {
            const isWeb = typeof window !== 'undefined';
            
            return (
                <div style={{
                    padding: '40px',
                    textAlign: 'center',
                    background: '#fef2f2',
                    borderRadius: '12px',
                    margin: isWeb ? '20px' : 0,
                    border: '1px solid #fee2e2'
                }}>
                    <h1 style={{ color: '#991b1b', fontSize: '1.5rem', marginBottom: '12px' }}>Something went wrong</h1>
                    <p style={{ color: '#b91c1c', marginBottom: '24px' }}>
                        The application encountered an unexpected error. 
                        {isWeb ? ' Please try refreshing the page.' : ' Please restart the application.'}
                    </p>
                    {isWeb && (
                        <button
                            onClick={() => {
                                // Clear corrupted local filters but keep auth
                                if (typeof localStorage !== 'undefined') {
                                    Object.keys(localStorage).forEach(key => {
                                        if (key.includes('Filters') || key.includes('columns') || key.includes('sortConfig')) {
                                            localStorage.removeItem(key);
                                        }
                                    });
                                }
                                if (typeof sessionStorage !== 'undefined') {
                                    sessionStorage.removeItem('chunk_reload');
                                    sessionStorage.removeItem('chunk_reload_2');
                                    sessionStorage.removeItem('route_chunk_reload');
                                    sessionStorage.removeItem('vite_chunk_auto_reload');
                                }
                                if (typeof caches !== 'undefined') {
                                    try {
                                        caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {});
                                    } catch (_) {}
                                }
                                // Append cache buster to force Safari/Chrome to load fresh index.html from server
                                const sep = window.location.search ? '&' : '?';
                                const cleanSearch = window.location.search.replace(/([?&])_cb=\d+/, '');
                                const prefix = cleanSearch ? cleanSearch + '&' : '?';
                                window.location.replace(window.location.origin + window.location.pathname + prefix + '_cb=' + Date.now());
                            }}
                            style={{
                                background: '#ef4444',
                                color: 'white',
                                padding: '10px 24px',
                                borderRadius: '6px',
                                border: 'none',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            Hard Refresh (Clear Cache)
                        </button>
                    )}
                    {this.state.error && (
                        <div style={{ marginTop: '20px', textAlign: 'left', maxWidth: '800px', margin: '20px auto 0' }}>
                            <div style={{ 
                                fontSize: '0.85rem', 
                                fontWeight: 700, 
                                color: '#991b1b', 
                                background: '#fee2e2', 
                                padding: '10px 14px', 
                                borderRadius: '6px 6px 0 0',
                                border: '1px solid #fca5a5',
                                borderBottom: 'none'
                            }}>
                                ⚠️ {this.state.error?.name || 'Error'}: {this.state.error?.message || String(this.state.error)}
                            </div>
                            <pre style={{ 
                                fontSize: '0.75rem', 
                                color: '#374151', 
                                background: '#ffffff', 
                                padding: '12px 14px', 
                                borderRadius: '0 0 6px 6px',
                                border: '1px solid #fca5a5',
                                margin: 0,
                                maxHeight: '180px',
                                overflow: 'auto',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                fontFamily: 'monospace'
                            }}>
                                {this.state.error?.stack || 'No stack trace available'}
                            </pre>
                        </div>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
