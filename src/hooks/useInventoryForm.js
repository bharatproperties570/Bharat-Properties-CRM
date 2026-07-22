import { useState, useCallback, useEffect, useRef } from 'react';
import { parseShareToMarlas, formatMarlas } from '../utils/landCalculations';
import { api } from '../utils/api';
import toast from 'react-hot-toast';

export const useInventoryForm = (isOpen, initialProject, property, allProjects, sizes, getLookupId, getLookupValue, executeDistribution, fireEvent, evaluateAndEnroll, validateAsync, onClose, onSave, activeTab) => {
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
        sizeType: '', // Added for Configuration parity
        direction: '',
        facing: '',
        roadWidth: '',
        ownership: '',
        waterSource: '',
        waterLevel: '',
        waterPumpType: '',
        numberOfOwner: '',
        frontOnRoad: '',
        builtupDetails: [
            {
                floor: 'Ground Floor',
                cluster: '',
                length: '',
                width: '',
                totalArea: ''
            }
        ],
        landDetails: [
            { khewatNo: '', killaNo: '', share: '', calculatedMarlas: 0 }
        ],
        totalLandAreaText: '',
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
            pincode: '',
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
    const [isDetectingLandmarks, setIsDetectingLandmarks] = useState(false);
    const [drawingPointsCount, setDrawingPointsCount] = useState(0);
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
    const drawingManagerRef = useRef(null); // kept for compat but unused now
    const polygonRef = useRef(null);
    const customPolylineRef = useRef(null);   // preview polyline while drawing
    const customPointsRef = useRef([]);        // array of LatLng points clicked
    const customTempMarkersRef = useRef([]);   // small dot markers at each click point
    const clickListenerRef = useRef(null);     // the active map click listener

    // Initial project setup
    useEffect(() => {
        if (initialProject) {
            setFormData(prev => ({ ...prev, projectName: initialProject }));
        }
    }, [initialProject]);

    // Pre-fill form data if editing
    useEffect(() => {
        if (property && isOpen) {
            const resolveField = (val, type) => {
                if (!val) return '';
                // Map our internal type keys to the exact lookup type names used in PropertyConfigContext
                const typeMap = {
                    RoadWidth: 'Road Width',
                    UnitType: 'UnitType',
                    Category: 'Category',
                    SubCategory: 'SubCategory',
                    Status: 'Status',
                    Intent: 'Intent',
                    BuiltupType: 'BuiltupType',
                    Direction: 'Direction',
                    Facing: 'Facing',
                    PossessionStatus: 'PossessionStatus',
                    FurnishType: 'FurnishType',
                    PropertyType: 'PropertyType'
                };
                const lookupType = typeMap[type] || type;
                if (typeof val === 'object') {
                    const label = val.lookup_value || val.name || val.label;
                    if (label && !/^[0-9a-fA-F]{24}$/.test(String(label))) return label;
                    val = val._id || val.id || val;
                }
                const resolved = getLookupValue(lookupType, val);
                if (resolved && !/^[0-9a-fA-F]{24}$/.test(String(resolved))) return String(resolved);
                if (typeof val === 'string' && !/^[0-9a-fA-F]{24}$/.test(val)) return val;
                return '';
            };

            setFormData(prev => ({
                ...prev,
                ...property,
                projectName: property.project?.name || property.projectName || (typeof property.project === 'string' ? property.project : ''),
                projectId: property.project?._id || property.projectId || '',
                unitNo: property.unitNo || property.unitNumber || '',
                unitType: resolveField(property.unitType, 'UnitType').toLowerCase(),
                category: resolveField(property.category, 'Category') || 'Residential',
                block: property.block?.name || property.block || '',
                size: property.sizeConfig?.lookup_value || property.sizeConfig?.name || property.sizeLabel || property.size || '',
                sizeType: resolveField(property.sizeType, 'PropertyType'),
                locationSearch: property.locationSearch || property.location || '',
                status: resolveField(property.status, 'Status') || 'Active',
                intent: resolveField(property.intent, 'Intent') || 'Sell',
                subCategory: property.subCategory?._id || property.subCategory?.id || resolveField(property.subCategory, 'SubCategory'),
                direction: property.direction ? (property.direction._id || property.direction.id || property.direction) : '',
                facing: property.facing ? (property.facing._id || property.facing.id || property.facing) : '',
                roadWidth: property.roadWidth ? (property.roadWidth._id || property.roadWidth.id || property.roadWidth) : '',
                builtupType: resolveField(property.builtupType, 'BuiltupType'),
                assignedTo: property.assignedTo?._id || property.assignedTo || '',
                team: property.team?._id || property.team || '',
                visibleTo: property.visibleTo || 'Public',
                possessionStatus: resolveField(property.possessionStatus, 'PossessionStatus'),
                furnishType: resolveField(property.furnishType, 'FurnishType'),
                furnishedItems: property.furnishedItems || '',
                occupationDate: property.occupationDate ? new Date(property.occupationDate).toISOString().split('T')[0] : '',
                ageOfConstruction: property.ageOfConstruction || '',
                builtupDetails: (property.builtupDetails && property.builtupDetails.length > 0) 
                    ? property.builtupDetails.map(d => ({...d})) 
                    : [{ floor: 'Ground Floor', cluster: '', length: '', width: '', totalArea: '' }],
                landDetails: (property.landDetails && property.landDetails.length > 0)
                    ? property.landDetails.map(d => ({ ...d }))
                    : [{ khewatNo: '', killaNo: '', share: '', calculatedMarlas: 0 }],
                totalLandAreaText: property.totalLandAreaText || '',
                waterSource: resolveField(property.waterSource, 'WaterSource'),
                waterLevel: resolveField(property.waterLevel, 'WaterLevel'),
                waterPumpType: resolveField(property.waterPumpType, 'WaterPumpType'),
                frontOnRoad: resolveField(property.frontOnRoad, 'FrontOnRoad'),
                numberOfOwner: property.numberOfOwner || '',
                owners: property.owners || [],
                address: {
                    ...prev.address,
                    ...(property.address || {}),
                    country: property.address?.country?.name || property.address?.country?._id || property.address?.country || prev.address.country,
                    state: property.address?.state?.name || property.address?.state?._id || property.address?.state || '',
                    city: property.address?.city?.name || property.address?.city?._id || property.address?.city || '',
                    location: property.address?.location?.name || property.address?.location?._id || property.address?.location || '',
                    tehsil: property.address?.tehsil?.name || property.address?.tehsil?._id || property.address?.tehsil || '',
                    postOffice: property.address?.postOffice?.name || property.address?.postOffice?._id || property.address?.postOffice || '',
                    pincode: property.address?.pincode?.name || property.address?.pincode?._id || property.address?.pincode || property.address?.zip || '',
                    hNo: property.address?.hNo || '',
                    street: property.address?.street || '',
                    area: property.address?.area || ''
                }
            }));
        } else if (isOpen) {
             // Reset form for new entry if needed (or keep defaults)
        }
    }, [property, isOpen, getLookupValue]);

    // Agricultural Auto-Titling for Unit No
    useEffect(() => {
        if (formData.category === 'Agricultural' && formData.totalLandAreaText) {
            const areaParts = formData.totalLandAreaText.split(' ');
            let acre = 0, kanal = 0;
            // Expected format: "X Acre Y Kanal Z Marla"
            if (areaParts.length >= 4) {
                acre = areaParts[0];
                kanal = areaParts[2];
            }
            const subCatText = formData.subCategory || '';
            const unitNo = `${acre} Acre ${kanal} Kanal ${subCatText}`.trim();
            
            // Only update if it actually changed to avoid infinite re-renders
            if (formData.unitNo !== unitNo) {
                setFormData(prev => ({ ...prev, unitNo }));
            }
        }
    }, [formData.category, formData.totalLandAreaText, formData.subCategory, formData.unitNo]);

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
        if (!isOpen || activeTab !== 'Location') return;

        const fetchAddressFromCoordinates = (lat, lng) => {
            if (!window.google || !window.google.maps) return;
            const geocoder = new window.google.maps.Geocoder();
            geocoder.geocode({ location: { lat, lng } }, async (results, status) => {
                if (status === "OK" && results[0]) {
                    const addressComponents = results[0].address_components;
                    const getComponent = (type) => {
                        const comp = addressComponents.find(c => c.types.includes(type));
                        return comp ? comp.long_name : '';
                    };
                    const newStateName = getComponent('administrative_area_level_1');
                    const newCityName = getComponent('administrative_area_level_2');
                    const newZip = getComponent('postal_code');
                    const newStreet = `${getComponent('route')} ${getComponent('street_number')}`.trim();
                    const newLocationName = getComponent('sublocality') || getComponent('neighborhood');
                    const newArea = getComponent('sublocality_level_1') || getComponent('sublocality_level_2');

                    let resolvedCountryId = '';
                    let resolvedStateId = '';
                    let resolvedCityId = '';
                    let resolvedLocId = '';

                    try {
                        const countryRes = await api.get("/lookups?lookup_type=Country&limit=10");
                        const countryObj = (countryRes.data.data || []).find(c => c.lookup_value === 'India');
                        if (countryObj) {
                            resolvedCountryId = countryObj._id;
                            
                            if (newStateName) {
                                const stateRes = await api.get(`/lookups?lookup_type=State&parent_lookup_id=${resolvedCountryId}&limit=100`);
                                const stateObj = (stateRes.data.data || []).find(s => s.lookup_value.toLowerCase() === newStateName.toLowerCase());
                                if (stateObj) {
                                    resolvedStateId = stateObj._id;

                                    if (newCityName) {
                                        const cityRes = await api.get(`/lookups?lookup_type=City&parent_lookup_id=${resolvedStateId}&limit=100`);
                                        const cityObj = (cityRes.data.data || []).find(c => c.lookup_value.toLowerCase() === newCityName.toLowerCase());
                                        if (cityObj) {
                                            resolvedCityId = cityObj._id;

                                            if (newLocationName) {
                                                const locRes = await api.get(`/lookups?lookup_type=Location&parent_lookup_id=${resolvedCityId}&limit=200`);
                                                const locObj = (locRes.data.data || []).find(l => l.lookup_value.toLowerCase() === newLocationName.toLowerCase() || newLocationName.toLowerCase().includes(l.lookup_value.toLowerCase()));
                                                if (locObj) {
                                                    resolvedLocId = locObj._id;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } catch (err) {
                        console.error("Error resolving address IDs:", err);
                    }

                    setFormData(prev => ({
                        ...prev,
                        address: {
                            ...prev.address,
                            state: resolvedStateId || newStateName || prev.address.state,
                            city: resolvedCityId || newCityName || prev.address.city,
                            country: resolvedCountryId || 'India',
                            zip: newZip || prev.address.zip,
                            street: newStreet || prev.address.street,
                            location: resolvedLocId || newLocationName || prev.address.location,
                            area: newArea || prev.address.area
                        }
                    }));
                }
            });
        };

        const initMap = () => {
            if (!mapRef.current || !window.google || !window.google.maps) return;

            const defaultCenter = {
                lat: formData.latitude ? parseFloat(formData.latitude) : 28.6139,
                lng: formData.longitude ? parseFloat(formData.longitude) : 77.2090
            };

            // If the DOM container changed (tab switch destroyed it), reset all refs
            try {
                if (googleMapRef.current && googleMapRef.current.getDiv() !== mapRef.current) {
                    googleMapRef.current = null;
                    markerRef.current = null;
                    drawingManagerRef.current = null;
                    polygonRef.current = null;
                }
            } catch (e) {
                googleMapRef.current = null;
                markerRef.current = null;
                drawingManagerRef.current = null;
                polygonRef.current = null;
            }

            if (!googleMapRef.current) {
                googleMapRef.current = new window.google.maps.Map(mapRef.current, {
                    center: defaultCenter,
                    zoom: 15,
                    mapTypeControl: true,
                    mapTypeControlOptions: {
                        style: window.google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
                        position: window.google.maps.ControlPosition.TOP_RIGHT,
                        mapTypeIds: ['roadmap', 'satellite', 'hybrid']
                    },
                    fullscreenControl: true,
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

            // ---- Custom Click-Based Polygon Drawing ----
            // (No DrawingManager used — works reliably inside modals)

            // Restore existing geoPolygon if editing
            if (formData.geoPolygon && formData.geoPolygon.coordinates && formData.geoPolygon.coordinates[0] && !polygonRef.current) {
                const paths = formData.geoPolygon.coordinates[0].map(c => ({ lat: c[1], lng: c[0] }));
                polygonRef.current = new window.google.maps.Polygon({
                    paths,
                    fillColor: '#3b82f6', fillOpacity: 0.3, strokeWeight: 2.5, strokeColor: '#2563eb', editable: false
                });
                polygonRef.current.setMap(googleMapRef.current);
                const bounds = new window.google.maps.LatLngBounds();
                paths.forEach(p => bounds.extend(p));
                googleMapRef.current.fitBounds(bounds);
            }

            // Search box Autocomplete
            if (searchInputRef.current && window.google.maps.places) {
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
        };

        // If Maps already loaded (e.g., user was on Location tab before), init immediately.
        // Otherwise, wait for the callback event dispatched by __onGoogleMapsReady.
        if (window.__googleMapsReady) {
            // Small rAF to ensure DOM node (mapRef) is fully rendered
            requestAnimationFrame(() => initMap());
        } else {
            window.addEventListener('google-maps-ready', initMap, { once: true });
        }

        return () => {
            window.removeEventListener('google-maps-ready', initMap);
        };
    }, [isOpen, activeTab]);

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

            // Aggressive Sanitation for Senior Professional Robustness
            const payload = { ...formData };
            
            // 1. Strip System Fields that shouldn't be sent back
            delete payload._id;
            delete payload.id;
            delete payload.history;
            delete payload.ownerHistory;
            delete payload.createdAt;
            delete payload.updatedAt;
            delete payload.__v;

            // 2. Normalize Owners (IDs only)
            if (payload.owners && Array.isArray(payload.owners)) {
                payload.owners = payload.owners.map(o => {
                    if (!o) return null;
                    if (typeof o === 'object') return o._id || o.id;
                    return o;
                }).filter(o => o && typeof o === 'string' && o.length === 24);
            }

            // 3. Normalize Associates (IDs only)
            if (payload.associates && Array.isArray(payload.associates)) {
                payload.associates = payload.associates.map(a => {
                    if (!a) return null;
                    const contactId = (typeof a.contact === 'object' && a.contact !== null) ? (a.contact._id || a.contact.id) : a.contact;
                    if (!contactId || typeof contactId !== 'string' || contactId.length !== 24) return null;
                    return { ...a, contact: contactId };
                }).filter(Boolean);
            }

            // 4. File handling (Same as original)
             const uploadFiles = async (items, fieldName) => {
                if (!items) return [];
                return await Promise.all(items.map(async (item) => {
                    if (item.file) {
                        try {
                            const uploadData = new FormData();
                            uploadData.append('file', item.file);
                            const res = await api.post('/upload', uploadData);
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

            if (payload.kmlFile) {
                try {
                    const uploadData = new FormData();
                    uploadData.append('file', payload.kmlFile);
                    const res = await api.post('/upload', uploadData);
                    if (res.data && res.data.success) {
                        payload.kmlFileUrl = res.data.url;
                    }
                } catch (err) { console.error('KML upload error:', err); }
                delete payload.kmlFile;
                delete payload.kmlFileName;
            }

            const transformedData = {
                ...payload,
                category: getLookupId('Category', payload.category),
                subCategory: getLookupId('SubCategory', payload.subCategory),
                unitType: getLookupId('UnitType', payload.unitType),
                sizeType: getLookupId('PropertyType', payload.sizeType), // Resolve sizeType against PropertyType
                status: getLookupId('InventoryStatus', payload.status),
                intent: getLookupId('Intent', payload.intent),
                facing: getLookupId('Facing', payload.facing),
                direction: getLookupId('Direction', payload.direction),
                roadWidth: getLookupId('Road Width', payload.roadWidth),
                builtupType: getLookupId('BuiltupType', payload.builtupType),
                soilType: getLookupId('SoilType', payload.soilType),
                currentCrop: getLookupId('CurrentCrop', payload.currentCrop),
                team: (typeof payload.team === 'object' && payload.team !== null) ? (payload.team._id || payload.team.id) : (payload.team || null),
                assignedTo: (typeof payload.assignedTo === 'object' && payload.assignedTo !== null) ? (payload.assignedTo._id || payload.assignedTo.id) : (payload.assignedTo || null),
                projectId: (typeof payload.projectId === 'object' && payload.projectId !== null) ? (payload.projectId._id || payload.projectId.id) : (payload.projectId || null),
                occupationDate: payload.occupationDate === '' ? null : payload.occupationDate,
                builtupDetails: (payload.builtupDetails || []).map(row => ({
                    ...row,
                    length: row.length === '' ? null : Number(row.length),
                    width: row.width === '' ? null : Number(row.width),
                    totalArea: row.totalArea === '' ? null : Number(row.totalArea)
                }))
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
                window.dispatchEvent(new CustomEvent('inventory-updated', { detail: { inventoryId: savedData._id } }));
            } else {
                fireEvent('inventory_created', savedData, { entityType: 'inventory' });
                fireEvent('inventory_matching_requested', savedData, { entityType: 'inventory', recommendation_depth: 'high' });
                window.dispatchEvent(new CustomEvent('inventory-updated', { detail: { inventoryId: savedData._id } }));
                
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

    const handleAddLandRow = () => setFormData(prev => ({
        ...prev,
        landDetails: [...(prev.landDetails || []), { khewatNo: '', killaNo: '', share: '', calculatedMarlas: 0 }]
    }));

    const handleRemoveLandRow = (index) => setFormData(prev => {
        const newRows = (prev.landDetails || []).filter((_, i) => i !== index);
        const totalMarlas = newRows.reduce((acc, row) => acc + (row.calculatedMarlas || 0), 0);
        return {
            ...prev,
            landDetails: newRows,
            totalLandAreaText: formatMarlas(totalMarlas)
        };
    });

    const updateLandRow = (index, field, value) => {
        setFormData(prev => {
            const newRows = [...(prev.landDetails || [])];
            newRows[index] = { ...newRows[index], [field]: value };
            if (field === 'share') {
                newRows[index].calculatedMarlas = parseShareToMarlas(value);
            }
            const totalMarlas = newRows.reduce((acc, row) => acc + (row.calculatedMarlas || 0), 0);
            return {
                ...prev,
                landDetails: newRows,
                totalLandAreaText: formatMarlas(totalMarlas)
            };
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

    const autoDetectLandmarks = useCallback(async () => {
        try {
            if (!window.google || !window.google.maps || !window.google.maps.places) {
                toast.error("Google Maps Places API is not fully loaded. Please wait or refresh.");
                return;
            }
            if (!window.google.maps.geometry || !window.google.maps.geometry.spherical) {
                toast.error("Google Maps Geometry API is missing.");
                return;
            }
            if (!formData.latitude || !formData.longitude) {
                toast.error("Please set the property location on the map first.");
                return;
            }

            const lat = parseFloat(formData.latitude);
            const lng = parseFloat(formData.longitude);
            if (isNaN(lat) || isNaN(lng)) {
                toast.error("Invalid coordinates on map.");
                return;
            }

            setIsDetectingLandmarks(true);
            // PlacesService MUST receive the real mounted map div or a live Map instance.
            // Using document.createElement('div') causes internal Google Maps crashes.
            const mapInstance = googleMapRef.current;
            if (!mapInstance) {
                toast.error("Please open the Location tab and wait for the map to load first.");
                setIsDetectingLandmarks(false);
                return;
            }
            const center = new window.google.maps.LatLng(lat, lng);
            const service = new window.google.maps.places.PlacesService(mapInstance);

            
            const typesToSearch = ['hospital', 'school', 'transit_station', 'shopping_mall'];
            let detected = [];

            const searchNearby = (type) => {
                return new Promise((resolve) => {
                    service.nearbySearch({
                        location: center,
                        radius: 5000,
                        type: type
                    }, (results, status) => {
                        resolve({ results, status, type });
                    });
                });
            };

            for (const type of typesToSearch) {
                try {
                    const { results, status } = await searchNearby(type);
                    if (status === window.google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
                        const topResults = results.slice(0, 2);
                        topResults.forEach(r => {
                            if (!r.geometry || !r.geometry.location) return;
                            try {
                                const distance = window.google.maps.geometry.spherical.computeDistanceBetween(center, r.geometry.location);
                                detected.push({
                                    name: r.name,
                                    type: type,
                                    rating: r.rating || 0,
                                    distance: Math.round(distance)
                                });
                            } catch (err) {
                                console.error("Error calculating distance:", err);
                            }
                        });
                    }
                } catch (err) {
                    console.error(`Error searching ${type}:`, err);
                }
            }

            detected.sort((a, b) => a.distance - b.distance);
            setFormData(prev => ({ ...prev, nearbyLandmarks: detected }));
            setIsDetectingLandmarks(false);
            
            if (detected.length > 0) {
                toast.success(`Detected ${detected.length} nearby amenities!`);
            } else {
                toast.error("No major amenities found within 5km.");
            }

        } catch (error) {
            console.error("AI Landmark Detection Error:", error);
            toast.error("Failed to detect landmarks. Maps API might be restricted.");
            setIsDetectingLandmarks(false);
        }
    }, [formData.latitude, formData.longitude]);

    const clearDrawingState = () => {
        // Remove click listener
        if (clickListenerRef.current) {
            window.google.maps.event.removeListener(clickListenerRef.current);
            clickListenerRef.current = null;
        }
        // Remove preview polyline
        if (customPolylineRef.current) {
            customPolylineRef.current.setMap(null);
            customPolylineRef.current = null;
        }
        // Remove temp dot markers
        customTempMarkersRef.current.forEach(m => m.setMap(null));
        customTempMarkersRef.current = [];
        // Reset points
        customPointsRef.current = [];
        setDrawingPointsCount(0);
    };

    const computeAndSavePolygon = (points) => {
        if (!window.google || !window.google.maps || !window.google.maps.geometry) return;
        const map = googleMapRef.current;
        if (!map) return;

        // Remove existing polygon
        if (polygonRef.current) { polygonRef.current.setMap(null); polygonRef.current = null; }

        const path = new window.google.maps.MVCArray(points);
        polygonRef.current = new window.google.maps.Polygon({
            paths: points,
            fillColor: '#3b82f6',
            fillOpacity: 0.25,
            strokeWeight: 2.5,
            strokeColor: '#2563eb',
            editable: false,
            zIndex: 2
        });
        polygonRef.current.setMap(map);

        const areaSqMeters = window.google.maps.geometry.spherical.computeArea(path);
        const perimeterMeters = window.google.maps.geometry.spherical.computeLength(path);
        const totalMarlas = Math.round(areaSqMeters / 25.29285);
        const acres = Math.floor(totalMarlas / 160);
        const rem1 = totalMarlas % 160;
        const kanals = Math.floor(rem1 / 20);
        const marlas = Math.round(rem1 % 20);
        const coords = points.map(p => [p.lng(), p.lat()]);
        coords.push([...coords[0]]); // close ring

        setFormData(prev => ({
            ...prev,
            gpsAreaAcres: acres,
            gpsAreaKanals: kanals,
            gpsAreaMarlas: marlas,
            geoPolygon: { type: 'Polygon', coordinates: [coords] },
            gpsPerimeter: perimeterMeters.toFixed(2)
        }));
        toast.success(`Area calculated: ${acres}A ${kanals}K ${marlas}M`);
    };

    const clearPolygon = useCallback(() => {
        clearDrawingState();
        if (polygonRef.current) {
            polygonRef.current.setMap(null);
            polygonRef.current = null;
        }
        setFormData(prev => ({
            ...prev,
            geoPolygon: null,
            gpsAreaAcres: '',
            gpsAreaKanals: '',
            gpsAreaMarlas: '',
            gpsPerimeter: ''
        }));
    }, []);

    const activateDrawing = useCallback(() => {
        const map = googleMapRef.current;
        if (!map) {
            toast.error('Please go to Location tab and wait for the map to load first.');
            return;
        }

        // Reset any previous drawing session
        clearDrawingState();
        if (polygonRef.current) { polygonRef.current.setMap(null); polygonRef.current = null; }

        // Attach click listener to map
        clickListenerRef.current = map.addListener('click', (e) => {
            const point = e.latLng;
            customPointsRef.current.push(point);
            const count = customPointsRef.current.length;
            setDrawingPointsCount(count);

            // Add a small dot marker at clicked point
            const dotMarker = new window.google.maps.Marker({
                position: point,
                map: map,
                icon: {
                    path: window.google.maps.SymbolPath.CIRCLE,
                    scale: count === 1 ? 8 : 5,
                    fillColor: count === 1 ? '#ef4444' : '#2563eb',
                    fillOpacity: 1,
                    strokeColor: '#fff',
                    strokeWeight: 2
                },
                title: count === 1 ? 'Start Point' : `Point ${count}`,
                zIndex: 10
            });
            customTempMarkersRef.current.push(dotMarker);

            // Update live preview polyline
            if (customPolylineRef.current) {
                customPolylineRef.current.setMap(null);
            }
            const previewPath = [...customPointsRef.current, customPointsRef.current[0]];
            customPolylineRef.current = new window.google.maps.Polyline({
                path: previewPath,
                geodesic: true,
                strokeColor: '#f59e0b',
                strokeOpacity: 0.9,
                strokeWeight: 2.5,
                map: map
            });
        });
    }, []);

    const finishDrawing = useCallback(() => {
        const points = customPointsRef.current;
        if (points.length < 3) {
            toast.error('Please click at least 3 points on the map to form a polygon.');
            return;
        }
        clearDrawingState();
        computeAndSavePolygon(points);
    }, []);

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
        handleAddLandRow,
        handleRemoveLandRow,
        updateLandRow,
        handleFurnishedItemKeyDown,
        removeFurnishedItem,
        clearPolygon,
        activateDrawing,
        finishDrawing,
        drawingPointsCount,
        autoDetectLandmarks,
        isDetectingLandmarks
    };
};
