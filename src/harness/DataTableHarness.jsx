import React, { useState, useEffect, useRef } from 'react';
import { DataTable } from '../components/ui/DataTable/DataTable';

const SAMPLE_DEALS = [
  { id: 'deal-101', title: 'DLF CyberCity Lease - Tower B', stage: 'Negotiation', value: '₹ 1.25 Cr' },
  { id: 'deal-102', title: 'Godrej Woods Luxury 3BHK', stage: 'Under Contract', value: '₹ 2.80 Cr' },
  { id: 'deal-103', title: 'M3M Golfestate Penthouse', stage: 'Closed Won', value: '₹ 5.50 Cr' }
];

export const DataTableHarness = () => {
  const [rowActionCount, setRowActionCount] = useState(0);
  const [nativeClickCount, setNativeClickCount] = useState(0);
  const [keydownInitialCount, setKeydownInitialCount] = useState(0);
  const [keydownRepeatCount, setKeydownRepeatCount] = useState(0);
  const [keyupCount, setKeyupCount] = useState(0);
  const [whileHeldInvocations, setWhileHeldInvocations] = useState(0);
  const [afterReleaseInvocations, setAfterReleaseInvocations] = useState(0);
  const [focusMaintained, setFocusMaintained] = useState(true);

  const [checkboxToggleCount, setCheckboxToggleCount] = useState(0);
  const [secondaryActionCount, setSecondaryActionCount] = useState(0);
  const [linkClickCount, setLinkClickCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [eventLogs, setEventLogs] = useState([]);
  const [lastAction, setLastAction] = useState('None');
  const [keyState, setKeyState] = useState({ key: null, isHolding: false, repeatCount: 0 });

  const keyStateRef = useRef({ key: null, isHolding: false });
  const logRef = useRef(null);

  const addLog = (message) => {
    const time = new Date().toISOString().substring(11, 23);
    setEventLogs((prev) => [`[${time}] ${message}`, ...prev.slice(0, 99)]);
  };

  const handleRowClick = (row) => {
    const isHeld = keyStateRef.current.isHolding;
    const currentKey = keyStateRef.current.key;
    const isFocused = document.activeElement && document.activeElement.classList.contains('ui-datatable-primary-action');

    if (!isFocused) setFocusMaintained(false);

    if (isHeld) {
      setWhileHeldInvocations((c) => c + 1);
    } else {
      setAfterReleaseInvocations((c) => c + 1);
    }

    setRowActionCount((prev) => prev + 1);
    const timingStr = isHeld ? 'WHILE-HELD (before keyup)' : 'AFTER-RELEASE (after keyup)';
    setLastAction(`"${row.title}" | Timing: ${timingStr} | Focus: ${isFocused ? 'YES' : 'LOST'}`);
    addLog(`ACTION: onRowClick triggered for "${row.title}" [Timing: ${timingStr}] [Focus: ${isFocused ? 'YES' : 'NO'}]`);
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id];
      return next;
    });
    setCheckboxToggleCount((prev) => prev + 1);
    setLastAction(`Checkbox Toggled: ID ${id}`);
    addLog(`CHECKBOX: Toggled for ID ${id}`);
  };

  const handleSecondaryAction = (row) => {
    setSecondaryActionCount((prev) => prev + 1);
    setLastAction(`Secondary Button Clicked: "${row.title}"`);
    addLog(`SECONDARY: Secondary button clicked for "${row.title}"`);
  };

  const handleLinkClick = (row) => {
    setLinkClickCount((prev) => prev + 1);
    setLastAction(`Nested Link Clicked: "${row.title}"`);
    addLog(`LINK: Nested link clicked for "${row.title}"`);
  };

  const resetCounters = () => {
    setRowActionCount(0);
    setNativeClickCount(0);
    setKeydownInitialCount(0);
    setKeydownRepeatCount(0);
    setKeyupCount(0);
    setWhileHeldInvocations(0);
    setAfterReleaseInvocations(0);
    setFocusMaintained(true);

    setCheckboxToggleCount(0);
    setSecondaryActionCount(0);
    setLinkClickCount(0);
    setSelectedIds([]);
    setLastAction('None');
    setEventLogs([]);
    setKeyState({ key: null, isHolding: false, repeatCount: 0 });
    keyStateRef.current = { key: null, isHolding: false };
    addLog('SYSTEM: Counters and logs reset.');
  };

  // Keyboard and Native DOM Click instrumentation
  useEffect(() => {
    const handleKeyDown = (e) => {
      const target = e.target;
      if (target && target.classList && target.classList.contains('ui-datatable-primary-action')) {
        if (e.key === ' ' || e.key === 'Enter') {
          const keyLabel = e.key === ' ' ? 'Space' : 'Enter';
          keyStateRef.current = { key: keyLabel, isHolding: true };

          if (e.repeat) {
            setKeydownRepeatCount((c) => c + 1);
          } else {
            setKeydownInitialCount((c) => c + 1);
          }

          setKeyState((prev) => ({
            key: keyLabel,
            isHolding: true,
            repeatCount: e.repeat ? prev.repeatCount + 1 : prev.repeatCount
          }));

          addLog(`KEY: keydown "${keyLabel}" (repeat: ${e.repeat}) on "${target.textContent}"`);
        }
      }
    };

    const handleKeyUp = (e) => {
      const target = e.target;
      if (target && target.classList && target.classList.contains('ui-datatable-primary-action')) {
        if (e.key === ' ' || e.key === 'Enter') {
          const keyLabel = e.key === ' ' ? 'Space' : 'Enter';
          keyStateRef.current = { key: keyLabel, isHolding: false };

          setKeyupCount((c) => c + 1);
          setKeyState({ key: keyLabel, isHolding: false, repeatCount: 0 });

          addLog(`KEY: keyup "${keyLabel}" on "${target.textContent}"`);
        }
      }
    };

    // Capture native DOM click on primary action button to measure native browser dispatch
    const handleCaptureClick = (e) => {
      const target = e.target && e.target.closest ? e.target.closest('.ui-datatable-primary-action') : null;
      if (target) {
        setNativeClickCount((c) => c + 1);
        addLog(`DOM-CLICK: Native button click event intercepted on "${target.textContent}" (detail: ${e.detail})`);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('click', handleCaptureClick, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('click', handleCaptureClick, true);
    };
  }, []);

  const columns = [
    {
      key: 'select',
      isSelection: true,
      header: (
        <input
          type="checkbox"
          id="cb-select-all"
          aria-label="Select all deals"
          checked={selectedIds.length === SAMPLE_DEALS.length}
          onChange={(e) => {
            e.stopPropagation();
            if (selectedIds.length === SAMPLE_DEALS.length) {
              setSelectedIds([]);
            } else {
              setSelectedIds(SAMPLE_DEALS.map((d) => d.id));
            }
            setCheckboxToggleCount((c) => c + 1);
            addLog('CHECKBOX: Select All toggled');
          }}
        />
      ),
      render: (row) => (
        <input
          type="checkbox"
          id={`cb-${row.id}`}
          data-testid={`checkbox-${row.id}`}
          aria-label={`Select ${row.title}`}
          checked={selectedIds.includes(row.id)}
          onChange={(e) => {
            e.stopPropagation();
            toggleSelect(row.id);
          }}
        />
      ),
      cellStyle: { width: '48px', textAlign: 'center' }
    },
    {
      key: 'title',
      accessor: 'title',
      isPrimary: true,
      header: 'Deal Title (Primary Keyboard Trigger)',
      render: (row) => <strong style={{ color: '#1e293b' }}>{row.title}</strong>
    },
    {
      key: 'stage',
      accessor: 'stage',
      header: 'Stage',
      render: (row) => (
        <span
          style={{
            padding: '3px 8px',
            borderRadius: '12px',
            fontSize: '0.78rem',
            fontWeight: 600,
            background: row.stage === 'Closed Won' ? '#dcfce7' : '#e0f2fe',
            color: row.stage === 'Closed Won' ? '#15803d' : '#0369a1'
          }}
        >
          {row.stage}
        </span>
      )
    },
    {
      key: 'value',
      accessor: 'value',
      header: 'Value'
    },
    {
      key: 'detailsLink',
      header: 'Nested Link',
      render: (row) => (
        <a
          href={`#/details/${row.id}`}
          id={`link-${row.id}`}
          style={{ color: '#2563eb', textDecoration: 'underline', fontSize: '0.85rem' }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleLinkClick(row);
          }}
        >
          View Specs
        </a>
      )
    },
    {
      key: 'actions',
      isAction: true,
      header: 'Secondary Action',
      render: (row) => (
        <button
          type="button"
          id={`btn-sec-${row.id}`}
          style={{
            padding: '5px 10px',
            fontSize: '0.8rem',
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
          onClick={(e) => {
            e.stopPropagation();
            handleSecondaryAction(row);
          }}
        >
          Quick Action
        </button>
      )
    }
  ];

  return (
    <div style={{ maxWidth: '1100px', margin: '30px auto', padding: '0 20px' }}>
      {/* Warning Banner */}
      <div
        id="warning-banner"
        style={{
          background: '#fee2e2',
          border: '2px solid #ef4444',
          borderRadius: '8px',
          padding: '14px 20px',
          color: '#991b1b',
          fontWeight: 700,
          textAlign: 'center',
          fontSize: '1rem',
          letterSpacing: '0.02em',
          marginBottom: '20px'
        }}
      >
        LOCAL ACCESSIBILITY TEST HARNESS — NOT A PRODUCTION CRM PAGE
      </div>

      <header style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: '0 0 6px 0', fontSize: '1.6rem', color: '#0f172a' }}>
          Phase 10.3.3E: DataTable Enter Auto-Repeat Guard & Hold Verification
        </h1>
        <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem' }}>
          Mounting real component: <code>src/components/ui/DataTable/DataTable.jsx</code> with granular keydown/repeat/click instrumentation.
        </p>
      </header>

      {/* Primary Investigation Metrics Dashboard */}
      <section
        style={{
          background: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          padding: '16px 20px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', color: '#334155' }}>
            Event Breakdown & Root-Cause Counters
          </h2>
          <button
            type="button"
            id="btn-reset-counters"
            onClick={resetCounters}
            style={{
              padding: '6px 14px',
              fontSize: '0.85rem',
              fontWeight: 600,
              background: '#0f172a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Reset All Counters
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '14px' }}>
          {/* Keydown Initial vs Repeat */}
          <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
              Keydown (Init / Repeat)
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
              <span id="count-keydown-initial" style={{ color: '#0284c7' }}>{keydownInitialCount}</span>
              <span style={{ color: '#94a3b8', margin: '0 4px' }}>/</span>
              <span id="count-keydown-repeat" style={{ color: '#ea580c' }}>{keydownRepeatCount}</span>
            </div>
          </div>

          {/* Keyup */}
          <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
              Keyup Count
            </div>
            <div id="count-keyup" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
              {keyupCount}
            </div>
          </div>

          {/* Native Click Count */}
          <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
              Native DOM Click
            </div>
            <div id="count-native-click" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#8b5cf6', marginTop: '4px' }}>
              {nativeClickCount}
            </div>
          </div>

          {/* onRowClick Invocations */}
          <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
              onRowClick Total
            </div>
            <div id="count-row-click" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0284c7', marginTop: '4px' }}>
              {rowActionCount}
            </div>
          </div>

          {/* Timing Breakdown */}
          <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
              Timing (Held / Release)
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
              <span id="count-while-held" style={{ color: '#dc2626' }}>{whileHeldInvocations}</span>
              <span style={{ color: '#94a3b8', margin: '0 4px' }}>/</span>
              <span id="count-after-release" style={{ color: '#16a34a' }}>{afterReleaseInvocations}</span>
            </div>
          </div>
        </div>

        {/* Status Line */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', color: '#475569', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
          <div>
            <strong>Focus Maintained on Button:</strong>{' '}
            <span id="status-focus-maintained" style={{ fontWeight: 700, color: focusMaintained ? '#16a34a' : '#dc2626' }}>
              {focusMaintained ? 'YES' : 'NO (FOCUS LOST)'}
            </span>
          </div>
          <div>
            <strong>Last Action:</strong> <span id="text-last-action" style={{ color: '#0f172a' }}>{lastAction}</span>
          </div>
        </div>
      </section>

      {/* Real DataTable Component */}
      <section
        style={{
          background: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #cbd5e1',
          padding: '16px',
          marginBottom: '24px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.06)'
        }}
      >
        <DataTable
          columns={columns}
          data={SAMPLE_DEALS}
          keyField="id"
          primaryColumnKey="title"
          onRowClick={handleRowClick}
          className="harness-datatable-instance"
        />
      </section>

      {/* Event Stream Log */}
      <section
        style={{
          background: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          padding: '16px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}
      >
        <h2 style={{ margin: '0 0 10px 0', fontSize: '1rem', color: '#334155' }}>Real-Time Event Stream</h2>
        <div
          ref={logRef}
          id="event-stream-container"
          style={{
            height: '180px',
            overflowY: 'auto',
            background: '#0f172a',
            color: '#38bdf8',
            fontFamily: 'monospace',
            fontSize: '0.82rem',
            padding: '10px 14px',
            borderRadius: '6px'
          }}
        >
          {eventLogs.length === 0 ? (
            <div style={{ color: '#64748b' }}>No events recorded yet. Interact with the table above.</div>
          ) : (
            eventLogs.map((log, idx) => <div key={idx}>{log}</div>)
          )}
        </div>
      </section>
    </div>
  );
};
