/**
 * ExportModal — Modal to initiate a data export.
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Download } from 'lucide-react';
import { useInitiateExport } from '../../hooks/useOperations';

const ENTITY_TYPES = [
  { value: 'leads', label: 'Leads' },
  { value: 'contacts', label: 'Contacts' },
  { value: 'inventory', label: 'Property Inventory' },
  { value: 'deals', label: 'Deals' },
];

const FORMAT_OPTIONS = [
  { value: 'csv', label: 'CSV' },
  { value: 'xlsx', label: 'Excel (XLSX)' },
];

const FIELD_OPTIONS = {
  leads: ['firstName', 'lastName', 'email', 'phone', 'company', 'source', 'status', 'city', 'budget', 'assignedTo', 'createdAt', 'notes'],
  contacts: ['firstName', 'lastName', 'email', 'phone', 'company', 'title', 'city', 'createdAt', 'notes'],
  inventory: ['name', 'type', 'project', 'area', 'price', 'status', 'city', 'description', 'createdAt'],
  deals: ['title', 'value', 'stage', 'probability', 'expectedCloseDate', 'contact', 'assignedTo', 'createdAt'],
};

export default function ExportModal({ open, onClose }) {
  const [entityType, setEntityType] = useState('leads');
  const [format, setFormat] = useState('csv');
  const [selectedFields, setSelectedFields] = useState([]);
  const [selectAll, setSelectAll] = useState(false);

  const initiate = useInitiateExport();
  const fields = FIELD_OPTIONS[entityType] || FIELD_OPTIONS.leads;

  const handleSelectAll = (checked) => {
    setSelectAll(checked);
    setSelectedFields(checked ? [...fields] : []);
  };

  const handleToggle = (f) => {
    setSelectedFields(prev =>
      prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]
    );
  };

  const handleExport = async () => {
    const payload = {
      entityType,
      format,
      fields: selectedFields.length > 0 ? selectedFields : fields,
      filters: {},
    };
    try {
      await initiate.mutateAsync(payload);
      onClose();
    } catch (e) {
      console.error('Export initiation failed:', e);
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60,
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: 520, maxWidth: '95vw', maxHeight: '85vh', borderRadius: 12,
          background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Download size={18} color="#10b981" />
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Export Data</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {/* Entity type */}
          <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6, display: 'block' }}>What to export</label>
          <select value={entityType} onChange={e => { setEntityType(e.target.value); setSelectedFields([]); setSelectAll(false); }} style={{
            width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 8,
            border: '1px solid var(--border-color)', background: 'var(--bg-primary)',
            color: 'var(--text-primary)', marginBottom: 16,
          }}>
            {ENTITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>

          {/* Format */}
          <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6, display: 'block' }}>Format</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {FORMAT_OPTIONS.map(f => (
              <button
                key={f.value}
                onClick={() => setFormat(f.value)}
                style={{
                  flex: 1, padding: '8px 12px', fontSize: 13, fontWeight: 500, borderRadius: 8,
                  border: format === f.value ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                  background: format === f.value ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                  color: 'var(--text-primary)', cursor: 'pointer',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Fields */}
          <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6, display: 'block' }}>Fields to export</label>
          <div style={{ padding: 12, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={selectAll} onChange={e => handleSelectAll(e.target.checked)} />
              Select All
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {fields.map(f => (
                <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedFields.includes(f)} onChange={() => handleToggle(f)} />
                  {f}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '10px', fontSize: 13, borderRadius: 8,
            border: '1px solid var(--border-color)', background: 'var(--bg-primary)',
            color: 'var(--text-primary)', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleExport} disabled={initiate.isPending} style={{
            flex: 2, padding: '10px', fontSize: 14, fontWeight: 700, borderRadius: 8,
            border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            {initiate.isPending ? 'Starting...' : <><Download size={14} /> Start Export</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
