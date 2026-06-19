import React, { useState, useEffect } from 'react';
import { usePropertyConfig } from '../../context/PropertyConfigContext';
import { useUserContext } from '../../context/UserContext';
import { api } from '../../utils/api';
import toast from 'react-hot-toast';

const BulkUpdateInventoryModal = ({ isOpen, onClose, selectedIds, selectedProperties = [], onUpdateSuccess }) => {
    const { propertyConfig, masterFields, sizes, getLookupValue, getLookupId } = usePropertyConfig();
    const { teams, users } = useUserContext();

    const [isSaving, setIsSaving] = useState(false);
    const [selectedFields, setSelectedFields] = useState({});
    const [formData, setFormData] = useState({
        block: '',
        size: '',
        sizeType: '',
        direction: '',
        roadWidth: '',
        facing: '',
        builtupType: '',
        possessionStatus: '',
        category: '',
        subCategory: '',
        unitType: '',
        country: 'India',
        state: '',
        city: '',
        tehsil: '',
        location: '',
        postOffice: '',
        zip: '', // mapped to pincode
        team: '',
        assignedTo: '',
        visibleTo: ''
    });

    const [locationLookups, setLocationLookups] = useState({
        countries: [],
        states: [],
        cities: [],
        locations: [],
        tehsils: [],
        postOffices: []
    });

    const [availableBlocks, setAvailableBlocks] = useState([]);
    const [isSingleProject, setIsSingleProject] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setFormData({
                block: '', size: '', sizeType: '', direction: '', roadWidth: '', facing: '', builtupType: '',
                possessionStatus: '', category: '', subCategory: '', unitType: '',
                country: '', state: '', city: '', tehsil: '', location: '', postOffice: '', zip: '',
                team: '', assignedTo: '', visibleTo: ''
            });
            const uniqueProjects = [...new Set(selectedProperties.map(p => {
                return (p.projectId && p.projectId.name) ? p.projectId.name : p.projectName;
            }).filter(Boolean))];
            
            const singleProj = uniqueProjects.length === 1;
            setIsSingleProject(singleProj);

            setSelectedFields({});
            fetchCountries();
            if (singleProj) {
                fetchBlocks(uniqueProjects[0]);
            } else {
                setAvailableBlocks([]);
            }
        }
    }, [isOpen]);

    const fetchBlocks = async (projectName) => {
        try {
            const res = await api.get(`/inventory/blocks?project=${encodeURIComponent(projectName)}`);
            if (res.data && res.data.success) {
                setAvailableBlocks(res.data.blocks || []);
            }
        } catch (error) { console.error("Error fetching blocks:", error); }
    };

    const fetchCountries = async () => {
        try {
            const res = await api.get('/lookups?lookup_type=Country&limit=50');
            const data = res.data.data || [];
            setLocationLookups(prev => ({ ...prev, countries: data }));
            const india = data.find(c => c.lookup_value === 'India');
            if (india) {
                setFormData(prev => ({ ...prev, country: india._id }));
                fetchChildren(india._id, 'states', 'State');
            }
        } catch (error) { console.error("Error fetching countries:", error); }
    };

    const fetchChildren = async (parentId, key, lookupType) => {
        try {
            const res = await api.get(`/lookups?lookup_type=${lookupType}&parent_lookup_id=${parentId}&limit=200`);
            setLocationLookups(prev => ({ ...prev, [key]: res.data.data || [] }));
        } catch (error) { console.error(`Error fetching ${lookupType}:`, error); }
    };

    const handleLocationChange = (field, value, childKey, childType) => {
        handleInputChange(field, value);
        if (value && childKey && childType) {
            fetchChildren(value, childKey, childType);
        }
    };

    const handleFieldToggle = (field) => {
        setSelectedFields(prev => ({ ...prev, [field]: !prev[field] }));
    };

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setSelectedFields(prev => ({ ...prev, [field]: true }));
    };

    const handleSave = async () => {
        const updates = {};
        let hasUpdates = false;

        // Compile updates payload based on selected fields
        Object.keys(selectedFields).forEach(field => {
            if (selectedFields[field]) {
                const val = formData[field];
                
                // If it's a known lookup, we should map it to its ID if we have it by name, 
                // but actually the form stores IDs for location and lookup names for others.
                // Let's resolve properly:
                if (['category', 'subCategory', 'unitType', 'direction', 'roadWidth', 'facing', 'builtupType', 'sizeType'].includes(field)) {
                    updates[field] = getLookupId(
                        field === 'sizeType' ? 'PropertyType' : 
                        field === 'roadWidth' ? 'Road Width' : 
                        field.charAt(0).toUpperCase() + field.slice(1), 
                        val
                    ) || val;
                } else if (['country', 'state', 'city', 'tehsil', 'location', 'postOffice', 'zip'].includes(field)) {
                    if (!updates.address) updates.address = {};
                    updates.address[field === 'zip' ? 'pincode' : field] = val || null;
                } else {
                    updates[field] = val || null;
                }
                hasUpdates = true;
            }
        });

        if (!hasUpdates) {
            toast.error("Please select at least one field to update");
            return;
        }

        setIsSaving(true);
        try {
            const res = await api.post('/inventory/bulk-update', {
                ids: selectedIds,
                updates
            });
            if (res.data.success) {
                toast.success(res.data.message || "Bulk update successful");
                onUpdateSuccess();
                onClose();
            }
        } catch (error) {
            console.error("Bulk update error:", error);
            toast.error(error.response?.data?.error || "Failed to update inventory");
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    const labelStyle = { fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px', display: 'block' };
    const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.85rem', outline: 'none', background: '#fff' };
    const checkboxStyle = { marginRight: '8px', cursor: 'pointer' };

    const renderField = (field, label, options, isLookup = false, disabledForce = false, overrideMsg = null, onChangeOverride = null) => {
        const isDisabled = !selectedFields[field] || disabledForce;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', background: selectedFields[field] ? '#f8fafc' : '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <input type="checkbox" checked={!!selectedFields[field]} onChange={() => !disabledForce && handleFieldToggle(field)} style={{ ...checkboxStyle, opacity: disabledForce ? 0.5 : 1, cursor: disabledForce ? 'not-allowed' : 'pointer' }} disabled={disabledForce} />
                    <span style={labelStyle}>{label}</span>
                </div>
                {overrideMsg ? (
                    <div style={{ fontSize: '0.8rem', color: '#ef4444', fontStyle: 'italic', padding: '8px 4px' }}>{overrideMsg}</div>
                ) : (
                    <select 
                        style={{ ...inputStyle, opacity: isDisabled ? 0.6 : 1, cursor: isDisabled ? 'not-allowed' : 'pointer' }} 
                        value={formData[field]} 
                        onChange={(e) => onChangeOverride ? onChangeOverride(e.target.value) : handleInputChange(field, e.target.value)}
                        disabled={isDisabled}
                    >
                        <option value="">Select {label}...</option>
                        {options.map((opt, i) => {
                            const val = typeof opt === 'object' ? (opt._id || opt.id || opt.name || opt.lookup_value) : opt;
                            const display = typeof opt === 'object' ? (opt.name || opt.lookup_value || opt._id) : opt;
                            return <option key={i} value={val}>{display}</option>;
                        })}
                    </select>
                )}
            </div>
        );
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', zIndex: 1100, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)' }}>
            <div style={{ background: '#fff', width: '90%', maxWidth: '900px', maxHeight: '90vh', borderRadius: '16px', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>Bulk Update ({selectedIds.length} properties)</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: '#64748b', cursor: 'pointer' }}>&times;</button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: '#f8fafc' }}>
                    <div style={{ marginBottom: '20px', padding: '12px 16px', background: '#eff6ff', color: '#1e40af', borderRadius: '8px', fontSize: '0.85rem' }}>
                        <i className="fas fa-info-circle" style={{ marginRight: '8px' }}></i>
                        Only fields with the checkbox selected will be updated. Blank selected fields will clear the existing data.
                    </div>

                    <h4 style={{ fontSize: '1rem', marginBottom: '16px', color: '#334155', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>Unit Details</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                        {renderField('block', 'Block', availableBlocks, false, !isSingleProject, !isSingleProject ? 'Disabled: Multiple projects selected' : null)}
                        {renderField('size', 'Size Label', sizes || [], true)}
                        {renderField('category', 'Category', Object.keys(propertyConfig || {}), false)}
                        {renderField('subCategory', 'Sub Category', (() => {
                            if (formData.category && propertyConfig[formData.category]) {
                                return (propertyConfig[formData.category].subCategories || []).map(sc => sc.name);
                            }
                            return Object.values(propertyConfig || {}).flatMap(c => c.subCategories || []).map(sc => sc.name);
                        })(), true)}
                        {renderField('unitType', 'Unit Type', masterFields.unitTypes || [], true)}
                        {renderField('builtupType', 'Builtup Type', (() => {
                            const subCats = formData.category && propertyConfig[formData.category] 
                                ? (propertyConfig[formData.category].subCategories || []) 
                                : Object.values(propertyConfig || {}).flatMap(c => c.subCategories || []);
                            const subCat = formData.subCategory 
                                ? subCats.find(sc => sc.name === formData.subCategory)
                                : null;
                            const targets = subCat ? [subCat] : subCats;
                            const allBuiltup = new Set();
                            targets.forEach(sc => {
                                (sc.builtupTypes || []).forEach(bt => {
                                    const name = typeof bt === 'object' ? bt.name : bt;
                                    if (name) allBuiltup.add(name);
                                });
                            });
                            return Array.from(allBuiltup);
                        })(), true)}
                        {renderField('direction', 'Direction', masterFields.directions || [], true)}
                        {renderField('facing', 'Facing', masterFields.facings || [], true)}
                        {renderField('roadWidth', 'Road Width', masterFields.roadWidths || [], true)}
                        {renderField('possessionStatus', 'Possession Status', ['Ready to Move', 'Under Construction'])}
                    </div>

                    <h4 style={{ fontSize: '1rem', marginBottom: '16px', color: '#334155', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>Location</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                        {renderField('country', 'Country', locationLookups.countries, false, false, null, (val) => handleLocationChange('country', val, 'states', 'State'))}
                        {renderField('state', 'State', locationLookups.states, false, false, null, (val) => handleLocationChange('state', val, 'cities', 'City'))}
                        {renderField('city', 'City', locationLookups.cities, false, false, null, (val) => handleLocationChange('city', val, 'locations', 'Location'))}
                        {renderField('location', 'Location', locationLookups.locations, false, false, null, (val) => handleLocationChange('location', val, 'tehsils', 'Tehsil'))}
                        {renderField('tehsil', 'Tehsil', locationLookups.tehsils, false, false, null, (val) => handleLocationChange('tehsil', val, 'postOffices', 'Post Office'))}
                        {renderField('postOffice', 'Post Office', locationLookups.postOffices, false, false, null, (val) => handleLocationChange('postOffice', val, null, null))}
                    </div>

                    <h4 style={{ fontSize: '1rem', marginBottom: '16px', color: '#334155', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>Assignment</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' }}>
                        {renderField('team', 'Team', teams || [])}
                        {renderField('assignedTo', 'Assigned To', users || [])}
                        {renderField('visibleTo', 'Visibility', ['Public', 'Private'])}
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button onClick={onClose} style={{ padding: '8px 20px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} disabled={isSaving} style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: '#3b82f6', color: '#fff', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                        {isSaving ? 'Updating...' : `Update ${selectedIds.length} Items`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BulkUpdateInventoryModal;
