// src/components/modals/ContactDependencyModal.jsx
// ✨ Premium Modal: Shows cross‑module references for a contact before deletion.
// Uses glassmorphism, dark‑mode aware styling and smooth animations.

import React, { useEffect, useState } from 'react';
import { api } from '../../utils/api';
import contactDependencyService from '../../services/contactDependencyService';
import toast from 'react-hot-toast';

const modalOverlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
  zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center'
};

const modalContentStyle = {
  background: '#fff', width: '800px', borderRadius: '16px', overflow: 'hidden',
  boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
  maxHeight: '80vh', display: 'flex', flexDirection: 'column'
};

const headerStyle = {
  padding: '20px 24px', borderBottom: '1px solid #e5e7eb',
  background: 'var(--primary-color)', color: '#fff', fontSize: '1.2rem', fontWeight: 700
};

const sectionStyle = {
  padding: '16px 24px', borderBottom: '1px solid #f1f5f9'
};

const btnBase = {
  padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600,
  transition: 'all 0.2s'
};

export default function ContactDependencyModal({ isOpen, onClose, contactId, onDeleteConfirmed }) {
  const [deps, setDeps] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && contactId) {
      setLoading(true);
      contactDependencyService.getDependencies(contactId)
        .then(data => setDeps(data))
        .catch(err => {
          console.error('[ContactDependencyModal] Error', err);
          toast.error('Failed to load dependencies');
          onClose();
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, contactId, onClose]);

  if (!isOpen) return null;

  const renderSection = (title, items) => (
    <div style={sectionStyle} key={title}>
      <h4 style={{ margin: 0, fontSize: '1rem', color: '#1e293b', marginBottom: '8px' }}>{title}</h4>
      {items && items.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          {items.map((it, idx) => (
            <li key={idx} style={{ fontSize: '0.85rem', color: '#475569' }}>
              {it.name || it.title || it._id || `Record ${idx + 1}`}
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>No linked {title.toLowerCase()}.</p>
      )}
    </div>
  );

  const handleDelete = () => {
    onDeleteConfirmed(contactId);
    onClose();
  };

  return (
    <div style={modalOverlayStyle}>
      <div className="animate-fade-in" style={modalContentStyle}>
        <div style={headerStyle}>
          Confirm Deletion – Linked References
        </div>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>
        ) : (
          <>
            {deps ? (
              <div style={{ overflowY: 'auto' }}>
                {renderSection('Inventory Items', deps.inventory)}
                {renderSection('Deals', deps.deals)}
                {renderSection('Leads', deps.leads)}
                {renderSection('Activities', deps.activities)}
                {renderSection('Post‑Sale Records', deps.postSales)}
                {renderSection('Marketing Campaigns', deps.marketing)}
              </div>
            ) : (
              <div style={{ padding: '40px', textAlign: 'center' }}>No dependency data.</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px', gap: '12px', borderTop: '1px solid #e5e7eb' }}>
              <button
                style={{ ...btnBase, background: '#e5e7eb', color: '#374151' }}
                onClick={onClose}
              >Cancel</button>
              <button
                style={{ ...btnBase, background: '#ef4444', color: '#fff' }}
                onClick={handleDelete}
              >Delete Anyway</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
