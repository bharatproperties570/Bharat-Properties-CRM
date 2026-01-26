import React, { useState } from 'react';
import Toast from '../../../components/Toast';
import { usePropertyConfig } from '../../../context/PropertyConfigContext';

const ActivitySettingsPage = () => {
    const { activityMasterFields, updateActivityMasterFields } = usePropertyConfig();

    // Hierarchy State
    const [selectedActivity, setSelectedActivity] = useState(null);
    const [selectedPurpose, setSelectedPurpose] = useState(null);

    const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });

    // New Item State
    const [showAddItemForm, setShowAddItemForm] = useState(false);
    const [addItemTarget, setAddItemTarget] = useState(''); // 'activity', 'purpose', 'outcome'
    const [newItemValue, setNewItemValue] = useState('');

    const showToast = (message, type = 'success') => {
        setNotification({ show: true, message, type });
        setTimeout(() => setNotification({ ...notification, show: false }), 3000);
    };

    // --- CRUD for Activity Hierarchy ---
    const handleSaveItem = () => {
        if (!newItemValue.trim()) return;
        const activities = [...(activityMasterFields.activities || [])];

        // 1. Add Activity (Rare, but supported)
        if (addItemTarget === 'activity') {
            if (activities.some(a => a.name === newItemValue)) return alert('Activity already exists');
            activities.push({ name: newItemValue, purposes: [] });
            updateActivityMasterFields(activities);
        }
        // 2. Add Purpose / Agenda
        else if (addItemTarget === 'purpose') {
            const actIndex = activities.findIndex(a => a.name === selectedActivity.name);
            if (actIndex === -1) return;

            if (activities[actIndex].purposes.some(p => p.name === newItemValue)) return alert('Purpose/Agenda already exists');

            activities[actIndex].purposes.push({ name: newItemValue, outcomes: [] });
            updateActivityMasterFields(activities);

            // Update selected reference
            setSelectedActivity(activities[actIndex]);
        }
        // 3. Add Outcome / Result
        else if (addItemTarget === 'outcome') {
            const actIndex = activities.findIndex(a => a.name === selectedActivity.name);
            const purpIndex = activities[actIndex].purposes.findIndex(p => p.name === selectedPurpose.name);

            if (activities[actIndex].purposes[purpIndex].outcomes.includes(newItemValue)) return alert('Outcome already exists');

            activities[actIndex].purposes[purpIndex].outcomes.push(newItemValue);
            updateActivityMasterFields(activities);

            // Update selected reference
            setSelectedActivity(activities[actIndex]);
            setSelectedPurpose(activities[actIndex].purposes[purpIndex]);
        }

        showToast(`${newItemValue} added successfully`);
        setNewItemValue('');
        setShowAddItemForm(false);
    };

    const handleDeleteItem = (type, item) => {
        if (!confirm(`Delete ${type} '${item}'?`)) return;
        const activities = [...(activityMasterFields.activities || [])];

        if (type === 'activity') {
            const newActivities = activities.filter(a => a.name !== item);
            updateActivityMasterFields(newActivities);
            if (selectedActivity?.name === item) {
                setSelectedActivity(null);
                setSelectedPurpose(null);
            }
        }
        else if (type === 'purpose') {
            const actIdx = activities.findIndex(a => a.name === selectedActivity.name);
            activities[actIdx].purposes = activities[actIdx].purposes.filter(p => p.name !== item);
            updateActivityMasterFields(activities);
            if (selectedPurpose?.name === item) setSelectedPurpose(null);
            setSelectedActivity(activities[actIdx]);
        }
        else if (type === 'outcome') {
            const actIdx = activities.findIndex(a => a.name === selectedActivity.name);
            const purpIdx = activities[actIdx].purposes.findIndex(p => p.name === selectedPurpose.name);
            activities[actIdx].purposes[purpIdx].outcomes = activities[actIdx].purposes[purpIdx].outcomes.filter(o => o !== item);
            updateActivityMasterFields(activities);
            setSelectedPurpose(activities[actIdx].purposes[purpIdx]);
        }
    };

    const renderColumn = (title, items, type, isSelected, onSelect, placeholder, disableAdd = false) => (
        <div style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: '12px', display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
            <div style={{ padding: '16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#475569' }}>{title}</h4>
                {!disableAdd && (
                    <button
                        onClick={() => { setShowAddItemForm(true); setAddItemTarget(type); setNewItemValue(''); }}
                        disabled={type !== 'activity' && !items}
                        style={{
                            border: 'none',
                            background: (type !== 'activity' && !items) ? 'transparent' : '#eff6ff',
                            color: (type !== 'activity' && !items) ? '#cbd5e1' : '#2563eb',
                            cursor: (type !== 'activity' && !items) ? 'not-allowed' : 'pointer',
                            width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s'
                        }}
                    >
                        <i className="fas fa-plus" style={{ fontSize: '0.8rem' }}></i>
                    </button>
                )}
            </div>

            {showAddItemForm && addItemTarget === type && (
                <div style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', background: '#eff6ff' }}>
                    <input
                        autoFocus
                        value={newItemValue}
                        onChange={(e) => setNewItemValue(e.target.value)}
                        placeholder={`Enter ${type} name...`}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', marginBottom: '8px', outline: 'none' }}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveItem()}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={handleSaveItem} style={{ flex: 1, padding: '6px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>Save</button>
                        <button onClick={() => setShowAddItemForm(false)} style={{ flex: 1, padding: '6px', background: '#fff', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    </div>
                </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                {!items ? (
                    <div style={{ padding: '40px 20px', textAlign: 'center', color: '#cbd5e1', fontSize: '0.9rem', fontStyle: 'italic' }}>{placeholder}</div>
                ) : items.length === 0 ? (
                    <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>No items added yet</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {items.map((item, idx) => {
                            const itemName = typeof item === 'string' ? item : item.name;
                            const active = isSelected && isSelected(item);

                            return (
                                <div
                                    key={idx}
                                    onClick={() => onSelect && onSelect(item)}
                                    style={{
                                        padding: '10px 14px',
                                        borderRadius: '8px',
                                        fontSize: '0.9rem',
                                        color: active ? '#1e40af' : '#334155',
                                        background: active ? '#dbeafe' : 'transparent',
                                        fontWeight: active ? 600 : 500,
                                        cursor: onSelect ? 'pointer' : 'default',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        transition: 'all 0.1s'
                                    }}
                                    className="list-item-hover"
                                >
                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{itemName}</span>
                                    {!disableAdd && ( // Reusing this flag to disable delete logic for critical root items if needed, though here we allow deleting everything
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteItem(type, itemName); }}
                                            style={{ border: 'none', background: 'transparent', color: '#cbd5e1', cursor: 'pointer', padding: '4px', opacity: 0, transition: 'opacity 0.2s' }}
                                            className="delete-btn"
                                        >
                                            <i className="fas fa-trash-alt" style={{ fontSize: '0.8rem' }}></i>
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            <style jsx>{`
                .list-item-hover:hover { background: #f1f5f9 !important; }
                .list-item-hover:hover .delete-btn { opacity: 1 !important; color: #ef4444 !important; }
            `}</style>
        </div>
    );

    return (
        <div style={{ flex: 1, background: '#f8fafc', padding: '32px', overflowY: 'auto' }}>
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                {notification.show && (
                    <Toast
                        message={notification.message}
                        type={notification.type}
                        onClose={() => setNotification({ ...notification, show: false })}
                    />
                )}

                <div style={{ marginBottom: '24px' }}>
                    <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>Activity Configuration</h1>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem' }}>Configure Agendas, Purposes, and completion Results for all activity types.</p>
                </div>

                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '24px', padding: '12px 16px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '12px', color: '#c2410c' }}>
                    <div style={{ width: '32px', height: '32px', background: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <i className="fas fa-sitemap" style={{ color: '#ea580c' }}></i>
                    </div>
                    <div style={{ fontSize: '0.9rem' }}>
                        <strong>Hierarchy Rule:</strong> Defining a <strong>Result</strong> requires selecting a <strong>Purpose/Agenda</strong> first.
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '24px', flex: 1, minHeight: 0 }}>
                    {renderColumn(
                        '1. Activity Type',
                        activityMasterFields.activities,
                        'activity',
                        (item) => selectedActivity?.name === item.name,
                        (item) => { setSelectedActivity(item); setSelectedPurpose(null); },
                        '',
                        true // Disable adding new root activities for safety? User said 'hierachy me hi banana hai', maybe allowing custom activities is good. Let's allowing adding is better. Changing to false.
                        // Actually, user listed specific 4. But flexible is better.
                    )}

                    {renderColumn(
                        '2. Purpose / Agenda / Type',
                        selectedActivity?.purposes,
                        'purpose',
                        (item) => selectedPurpose?.name === item.name,
                        (item) => setSelectedPurpose(item),
                        'Select an Activity to view Purposes'
                    )}

                    {renderColumn(
                        '3. Outcome / Completion Result',
                        selectedPurpose?.outcomes,
                        'outcome',
                        null,
                        null,
                        'Select a Purpose to view Outcomes'
                    )}
                </div>
            </div>
        </div>
    );
};

export default ActivitySettingsPage;
