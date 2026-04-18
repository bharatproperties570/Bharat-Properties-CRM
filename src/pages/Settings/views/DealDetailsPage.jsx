import { useState, useEffect, useCallback } from 'react';
import { usePropertyConfig } from '../../../context/PropertyConfigContext';
import { generateCSV, downloadFile } from '../../../utils/dataManagementUtils';
import { api } from '../../../utils/api';
import Toast from '../../../components/Toast';

const IntegritySettingsView = ({ showToast }) => {
    const [policy, setPolicy] = useState('strict');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const fetchPolicy = useCallback(async () => {
        try {
            const res = await api.get('/system-settings/crm_duplicate_policy');
            if (res.data && res.data.success) {
                setPolicy(res.data.data?.value || 'strict');
            }
        } catch (err) {
            console.error("Failed to fetch policy", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPolicy();
    }, [fetchPolicy]);

    const handleSavePolicy = async (newPolicy) => {
        setSaving(true);
        try {
            await api.post('/system-settings/upsert', {
                key: 'crm_duplicate_policy',
                category: 'crm_config',
                value: newPolicy,
                description: 'Policy for handling duplicate deals for the same property unit (strict, warn, allow).',
                active: true,
                isPublic: true
            });
            setPolicy(newPolicy);
            showToast("Integrity policy updated successfully");
        } catch (err) {
            showToast("Failed to update policy", "error");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading security parameters...</div>;

    return (
        <div style={{ maxWidth: '800px', animation: 'fadeIn 0.3s ease-in-out' }}>
            <div style={{ marginBottom: '40px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                        <i className="fas fa-shield-alt" style={{ fontSize: '1.2rem' }}></i>
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>Duplicate Management Policy</h3>
                        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748b' }}>Control how the system handles multiple deals for the same physical unit.</p>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                    {[
                        { id: 'strict', label: 'Strict (Block)', desc: 'Prevents creating duplicate deals. Guaranteed data integrity.', color: '#10b981', icon: 'fa-lock' },
                        { id: 'warn', label: 'Warning', desc: 'Warns the user but allows the duplicate to be saved.', color: '#f59e0b', icon: 'fa-exclamation-triangle' },
                        { id: 'allow', label: 'Allow All', desc: 'No checks performed. Allows manual duplicate management.', color: '#64748b', icon: 'fa-unlock' }
                    ].map(opt => (
                        <div
                            key={opt.id}
                            onClick={() => !saving && handleSavePolicy(opt.id)}
                            style={{
                                padding: '24px',
                                borderRadius: '14px',
                                border: `2px solid ${policy === opt.id ? opt.color : '#e2e8f0'}`,
                                background: policy === opt.id ? `${opt.color}05` : '#fff',
                                cursor: saving ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                position: 'relative',
                                opacity: saving && policy !== opt.id ? 0.6 : 1
                            }}
                        >
                            {policy === opt.id && (
                                <div style={{ position: 'absolute', top: '-10px', right: '12px', background: opt.color, color: '#fff', fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '20px', textTransform: 'uppercase', boxShadow: `0 4px 12px ${opt.color}40` }}>
                                    Active
                                </div>
                            )}
                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: policy === opt.id ? `${opt.color}20` : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: policy === opt.id ? opt.color : '#94a3b8', marginBottom: '16px' }}>
                                <i className={`fas ${opt.icon}`} style={{ fontSize: '0.9rem' }}></i>
                            </div>
                            <div style={{ fontWeight: 700, color: policy === opt.id ? opt.color : '#1e293b', fontSize: '0.95rem', marginBottom: '8px' }}>{opt.label}</div>
                            <div style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>{opt.desc}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ padding: '24px', borderRadius: '14px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <i className="fas fa-sync-alt" style={{ color: '#6366f1' }}></i>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827' }}>Live Multi-Source Sync</h3>
                    <div style={{ background: '#e0e7ff', color: '#4338ca', fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '20px', textTransform: 'uppercase' }}>Enterprise Grade</div>
                </div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', lineHeight: 1.6 }}>
                    Your deals are now linked directly to the Inventory. Any updates to property owners, associates, or project details in the Inventory module will <strong>instantly reflect</strong> in all associated deals across the CRM. This ensures your sales team is always looking at the "Source of Truth."
                </p>
            </div>
        </div>
    );
};

const DealDetailsPage = () => {
    const { dealMasterFields, updateDealMasterFields } = usePropertyConfig();

    const [activeTab, setActiveTab] = useState('Deal Details');

    // Flat List State (Deal Details)
    const [activeDetailField, setActiveDetailField] = useState('dealTypes');

    const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });

    // New Item State
    const [showAddItemForm, setShowAddItemForm] = useState(false);
    const [, setAddItemTarget] = useState('flat');
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
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '0 0 8px 0' }}>Deals</h1>
                        <p style={{ margin: 0, color: '#64748b' }}>Manage deal types, buyer preferences, and transaction details.</p>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '32px', borderBottom: '1px solid #e2e8f0', marginBottom: '32px' }}>
                    {['Deal Details', 'Integrity & Rules'].map(tab => (
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
                    {activeTab === 'Integrity & Rules' && <IntegritySettingsView showToast={showToast} />}
                </div>
            </div>
        </div>
    );
};

export default DealDetailsPage;
