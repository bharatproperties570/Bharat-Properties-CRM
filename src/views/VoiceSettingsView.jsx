import React, { useState, useRef, useEffect } from 'react';

// --- Sub-Components (Defined Outside) ---

const ScriptModal = ({ isOpen, onClose, onSave, editingScript }) => {
    const [scriptData, setScriptData] = useState({ name: '', tags: [], content: '' });
    const editorRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            if (editingScript) setScriptData(editingScript);
            else setScriptData({ name: '', tags: [], content: '' });
        }
    }, [isOpen, editingScript]);

    useEffect(() => {
        if (isOpen && editorRef.current) {
            editorRef.current.innerHTML = scriptData.content || '<div><br></div>';
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const execCommand = (command, value = null) => {
        if (editorRef.current) {
            editorRef.current.focus();
            document.execCommand(command, false, value);
            setScriptData(prev => ({ ...prev, content: editorRef.current.innerHTML }));
        }
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001 }}>
            <div style={{ background: '#fff', width: '700px', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                <div style={{ padding: '20px 32px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>{editingScript ? 'Edit script' : 'Add new script'}</h2>
                    <i className="fas fa-times" style={{ cursor: 'pointer', color: '#94a3b8' }} onClick={onClose}></i>
                </div>
                <div style={{ padding: '32px' }}>
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>Script name <span style={{ color: '#ef4444' }}>*</span></label>
                        <input type="text" value={scriptData.name} onChange={e => setScriptData({ ...scriptData, name: e.target.value })} style={{ width: '100%', padding: '10px 16px', border: '1px solid #e2e8f0', borderRadius: '8px' }} placeholder="e.g. Intro Call" />
                    </div>
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>Auto-assign this script with contacts tags</label>
                        <input type="text" value={scriptData.tags.join(', ')} onChange={e => setScriptData({ ...scriptData, tags: e.target.value.split(',').map(t => t.trim()) })} style={{ width: '100%', padding: '10px 16px', border: '1px solid #e2e8f0', borderRadius: '8px' }} placeholder="Search or create tags..." />
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>Script content <span style={{ color: '#ef4444' }}>*</span></label>
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                            <div style={{ padding: '8px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '12px', background: '#f8fafc' }}>
                                <button onClick={() => execCommand('bold')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}><i className="fas fa-bold"></i></button>
                                <button onClick={() => execCommand('italic')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}><i className="fas fa-italic"></i></button>
                                <button onClick={() => execCommand('underline')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}><i className="fas fa-underline"></i></button>
                                <button onClick={() => execCommand('insertUnorderedList')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}><i className="fas fa-list-ul"></i></button>
                            </div>
                            <div ref={editorRef} contentEditable style={{ padding: '16px', minHeight: '150px', outline: 'none', fontSize: '0.95rem', color: '#1e293b' }} onInput={e => setScriptData({ ...scriptData, content: e.target.innerHTML })}></div>
                        </div>
                    </div>
                </div>
                <div style={{ padding: '20px 32px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button className="btn-outline" onClick={onClose} style={{ background: '#fff' }}>Cancel</button>
                    <button className="btn-primary" onClick={() => { onSave(scriptData); onClose(); }}>Save</button>
                </div>
            </div>
        </div>
    );
};

const VoiceSettingsView = () => {
    const [subTab, setSubTab] = useState('connection');
    const [phoneToActivate, setPhoneToActivate] = useState('9991000570');
    const [outcomes, setOutcomes] = useState(['Interested', 'Not interested', 'Left voicemail', 'No answer']);
    const [addingOutcome, setAddingOutcome] = useState(false);
    const [newOutcome, setNewOutcome] = useState('');
    const [scripts, setScripts] = useState([
        { id: 1, name: 'Sample Call Script', tags: ['Intro'], content: 'Hello, this is Real Deal Properties...' },
        { id: 2, name: 'Sale Calling', tags: ['Lead'], content: 'I am calling regarding the property you viewed...' }
    ]);
    const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
    const [editingScript, setEditingScript] = useState(null);
    const [templateType, setTemplateType] = useState('sms');

    const tabs = [
        { id: 'connection', label: 'Connection' },
        { id: 'outcomes', label: 'Call Outcomes' },
        { id: 'scripts', label: 'Scripts' },
        { id: 'recordings', label: 'Recordings' },
        { id: 'logs', label: 'Logs' },
        { id: 'visibility', label: 'Visibility' },
        { id: 'block-list', label: 'Block list' },
        { id: 'other', label: 'Other' }
    ];

    const renderTabs = () => (
        <div style={{ display: 'flex', gap: '24px', borderBottom: '1px solid #f1f5f9', marginBottom: '32px' }}>
            {tabs.map(tab => (
                <div
                    key={tab.id}
                    onClick={() => setSubTab(tab.id)}
                    style={{
                        padding: '12px 0',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        color: subTab === tab.id ? 'var(--primary-color)' : '#64748b',
                        borderBottom: subTab === tab.id ? '2px solid var(--primary-color)' : '2px solid transparent',
                        cursor: 'pointer'
                    }}
                >
                    {tab.label}
                </div>
            ))}
        </div>
    );

    const renderConnection = () => (
        <div style={{ display: 'flex', gap: '24px' }}>
            {/* Twilio Activation Card */}
            <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '32px', textAlign: 'center' }}>
                <div style={{ width: '64px', height: '64px', background: '#f8fafc', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px auto' }}>
                    <i className="fas fa-mobile-alt" style={{ fontSize: '1.5rem', color: 'var(--primary-color)' }}></i>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '8px' }}>Powered by Twilio</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px' }}>Enter your phone number to activate your account:</div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <input type="text" value={phoneToActivate} onChange={e => setPhoneToActivate(e.target.value)} style={{ padding: '10px 16px', border: '1px solid #e2e8f0', borderRadius: '6px', width: '200px' }} />
                    <button className="btn-primary" style={{ padding: '10px 24px' }}>Send code</button>
                </div>
                <div style={{ marginTop: '16px', fontSize: '0.85rem', color: 'var(--primary-color)', cursor: 'pointer', fontWeight: 600 }}>Activate Telephony Services</div>
            </div>

            {/* General Card */}
            <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '32px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '64px', height: '64px', background: '#f8fafc', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
                    <i className="fas fa-phone-volume" style={{ fontSize: '1.5rem', color: 'var(--primary-color)' }}></i>
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>Make and receive calls</div>
            </div>

            {/* Provider Card (TATA Tele) */}
            <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '32px', textAlign: 'center', position: 'relative' }}>
                <i className="fas fa-times" style={{ position: 'absolute', top: '16px', right: '16px', color: '#ef4444', cursor: 'pointer' }}></i>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '24px' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#1e293b' }}>TATA Tele</div>
                    <div style={{ background: '#f97316', color: '#fff', fontSize: '0.65rem', padding: '2px 4px', borderRadius: '4px', fontWeight: 800 }}>DO BIG</div>
                </div>
                <button className="btn-primary" style={{ background: '#0f172a', padding: '10px 32px' }}>Connect</button>
                <div style={{ marginTop: '16px', fontSize: '0.85rem', color: '#64748b' }}>(For Call logs and calls) <i className="far fa-question-circle" style={{ marginLeft: '4px' }}></i></div>
            </div>
        </div>
    );

    const renderOutcomes = () => (
        <div style={{ maxWidth: '800px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
                <label style={{ fontSize: '0.9rem', color: '#64748b' }}>Call outcomes can be added by</label>
                <select style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem', color: '#1e293b', fontWeight: 600 }}>
                    <option>All users</option>
                    <option>Admins only</option>
                </select>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Specify whether you want users on your account to be able to add, modify and remove call outcomes.</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {outcomes.map((outcome, idx) => (
                    <div key={idx} style={{ background: '#f8fafc', padding: '12px 24px', borderRadius: '2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#475569' }}>{outcome}</div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="btn-outline" style={{ padding: '4px 12px', fontSize: '0.75rem', background: '#fff' }}>Edit</button>
                            <button style={{ padding: '4px 8px', border: 'none', background: '#ef4444', color: '#fff', borderRadius: '4px', cursor: 'pointer' }} onClick={() => setOutcomes(outcomes.filter(o => o !== outcome))}><i className="fas fa-times"></i></button>
                        </div>
                    </div>
                ))}
            </div>

            <button
                className="btn-outline"
                style={{ marginTop: '16px', color: 'var(--primary-color)', border: '1px solid var(--primary-color)', fontSize: '0.85rem', fontWeight: 600 }}
                onClick={() => setAddingOutcome(true)}
            >
                + Add Call Outcome
            </button>

            {addingOutcome && (
                <div style={{ marginTop: '16px', padding: '24px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '0.9rem', color: '#64748b' }}>Outcome</span>
                        <input type="text" value={newOutcome} onChange={e => setNewOutcome(e.target.value)} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: '6px', flex: 1 }} />
                    </div>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '16px', justifyContent: 'flex-start' }}>
                        <button className="btn-primary" onClick={() => { if (newOutcome) setOutcomes([...outcomes, newOutcome]); setAddingOutcome(false); setNewOutcome(''); }} style={{ padding: '8px 24px' }}>Save</button>
                        <button className="btn-outline" onClick={() => setAddingOutcome(false)} style={{ padding: '8px 24px', background: '#fff' }}>Cancel</button>
                    </div>
                </div>
            )}
        </div>
    );

    const renderScripts = () => (
        <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
                {scripts.map(script => (
                    <div key={script.id} style={{ background: '#f8fafc', padding: '16px 24px', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>{script.name}</div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Tags: {script.tags.join(', ')}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <button className="btn-outline" style={{ background: '#fff', fontSize: '0.8rem' }} onClick={() => { setEditingScript(script); setIsScriptModalOpen(true); }}>Edit</button>
                            <i className="fas fa-trash-alt" style={{ color: '#cbd5e1', cursor: 'pointer' }} onClick={() => setScripts(scripts.filter(s => s.id !== script.id))}></i>
                        </div>
                    </div>
                ))}
            </div>
            <button className="btn-outline" style={{ color: 'var(--primary-color)', border: '1px solid var(--primary-color)', fontWeight: 600 }} onClick={() => { setEditingScript(null); setIsScriptModalOpen(true); }}>+ Add call script</button>
        </div>
    );

    const renderVisibility = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '800px' }}>
            <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '8px' }}>Changes to visibility settings will be applied to all past call as well as all future call once they are saved. Any call in which manual visibility settings were applied will remain the same. <i className="far fa-info-circle"></i></div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>My Call conversations on Leads are</span>
                <select style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '0.85rem' }}>
                    <option>Visible to users</option>
                    <option>Visible to only me</option>
                </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>My Call conversations on Contacts are</span>
                <select style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '0.85rem' }}>
                    <option>Visible to users only if I\'m an owner or d</option>
                </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f8fafc' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>My Call conversations on Deals are</span>
                <select style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '0.85rem' }}>
                    <option>Visible to users only if I\'m an owner</option>
                </select>
            </div>
            <button className="btn-primary" style={{ width: 'fit-content', padding: '8px 24px', marginTop: '16px' }}>Save</button>
        </div>
    );

    const renderBlocklist = () => (
        <div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>Block Numbers</div>
            <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '24px' }}>One on one calls with specified numbers will never be allowed or logged in CRM.</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '32px' }}>
                <input type="text" style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: '4px', width: '240px' }} placeholder="+91..." />
                <button className="btn-outline" style={{ padding: '8px 16px' }}>+</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                    { name: 'Gagan Deep Singh Paviduta', num: '+91-9999888212' },
                    { name: 'Anu Chaudhary', num: '+91-8507343211' }
                ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>{item.name}</span>
                            <span style={{ fontSize: '0.9rem', color: '#64748b' }}>{item.num}</span>
                        </div>
                        <span style={{ fontSize: '0.85rem', color: '#94a3b8', cursor: 'pointer' }}>Unblock</span>
                    </div>
                ))}
            </div>
        </div>
    );


    const renderOther = () => (
        <div style={{ maxWidth: '800px' }}>
            <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>Advanced Call Settings</h3>
                <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>Bridge Phone Number (for Outbound Transfer)</label>
                        <input type="text" placeholder="(123) 456-7890" style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px' }} />
                    </div>
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>IVR Menu Selection</label>
                        <select style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                            <option>Default Main Menu</option>
                            <option>Sales Hotline Menu</option>
                            <option>Support Queue Menu</option>
                        </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <input type="checkbox" id="masking" />
                        <label htmlFor="masking" style={{ fontSize: '0.9rem', color: '#475569', fontWeight: 600 }}>Enable Number Masking (Caller ID Replacement)</label>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>
            <div style={{ padding: '32px 40px', borderBottom: '1px solid #f1f5f9' }}>
                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase' }}>Calls Settings</h2>
                <div style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '8px' }}>Manage your voice calls and telephony settings.</div>
            </div>

            <div style={{ flex: 1, padding: '32px 40px', overflowY: 'auto' }}>
                {renderTabs()}

                {subTab === 'connection' && renderConnection()}
                {subTab === 'outcomes' && renderOutcomes()}
                {subTab === 'scripts' && renderScripts()}
                {subTab === 'visibility' && renderVisibility()}
                {subTab === 'block-list' && renderBlocklist()}
                {subTab === 'other' && renderOther()}
                {['recordings', 'logs'].includes(subTab) && (
                    <div style={{ padding: '80px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                        <i className="fas fa-history" style={{ fontSize: '3rem', color: '#cbd5e1', marginBottom: '20px' }}></i>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>{tabs.find(t => t.id === subTab).label} Storage</h3>
                        <p style={{ color: '#64748b' }}>Logs and recordings will appear here after your first call.</p>
                    </div>
                )}
            </div>

            <ScriptModal
                isOpen={isScriptModalOpen}
                onClose={() => setIsScriptModalOpen(false)}
                onSave={(data) => {
                    if (editingScript) setScripts(scripts.map(s => s.id === editingScript.id ? { ...data, id: s.id } : s));
                    else setScripts([...scripts, { ...data, id: Date.now() }]);
                }}
                editingScript={editingScript}
            />
        </div>
    );
};

export default VoiceSettingsView;
