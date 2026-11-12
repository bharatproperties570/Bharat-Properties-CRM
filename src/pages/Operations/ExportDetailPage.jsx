/**
 * ExportDetailPage — Detailed view of an export operation.
 */
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Clock, FileText } from 'lucide-react';
import { useExportStatus } from '../../hooks/useOperations';
import { api } from '../../utils/api';
import StatusBadge from '../../components/Operations/StatusBadge';
import ProgressBar from '../../components/Operations/ProgressBar';

function fmtDate(d) { return d ? new Date(d).toLocaleString() : '-'; }
function fmtSize(b) {
  if (!b) return '-';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function timeLeft(exp) {
  if (!exp) return 'N/A';
  const ms = new Date(exp).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

export default function ExportDetailPage() {
  const { exportJobId } = useParams();
  const nav = useNavigate();
  const { data: job, isLoading } = useExportStatus(exportJobId);

  if (isLoading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>;
  if (!job) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>Export not found</div>;

  const status = job.status || 'unknown';
  const p = job.progress || {};
  const pct = p.total ? Math.round((p.processed / p.total) * 100) : 0;

  const handleDownload = async () => {
    try {
      const res = await api.get(`/exports/${exportJobId}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = job.outputFile?.originalName || `export-${job.entityType}.${job.format || 'csv'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const sectionStyle = {
    padding: 16, borderRadius: 10, background: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)', marginBottom: 20,
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900, margin: '0 auto' }}>
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
        <Download size={24} color="#10b981" />
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Export: {job.entityType?.charAt(0).toUpperCase() + job.entityType?.slice(1)}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <StatusBadge status={status} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(job.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Export details */}
      <div style={sectionStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>Export Details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
          <div><span style={{ color: 'var(--text-muted)' }}>Entity:</span> <strong>{job.entityType}</strong></div>
          <div><span style={{ color: 'var(--text-muted)' }}>Format:</span> <strong>{(job.format || 'csv').toUpperCase()}</strong></div>
          <div><span style={{ color: 'var(--text-muted)' }}>Initiated By:</span> <strong>{job.initiatedBy?.name || '-'}</strong></div>
          <div><span style={{ color: 'var(--text-muted)' }}>Created:</span> <strong>{fmtDate(job.createdAt)}</strong></div>
        </div>
        {job.fields?.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Fields:</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {job.fields.map(f => (
                <span key={f} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>{f}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Progress */}
      {status !== 'pending' && (
        <div style={sectionStyle}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>Progress</h3>
          <ProgressBar value={pct} status={status === 'processing' ? 'processing' : status} size="md" showLabel />
          <div style={{ display: 'flex', gap: 24, marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>
            <span>Records: <strong style={{ color: 'var(--text-primary)' }}>{p.processed ?? 0} / {p.total ?? 0}</strong></span>
          </div>
        </div>
      )}

      {/* Download */}
      {status === 'completed' && (
        <div style={sectionStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Download Ready</h3>
              <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                <span>Size: {fmtSize(job.outputFile?.size)}</span>
                <span>Downloads: {job.downloadCount ?? 0}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={12} /> Expires: {timeLeft(job.expiresAt)}
                </span>
              </div>
            </div>
            <button
              onClick={handleDownload}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 24px', fontSize: 14, fontWeight: 600,
                borderRadius: 8, border: 'none', cursor: 'pointer',
                background: '#10b981', color: '#fff',
              }}
            >
              <Download size={16} /> Download
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {job.error && (
        <div style={{
          padding: 16, borderRadius: 10, border: '1px solid #fecaca',
          background: '#fef2f2', marginBottom: 20,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#dc2626', marginBottom: 4 }}>Error</div>
          <p style={{ fontSize: 13, color: '#991b1b', margin: 0 }}>{job.error.message || job.error}</p>
        </div>
      )}
    </div>
  );
}
