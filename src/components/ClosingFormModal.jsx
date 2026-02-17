import React, { useState } from 'react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';

const styles = {
    overlay: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
    },
    modal: {
        backgroundColor: '#fff', borderRadius: '20px', width: '100%', maxWidth: '600px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', animation: 'slideUp 0.3s ease-out'
    },
    header: {
        padding: '24px 32px', borderBottom: '1px solid #e2e8f0',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'linear-gradient(to right, #f8fafc, #fff)'
    },
    title: { fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', margin: 0 },
    body: { padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' },
    sectionTitle: { fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' },
    checkboxGroup: { display: 'flex', flexDirection: 'column', gap: '12px' },
    checkboxItem: {
        display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
        borderRadius: '12px', border: '1px solid #e2e8f0', cursor: 'pointer',
        transition: 'all 0.2s', background: '#f8fafc'
    },
    checkboxItemActive: { borderColor: '#10b981', background: '#f0fdf4' },
    textarea: {
        width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0',
        fontSize: '0.9rem', minHeight: '100px', outline: 'none', background: '#f8fafc'
    },
    footer: {
        padding: '20px 32px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc',
        display: 'flex', justifyContent: 'flex-end', gap: '12px'
    },
    btnCancel: { padding: '10px 20px', fontWeight: 700, color: '#64748b', border: 'none', background: 'none', cursor: 'pointer' },
    btnSubmit: {
        padding: '10px 32px', borderRadius: '10px', background: '#10b981', color: '#fff',
        fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)'
    }
};

const ClosingFormModal = ({ isOpen, onClose, entity, entityType, onComplete }) => {
    const [isSaving, setIsSaving] = useState(false);
    const [contacts, setContacts] = useState([]);
    const [contactSearch, setContactSearch] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);

    const [closingData, setClosingData] = useState({
        closingDate: new Date().toISOString().split('T')[0],
        checklist: {
            noc: false,
            originalDocuments: false,
            keysHandedOver: false,
            finalPaymentReceived: false
        },
        remarks: '',
        newOwnerId: entity.lead?._id || entity.lead || entity.partyStructure?.buyer?._id || entity.partyStructure?.buyer || ''
    });

    React.useEffect(() => {
        const fetchContacts = async () => {
            try {
                const res = await api.get('/contacts?limit=1000');
                const allContacts = res.data.records || [];
                setContacts(allContacts);

                // Initial search text for the selected owner
                const currentOwner = allContacts.find(c => c._id === closingData.newOwnerId);
                if (currentOwner) {
                    const phone = currentOwner.phones?.[0]?.number || currentOwner.mobile || '';
                    setContactSearch(`${currentOwner.name || ''} ${phone ? `(${phone})` : ''}`);
                }
            } catch (err) {
                console.error('Error fetching contacts:', err);
            }
        };
        if (isOpen) fetchContacts();
    }, [isOpen]);

    React.useEffect(() => {
        const handleClickOutside = () => setShowSuggestions(false);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const toggleCheck = (field) => {
        setClosingData(prev => ({
            ...prev,
            checklist: { ...prev.checklist, [field]: !prev.checklist[field] }
        }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const endpoint = entityType === 'Deal' ? `deals/${entity._id}/close` : `bookings/${entity._id}/close`;
            const response = await api.post(endpoint, closingData);

            if (response.data.success) {
                toast.success(`${entityType} closed and notifications sent!`);
                onComplete && onComplete();
                onClose();
            } else {
                toast.error(response.data.message || 'Failed to close');
            }
        } catch (error) {
            console.error('Error closing:', error);
            toast.error('Server error during closing');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
                <div style={styles.header}>
                    <h2 style={styles.title}>Closing Details - {entityType} #{entity.id || entity.dealId || entity.applicationNo}</h2>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                <div style={styles.body}>
                    <div>
                        <div style={styles.sectionTitle}>Closing Checklist</div>
                        <div style={styles.checkboxGroup}>
                            {[
                                { id: 'noc', label: 'NOC / Possession Certificate' },
                                { id: 'originalDocuments', label: 'Original Documents Handover' },
                                { id: 'keysHandedOver', label: 'Keys Handed Over' },
                                { id: 'finalPaymentReceived', label: 'Final Payment Confirmation' }
                            ].map(item => (
                                <div
                                    key={item.id}
                                    style={{ ...styles.checkboxItem, ...(closingData.checklist[item.id] ? styles.checkboxItemActive : {}) }}
                                    onClick={() => toggleCheck(item.id)}
                                >
                                    <input
                                        type="checkbox"
                                        checked={closingData.checklist[item.id]}
                                        onChange={() => { }}
                                        style={{ width: '18px', height: '18px', accentColor: '#10b981' }}
                                    />
                                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: closingData.checklist[item.id] ? '#065f46' : '#475569' }}>{item.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <div style={styles.sectionTitle}>Closing Date</div>
                        <input
                            type="date"
                            style={{ ...styles.textarea, minHeight: 'auto', padding: '10px 16px' }}
                            value={closingData.closingDate}
                            onChange={e => {
                                const val = e.target.value;
                                setClosingData(prev => ({ ...prev, closingDate: val }));
                            }}
                        />
                    </div>

                    <div style={{ position: 'relative' }}>
                        <div style={styles.sectionTitle}>Transfer Ownership to (New Owner)</div>
                        <input
                            type="text"
                            style={{ ...styles.textarea, minHeight: 'auto', padding: '10px 16px' }}
                            placeholder="Type to search name or number..."
                            value={contactSearch}
                            onFocus={(e) => {
                                e.stopPropagation();
                                setShowSuggestions(true);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onChange={e => {
                                const val = e.target.value;
                                setContactSearch(val);
                                setShowSuggestions(true);
                                // If clearing, also clear the ID
                                if (!val) setClosingData(prev => ({ ...prev, newOwnerId: '' }));
                            }}
                        />
                        {showSuggestions && contactSearch && (
                            <div style={{
                                position: 'absolute', top: '100%', left: 0, right: 0,
                                background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px',
                                marginTop: '4px', maxHeight: '200px', overflowY: 'auto', zIndex: 10,
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                            }}>
                                {contacts
                                    .filter(c => {
                                        const fullName = (c.name || '').toLowerCase();
                                        const phone = (c.phones?.[0]?.number || c.mobile || '').toString();
                                        const search = contactSearch.toLowerCase();
                                        return fullName.includes(search) || phone.includes(search);
                                    })
                                    .map(contact => (
                                        <div
                                            key={contact._id}
                                            style={{
                                                padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                                                fontSize: '0.9rem', color: '#1e293b'
                                            }}
                                            onClick={() => {
                                                const phone = contact.phones?.[0]?.number || contact.mobile || '';
                                                setContactSearch(`${contact.name || ''} ${phone ? `(${phone})` : ''}`);
                                                setClosingData(prev => ({ ...prev, newOwnerId: contact._id }));
                                                setShowSuggestions(false);
                                            }}
                                            onMouseEnter={e => e.target.style.background = '#f8fafc'}
                                            onMouseLeave={e => e.target.style.background = '#fff'}
                                        >
                                            <div style={{ fontWeight: 700 }}>{contact.name || 'N/A'}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                {contact.phones?.[0]?.number || contact.mobile || 'No Phone'} • {contact.type}
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        )}
                    </div>

                    <div>
                        <div style={styles.sectionTitle}>Closing Remarks / Feedback</div>
                        <textarea
                            style={styles.textarea}
                            placeholder="Add final transaction notes..."
                            value={closingData.remarks}
                            onChange={e => {
                                const val = e.target.value;
                                setClosingData(prev => ({ ...prev, remarks: val }));
                            }}
                        />
                    </div>

                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '12px 16px', display: 'flex', gap: '12px' }}>
                        <i className="fas fa-info-circle" style={{ color: '#d97706', marginTop: '2px' }}></i>
                        <p style={{ fontSize: '0.8rem', color: '#92400e', margin: 0, lineHeight: 1.5 }}>
                            <strong>Automated Action:</strong> Completing this will mark the unit as <strong>Active</strong> in the inventory with the <strong>New Owner</strong> assigned.
                        </p>
                    </div>
                </div>

                <div style={styles.footer}>
                    <button onClick={onClose} style={styles.btnCancel}>Discard</button>
                    <button onClick={handleSave} disabled={isSaving} style={styles.btnSubmit}>
                        {isSaving ? 'Processing...' : 'Complete Transaction'}
                    </button>
                </div>
            </div>
            <style>{`@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
        </div>
    );
};

export default ClosingFormModal;
