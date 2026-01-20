import React, { useState } from 'react';

const PresetRow = ({ label, channels }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ fontSize: '0.9rem', color: '#1e293b', fontWeight: 500 }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.8rem', color: '#64748b' }}>
                <span>By:</span>
                {channels.map(ch => (
                    <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: ch.enabled ? 1 : 0.4 }}>
                        <i className={ch.icon}></i>
                        <span>{ch.label}</span>
                    </div>
                ))}
            </div>
            <button
                style={{ padding: '4px 12px', border: '1px solid #e2e8f0', background: '#fff', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer' }}
            >
                Edit
            </button>
        </div>
    </div>
);

const PersonalizedItem = ({ title, triggers }) => (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '16px', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', background: 'rgba(248, 250, 252, 0.5)' }}>
            <div style={{ fontSize: '0.9rem', color: '#1e293b', fontWeight: 500 }}>{title}</div>
            <div style={{ display: 'flex', gap: '8px' }}>
                <button style={{ padding: '4px 12px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer' }}>Edit</button>
                <button style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', opacity: 0.6 }}><i className="fas fa-trash-alt"></i></button>
            </div>
        </div>
        <div style={{ padding: '0 16px', background: '#fff' }}>
            {triggers.map((t, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: idx < triggers.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <div style={{ fontSize: '0.85rem', color: '#444' }}>{t.label}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.8rem', color: '#64748b' }}>
                        <span>By:</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><i className="fas fa-flag" style={{ opacity: 0.5 }}></i> Web Alert</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><i className="fas fa-envelope" style={{ opacity: 0.5 }}></i> Email</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><i className="fas fa-mobile-alt" style={{ opacity: 0.5 }}></i> Mobile Alert</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><i className="fas fa-comment" style={{ opacity: 0.5 }}></i> SMS</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><i className="fab fa-whatsapp" style={{ opacity: 0.5 }}></i> WhatsApp</div>
                    </div>
                </div>
            ))}
        </div>
    </div>
);

const NotificationSettingsPage = () => {
    const [subTab, setSubTab] = useState('preset'); // preset | personalized | web
    const [isAddingPersonalized, setIsAddingPersonalized] = useState(false);
    const [step, setStep] = useState(1);
    const [selectedEntity, setSelectedEntity] = useState(null);
    const [selectedFilter, setSelectedFilter] = useState('Select filter');
    const [selectedUser, setSelectedUser] = useState('Search or select users');
    const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
    const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);

    // Support for multiple triggers
    const [activeTriggers, setActiveTriggers] = useState([{ id: 1, label: 'Select trigger' }]);
    const [openTriggerIdx, setOpenTriggerIdx] = useState(null);

    const entities = [
        { id: 'leads', label: 'Leads', icon: 'fas fa-bullseye' },
        { id: 'contacts', label: 'Contacts', icon: 'fas fa-users' },
        { id: 'deals', label: 'Deals', icon: 'fas fa-dollar-sign' }
    ];

    const filters = [
        'belong to the users',
        'belong to the teams',
        'belong to the groups',
        'have me as a Collaborator/Owner',
        'have a score higher than',
        'have a certain status',
        'are hot',
        'have a certain stage',
        'have a value higher than'
    ];

    const usersList = ['Ramesh', 'Real Deal', 'Suraj'];

    const availableTriggers = [
        'a task is completed',
        'a note is added',
        'a file is added',
        'your email was first viewed',
        'a custom field changes',
        'the status changes',
        'a task is marked complete'
    ];

    const presetSections = [
        {
            title: 'Assignments and Mentions',
            rows: [
                { id: 1, label: 'When a Lead is assigned to me', channels: [{ id: 'web', label: 'Web Alert', icon: 'fas fa-flag', enabled: true }, { id: 'email', label: 'Email', icon: 'fas fa-envelope', enabled: true }] },
                { id: 2, label: 'When a Contact is assigned to me', channels: [{ id: 'web', label: 'Web alerts', icon: 'fas fa-flag', enabled: true }, { id: 'email', label: 'Email alerts', icon: 'fas fa-envelope', enabled: true }] },
                { id: 3, label: 'When a Deal is assigned to me', channels: [{ id: 'web', label: 'Web Alert', icon: 'fas fa-flag', enabled: true }, { id: 'email', label: 'Email', icon: 'fas fa-envelope', enabled: true }] },
                { id: 4, label: 'When a Task is assigned to me', channels: [{ id: 'web', label: 'Web Alert', icon: 'fas fa-flag', enabled: true }, { id: 'email', label: 'Email', icon: 'fas fa-envelope', enabled: true }, { id: 'whatsapp', label: 'Whatsapp', icon: 'fab fa-whatsapp', enabled: true }] },
                { id: 5, label: 'When I am mentioned', channels: [{ id: 'web', label: 'Web Alert', icon: 'fas fa-flag', enabled: true }, { id: 'email', label: 'Email', icon: 'fas fa-envelope', enabled: true }, { id: 'text', label: 'Text', icon: 'fas fa-comment', enabled: true }] }
            ]
        },
        {
            title: 'Reminders',
            rows: [
                { id: 6, label: 'When my Appointment is due', channels: [{ id: 'web', label: 'Web Alert', icon: 'fas fa-flag', enabled: true }, { id: 'email', label: 'Email', icon: 'fas fa-envelope', enabled: true }, { id: 'whatsapp', label: 'Whatsapp', icon: 'fab fa-whatsapp', enabled: true }, { id: 'text', label: 'Text', icon: 'fas fa-comment', enabled: true }] },
                { id: 7, label: 'When my Task is due', channels: [{ id: 'web', label: 'Web Alert', icon: 'fas fa-flag', enabled: true }, { id: 'email', label: 'Email', icon: 'fas fa-envelope', enabled: true }, { id: 'whatsapp', label: 'Whatsapp', icon: 'fab fa-whatsapp', enabled: true }, { id: 'text', label: 'Text', icon: 'fas fa-comment', enabled: true }] }
            ]
        }
    ];

    const personalizedList = [
        {
            title: <span>Notify me about Deals that <strong>are hot 🔥</strong></span>,
            triggers: [{ label: 'When your email was first viewed' }]
        },
        {
            title: 'Notify me about Leads',
            triggers: [{ label: 'When a task is completed' }]
        },
        {
            title: <span>Notify me about Leads which <strong>belong to the user: Ramesh</strong></span>,
            triggers: [
                { label: 'When a task is added' },
                { label: 'When the status changes' },
                { label: 'When a file is added' }
            ]
        }
    ];

    const resetWizard = () => {
        setIsAddingPersonalized(false);
        setStep(1);
        setSelectedEntity(null);
        setSelectedFilter('Select filter');
        setSelectedUser('Search or select users');
        setActiveTriggers([{ id: Date.now(), label: 'Select trigger' }]);
    };

    const addTrigger = () => {
        setActiveTriggers([...activeTriggers, { id: Date.now(), label: 'Select trigger' }]);
    };

    const removeTrigger = (id) => {
        if (activeTriggers.length > 1) {
            setActiveTriggers(activeTriggers.filter(t => t.id !== id));
        }
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>
            {/* Tabs Header */}
            <div style={{ display: 'flex', gap: '24px', padding: '0 40px', borderBottom: '1px solid #e2e8f0' }}>
                {['Preset notifications', 'Personalized notifications', 'Web notifications'].map(tab => {
                    const id = tab.split(' ')[0].toLowerCase();
                    return (
                        <div
                            key={id}
                            onClick={() => { setSubTab(id); resetWizard(); }}
                            style={{
                                padding: '16px 0',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                color: subTab === id ? 'var(--primary-color)' : '#94a3b8',
                                borderBottom: subTab === id ? '2px solid var(--primary-color)' : '2px solid transparent',
                                cursor: 'pointer'
                            }}
                        >
                            {tab}
                        </div>
                    );
                })}
            </div>

            {/* Scrollable Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px' }}>

                {subTab === 'preset' && (
                    <div>
                        {presetSections.map((section, idx) => (
                            <div key={idx} style={{ marginBottom: '40px' }}>
                                <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>{section.title}</h3>
                                {section.rows.map(row => (
                                    <PresetRow key={row.id} label={row.label} channels={row.channels} />
                                ))}
                            </div>
                        ))}
                    </div>
                )}

                {subTab === 'personalized' && (
                    <div>
                        {!isAddingPersonalized && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
                                <button
                                    className="btn-primary"
                                    onClick={() => { setIsAddingPersonalized(true); setStep(1); }}
                                    style={{ padding: '8px 20px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 700 }}
                                >
                                    Add new notification
                                </button>
                            </div>
                        )}

                        {isAddingPersonalized && (
                            <div style={{ background: '#fff', padding: '32px 0', marginBottom: '32px', position: 'relative' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                                    {/* Step 1 & 2: Entity & Filter Selection */}
                                    <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 500, color: '#64748b', minWidth: '120px', marginTop: '10px' }}>Notify me about</div>
                                        <div style={{ flex: 1 }}>
                                            {step === 1 ? (
                                                <div style={{ display: 'flex', gap: '12px' }}>
                                                    {entities.map(e => (
                                                        <button
                                                            key={e.id}
                                                            onClick={() => { setSelectedEntity(e); setStep(2); }}
                                                            style={{
                                                                padding: '10px 24px',
                                                                background: '#e2e8f0',
                                                                borderRadius: '4px',
                                                                border: 'none',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '8px',
                                                                fontWeight: 700,
                                                                color: '#444',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            <i className={e.icon}></i> {e.label}
                                                        </button>
                                                    ))}
                                                    <button onClick={() => setIsAddingPersonalized(false)} style={{ color: 'var(--primary-color)', fontSize: '0.9rem', cursor: 'pointer', border: 'none', background: 'none', marginLeft: '12px' }}>Cancel</button>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem', color: '#1e293b' }}>
                                                        {selectedEntity.label}
                                                        {selectedFilter !== 'Select filter' && <span>which <strong>{selectedFilter}: {selectedUser}</strong></span>}
                                                    </div>

                                                    {step === 2 && (
                                                        <>
                                                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                                                                <div style={{ position: 'relative' }}>
                                                                    <div
                                                                        onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                                                                        style={{ padding: '8px 16px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#fff', fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', minWidth: '180px' }}
                                                                    >
                                                                        {selectedFilter} <i className="fas fa-chevron-down" style={{ fontSize: '0.7rem', color: '#94a3b8' }}></i>
                                                                    </div>
                                                                    {isFilterDropdownOpen && (
                                                                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', marginTop: '4px', zIndex: 10 }}>
                                                                            {filters.map(f => (
                                                                                <div key={f} onClick={() => { setSelectedFilter(f); setIsFilterDropdownOpen(false); }} style={{ padding: '10px 16px', fontSize: '0.9rem', cursor: 'pointer' }}>{f}</div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {selectedFilter === 'belong to the users' && (
                                                                    <div style={{ position: 'relative' }}>
                                                                        <div
                                                                            onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                                                                            style={{ padding: '8px 16px', border: '1px solid #2563eb', borderRadius: '4px', background: '#fff', fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', minWidth: '220px' }}
                                                                        >
                                                                            {selectedUser} <i className="fas fa-chevron-down" style={{ fontSize: '0.7rem', color: '#94a3b8' }}></i>
                                                                        </div>
                                                                        {isUserDropdownOpen && (
                                                                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', marginTop: '4px', zIndex: 10 }}>
                                                                                {usersList.map(u => (
                                                                                    <div key={u} onClick={() => { setSelectedUser(u); setIsUserDropdownOpen(false); }} style={{ padding: '10px 16px', fontSize: '0.9rem', cursor: 'pointer' }}>{u}</div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div onClick={() => { }} style={{ color: 'var(--primary-color)', textDecoration: 'underline', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>Add filter</div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                                <button className="btn-primary" onClick={() => setStep(3)} style={{ padding: '10px 24px', borderRadius: '6px' }}>Save and choose triggers</button>
                                                                <button onClick={() => setIsAddingPersonalized(false)} style={{ color: 'var(--primary-color)', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700 }}>Cancel</button>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Step 3: Trigger Selection */}
                                    {step === 3 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                            {activeTriggers.map((at, idx) => (
                                                <div key={at.id} style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
                                                    <div style={{ fontSize: '0.95rem', fontWeight: 500, color: '#64748b', minWidth: '120px', marginTop: '10px' }}>{idx === 0 ? 'When' : ''}</div>
                                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                        <div style={{ position: 'relative' }}>
                                                            <div
                                                                onClick={() => setOpenTriggerIdx(openTriggerIdx === idx ? null : idx)}
                                                                style={{ padding: '8px 16px', border: '1px solid #2563eb', borderRadius: '4px', background: '#fff', fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', minWidth: '220px' }}
                                                            >
                                                                {at.label} <i className="fas fa-chevron-down" style={{ fontSize: '0.7rem', color: '#94a3b8' }}></i>
                                                            </div>
                                                            {openTriggerIdx === idx && (
                                                                <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', marginBottom: '4px', zIndex: 10 }}>
                                                                    {availableTriggers.map(t => (
                                                                        <div key={t} onClick={() => {
                                                                            const newTriggers = [...activeTriggers];
                                                                            newTriggers[idx].label = t;
                                                                            setActiveTriggers(newTriggers);
                                                                            setOpenTriggerIdx(null);
                                                                        }} style={{ padding: '10px 16px', fontSize: '0.9rem', cursor: 'pointer' }}>{t}</div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginLeft: 'auto' }}>
                                                            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>By:</span>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                                                                <input type="checkbox" defaultChecked style={{ width: '16px', height: '16px' }} /> Web Alert
                                                            </label>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                                                                <input type="checkbox" defaultChecked style={{ width: '16px', height: '16px' }} /> Email
                                                            </label>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                                                                <input type="checkbox" defaultChecked style={{ width: '16px', height: '16px' }} /> Mobile Alert
                                                            </label>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                                                                <input type="checkbox" defaultChecked style={{ width: '16px', height: '16px' }} /> SMS
                                                            </label>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                                                                <input type="checkbox" defaultChecked style={{ width: '16px', height: '16px' }} /> WhatsApp
                                                            </label>
                                                            <i className="fas fa-trash-alt" onClick={() => removeTrigger(at.id)} style={{ color: '#ef4444', opacity: 0.6, cursor: 'pointer', padding: '4px' }}></i>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}

                                            <div style={{ display: 'flex', gap: '24px' }}>
                                                <div style={{ minWidth: '120px' }}></div>
                                                <div style={{ flex: 1 }}>
                                                    <div onClick={addTrigger} style={{ color: 'var(--primary-color)', textDecoration: 'underline', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', marginBottom: '32px' }}>Add another trigger</div>
                                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                        <button className="btn-primary" onClick={resetWizard} style={{ padding: '10px 24px', borderRadius: '6px' }}>Save and activate</button>
                                                        <button onClick={() => setStep(2)} style={{ padding: '10px 24px', borderRadius: '6px', background: '#475569', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Back</button>
                                                        <button onClick={resetWizard} style={{ color: 'var(--primary-color)', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700, marginLeft: '12px' }}>Cancel</button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                </div>
                                <div style={{ position: 'absolute', top: '0', right: '0', fontSize: '0.85rem', color: '#2563eb', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <i className="far fa-question-circle"></i> How do notifications work?
                                </div>
                            </div>
                        )}

                        <div style={{ marginTop: '24px' }}>
                            {personalizedList.map((item, idx) => (
                                <PersonalizedItem key={idx} {...item} />
                            ))}
                        </div>
                    </div>
                )}

                {subTab === 'web' && (
                    <div>
                        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '32px' }}>
                            Web notifications alert you to incoming calls and new text messages. Switch the notifications on/off here.
                        </p>

                        <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '24px' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e293b' }}>Permissions</h3>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1e293b' }}>Incoming Text Messages</div>
                                <div style={{ display: 'flex', gap: '20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input type="radio" defaultChecked name="texts" />
                                        <span style={{ fontSize: '0.9rem' }}>Yes</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input type="radio" name="texts" />
                                        <span style={{ fontSize: '0.9rem' }}>No</span>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1e293b' }}>Incoming Calls</div>
                                <div style={{ display: 'flex', gap: '20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input type="radio" defaultChecked name="calls" />
                                        <span style={{ fontSize: '0.9rem' }}>Yes</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input type="radio" name="calls" />
                                        <span style={{ fontSize: '0.9rem' }}>No</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotificationSettingsPage;
