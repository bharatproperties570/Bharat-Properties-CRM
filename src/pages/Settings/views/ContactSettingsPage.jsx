import React, { useState } from 'react';
import { useContactConfig } from '../../../context/ContactConfigContext';
import Toast from '../../../components/Toast';

const HIERARCHY_LEVELS = {
    'Professional': ['Category', 'Sub Category', 'Designation'],
    'Address': ['Country', 'State', 'City', 'Location', 'Tehsil', 'Post Office', 'Pincode'],
    'Profile': ['Section', 'Category', 'Item']
};

const ConfigColumn = ({ title, items, selectedItem, onSelect, onAdd, onEdit, onDelete }) => (
    <div style={{ minWidth: '250px', width: '33%', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', background: '#f8fafc', flexShrink: 0 }}>
        <div style={{ padding: '12px 16px', fontWeight: 600, color: '#475569', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {title}
            <button onClick={onAdd} style={{ border: 'none', background: '#e2e8f0', color: '#475569', borderRadius: '4px', width: '20px', height: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title={`Add ${title}`}>
                <i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i>
            </button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
            {items.map(item => {
                const itemName = typeof item === 'object' ? item.name : item;
                const isSelected = selectedItem === itemName;
                return (
                    <div
                        key={item.id || itemName}
                        onClick={() => onSelect && onSelect(item)}
                        style={{
                            padding: '16px', cursor: 'pointer', fontSize: '0.95rem', fontWeight: isSelected ? 700 : 500,
                            color: isSelected ? '#2563eb' : '#334155',
                            background: isSelected ? '#fff' : 'transparent',
                            borderLeft: isSelected ? '4px solid #2563eb' : '4px solid transparent',
                            borderTop: '1px solid transparent', borderBottom: '1px solid transparent',
                            transition: 'all 0.2s',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}
                        onMouseOver={(e) => { if (!isSelected) e.currentTarget.style.background = '#e2e8f0'; }}
                        onMouseOut={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                    >
                        {itemName}
                        <div className="item-actions" style={{ display: 'flex', gap: '8px', opacity: isSelected ? 1 : 0.5 }}>
                            <i className="fas fa-edit" style={{ fontSize: '0.8rem', cursor: 'pointer', color: '#64748b' }} onClick={(e) => { e.stopPropagation(); onEdit(itemName); }}></i>
                            <i className="fas fa-trash" style={{ fontSize: '0.8rem', cursor: 'pointer', color: '#ef4444' }} onClick={(e) => { e.stopPropagation(); onDelete(itemName); }}></i>
                        </div>
                    </div>
                );
            })}
            {items.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>No items added</div>
            )}
        </div>
    </div>
);

const ContactSettingsPage = () => {
    const { professionalConfig, updateProfessionalConfig, addressConfig, updateAddressConfig, profileConfig, updateProfileConfig } = useContactConfig();
    const [activeTab, setActiveTab] = useState('Professional');
    const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });

    // Selection Path (Array of selected item names - strings)
    const [selectedPath, setSelectedPath] = useState([]);

    const showToast = (message, type = 'success') => {
        setNotification({ show: true, message, type });
    };

    const currentConfig = activeTab === 'Professional' ? professionalConfig : activeTab === 'Address' ? addressConfig : profileConfig;
    const updateCurrentConfig = activeTab === 'Professional' ? updateProfessionalConfig : activeTab === 'Address' ? updateAddressConfig : updateProfileConfig;
    const levelTitles = HIERARCHY_LEVELS[activeTab];

    // Helper to get Data at a specific level based on path
    const getLevelData = (levelIndex, path) => {
        if (levelIndex === 0) return Object.keys(currentConfig);

        // Traverse to parent
        let currentNode = currentConfig[path[0]];
        for (let i = 1; i < levelIndex; i++) {
            if (!currentNode || !currentNode.subCategories) return [];
            currentNode = currentNode.subCategories.find(item => item.name === path[i]);
        }

        if (!currentNode) return [];

        // Return subCategories (internal nodes) or types (leaf nodes)
        if (currentNode.subCategories) return currentNode.subCategories;
        if (currentNode.types) return currentNode.types;
        return [];
    };

    // --- CRUD Logic (Generic) ---

    const handleAdd = (levelIndex) => {
        const title = levelTitles[levelIndex];
        const name = prompt(`Enter new ${title}:`);
        if (!name) return;

        const newConfig = { ...currentConfig };

        // Root Level
        if (levelIndex === 0) {
            if (newConfig[name]) { alert('Already exists'); return; }
            newConfig[name] = { subCategories: [] };
        }
        // Sub Levels
        else {
            // Traverse to parent
            let parent = newConfig[selectedPath[0]];
            for (let i = 1; i < levelIndex; i++) {
                parent = parent.subCategories.find(item => item.name === selectedPath[i]);
            }

            // Determine if we are adding to 'types' (leaf) or 'subCategories'
            // Logic: If current parent ALREADY has types, or if we are at the last defined level.
            // Professional: Category -> Sub -> Designation (3 levels). Last index = 2.
            const isLeafLevel = levelIndex === levelTitles.length - 1;

            if (isLeafLevel || (parent.types && Array.isArray(parent.types))) {
                if (!parent.types) parent.types = [];
                if (parent.types.includes(name)) { alert('Already exists'); return; }
                parent.types.push(name);
            } else {
                if (!parent.subCategories) parent.subCategories = [];
                if (parent.subCategories.some(s => s.name === name)) { alert('Already exists'); return; }

                // If we are adding a subCategory, we need to know if IT should have subCategories or types.
                // Look ahead: is the NEXT level the last level?
                // LevelIndex is what we just added. Children are at LevelIndex + 1.
                // If LevelIndex + 1 === MaxIndex, then children are leaves (types).
                // So if LevelIndex < MaxIndex - 1, we init subCategories. 
                // Else we might init types? Actually, we usually init subCategories=[] and decide later based on usage,
                // BUT for now let's stick to subCategories default unless leaf.
                const newItem = { name };

                // If the next level is NOT a leaf, it definitely needs subCategories.
                // If it IS a leaf, it will get 'types' when we add them.
                if (levelIndex < levelTitles.length - 2) {
                    newItem.subCategories = [];
                } else {
                    // Next level is leaf, so we can prep types or leave undefined
                    newItem.types = [];
                }
                parent.subCategories.push(newItem);
            }
        }
        updateCurrentConfig(newConfig);
        showToast(`${title} added`);
    };

    const handleDelete = (levelIndex, itemName) => {
        if (!confirm(`Delete '${itemName}'?`)) return;
        const newConfig = { ...currentConfig };

        if (levelIndex === 0) {
            delete newConfig[itemName];
            if (selectedPath[0] === itemName) setSelectedPath([]);
        } else {
            let parent = newConfig[selectedPath[0]];
            for (let i = 1; i < levelIndex; i++) {
                parent = parent.subCategories.find(item => item.name === selectedPath[i]);
            }

            if (parent.types && parent.types.includes(itemName)) {
                parent.types = parent.types.filter(t => t !== itemName);
            } else if (parent.subCategories) {
                parent.subCategories = parent.subCategories.filter(s => s.name !== itemName);
            }

            // Trim selection if needed
            if (selectedPath[levelIndex] === itemName) {
                setSelectedPath(selectedPath.slice(0, levelIndex));
            }
        }
        updateCurrentConfig(newConfig);
        showToast('Deleted');
    };

    // Calculate columns to render
    const columnsToRender = [];
    columnsToRender.push({ index: 0, items: getLevelData(0, []) }); // Root

    for (let i = 0; i < selectedPath.length; i++) {
        if (i < levelTitles.length - 1) {
            const items = getLevelData(i + 1, selectedPath);
            columnsToRender.push({ index: i + 1, items });
        }
    }

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

                {/* Standardized Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '0 0 8px 0' }}>Contact Configuration</h1>
                        <p style={{ margin: 0, color: '#64748b' }}>Manage contact hierarchy, address fields, and profile details.</p>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div style={{ display: 'flex', gap: '32px', borderBottom: '1px solid #e2e8f0', marginBottom: '32px' }}>
                    {Object.keys(HIERARCHY_LEVELS).map(tab => (
                        <div
                            key={tab}
                            onClick={() => { setActiveTab(tab); setSelectedPath([]); }}
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

                {/* Content Container */}
                <div style={{ height: 'calc(100vh - 250px)', display: 'flex', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflowX: 'auto', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)' }}>
                    {columnsToRender.map((col, idx) => (
                        <ConfigColumn
                            key={col.index}
                            title={levelTitles[col.index] || `Level ${col.index + 1}`}
                            items={col.items}
                            selectedItem={selectedPath[col.index]}
                            onSelect={(item) => {
                                const val = typeof item === 'object' ? item.name : item;
                                const newPath = [...selectedPath.slice(0, col.index), val];
                                setSelectedPath(newPath);
                            }}
                            onAdd={() => handleAdd(col.index)}
                            onEdit={() => { }} // Placeholder
                            onDelete={(item) => handleDelete(col.index, item)}
                        />
                    ))}
                    {columnsToRender.length === 0 && (
                        <div style={{ padding: '40px', color: '#94a3b8' }}>Select items to browse hierarchy</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ContactSettingsPage;
