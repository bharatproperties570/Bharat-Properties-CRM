import React from 'react';
import ReactDOM from 'react-dom/client';
import { DataTableHarness } from './DataTableHarness';

ReactDOM.createRoot(document.getElementById('harness-root')).render(
  <React.StrictMode>
    <DataTableHarness />
  </React.StrictMode>
);
