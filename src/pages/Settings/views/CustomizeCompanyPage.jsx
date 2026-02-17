import React, { useState } from 'react';
import Toast from '../../../components/Toast';
import { usePropertyConfig } from '../../../context/PropertyConfigContext';

const CustomizeCompanyPage = () => {
    const { companyMasterFields, updateCompanyMasterFields, deleteCompanyMasterField } = usePropertyConfig();

    const [activeTab, setActiveTab] = useState('Configuration');
    // Default to 'companyTypes' if available, otherwise first key
    const [activeDetailField, setActiveDetailField] = useState('companyTypes');

    // Ensure activeDetailField is valid on init if companyTypes is missing (unlikely given context)
    React.useEffect(() => {
        if (companyMasterFields && !companyMasterFields[activeDetailField]) {
            const keys = Object.keys(companyMasterFields);
            if (keys.length > 0 && keys.includes('companyTypes')) {
                setActiveDetailField('companyTypes');
            } else if (keys.length > 0) {
                setActiveDetailField(keys[0]);
            }
        }
    }, [companyMasterFields, activeDetailField]);

    const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });

    // New Item State
    const [showAddItemForm, setShowAddItemForm] = useState(false);
    const [newItemValue, setNewItemValue] = useState('');

    const showToast = (message, type = 'success') => {
        setNotification({ show: true, message, type });
    };

    // --- CRUD for Company Master Fields ---
    const handleSaveNewItem = () => {
        if (!newItemValue.trim()) return;

        const currentList = Array.isArray(companyMasterFields[activeDetailField]) ? companyMasterFields[activeDetailField] : [];
        const exists = currentList.some(item =>
            (typeof item === 'object' ? item.lookup_value : item).toLowerCase() === newItemValue.trim().toLowerCase()
        );

        if (!exists) {
            updateCompanyMasterFields(activeDetailField, newItemValue.trim());
            showToast(`'${newItemValue}' added to ${activeDetailField}`);
            setNewItemValue('');
            setShowAddItemForm(false);
        } else {
            alert("Item already exists.");
        }
    };

    const handleDeleteItem = (item) => {
        const displayValue = typeof item === 'object' ? item.lookup_value : item;
        if (confirm(`Remove '${displayValue}'?`)) {
            if (typeof item === 'object' && item._id) {
                deleteCompanyMasterField(activeDetailField, item._id);
            } else {
                console.warn("Attempting to delete legacy string field:", item);
            }
            showToast(`'${displayValue}' removed`);
        }
    };

    return (
        <div style={{ flex: 1, background: '#f8fafc', padding: '24px', overflowY: 'auto' }}>
            <div style={{ width: '100%' }}>
                {notification.show && (
                    <Toast
                        message={notification.message}
                        type={notification.type}
                        onClose={() => setNotification({ ...notification, show: false })}
                    />
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '0 0 8px 0' }}>Company Configuration</h1>
                        <p style={{ margin: 0, color: '#64748b' }}>Manage company types and industries.</p>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '32px', borderBottom: '1px solid #e2e8f0', marginBottom: '32px' }}>
                    {['Configuration'].map(tab => (
                        <div
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                padding: '12px 4px',
                                fontSize: '0.95rem',
                                fontWeight: activeTab === tab ? 700 : 500,
                                color: activeTab === tab ? '#3b82f6' : '#64748b',
                                borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            {tab}
                        </div>
                    ))}
                </div>

                <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', minHeight: '500px' }}>

                    {activeTab === 'Configuration' && (
                        <div style={{ display: 'flex', gap: '32px', height: '100%' }}>
                            {/* Left Panel: Field List */}
                            <div style={{ width: '240px', borderRight: '1px solid #e2e8f0', paddingRight: '16px' }}>
                                {Object.keys(companyMasterFields).map(field => (
                                    <div
                                        key={field}
                                        onClick={() => { setActiveDetailField(field); setShowAddItemForm(false); setNewItemValue(''); }}
                                        style={{
                                            padding: '12px 16px',
                                            cursor: 'pointer',
                                            borderRadius: '6px',
                                            fontSize: '0.9rem',
                                            fontWeight: activeDetailField === field ? 600 : 500,
                                            color: activeDetailField === field ? '#2563eb' : '#475569',
                                            background: activeDetailField === field ? '#eff6ff' : 'transparent',
                                            marginBottom: '8px',
                                            textTransform: 'capitalize'
                                        }}
                                    >
                                        {field.replace(/([A-Z])/g, ' $1').trim()}
                                    </div>
                                ))}
                            </div>

                            {/* Right Panel: Value List */}
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', textTransform: 'capitalize' }}>
                                        {activeDetailField.replace(/([A-Z])/g, ' $1').trim()} List
                                    </h3>
                                    {!showAddItemForm ? (
                                        <button
                                            className="btn-outline"
                                            onClick={() => setShowAddItemForm(true)}
                                            style={{ padding: '6px 16px', fontSize: '0.85rem', fontWeight: 600 }}
                                        >
                                            + Add Item
                                        </button>
                                    ) : (
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <input
                                                autoFocus
                                                value={newItemValue}
                                                onChange={(e) => setNewItemValue(e.target.value)}
                                                placeholder="Enter value..."
                                                style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                                                onKeyDown={(e) => e.key === 'Enter' && handleSaveNewItem()}
                                            />
                                            <button
                                                onClick={handleSaveNewItem}
                                                style={{ padding: '6px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
                                            >
                                                Save
                                            </button>
                                            <button
                                                onClick={() => { setShowAddItemForm(false); setNewItemValue(''); }}
                                                style={{ padding: '6px 12px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                                    {(Array.isArray(companyMasterFields[activeDetailField]) ? companyMasterFields[activeDetailField] : []).map((item, idx) => {
                                        const displayValue = typeof item === 'object' ? item.lookup_value : item;
                                        const key = typeof item === 'object' ? item._id : `${displayValue}-${idx}`;
                                        return (
                                            <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem', color: '#334155' }}>
                                                <span>{displayValue}</span>
                                                <button
                                                    onClick={() => handleDeleteItem(item)}
                                                    style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                                                >
                                                    <i className="fas fa-times"></i>
                                                </button>
                                            </div>
                                        );
                                    })}
                                    {(!Array.isArray(companyMasterFields[activeDetailField]) || companyMasterFields[activeDetailField].length === 0) && (
                                        <div style={{ gridColumn: '1/-1', padding: '32px', textAlign: 'center', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: '8px' }}>
                                            No items found. Add one to get started.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CustomizeCompanyPage;
