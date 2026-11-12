/**
 * OperationsDrawer — Slide-in panel from right showing live operations.
 */
import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useOperationsContext } from '../../context/OperationsContext';
import {
  useActiveOperations, useOperations, useWorkerHealth, useAlerts, useExports,
} from '../../hooks/useOperations';
import OperationCard from './OperationCard';
import WorkerHealthCard from './WorkerHealthCard';
import AlertCard from './AlertCard';

const TABS = ['Overview', 'Active', 'Failed', 'Imports', 'Exports', 'Workers', 'Alerts'];

export default function OperationsDrawer({ open, onClose }) {
  const [tab, setTab] = useState('Overview');
  const nav = useNavigate();
  const { summary, activeOps } = useOperationsContext();
  const { data: activeData } = useActiveOperations({ enabled: open && tab === 'Active' });
  const { data: failedData } = useOperations({ status: 'failed', limit: 20 }, { enabled: open && tab === 'Failed' });
  const { data: importData } = useOperations({ category: 'import', limit: 20 }, { enabled: open && tab === 'Imports' });
  const { data: exportData } = useExports({ enabled: open && tab === 'Exports' });
  const { data: workersData } = useWorkerHealth({ enabled: open && tab === 'Workers' });
  const { data: alertsData } = useAlerts({}, { enabled: open && tab === 'Alerts' });

  const stats = [
    { label: 'Active', value: summary.active, color: '#3b82f6' },
    { label: 'Queued', value: summary.queued, color: '#6b7280' },
    { label: 'Completed', value: summary.completed, color: '#22c55e' },
    { label: 'Failed', value: summary.failed, color: '#ef4444' },
  ];

  const renderEmpty = (msg) => (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{msg}</div>
  );

  const renderList = (items, EmptyMsg) => {
    const list = Array.isArray(items) ? items : items?.data || [];
    if (!list.length) return renderEmpty(EmptyMsg);
    return list.map(op => <OperationCard key={op._id} operation={op} />);
  };

  const renderTab = () => {
    switch (tab) {
      case 'Overview':
        return (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '12px 16px' }}>
              {stats.map(s => (
                <div key={s.label} style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value ?? 0}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
            {activeOps.length > 0 ? (
              <>
                <div style={{ padding: '8px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Active Operations
                </div>
                {activeOps.slice(0, 10).map(op => <OperationCard key={op._id} operation={op} />)}
              </>
            ) : renderEmpty('No active operations')}
          </>
        );
      case 'Active':
        return renderList(activeData, 'No active operations');
      case 'Failed':
        return renderList(failedData, 'No failed operations');
      case 'Imports':
        return renderList(importData, 'No import operations');
      case 'Exports': {
        const exports = Array.isArray(exportData) ? exportData : exportData?.data || [];
        if (!exports.length) return renderEmpty('No export operations');
        return exports.map(ex => (
          <OperationCard key={ex._id} operation={{ ...ex, category: 'export', channel: 'export', name: `${ex.entityType} Export` }} />
        ));
      }
      case 'Workers': {
        const workers = Array.isArray(workersData) ? workersData : workersData?.workers || [];
        if (!workers.length) return renderEmpty('No workers reporting');
        return workers.map(w => <WorkerHealthCard key={w.workerName || w._id} worker={w} />);
      }
      case 'Alerts': {
        const alerts = Array.isArray(alertsData) ? alertsData : alertsData?.data || [];
        if (!alerts.length) return renderEmpty('No alerts');
        return alerts.map(a => <AlertCard key={a._id} alert={a} />);
      }
      default: return null;
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
              zIndex: 50, cursor: 'pointer',
            }}
          />
          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, width: 480,
              maxWidth: '100vw', background: 'var(--bg-primary)', zIndex: 51,
              display: 'flex', flexDirection: 'column',
              borderLeft: '1px solid var(--border-color)',
              boxShadow: '-8px 0 30px rgba(0,0,0,0.12)',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', borderBottom: '1px solid var(--border-color)',
            }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Live Operations</span>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            {/* Tabs */}
            <div style={{
              display: 'flex', gap: 0, borderBottom: '1px solid var(--border-color)',
              overflowX: 'auto', flexShrink: 0,
            }}>
              {TABS.map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: '8px 12px', fontSize: 12, fontWeight: tab === t ? 600 : 400,
                    color: tab === t ? 'var(--primary-color)' : 'var(--text-muted)',
                    borderBottom: tab === t ? '2px solid var(--primary-color)' : '2px solid transparent',
                    background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto' }}>{renderTab()}</div>

            {/* Footer link */}
            <div
              onClick={() => { onClose(); nav('/operations'); }}
              style={{
                padding: '12px 16px', borderTop: '1px solid var(--border-color)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                fontSize: 13, fontWeight: 600, color: 'var(--primary-color)', cursor: 'pointer',
              }}
            >
              Open Full Dashboard <ExternalLink size={14} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
