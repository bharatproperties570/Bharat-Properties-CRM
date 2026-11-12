/**
 * ImportDetailPage — Detailed view of an import operation.
 */
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Check, X, AlertTriangle, Download } from 'lucide-react';
import {
  useImportStatus, useImportPreview, useSetMapping,
  useValidateImport, useApproveImport, useCancelImport,
} from '../../hooks/useOperations';
import StatusBadge from '../../components/Operations/StatusBadge';
import ProgressBar from '../../components/Operations/ProgressBar';

function fmtDate(d) { return d ? new Date(d).toLocaleString() : '-'; }
function fmtSize(b) {
  if (!b) return '-';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

export default function ImportDetailPage() {
  const { importJobId } = useParams();
  const nav = useNavigate();
  const { data: job, isLoading } = useImportStatus(importJobId);
  const { data: preview } = useImportPreview(importJobId);
  const setMapping = useSetMapping();
  const validate = useValidateImport();
  const approve = useApproveImport();
  const cancelImport = useCancelImport();
  const [mapping, setMappingState] = useState({});

  if (isLoading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>;
  if (!job) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>Import not found</div>;

  const status = job.status || 'unknown';
  const p = job.progress || {};
  const pct = p.total ? Math.round((p.processed / p.total) * 100) : 0;
  const fileHeaders = preview?.headers || job.fileInfo?.headers || [];
  const sampleRows = preview?.sampleRows || [];
  const validation = job.validationSummary || {};
  const errors = job.rowErrors || [];

  const targetFields = {
    leads: ['firstName', 'lastName', 'email', 'phone', 'company', 'source', 'status', 'notes'],
    contacts: ['firstName', 'lastName', 'email', 'phone', 'company', 'title', 'notes'],
    inventory: ['name', 'type', 'project', 'area', 'price', 'status', 'description'],
  };
  const fields = targetFields[job.entityType] || targetFields.leads;

  const handleSetMapping = () => {
    setMapping.mutate({ importJobId, mapping });
  };

  const handleValidate = () => validate.mutate(importJobId);
  const handleApprove = () => approve.mutate(importJobId);
  const handleCancel = () => cancelImport.mutate(importJobId);

  const sectionStyle = {
    padding: 16, borderRadius: 10, background: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)', marginBottom: 20,
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1000, margin: '0 auto' }}>
      <button
        onClick={() => nav('/operations')}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16,
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 13, color: 'var(--primary-color)', fontWeight: 500,
        }}
      >
        <ArrowLeft size={14} /> Back to Operations
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Upload size={24} color="#6366f1" />
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Import: {job.entityType?.charAt(0).toUpperCase() + job.entityType?.slice(1)}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <StatusBadge status={status} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(job.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* File info */}
      <div style={sectionStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>File Information</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
          <div><span style={{ color: 'var(--text-muted)' }}>Filename:</span> <strong>{job.fileInfo?.originalName || '-'}</strong></div>
          <div><span style={{ color: 'var(--text-muted)' }}>Size:</span> <strong>{fmtSize(job.fileInfo?.size)}</strong></div>
          <div><span style={{ color: 'var(--text-muted)' }}>Type:</span> <strong>{job.fileInfo?.mimeType || '-'}</strong></div>
          <div><span style={{ color: 'var(--text-muted)' }}>Total Rows:</span> <strong>{job.totalRows ?? '-'}</strong></div>
        </div>
      </div>

      {/* Progress */}
      {(status === 'executing' || status === 'completed' || status === 'failed') && (
        <div style={sectionStyle}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>Progress</h3>
          <ProgressBar value={pct} status={status === 'executing' ? 'processing' : status} size="md" showLabel />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 12 }}>
            {[
              { label: 'Processed', val: p.processed ?? 0, color: '#3b82f6' },
              { label: 'Created', val: p.created ?? 0, color: '#22c55e' },
              { label: 'Updated', val: p.updated ?? 0, color: '#f59e0b' },
              { label: 'Errors', val: p.errors ?? 0, color: '#ef4444' },
            ].map(c => (
              <div key={c.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{c.val}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Column mapping */}
      {(status === 'parsed' || status === 'mapping') && fileHeaders.length > 0 && (
        <div style={sectionStyle}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>Column Mapping</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Map CSV columns to CRM fields for {job.entityType}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {fileHeaders.map(h => (
              <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--text-primary)', width: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h}</span>
                <span style={{ color: 'var(--text-muted)' }}>→</span>
                <select
                  value={mapping[h] || ''}
                  onChange={e => setMappingState(m => ({ ...m, [h]: e.target.value }))}
                  style={{
                    padding: '4px 8px', fontSize: 12, borderRadius: 4,
                    border: '1px solid var(--border-color)', background: 'var(--bg-primary)',
                    color: 'var(--text-primary)', flex: 1,
                  }}
                >
                  <option value="">— Skip —</option>
                  {fields.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            ))}
          </div>
          <button
            onClick={handleSetMapping}
            disabled={setMapping.isPending}
            style={{
              marginTop: 12, padding: '8px 20px', fontSize: 13, fontWeight: 600,
              borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'var(--primary-color)', color: '#fff',
            }}
          >
            {setMapping.isPending ? 'Saving...' : 'Save Mapping'}
          </button>
        </div>
      )}

      {/* Preview */}
      {sampleRows.length > 0 && (
        <div style={sectionStyle}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>Preview (first 5 rows)</h3>
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {fileHeaders.map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sampleRows.slice(0, 5).map((row, i) => (
                  <tr key={i}>
                    {fileHeaders.map(h => (
                      <td key={h} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row[h] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Validation */}
      {(status === 'mapped' || status === 'validated' || status === 'validation_failed') && (
        <div style={sectionStyle}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>Validation</h3>
          {validation.totalErrors > 0 && (
            <div style={{ padding: 12, borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', marginBottom: 12 }}>
              <AlertTriangle size={14} color="#ef4444" style={{ marginRight: 6, verticalAlign: 'middle' }} />
              <span style={{ fontSize: 13, color: '#dc2626' }}>{validation.totalErrors} validation errors found</span>
            </div>
          )}
          {validation.totalValid > 0 && (
            <div style={{ padding: 12, borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', marginBottom: 12 }}>
              <Check size={14} color="#22c55e" style={{ marginRight: 6, verticalAlign: 'middle' }} />
              <span style={{ fontSize: 13, color: '#16a34a' }}>{validation.totalValid} rows ready to import</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            {status === 'mapped' && (
              <button onClick={handleValidate} disabled={validate.isPending} style={{
                padding: '8px 20px', fontSize: 13, fontWeight: 600, borderRadius: 8,
                border: 'none', cursor: 'pointer', background: '#3b82f6', color: '#fff',
              }}>
                {validate.isPending ? 'Validating...' : 'Validate'}
              </button>
            )}
            {status === 'validated' && (
              <button onClick={handleApprove} disabled={approve.isPending} style={{
                padding: '8px 20px', fontSize: 13, fontWeight: 600, borderRadius: 8,
                border: 'none', cursor: 'pointer', background: '#22c55e', color: '#fff',
              }}>
                {approve.isPending ? 'Starting...' : 'Approve & Execute'}
              </button>
            )}
            {!['completed', 'cancelled', 'failed'].includes(status) && (
              <button onClick={handleCancel} disabled={cancelImport.isPending} style={{
                padding: '8px 20px', fontSize: 13, fontWeight: 600, borderRadius: 8,
                border: '1px solid var(--border-color)', cursor: 'pointer',
                background: 'var(--bg-primary)', color: '#ef4444',
              }}>
                Cancel Import
              </button>
            )}
          </div>
        </div>
      )}

      {/* Row errors */}
      {errors.length > 0 && (
        <div style={sectionStyle}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>Row Errors ({errors.length})</h3>
          <div style={{ maxHeight: 300, overflow: 'auto' }}>
            {errors.slice(0, 50).map((e, i) => (
              <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--border-color)', fontSize: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>Row {e.row}:</span>{' '}
                <span style={{ color: '#ef4444' }}>{e.message || e.error}</span>
              </div>
            ))}
            {errors.length > 50 && (
              <div style={{ padding: 8, fontSize: 12, color: 'var(--text-muted)' }}>...and {errors.length - 50} more</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
