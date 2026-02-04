import React, { useState, useEffect } from 'react';

const AlgorithmSettingsModal = ({ isOpen, onClose, weights, onSave }) => {
    const [tempWeights, setTempWeights] = useState({
        location: 30,
        type: 20,
        budget: 25,
        size: 25
    });

    useEffect(() => {
        if (weights) {
            setTempWeights(weights);
        }
    }, [weights, isOpen]);

    if (!isOpen) return null;

    const handleSliderChange = (key, value) => {
        setTempWeights(prev => ({
            ...prev,
            [key]: parseInt(value)
        }));
    };

    const handleReset = () => {
        setTempWeights({
            location: 30,
            type: 20,
            budget: 25,
            size: 25
        });
    };

    const totalWeight = tempWeights.location + tempWeights.type + tempWeights.budget + tempWeights.size;

    const overlayStyle = {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(8px)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
    };

    const modalStyle = {
        backgroundColor: '#fff',
        width: '100%',
        maxWidth: '500px',
        borderRadius: '24px',
        padding: '32px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        animation: 'modalSlideUp 0.3s ease-out'
    };

    const sectionStyle = {
        marginBottom: '24px'
    };

    const sliderContainerStyle = {
        marginBottom: '20px'
    };

    const labelContainerStyle = {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px'
    };

    const labelStyle = {
        fontSize: '0.9rem',
        fontWeight: 700,
        color: '#1e293b'
    };

    const valueStyle = {
        fontSize: '0.9rem',
        fontWeight: 800,
        color: '#3b82f6',
        background: '#eff6ff',
        padding: '2px 8px',
        borderRadius: '6px'
    };

    const sliderStyle = {
        width: '100%',
        height: '6px',
        borderRadius: '3px',
        background: '#e2e8f0',
        outline: 'none',
        appearance: 'none',
        cursor: 'pointer',
        accentColor: '#3b82f6'
    };

    return (
        <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div style={modalStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Algorithm Settings</h2>
                    <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '1.25rem' }}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>
                <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '32px' }}>
                    Adjust the priority of different matching criteria to refine results.
                </p>

                <div style={sectionStyle}>
                    {Object.entries(tempWeights).map(([key, value]) => (
                        <div key={key} style={sliderContainerStyle}>
                            <div style={labelContainerStyle}>
                                <label style={labelStyle}>{key.charAt(0).toUpperCase() + key.slice(1)} Weight</label>
                                <span style={valueStyle}>{value} pts</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="50"
                                value={value}
                                onChange={(e) => handleSliderChange(key, e.target.value)}
                                style={sliderStyle}
                            />
                        </div>
                    ))}
                </div>

                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b' }}>TOTAL POSSIBLE POINTS</span>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>{totalWeight} / 100</div>
                    </div>
                    <button
                        onClick={handleReset}
                        style={{ background: 'transparent', border: '1px solid #e2e8f0', color: '#64748b', padding: '8px 16px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                    >
                        <i className="fas fa-undo"></i> Reset
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={onClose}
                        style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onSave(tempWeights)}
                        style={{ flex: 2, padding: '12px', borderRadius: '12px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.3)' }}
                    >
                        Save Settings
                    </button>
                </div>
            </div>

            <style>{`
                @keyframes modalSlideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
};

export default AlgorithmSettingsModal;
