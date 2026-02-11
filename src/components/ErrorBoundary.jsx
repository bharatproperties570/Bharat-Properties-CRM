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
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '40px',
                    textAlign: 'center',
                    background: '#fef2f2',
                    borderRadius: '12px',
                    margin: '20px',
                    border: '1px solid #fee2e2'
                }}>
                    <h1 style={{ color: '#991b1b', fontSize: '1.5rem', marginBottom: '12px' }}>Something went wrong</h1>
                    <p style={{ color: '#b91c1c', marginBottom: '24px' }}>
                        The application encountered an unexpected error. Please try refreshing the page.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
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
                        Refresh Page
                    </button>
                    {process.env.NODE_ENV === 'development' && (
                        <details style={{ marginTop: '24px', textAlign: 'left', whiteSpace: 'pre-wrap' }}>
                            <summary style={{ cursor: 'pointer', color: '#666' }}>Error Details</summary>
                            <pre style={{ fontSize: '0.8rem', color: '#444', background: '#fff', padding: '12px', borderRadius: '4px', marginTop: '8px' }}>
                                {this.state.error && this.state.error.toString()}
                            </pre>
                        </details>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
