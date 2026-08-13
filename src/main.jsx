import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

window.onerror = function(message, source, lineno, colno, error) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; background: red; color: white; padding: 20px; z-index: 999999; font-size: 16px; overflow: auto; max-height: 100vh;';
    errorDiv.innerHTML = `<h1>Global Crash Detected</h1><p><b>Message:</b> ${message}</p><p><b>Source:</b> ${source}:${lineno}:${colno}</p><pre>${error ? error.stack : ''}</pre>`;
    document.body.appendChild(errorDiv);
};

window.addEventListener("unhandledrejection", function(event) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; background: orange; color: white; padding: 20px; z-index: 999999; font-size: 16px; overflow: auto; max-height: 100vh;';
    errorDiv.innerHTML = `<h1>Unhandled Promise Rejection</h1><pre>${event.reason ? event.reason.stack : event.reason}</pre>`;
    document.body.appendChild(errorDiv);
});

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
