import { useState, useCallback, useEffect, useRef } from 'react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';

export const useInventoryForm = (isOpen, initialProject, property, allProjects, sizes, getLookupId, getLookupValue, executeDistribution, fireEvent, evaluateAndEnroll, validateAsync, onClose, onSave) => {
    const [formData, setFormData] = useState({
        // Unit Details
        projectName: initialProject || '',
        projectId: '',
        unitNo: '',
        unitType: '',
        category: 'Residential',
        subCategory: '',
        builtupType: '',
        block: '',
        size: '',
        direction: '',
        facing: '',
        roadWidth: '',
        ownership: '',
        builtupDetails: [
            {
                floor: 'Ground Floor',
                cluster: '',
                length: '',
                width: '',
                totalArea: ''
            }
        ],
        occupationDate: '',
        ageOfConstruction: '',
        possessionStatus: '',
        furnishType: '',
        furnishedItems: '',

        // Location
        locationSearch: '',
        latitude: '',
        longitude: '',
        address: {
            country: 'India',
            state: '',
            city: '',
            tehsil: '',
            postOffice: '',
            zip: '',
            hNo: '',
            street: '',
            location: '',
            area: ''
        },

        // Owner Details
        owners: [],

        // System Assignment
        assignedTo: '',
        team: '',
        status: 'Active',
        intent: 'Sell',
        visibleTo: 'Public',

        // Uploads
        inventoryDocuments: [{ documentName: '', documentType: '', linkedContactMobile: '', file: null }],
        inventoryImages: [{ title: '', category: 'Main', file: null }],
        inventoryVideos: [{ title: '', type: 'YouTube', url: '', file: null }]
    });

    const [isSaving, setIsSaving] = useState(false);
    const [duplicateWarning, setDuplicateWarning] = useState(false);
    const [isBlocked, setIsBlocked] = useState(false);
    const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
    const [ownerSearch, setOwnerSearch] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [showOwnerResults, setShowOwnerResults] = useState(false);
    const [selectedContactToLink, setSelectedContactToLink] = useState(null);
    const [linkData, setLinkData] = useState({ role: 'Property Owner', relationship: '', source: 'Update data' });
    const [disabledAddressFields, setDisabledAddressFields] = useState([]);
    const [currentFurnishedItem, setCurrentFurnishedItem] = useState('');

    const mapRef = useRef(null);
    const searchInputRef = useRef(null);
    const googleMapRef = useRef(null);
    const markerRef = useRef(null);

    // Initial project setup
    useEffect(() => {
        if (initialProject) {
            setFormData(prev => ({ ...prev, projectName: initialProject }));
        }
    }, [initialProject]);

    // Pre-fill form data if editing
    useEffect(() => {
        if (property && isOpen) {
            setFormData(prev => ({
                ...prev,
                ...property,
                projectName: property.projectName || property.project || '',
                projectId: property.projectId || '',
                unitNo: property.unitNo || property.unitNumber || '',
                unitType: (property.unitType?.lookup_value || property.unitType || '').toLowerCase(),
                category: getLookupValue('Category', property.category) || property.category || 'Residential',
                block: property.block || '',
                size: property.sizeConfig?.lookup_value || property.sizeLabel || property.size || '',
                locationSearch: property.locationSearch || property.location || '',
                status: getLookupValue('Status', property.status) || 'Active',
                intent: getLookupValue('Intent', property.intent || 'Sell'),
                subCategory: getLookupValue('SubCategory', property.subCategory) || property.subCategory,
                facing: getLookupValue('Facing', property.facing) || property.facing?.lookup_value || property.facing,
                direction: getLookupValue('Direction', property.direction) || property.direction?.lookup_value || property.direction,
                roadWidth: getLookupValue('Road Width', property.roadWidth) || property.roadWidth?.lookup_value || property.roadWidth,
                builtupType: getLookupValue('BuiltupType', property.builtupType) || property.builtupType?.lookup_value || property.builtupType,
                address: property.address || prev.address
            }));
        } else if (isOpen) {
             // Reset form for new entry if needed (or keep defaults)
        }
    }, [property, isOpen, getLookupValue]);

    // Real-time Duplicate Check
    useEffect(() => {
        const checkDuplicate = async () => {
            if (formData.projectName && formData.unitNo && !property) {
                setIsCheckingDuplicate(true);
                try {
                    const response = await api.post('duplication-rules/check', {
                        entityType: 'Inventory',
                        data: { ...formData, project: formData.projectName }
                    });
                    if (response.data && response.data.success) {
                        setDuplicateWarning(response.data.data.length > 0);
                        setIsBlocked(response.data.blockAction === true && response.data.data.length > 0);
                    }
                } catch (err) {
                    console.error("Duplicate check error:", err);
                } finally {
                    setIsCheckingDuplicate(false);
                }
            } else {
                setDuplicateWarning(false);
                setIsBlocked(false);
            }
        };

        const timer = setTimeout(checkDuplicate, 800);
        return () => clearTimeout(timer);
    }, [formData, property]);

    // Debounced Search for Contacts
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (ownerSearch.length > 1) {
                try {
                    const response = await api.get(`/contacts?search=${ownerSearch}&limit=10`);
                    if (response.data && response.data.success) {
                        setSearchResults(response.data.records || []);
                    }
                } catch (error) {
                    console.error("Contact search error:", error);
                }
            } else {
                setSearchResults([]);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [ownerSearch]);

    // Google Maps Integration
    useEffect(() => {
        if (!isOpen) return;

        const fetchAddressFromCoordinates = (lat, lng) => {
            if (!window.google || !window.google.maps) return;
            const geocoder = new window.google.maps.Geocoder();
            geocoder.geocode({ location: { lat, lng } }, (results, status) => {
                if (status === "OK" && results[0]) {
                    const addressComponents = results[0].address_components;
                    const getComponent = (type) => {
                        const comp = addressComponents.find(c => c.types.includes(type));
                        return comp ? comp.long_name : '';
                    };

                    const newState = getComponent('administrative_area_level_1');
                    const newCity = getComponent('administrative_area_level_2');
                    const newZip = getComponent('postal_code');
                    const newStreet = `${getComponent('route')} ${getComponent('street_number')}`.trim();
                    const newLocation = getComponent('sublocality') || getComponent('neighborhood');
                    const newArea = getComponent('sublocality_level_1') || getComponent('sublocality_level_2');

                    setFormData(prev => ({
                        ...prev,
                        address: {
                            ...prev.address,
                            state: newState || prev.address.state,
                            city: newCity || prev.address.city,
                            country: 'India',
                            zip: newZip || prev.address.zip,
                            street: newStreet || prev.address.street,
                            location: newLocation || prev.address.location,
                            area: newArea || prev.address.area
                        }
                    }));
                }
            });
        };

        const timer = setTimeout(() => {
            if (window.google && mapRef.current) {
                const defaultCenter = {
                    lat: formData.latitude ? parseFloat(formData.latitude) : 28.6139,
                    lng: formData.longitude ? parseFloat(formData.longitude) : 77.2090
                };

                if (!googleMapRef.current) {
                    googleMapRef.current = new window.google.maps.Map(mapRef.current, {
                        center: defaultCenter,
                        zoom: 13,
                        mapTypeControl: false,
                        fullscreenControl: false,
                        streetViewControl: false
                    });
                } else {
                    googleMapRef.current.setCenter(defaultCenter);
                }

                if (!markerRef.current) {
                    markerRef.current = new window.google.maps.Marker({
                        position: defaultCenter,
                        map: googleMapRef.current,
                        draggable: true,
                        animation: window.google.maps.Animation.DROP,
                        title: "Property Location"
                    });

                    markerRef.current.addListener('dragend', (event) => {
                        const newLat = event.latLng.lat();
                        const newLng = event.latLng.lng();
                        setFormData(prev => ({
                            ...prev,
                            latitude: newLat.toFixed(6),
                            longitude: newLng.toFixed(6)
                        }));
                        fetchAddressFromCoordinates(newLat, newLng);
                    });
                } else {
                    markerRef.current.setPosition(defaultCenter);
                }

                if (searchInputRef.current) {
                    const autocomplete = new window.google.maps.places.Autocomplete(searchInputRef.current, {
                        types: ['geocode'],
                        componentRestrictions: { country: 'in' },
                    });

                    autocomplete.bindTo("bounds", googleMapRef.current);

                    autocomplete.addListener('place_changed', () => {
                        const place = autocomplete.getPlace();
                        if (!place.geometry || !place.geometry.location) return;

                        if (place.geometry.viewport) {
                            googleMapRef.current.fitBounds(place.geometry.viewport);
                        } else {
                            googleMapRef.current.setCenter(place.geometry.location);
                            googleMapRef.current.setZoom(17);
                        }

                        markerRef.current.setPosition(place.geometry.location);

                        setFormData(prev => ({
                            ...prev,
                            locationSearch: place.formatted_address,
                            latitude: place.geometry.location.lat().toFixed(6),
                            longitude: place.geometry.location.lng().toFixed(6)
                        }));
                        fetchAddressFromCoordinates(place.geometry.location.lat(), place.geometry.location.lng());
                    });
                }
            }
        }, 100);

        return () => clearTimeout(timer);
    }, [isOpen, formData.latitude, formData.longitude]);

    const handleProjectChange = async (e) => {
        const name = e.target.value;
        const project = allProjects.find(p => p.name === name);
        const projectId = project?._id || project?.id || '';

        setFormData(prev => ({ ...prev, projectName: name, projectId, block: "", size: "" }));

        const result = executeDistribution('inventory', { ...formData, projectName: name, projectId });
        if (result && result.success) {
            setFormData(prev => ({
                ...prev,
                projectName: name,
                assignedTo: result.assignedTo,
                team: result.team || prev.team,
                locationSearch: project?.location || prev.locationSearch
            }));
            toast.success(`Inventory automatically assigned to ${result.assignedTo}`);
        }

        if (project) {
            let targetState = '';
            let targetCity = '';

            const locLower = (project.location || '').toLowerCase();
            if (locLower.includes('mohali')) { targetState = 'Punjab'; targetCity = 'Mohali'; }
            else if (locLower.includes('chandigarh')) { targetState = 'Chandigarh'; targetCity = 'Chandigarh'; }
            else if (locLower.includes('kurukshetra')) { targetState = 'Haryana'; targetCity = 'Kurukshetra'; }
            else if (locLower.includes('panchkula')) { targetState = 'Haryana'; targetCity = 'Panchkula'; }
            else if (locLower.includes('zirakpur')) { targetState = 'Punjab'; targetCity = 'Zirakpur'; }

            if (targetState && targetCity) {
                try {
                    const countryRes = await api.get("/lookups?lookup_type=Country&limit=10");
                    const countryObj = (countryRes.data.data || []).find(c => c.lookup_value === 'India');

                    if (countryObj) {
                        const stateRes = await api.get(`/lookups?lookup_type=State&parent_lookup_id=${countryObj._id}&limit=100`);
                        const stateObj = (stateRes.data.data || []).find(s => s.lookup_value.toLowerCase() === targetState.toLowerCase());

                        if (stateObj) {
                            const cityRes = await api.get(`/lookups?lookup_type=City&parent_lookup_id=${stateObj._id}&limit=100`);
                            const cityObj = (cityRes.data.data || []).find(c => c.lookup_value.toLowerCase() === targetCity.toLowerCase());

                            if (cityObj) {
                                let newAddress = {
                                    ...formData.address,
                                    country: countryObj._id,
                                    state: stateObj._id,
                                    city: cityObj._id,
                                    location: '', tehsil: '', postOffice: '', zip: ''
                                };
                                let disabled = ['country', 'state', 'city'];

                                if (project.name) {
                                    const locRes = await api.get(`/lookups?lookup_type=Location&parent_lookup_id=${cityObj._id}&limit=200`);
                                    const locations = locRes.data.data || [];
                                    const matchedLoc = locations.find(l => project.name.toLowerCase().includes(l.lookup_value.toLowerCase()));
                                    if (matchedLoc) {
                                        newAddress.location = matchedLoc._id;
                                        setFormData(prev => ({
                                            ...prev,
                                            locationSearch: matchedLoc.lookup_value + ", " + cityObj.lookup_value,
                                            address: newAddress
                                        }));
                                        disabled.push('location');
                                    } else {
                                        setFormData(prev => ({
                                            ...prev,
                                            locationSearch: project.location || '',
                                            address: newAddress
                                        }));
                                    }
                                } else {
                                    setFormData(prev => ({ ...prev, address: newAddress }));
                                }
                                setDisabledAddressFields(disabled);
                            }
                        }
                    }
                } catch (err) {
                    console.error("Error auto-filling location:", err);
                }
            } else {
                setDisabledAddressFields([]);
            }
        } else {
            setDisabledAddressFields([]);
        }
    };

    const handleLinkOwner = useCallback(() => {
        if (!selectedContactToLink || (linkData.role === 'Associate' && !linkData.relationship)) return;

        const newOwner = {
            id: selectedContactToLink._id,
            name: selectedContactToLink.name,
            mobile: selectedContactToLink.mobile,
            role: linkData.role,
            relationship: linkData.role === 'Property Owner' ? 'Owner' : linkData.relationship,
            source: linkData.source,
            date: new Date().toISOString()
        };

        setFormData(prev => ({
            ...prev,
            owners: [newOwner, ...prev.owners]
        }));

        setSelectedContactToLink(null);
        setLinkData({ role: 'Property Owner', relationship: '', source: 'Update data' });
        setOwnerSearch('');
    }, [selectedContactToLink, linkData]);

    const handleSave = async () => {
        setIsSaving(true);
        const toastId = toast.loading('Saving inventory...');

        try {
            if (validateAsync) {
                const validationResult = await validateAsync('inventory', formData);
                if (!validationResult.isValid) {
                    const errorMessages = Object.values(validationResult.errors).join(', ');
                    toast.error(`Validation Failed: ${errorMessages}`, { id: toastId });
                    setIsSaving(false);
                    return;
                }
            }

            const payload = { ...formData };
            if (payload.owners && Array.isArray(payload.owners)) {
                payload.owners = payload.owners.map(o => (typeof o === 'object' && o !== null) ? (o.id || o._id) : o).filter(Boolean);
            }

            // File handling (Same as original)
             const uploadFiles = async (items, fieldName) => {
                if (!items) return [];
                return await Promise.all(items.map(async (item) => {
                    if (item.file) {
                        try {
                            const uploadData = new FormData();
                            uploadData.append('file', item.file);
                            const res = await api.post('/upload', uploadData, { headers: { 'Content-Type': 'multipart/form-data' } });
                            if (res.data && res.data.success) {
                                return { ...item, url: res.data.url, file: null };
                            }
                        } catch (err) { console.error(`${fieldName} upload error:`, err); }
                    }
                    const rest = { ...item };
                    delete rest.file;
                    return rest;
                }));
            };

            payload.inventoryDocuments = await uploadFiles(payload.inventoryDocuments, 'Document');
            payload.inventoryImages = await uploadFiles(payload.inventoryImages, 'Image');
            payload.inventoryVideos = await uploadFiles(payload.inventoryVideos, 'Video');

            const transformedData = {
                ...payload,
                category: getLookupId('Category', payload.category),
                subCategory: getLookupId('SubCategory', payload.subCategory),
                status: getLookupId('InventoryStatus', payload.status),
                intent: getLookupId('Intent', payload.intent),
                facing: getLookupId('Facing', payload.facing),
                builtupType: getLookupId('BuiltupType', payload.builtupType)
            };

            let response;
            if (property && property._id) {
                response = await api.put(`/inventory/${property._id}`, transformedData);
            } else {
                response = await api.post('/inventory', transformedData);
            }

            if (!response.data || !response.data.success) {
                throw new Error(response.data?.error || 'Failed to save inventory');
            }

            const savedData = response.data.data;
            toast.success('Inventory Saved!', { id: toastId });

            if (property) {
                fireEvent('inventory_updated', savedData, { entityType: 'inventory', previousEntity: property });
            } else {
                fireEvent('inventory_created', savedData, { entityType: 'inventory' });
                fireEvent('inventory_matching_requested', savedData, { entityType: 'inventory', recommendation_depth: 'high' });
                if (formData.owners && formData.owners.length > 0) {
                    formData.owners.forEach(owner => evaluateAndEnroll(owner, 'contacts'));
                }
            }

            onSave && onSave(savedData);
            onClose();

        } catch (error) {
            console.error("Save Error:", error);
            const errMsg = error.response?.data?.error || error.message || "Failed to save inventory";
            toast.error(errMsg, { id: toastId });
        } finally {
            setIsSaving(false);
        }
    };

    const handleInputChange = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

    const handleAddBuiltupRow = () => setFormData(prev => ({
        ...prev,
        builtupDetails: [...prev.builtupDetails, { floor: 'First Floor', cluster: '', length: '', width: '', totalArea: '' }]
    }));

    const handleRemoveBuiltupRow = (index) => setFormData(prev => ({
        ...prev,
        builtupDetails: prev.builtupDetails.filter((_, i) => i !== index)
    }));

    const updateBuiltupRow = (index, field, value) => {
        setFormData(prev => {
            const newRows = [...prev.builtupDetails];
            newRows[index] = { ...newRows[index], [field]: value };
            if (field === 'length' || field === 'width') {
                const l = parseFloat(newRows[index].length) || 0;
                const w = parseFloat(newRows[index].width) || 0;
                newRows[index].totalArea = (l * w).toString();
            }
            return { ...prev, builtupDetails: newRows };
        });
    };

    const handleFurnishedItemKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = currentFurnishedItem.trim();
            if (val) {
                const currentItems = formData.furnishedItems ? formData.furnishedItems.split(',').map(s => s.trim()).filter(Boolean) : [];
                if (!currentItems.includes(val)) {
                    const newItems = [...currentItems, val];
                    setFormData(prev => ({ ...prev, furnishedItems: newItems.join(', ') }));
                }
                setCurrentFurnishedItem('');
            }
        }
    };

    const removeFurnishedItem = (itemToRemove) => {
        const currentItems = formData.furnishedItems ? formData.furnishedItems.split(',').map(s => s.trim()).filter(Boolean) : [];
        const newItems = currentItems.filter(item => item !== itemToRemove);
        setFormData(prev => ({ ...prev, furnishedItems: newItems.join(', ') }));
    };

    return {
        formData, setFormData,
        isSaving,
        duplicateWarning,
        isBlocked,
        isCheckingDuplicate,
        ownerSearch, setOwnerSearch,
        searchResults,
        showOwnerResults, setShowOwnerResults,
        selectedContactToLink, setSelectedContactToLink,
        linkData, setLinkData,
        disabledAddressFields,
        currentFurnishedItem, setCurrentFurnishedItem,
        mapRef, searchInputRef,
        handleProjectChange,
        handleLinkOwner,
        handleSave,
        handleInputChange,
        handleAddBuiltupRow,
        handleRemoveBuiltupRow,
        updateBuiltupRow,
        handleFurnishedItemKeyDown,
        removeFurnishedItem
    };
};
