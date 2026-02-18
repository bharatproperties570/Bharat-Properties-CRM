import React, { useState } from 'react';
import Toast from '../../../components/Toast';
import { usePropertyConfig } from '../../../context/PropertyConfigContext';
import { generateCSV, downloadFile } from '../../../utils/dataManagementUtils';

const CustomizeLeadPage = () => {
    const { leadMasterFields, updateLeadMasterFields } = usePropertyConfig();

    const [activeTab, setActiveTab] = useState('Lead Details');

    // Flat List State (Lead Details)
    const [activeDetailField, setActiveDetailField] = useState('transactionTypes');

    // Hierarchy State (Campaign Details)
    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [selectedSource, setSelectedSource] = useState(null);

    const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });

    // New Item State
    const [showAddItemForm, setShowAddItemForm] = useState(false);
    const [addItemTarget, setAddItemTarget] = useState(''); // 'flat', 'campaign', 'source', 'medium'
    const [newItemValue, setNewItemValue] = useState('');

    const showToast = (message, type = 'success') => {
        setNotification({ show: true, message, type });
    };

    // --- Export Handlers ---
    const handleExportFlat = () => {
        const currentList = leadMasterFields[activeDetailField] || [];
        if (currentList.length === 0) {
            showToast("No items to export", "warning");
            return;
        }

        const dataToExport = currentList.map(item => ({
            ID: typeof item === 'object' ? (item._id || item.id) : item,
            Name: typeof item === 'object' ? (item.lookup_value || item.name) : item
        }));

        const csvContent = generateCSV(dataToExport);
        const fileName = `lead_${activeDetailField.replace(/([A-Z])/g, '_$1').toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`;
        downloadFile(csvContent, fileName);
        showToast("Export successful!");
    };

    const handleExportHierarchy = (type, items, title) => {
        if (!items || items.length === 0) {
            showToast("No items to export", "warning");
            return;
        }

        const dataToExport = items.map(item => ({
            ID: typeof item === 'object' ? (item._id || item.id || item.name) : item,
            Name: typeof item === 'object' ? item.name : item
        }));

        const csvContent = generateCSV(dataToExport);
        const fileName = `lead_${title.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
        downloadFile(csvContent, fileName);
        showToast("Export successful!");
    };

    // --- CRUD for Lead Master Fields (Flat) ---
    const handleSaveFlatItem = () => {
        if (!newItemValue.trim()) return;
        const currentList = leadMasterFields[activeDetailField] || [];
        if (!currentList.includes(newItemValue.trim())) {
            updateLeadMasterFields(activeDetailField, [...currentList, newItemValue.trim()]);
            showToast(`'${newItemValue}' added to ${activeDetailField}`);
            setNewItemValue('');
            setShowAddItemForm(false);
        } else {
            alert("Item already exists.");
        }
    };

    const handleDeleteFlatItem = (item) => {
        if (confirm(`Remove '${item}'?`)) {
            const currentList = leadMasterFields[activeDetailField];
            updateLeadMasterFields(activeDetailField, currentList.filter(i => i !== item));
            showToast(`'${item}' removed`);
        }
    };

    // --- CRUD for Campaign Hierarchy ---
    const handleSaveHierarchyItem = () => {
        if (!newItemValue.trim()) return;
        const campaigns = [...(leadMasterFields.campaigns || [])];

        if (addItemTarget === 'campaign') {
            if (campaigns.some(c => c.name === newItemValue)) return alert('Campaign already exists');
            campaigns.push({ name: newItemValue, sources: [] });
            updateLeadMasterFields('campaigns', campaigns);
        }
        else if (addItemTarget === 'source') {
            const campaignIndex = campaigns.findIndex(c => c.name === selectedCampaign.name);
            if (campaignIndex === -1) return;

            if (campaigns[campaignIndex].sources.some(s => s.name === newItemValue)) return alert('Source already exists');

            campaigns[campaignIndex].sources.push({ name: newItemValue, mediums: [] });
            updateLeadMasterFields('campaigns', campaigns);

            // Update selected reference
            setSelectedCampaign(campaigns[campaignIndex]);
        }
        else if (addItemTarget === 'medium') {
            const campaignIndex = campaigns.findIndex(c => c.name === selectedCampaign.name);
            const sourceIndex = campaigns[campaignIndex].sources.findIndex(s => s.name === selectedSource.name);

            if (campaigns[campaignIndex].sources[sourceIndex].mediums.includes(newItemValue)) return alert('Medium already exists');

            campaigns[campaignIndex].sources[sourceIndex].mediums.push(newItemValue);
            updateLeadMasterFields('campaigns', campaigns);

            // Update selected reference
            setSelectedCampaign(campaigns[campaignIndex]);
            setSelectedSource(campaigns[campaignIndex].sources[sourceIndex]);
        }

        showToast('Item added successfully');
        setNewItemValue('');
        setShowAddItemForm(false);
    };

    const handleDeleteHierarchyItem = (type, item) => {
        if (!confirm(`Delete ${type} '${item}'?`)) return;
        const campaigns = [...(leadMasterFields.campaigns || [])];

        if (type === 'campaign') {
            const newCampaigns = campaigns.filter(c => c.name !== item);
            updateLeadMasterFields('campaigns', newCampaigns);
            if (selectedCampaign?.name === item) {
                setSelectedCampaign(null);
                setSelectedSource(null);
            }
        }
        else if (type === 'source') {
            const campIdx = campaigns.findIndex(c => c.name === selectedCampaign.name);
            campaigns[campIdx].sources = campaigns[campIdx].sources.filter(s => s.name !== item);
            updateLeadMasterFields('campaigns', campaigns);
            if (selectedSource?.name === item) setSelectedSource(null);
            setSelectedCampaign(campaigns[campIdx]);
        }
        else if (type === 'medium') {
            const campIdx = campaigns.findIndex(c => c.name === selectedCampaign.name);
            const srcIdx = campaigns[campIdx].sources.findIndex(s => s.name === selectedSource.name);
            campaigns[campIdx].sources[srcIdx].mediums = campaigns[campIdx].sources[srcIdx].mediums.filter(m => m !== item);
            updateLeadMasterFields('campaigns', campaigns);
            setSelectedSource(campaigns[campIdx].sources[srcIdx]);
        }
    };


    const renderFlatView = () => (
        <div style={{ display: 'flex', gap: '32px', height: '100%' }}>
            {/* Left Panel: Field List */}
            <div style={{ width: '240px', borderRight: '1px solid #e2e8f0', paddingRight: '16px' }}>
                {['transactionTypes', 'fundingTypes', 'furnishingStatuses', 'timelines'].map(field => (
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
                    {(leadMasterFields[activeDetailField] || []).map(item => (
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
                    {(!leadMasterFields[activeDetailField] || leadMasterFields[activeDetailField].length === 0) && (
                        <div style={{ gridColumn: '1/-1', padding: '32px', textAlign: 'center', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: '8px' }}>
                            No items found. Add one to get started.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    const renderHierarchyColumn = (title, items, type, isSelected, onSelect, placeholder) => (
        <div style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#475569' }}>{title}</h4>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {items && items.length > 0 && (
                        <button
                            onClick={() => handleExportHierarchy(type, items, title)}
                            style={{ border: 'none', background: 'transparent', color: '#10b981', cursor: 'pointer', fontSize: '0.85rem' }}
                            title="Download this list"
                        >
                            <i className="fas fa-download"></i>
                        </button>
                    )}
                    <button
                        onClick={() => { setShowAddItemForm(true); setAddItemTarget(type); setNewItemValue(''); }}
                        disabled={type !== 'campaign' && !items} // Disable source/medium add if parent not selected
                        style={{ border: 'none', background: 'transparent', color: (type !== 'campaign' && !items) ? '#cbd5e1' : '#2563eb', cursor: (type !== 'campaign' && !items) ? 'not-allowed' : 'pointer' }}
                    >
                        <i className="fas fa-plus"></i>
                    </button>
                </div>
            </div>

            {showAddItemForm && addItemTarget === type && (
                <div style={{ padding: '8px', borderBottom: '1px solid #e2e8f0', background: '#eff6ff' }}>
                    <input
                        autoFocus
                        value={newItemValue}
                        onChange={(e) => setNewItemValue(e.target.value)}
                        placeholder="Name..."
                        style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem', marginBottom: '6px' }}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveHierarchyItem()}
                    />
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={handleSaveHierarchyItem} style={{ flex: 1, padding: '4px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}>Save</button>
                        <button onClick={() => setShowAddItemForm(false)} style={{ flex: 1, padding: '4px', background: '#fff', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}>Cancel</button>
                    </div>
                </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                {!items ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#cbd5e1', fontSize: '0.85rem' }}>{placeholder}</div>
                ) : items.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>No items added yet</div>
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
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        fontSize: '0.9rem',
                                        color: active ? '#2563eb' : '#334155',
                                        background: active ? '#eff6ff' : 'transparent',
                                        fontWeight: active ? 600 : 400,
                                        cursor: onSelect ? 'pointer' : 'default',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}
                                    className="hover:bg-slate-50"
                                >
                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{itemName}</span>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteHierarchyItem(type, itemName); }}
                                        style={{ border: 'none', background: 'transparent', color: '#cbd5e1', cursor: 'pointer', padding: '2px' }}
                                        className="delete-btn"
                                    >
                                        <i className="fas fa-times"></i>
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );

    const renderHierarchyView = () => (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ marginBottom: '16px', padding: '12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', color: '#c2410c', fontSize: '0.9rem' }}>
                <i className="fas fa-info-circle" style={{ marginRight: '8px' }}></i>
                Select a <strong>Campaign</strong> to view Sources. Select a <strong>Source</strong> to view Mediums.
            </div>
            <div style={{ display: 'flex', gap: '20px', height: '400px' }}>
                {renderHierarchyColumn(
                    '1. Campaigns',
                    leadMasterFields.campaigns,
                    'campaign',
                    (item) => selectedCampaign?.name === item.name,
                    (item) => { setSelectedCampaign(item); setSelectedSource(null); },
                    ''
                )}

                {renderHierarchyColumn(
                    '2. Sources',
                    selectedCampaign?.sources,
                    'source',
                    (item) => selectedSource?.name === item.name,
                    (item) => setSelectedSource(item),
                    'Select a Campaign'
                )}

                {renderHierarchyColumn(
                    '3. Mediums',
                    selectedSource?.mediums,
                    'medium',
                    null,
                    null,
                    'Select a Source'
                )}
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
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '0 0 8px 0' }}>Lead Configuration</h1>
                        <p style={{ margin: 0, color: '#64748b' }}>Manage transaction preferences, property details, and campaign sources.</p>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '32px', borderBottom: '1px solid #e2e8f0', marginBottom: '32px' }}>
                    {['Lead Details', 'Campaign Details'].map(tab => (
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
                    {activeTab === 'Lead Details' ? renderFlatView() : renderHierarchyView()}
                </div>
            </div>
            <style jsx>{`
                .delete-btn:hover { color: #ef4444 !important; }
            `}</style>
        </div>
    );
};

export default CustomizeLeadPage;
