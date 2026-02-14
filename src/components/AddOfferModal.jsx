import React, { useState, useEffect } from 'react';
import { renderValue } from '../utils/renderUtils';

const AddOfferModal = ({ isOpen, onClose, onSave, leads }) => {
    const [formData, setFormData] = useState({
        leadId: '',
        leadName: '',
        amount: '',
        counterAmount: '',
        conditions: '',
        status: 'Active'
    });

    useEffect(() => {
        if (isOpen) {
            setFormData({
                leadId: '',
                leadName: '',
                amount: '',
                counterAmount: '',
                conditions: '',
                status: 'Active'
            });
        }
    }, [isOpen]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => {
            if (name === 'leadId') {
                const selectedLead = leads.find(l => l._id === value);
                return { ...prev, leadId: value, leadName: selectedLead ? selectedLead.name : '' };
            }
            return { ...prev, [name]: value };
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({
            ...formData,
            amount: Number(formData.amount),
            counterAmount: formData.counterAmount ? Number(formData.counterAmount) : null,
            date: new Date().toISOString()
        });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999
        }} onClick={onClose}>
            <div style={{
                background: '#fff', borderRadius: '24px', width: '100%', maxWidth: '500px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #e2e8f0',
                overflow: 'hidden', animation: 'slideUp 0.3s ease-out'
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ padding: '24px 32px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#1e293b', margin: 0, letterSpacing: '-0.02em' }}>
                            <i className="fas fa-handshake text-indigo-500 mr-2"></i> Register New Offer
                        </h2>
                        <p style={{ fontSize: '0.8.5rem', color: '#64748b', margin: '4px 0 0 0', fontWeight: 500 }}>
                            Log negotiation details and conditions.
                        </p>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', transition: 'color 0.2s' }} className="hover:text-slate-600">
                        <i className="fas fa-times text-xl"></i>
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ padding: '32px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                        {/* Lead Selection */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>
                                Offer Made By (Lead) <span className="text-rose-500">*</span>
                            </label>
                            <div className="relative">
                                <select
                                    name="leadId"
                                    value={formData.leadId}
                                    onChange={handleChange}
                                    required
                                    style={{
                                        width: '100%', padding: '12px 16px', borderRadius: '12px',
                                        border: '1px solid #e2e8f0', fontSize: '0.9rem', color: '#1e293b',
                                        fontWeight: 600, outline: 'none', transition: 'all 0.2s',
                                        appearance: 'none', background: '#fff'
                                    }}
                                    className="focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                                >
                                    <option value="">Select a Lead...</option>
                                    {leads.map(lead => (
                                        <option key={lead._id} value={lead._id}>{lead.name} ({lead.phone || lead.mobile})</option>
                                    ))}
                                </select>
                                <div style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#64748b' }}>
                                    <i className="fas fa-chevron-down text-xs"></i>
                                </div>
                            </div>
                        </div>

                        {/* Amounts Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>
                                    Offer Amount (₹) <span className="text-rose-500">*</span>
                                </label>
                                <div className="relative">
                                    <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontWeight: 700 }}>₹</span>
                                    <input
                                        type="number"
                                        name="amount"
                                        value={formData.amount}
                                        onChange={handleChange}
                                        required
                                        placeholder="0.00"
                                        style={{
                                            width: '100%', padding: '12px 16px 12px 36px', borderRadius: '12px',
                                            border: '1px solid #e2e8f0', fontSize: '1rem', color: '#1e293b',
                                            fontWeight: 700, outline: 'none', transition: 'all 0.2s'
                                        }}
                                        className="focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                                    />
                                </div>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>
                                    Counter Expectation
                                </label>
                                <div className="relative">
                                    <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontWeight: 700 }}>₹</span>
                                    <input
                                        type="number"
                                        name="counterAmount"
                                        value={formData.counterAmount}
                                        onChange={handleChange}
                                        placeholder="Optional"
                                        style={{
                                            width: '100%', padding: '12px 16px 12px 36px', borderRadius: '12px',
                                            border: '1px solid #e2e8f0', fontSize: '1rem', color: '#64748b',
                                            fontWeight: 600, outline: 'none', transition: 'all 0.2s'
                                        }}
                                        className="focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Conditions */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>
                                Conditions & Notes
                            </label>
                            <textarea
                                name="conditions"
                                value={formData.conditions}
                                onChange={handleChange}
                                rows="3"
                                placeholder="E.g. Subject to loan approval, requires valid registry check..."
                                style={{
                                    width: '100%', padding: '12px 16px', borderRadius: '12px',
                                    border: '1px solid #e2e8f0', fontSize: '0.9rem', color: '#334155',
                                    fontWeight: 500, outline: 'none', transition: 'all 0.2s', resize: 'vertical'
                                }}
                                className="focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                            ></textarea>
                        </div>

                    </div>

                    {/* Footer buttons */}
                    <div style={{ marginTop: '32px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                padding: '12px 24px', borderRadius: '12px', border: '1px solid #e2e8f0',
                                background: '#fff', color: '#64748b', fontSize: '0.9rem', fontWeight: 700,
                                cursor: 'pointer', transition: 'all 0.2s'
                            }}
                            className="hover:bg-slate-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            style={{
                                padding: '12px 32px', borderRadius: '12px', border: 'none',
                                background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
                                color: '#fff', fontSize: '0.9rem', fontWeight: 800,
                                cursor: 'pointer', transition: 'all 0.2s',
                                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
                            }}
                            className="hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                        >
                            Save Offer
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddOfferModal;
