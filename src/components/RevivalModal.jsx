import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { usePropertyConfig } from '../context/PropertyConfigContext';
import { useStageEngine } from '../hooks/useStageEngine';
import { ModalOverlay, FormLabel } from './Activities/ActivityCommon';

const RevivalModal = ({ isOpen, onClose, lead, onRevived }) => {
    const { 
        masterFields, 
        propertyConfig, 
        getLookupId, 
        getLookupValue,
        activityMasterFields 
    } = usePropertyConfig();
    
    const { triggerStageUpdate } = useStageEngine();
    
    const [step, setStep] = useState(1); // 1: Activity, 2: Requirements
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({
        // Activity Data
        activityType: 'Call',
        purpose: 'Revival / Re-engagement',
        outcome: 'Re-qualified / Interested',
        description: '',
        
        // Requirement Data (Refreshed)
        budgetMin: lead?.budgetMin || '',
        budgetMax: lead?.budgetMax || '',
        propertyType: lead?.propertyType || [],
        locCity: lead?.locCity || '',
        locArea: lead?.locArea || '',
        subType: lead?.subType || [],
        unitType: lead?.unitType || []
    });

    useEffect(() => {
        if (lead) {
            setFormData(prev => ({
                ...prev,
                budgetMin: lead.budgetMin || '',
                budgetMax: lead.budgetMax || '',
                propertyType: Array.isArray(lead.propertyType) ? lead.propertyType : [],
                locCity: lead.locCity || '',
                locArea: lead.locArea || '',
                subType: Array.isArray(lead.subType) ? lead.subType : [],
                unitType: Array.isArray(lead.unitType) ? lead.unitType : []
            }));
        }
    }, [lead, isOpen]);

    if (!isOpen) return null;

    const handleNext = () => setStep(2);
    const handleBack = () => setStep(1);

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleRevive = async () => {
        setIsSaving(true);
        try {
            // 1. Update Lead Requirements first
            await api.put(`/leads/${lead._id}`, {
                budgetMin: formData.budgetMin,
                budgetMax: formData.budgetMax,
                propertyType: formData.propertyType,
                locCity: formData.locCity,
                locArea: formData.locArea,
                subType: formData.subType,
                unitType: formData.unitType,
                notes: (lead.notes ? lead.notes + '\n' : '') + `[Revival] ${formData.description}`
            });

            // 2. Trigger Stage Update via Activity
            // This also creates the Activity record and updates stageHistory
            const result = await triggerStageUpdate(
                lead._id,
                formData.activityType,
                formData.purpose,
                formData.outcome,
                {
                    currentStage: 'Dormant',
                    reason: formData.description,
                    userId: null // Will be handled by backend auth
                }
            );

            if (result.success) {
                onRevived && onRevived(result.stage);
                onClose();
            }
        } catch (error) {
            console.error('[RevivalModal] Error:', error);
            alert('Failed to revive lead. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const modalStyle = {
        backgroundColor: '#fff',
        borderRadius: '24px',
        width: '600px',
        maxWidth: '95vw',
        padding: '0',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
    };

    const inputStyle = {
        width: '100%',
        padding: '12px 16px',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        fontSize: '0.95rem',
        outline: 'none',
        backgroundColor: '#f8fafc',
        transition: 'all 0.2s'
    };

    const selectionStyle = (selected) => ({
        padding: '8px 16px',
        borderRadius: '20px',
        fontSize: '0.85rem',
        fontWeight: 600,
        cursor: 'pointer',
        border: `2px solid ${selected ? '#3b82f6' : '#e2e8f0'}`,
        background: selected ? '#eff6ff' : '#fff',
        color: selected ? '#2563eb' : '#64748b',
        transition: 'all 0.2s'
    });

    return (
        <ModalOverlay isOpen={isOpen}>
            <div style={modalStyle}>
                {/* Header */}
                <div style={{ padding: '24px 32px', borderBottom: '1px solid #f1f5f9', background: 'linear-gradient(to right, #f8fafc, #ffffff)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.5px' }}>
                                Revive Lead
                            </h2>
                            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '4px 0 0 0', fontWeight: 500 }}>
                                Step {step} of 2: {step === 1 ? 'Re-engagement Log' : 'Requirement Refresh'}
                            </p>
                        </div>
                        <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', width: '36px', height: '36px', borderRadius: '50%', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div style={{ padding: '32px', maxHeight: '70vh', overflowY: 'auto' }}>
                    {step === 1 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div style={{ padding: '16px', background: '#f0f9ff', borderRadius: '16px', border: '1px solid #bae6fd', display: 'flex', gap: '12px' }}>
                                <i className="fas fa-info-circle" style={{ color: '#0ea5e9', marginTop: '3px' }}></i>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#0369a1', lineHeight: '1.5', fontWeight: 500 }}>
                                    Reviving this lead will create an activity log and move the stage to <strong>Prospect</strong>. Please summarize the re-engagement call.
                                </p>
                            </div>

                            <div>
                                <FormLabel>Call Summary / Reason for Revival</FormLabel>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => handleInputChange('description', e.target.value)}
                                    placeholder="Enter what the client said during the re-engagement call..."
                                    style={{ ...inputStyle, minHeight: '120px', resize: 'none' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '12px' }}>
                                <div style={{ flex: 1 }}>
                                    <FormLabel>Activity Purpose</FormLabel>
                                    <div style={{ ...inputStyle, background: '#f1f5f9', color: '#94a3b8' }}>Revival / Re-engagement</div>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <FormLabel>Outcome</FormLabel>
                                    <div style={{ ...inputStyle, background: '#f1f5f9', color: '#94a3b8' }}>Re-qualified / Interested</div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div style={{ display: 'flex', gap: '16px' }}>
                                <div style={{ flex: 1 }}>
                                    <FormLabel>Budget Min (₹)</FormLabel>
                                    <input
                                        type="number"
                                        value={formData.budgetMin}
                                        onChange={(e) => handleInputChange('budgetMin', e.target.value)}
                                        style={inputStyle}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <FormLabel>Budget Max (₹)</FormLabel>
                                    <input
                                        type="number"
                                        value={formData.budgetMax}
                                        onChange={(e) => handleInputChange('budgetMax', e.target.value)}
                                        style={inputStyle}
                                    />
                                </div>
                            </div>

                            <div>
                                <FormLabel>Preferred Property Type</FormLabel>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {['Residential', 'Commercial', 'Industrial', 'Agricultural'].map(type => (
                                        <button
                                            key={type}
                                            onClick={() => {
                                                const current = formData.propertyType || [];
                                                const next = current.includes(type) ? current.filter(t => t !== type) : [...current, type];
                                                handleInputChange('propertyType', next);
                                            }}
                                            style={selectionStyle(formData.propertyType?.includes(type))}
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '16px' }}>
                                <div style={{ flex: 1 }}>
                                    <FormLabel>City</FormLabel>
                                    <input
                                        type="text"
                                        value={formData.locCity}
                                        onChange={(e) => handleInputChange('locCity', e.target.value)}
                                        style={inputStyle}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <FormLabel>Preferred Area</FormLabel>
                                    <input
                                        type="text"
                                        value={formData.locArea}
                                        onChange={(e) => handleInputChange('locArea', e.target.value)}
                                        style={inputStyle}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '24px 32px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button
                        onClick={step === 2 ? handleBack : onClose}
                        style={{ padding: '12px 24px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}
                    >
                        {step === 2 ? 'Back' : 'Cancel'}
                    </button>
                    <button
                        onClick={step === 1 ? handleNext : handleRevive}
                        disabled={isSaving || (step === 1 && !formData.description)}
                        style={{
                            padding: '12px 32px',
                            borderRadius: '12px',
                            border: 'none',
                            background: isSaving || (step === 1 && !formData.description) ? '#cbd5e1' : 'linear-gradient(to right, #3b82f6, #2563eb)',
                            color: '#fff',
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: isSaving ? 'none' : '0 10px 15px -3px rgba(37, 99, 235, 0.4)',
                            minWidth: '140px'
                        }}
                    >
                        {isSaving ? (
                            <><i className="fas fa-spinner fa-spin" style={{ marginRight: '8px' }}></i> Processing...</>
                        ) : (
                            step === 1 ? 'Next: Refresh Requirements' : 'Complete Revival'
                        )}
                    </button>
                </div>
            </div>
        </ModalOverlay>
    );
};

export default RevivalModal;
