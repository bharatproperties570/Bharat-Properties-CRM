import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

const QuickDealForm = ({
    currentItem,
    detectedContacts,
    matchedInventory,
    intakeType,
    onCreateDeal,
    onSkip,
    onBack,
    onOpenAddContact,
    startCall,
    startWhatsAppCall
}) => {
    // Auto-select first contact as owner
    const [selectedOwner, setSelectedOwner] = useState(null);
    const [selectedProperty, setSelectedProperty] = useState(null);
    const [dealType, setDealType] = useState('Sell');
    const [dealPrice, setDealPrice] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [verificationStatus, setVerificationStatus] = useState(null); // null | 'confirmed' | 'follow-up' | 'not-interested'

    // Handle call outcome
    const handleCallOutcome = (callLog) => {
        const outcome = callLog.outcome.toLowerCase().replace(/\s+/g, '-');
        setVerificationStatus(outcome);

        // Show feedback toast
        if (outcome === 'confirmed') {
            toast.success('✓ Owner verified via call');
        } else if (outcome.includes('follow')) {
            toast.info('📅 Follow-up scheduled');
        } else if (outcome.includes('not-interested')) {
            toast.error('❌ Owner not interested');
        }
    };

    // Auto-selection on mount
    useEffect(() => {
        // Auto-select first contact
        if (detectedContacts && detectedContacts.length > 0 && !selectedOwner) {
            setSelectedOwner(detectedContacts[0]);
        }

        // Auto-select best property match (>80% confidence)
        if (matchedInventory && matchedInventory.length > 0 && !selectedProperty) {
            const bestMatch = matchedInventory[0];
            if (bestMatch.score >= 80) {
                setSelectedProperty(bestMatch.inventory);
            }
        }

        // Auto-detect deal type from intent
        if (intakeType === 'SELLER') {
            setDealType('Sell');
        } else if (intakeType === 'BUYER') {
            setDealType('Buy');
        }
    }, [detectedContacts, matchedInventory, intakeType]);

    const handleCreateDeal = () => {
        if (!selectedOwner) {
            toast.error('Please select an owner');
            return;
        }
        if (!selectedProperty) {
            toast.error('Please select a property');
            return;
        }
        if (!dealPrice) {
            toast.error('Please enter deal price');
            return;
        }

        // Block if not interested
        if (verificationStatus && verificationStatus.includes('not-interested')) {
            toast.error('Cannot create deal - Owner not interested');
            return;
        }

        // Warn if unverified (but allow)
        if (!verificationStatus) {
            toast.warning('⚠️ Creating unverified deal');
        }

        onCreateDeal({
            owner: selectedOwner,
            property: selectedProperty,
            type: dealType,
            price: dealPrice,
            verificationStatus: verificationStatus || 'unverified'
        });
    };

    const confidenceColor = (score) => {
        if (score >= 90) return '#10b981';
        if (score >= 80) return '#f59e0b';
        return '#ef4444';
    };

    const matchScore = matchedInventory?.find(m => m.inventory.id === selectedProperty?.id)?.score || 0;

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
            {/* Header */}
            <div style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
                    Quick Deal Creation
                </h2>
                <div style={{ height: '4px', background: 'linear-gradient(to right, #3b82f6, #8b5cf6)', borderRadius: '2px', width: '60px' }}></div>
            </div>

            {/* Intake Preview */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '8px' }}>📋 INTAKE PREVIEW</div>
                <div style={{ fontSize: '0.9rem', color: '#334155', lineHeight: '1.6' }}>
                    {currentItem?.content?.substring(0, 200)}...
                </div>
            </div>

            {/* Main Form - Two Column Layout */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>

                {/* Owner Section */}
                <div style={{ background: '#fff', border: '2px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                        <i className="fas fa-user" style={{ color: '#3b82f6', fontSize: '1.1rem' }}></i>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Owner</h3>
                    </div>

                    {detectedContacts && detectedContacts.length > 0 ? (
                        <>
                            {/* Selected Owner Display with Verification Badge */}
                            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                    <div>
                                        <div style={{ fontWeight: 700, color: '#1e40af', marginBottom: '4px' }}>
                                            {selectedOwner?.name || 'Unknown'}
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <i className="fas fa-phone"></i>
                                            {selectedOwner?.mobile}
                                        </div>
                                    </div>

                                    {/* Verification Status Badge */}
                                    {verificationStatus ? (
                                        <div style={{
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            background:
                                                verificationStatus === 'confirmed' ? '#dcfce7' :
                                                    verificationStatus.includes('follow') ? '#fef3c7' :
                                                        '#fee2e2',
                                            color:
                                                verificationStatus === 'confirmed' ? '#166534' :
                                                    verificationStatus.includes('follow') ? '#b45309' :
                                                        '#991b1b'
                                        }}>
                                            {verificationStatus === 'confirmed' && '✓ Verified'}
                                            {verificationStatus.includes('follow') && '⏳ Follow-up'}
                                            {verificationStatus.includes('not-interested') && '❌ Not Interested'}
                                        </div>
                                    ) : (
                                        <div style={{
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            background: '#e0e7ff',
                                            color: '#3730a3'
                                        }}>
                                            Not Verified
                                        </div>
                                    )}
                                </div>

                                {/* Call Buttons */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    {/* Regular Call Button */}
                                    <button
                                        onClick={() => startCall(selectedOwner, {
                                            purpose: 'Owner Verification',
                                            entityId: currentItem.id,
                                            entityType: 'deal_intake'
                                        }, handleCallOutcome)}
                                        style={{
                                            padding: '8px',
                                            borderRadius: '6px',
                                            border: 'none',
                                            background: verificationStatus === 'confirmed' ? '#10b981' : '#3b82f6',
                                            color: '#fff',
                                            cursor: 'pointer',
                                            fontSize: '0.85rem',
                                            fontWeight: 600,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '6px'
                                        }}
                                        title="Call via system app"
                                    >
                                        <i className="fas fa-phone"></i>
                                        Call
                                    </button>

                                    {/* WhatsApp Call Button */}
                                    <button
                                        onClick={() => startWhatsAppCall(selectedOwner, {
                                            purpose: 'Owner Verification',
                                            entityId: currentItem.id,
                                            entityType: 'deal_intake'
                                        }, handleCallOutcome)}
                                        style={{
                                            padding: '8px',
                                            borderRadius: '6px',
                                            border: 'none',
                                            background: verificationStatus === 'confirmed' ? '#10b981' : '#25D366',
                                            color: '#fff',
                                            cursor: 'pointer',
                                            fontSize: '0.85rem',
                                            fontWeight: 600,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '6px'
                                        }}
                                        title="Call via WhatsApp"
                                    >
                                        <i className="fab fa-whatsapp"></i>
                                        WhatsApp
                                    </button>
                                </div>
                            </div>

                            {/* Change Owner Dropdown */}
                            {detectedContacts.length > 1 && (
                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '6px' }}>
                                        Change Owner:
                                    </label>
                                    <select
                                        value={selectedOwner?.mobile || ''}
                                        onChange={(e) => {
                                            const contact = detectedContacts.find(c => c.mobile === e.target.value);
                                            setSelectedOwner(contact);
                                            setVerificationStatus(null); // Reset verification when changing owner
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px',
                                            borderRadius: '6px',
                                            border: '1px solid #cbd5e1',
                                            fontSize: '0.85rem',
                                            background: '#fff'
                                        }}
                                    >
                                        {detectedContacts.map((contact, idx) => (
                                            <option key={idx} value={contact.mobile}>
                                                {contact.name} - {contact.mobile}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Add to CRM Button */}
                            {selectedOwner?.isNew && (
                                <button
                                    onClick={() => onOpenAddContact(selectedOwner.mobile)}
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        borderRadius: '6px',
                                        border: '1px solid #bbf7d0',
                                        background: '#dcfce7',
                                        color: '#166534',
                                        cursor: 'pointer',
                                        fontSize: '0.8rem',
                                        fontWeight: 600
                                    }}
                                >
                                    <i className="fas fa-plus" style={{ marginRight: '6px' }}></i>
                                    Add to CRM
                                </button>
                            )}
                        </>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>
                            <i className="fas fa-user-slash" style={{ fontSize: '2rem', marginBottom: '12px', opacity: 0.3 }}></i>
                            <div style={{ fontSize: '0.85rem', marginBottom: '12px' }}>No contacts detected</div>
                            <button
                                onClick={() => onOpenAddContact()}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '6px',
                                    border: '1px solid #cbd5e1',
                                    background: '#fff',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                    fontWeight: 600
                                }}
                            >
                                + Add Manually
                            </button>
                        </div>
                    )}
                </div>

                {/* Property Section */}
                <div style={{ background: '#fff', border: '2px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                        <i className="fas fa-home" style={{ color: '#8b5cf6', fontSize: '1.1rem' }}></i>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Property</h3>
                    </div>

                    {selectedProperty ? (
                        <>
                            {/* Selected Property Display */}
                            <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                                <div style={{ fontWeight: 700, color: '#6b21a8', marginBottom: '4px' }}>
                                    Unit {selectedProperty.unitNo}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '8px' }}>
                                    {selectedProperty.location}
                                </div>
                                {matchScore > 0 && (
                                    <div style={{
                                        display: 'inline-block',
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        background: `${confidenceColor(matchScore)}20`,
                                        color: confidenceColor(matchScore),
                                        fontSize: '0.75rem',
                                        fontWeight: 700
                                    }}>
                                        {matchScore}% Match
                                    </div>
                                )}
                            </div>

                            {/* Change Property */}
                            {matchedInventory && matchedInventory.length > 1 && (
                                <select
                                    value={selectedProperty?.id || ''}
                                    onChange={(e) => {
                                        const match = matchedInventory.find(m => m.inventory.id === e.target.value);
                                        setSelectedProperty(match?.inventory);
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        border: '1px solid #cbd5e1',
                                        fontSize: '0.85rem',
                                        background: '#fff',
                                        marginBottom: '8px'
                                    }}
                                >
                                    {matchedInventory.map((match, idx) => (
                                        <option key={idx} value={match.inventory.id}>
                                            Unit {match.inventory.unitNo} - {match.inventory.location} ({match.score}%)
                                        </option>
                                    ))}
                                </select>
                            )}
                        </>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>
                            <i className="fas fa-home" style={{ fontSize: '2rem', marginBottom: '12px', opacity: 0.3 }}></i>
                            <div style={{ fontSize: '0.85rem', marginBottom: '12px' }}>No property matched</div>
                        </div>
                    )}

                    <button
                        style={{
                            width: '100%',
                            padding: '8px',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            background: '#fff',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: '#64748b'
                        }}
                    >
                        <i className="fas fa-plus" style={{ marginRight: '6px' }}></i>
                        Add New Property
                    </button>
                </div>
            </div>

            {/* Deal Details Section */}
            <div style={{ background: '#fff', border: '2px solid #e2e8f0', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <i className="fas fa-file-contract" style={{ color: '#10b981', fontSize: '1.1rem' }}></i>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Deal Information</h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
                    {/* Deal Type */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>
                            Type
                        </label>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                <input
                                    type="radio"
                                    checked={dealType === 'Sell'}
                                    onChange={() => setDealType('Sell')}
                                />
                                <span style={{ fontSize: '0.9rem' }}>Sell</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                <input
                                    type="radio"
                                    checked={dealType === 'Rent'}
                                    onChange={() => setDealType('Rent')}
                                />
                                <span style={{ fontSize: '0.9rem' }}>Rent</span>
                            </label>
                        </div>
                    </div>

                    {/* Price */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>
                            Price (₹)
                        </label>
                        <input
                            type="text"
                            value={dealPrice}
                            onChange={(e) => setDealPrice(e.target.value)}
                            placeholder="Enter amount"
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.9rem'
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                    onClick={onBack}
                    style={{
                        padding: '12px 24px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        background: '#fff',
                        color: '#64748b',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: 600
                    }}
                >
                    <i className="fas fa-arrow-left" style={{ marginRight: '8px' }}></i>
                    Back to Intake
                </button>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={onSkip}
                        style={{
                            padding: '12px 24px',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            background: '#f8fafc',
                            color: '#64748b',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            fontWeight: 600
                        }}
                    >
                        Skip for Now
                    </button>

                    <button
                        onClick={handleCreateDeal}
                        disabled={verificationStatus && verificationStatus.includes('not-interested')}
                        style={{
                            padding: '12px 32px',
                            borderRadius: '8px',
                            border: 'none',
                            background: (verificationStatus && verificationStatus.includes('not-interested'))
                                ? '#cbd5e1'
                                : 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                            color: '#fff',
                            cursor: (verificationStatus && verificationStatus.includes('not-interested')) ? 'not-allowed' : 'pointer',
                            fontSize: '0.9rem',
                            fontWeight: 700,
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                            opacity: (verificationStatus && verificationStatus.includes('not-interested')) ? 0.5 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        <i className="fas fa-check"></i>
                        Create Deal
                        {!verificationStatus && ' (Unverified)'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuickDealForm;
