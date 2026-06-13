import React, { useState, useEffect } from 'react';
import { lookupsAPI } from '../../../utils/api';
import Swal from 'sweetalert2';
import './AddressMasterSettings.css';

const AddressMasterSettingsPage = () => {
    // Columns data
    const [countries, setCountries] = useState([]);
    const [states, setStates] = useState([]);
    const [cities, setCities] = useState([]);
    const [currentList, setCurrentList] = useState([]); // General active list for children
    
    // Selection states
    const [selectedCountryId, setSelectedCountryId] = useState('');
    const [selectedStateId, setSelectedStateId] = useState('');
    const [selectedCityId, setSelectedCityId] = useState('');
    const [selectedPostOfficeId, setSelectedPostOfficeId] = useState('unassigned');

    // Sub-categorized children
    const [locations, setLocations] = useState([]);
    const [tehsils, setTehsils] = useState([]);
    const [postOffices, setPostOffices] = useState([]);
    const [pincodes, setPincodes] = useState([]); // Pincodes for selected PO or unassigned

    const [activeTab, setActiveTab] = useState('Location');
    const [loading, setLoading] = useState(false);
    const [childLoading, setChildLoading] = useState(false);
    
    // Drag & Drop states
    const [draggedItem, setDraggedItem] = useState(null);
    const [dragOverItemId, setDragOverItemId] = useState(null);

    // Modals & Actions
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [showMergeModal, setShowMergeModal] = useState(false);
    const [showActionChoiceModal, setShowActionChoiceModal] = useState(false);
    const [actionChoices, setActionChoices] = useState([]);
    const [dropTargetItem, setDropTargetItem] = useState(null);
    const [selectedItem, setSelectedItem] = useState(null);
    const [moveTargetParentId, setMoveTargetParentId] = useState('');
    const [moveTargetParentName, setMoveTargetParentName] = useState('');
    const [mergeTargetItemId, setMergeTargetItemId] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });

    // Toast feedback
    const showMessage = (text, type = 'success') => {
        setMessage({ text, type });
        setTimeout(() => setMessage({ text: '', type: '' }), 5000);
    };

    const getStateSetter = (type) => {
        switch (type) {
            case 'Country': return setCountries;
            case 'State': return setStates;
            case 'City': return setCities;
            case 'Location': return setLocations;
            case 'Tehsil': return setTehsils;
            case 'PostOffice': return setPostOffices;
            case 'Pincode': return setPincodes;
            default: return null;
        }
    };

    // Generic Add Handling
    const handleAdd = async (lookupType, title, parentId = null) => {
        const { value: name } = await Swal.fire({
            title: `Add ${title}`,
            input: "text",
            inputPlaceholder: `Enter ${title} Name`,
            showCancelButton: true,
            confirmButtonText: "Add",
            inputValidator: (value) => { if (!value) return "Name is required!"; }
        });

        if (!name) return;

        try {
            const payload = {
                lookup_type: lookupType,
                lookup_value: name,
                parent_lookup_id: parentId
            };
            const res = await lookupsAPI.create(payload);
            if (res.status === "success") {
                showMessage("Added Successfully");
                const setter = getStateSetter(lookupType);
                if (setter) {
                    setter(prev => [...prev, res.data]);
                }
// Optimistic UI update – defer refresh to avoid latency
                // setTimeout(() => refreshData(lookupType), 2000);
            } else {
                showMessage(res.message || "Failed", "error");
            }
        } catch (error) {
            console.error(error);
            showMessage("Error adding item", "error");
        }
    };

    // Generic Edit Handling
    const handleEdit = async (item, title) => {
        const { value: name } = await Swal.fire({
            title: `Rename ${title}`,
            input: "text",
            inputValue: item.lookup_value,
            showCancelButton: true,
            confirmButtonText: "Update",
            inputValidator: (value) => { if (!value) return "Name is required!"; }
        });

        if (!name) return;

        try {
            const res = await lookupsAPI.update(item._id, {
                lookup_type: item.lookup_type,
                lookup_value: name,
                parent_lookup_id: item.parent_lookup_id
            });
            if (res.status === "success") {
                showMessage("Updated Successfully");
                const setter = getStateSetter(item.lookup_type);
                if (setter) {
                    setter(prev => prev.map(i => i._id === item._id ? res.data : i));
                }
// Optimistic UI update – defer refresh to avoid latency
                // setTimeout(() => refreshData(item.lookup_type), 2000);
            } else {
                showMessage(res.message || "Failed", "error");
            }
        } catch (error) {
            console.error(error);
            showMessage("Error updating item", "error");
        }
    };

    // Generic Delete Handling
    const handleDelete = async (item) => {
        const result = await Swal.fire({
            title: "Delete this item?",
            text: "This action cannot be undone.",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#d33",
            confirmButtonText: "Yes, Delete"
        });

        if (!result.isConfirmed) return;

        try {
            const res = await lookupsAPI.delete(item._id);
            if (res.status === "success") {
                showMessage("Deleted Successfully");
                
                // Clear dependent selections
                if (item._id === selectedStateId) handleStateClick('');
                if (item._id === selectedCityId) handleCityClick('');
                if (item._id === selectedPostOfficeId) setSelectedPostOfficeId('unassigned');
                
                const setter = getStateSetter(item.lookup_type);
                if (setter) {
                    setter(prev => prev.filter(i => i._id !== item._id));
                }
// Optimistic UI update – defer refresh to avoid latency
                // setTimeout(() => refreshData(item.lookup_type), 2000);
            } else {
                showMessage(res.message || "Failed to delete", "error");
            }
        } catch (error) {
            console.error(error);
            showMessage("Error deleting item", "error");
        }
    };

    const refreshData = async (type) => {
        if (type === 'Country') await loadCountries();
        else if (type === 'State') await loadAllStates();
        else if (type === 'City' && selectedStateId) await handleStateClick(selectedStateId);
        else if (selectedCityId) await loadCityChildren(selectedCityId);
    };

    // Load Initial Data
    useEffect(() => {
        const init = async () => {
            await loadCountries();
            await loadAllStates();
        };
        init();
    }, []);

    const loadCountries = async () => {
        try {
            const res = await lookupsAPI.getByCategory('Country');
            if (res.status === 'success') {
                let countryList = res.data;
                if (countryList.length === 0) {
                    // Seed a default India country lookup if empty
                    const seedRes = await lookupsAPI.create({ lookup_type: 'Country', lookup_value: 'India' });
                    if (seedRes.status === 'success') {
                        countryList = [seedRes.data];
                    }
                }
                setCountries(countryList);
                if (countryList.length > 0) {
                    setSelectedCountryId(countryList[0]._id);
                }
            }
        } catch (err) {
            console.error('Failed to load countries:', err);
        }
    };

    const loadAllStates = async () => {
        try {
            setLoading(true);
            const res = await lookupsAPI.getStates();
            if (res.status === 'success') {
                setStates(res.data);
            }
        } catch (err) {
            console.error('Failed to load states:', err);
            showMessage('Failed to load states', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Handle State change and fetch its cities
    const handleStateClick = async (stateId) => {
        setSelectedStateId(stateId);
        setSelectedCityId('');
        setCities([]);
        setLocations([]);
        setTehsils([]);
        setPostOffices([]);
        setPincodes([]);
        
        if (!stateId) return;

        try {
            setLoading(true);
            const res = await lookupsAPI.getCities(stateId);
            if (res.status === 'success') {
                setCities(res.data);
            }
        } catch (err) {
            console.error('Failed to load cities:', err);
            showMessage('Failed to load cities', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Handle City Click and fetch children
    const handleCityClick = async (cityId) => {
        setSelectedCityId(cityId);
        setSelectedPostOfficeId('unassigned');
        setLocations([]);
        setTehsils([]);
        setPostOffices([]);
        setPincodes([]);

        if (!cityId) return;
        await loadCityChildren(cityId);
    };

    const loadCityChildren = async (cityId) => {
        try {
            setChildLoading(true);
            const res = await lookupsAPI.getLocations(cityId);
            if (res.status === 'success') {
                const fetched = res.data;
                
                // Segregate children
                const locs = fetched.filter(item => item.lookup_type === 'Location');
                const tehs = fetched.filter(item => item.lookup_type === 'Tehsil');
                const pos = fetched.filter(item => item.lookup_type === 'PostOffice');
                const pins = fetched.filter(item => item.lookup_type === 'Pincode'); // Direct parent=City pins
                
                setLocations(locs);
                setTehsils(tehs);
                setPostOffices(pos);
                
                if (selectedPostOfficeId === 'unassigned') {
                    setPincodes(pins);
                } else {
                    await loadPincodesForPostOffice(selectedPostOfficeId);
                }
            }
        } catch (err) {
            console.error('Failed to load children:', err);
            showMessage('Failed to load child elements', 'error');
        } finally {
            setChildLoading(false);
        }
    };

    // Load Pincodes for specific Post Office
    const loadPincodesForPostOffice = async (poId) => {
        if (poId === 'unassigned') {
            if (selectedCityId) {
                // Fetch child lookups of the city again to extract direct pincodes
                const res = await lookupsAPI.getLocations(selectedCityId);
                if (res.status === 'success') {
                    setPincodes(res.data.filter(item => item.lookup_type === 'Pincode'));
                }
            }
            return;
        }

        try {
            setChildLoading(true);
            const res = await lookupsAPI.getLocations(poId);
            if (res.status === 'success') {
                setPincodes(res.data.filter(item => item.lookup_type === 'Pincode'));
            }
        } catch (err) {
            console.error('Failed to load pincodes:', err);
        } finally {
            setChildLoading(false);
        }
    };

    // Watcher to reload pincodes if PO changes
    useEffect(() => {
        if (selectedCityId && activeTab === 'Pincode') {
            loadPincodesForPostOffice(selectedPostOfficeId);
        }
    }, [selectedPostOfficeId, activeTab]);

    // HTML5 Drag & Drop handlers
    const handleDragStart = (e, item) => {
        setDraggedItem(item);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item._id);
    };

    const handleDragOver = (e, targetItem, targetType) => {
        e.preventDefault();
        if (!draggedItem) return;

        // Visual highlight target
        if (targetItem._id !== draggedItem._id) {
            setDragOverItemId(targetItem._id);
        }
    };

    const handleDragLeave = () => {
        setDragOverItemId(null);
    };

    const getDropActions = (sourceType, targetType) => {
        const actions = [];
        if (sourceType === targetType) {
            actions.push({ label: `Merge INTO ${targetType}`, action: 'merge' });
        }
        
        if (targetType === 'State' && (sourceType === 'State' || sourceType === 'City')) {
            if (sourceType !== 'City') actions.push({ label: `Convert to City`, action: 'convert', newType: 'City' });
            else actions.push({ label: `Move as City`, action: 'move' });
        }

        if (targetType === 'City') {
            if (sourceType === 'City') {
                actions.push({ label: `Convert to Tehsil`, action: 'convert', newType: 'Tehsil' });
                actions.push({ label: `Convert to Location`, action: 'convert', newType: 'Location' });
                actions.push({ label: `Convert to PostOffice`, action: 'convert', newType: 'PostOffice' });
            } else {
                const possibleChildren = ['Tehsil', 'Location', 'PostOffice'];
                if (possibleChildren.includes(sourceType)) {
                    possibleChildren.forEach(pt => {
                        if (sourceType === pt) actions.push({ label: `Move as ${pt}`, action: 'move' });
                        else actions.push({ label: `Convert to ${pt}`, action: 'convert', newType: pt });
                    });
                }
            }
        }

        if (targetType === 'Tehsil' && sourceType === 'Location') {
            actions.push({ label: `Merge INTO Tehsil`, action: 'merge' });
        }

        if (targetType === 'Country' && sourceType === 'State') {
            actions.push({ label: `Move as State`, action: 'move' });
        }

        if (targetType === 'PostOffice' && sourceType === 'Pincode') {
            actions.push({ label: `Move as Pincode`, action: 'move' });
        }
        
        return actions;
    };

    const handleDrop = async (e, targetItem, targetType) => {
        e.preventDefault();
        setDragOverItemId(null);
        if (!draggedItem) return;

        const sourceId = draggedItem._id;
        const sourceType = draggedItem.lookup_type;
        const targetId = targetItem._id;

        if (sourceId === targetId) return; // Ignore dropping on self

        const actions = getDropActions(sourceType, targetType);

        if (actions.length === 0) {
            showMessage(`Invalid move: Cannot drop ${sourceType} onto ${targetType}`, 'error');
            return;
        }

        setSelectedItem(draggedItem);
        setDropTargetItem(targetItem);

        // Special Location into Tehsil Merge Override
        if (sourceType === 'Location' && targetType === 'Tehsil') {
            setMergeTargetItemId(targetId);
            setShowMergeModal(true);
            return;
        }
        
        if (actions.length === 1 && actions[0].action === 'merge') {
            setMergeTargetItemId(targetId);
            setShowMergeModal(true);
        } else if (actions.length === 1 && actions[0].action === 'move') {
            setMoveTargetParentId(targetId);
            setMoveTargetParentName(targetItem.lookup_value);
            setShowMoveModal(true);
        } else {
            setActionChoices(actions);
            setShowActionChoiceModal(true);
        }
    };

    // Execute Convert API call
    const executeConvert = async (newType) => {
        try {
            setActionLoading(true);
            const payload = {
                action: 'convert',
                sourceId: selectedItem._id,
                targetId: dropTargetItem._id,
                newType: newType
            };
            const res = await lookupsAPI.mergeOrMove(payload);
            if (res.status === 'success') {
                showMessage(`Successfully converted "${selectedItem.lookup_value}" to ${newType} under "${dropTargetItem.lookup_value}"`);
                setShowActionChoiceModal(false);
                
                // Refresh affected column view
                if (selectedItem.lookup_type === 'State' || newType === 'State') await loadAllStates();
                if (selectedItem.lookup_type === 'City' || newType === 'City') {
                    if (selectedStateId) handleStateClick(selectedStateId);
                } else {
                    if (selectedCityId) await loadCityChildren(selectedCityId);
                }
            } else {
                showMessage(res.message || 'Conversion operation failed', 'error');
            }
        } catch (err) {
            console.error(err);
            showMessage(err.message || 'Error occurred during conversion', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    // Execute Move API call
    const executeMove = async () => {
        try {
            setActionLoading(true);
            const payload = {
                action: 'move',
                sourceId: selectedItem._id,
                targetId: moveTargetParentId
            };
            const res = await lookupsAPI.mergeOrMove(payload);
            if (res.status === 'success') {
                showMessage(`Successfully moved "${selectedItem.lookup_value}" under "${moveTargetParentName}"`);
                setShowMoveModal(false);
                
                // Refresh affected column view
                if (selectedItem.lookup_type === 'State') {
                    await loadAllStates();
                } else if (selectedItem.lookup_type === 'City') {
                    if (selectedStateId) handleStateClick(selectedStateId);
                } else {
                    if (selectedCityId) await loadCityChildren(selectedCityId);
                }
            } else {
                showMessage(res.message || 'Move operation failed', 'error');
            }
        } catch (err) {
            console.error(err);
            showMessage(err.message || 'Error occurred during move', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    // Execute Merge API call
    const executeMerge = async () => {
        try {
            setActionLoading(true);
            const payload = {
                action: 'merge',
                sourceId: selectedItem._id,
                targetId: mergeTargetItemId
            };
            const res = await lookupsAPI.mergeOrMove(payload);
            if (res.status === 'success') {
                showMessage(res.message || 'Lookups merged successfully');
                setShowMergeModal(false);

                // Refresh affected lists
                if (selectedItem.lookup_type === 'State') {
                    await loadAllStates();
                } else if (selectedItem.lookup_type === 'City') {
                    if (selectedStateId) handleStateClick(selectedStateId);
                } else {
                    if (selectedCityId) await loadCityChildren(selectedCityId);
                }
            } else {
                showMessage(res.message || 'Merge operation failed', 'error');
            }
        } catch (err) {
            console.error(err);
            showMessage(err.message || 'Error occurred during merge', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    // Get merge targets candidates lists
    const getMergeCandidates = () => {
        if (!selectedItem) return [];
        const type = selectedItem.lookup_type;
        
        if (type === 'State') {
            return states.filter(s => s._id !== selectedItem._id);
        }
        if (type === 'City') {
            return cities.filter(c => c._id !== selectedItem._id);
        }
        if (type === 'Location') {
            return locations.filter(l => l._id !== selectedItem._id);
        }
        if (type === 'Tehsil') {
            return tehsils.filter(t => t._id !== selectedItem._id);
        }
        if (type === 'PostOffice') {
            return postOffices.filter(p => p._id !== selectedItem._id);
        }
        if (type === 'Pincode') {
            return pincodes.filter(p => p._id !== selectedItem._id);
        }
        return [];
    };

    // Filter states by country
    const filteredStates = selectedCountryId 
        ? states.filter(s => String(s.parent_lookup_id) === String(selectedCountryId) || !s.parent_lookup_id)
        : states;

    return (
        <div className="address-master-container">
            <div className="address-master-header">
                <h2>Address Master Hierarchy Workspace</h2>
                <p>Drag and drop items to parent them (State ➔ Country, City ➔ State, Location ➔ City, Pincode ➔ Post Office) or drop onto same type to merge duplicates.</p>
            </div>

            {message.text && (
                <div className={`address-master-toast ${message.type}`}>
                    {message.text}
                </div>
            )}

            <div className="workspace-columns">
                {/* 1. COUNTRIES COLUMN */}
                <div className="workspace-column">
                    <div className="column-header">
                        <h3>1. Countries</h3>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <button className="add-btn-mini" onClick={() => handleAdd("Country", "Country", null, loadCountries)}>+</button>
                            <span className="count-badge">{countries.length}</span>
                        </div>
                    </div>
                    <div className="column-body">
                        {countries.map(c => (
                            <div 
                                key={c._id}
                                className={`workspace-card country-card ${selectedCountryId === c._id ? 'selected' : ''} ${dragOverItemId === c._id ? 'drop-target-hover' : ''}`}
                                onClick={() => setSelectedCountryId(c._id)}
                                onDragOver={(e) => handleDragOver(e, c, 'Country')}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, c, 'Country')}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                    <span className="card-value">{c.lookup_value}</span>
                                    <span className="card-hint">Drop States here</span>
                                </div>
                                <div className="card-actions-mini" style={{ display: 'flex', gap: '8px', opacity: 0.7 }}>
                                    <i className="fas fa-edit" style={{ cursor: "pointer", fontSize: "0.8rem" }} onClick={(e) => { e.stopPropagation(); handleEdit(c, "Country", loadCountries); }}></i>
                                    <i className="fas fa-trash" style={{ cursor: "pointer", fontSize: "0.8rem", color: "#ef4444" }} onClick={(e) => { e.stopPropagation(); handleDelete(c, () => { loadCountries(); if (selectedCountryId === c._id) { setSelectedCountryId(''); setSelectedStateId(''); setSelectedCityId(''); } }); }}></i>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 2. STATES COLUMN */}
                <div className="workspace-column">
                    <div className="column-header">
                        <h3>2. States</h3>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <button className="add-btn-mini" disabled={!selectedCountryId} onClick={() => handleAdd("State", "State", selectedCountryId, loadAllStates)}>+</button>
                            <span className="count-badge">{filteredStates.length}</span>
                        </div>
                    </div>
                    <div className="column-body">
                        {loading && states.length === 0 ? (
                            <div className="column-loader">Loading...</div>
                        ) : filteredStates.length === 0 ? (
                            <div className="column-empty">No states found</div>
                        ) : (
                            filteredStates.map(s => (
                                <div 
                                    key={s._id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, s)}
                                    onDragOver={(e) => handleDragOver(e, s, 'State')}
                                    onDragLeave={handleDragLeave}
                                    onDrop={(e) => handleDrop(e, s, 'State')}
                                    className={`workspace-card state-card ${selectedStateId === s._id ? 'selected' : ''} ${dragOverItemId === s._id ? (draggedItem?.lookup_type === 'State' ? 'merge-target-hover' : 'drop-target-hover') : ''}`}
                                    onClick={() => handleStateClick(s._id)}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                                        <div className="card-drag-handle">⋮⋮</div>
                                        <div className="card-content">
                                            <span className="card-value">{s.lookup_value}</span>
                                            <span className="card-hint-sub">Parent: {s.parent_lookup_value || 'None'}</span>
                                        </div>
                                    </div>
                                    <div className="card-actions-mini" style={{ display: 'flex', gap: '8px', opacity: 0.7 }}>
                                        <i className="fas fa-edit" style={{ cursor: "pointer", fontSize: "0.8rem" }} onClick={(e) => { e.stopPropagation(); handleEdit(s, "State", loadAllStates); }}></i>
                                        <i className="fas fa-trash" style={{ cursor: "pointer", fontSize: "0.8rem", color: "#ef4444" }} onClick={(e) => { e.stopPropagation(); handleDelete(s, () => { loadAllStates(); if (selectedStateId === s._id) { setSelectedStateId(''); setSelectedCityId(''); } }); }}></i>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* 3. CITIES COLUMN */}
                <div className="workspace-column">
                    <div className="column-header">
                        <h3>3. Cities</h3>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <button className="add-btn-mini" disabled={!selectedStateId} onClick={() => handleAdd("City", "City", selectedStateId, () => handleStateClick(selectedStateId))}>+</button>
                            <span className="count-badge">{cities.length}</span>
                        </div>
                    </div>
                    <div className="column-body">
                        {!selectedStateId ? (
                            <div className="column-empty">Select a state to view cities</div>
                        ) : cities.length === 0 ? (
                            <div className="column-empty">No cities in this state</div>
                        ) : (
                            cities.map(c => (
                                <div 
                                    key={c._id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, c)}
                                    onDragOver={(e) => handleDragOver(e, c, 'City')}
                                    onDragLeave={handleDragLeave}
                                    onDrop={(e) => handleDrop(e, c, 'City')}
                                    className={`workspace-card city-card ${selectedCityId === c._id ? 'selected' : ''} ${dragOverItemId === c._id ? (draggedItem?.lookup_type === 'City' ? 'merge-target-hover' : 'drop-target-hover') : ''}`}
                                    onClick={() => handleCityClick(c._id)}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                                        <div className="card-drag-handle">⋮⋮</div>
                                        <div className="card-content">
                                            <span className="card-value">{c.lookup_value}</span>
                                            <span className="card-hint-sub">Parent: {c.parent_lookup_value || 'None'}</span>
                                        </div>
                                    </div>
                                    <div className="card-actions-mini" style={{ display: 'flex', gap: '8px', opacity: 0.7 }}>
                                        <i className="fas fa-edit" style={{ cursor: "pointer", fontSize: "0.8rem" }} onClick={(e) => { e.stopPropagation(); handleEdit(c, "City", () => handleStateClick(selectedStateId)); }}></i>
                                        <i className="fas fa-trash" style={{ cursor: "pointer", fontSize: "0.8rem", color: "#ef4444" }} onClick={(e) => { e.stopPropagation(); handleDelete(c, () => { handleStateClick(selectedStateId); if (selectedCityId === c._id) { setSelectedCityId(''); } }); }}></i>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* 4. DETAILS / CHILDREN COLUMN */}
                <div className="workspace-column children-column">
                    <div className="column-header-tabs">
                        {['Location', 'Tehsil', 'PostOffice', 'Pincode'].map((tab) => (
                            <button
                                key={tab}
                                className={`tab-btn-mini ${activeTab === tab ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab)}
                                disabled={!selectedCityId}
                            >
                                {tab === 'PostOffice' ? 'P.O.' : tab + 's'}
                            </button>
                        ))}
                    </div>
                    
                    <div className="column-body">
                        {childLoading ? (
                            <div className="column-loader">Loading lookups...</div>
                        ) : !selectedCityId ? (
                            <div className="column-empty">Select a city to view lookups</div>
                        ) : (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>
                                        {activeTab} List ({
                                            activeTab === 'Location' ? locations.length :
                                            activeTab === 'Tehsil' ? tehsils.length :
                                            activeTab === 'PostOffice' ? postOffices.length : pincodes.length
                                        })
                                    </span>
                                    <button 
                                        className="add-btn-mini"
                                        onClick={() => {
                                            const parentId = activeTab === 'Pincode' && selectedPostOfficeId !== 'unassigned' ? selectedPostOfficeId : selectedCityId;
                                            handleAdd(
                                                activeTab, 
                                                activeTab, 
                                                parentId, 
                                                activeTab === 'Pincode' ? () => loadPincodesForPostOffice(selectedPostOfficeId) : () => loadCityChildren(selectedCityId)
                                            );
                                        }}
                                    >
                                        +
                                    </button>
                                </div>

                                {activeTab === 'Location' && (
                                    locations.length === 0 ? <div className="column-empty">No locations</div> :
                                    locations.map(item => (
                                        <div 
                                            key={item._id}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, item)}
                                            onDragOver={(e) => handleDragOver(e, item, 'Location')}
                                            onDragLeave={handleDragLeave}
                                            onDrop={(e) => handleDrop(e, item, 'Location')}
                                            className={`workspace-card child-card ${dragOverItemId === item._id ? 'merge-target-hover' : ''}`}
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                                                <div className="card-drag-handle">⋮⋮</div>
                                                <span className="card-value">{item.lookup_value}</span>
                                            </div>
                                            <div className="card-actions-mini" style={{ display: 'flex', gap: '8px', opacity: 0.7 }}>
                                                <i className="fas fa-edit" style={{ cursor: "pointer", fontSize: "0.8rem" }} onClick={(e) => { e.stopPropagation(); handleEdit(item, "Location", () => loadCityChildren(selectedCityId)); }}></i>
                                                <i className="fas fa-trash" style={{ cursor: "pointer", fontSize: "0.8rem", color: "#ef4444" }} onClick={(e) => { e.stopPropagation(); handleDelete(item, () => loadCityChildren(selectedCityId)); }}></i>
                                            </div>
                                        </div>
                                    ))
                                )}

                                {activeTab === 'Tehsil' && (
                                    tehsils.length === 0 ? <div className="column-empty">No tehsils</div> :
                                    tehsils.map(item => (
                                        <div 
                                            key={item._id}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, item)}
                                            onDragOver={(e) => handleDragOver(e, item, 'Tehsil')}
                                            onDragLeave={handleDragLeave}
                                            onDrop={(e) => handleDrop(e, item, 'Tehsil')}
                                            className={`workspace-card child-card ${dragOverItemId === item._id ? 'merge-target-hover' : ''}`}
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                                                <div className="card-drag-handle">⋮⋮</div>
                                                <span className="card-value">{item.lookup_value}</span>
                                            </div>
                                            <div className="card-actions-mini" style={{ display: 'flex', gap: '8px', opacity: 0.7 }}>
                                                <i className="fas fa-edit" style={{ cursor: "pointer", fontSize: "0.8rem" }} onClick={(e) => { e.stopPropagation(); handleEdit(item, "Tehsil", () => loadCityChildren(selectedCityId)); }}></i>
                                                <i className="fas fa-trash" style={{ cursor: "pointer", fontSize: "0.8rem", color: "#ef4444" }} onClick={(e) => { e.stopPropagation(); handleDelete(item, () => loadCityChildren(selectedCityId)); }}></i>
                                            </div>
                                        </div>
                                    ))
                                )}

                                {activeTab === 'PostOffice' && (
                                    postOffices.length === 0 ? <div className="column-empty">No post offices</div> :
                                    postOffices.map(item => (
                                        <div 
                                            key={item._id}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, item)}
                                            onDragOver={(e) => handleDragOver(e, item, 'PostOffice')}
                                            onDragLeave={handleDragLeave}
                                            onDrop={(e) => handleDrop(e, item, 'PostOffice')}
                                            className={`workspace-card child-card ${dragOverItemId === item._id ? 'merge-target-hover' : ''}`}
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                                                <div className="card-drag-handle">⋮⋮</div>
                                                <span className="card-value">{item.lookup_value}</span>
                                            </div>
                                            <div className="card-actions-mini" style={{ display: 'flex', gap: '8px', opacity: 0.7 }}>
                                                <i className="fas fa-edit" style={{ cursor: "pointer", fontSize: "0.8rem" }} onClick={(e) => { e.stopPropagation(); handleEdit(item, "Post Office", () => loadCityChildren(selectedCityId)); }}></i>
                                                <i className="fas fa-trash" style={{ cursor: "pointer", fontSize: "0.8rem", color: "#ef4444" }} onClick={(e) => { e.stopPropagation(); handleDelete(item, () => loadCityChildren(selectedCityId)); }}></i>
                                            </div>
                                        </div>
                                    ))
                                )}

                                {activeTab === 'Pincode' && (
                                    <div className="pincode-split-layout">
                                        <div className="po-selector-sublist">
                                            <label>Select Post Office Target</label>
                                            <div 
                                                className={`po-sub-card ${selectedPostOfficeId === 'unassigned' ? 'selected' : ''}`}
                                                onClick={() => setSelectedPostOfficeId('unassigned')}
                                            >
                                                Direct City Pincodes
                                            </div>
                                            {postOffices.map(po => (
                                                <div 
                                                    key={po._id}
                                                    onClick={() => setSelectedPostOfficeId(po._id)}
                                                    onDragOver={(e) => handleDragOver(e, po, 'PostOffice')}
                                                    onDragLeave={handleDragLeave}
                                                    onDrop={(e) => handleDrop(e, po, 'PostOffice')}
                                                    className={`po-sub-card ${selectedPostOfficeId === po._id ? 'selected' : ''} ${dragOverItemId === po._id ? 'drop-target-hover' : ''}`}
                                                >
                                                    📬 {po.lookup_value}
                                                </div>
                                            ))}
                                        </div>
                                        <div className="pincode-sublist">
                                            {pincodes.length === 0 ? (
                                                <div className="column-empty">No pincodes here. Drag pincodes onto a post office to re-parent.</div>
                                            ) : (
                                                pincodes.map(item => (
                                                    <div 
                                                        key={item._id}
                                                        draggable
                                                        onDragStart={(e) => handleDragStart(e, item)}
                                                        onDragOver={(e) => handleDragOver(e, item, 'Pincode')}
                                                        onDragLeave={handleDragLeave}
                                                        onDrop={(e) => handleDrop(e, item, 'Pincode')}
                                                        className={`workspace-card pincode-card ${dragOverItemId === item._id ? 'merge-target-hover' : ''}`}
                                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                                                            <div className="card-drag-handle">⋮⋮</div>
                                                            <span className="card-value">{item.lookup_value}</span>
                                                        </div>
                                                        <div className="card-actions-mini" style={{ display: 'flex', gap: '8px', opacity: 0.7 }}>
                                                            <i className="fas fa-edit" style={{ cursor: "pointer", fontSize: "0.8rem" }} onClick={(e) => { e.stopPropagation(); handleEdit(item, "Pin Code", () => loadPincodesForPostOffice(selectedPostOfficeId)); }}></i>
                                                            <i className="fas fa-trash" style={{ cursor: "pointer", fontSize: "0.8rem", color: "#ef4444" }} onClick={(e) => { e.stopPropagation(); handleDelete(item, () => loadPincodesForPostOffice(selectedPostOfficeId)); }}></i>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* MOVE MODAL */}
            {showMoveModal && selectedItem && (
                <div className="master-modal-overlay">
                    <div className="master-modal">
                        <h3>Confirm Hierarchy Adjustment</h3>
                        <p>You are moving <strong>"{selectedItem.lookup_value}"</strong> ({selectedItem.lookup_type}) under parent <strong>"{moveTargetParentName}"</strong>.</p>
                        
                        <div className="modal-buttons">
                            <button 
                                className="modal-btn cancel-btn" 
                                onClick={() => setShowMoveModal(false)}
                                disabled={actionLoading}
                            >
                                Cancel
                            </button>
                            <button 
                                className="modal-btn confirm-btn" 
                                onClick={executeMove}
                                disabled={actionLoading}
                            >
                                {actionLoading ? 'Moving...' : 'Confirm Parent Move'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MERGE MODAL */}
            {showMergeModal && selectedItem && (
                <div className="master-modal-overlay">
                    <div className="master-modal merge-modal-wide">
                        <h3>Confirm Duplicate Merge</h3>
                        <div className="warning-banner">
                            <strong>⚠️ WARNING:</strong> Merging is permanent! This will merge <strong>"{selectedItem.lookup_value}"</strong> into the target lookup. All contacts, leads, properties, and child lookups linked to this record will be automatically re-linked before it is deleted.
                        </div>

                        <div className="modal-form-group">
                            <label>Select Target Lookup to Merge Into</label>
                            <select 
                                value={mergeTargetItemId} 
                                onChange={(e) => setMergeTargetItemId(e.target.value)}
                            >
                                <option value="">-- Select Target --</option>
                                {getMergeCandidates().map(item => (
                                    <option key={item._id} value={item._id}>
                                        {item.lookup_value} (ID: {item._id.substring(18)})
                                    </option>
                                ))}
                                {/* Support Location into Tehsil Merge specifically */}
                                {selectedItem.lookup_type === 'Location' && (
                                    <optgroup label="Or Merge into Tehsil">
                                        {tehsils.map(teh => (
                                            <option key={teh._id} value={teh._id}>
                                                [Tehsil] {teh.lookup_value}
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                        </div>

                        <div className="modal-buttons">
                            <button 
                                className="modal-btn cancel-btn" 
                                onClick={() => setShowMergeModal(false)}
                                disabled={actionLoading}
                            >
                                Cancel
                            </button>
                            <button 
                                className="modal-btn danger-confirm-btn" 
                                onClick={executeMerge}
                                disabled={actionLoading}
                            >
                                {actionLoading ? 'Merging...' : 'Confirm & Merge'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ACTION CHOICE MODAL */}
            {showActionChoiceModal && selectedItem && dropTargetItem && (
                <div className="master-modal-overlay">
                    <div className="master-modal">
                        <h3>Select Drop Action</h3>
                        <p>You dropped <strong>"{selectedItem.lookup_value}"</strong> ({selectedItem.lookup_type}) onto <strong>"{dropTargetItem.lookup_value}"</strong> ({dropTargetItem.lookup_type}).</p>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
                            {actionChoices.map((choice, idx) => (
                                <button 
                                    key={idx}
                                    className={`modal-btn ${choice.action === 'merge' ? 'danger-confirm-btn' : 'confirm-btn'}`}
                                    onClick={() => {
                                        if (choice.action === 'merge') {
                                            setShowActionChoiceModal(false);
                                            setMergeTargetItemId(dropTargetItem._id);
                                            setShowMergeModal(true);
                                        } else if (choice.action === 'move') {
                                            setShowActionChoiceModal(false);
                                            setMoveTargetParentId(dropTargetItem._id);
                                            setMoveTargetParentName(dropTargetItem.lookup_value);
                                            setShowMoveModal(true);
                                        } else if (choice.action === 'convert') {
                                            executeConvert(choice.newType);
                                        }
                                    }}
                                >
                                    {choice.label}
                                </button>
                            ))}
                        </div>

                        <div className="modal-buttons" style={{ marginTop: '20px' }}>
                            <button className="modal-btn cancel-btn" onClick={() => setShowActionChoiceModal(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AddressMasterSettingsPage;
