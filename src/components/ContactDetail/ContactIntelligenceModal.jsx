import React, { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { api } from '../../utils/api';
import toast from 'react-hot-toast';

const ContactIntelligenceModal = ({ isOpen, onClose, contact, onSave }) => {
    const { isDark } = useTheme();
    
    const [formData, setFormData] = useState({
        intent_index: 0,
        dealProbability: 0,
        lead_classification: 'Warm',
        nurtureState: 'LEAD_CREATED'
    });
    
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (contact && isOpen) {
            setFormData({
                intent_index: contact.intent_index || 0,
                dealProbability: contact.dealProbability || 0,
                lead_classification: contact.lead_classification || 'Warm',
                nurtureState: contact.customFields?.nurtureState || 'LEAD_CREATED'
            });
        }
    }, [contact, isOpen]);

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: name === 'intent_index' || name === 'dealProbability' ? Number(value) : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            // Merge into customFields
            const updatedCustomFields = {
                ...(contact.customFields || {}),
                nurtureState: formData.nurtureState
            };
            
            const payload = {
                intent_index: formData.intent_index,
                dealProbability: formData.dealProbability,
                lead_classification: formData.lead_classification,
                customFields: updatedCustomFields
            };

            const endpoint = contact.isLead ? `/leads/${contact._id}` : `/contacts/${contact._id}`;
            const res = await api.put(endpoint, payload);
            
            if (res.data?.success) {
                toast.success('Contact Intelligence updated successfully');
                onSave();
                onClose();
            } else {
                toast.error(res.data?.error || 'Failed to update intelligence');
            }
        } catch (error) {
            console.error('Update Error:', error);
            toast.error(error.response?.data?.error || 'An error occurred while saving');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'
        }}>
            <div style={{
                background: isDark ? 'var(--bg-card)' : '#fff',
                width: '450px', maxWidth: '90vw', borderRadius: '16px', overflow: 'hidden',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                display: 'flex', flexDirection: 'column'
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 24px',
                    borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'linear-gradient(90deg, rgba(79, 70, 229, 0.1), transparent)'
                }}>
                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: isDark ? 'var(--text-main)' : '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="fas fa-brain" style={{ color: '#8b5cf6' }}></i> Edit Contact Intelligence
                    </h2>
                    <button onClick={onClose} style={{
                        background: 'transparent', border: 'none', fontSize: '1.2rem',
                        color: isDark ? 'var(--text-muted)' : '#64748b', cursor: 'pointer'
                    }}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: isDark ? 'var(--text-muted)' : '#475569', marginBottom: '6px' }}>Intent Index / Score (0-100)</label>
                            <input 
                                type="number" 
                                name="intent_index" 
                                min="0" max="100"
                                value={formData.intent_index} 
                                onChange={handleChange}
                                style={{
                                    width: '100%', padding: '10px 12px', borderRadius: '8px',
                                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.2)' : '#cbd5e1'}`,
                                    background: isDark ? 'rgba(0,0,0,0.2)' : '#fff',
                                    color: isDark ? '#fff' : '#000', fontSize: '0.9rem', outline: 'none'
                                }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: isDark ? 'var(--text-muted)' : '#475569', marginBottom: '6px' }}>Deal Probability (%)</label>
                            <input 
                                type="number" 
                                name="dealProbability" 
                                min="0" max="100"
                                value={formData.dealProbability} 
                                onChange={handleChange}
                                style={{
                                    width: '100%', padding: '10px 12px', borderRadius: '8px',
                                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.2)' : '#cbd5e1'}`,
                                    background: isDark ? 'rgba(0,0,0,0.2)' : '#fff',
                                    color: isDark ? '#fff' : '#000', fontSize: '0.9rem', outline: 'none'
                                }}
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: isDark ? 'var(--text-muted)' : '#475569', marginBottom: '6px' }}>Lead Classification</label>
                        <select 
                            name="lead_classification" 
                            value={formData.lead_classification} 
                            onChange={handleChange}
                            style={{
                                width: '100%', padding: '10px 12px', borderRadius: '8px',
                                border: `1px solid ${isDark ? 'rgba(255,255,255,0.2)' : '#cbd5e1'}`,
                                background: isDark ? 'rgba(0,0,0,0.2)' : '#fff',
                                color: isDark ? '#fff' : '#000', fontSize: '0.9rem', outline: 'none'
                            }}
                        >
                            <option value="Hot">Hot (Ready to close)</option>
                            <option value="Warm">Warm (Engaged)</option>
                            <option value="Cold">Cold (Unresponsive)</option>
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: isDark ? 'var(--text-muted)' : '#475569', marginBottom: '6px' }}>AI Nurture State</label>
                        <select 
                            name="nurtureState" 
                            value={formData.nurtureState} 
                            onChange={handleChange}
                            style={{
                                width: '100%', padding: '10px 12px', borderRadius: '8px',
                                border: `1px solid ${isDark ? 'rgba(255,255,255,0.2)' : '#cbd5e1'}`,
                                background: isDark ? 'rgba(0,0,0,0.2)' : '#fff',
                                color: isDark ? '#fff' : '#000', fontSize: '0.9rem', outline: 'none'
                            }}
                        >
                            <option value="LEAD_CREATED">Lead Created</option>
                            <option value="WA_SENT">WhatsApp Sent</option>
                            <option value="CALL_QUEUED">Call Queued</option>
                            <option value="EMAIL_SENT">Email Sent</option>
                            <option value="VISIT_BOOKED">Visit Booked</option>
                            <option value="HANDOFF">Handoff to Agent</option>
                        </select>
                    </div>

                    {/* Footer / Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px', borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`, paddingTop: '20px' }}>
                        <button 
                            type="button" 
                            onClick={onClose}
                            style={{
                                padding: '8px 20px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 700,
                                background: 'transparent', border: `1px solid ${isDark ? 'rgba(255,255,255,0.2)' : '#cbd5e1'}`,
                                color: isDark ? 'var(--text-main)' : '#475569', cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            disabled={isSaving}
                            style={{
                                padding: '8px 24px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 700,
                                background: '#4f46e5', border: 'none', color: '#fff', cursor: isSaving ? 'not-allowed' : 'pointer',
                                boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.3)'
                            }}
                        >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ContactIntelligenceModal;
