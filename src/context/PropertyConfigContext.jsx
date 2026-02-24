import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { PROPERTY_CATEGORIES } from '../data/propertyData';
import { PROJECTS_LIST } from '../data/projectData';

import { api, lookupsAPI, systemSettingsAPI } from '../utils/api';

const PropertyConfigContext = createContext();

export const usePropertyConfig = () => {
    const context = useContext(PropertyConfigContext);
    if (!context) {
        throw new Error('usePropertyConfig must be used within a PropertyConfigProvider');
    }
    return context;
};

export const PropertyConfigProvider = ({ children }) => {
    // Initialize state with the static data
    const [propertyConfig, setPropertyConfig] = useState(PROPERTY_CATEGORIES);
    const [isLoading, setIsLoading] = useState(true);

    // Initialize Projects State (Dynamic)
    const [projects, setProjects] = useState([]);

    // --- LOOKUPS STATE ---
    const [lookups, setLookups] = useState({}); // { type: [lookupObjects] }

    const refreshSizes = useCallback(async () => {
        try {
            // SINGLE SOURCE OF TRUTH: Fetch from Lookups ('size' category)
            const sizesResponse = await lookupsAPI.getByCategory('size');
            let lookupSizes = [];
            if (sizesResponse && sizesResponse.status === "success" && Array.isArray(sizesResponse.data)) {
                lookupSizes = sizesResponse.data.map(l => ({
                    id: l._id,
                    name: l.lookup_value,
                    ...l.metadata
                }));
            }

            setSizes(lookupSizes);
        } catch (error) {
            console.error('Failed to refresh sizes:', error);
        }
    }, []);

    const getLookupId = useCallback((type, value) => {
        if (!lookups[type] || !value) return null;
        if (typeof value === 'object' && value._id) return value._id;
        const found = lookups[type].find(l =>
            l.lookup_value === value ||
            (typeof value === 'string' && value === l._id)
        );
        return found ? found._id : null;
    }, [lookups]);

    const getLookupValue = useCallback((type, id) => {
        if (!id) return id;

        // If it's already a populated object, just return the value
        if (typeof id === 'object' && id.lookup_value) return id.lookup_value;

        // 1. Try the specified category first (efficient)
        if (lookups[type]) {
            const found = lookups[type].find(l => l._id === id || l.id === id);
            if (found) return found.lookup_value;
        }

        // 2. Global Fallback: Search across all categories if ID is not found in specified type
        // This handles cases where the frontend and backend have mismatched category names
        for (const category in lookups) {
            if (Array.isArray(lookups[category])) {
                const found = lookups[category].find(l => l._id === id || l.id === id);
                if (found) return found.lookup_value;
            }
        }

        return id;
    }, [lookups]);

    const findLookup = useCallback((type, value, parentId = null) => {
        if (!lookups[type]) return null;
        return lookups[type].find(l =>
            l.lookup_value === value &&
            (!parentId || l.parent_lookup_id === parentId)
        );
    }, [lookups]);

    const refreshLookups = useCallback(async () => {
        try {
            const types = [
                'Category', 'SubCategory', 'PropertyType', 'BuiltupType',
                'Facing', 'Direction', 'RoadWidth', 'UnitType',
                'ProjectStatus', 'ParkingType', 'Size', 'Intent', 'Status',
                'category', 'subCategory', 'facing', 'direction',
                'Country', 'State', 'City', 'Location',
                'Title', 'CountryCode', 'Source', 'SubSource', 'Campaign',
                'ProfessionalCategory', 'ProfessionalSubCategory', 'ProfessionalDesignation',
                'Requirement', 'Sub Requirement', 'Property Type', 'Sub Type', 'Budget'
            ];

            const results = await Promise.all(
                types.map(t => lookupsAPI.getByCategory(t))
            );

            const newLookups = {};
            types.forEach((type, index) => {
                const res = results[index];
                if (res && res.status === "success" && Array.isArray(res.data)) {
                    newLookups[type] = res.data;
                } else if (Array.isArray(res)) {
                    newLookups[type] = res;
                } else {
                    newLookups[type] = [];
                }
            });

            setLookups(newLookups);

            // Populate masterFields from Lookups (Facing, Direction, etc.)
            setMasterFields(prev => ({
                ...prev,
                facings: newLookups['Facing']?.map(l => l.lookup_value) || [],
                directions: newLookups['Direction']?.map(l => l.lookup_value) || [],
                roadWidths: newLookups['RoadWidth']?.map(l => l.lookup_value) || [],
                unitTypes: newLookups['UnitType']?.map(l => l.lookup_value) || []
            }));

            // Reconstruct propertyConfig from Lookups (for compatibility)
            // This is a complex mapping, we'll implement it if needed, 
            // but for now let's focus on providing the lookup lists.

            // Map Sizes for refreshSizes compatibility
            if (newLookups['Size']) {
                const normalizedSizes = newLookups['Size'].map(l => ({
                    id: l._id,
                    name: l.lookup_value,
                    ...l.metadata
                }));
                setSizes(normalizedSizes);
            }

            return newLookups;
        } catch (error) {
            console.error('[PropertyConfigContext] Failed to refresh lookups:', error);
            return {};
        }
    }, []);

    // Load all configurations from backend on mount
    useEffect(() => {
        const loadAllConfigs = async () => {
            try {
                // 1. LOAD LOOKUPS FIRST (Primary source for normalized fields)
                const fetchedLookups = await refreshLookups();

                // 2. LOAD SYSTEM SETTINGS (Secondary source / Remaining configs)
                const response = await systemSettingsAPI.getAll({ limit: 100 });
                if (response && response.data) {
                    const settings = response.data;
                    const settingsList = Array.isArray(settings) ? settings : (settings.docs || []);

                    // Map settings to state
                    settingsList.forEach(setting => {
                        switch (setting.key) {
                            case 'property_config': setPropertyConfig(setting.value); break;
                            case 'project_master_fields': setProjectMasterFields(setting.value); break;
                            case 'project_amenities': setProjectAmenities(setting.value); break;
                            case 'lead_master_fields': setLeadMasterFields(setting.value); break;
                            case 'scoring_attributes': setScoringAttributes(setting.value); break;
                            case 'scoring_config': setScoringConfig(setting.value); break;
                            case 'behavioural_signals': setBehaviouralSignals(setting.value); break;
                            case 'deal_fit_signals': setDealFitSignals(setting.value); break;
                            case 'financial_signals': setFinancialSignals(setting.value); break;
                            case 'decay_rules': setDecayRules(setting.value); break;
                            case 'ai_signals': setAiSignals(setting.value); break;
                            case 'source_quality_scores': setSourceQualityScores(setting.value); break;
                            case 'inventory_fit_scores': setInventoryFitScores(setting.value); break;
                            case 'stage_multipliers': setStageMultipliers(setting.value); break;
                            case 'deal_scoring_rules': setDealScoringRules(setting.value); break;
                            case 'score_bands': setScoreBands(setting.value); break;
                            case 'activity_master_fields': setActivityMasterFields(setting.value); break;
                            default: break;
                        }
                    });
                }

                // FETCH COMPANY LOOKUPS
                const [cTypes, inds] = await Promise.all([
                    lookupsAPI.getByCategory('CompanyType'),
                    lookupsAPI.getByCategory('Industry')
                ]);
                setCompanyMasterFields({
                    companyTypes: (cTypes && Array.isArray(cTypes.data)) ? cTypes.data : (Array.isArray(cTypes) ? cTypes : []),
                    industries: (inds && Array.isArray(inds.data)) ? inds.data : (Array.isArray(inds) ? inds : [])
                });

                // FETCH REAL SIZES FROM LOOKUPS
                await refreshSizes();

                // FETCH REAL PROJECTS FROM BACKEND
                console.log("[PropertyConfigContext] Fetching projects...");
                const projectsRes = await api.get('/projects');
                console.log("[PropertyConfigContext] Projects response:", projectsRes.data);

                if (projectsRes.data && projectsRes.data.success && Array.isArray(projectsRes.data.data)) {
                    setProjects(projectsRes.data.data);
                } else if (Array.isArray(projectsRes.data)) {
                    // Handle case where API might return array directly (less likely but possible based on controller)
                    setProjects(projectsRes.data);
                } else {
                    console.warn("[PropertyConfigContext] Unexpected projects data format:", projectsRes.data);
                    setProjects([]);
                }
            } catch (error) {
                console.error('Failed to load configs from backend:', error);
                // Fallback for projects if backend is down - use static list if needed
                console.warn("[PropertyConfigContext] Using fallback static projects due to error.");
                setProjects(PROJECTS_LIST);

                // Keep backward compatibility for propertyConfig if needed
                try {
                    const lookups = await lookupsAPI.getByCategory('property_configuration');
                    if (lookups && lookups.length > 0) {
                        const config = lookups[0].value;
                        if (config) setPropertyConfig(config);
                    }
                } catch (e) {
                    console.error('Lookups fallback failed:', e);
                }
            } finally {
                setIsLoading(false);
            }
        };
        loadAllConfigs();
    }, [refreshSizes]);

    const addProject = useCallback(async (newProject) => {
        const project = {
            id: Date.now(),
            name: newProject.name,
            location: newProject.location || '',
            blocks: [],
            units: [],
            ...newProject
        };
        // Functional update to avoid dependency on 'projects' which changes
        setProjects(prevProjects => {
            const updatedProjects = [...prevProjects, project];
            // Save to backend inside setter or using updated value?
            // Better to trigger save effect or save here.

            // Saving here requires handling async properly, but we can fire and forget for UI consistency
            systemSettingsAPI.upsert('dynamic_projects', {
                category: 'property',
                value: updatedProjects,
                isPublic: true
            }).catch(err => console.error('Failed to save projects:', err));

            return updatedProjects;
        });
        return project;
    }, []);

    const addBlock = async (projectId, blockName) => {
        const updatedProjects = projects.map(p => {
            if (p.id === projectId || p.name === projectId) { // Handle both ID or Name lookup
                return { ...p, blocks: [...(p.blocks || []), blockName] };
            }
            return p;
        });
        setProjects(updatedProjects);

        // Save to backend
        try {
            await systemSettingsAPI.upsert('dynamic_projects', {
                category: 'property',
                value: updatedProjects,
                isPublic: true
            });
        } catch (error) {
            console.error('Failed to save projects to backend:', error);
        }
    };

    // Helper Hook for Persistence
    const useLocalStorage = (key, initialValue) => {
        const [storedValue, setStoredValue] = useState(() => {
            try {
                const item = window.localStorage.getItem(key);
                return item ? JSON.parse(item) : initialValue;
            } catch (error) {
                console.error(error);
                return initialValue;
            }
        });

        const setValue = useCallback((value) => {
            try {
                const valueToStore = value instanceof Function ? value(storedValue) : value;
                setStoredValue(valueToStore);
                window.localStorage.setItem(key, JSON.stringify(valueToStore));
            } catch (error) {
                console.error(error);
            }
        }, [key, storedValue]); // storedValue dependency is needed for functional updates, but might cause instability?
        // Actually, for functional updates, we should use setStoredValue(prev => ...)
        // Let's refactor slightly to avoid storedValue dependency if possible.

        /* Refactored setValue to be stable */
        const setValueStable = useCallback((value) => {
            try {
                setStoredValue(prev => {
                    const valueToStore = value instanceof Function ? value(prev) : value;
                    window.localStorage.setItem(key, JSON.stringify(valueToStore));
                    return valueToStore;
                });
            } catch (error) {
                console.error(error);
            }
        }, [key]);

        return [storedValue, setValueStable];
    };

    // Master Fields State (Property Specific)
    // Initialized from LocalStorage or empty arrays; populated on load from Lookups
    const [masterFields, setMasterFields] = useLocalStorage('masterFields', {
        facings: [],
        roadWidths: [],
        directions: [],
        unitTypes: [],
        floorLevels: [
            'Basement', 'Ground Floor', 'First Floor', 'Second Floor', 'Third Floor', 'Top Floor'
        ],
        documents: [
            'Registry', 'Mutation', 'GPA', 'Aadhaar Card', 'PAN Card'
        ],
        images: [
            'Front View', 'Bedroom', 'Kitchen', 'Washroom', 'Map'
        ],
        videos: [
            'Walkthrough', 'Drone View', 'Interior Tour'
        ],
        propertyOwnerFeedback: [
            'Interested / Warm', 'Interested / Hot', 'Not Interested',
            'Request Call Back', 'Busy / Driving', 'Switch Off / Unreachable',
            'Market Feedback', 'General Inquiry', 'Wrong Number / Invalid'
        ],
        followUpActions: [
            'Call Back', 'Meeting Scheduled', 'Site Visit', 'Document Collection', 'Negotiation', 'WhatsApp Message', 'Email'
        ],
        feedbackReasons: {
            'Interested / Warm': ['Wants to Buy (Invest)', 'Sell & Buy (Re-invest)', 'For Sale', 'For Rent', 'Evaluating Options'],
            'Interested / Hot': ['Ready to Sell Now', 'High Intent (Urgent)', 'Multiple Parties Interested', 'Agreement Pending'],
            'Not Interested': ['Sold Out', 'Rented Out', 'Price Too High (Expectations)', 'Plan Dropped / Personal Reason', 'Unreasonable Demands', 'Not Selling but Buying', 'Family Dispute'],
            'Request Call Back': ['Busy / Driving', 'In Meeting', 'Sick / Family Emergency', 'Out of Station', 'Discuss with Family', 'Evening / Morning Request'],
            'Busy / Driving': ['DND Request', 'Driving', 'Working'],
            'Switch Off / Unreachable': ['Switch Off', 'Not Reachable', 'No Answer', 'Out of Coverage'],
            'Market Feedback': ['Inquiring Rates Only', 'Comparative Research', 'Taxation Query', 'Checking Demand'],
            'General Inquiry': ['Document Status', 'Maintenance Issue', 'Rent Collection', 'Ownership Dispute'],
            'Wrong Number / Invalid': ['Wrong Number', 'Ownership Changed', 'Invalid Number', 'Language Barrier']
        },
        responseTemplates: {
            'Interested / Hot': {
                whatsapp: "Hi {owner}, great to hear from you regarding {unit}! I'm finalizing the details for our {time} meeting. Please keep the original documents ready.",
                sms: "{unit} Update: Hi {owner}, finalized meeting for {time}. Please keep documents ready.",
                email: "Subject: Update regarding {unit}\n\nHi {owner},\n\nGreat to hear from you regarding {unit}! I'm finalizing the details for our {time} meeting. Please keep the original documents ready.\n\nBest regards,\nBharat Properties"
            },
            'Interested / Warm': {
                whatsapp: "Hi {owner}, thank you for your time discussing {unit}. I've noted your interest for {reason}. I will share some market comparisons shortly.",
                sms: "Hi {owner}, thanks for discussing {unit}. Noted your interest as {reason}. Will share details soon.",
                email: "Subject: Interest noted for {unit}\n\nHi {owner},\n\nThank you for your time discussing {unit}. I've noted your interest for {reason}. I will share some market comparisons shortly.\n\nBest regards,\nBharat Properties"
            },
            'Request Call Back': {
                whatsapp: "Hi {owner}, apologies for the interruption. I will call you back at {time} regarding {unit} as requested.",
                sms: "Hi {owner}, will call you back at {time} regarding {unit}. Sorry for the interruption.",
                email: "Subject: Call back request for {unit}\n\nHi {owner},\n\nApologies for the interruption. I will call you back at {time} regarding {unit} as requested.\n\nBest regards,\nBharat Properties"
            },
            'Not Interested': {
                whatsapp: "Hi {owner}, thank you for the update on {unit}. I've updated the record as {reason}. Do reach out if your plans change.",
                sms: "Hi {owner}, noted on {unit} as {reason}. Reach out if plans change. Thanks.",
                email: "Subject: Status update for {unit}\n\nHi {owner},\n\nThank you for the update on {unit}. I've updated the record as {reason}. Do reach out if your plans change.\n\nBest regards,\nBharat Properties"
            },
            'Busy / Driving': {
                whatsapp: "Hi {owner}, I tried calling you regarding {unit}. I'll reach out again later today.",
                sms: "Hi {owner}, tried calling for {unit}. Will call again later. Thanks.",
                email: "Subject: Missed you regarding {unit}\n\nHi {owner},\n\nI tried calling you regarding {unit}. I'll reach out again later today.\n\nBest regards,\nBharat Properties"
            },
            'Market Feedback': {
                whatsapp: "Hi {owner}, thank you for the insight on {unit}. If you decide to proceed with sale or rent, I have active buyers ready.",
                sms: "Hi {owner}, thanks for feedback on {unit}. Contact us if you decide to sell/rent. Active buyers ready.",
                email: "Subject: Market feedback for {unit}\n\nHi {owner},\n\nThank you for the insight on {unit}. If you decide to proceed with sale or rent, I have active buyers ready.\n\nBest regards,\nBharat Properties"
            }
        },
        triggers: {
            'Feedback Received': {
                whatsapp: true,
                sms: false,
                email: false
            }
        },
        feedbackRules: {
            'Not Interested': {
                'Sold Out': { templateKey: 'Not Interested', actionType: 'None', sendWhatsapp: true, sendSms: false, sendEmail: false },
                'Rented Out': { templateKey: 'Not Interested', actionType: 'None', sendWhatsapp: true, sendSms: false, sendEmail: false }
            },
            'Interested / Hot': {
                'Ready to Sell Now': { templateKey: 'Interested / Hot', actionType: 'Meeting Scheduled', sendWhatsapp: true, sendSms: false, sendEmail: false }
            }
        }
    });

    // Project Master Fields (Moved/Copied from Property)
    const [projectMasterFields, setProjectMasterFields] = useLocalStorage('projectMasterFields', {
        approvals: [
            'RERA', 'DTCP', 'TCP', 'CLU', 'OC', 'CC'
        ],
        approvalAuthorities: [
            'DTCP', 'RERA', 'GMADA', 'HUDA', 'MC'
        ],
        projectStatuses: [
            'Under Construction', 'Ready to Move', 'New Launch', 'Pre-Launch'
        ],
        parkingTypes: [
            'Covered', 'Open', 'Stilt', 'Basement', 'Podium'
        ],
        images: [
            'Front View', 'Bedroom', 'Kitchen', 'Washroom', 'Map'
        ],
        videos: [
            'Walkthrough', 'Drone View', 'Interior Tour'
        ]
    });

    // Dynamic Amenities Configuration
    const [projectAmenities, setProjectAmenities] = useLocalStorage('projectAmenities', {
        'Basic': [
            { id: 'bp1', name: 'Car Parking', icon: 'fa-car' },
            { id: 'bp2', name: 'Intercom', icon: 'fa-phone-alt' },
            { id: 'bp3', name: 'Multi-Purpose Hall', icon: 'fa-users' },
            { id: 'bp4', name: '24x7 Water Supply', icon: 'fa-tint' },
            { id: 'bp5', name: 'Municipal Water Supply', icon: 'fa-faucet' },
            { id: 'bp6', name: 'Garbage Management System', icon: 'fa-trash-alt' },
            { id: 'bp7', name: 'Fire Fighting System', icon: 'fa-fire-extinguisher' },
            { id: 'bp8', name: 'Visitor Car Parking', icon: 'fa-car-side' },
            { id: 'bp9', name: 'Earthquake Resistance', icon: 'fa-house-damage' },
            { id: 'bp10', name: 'Lift', icon: 'fa-elevator' },
            { id: 'bp11', name: 'Maintenance Staff', icon: 'fa-concierge-bell' },
            { id: 'bp12', name: 'Power Supply', icon: 'fa-bolt' },
            { id: 'bp13', name: 'Air Condition', icon: 'fa-snowflake' },
            { id: 'bp14', name: 'Security', icon: 'fa-shield-alt' },
            { id: 'bp15', name: 'Bike Parking', icon: 'fa-motorcycle' }
        ],
        'Featured': [
            { id: 'fp1', name: 'Club House', icon: 'fa-glass-cheers' },
            { id: 'fp2', name: 'Gymnasium', icon: 'fa-dumbbell' },
            { id: 'fp3', name: 'Swimming Pool', icon: 'fa-swimming-pool' },
            { id: 'fp4', name: 'Garden', icon: 'fa-leaf' },
            { id: 'fp5', name: 'Jogging Track', icon: 'fa-running' },
            { id: 'fp6', name: 'Kids Play Area', icon: 'fa-child' },
            { id: 'fp7', name: 'Yoga And Meditation Center', icon: 'fa-om' },
            { id: 'fp8', name: 'Library', icon: 'fa-book' },
            { id: 'fp9', name: 'Spa & Saloon', icon: 'fa-spa' },
            { id: 'fp10', name: 'Indoor Games', icon: 'fa-chess' }
        ],
        'Nearby': [
            { id: 'np1', name: 'School', icon: 'fa-school' },
            { id: 'np2', name: 'Hospital', icon: 'fa-hospital' },
            { id: 'np3', name: 'Metro Station', icon: 'fa-subway' },
            { id: 'np4', name: 'Shopping Mall', icon: 'fa-shopping-bag' },
            { id: 'np5', name: 'Market', icon: 'fa-store' },
            { id: 'np6', name: 'Airport', icon: 'fa-plane' }
        ]
    });

    // Ensure new fields are added to state even if persisted (HMR/Storage fix)
    React.useEffect(() => {
        // ... (Logic to sync defaults if needed, simplified for clarity as we are hardcoding defaults above)
    }, []);

    // CRUD Operations exposed to the app
    const updateConfig = useCallback(async (newConfig) => {
        // Validation: Ensure newConfig is a valid object
        if (!newConfig || typeof newConfig !== 'object' || Array.isArray(newConfig)) {
            console.error('[PropertyConfigContext] Invalid config object provided to updateConfig');
            return;
        }

        // Deep Validation: Ensure categories have subCategories array
        const isValid = Object.values(newConfig).every(cat =>
            cat && typeof cat === 'object' && Array.isArray(cat.subCategories)
        );

        if (!isValid) {
            console.error('[PropertyConfigContext] Invalid category structure in updateConfig');
            // We still update local state to allow UI to show something, but we might want to alert or block save
            // For now, let's at least protect the backend
        }

        setPropertyConfig(newConfig);
        localStorage.setItem('propertyConfig', JSON.stringify(newConfig));

        if (!isValid) return; // Block backend save if invalid

        try {
            await systemSettingsAPI.upsert('property_config', {
                category: 'property',
                value: newConfig,
                isPublic: true,
                description: 'Global property configuration (Validated)'
            });
        } catch (error) {
            console.error('Failed to save property config:', error);
            throw error;
        }
    }, [setPropertyConfig]);

    const updateMasterFields = useCallback(async (field, newValuesOrValue, mode = 'update') => {
        const fieldToLookupType = {
            facings: 'Facing',
            directions: 'Direction',
            roadWidths: 'RoadWidth',
            unitTypes: 'UnitType'
        };

        const lookupType = fieldToLookupType[field];

        if (lookupType) {
            try {
                if (mode === 'add') {
                    await lookupsAPI.create({
                        lookup_type: lookupType,
                        lookup_value: newValuesOrValue,
                        is_active: true
                    });
                } else if (mode === 'delete') {
                    const lookupToDelete = lookups[lookupType]?.find(l => l.lookup_value === newValuesOrValue || l._id === newValuesOrValue);
                    if (lookupToDelete) {
                        await lookupsAPI.delete(lookupToDelete._id);
                    }
                }
                // Always refresh from lookups to keep state in sync
                await refreshLookups();
                return;
            } catch (error) {
                console.error(`Failed to sync lookup for ${field}:`, error);
            }
        }

        // For non-lookup fields or if direct update is needed
        setMasterFields(prevFields => {
            let updated;
            if (mode === 'add') {
                updated = { ...prevFields, [field]: [...(prevFields[field] || []), newValuesOrValue] };
            } else if (mode === 'delete') {
                updated = { ...prevFields, [field]: (prevFields[field] || []).filter(v => v !== newValuesOrValue) };
            } else {
                updated = { ...prevFields, [field]: newValuesOrValue };
            }

            // Professional cleanup: Only upsert to master_fields if it's NOT a lookup-driven field
            if (!lookupType) {
                systemSettingsAPI.upsert('master_fields', {
                    category: 'property',
                    value: updated,
                    isPublic: true
                }).catch(e => console.error('Failed to save master fields:', e));
            }
            return updated;
        });
    }, [setMasterFields, lookups, refreshLookups]);

    const updateProjectMasterFields = useCallback(async (field, newValuesOrValue, mode = 'update') => {
        const fieldToLookupType = {
            projectStatuses: 'ProjectStatus',
            parkingTypes: 'ParkingType'
        };

        const lookupType = fieldToLookupType[field];

        if (lookupType) {
            try {
                if (mode === 'add') {
                    await lookupsAPI.create({
                        lookup_type: lookupType,
                        lookup_value: newValuesOrValue,
                        is_active: true
                    });
                    await refreshLookups();
                } else if (mode === 'delete') {
                    const lookupToDelete = lookups[lookupType]?.find(l => l.lookup_value === newValuesOrValue || l._id === newValuesOrValue);
                    if (lookupToDelete) {
                        await lookupsAPI.delete(lookupToDelete._id);
                        await refreshLookups();
                    }
                }
            } catch (error) {
                console.error(`Failed to sync lookup for ${field}:`, error);
            }
        }

        setProjectMasterFields(prevFields => {
            const updated = mode === 'update' ? { ...prevFields, [field]: newValuesOrValue } : prevFields;
            systemSettingsAPI.upsert('project_master_fields', {
                category: 'property',
                value: updated,
                isPublic: true
            }).catch(e => console.error('Failed to save project master fields:', e));
            return updated;
        });
    }, [setProjectMasterFields, lookups, refreshLookups]);

    const syncCategoryLookup = useCallback(async (categoryName, mode = 'add', oldName = null) => {
        try {
            if (mode === 'add') {
                await lookupsAPI.create({ lookup_type: 'Category', lookup_value: categoryName, is_active: true });
            } else if (mode === 'update' && oldName) {
                const existing = findLookup('Category', oldName);
                if (existing) await lookupsAPI.update(existing._id, { lookup_value: categoryName });
            } else if (mode === 'delete') {
                const existing = findLookup('Category', categoryName);
                if (existing) await lookupsAPI.delete(existing._id);
            }
            await refreshLookups();
        } catch (error) {
            console.error('Failed to sync Category lookup:', error);
        }
    }, [findLookup, refreshLookups]);

    const syncSubCategoryLookup = useCallback(async (categoryName, subCategoryName, mode = 'add', oldName = null) => {
        try {
            const category = findLookup('Category', categoryName);
            if (!category) return;

            if (mode === 'add') {
                await lookupsAPI.create({ lookup_type: 'SubCategory', lookup_value: subCategoryName, parent_lookup_id: category._id, is_active: true });
            } else if (mode === 'update' && oldName) {
                const existing = findLookup('SubCategory', oldName, category._id);
                if (existing) await lookupsAPI.update(existing._id, { lookup_value: subCategoryName });
            } else if (mode === 'delete') {
                const existing = findLookup('SubCategory', subCategoryName, category._id);
                if (existing) await lookupsAPI.delete(existing._id);
            }
            await refreshLookups();
        } catch (error) {
            console.error('Failed to sync SubCategory lookup:', error);
        }
    }, [findLookup, refreshLookups]);

    const syncPropertyTypeLookup = useCallback(async (categoryName, subCategoryName, typeName, mode = 'add', oldName = null) => {
        try {
            const category = findLookup('Category', categoryName);
            if (!category) return;
            const subCategory = findLookup('SubCategory', subCategoryName, category._id);
            if (!subCategory) return;

            if (mode === 'add') {
                await lookupsAPI.create({ lookup_type: 'PropertyType', lookup_value: typeName, parent_lookup_id: subCategory._id, is_active: true });
            } else if (mode === 'update' && oldName) {
                const existing = findLookup('PropertyType', oldName, subCategory._id);
                if (existing) await lookupsAPI.update(existing._id, { lookup_value: typeName });
            } else if (mode === 'delete') {
                const existing = findLookup('PropertyType', typeName, subCategory._id);
                if (existing) await lookupsAPI.delete(existing._id);
            }
            await refreshLookups();
        } catch (error) {
            console.error('Failed to sync PropertyType lookup:', error);
        }
    }, [findLookup, refreshLookups]);

    const syncBuiltupTypeLookup = useCallback(async (categoryName, subCategoryName, typeName, builtupTypeName, mode = 'add', oldName = null) => {
        try {
            const category = findLookup('Category', categoryName);
            if (!category) return;
            const subCategory = findLookup('SubCategory', subCategoryName, category._id);
            if (!subCategory) return;
            const propertyType = findLookup('PropertyType', typeName, subCategory._id);
            if (!propertyType) return;

            if (mode === 'add') {
                await lookupsAPI.create({ lookup_type: 'BuiltupType', lookup_value: builtupTypeName, parent_lookup_id: propertyType._id, is_active: true });
            } else if (mode === 'update' && oldName) {
                const existing = findLookup('BuiltupType', oldName, propertyType._id);
                if (existing) await lookupsAPI.update(existing._id, { lookup_value: builtupTypeName });
            } else if (mode === 'delete') {
                const existing = findLookup('BuiltupType', builtupTypeName, propertyType._id);
                if (existing) await lookupsAPI.delete(existing._id);
            }
            await refreshLookups();
        } catch (error) {
            console.error('Failed to sync BuiltupType lookup:', error);
        }
    }, [findLookup, refreshLookups]);

    const updateProjectAmenities = useCallback(async (category, newAmenities) => {
        setProjectAmenities(prevAmenities => {
            const updated = { ...prevAmenities, [category]: newAmenities };
            systemSettingsAPI.upsert('project_amenities', {
                category: 'property',
                value: updated,
                isPublic: true
            }).catch(e => console.error('Failed to save project amenities:', e));
            return updated;
        });
    }, [setProjectAmenities]);

    // Company Master Fields - Stores full Lookup objects
    const [companyMasterFields, setCompanyMasterFields] = useState({
        companyTypes: [],
        industries: []
    });

    const updateCompanyMasterFields = useCallback(async (field, newItemValue) => {
        const lookupTypeMap = {
            companyTypes: 'CompanyType',
            industries: 'Industry'
        };
        const lookupType = lookupTypeMap[field];
        if (!lookupType) return;

        try {
            const res = await lookupsAPI.create({
                lookup_type: lookupType,
                lookup_value: newItemValue,
                is_active: true
            });
            if (res && res.data) {
                setCompanyMasterFields(prev => ({
                    ...prev,
                    [field]: [...prev[field], res.data]
                }));
            }
        } catch (error) {
            console.error(`Failed to add ${field} lookup:`, error);
            throw error;
        }
    }, []);

    const deleteCompanyMasterField = useCallback(async (field, lookupId) => {
        try {
            await lookupsAPI.delete(lookupId);
            setCompanyMasterFields(prev => ({
                ...prev,
                [field]: prev[field].filter(item => item._id !== lookupId)
            }));
        } catch (error) {
            console.error(`Failed to delete ${field} lookup:`, error);
            throw error;
        }
    }, []);

    // Lead & Campaign Master Fields
    const [leadMasterFields, setLeadMasterFields] = useLocalStorage('leadMasterFields', {
        transactionTypes: ['Collector Rate', 'Full White', 'Flexible'],
        fundingTypes: ['Home Loan', 'Self Funding', 'Loan Against Property', 'Personal Loan', 'Business Loan'],
        furnishingStatuses: ['Unfurnished', 'Semi-Furnished', 'Fully-Furnished'],
        timelines: ['Immediate', 'Within 3 Months', 'Within 6 Months', 'More than 6 Months'],
        campaigns: [
            {
                name: 'Organic Campaign',
                sources: [
                    { name: 'Walk-in', mediums: ['Store Visit', 'Front Desk'] },
                    { name: 'Referral', mediums: ['Client Referral', 'Employee Referral', 'Partner Referral'] },
                    { name: 'Website', mediums: ['Contact Form', 'Chatbot', 'Direct Call'] }
                ]
            },
            {
                name: 'Online Campaign',
                sources: [
                    { name: 'Facebook', mediums: ['Lead Form', 'Messenger', 'Comment', 'Post', 'Marketplace'] },
                    { name: 'Instagram', mediums: ['DM', 'Story Reply', 'Ad Click', 'Bio Link'] },
                    { name: 'Google Ads', mediums: ['Search Ad', 'Display Ad', 'YouTube Ad'] },
                    { name: 'LinkedIn', mediums: ['InMail', 'Post', 'Lead Gen Form'] }
                ]
            },
            {
                name: 'Offline Campaign',
                sources: [
                    { name: 'Cold Call', mediums: ['Database 1', 'Database 2'] },
                    { name: 'Newspaper Ad', mediums: ['Times of India', 'Hindustan Times'] },
                    { name: 'Hoarding', mediums: ['Sector 18', 'Main Highway'] }
                ]
            }
        ]
    });

    // Scoring Attributes State (Static Weights)
    const [scoringAttributes, setScoringAttributes] = useLocalStorage('scoringAttributes', {
        requirement: { label: 'Detailed Requirement', points: 32 },
        budget: { label: 'Budget Match', points: 10 },
        location: { label: 'Location Match', points: 10 },
        timeline: { label: 'Timeline Urgency', points: 10 },
        payment: { label: 'Payment Flexibility', points: 10 },
        source: { label: 'High Intent Source', points: 5 }
    });

    const updateScoringAttributes = useCallback(async (newAttributes) => {
        setScoringAttributes(prev => {
            const updated = { ...prev, ...newAttributes };
            systemSettingsAPI.upsert('scoring_attributes', {
                category: 'sales_config',
                value: updated,
                isPublic: true
            }).catch(e => console.error('Failed to save scoring attributes:', e));
            return updated;
        });
    }, [setScoringAttributes]);

    // --- NEW: Phased Scoring Configuration ---
    const [scoringConfig, setScoringConfig] = useLocalStorage('scoringConfig', {
        behavioural: { enabled: false },
        dealFit: { enabled: false },
        financial: { enabled: false },
        decay: { enabled: false },
        ai: { enabled: false }
    });

    const updateScoringConfig = useCallback(async (phase, newItem) => {
        setScoringConfig(prev => {
            const updated = {
                ...prev,
                [phase]: { ...prev[phase], ...newItem }
            };
            systemSettingsAPI.upsert('scoring_config', {
                category: 'sales_config',
                value: updated,
                isPublic: true
            }).catch(e => console.error('Failed to save scoring config:', e));
            return updated;
        });
    }, [setScoringConfig]);

    // Phase 1: Behavioural Scoring Signals
    const [behaviouralSignals, setBehaviouralSignals] = useLocalStorage('behaviouralSignals', {
        propertyMatchOpened: { label: 'Property Match Opened', points: 5 },
        sameLocationRepeated: { label: 'Same Location Repeatedly', points: 10 },
        fastReply: { label: 'WhatsApp Reply < 5 min', points: 8 },
        feedbackProvided: { label: 'Site Visit Feedback Added', points: 15 },
        repeatedNoResponse: { label: 'Repeated No Response', points: -10 }
    });

    const updateBehaviouralSignals = useCallback(async (newSignals) => {
        setBehaviouralSignals(prev => {
            const updated = { ...prev, ...newSignals };
            systemSettingsAPI.upsert('behavioural_signals', {
                category: 'sales_config',
                value: updated,
                isPublic: true
            }).catch(e => console.error('Failed to save behavioural signals:', e));
            return updated;
        });
    }, [setBehaviouralSignals]);

    // Phase 2: Deal-Fit Intelligence (Skeleton)
    const [dealFitSignals, setDealFitSignals] = useLocalStorage('dealFitSignals', {
        activeProperty: { label: 'Property Active', points: 10 },
        priceGapSmall: { label: 'Price Gap < 5%', points: 15 },
        exactMatch: { label: 'Exact Facing/Size', points: 10 },
        competition: { label: 'Multiple Competing Buyers', points: -10 },
        ownerFlexible: { label: 'Owner Flexible', points: 15 }
    });

    const updateDealFitSignals = useCallback(async (newSignals) => {
        setDealFitSignals(prev => {
            const updated = { ...prev, ...newSignals };
            systemSettingsAPI.upsert('deal_fit_signals', {
                category: 'sales_config',
                value: updated,
                isPublic: true
            }).catch(e => console.error('Failed to save deal fit signals:', e));
            return updated;
        });
    }, [setDealFitSignals]);

    // Phase 3: Financial Readiness (Skeleton)
    const [financialSignals, setFinancialSignals] = useLocalStorage('financialSignals', {
        cashBuyer: { label: 'Cash Buyer', points: 25 },
        loanApproved: { label: 'Loan Pre-approved', points: 15 },
        sellerFirst: { label: 'Needs to Sell First', points: -15 },
        investor: { label: 'Investor (Short Cycle)', points: 10 },
        flexiblePayment: { label: 'Flexible Payment Plan', points: 10 }
    });

    const updateFinancialSignals = useCallback(async (newSignals) => {
        setFinancialSignals(prev => {
            const updated = { ...prev, ...newSignals };
            systemSettingsAPI.upsert('financial_signals', {
                category: 'sales_config',
                value: updated,
                isPublic: true
            }).catch(e => console.error('Failed to save financial signals:', e));
            return updated;
        });
    }, [setFinancialSignals]);

    // Phase 4: Time Decay Rules (Skeleton)
    const [decayRules, setDecayRules] = useLocalStorage('decayRules', {
        inactive7: { label: '7 Days Inactivity', points: -5 },
        inactive14: { label: '14 Days Inactivity', points: -10 },
        inactive30: { label: '30 Days Inactivity (Auto-Dormant)', points: -20 } // -20 effectively kills the score usually
    });

    const updateDecayRules = useCallback(async (newRules) => {
        setDecayRules(prev => {
            const updated = { ...prev, ...newRules };
            systemSettingsAPI.upsert('decay_rules', {
                category: 'sales_config',
                value: updated,
                isPublic: true
            }).catch(e => console.error('Failed to save decay rules:', e));
            return updated;
        });
    }, [setDecayRules]);

    // Phase 5: AI Interpretation (Skeleton)
    const [aiSignals, setAiSignals] = useLocalStorage('aiSignals', {
        sentimentPositive: { label: 'Positive Sentiment Analysis', points: 20 },
        highIntentKeywords: { label: 'High Intent Keywords', points: 15 },
        competitorMention: { label: 'Competitor Mentioned', points: -5 },
        budgetConstraint: { label: 'Budget Constraint Mentioned', points: -10 }
    });

    const updateAiSignals = useCallback(async (newSignals) => {
        setAiSignals(prev => {
            const updated = { ...prev, ...newSignals };
            systemSettingsAPI.upsert('ai_signals', {
                category: 'sales_config',
                value: updated,
                isPublic: true
            }).catch(e => console.error('Failed to save AI signals:', e));
            return updated;
        });
    }, [setAiSignals]);

    // --- C. SOURCE QUALITY SCORES ---
    const [sourceQualityScores, setSourceQualityScores] = useLocalStorage('sourceQualityScores', {
        referral: { label: 'Referral', points: 20 },
        walkIn: { label: 'Walk-in', points: 15 },
        google: { label: 'Google Search', points: 12 },
        socialMedia: { label: 'Instagram / FB', points: 6 },
        portal: { label: 'Portal', points: 4 },
        coldCall: { label: 'Cold Call', points: 0 }
    });
    const updateSourceQualityScores = useCallback(async (newScores) => {
        setSourceQualityScores(prev => {
            const updated = { ...prev, ...newScores };
            systemSettingsAPI.upsert('source_quality_scores', {
                category: 'sales_config',
                value: updated,
                isPublic: true
            }).catch(e => console.error('Failed to save source quality scores:', e));
            return updated;
        });
    }, [setSourceQualityScores]);

    // --- D. INVENTORY FIT SCORES ---
    const [inventoryFitScores, setInventoryFitScores] = useLocalStorage('inventoryFitScores', {
        match5Plus: { label: 'Matching inventory \u2265 5', points: 10 },
        priceDev5: { label: 'Price deviation < 5%', points: 10 },
        exactSize: { label: 'Exact size match', points: 5 },
        locked: { label: 'Inventory locked', points: -15 },
        none: { label: 'No inventory', points: -20 }
    });
    const updateInventoryFitScores = useCallback(async (newScores) => {
        setInventoryFitScores(prev => {
            const updated = { ...prev, ...newScores };
            systemSettingsAPI.upsert('inventory_fit_scores', {
                category: 'sales_config',
                value: updated,
                isPublic: true
            }).catch(e => console.error('Failed to save inventory fit scores:', e));
            return updated;
        });
    }, [setInventoryFitScores]);

    // --- F. STAGE MULTIPLIERS ---
    const [stageMultipliers, setStageMultipliers] = useLocalStorage('stageMultipliers', {
        incoming: { label: 'Incoming', value: 0.7 },
        prospect: { label: 'Prospect', value: 1.0 },
        opportunity: { label: 'Opportunity', value: 1.3 },
        negotiation: { label: 'Negotiation', value: 1.5 }
    });
    const updateStageMultipliers = useCallback(async (newMultipliers) => {
        setStageMultipliers(prev => {
            const updated = { ...prev, ...newMultipliers };
            systemSettingsAPI.upsert('stage_multipliers', {
                category: 'sales_config',
                value: updated,
                isPublic: true
            }).catch(e => console.error('Failed to save stage multipliers:', e));
            return updated;
        });
    }, [setStageMultipliers]);

    // --- DEAL SCORING ENGINE ---
    const [dealScoringRules, setDealScoringRules] = useLocalStorage('dealScoringRules', {
        stages: {
            open: { label: 'Open', points: 10 },
            quote: { label: 'Quote', points: 20 },
            negotiation: { label: 'Negotiation', points: 35 },
            booked: { label: 'Booked', points: 50 }
        },
        signals: {
            priceDiscussion: { label: 'Price discussion', points: 10 },
            counterOffer: { label: 'Counter offer', points: 15 },
            visitRepeated: { label: 'Visit repeated', points: 20 },
            legalDocs: { label: 'Legal docs asked', points: 25 }
        },
        risks: {
            ownerNonResponsive: { label: 'Owner non-responsive', points: -20 },
            budgetGap: { label: 'Buyer budget gap', points: -15 },
            competition: { label: 'Inventory competition', points: -10 },
            delay15: { label: 'Delay > 15 days', points: -20 }
        }
    });
    const updateDealScoringRules = useCallback(async (section, newRules) => {
        setDealScoringRules(prev => {
            const updated = {
                ...prev,
                [section]: { ...prev[section], ...newRules }
            };
            systemSettingsAPI.upsert('deal_scoring_rules', {
                category: 'sales_config',
                value: updated,
                isPublic: true
            }).catch(e => console.error('Failed to save deal scoring rules:', e));
            return updated;
        });
    }, [setDealScoringRules]);

    // --- SCORE BANDS ---
    const [scoreBands, setScoreBands] = useLocalStorage('scoreBands', {
        cold: { label: 'Cold', min: 0, max: 30, color: '#64748b' },
        warm: { label: 'Warm', min: 31, max: 60, color: '#f59e0b' },
        hot: { label: 'Hot', min: 61, max: 80, color: '#ef4444' },
        superHot: { label: 'Super Hot', min: 81, max: 100, color: '#7c3aed' }
    });
    const updateScoreBands = useCallback(async (newBands) => {
        setScoreBands(newBands); // Direct set since argument is full new state
        systemSettingsAPI.upsert('score_bands', {
            category: 'sales_config',
            value: newBands,
            isPublic: true
        }).catch(e => console.error('Failed to save score bands:', e));
    }, [setScoreBands]);

    const updateLeadMasterFields = useCallback(async (field, newValues) => {
        setLeadMasterFields(prevFields => {
            const updated = { ...prevFields, [field]: newValues };
            systemSettingsAPI.upsert('lead_master_fields', {
                category: 'general',
                value: updated,
                isPublic: true
            }).catch(e => console.error('Failed to save lead master fields:', e));
            return updated;
        });
    }, [setLeadMasterFields]);

    // Activity Master Fields (Hierarchical: Activity -> Purpose -> Outcome { label, score })
    const [activityMasterFields, setActivityMasterFields] = useLocalStorage('activityMasterFields', {
        activities: [
            {
                name: 'Call',
                purposes: [
                    {
                        name: 'Introduction / First Contact',
                        outcomes: [
                            { label: 'Connected', score: 10 },
                            { label: 'Not Reachable', score: -2 },
                            { label: 'Wrong Number', score: -10 },
                            { label: 'Callback Requested', score: 5 },
                            { label: 'Busy', score: 0 }
                        ]
                    },
                    {
                        name: 'Requirement Gathering',
                        outcomes: [
                            { label: 'Requirements Shared', score: 15 },
                            { label: 'Partial Info', score: 8 },
                            { label: 'Refused to Share', score: -5 },
                            { label: 'Rescheduled', score: 0 }
                        ]
                    },
                    {
                        name: 'Follow-up',
                        outcomes: [
                            { label: 'Still Interested', score: 10 },
                            { label: 'Ready for Visit', score: 20 },
                            { label: 'Negotiation Mode', score: 12 },
                            { label: 'Lost Interest', score: -10 },
                            { label: 'No Response', score: -5 }
                        ]
                    },
                    {
                        name: 'Negotiation',
                        outcomes: [
                            { label: 'Offer Accepted', score: 50 },
                            { label: 'Offer Rejected', score: -20 },
                            { label: 'Counter Offer Made', score: 10 },
                            { label: 'Decision Pending', score: 0 }
                        ]
                    },
                    {
                        name: 'Post-Visit Feedback',
                        outcomes: [
                            { label: 'Liked Property', score: 25 },
                            { label: 'Disliked - Price', score: -5 },
                            { label: 'Disliked - Location', score: -5 },
                            { label: 'Thinking/Hold', score: 0 },
                            { label: 'Booking Request', score: 40 }
                        ]
                    },
                    {
                        name: 'Payment Reminder',
                        outcomes: [
                            { label: 'Payment Promised', score: 5 },
                            { label: 'Already Paid', score: 0 },
                            { label: 'Dispute', score: -10 },
                            { label: 'Extension Requested', score: -2 }
                        ]
                    }
                ]
            },
            {
                name: 'Meeting',
                purposes: [
                    {
                        name: 'Initial Consultation',
                        outcomes: [
                            { label: 'Qualified', score: 15 },
                            { label: 'Need More Time', score: 5 },
                            { label: 'Not Qualified', score: -10 },
                            { label: 'Rescheduled', score: 0 }
                        ]
                    },
                    {
                        name: 'Project Presentation',
                        outcomes: [
                            { label: 'Impressed', score: 20 },
                            { label: 'Neutral', score: 5 },
                            { label: 'Skeptical', score: -5 },
                            { label: 'Requested Site Visit', score: 25 }
                        ]
                    },
                    {
                        name: 'Price Negotiation',
                        outcomes: [
                            { label: 'Deal Closed', score: 100 },
                            { label: 'Stalemate', score: 0 },
                            { label: 'Discount Approved', score: 10 },
                            { label: 'Walk-away', score: -50 }
                        ]
                    },
                    {
                        name: 'Document Collection',
                        outcomes: [
                            { label: 'All Collected', score: 10 },
                            { label: 'Partial', score: 5 },
                            { label: 'Pending', score: 0 },
                            { label: 'Issues Found', score: -5 }
                        ]
                    },
                    {
                        name: 'Final Closing',
                        outcomes: [
                            { label: 'Signed', score: 100 },
                            { label: 'Reviewing Draft', score: 10 },
                            { label: 'Postponed', score: -5 },
                            { label: 'Cancelled', score: -50 }
                        ]
                    }
                ]
            },
            {
                name: 'Site Visit',
                purposes: [
                    {
                        name: 'First Visit (Solo)',
                        outcomes: [
                            { label: 'Very Interested', score: 30 },
                            { label: 'Somewhat Interested', score: 15 },
                            { label: 'Not Interested', score: -20 },
                            { label: 'Price Issue', score: -10 }
                        ]
                    },
                    {
                        name: 'Re-Visit (With Family)',
                        outcomes: [
                            { label: 'Shortlisted', score: 40 },
                            { label: 'Family Liked', score: 35 },
                            { label: 'Family Disliked', score: -20 },
                            { label: 'Need Consensus', score: 10 }
                        ]
                    },
                    {
                        name: 'Unit Selection',
                        outcomes: [
                            { label: 'Unit Blocked', score: 50 },
                            { label: 'Unit Not Available', score: -5 },
                            { label: 'Changed Preference', score: 0 },
                            { label: 'Thinking', score: 5 }
                        ]
                    },
                    {
                        name: 'Competitor Comparison',
                        outcomes: [
                            { label: 'Favors Us', score: 20 },
                            { label: 'Favors Competitor', score: -20 },
                            { label: 'Undecided', score: 0 }
                        ]
                    }
                ]
            }
        ]
    });

    // Project Property Sizes (Migrated to use Lookups)
    const [sizes, setSizes] = useState([]);

    const addSize = async (newSize) => {
        try {
            const { name, ...metadata } = newSize;
            const res = await lookupsAPI.create({
                lookup_type: 'size',
                lookup_value: name,
                metadata: metadata
            });

            if (res && res.data) {
                const added = {
                    id: res.data._id,
                    name: res.data.lookup_value,
                    ...res.data.metadata
                };
                setSizes(prev => [...prev, added]);
                return added;
            }
        } catch (error) {
            console.error('Failed to save property size:', error);
            throw error;
        }
    };

    const updateSize = async (updatedSize) => {
        try {
            const { id, name, ...metadata } = updatedSize;
            const res = await lookupsAPI.update(id, {
                lookup_value: name,
                metadata: metadata
            });

            if (res && res.data) {
                const updated = {
                    id: res.data._id,
                    name: res.data.lookup_value,
                    ...res.data.metadata
                };
                setSizes(prev => prev.map(s => s.id === id ? updated : s));
                return updated;
            }
        } catch (error) {
            console.error('Failed to update property size:', error);
            throw error;
        }
    };

    const deleteSize = async (id) => {
        try {
            await lookupsAPI.delete(id);
            setSizes(prev => prev.filter(s => s.id !== id));
        } catch (error) {
            console.error('Failed to delete property size:', error);
            throw error;
        }
    };

    const value = {
        propertyConfig,
        updateConfig,
        projects,
        addProject,
        addBlock,
        isLoading,
        masterFields,
        updateMasterFields,
        projectMasterFields,
        updateProjectMasterFields,
        projectAmenities,
        updateProjectAmenities,
        companyMasterFields,
        updateCompanyMasterFields,
        leadMasterFields,
        updateLeadMasterFields,
        scoringAttributes,
        updateScoringAttributes,
        scoringConfig,
        updateScoringConfig,
        behaviouralSignals,
        updateBehaviouralSignals,
        dealFitSignals,
        updateDealFitSignals,
        financialSignals,
        updateFinancialSignals,
        decayRules,
        updateDecayRules,
        aiSignals,
        updateAiSignals,
        sourceQualityScores,
        updateSourceQualityScores,
        inventoryFitScores,
        updateInventoryFitScores,
        stageMultipliers,
        updateStageMultipliers,
        dealScoringRules,
        updateDealScoringRules,
        scoreBands,
        updateScoreBands,
        companyMasterFields,
        updateCompanyMasterFields,
        deleteCompanyMasterField,
        leadMasterFields,
        updateLeadMasterFields,
        scoringAttributes,
        updateScoringAttributes,
        scoringConfig,
        updateScoringConfig,
        behaviouralSignals,
        updateBehaviouralSignals,
        dealFitSignals,
        updateDealFitSignals,
        financialSignals,
        updateFinancialSignals,
        decayRules,
        updateDecayRules,
        aiSignals,
        updateAiSignals,
        sourceQualityScores,
        updateSourceQualityScores,
        inventoryFitScores,
        updateInventoryFitScores,
        stageMultipliers,
        updateStageMultipliers,
        dealScoringRules,
        updateDealScoringRules,
        scoreBands,
        updateScoreBands,
        activityMasterFields,
        setActivityMasterFields,
        addSize,
        updateSize,
        deleteSize,
        refreshSizes,
        sizes,
        lookups,
        refreshLookups,
        getLookupId,
        getLookupValue,
        findLookup,
        syncCategoryLookup,
        syncSubCategoryLookup,
        syncPropertyTypeLookup,
        syncBuiltupTypeLookup
    };


    return (
        <PropertyConfigContext.Provider value={value}>
            {children}
        </PropertyConfigContext.Provider>
    );
};
