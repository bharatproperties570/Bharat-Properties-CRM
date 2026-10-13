import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

window.onerror = function(message, source, lineno, colno, error) {
    const msgStr = String(message || '').toLowerCase();
    
    // 🛡️ Enterprise Chunk Auto-Recovery: When a dynamic import fails due to code deployment or stale Vite chunk, auto-reload once cleanly
    if (msgStr.includes('importing a module script failed') || msgStr.includes('failed to fetch dynamically imported module') || msgStr.includes('chunkloaderror')) {
        const lastReload = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('vite_chunk_auto_reload') : null;
        const now = Date.now();
        if (!lastReload || now - Number(lastReload) > 10000) {
            if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('vite_chunk_auto_reload', String(now));
            window.location.reload();
            return true;
        }
    }

    const existing = document.getElementById('global-crash-banner');
    if (existing) existing.remove();
    const errorDiv = document.createElement('div');
    errorDiv.id = 'global-crash-banner';
    errorDiv.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; background: #dc2626; color: white; padding: 16px 24px; z-index: 999999; font-size: 14px; overflow: auto; max-height: 50vh; box-shadow: 0 10px 25px rgba(0,0,0,0.3); font-family: monospace;';
    errorDiv.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;"><h2 style="margin:0;font-size:18px;">Global Crash Detected</h2><button onclick="this.parentElement.parentElement.remove()" style="background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);color:white;padding:4px 12px;border-radius:6px;cursor:pointer;font-weight:bold;">Dismiss ✕</button></div><p style="margin:8px 0 4px;"><b>Message:</b> ${message}</p><p style="margin:0 0 8px;"><b>Source:</b> ${source}:${lineno}:${colno}</p><pre style="margin:0;white-space:pre-wrap;font-size:12px;">${error ? error.stack : ''}</pre>`;
    document.body.appendChild(errorDiv);
};

window.addEventListener("unhandledrejection", function(event) {
    const reasonStr = String(event.reason?.message || event.reason || '').toLowerCase();
    
    // Ignore benign network / abort errors in global overlay
    if (reasonStr.includes('network error') || reasonStr.includes('timeout') || reasonStr.includes('canceled')) return;
    
    // 🛡️ Enterprise Chunk Auto-Recovery for unhandled promise rejections
    if (reasonStr.includes('importing a module script failed') || reasonStr.includes('failed to fetch dynamically imported module') || reasonStr.includes('chunkloaderror')) {
        const lastReload = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('vite_chunk_auto_reload') : null;
        const now = Date.now();
        if (!lastReload || now - Number(lastReload) > 10000) {
            if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('vite_chunk_auto_reload', String(now));
            window.location.reload();
            return;
        }
    }

    const existing = document.getElementById('global-rejection-banner');
    if (existing) existing.remove();
    const errorDiv = document.createElement('div');
    errorDiv.id = 'global-rejection-banner';
    errorDiv.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; background: #ea580c; color: white; padding: 16px 24px; z-index: 999999; font-size: 14px; overflow: auto; max-height: 50vh; box-shadow: 0 10px 25px rgba(0,0,0,0.3); font-family: monospace;';
    errorDiv.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;"><h2 style="margin:0;font-size:18px;">Unhandled Promise Rejection</h2><button onclick="this.parentElement.parentElement.remove()" style="background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);color:white;padding:4px 12px;border-radius:6px;cursor:pointer;font-weight:bold;">Dismiss ✕</button></div><pre style="margin:8px 0 0;white-space:pre-wrap;font-size:12px;">${event.reason ? event.reason.stack : event.reason}</pre>`;
    document.body.appendChild(errorDiv);
});

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
