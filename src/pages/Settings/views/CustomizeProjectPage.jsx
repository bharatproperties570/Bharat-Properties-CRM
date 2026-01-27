import React, { useState } from 'react';
import Toast from '../../../components/Toast';
import { usePropertyConfig } from '../../../context/PropertyConfigContext';

const CustomizeProjectPage = () => {
    const { projectMasterFields, updateProjectMasterFields, projectAmenities, updateProjectAmenities } = usePropertyConfig();

    const [activeTab, setActiveTab] = useState('Project Details');
    const [activeDetailField, setActiveDetailField] = useState(Object.keys(projectMasterFields)[0] || 'approvals');
    const [amenityCategory, setAmenityCategory] = useState('Basic');
    const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });

    // New Amenity State
    const [showAmenityForm, setShowAmenityForm] = useState(false);
    const [newAmenity, setNewAmenity] = useState({ name: '', icon: 'fa-star' });

    // New Item State (Master Fields)
    const [showAddItemForm, setShowAddItemForm] = useState(false);
    const [newItemValue, setNewItemValue] = useState('');

    const showToast = (message, type = 'success') => {
        setNotification({ show: true, message, type });
    };

    const handleSave = () => {
        setNotification({ show: true, message: 'Project settings saved', type: 'success' });
    };

    // --- CRUD for Project Master Fields ---
    const handleSaveNewItem = () => {
        if (!newItemValue.trim()) return;

        const currentList = projectMasterFields[activeDetailField] || [];
        if (!currentList.includes(newItemValue.trim())) {
            updateProjectMasterFields(activeDetailField, [...currentList, newItemValue.trim()]);
            showToast(`'${newItemValue}' added to ${activeDetailField}`);
            setNewItemValue('');
            setShowAddItemForm(false);
        } else {
            alert("Item already exists.");
        }
    };

    const handleDeleteItem = (item) => {
        if (confirm(`Remove '${item}'?`)) {
            const currentList = projectMasterFields[activeDetailField];
            updateProjectMasterFields(activeDetailField, currentList.filter(i => i !== item));
            showToast(`'${item}' removed`);
        }
    };

    // --- CRUD for Amenities ---
    const handleAddAmenity = () => {
        if (!newAmenity.name) return;
        const currentList = projectAmenities[amenityCategory];
        const newId = `${amenityCategory.charAt(0).toLowerCase()}p${Date.now()}`; // Simple unique ID
        const amenityToAdd = { id: newId, ...newAmenity };

        updateProjectAmenities(amenityCategory, [...currentList, amenityToAdd]);
        showToast(`'${newAmenity.name}' added to ${amenityCategory} Amenities`);
        setNewAmenity({ name: '', icon: 'fa-star' });
        setShowAmenityForm(false);
    };

    const handleDeleteAmenity = (id) => {
        if (confirm("Are you sure you want to delete this amenity?")) {
            const currentList = projectAmenities[amenityCategory];
            updateProjectAmenities(amenityCategory, currentList.filter(a => a.id !== id));
            showToast('Amenity deleted');
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
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '0 0 8px 0' }}>Project Configuration</h1>
                        <p style={{ margin: 0, color: '#64748b' }}>Customize global settings for all projects.</p>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '32px', borderBottom: '1px solid #e2e8f0', marginBottom: '32px' }}>
                    {['Project Details', 'Amenities'].map(tab => (
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

                    {activeTab === 'Project Details' && (
                        <div style={{ display: 'flex', gap: '32px', height: '100%' }}>
                            {/* Left Panel: Field List */}
                            <div style={{ width: '240px', borderRight: '1px solid #e2e8f0', paddingRight: '16px' }}>
                                {Object.keys(projectMasterFields).map(field => (
                                    <div
                                        key={field}
                                        onClick={() => setActiveDetailField(field)}
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
                                    {projectMasterFields[activeDetailField].map(item => (
                                        <div key={item} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem', color: '#334155' }}>
                                            <span>{item}</span>
                                            <button
                                                onClick={() => handleDeleteItem(item)}
                                                style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                                            >
                                                <i className="fas fa-times"></i>
                                            </button>
                                        </div>
                                    ))}
                                    {projectMasterFields[activeDetailField].length === 0 && (
                                        <div style={{ gridColumn: '1/-1', padding: '32px', textAlign: 'center', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: '8px' }}>
                                            No items found. Add one to get started.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'Amenities' && (
                        <div>
                            {/* Amenity Category Tabs */}
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
                                {['Basic', 'Featured', 'Nearby'].map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => setAmenityCategory(cat)}
                                        style={{
                                            padding: '8px 20px', borderRadius: '20px', border: 'none',
                                            background: amenityCategory === cat ? '#3b82f6' : '#f1f5f9',
                                            color: amenityCategory === cat ? '#fff' : '#64748b',
                                            fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        {cat} Amenities
                                    </button>
                                ))}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
                                    Manage {amenityCategory} Amenities
                                </h3>
                                <button
                                    className="btn-primary"
                                    onClick={() => setShowAmenityForm(true)}
                                    style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                                >
                                    + Add New Amenity
                                </button>
                            </div>

                            {/* Amenity Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
                                {(projectAmenities[amenityCategory] || []).map(amenity => (
                                    <div key={amenity.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                                        <div style={{ width: '36px', height: '36px', background: '#eff6ff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', marginRight: '12px' }}>
                                            <i className={`fas ${amenity.icon}`}></i>
                                        </div>
                                        <div style={{ flex: 1, fontWeight: 600, color: '#334155', fontSize: '0.9rem' }}>{amenity.name}</div>
                                        <button
                                            onClick={() => handleDeleteAmenity(amenity.id)}
                                            style={{ width: '28px', height: '28px', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        >
                                            <i className="fas fa-trash-alt" style={{ fontSize: '0.75rem' }}></i>
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Add Amenity Modal */}
                            {showAmenityForm && (
                                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                                    <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', width: '500px', maxWidth: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
                                        <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.2rem', color: '#1e293b' }}>Add {amenityCategory} Amenity</h3>

                                        <div style={{ marginBottom: '16px' }}>
                                            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: '#475569', fontSize: '0.9rem' }}>Name</label>
                                            <input
                                                autoFocus
                                                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem', boxSizing: 'border-box' }}
                                                placeholder="e.g. Helipad"
                                                value={newAmenity.name}
                                                onChange={e => setNewAmenity({ ...newAmenity, name: e.target.value })}
                                            />
                                        </div>

                                        <div style={{ marginBottom: '24px' }}>
                                            <label style={{ display: 'block', marginBottom: '10px', fontWeight: 600, color: '#475569', fontSize: '0.9rem' }}>Select Icon</label>

                                            {/* Icon Grid */}
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))', gap: '8px', marginBottom: '16px', maxHeight: '200px', overflowY: 'auto', padding: '4px' }}>
                                                {[
                                                    'fa-star', 'fa-car', 'fa-phone-alt', 'fa-users', 'fa-tint', 'fa-faucet', 'fa-trash-alt',
                                                    'fa-fire-extinguisher', 'fa-car-side', 'fa-house-damage', 'fa-elevator', 'fa-concierge-bell',
                                                    'fa-bolt', 'fa-snowflake', 'fa-shield-alt', 'fa-motorcycle', 'fa-glass-cheers', 'fa-dumbbell',
                                                    'fa-swimming-pool', 'fa-leaf', 'fa-running', 'fa-child', 'fa-om', 'fa-book', 'fa-spa',
                                                    'fa-chess', 'fa-school', 'fa-hospital', 'fa-subway', 'fa-shopping-bag', 'fa-store', 'fa-plane',
                                                    'fa-wifi', 'fa-video', 'fa-tree', 'fa-utensils', 'fa-bed', 'fa-tv', 'fa-bath', 'fa-door-open',
                                                    'fa-layer-group', 'fa-map-marker-alt', 'fa-key', 'fa-home', 'fa-hotel'
                                                ].map(iconClass => (
                                                    <div
                                                        key={iconClass}
                                                        onClick={() => setNewAmenity({ ...newAmenity, icon: iconClass })}
                                                        style={{
                                                            width: '40px', height: '40px',
                                                            borderRadius: '8px',
                                                            background: newAmenity.icon === iconClass ? '#3b82f6' : '#f1f5f9',
                                                            color: newAmenity.icon === iconClass ? '#fff' : '#64748b',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            cursor: 'pointer',
                                                            border: newAmenity.icon === iconClass ? '2px solid #2563eb' : '1px solid transparent',
                                                            fontSize: '1.2rem',
                                                            transition: 'all 0.2s'
                                                        }}
                                                        title={iconClass}
                                                    >
                                                        <i className={`fas ${iconClass}`}></i>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Manual Override */}
                                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: '#64748b' }}>Or type icon class:</label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <input
                                                    style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
                                                    placeholder="e.g. fa-helicopter"
                                                    value={newAmenity.icon}
                                                    onChange={e => setNewAmenity({ ...newAmenity, icon: e.target.value })}
                                                />
                                                <div style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eff6ff', borderRadius: '6px', color: '#3b82f6' }}>
                                                    <i className={`fas ${newAmenity.icon || 'fa-question'}`}></i>
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                                            <button
                                                onClick={() => setShowAmenityForm(false)}
                                                style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer' }}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleAddAmenity}
                                                style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
                                            >
                                                Add Amenity
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CustomizeProjectPage;
