import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// 🛡️ Enterprise Chunk & MIME Auto-Recovery Helper
function isChunkOrMimeError(errStr) {
    const s = String(errStr || '').toLowerCase();
    return s.includes('importing a module script failed') ||
           s.includes('failed to fetch dynamically imported module') ||
           s.includes('chunkloaderror') ||
           s.includes('text/html') ||
           s.includes('not a valid javascript mime type') ||
           s.includes('expected a javascript module script') ||
           s.includes('mime type') ||
           s.includes("unexpected token '<'") ||
           s.includes('syntaxerror: unexpected token');
}

function triggerControlledReload(key) {
    const storageKey = key || 'vite_chunk_auto_reload';
    const lastReload = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(storageKey) : null;
    const now = Date.now();
    // Guard against reload loops: allow max 1 auto-reload every 12 seconds
    if (!lastReload || now - Number(lastReload) > 12000) {
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(storageKey, String(now));
        if (typeof caches !== 'undefined') {
            try { caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {}); } catch (_) {}
        }
        const cleanSearch = (window.location.search || '').replace(/([?&])_cb=\d+/, '');
        const sep = cleanSearch ? (cleanSearch.includes('?') ? '&' : '?') : '?';
        window.location.replace(window.location.origin + window.location.pathname + cleanSearch + sep + '_cb=' + Date.now());
        return true;
    }
    return false;
}

// 🛡️ 1. Vite Native Preload Error Hook (Triggers when a dynamic import fails)
window.addEventListener('vite:preloadError', (event) => {
    console.warn('[Vite] Preload error detected (deployment update). Reloading cleanly...', event);
    event.preventDefault();
    triggerControlledReload('vite_preload_auto_reload');
});

// 🛡️ 2. Global Error Handler
window.onerror = function(message, source, lineno, colno, error) {
    const msgStr = String(message || error?.message || '').toLowerCase();
    
    // Auto-recover from chunk load and MIME type mismatch errors
    if (isChunkOrMimeError(msgStr)) {
        if (triggerControlledReload('vite_global_chunk_reload')) {
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

// 🛡️ 3. Unhandled Promise Rejections (Dynamic import rejections)
window.addEventListener("unhandledrejection", function(event) {
    const reasonStr = String(event.reason?.message || event.reason || '').toLowerCase();
    
    // Ignore benign network / abort errors in global overlay
    if (reasonStr.includes('network error') || reasonStr.includes('timeout') || reasonStr.includes('canceled')) return;
    
    // Auto-recover from chunk / MIME type rejections
    if (isChunkOrMimeError(reasonStr)) {
        event.preventDefault();
        if (triggerControlledReload('vite_rejection_chunk_reload')) {
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
