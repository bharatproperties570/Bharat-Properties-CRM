import React, { useEffect } from 'react';
import { useRouteError, useNavigate } from 'react-router-dom';

function isChunkOrMimeError(err) {
    const s = String(err?.message || err?.statusText || err || '').toLowerCase();
    return s.includes('importing a module script failed') ||
           s.includes('failed to fetch dynamically imported module') ||
           s.includes('chunkloaderror') ||
           s.includes('text/html') ||
           s.includes('not a valid javascript mime type') ||
           s.includes('expected a javascript module script') ||
           s.includes('mime type') ||
           s.includes("unexpected token '<'") ||
           s.includes('syntaxerror');
}

export default function RouteErrorBoundary() {
    const error = useRouteError();
    const navigate = useNavigate();

    useEffect(() => {
        if (isChunkOrMimeError(error)) {
            console.warn('[RouteErrorBoundary] Detected chunk/MIME load failure. Initiating recovery reload...', error);
            const lastReload = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('route_chunk_reload') : null;
            const now = Date.now();
            if (!lastReload || now - Number(lastReload) > 12000) {
                if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('route_chunk_reload', String(now));
                window.location.reload();
            }
        }
    }, [error]);

    const isChunkErr = isChunkOrMimeError(error);

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0f172a',
            color: '#f8fafc',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            padding: '24px'
        }}>
            <div style={{
                maxWidth: '480px',
                width: '100%',
                backgroundColor: '#1e293b',
                borderRadius: '16px',
                padding: '36px 32px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
                border: '1px solid #334155',
                textAlign: 'center'
            }}>
                <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    backgroundColor: isChunkErr ? 'rgba(59, 130, 246, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: isChunkErr ? '#60a5fa' : '#f87171',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 20px',
                    fontSize: '32px'
                }}>
                    {isChunkErr ? '🔄' : '⚠️'}
                </div>

                <h1 style={{
                    fontSize: '22px',
                    fontWeight: 700,
                    margin: '0 0 10px',
                    color: '#ffffff'
                }}>
                    {isChunkErr ? 'New Update Available' : 'Something Went Wrong'}
                </h1>

                <p style={{
                    fontSize: '14px',
                    color: '#94a3b8',
                    lineHeight: '1.6',
                    margin: '0 0 28px'
                }}>
                    {isChunkErr 
                        ? 'A new version of Bharat Properties CRM was deployed. Please refresh to load the latest release.'
                        : 'The application encountered an unexpected error while loading this page.'
                    }
                </p>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                    <button
                        onClick={() => {
                            if (typeof sessionStorage !== 'undefined') {
                                sessionStorage.removeItem('route_chunk_reload');
                                sessionStorage.removeItem('vite_chunk_auto_reload');
                                sessionStorage.removeItem('vite_preload_auto_reload');
                            }
                            window.location.href = window.location.origin + window.location.pathname;
                        }}
                        style={{
                            backgroundColor: '#2563eb',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '12px 24px',
                            fontSize: '14px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'background-color 0.2s',
                        }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                    >
                        Refresh Application
                    </button>

                    {!isChunkErr && (
                        <button
                            onClick={() => navigate('/')}
                            style={{
                                backgroundColor: '#334155',
                                color: '#f8fafc',
                                border: '1px solid #475569',
                                borderRadius: '8px',
                                padding: '12px 24px',
                                fontSize: '14px',
                                fontWeight: 500,
                                cursor: 'pointer'
                            }}
                        >
                            Return to Dashboard
                        </button>
                    )}
                </div>

                {error && !isChunkErr && (
                    <div style={{ marginTop: '20px', textAlign: 'left', background: '#0f172a', padding: '12px', borderRadius: '8px', border: '1px solid #334155', fontSize: '11px', color: '#f87171' }}>
                        <div style={{ fontWeight: 700, marginBottom: '4px' }}>{String(error?.message || error)}</div>
                        {error?.stack && <pre style={{ margin: 0, fontSize: '10px', color: '#94a3b8', whiteSpace: 'pre-wrap', maxHeight: '120px', overflow: 'auto' }}>{error.stack}</pre>}
                    </div>
                )}
            </div>
        </div>
    );
}
