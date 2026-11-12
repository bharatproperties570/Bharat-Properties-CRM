/**
 * ImportWizard — Multi-step import modal.
 */
import React, { useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Upload, FileText, ArrowRight, ArrowLeft, Check, AlertTriangle } from 'lucide-react';
import {
  useImportUpload, useImportStatus, useImportPreview,
  useSetMapping, useValidateImport, useApproveImport,
} from '../../hooks/useOperations';

const STEPS = ['Upload', 'Map', 'Preview', 'Validate', 'Confirm'];
const ENTITY_TYPES = [
  { value: 'leads', label: 'Leads' },
  { value: 'contacts', label: 'Contacts' },
  { value: 'inventory', label: 'Property Inventory' },
];

const TARGET_FIELDS = {
  leads: ['firstName', 'lastName', 'email', 'phone', 'company', 'source', 'status', 'city', 'budget', 'notes'],
  contacts: ['firstName', 'lastName', 'email', 'phone', 'company', 'title', 'city', 'notes'],
  inventory: ['name', 'type', 'project', 'area', 'price', 'status', 'city', 'description'],
};

export default function ImportWizard({ open, onClose }) {
  const [step, setStep] = useState(0);
  const [entityType, setEntityType] = useState('leads');
  const [importId, setImportId] = useState(null);
  const [mapping, setMapping] = useState({});
  const [file, setFile] = useState(null);
  const fileRef = useRef(null);

  const upload = useImportUpload();
  const { data: job } = useImportStatus(importId);
  const { data: preview } = useImportPreview(importId);
  const setMappingMut = useSetMapping();
  const validate = useValidateImport();
  const approve = useApproveImport();

  const headers = preview?.headers || job?.fileInfo?.headers || [];
  const sampleRows = preview?.sampleRows || [];
  const validation = job?.validationSummary || {};
  const fields = TARGET_FIELDS[entityType] || TARGET_FIELDS.leads;

  const handleUpload = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', entityType);
    try {
      const result = await upload.mutateAsync(formData);
      setImportId(result?.data?._id || result?._id);
      setStep(1);
    } catch (e) {
      console.error('Upload failed:', e);
    }
  };

  const handleMapping = async () => {
    await setMappingMut.mutateAsync({ importJobId: importId, mapping });
    setStep(2);
  };

  const handleValidate = async () => {
    await validate.mutateAsync(importId);
    setStep(3);
  };

  const handleApprove = async () => {
    await approve.mutateAsync(importId);
    onClose();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) setFile(f);
  };

  if (!open) return null;

  const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60,
  };
  const modalStyle = {
    width: 640, maxWidth: '95vw', maxHeight: '90vh', borderRadius: 12,
    background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        style={modalStyle} onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Upload size={18} color="#6366f1" />
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Import Data</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        {/* Steps indicator */}
        <div style={{ display: 'flex', gap: 0, padding: '12px 20px', borderBottom: '1px solid var(--border-color)' }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: i <= step ? 'var(--primary-color)' : 'var(--border-color)',
                color: i <= step ? '#fff' : 'var(--text-muted)',
              }}>
                {i < step ? <Check size={12} /> : i + 1}
              </div>
              <span style={{ fontSize: 11, color: i <= step ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: i === step ? 600 : 400 }}>{s}</span>
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {/* Step 0: Upload */}
          {step === 0 && (
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 8, display: 'block' }}>Entity Type</label>
              <select value={entityType} onChange={e => setEntityType(e.target.value)} style={{
                width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 8,
                border: '1px solid var(--border-color)', background: 'var(--bg-primary)',
                color: 'var(--text-primary)', marginBottom: 16,
              }}>
                {ENTITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>

              <div
                onDrop={handleDrop} onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: '2px dashed var(--border-color)', borderRadius: 10, padding: 40,
                  textAlign: 'center', cursor: 'pointer', background: 'var(--bg-secondary)',
                  transition: 'border-color 0.2s',
                }}
              >
                <Upload size={32} color="var(--text-muted)" style={{ marginBottom: 8 }} />
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                  {file ? file.name : 'Drop CSV or XLSX file here, or click to browse'}
                </div>
                {file && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB</div>}
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={e => setFile(e.target.files?.[0])} style={{ display: 'none' }} />
              </div>

              <button
                onClick={handleUpload}
                disabled={!file || upload.isPending}
                style={{
                  marginTop: 16, width: '100%', padding: '10px', fontSize: 14, fontWeight: 600,
                  borderRadius: 8, border: 'none', cursor: file ? 'pointer' : 'not-allowed',
                  background: file ? 'var(--primary-color)' : 'var(--border-color)',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {upload.isPending ? 'Uploading...' : <><Upload size={14} /> Upload & Parse</>}
              </button>
            </div>
          )}

          {/* Step 1: Mapping */}
          {step === 1 && (
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Map file columns to {entityType} fields</p>
              {headers.map(h => (
                <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ width: 180, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h}</span>
                  <ArrowRight size={14} color="var(--text-muted)" />
                  <select value={mapping[h] || ''} onChange={e => setMapping(m => ({ ...m, [h]: e.target.value }))} style={{
                    flex: 1, padding: '6px 8px', fontSize: 12, borderRadius: 6,
                    border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)',
                  }}>
                    <option value="">— Skip —</option>
                    {fields.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button onClick={() => setStep(0)} style={{ flex: 1, padding: '8px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <ArrowLeft size={12} /> Back
                </button>
                <button onClick={handleMapping} disabled={setMappingMut.isPending} style={{
                  flex: 2, padding: '8px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none',
                  background: 'var(--primary-color)', color: '#fff', cursor: 'pointer',
                }}>
                  {setMappingMut.isPending ? 'Saving...' : 'Continue'}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 2 && (
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Preview mapped data (first 5 rows)</p>
              <div style={{ overflow: 'auto', maxHeight: 300, borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)' }}>
                      {headers.map(h => <th key={h} style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{mapping[h] || h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {sampleRows.slice(0, 5).map((row, i) => (
                      <tr key={i}>{headers.map(h => <td key={h} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>{row[h] ?? ''}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button onClick={() => setStep(1)} style={{ flex: 1, padding: '8px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer' }}>Back</button>
                <button onClick={handleValidate} disabled={validate.isPending} style={{ flex: 2, padding: '8px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: 'var(--primary-color)', color: '#fff', cursor: 'pointer' }}>
                  {validate.isPending ? 'Validating...' : 'Validate'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Validate */}
          {step === 3 && (
            <div>
              {validation.totalValid > 0 && (
                <div style={{ padding: 16, borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Check size={18} color="#22c55e" />
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#16a34a' }}>{validation.totalValid} rows valid and ready</span>
                </div>
              )}
              {validation.totalErrors > 0 && (
                <div style={{ padding: 16, borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={18} color="#ef4444" />
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#dc2626' }}>{validation.totalErrors} errors — invalid rows will be skipped</span>
                </div>
              )}
              {validation.duplicates > 0 && (
                <div style={{ padding: 12, borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', marginBottom: 12, fontSize: 13, color: '#92400e' }}>
                  {validation.duplicates} potential duplicates detected
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button onClick={() => setStep(2)} style={{ flex: 1, padding: '8px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer' }}>Back</button>
                <button onClick={() => setStep(4)} style={{ flex: 2, padding: '8px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: 'var(--primary-color)', color: '#fff', cursor: 'pointer' }}>Continue to Confirm</button>
              </div>
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 4 && (
            <div>
              <div style={{ padding: 20, borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                <FileText size={40} color="var(--primary-color)" style={{ marginBottom: 12 }} />
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Ready to Import</h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {validation.totalValid || job?.totalRows || 0} {entityType} will be imported
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                <button onClick={() => setStep(3)} style={{ flex: 1, padding: '10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer' }}>Back</button>
                <button onClick={handleApprove} disabled={approve.isPending} style={{
                  flex: 2, padding: '10px', fontSize: 14, fontWeight: 700, borderRadius: 8, border: 'none',
                  background: '#22c55e', color: '#fff', cursor: 'pointer',
                }}>
                  {approve.isPending ? 'Starting Import...' : '✓ Approve & Execute Import'}
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
