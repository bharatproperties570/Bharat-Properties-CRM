import React, { useState } from 'react';
import { usePropertyConfig } from '../../../context/PropertyConfigContext';

const CustomizeFeedbackPage = ({ isEmbedded }) => {
    const { masterFields, updateMasterFields } = usePropertyConfig();
    const [selectedOutcome, setSelectedOutcome] = useState(masterFields.propertyOwnerFeedback[0] || '');
    const [newReason, setNewReason] = useState('');
    const [newOutcome, setNewOutcome] = useState('');
    const [showOutcomeAdd, setShowOutcomeAdd] = useState(false);

    const outcomes = masterFields.propertyOwnerFeedback || [];
    const reasonsMapping = masterFields.feedbackReasons || {};
    const currentReasons = reasonsMapping[selectedOutcome] || [];

    const labelStyle = {
        fontSize: '0.8rem',
        fontWeight: 700,
        color: '#475569',
        marginBottom: '6px',
        display: 'block',
        textTransform: 'uppercase',
        letterSpacing: '0.05em'
    };

    const customSelectStyle = {
        width: '100%',
        padding: '10px 12px',
        paddingRight: '30px',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        fontSize: '0.9rem',
        outline: 'none',
        background: '#f8fafc',
        color: '#475569',
        appearance: 'none',
        WebkitAppearance: 'none',
        MozAppearance: 'none',
        backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23475569%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
        backgroundSize: '12px',
        transition: 'all 0.2s'
    };

    const glowButtonStyle = (isActive, color) => ({
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        border: 'none',
        background: isActive ? color : '#e2e8f0',
        color: isActive ? '#fff' : '#94a3b8',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.75rem',
        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        outline: 'none',
        boxShadow: isActive ? `0 0 10px ${color}60, 0 2px 4px ${color}40` : 'none',
        transform: isActive ? 'scale(1.1)' : 'scale(1)'
    });

    const handleAddOutcome = () => {
        if (!newOutcome.trim()) return;
        const updatedOutcomes = [...outcomes, newOutcome.trim()];
        updateMasterFields('propertyOwnerFeedback', updatedOutcomes);
        setSelectedOutcome(newOutcome.trim());
        setNewOutcome('');
        setShowOutcomeAdd(false);
    };

    const handleDeleteOutcome = (outcomeToDelete) => {
        const updatedOutcomes = outcomes.filter(o => o !== outcomeToDelete);
        const updatedReasons = { ...reasonsMapping };
        delete updatedReasons[outcomeToDelete];

        updateMasterFields('propertyOwnerFeedback', updatedOutcomes);
        updateMasterFields('feedbackReasons', updatedReasons);

        if (selectedOutcome === outcomeToDelete) {
            setSelectedOutcome(updatedOutcomes[0] || '');
        }
    };

    const handleAddReason = () => {
        if (!newReason.trim() || !selectedOutcome) return;
        const updatedReasons = {
            ...reasonsMapping,
            [selectedOutcome]: [...currentReasons, newReason.trim()]
        };
        updateMasterFields('feedbackReasons', updatedReasons);
        setNewReason('');
    };

    const handleDeleteReason = (reasonToDelete) => {
        const updatedReasons = {
            ...reasonsMapping,
            [selectedOutcome]: currentReasons.filter(r => r !== reasonToDelete)
        };
        updateMasterFields('feedbackReasons', updatedReasons);
    };

    return (
        <div style={{ flex: 1, padding: isEmbedded ? '0' : '32px 40px', background: isEmbedded ? 'transparent' : '#fff', overflowY: 'auto' }}>
            {!isEmbedded && (
                <div style={{ marginBottom: '32px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Feedback Outcomes & Reasons</h2>
                    <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Configure the outcome options for property interactions and map them to specific reasons.</p>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '40px', alignItems: 'start' }}>
                {/* Outcomes List */}
                <div style={{ background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Outcomes</h3>
                        <button
                            onClick={() => setShowOutcomeAdd(true)}
                            style={{ background: '#3b82f6', color: '#fff', border: 'none', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            <i className="fas fa-plus"></i>
                        </button>
                    </div>

                    {showOutcomeAdd && (
                        <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
                            <input
                                type="text"
                                value={newOutcome}
                                onChange={(e) => setNewOutcome(e.target.value)}
                                placeholder="e.g. Follow Up"
                                style={{ flex: 1, padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem' }}
                            />
                            <button onClick={handleAddOutcome} style={{ background: '#10b981', color: '#fff', border: 'none', padding: '0 12px', borderRadius: '6px', cursor: 'pointer' }}><i className="fas fa-check"></i></button>
                            <button onClick={() => setShowOutcomeAdd(false)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '0 12px', borderRadius: '6px', cursor: 'pointer' }}><i className="fas fa-times"></i></button>
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {outcomes.map(outcome => (
                            <div
                                key={outcome}
                                onClick={() => setSelectedOutcome(outcome)}
                                style={{
                                    padding: '12px 16px',
                                    borderRadius: '8px',
                                    background: selectedOutcome === outcome ? '#eff6ff' : '#fff',
                                    border: selectedOutcome === outcome ? '1px solid #3b82f6' : '1px solid #e2e8f0',
                                    color: selectedOutcome === outcome ? '#1e40af' : '#475569',
                                    fontWeight: selectedOutcome === outcome ? 700 : 500,
                                    fontSize: '0.9rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <span>{outcome}</span>
                                {selectedOutcome === outcome && (
                                    <i className="fas fa-chevron-right" style={{ fontSize: '0.7rem' }}></i>
                                )}
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteOutcome(outcome); }}
                                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px', opacity: selectedOutcome === outcome ? 1 : 0 }}
                                    className="delete-btn"
                                >
                                    <i className="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Reasons List */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px' }}>
                    <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '16px', marginBottom: '24px' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
                            Reasons for <span style={{ color: '#3b82f6' }}>{selectedOutcome}</span>
                        </h3>
                        <p style={{ color: '#64748b', fontSize: '0.85rem' }}>These options will appear when "{selectedOutcome}" is selected in the feedback form.</p>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                        <input
                            type="text"
                            value={newReason}
                            onChange={(e) => setNewReason(e.target.value)}
                            placeholder="Add a specific reason..."
                            style={{ flex: 1, padding: '10px 16px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem' }}
                        />
                        <button
                            onClick={handleAddReason}
                            style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '0 24px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                        >
                            Add Reason
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {currentReasons.map(reason => {
                            const rule = (masterFields.feedbackRules && masterFields.feedbackRules[selectedOutcome] && masterFields.feedbackRules[selectedOutcome][reason]) || {};

                            const updateRule = (field, value) => {
                                const updatedRules = { ...(masterFields.feedbackRules || {}) };
                                if (!updatedRules[selectedOutcome]) updatedRules[selectedOutcome] = {};
                                updatedRules[selectedOutcome][reason] = {
                                    ...updatedRules[selectedOutcome][reason],
                                    [field]: value
                                };
                                updateMasterFields('feedbackRules', updatedRules);
                            };

                            return (
                                <div
                                    key={reason}
                                    style={{
                                        padding: '16px',
                                        background: '#f8fafc',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '12px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '12px',
                                        fontSize: '0.85rem',
                                        color: '#334155',
                                        fontWeight: 500
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>{reason}</span>
                                        <button
                                            onClick={() => handleDeleteReason(reason)}
                                            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                                        >
                                            <i className="fas fa-trash-alt"></i>
                                        </button>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                <label style={{ ...labelStyle, marginBottom: 0 }}>Smart Message</label>
                                                <label className="chk-toggle" style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={rule.sendMsg !== false}
                                                        onChange={(e) => updateRule('sendMsg', e.target.checked)}
                                                        style={{ opacity: 0, width: 0, height: 0 }}
                                                    />
                                                    <span style={{
                                                        position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                                                        backgroundColor: rule.sendMsg !== false ? '#3b82f6' : '#cbd5e1', borderRadius: '34px', transition: '.4s'
                                                    }}></span>
                                                    <span style={{
                                                        position: 'absolute', content: '""', height: '14px', width: '14px', left: rule.sendMsg !== false ? '18px' : '4px', bottom: '3px',
                                                        backgroundColor: 'white', borderRadius: '50%', transition: '.4s'
                                                    }}></span>
                                                </label>
                                            </div>
                                            <select
                                                value={rule.templateKey || ''}
                                                onChange={(e) => updateRule('templateKey', e.target.value)}
                                                disabled={rule.sendMsg === false}
                                                style={{ ...customSelectStyle, opacity: rule.sendMsg === false ? 0.5 : 1 }}
                                            >
                                                <option value="">Default (Outcome Template)</option>
                                                {Object.keys(masterFields.responseTemplates || {}).map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                <label style={{ ...labelStyle, marginBottom: 0 }}>Auto Triggers</label>
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    {[
                                                        { id: 'sendWhatsapp', icon: 'fab fa-whatsapp', color: '#25d366', title: 'WhatsApp' },
                                                        { id: 'sendSms', icon: 'fas fa-comment-alt', color: '#3b82f6', title: 'SMS' },
                                                        { id: 'sendEmail', icon: 'fas fa-envelope', color: '#f97316', title: 'Email' }
                                                    ].map(ch => (
                                                        <button
                                                            key={ch.id}
                                                            onClick={() => updateRule(ch.id, !rule[ch.id])}
                                                            style={glowButtonStyle(!!rule[ch.id], ch.color)}
                                                            title={`Default ${ch.title} ON`}
                                                        >
                                                            <i className={ch.icon}></i>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <select
                                                value={rule.actionType || ''}
                                                onChange={(e) => updateRule('actionType', e.target.value)}
                                                style={customSelectStyle}
                                            >
                                                <option value="">Default (System Smart Logic)</option>
                                                <option value="None">None (End Cycle)</option>
                                                {(masterFields.followUpActions || []).map(a => <option key={a} value={a}>{a}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    {rule.sendMsg !== false && (
                                        <div style={{ marginTop: '16px' }}>
                                            <label style={labelStyle}>Custom Message Content (Override)</label>
                                            <textarea
                                                id={`msg-editor-${selectedOutcome}-${reason}`}
                                                placeholder="Type custom message here or leave blank to use template..."
                                                value={rule.customMessage || ''}
                                                onChange={(e) => updateRule('customMessage', e.target.value)}
                                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '0.9rem', minHeight: '80px', resize: 'vertical', outline: 'none', color: '#475569' }}
                                            />
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Click to insert:</span>
                                                {['{owner}', '{unit}', '{reason}', '{time}'].map(tag => (
                                                    <button
                                                        key={tag}
                                                        onClick={() => {
                                                            const textarea = document.getElementById(`msg-editor-${selectedOutcome}-${reason}`);
                                                            if (!textarea) return;

                                                            const start = textarea.selectionStart;
                                                            const end = textarea.selectionEnd;
                                                            const text = rule.customMessage || '';
                                                            const before = text.substring(0, start);
                                                            const after = text.substring(end);
                                                            const newValue = before + tag + after;

                                                            updateRule('customMessage', newValue);

                                                            // Optional: Refocus and set cursor
                                                            setTimeout(() => {
                                                                textarea.focus();
                                                                textarea.setSelectionRange(start + tag.length, start + tag.length);
                                                            }, 0);
                                                        }}
                                                        style={{
                                                            fontSize: '0.7rem',
                                                            padding: '4px 10px',
                                                            background: '#fff',
                                                            border: '1px solid #cbd5e1',
                                                            borderRadius: '6px',
                                                            color: '#334155',
                                                            fontWeight: 700,
                                                            cursor: 'pointer',
                                                            transition: 'all 0.2s',
                                                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                                        }}
                                                        onMouseEnter={(e) => { e.target.style.background = '#eff6ff'; e.target.style.borderColor = '#3b82f6'; e.target.style.color = '#2563eb'; }}
                                                        onMouseLeave={(e) => { e.target.style.background = '#fff'; e.target.style.borderColor = '#cbd5e1'; e.target.style.color = '#334155'; }}
                                                    >
                                                        {tag}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {currentReasons.length === 0 && (
                            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                                No specific reasons configured for this outcome.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                .delete-btn:hover { color: #ef4444 !important; }
            `}</style>
        </div>
    );
};

export default CustomizeFeedbackPage;
