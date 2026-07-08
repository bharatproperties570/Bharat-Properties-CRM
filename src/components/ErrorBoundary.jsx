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
        
        // Auto-recover from chunk load errors (Vercel deployments)
        const errString = (error?.message || error?.name || '').toLowerCase();
        if (errString.includes('chunkloaderror') || errString.includes('dynamically imported module') || errString.includes('importing a module script failed')) {
            const hasReloaded = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('chunk_reload');
            if (!hasReloaded) {
                if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('chunk_reload', 'true');
                window.location.href = window.location.origin + window.location.pathname + '?v=' + new Date().getTime();
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
                                // Force hard reload bypassing cache
                                window.location.href = window.location.origin + window.location.pathname + '?v=' + new Date().getTime();
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
                    {(() => {
                        try {
                            // Safer check for development mode
                            return (typeof process !== 'undefined' && process.env && (process.env.NODE_ENV === 'development' || process.env.EXPO_PUBLIC_DEV === 'true')) || 
                                   (typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));
                        } catch (e) {
                            return false;
                        }
                    })() && (
                        <div style={{ marginTop: '24px', textAlign: 'left' }}>
                            <p style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#666' }}>Error Details:</p>
                            <div style={{ 
                                fontSize: '0.8rem', 
                                color: '#444', 
                                background: '#fff', 
                                padding: '12px', 
                                borderRadius: '4px', 
                                marginTop: '8px',
                                overflow: 'auto'
                            }}>
                                {this.state.error && this.state.error.toString()}
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
