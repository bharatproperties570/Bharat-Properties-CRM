import React, { useState } from 'react';
import Toast from '../../../components/Toast';
import { usePropertyConfig } from '../../../context/PropertyConfigContext';
import { generateCSV, downloadFile } from '../../../utils/dataManagementUtils';

const DealDetailsPage = () => {
    const { dealMasterFields, updateDealMasterFields } = usePropertyConfig();

    const [activeTab, setActiveTab] = useState('Deal Details');

    // Flat List State (Deal Details)
    const [activeDetailField, setActiveDetailField] = useState('dealTypes');

    const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });

    // New Item State
    const [showAddItemForm, setShowAddItemForm] = useState(false);
    const [addItemTarget, setAddItemTarget] = useState('flat');
    const [newItemValue, setNewItemValue] = useState('');

    const showToast = (message, type = 'success') => {
        setNotification({ show: true, message, type });
    };

    // --- Export Handlers ---
    const handleExportFlat = () => {
        const currentList = dealMasterFields[activeDetailField] || [];
        if (currentList.length === 0) {
            showToast("No items to export", "warning");
            return;
        }

        const dataToExport = currentList.map(item => ({
            ID: typeof item === 'object' ? (item._id || item.id) : item,
            Name: typeof item === 'object' ? (item.lookup_value || item.name) : item
        }));

        const csvContent = generateCSV(dataToExport);
        const fileName = `deal_${activeDetailField.replace(/([A-Z])/g, '_$1').toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`;
        downloadFile(csvContent, fileName);
        showToast("Export successful!");
    };

    // --- CRUD for Deal Master Fields (Flat) ---
    const handleSaveFlatItem = () => {
        if (!newItemValue.trim()) return;
        const currentList = dealMasterFields[activeDetailField] || [];
        if (!currentList.includes(newItemValue.trim())) {
            updateDealMasterFields(activeDetailField, newItemValue.trim(), 'add');
            showToast(`'${newItemValue}' added to ${activeDetailField}`);
            setNewItemValue('');
            setShowAddItemForm(false);
        } else {
            alert("Item already exists.");
        }
    };

    const handleDeleteFlatItem = (item) => {
        if (confirm(`Remove '${item}'?`)) {
            updateDealMasterFields(activeDetailField, item, 'delete');
            showToast(`'${item}' removed`);
        }
    };

    const renderFlatView = () => (
        <div style={{ display: 'flex', gap: '32px', height: '100%' }}>
            {/* Left Panel: Field List */}
            <div style={{ width: '240px', borderRight: '1px solid #e2e8f0', paddingRight: '16px' }}>
                {['dealTypes', 'buyerTypes'].map(field => (
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
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <button
                                className="btn-outline"
                                onClick={handleExportFlat}
                                style={{ padding: '6px 12px', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', borderColor: '#10b981' }}
                                title="Download as Excel/CSV"
                            >
                                <i className="fas fa-download"></i>
                                Download
                            </button>
                            <button
                                className="btn-outline"
                                onClick={() => { setShowAddItemForm(true); setAddItemTarget('flat'); }}
                                style={{ padding: '6px 16px', fontSize: '0.85rem', fontWeight: 600 }}
                            >
                                + Add Item
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                autoFocus
                                value={newItemValue}
                                onChange={(e) => setNewItemValue(e.target.value)}
                                placeholder="Enter value..."
                                style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                                onKeyDown={(e) => e.key === 'Enter' && handleSaveFlatItem()}
                            />
                            <button
                                onClick={handleSaveFlatItem}
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
                    {(dealMasterFields[activeDetailField] || []).map(item => (
                        <div key={item} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem', color: '#334155' }}>
                            <span>{item}</span>
                            <button
                                onClick={() => handleDeleteFlatItem(item)}
                                style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                    ))}
                    {(!dealMasterFields[activeDetailField] || dealMasterFields[activeDetailField].length === 0) && (
                        <div style={{ gridColumn: '1/-1', padding: '32px', textAlign: 'center', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: '8px' }}>
                            No items found. Add one to get started.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

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
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '0 0 8px 0' }}>Deal Configuration</h1>
                        <p style={{ margin: 0, color: '#64748b' }}>Manage deal types, buyer preferences, and transaction details.</p>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '32px', borderBottom: '1px solid #e2e8f0', marginBottom: '32px' }}>
                    {['Deal Details'].map(tab => (
                        <div
                            key={tab}
                            onClick={() => {
                                setActiveTab(tab);
                                setShowAddItemForm(false);
                                setNewItemValue('');
                            }}
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
                    {activeTab === 'Deal Details' && renderFlatView()}
                </div>
            </div>
        </div>
    );
};

export default DealDetailsPage;
