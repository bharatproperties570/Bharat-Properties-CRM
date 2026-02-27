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
                'Country', 'State', 'City', 'Location',
                'Title', 'CountryCode', 'Source', 'SubSource', 'Campaign',
                'ProfessionalCategory', 'ProfessionalSubCategory', 'ProfessionalDesignation',
                'Requirement', 'SubRequirement', 'SubType', 'Budget',
                'DocumentCategory', 'DocumentType', 'DocumentName', 'LoanType', 'IncomeSource', 'SocialPlatform'
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
                'Sold Out': { templateKey: 'Not Interested', actionType: 'None', sendWhatsapp: true, sendSms: false, sendEmail: false, inventoryStatus: 'InActive' },
                'Rented Out': { templateKey: 'Not Interested', actionType: 'None', sendWhatsapp: true, sendSms: false, sendEmail: false, inventoryStatus: 'InActive' },
                'Price Too High (Expectations)': { templateKey: 'Not Interested', actionType: 'None', sendWhatsapp: true, inventoryStatus: 'Active' },
                'Plan Dropped / Personal Reason': { templateKey: 'Not Interested', actionType: 'None', sendWhatsapp: true, inventoryStatus: 'InActive' }
            },
            'Interested / Hot': {
                'Ready to Sell Now': { templateKey: 'Interested / Hot', actionType: 'Meeting Scheduled', sendWhatsapp: true, sendSms: false, sendEmail: false, inventoryStatus: 'Active' }
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
            // ─────────────────────────────────────────────────────────────────────
            // 1. CALL
            // ─────────────────────────────────────────────────────────────────────
            {
                name: 'Call',
                purposes: [
                    {
                        name: 'Introduction / First Contact',
                        outcomes: [
                            { label: 'Connected', score: 10, stage: 'Prospect' },
                            { label: 'Not Reachable', score: -2, stage: 'New' },
                            { label: 'Wrong Number', score: -10, stage: 'New' },
                            { label: 'Callback Requested', score: 5, stage: 'Prospect' },
                            { label: 'Busy', score: 0, stage: 'New' },
                        ]
                    },
                    {
                        name: 'Requirement Gathering',
                        outcomes: [
                            { label: 'Requirements Shared', score: 15, stage: 'Qualified' },
                            { label: 'Partial Info', score: 8, stage: 'Prospect' },
                            { label: 'Refused to Share', score: -5, stage: 'New' },
                            { label: 'Rescheduled', score: 0, stage: 'Prospect' },
                        ]
                    },
                    {
                        name: 'Follow-up',
                        outcomes: [
                            { label: 'Still Interested', score: 10, stage: 'Prospect' },
                            { label: 'Ready for Visit', score: 20, stage: 'Opportunity' },
                            { label: 'Negotiation Mode', score: 12, stage: 'Negotiation' },
                            { label: 'Lost Interest', score: -10, stage: 'New' },
                            { label: 'No Response', score: -5, stage: 'New' },
                        ]
                    },
                    {
                        name: 'Negotiation',
                        outcomes: [
                            { label: 'Offer Accepted', score: 50, stage: 'Booked' },
                            { label: 'Offer Rejected', score: -20, stage: 'Negotiation' },
                            { label: 'Counter Offer Made', score: 10, stage: 'Negotiation' },
                            { label: 'Decision Pending', score: 0, stage: 'Negotiation' },
                        ]
                    },
                    {
                        name: 'Post-Visit Feedback',
                        outcomes: [
                            { label: 'Liked Property', score: 25, stage: 'Opportunity' },
                            { label: 'Disliked - Price', score: -5, stage: 'Qualified' },
                            { label: 'Disliked - Location', score: -5, stage: 'Qualified' },
                            { label: 'Thinking / Hold', score: 0, stage: 'Opportunity' },
                            { label: 'Booking Request', score: 40, stage: 'Booked' },
                        ]
                    },
                    {
                        name: 'Payment Reminder',
                        outcomes: [
                            { label: 'Payment Promised', score: 5, stage: 'Booked' },
                            { label: 'Already Paid', score: 0, stage: 'Booked' },
                            { label: 'Dispute', score: -10, stage: 'Negotiation' },
                            { label: 'Extension Requested', score: -2, stage: 'Booked' },
                        ]
                    },
                    // ── NEW CALL PURPOSES ────────────────────────────────────────
                    {
                        name: 'Site Visit Confirmation Call',
                        outcomes: [
                            { label: 'Confirmed – Will Come', score: 18, stage: 'Opportunity' },
                            { label: 'Rescheduled to New Date', score: 5, stage: 'Qualified' },
                            { label: 'Cancelled – No Reason', score: -8, stage: 'Qualified' },
                            { label: 'Cancelled – Going to Competitor', score: -20, stage: 'Qualified' },
                            { label: 'Not Reachable', score: -3, stage: 'Qualified' },
                            { label: 'Coming with Family Now', score: 25, stage: 'Opportunity' },
                        ]
                    },
                    {
                        name: 'Loan / Finance Discussion Call',
                        outcomes: [
                            { label: 'Self-Funded / Cash Ready', score: 30, stage: 'Opportunity' },
                            { label: 'Loan Pre-approved', score: 25, stage: 'Opportunity' },
                            { label: 'Loan Applied – Awaiting Approval', score: 15, stage: 'Qualified' },
                            { label: 'Needs Loan Assistance from Us', score: 10, stage: 'Qualified' },
                            { label: 'Cannot Arrange Finance', score: -25, stage: 'New' },
                            { label: 'Selling Existing Property First', score: -15, stage: 'Qualified' },
                            { label: 'EMI Affordable – Wants Calculator', score: 8, stage: 'Prospect' },
                        ]
                    },
                    {
                        name: 'CP / Channel Partner Coordination Call',
                        outcomes: [
                            { label: 'CP Confirmed Visit for Client', score: 20, stage: 'Opportunity' },
                            { label: 'CP Needs More Inventory Options', score: 0, stage: 'Prospect' },
                            { label: 'Commission Dispute', score: -5, stage: 'Prospect' },
                            { label: 'CP Submitted New Leads', score: 10, stage: 'New' },
                            { label: 'CP Dropped the Deal', score: -15, stage: 'Qualified' },
                            { label: 'CP Redirecting to Another Project', score: -10, stage: 'Qualified' },
                        ]
                    },
                    {
                        name: 'Token / Booking Confirmation Call',
                        outcomes: [
                            { label: 'Token Amount Confirmed', score: 50, stage: 'Booked' },
                            { label: 'Cheque Ready – Date Confirmed', score: 40, stage: 'Booked' },
                            { label: 'Transfer in Process', score: 20, stage: 'Negotiation' },
                            { label: 'Backing Out', score: -50, stage: 'Closed Lost' },
                            { label: 'Wants Agreement First', score: 5, stage: 'Negotiation' },
                            { label: 'Price Renegotiation Before Token', score: -10, stage: 'Negotiation' },
                        ]
                    },
                    {
                        name: 'Owner / Landlord Call',
                        outcomes: [
                            { label: 'Owner Agreed to Price', score: 35, stage: 'Negotiation' },
                            { label: 'Owner Reduced Price', score: 30, stage: 'Opportunity' },
                            { label: 'Owner Not Selling', score: -40, stage: 'Closed Lost' },
                            { label: 'Property Still Available', score: 10, stage: 'Opportunity' },
                            { label: 'Owner Wants 15 Days to Decide', score: -5, stage: 'Negotiation' },
                            { label: 'Owner Wants All-Cash Payment Only', score: -10, stage: 'Negotiation' },
                            { label: 'Owner Ready for Token', score: 45, stage: 'Booked' },
                        ]
                    },
                    {
                        name: 'Agreement / Registry Reminder Call',
                        outcomes: [
                            { label: 'Agreement Date Fixed', score: 10, stage: 'Booked' },
                            { label: 'Client Delaying Signing', score: -10, stage: 'Booked' },
                            { label: 'Documents Ready', score: 8, stage: 'Booked' },
                            { label: 'Lawyer Query from Client', score: 0, stage: 'Booked' },
                            { label: 'Cancellation Requested', score: -60, stage: 'Closed Lost' },
                            { label: 'Re-negotiation on Terms', score: -15, stage: 'Negotiation' },
                        ]
                    },
                    {
                        name: 'Cold / Database Call',
                        outcomes: [
                            { label: 'Interested – Wants Details', score: 10, stage: 'Prospect' },
                            { label: 'Call Back Later', score: 3, stage: 'New' },
                            { label: 'Do Not Call', score: -15, stage: 'Closed Lost' },
                            { label: 'Wants WhatsApp Instead', score: 2, stage: 'New' },
                            { label: 'Already Bought Elsewhere', score: -5, stage: 'Closed Lost' },
                            { label: 'Can Refer Someone', score: 5, stage: 'Prospect' },
                        ]
                    },
                    {
                        name: 'Existing Customer / Referral Call',
                        outcomes: [
                            { label: 'Referral Name Shared', score: 20, stage: 'New' },
                            { label: 'Interested in Another Unit', score: 30, stage: 'Prospect' },
                            { label: 'Not Happy – Complaint', score: -20, stage: 'New' },
                            { label: 'Positive Feedback Given', score: 10, stage: 'Prospect' },
                            { label: 'Wants to Rent Out Property', score: 5, stage: 'Prospect' },
                        ]
                    },
                ]
            },
            // ─────────────────────────────────────────────────────────────────────
            // 2. EMAIL
            // ─────────────────────────────────────────────────────────────────────
            {
                name: 'Email',
                purposes: [
                    {
                        name: 'Project Brochure / E-Catalogue Send',
                        outcomes: [
                            { label: 'Opened + Clicked', score: 12, stage: 'Prospect' },
                            { label: 'Opened – No Response', score: 4, stage: 'Prospect' },
                            { label: 'Delivered – Not Opened', score: 1, stage: 'New' },
                            { label: 'Bounced', score: -2, stage: 'New' },
                            { label: 'Replied with Query', score: 15, stage: 'Qualified' },
                            { label: 'Forwarded to Family', score: 18, stage: 'Qualified' },
                        ]
                    },
                    {
                        name: 'Floor Plan / Site Map Share',
                        outcomes: [
                            { label: 'Replied – Interested in Unit', score: 20, stage: 'Opportunity' },
                            { label: 'Replied – Wants Different Floor', score: 10, stage: 'Qualified' },
                            { label: 'Opened – No Action', score: 3, stage: 'Prospect' },
                            { label: 'Too Expensive per Reply', score: -10, stage: 'Qualified' },
                            { label: 'Shared Plan with Family', score: 15, stage: 'Qualified' },
                        ]
                    },
                    {
                        name: 'Quotation / Price Sheet Send',
                        outcomes: [
                            { label: 'Accepted Price – Wants to Meet', score: 25, stage: 'Opportunity' },
                            { label: 'Counter-Offered in Reply', score: 15, stage: 'Negotiation' },
                            { label: 'Too High – Replied Negatively', score: -10, stage: 'Qualified' },
                            { label: 'No Response After Price', score: -5, stage: 'Qualified' },
                            { label: 'Wants Legal Charges Clarification', score: 12, stage: 'Negotiation' },
                        ]
                    },
                    {
                        name: 'Legal Document / Agreement Send',
                        outcomes: [
                            { label: 'Signed – Returned via Email', score: 50, stage: 'Booked' },
                            { label: 'Lawyer Reviewing', score: 10, stage: 'Booked' },
                            { label: 'Queries Raised', score: 5, stage: 'Negotiation' },
                            { label: 'Rejected Agreement Terms', score: -20, stage: 'Negotiation' },
                            { label: 'Requesting Amendments', score: -5, stage: 'Negotiation' },
                        ]
                    },
                    {
                        name: 'Welcome / Thank You Email',
                        outcomes: [
                            { label: 'Replied Positively', score: 10, stage: 'Closed Won' },
                            { label: 'Referred New Lead', score: 25, stage: 'New' },
                            { label: 'Raised Post-Booking Concern', score: -5, stage: 'Booked' },
                        ]
                    },
                    {
                        name: 'Festival / Offer Campaign Email',
                        outcomes: [
                            { label: 'Replied – Wants to Visit Now', score: 20, stage: 'Opportunity' },
                            { label: 'Called Back After Email', score: 15, stage: 'Prospect' },
                            { label: 'Opened – No Action', score: 2, stage: 'New' },
                            { label: 'Unsubscribed', score: -3, stage: 'Closed Lost' },
                        ]
                    },
                    {
                        name: 'Payment Due Reminder',
                        outcomes: [
                            { label: 'Payment Confirmed Reply', score: 15, stage: 'Booked' },
                            { label: '10 Day Extension Requested', score: -3, stage: 'Booked' },
                            { label: 'Dispute on Amount', score: -15, stage: 'Negotiation' },
                            { label: 'No Response', score: -8, stage: 'Booked' },
                        ]
                    },
                ]
            },
            // ─────────────────────────────────────────────────────────────────────
            // 3. SITE VISIT
            // ─────────────────────────────────────────────────────────────────────
            {
                name: 'Site Visit',
                purposes: [
                    {
                        name: 'First Visit (Solo)',
                        outcomes: [
                            { label: 'Very Interested', score: 30, stage: 'Opportunity' },
                            { label: 'Somewhat Interested', score: 15, stage: 'Qualified' },
                            { label: 'Not Interested', score: -20, stage: 'New' },
                            { label: 'Price Issue', score: -10, stage: 'Qualified' },
                        ]
                    },
                    {
                        name: 'Re-Visit (With Family)',
                        outcomes: [
                            { label: 'Shortlisted', score: 40, stage: 'Opportunity' },
                            { label: 'Family Liked', score: 35, stage: 'Opportunity' },
                            { label: 'Family Disliked', score: -20, stage: 'Qualified' },
                            { label: 'Need Consensus', score: 10, stage: 'Qualified' },
                        ]
                    },
                    {
                        name: 'Unit Selection',
                        outcomes: [
                            { label: 'Unit Blocked', score: 50, stage: 'Booked' },
                            { label: 'Unit Not Available', score: -5, stage: 'Qualified' },
                            { label: 'Changed Preference', score: 0, stage: 'Opportunity' },
                            { label: 'Thinking', score: 5, stage: 'Opportunity' },
                        ]
                    },
                    {
                        name: 'Competitor Comparison',
                        outcomes: [
                            { label: 'Favors Us', score: 20, stage: 'Opportunity' },
                            { label: 'Favors Competitor', score: -20, stage: 'New' },
                            { label: 'Undecided', score: 0, stage: 'Qualified' },
                        ]
                    },
                    // ── NEW SITE VISIT PURPOSES ──────────────────────────────────
                    {
                        name: 'Virtual Tour / Video Call Visit',
                        outcomes: [
                            { label: 'Liked – Wants Physical Visit Now', score: 20, stage: 'Opportunity' },
                            { label: 'Needs More Areas Shown', score: 8, stage: 'Qualified' },
                            { label: 'Not Convinced – Wants In-Person', score: 0, stage: 'Prospect' },
                            { label: 'Wants Visit Recording', score: 10, stage: 'Qualified' },
                            { label: 'Lost Interest After Tour', score: -10, stage: 'Prospect' },
                        ]
                    },
                    {
                        name: 'Developer / Builder Showroom Visit',
                        outcomes: [
                            { label: 'Very Impressed with Sample Flat', score: 30, stage: 'Opportunity' },
                            { label: 'Liked Amenities – Price Concern', score: 10, stage: 'Qualified' },
                            { label: 'Wants Second Visit with Spouse', score: 25, stage: 'Opportunity' },
                            { label: 'Project Looks Incomplete / Delay Fear', score: -15, stage: 'Qualified' },
                            { label: 'Requested Legal Documents', score: 20, stage: 'Negotiation' },
                            { label: 'Ready to Block Unit Today', score: 50, stage: 'Booked' },
                        ]
                    },
                    {
                        name: 'Construction Site Visit',
                        outcomes: [
                            { label: 'Satisfied with Progress', score: 20, stage: 'Opportunity' },
                            { label: 'Concerns about Delivery Timeline', score: -10, stage: 'Qualified' },
                            { label: 'Appreciated Build Quality', score: 25, stage: 'Opportunity' },
                            { label: 'Poor Site Condition – Concerned', score: -20, stage: 'Qualified' },
                            { label: 'Wants to Visit Again in 3 Months', score: 5, stage: 'Prospect' },
                        ]
                    },
                    {
                        name: 'Possession / Ready-to-Move Visit',
                        outcomes: [
                            { label: 'Fully Satisfied – Ready to Register', score: 60, stage: 'Booked' },
                            { label: 'Minor Snags – Acceptable', score: 30, stage: 'Negotiation' },
                            { label: 'Major Issues – Needs Fixing First', score: -10, stage: 'Negotiation' },
                            { label: 'Not Satisfied – Withdrawing', score: -40, stage: 'Closed Lost' },
                            { label: 'Snagging List Submitted', score: 10, stage: 'Booked' },
                        ]
                    },
                    {
                        name: 'Neighborhood / Locality Tour',
                        outcomes: [
                            { label: 'Loved the Locality', score: 18, stage: 'Opportunity' },
                            { label: 'Connectivity Issues Concern', score: -5, stage: 'Qualified' },
                            { label: 'School / Hospital Proximity Liked', score: 12, stage: 'Opportunity' },
                            { label: 'Area Not Suitable', score: -20, stage: 'Qualified' },
                            { label: 'Wants to Compare with Another Area', score: 3, stage: 'Prospect' },
                        ]
                    },
                    {
                        name: 'Resale Property Inspection',
                        outcomes: [
                            { label: 'Ready to Make an Offer', score: 45, stage: 'Negotiation' },
                            { label: 'Price Negotiation After Inspection', score: 20, stage: 'Negotiation' },
                            { label: 'Renovation Required – Considering', score: 10, stage: 'Qualified' },
                            { label: 'Property Doesn\'t Match Description', score: -25, stage: 'Qualified' },
                            { label: 'Owner Possessive / Not Flexible', score: -10, stage: 'Negotiation' },
                            { label: 'Title / Legal Check Requested', score: 15, stage: 'Negotiation' },
                        ]
                    },
                    {
                        name: 'Pre-Launch / Soft Launch Visit',
                        outcomes: [
                            { label: 'Booked at Pre-Launch Price', score: 70, stage: 'Booked' },
                            { label: 'Interested – Will Decide at Launch', score: 20, stage: 'Opportunity' },
                            { label: 'Price Already High at Pre-Launch', score: -5, stage: 'Qualified' },
                            { label: 'Bringing Investor Friends', score: 30, stage: 'Prospect' },
                        ]
                    },
                ]
            },
            // ─────────────────────────────────────────────────────────────────────
            // 4. MEETING
            // ─────────────────────────────────────────────────────────────────────
            {
                name: 'Meeting',
                purposes: [
                    {
                        name: 'Initial Consultation',
                        outcomes: [
                            { label: 'Qualified', score: 15, stage: 'Qualified' },
                            { label: 'Need More Time', score: 5, stage: 'Prospect' },
                            { label: 'Not Qualified', score: -10, stage: 'New' },
                            { label: 'Rescheduled', score: 0, stage: 'Prospect' },
                        ]
                    },
                    {
                        name: 'Project Presentation',
                        outcomes: [
                            { label: 'Impressed', score: 20, stage: 'Qualified' },
                            { label: 'Neutral', score: 5, stage: 'Prospect' },
                            { label: 'Skeptical', score: -5, stage: 'Prospect' },
                            { label: 'Requested Site Visit', score: 25, stage: 'Opportunity' },
                        ]
                    },
                    {
                        name: 'Price Negotiation',
                        outcomes: [
                            { label: 'Deal Closed', score: 100, stage: 'Closed Won' },
                            { label: 'Stalemate', score: 0, stage: 'Negotiation' },
                            { label: 'Discount Approved', score: 10, stage: 'Negotiation' },
                            { label: 'Walk-away', score: -50, stage: 'Closed Lost' },
                        ]
                    },
                    {
                        name: 'Document Collection',
                        outcomes: [
                            { label: 'All Collected', score: 10, stage: 'Booked' },
                            { label: 'Partial', score: 5, stage: 'Booked' },
                            { label: 'Pending', score: 0, stage: 'Negotiation' },
                            { label: 'Issues Found', score: -5, stage: 'Negotiation' },
                        ]
                    },
                    {
                        name: 'Final Closing',
                        outcomes: [
                            { label: 'Signed', score: 100, stage: 'Closed Won' },
                            { label: 'Reviewing Draft', score: 10, stage: 'Negotiation' },
                            { label: 'Postponed', score: -5, stage: 'Negotiation' },
                            { label: 'Cancelled', score: -50, stage: 'Closed Lost' },
                        ]
                    },
                    // ── NEW MEETING PURPOSES ─────────────────────────────────────
                    {
                        name: 'Token / Booking Meeting',
                        outcomes: [
                            { label: 'Token Received – Deal Locked', score: 80, stage: 'Booked' },
                            { label: 'Cheque Given – Clearing Pending', score: 50, stage: 'Booked' },
                            { label: 'Part Token Only', score: 30, stage: 'Booked' },
                            { label: 'Changed Mind at Last Minute', score: -50, stage: 'Negotiation' },
                            { label: 'Token Tomorrow – Confirmed', score: 40, stage: 'Booked' },
                        ]
                    },
                    {
                        name: 'Agreement Signing Meeting',
                        outcomes: [
                            { label: 'Agreement Signed', score: 100, stage: 'Closed Won' },
                            { label: 'Co-Applicant Signature Pending', score: 30, stage: 'Booked' },
                            { label: 'Legal Clause Dispute', score: -10, stage: 'Booked' },
                            { label: 'Refused to Sign', score: -50, stage: 'Negotiation' },
                            { label: 'Stamp Duty Discussion', score: 5, stage: 'Booked' },
                        ]
                    },
                    {
                        name: 'Home Loan / Bank Coordination Meeting',
                        outcomes: [
                            { label: 'Loan Sanctioned', score: 40, stage: 'Booked' },
                            { label: 'Documents Submitted to Bank', score: 20, stage: 'Negotiation' },
                            { label: 'Loan Rejected', score: -30, stage: 'Qualified' },
                            { label: 'In-Principle Approval Done', score: 25, stage: 'Negotiation' },
                            { label: 'Awaiting CIBIL Check', score: 5, stage: 'Negotiation' },
                            { label: 'Trying Another Bank', score: 10, stage: 'Negotiation' },
                        ]
                    },
                    {
                        name: 'Investor / Bulk Deal Meeting',
                        outcomes: [
                            { label: 'Multi-Unit Deal Agreed', score: 100, stage: 'Booked' },
                            { label: 'Wants Detailed ROI Sheet', score: 20, stage: 'Opportunity' },
                            { label: 'Shortlisted 3 Units – Decision Pending', score: 35, stage: 'Negotiation' },
                            { label: 'ROI Not Satisfactory', score: -20, stage: 'Qualified' },
                            { label: 'Will Bring CA / Advisor Next Time', score: 15, stage: 'Opportunity' },
                            { label: 'Wants Exclusive Pre-Launch Price', score: 25, stage: 'Opportunity' },
                        ]
                    },
                    {
                        name: 'Vastu / Architecture Consultation Meeting',
                        outcomes: [
                            { label: 'Vastu Expert Approved Property', score: 30, stage: 'Opportunity' },
                            { label: 'Vastu Expert Rejected – Client Listening', score: -25, stage: 'Qualified' },
                            { label: 'Another Unit Requested (Vastu Complaint)', score: 5, stage: 'Opportunity' },
                            { label: 'Modifications Feasible per Architect', score: 15, stage: 'Opportunity' },
                        ]
                    },
                    {
                        name: 'NRI Client Meeting',
                        outcomes: [
                            { label: 'Booking Confirmed – POA Given', score: 80, stage: 'Booked' },
                            { label: 'POA Authority Setup in Progress', score: 40, stage: 'Booked' },
                            { label: 'Comparing 3 Projects – India Trip Limited', score: 20, stage: 'Opportunity' },
                            { label: 'Wants USD-equivalent Pricing', score: 15, stage: 'Negotiation' },
                            { label: 'Decision at Next India Trip', score: 5, stage: 'Prospect' },
                            { label: 'Investing in Dubai Instead', score: -30, stage: 'Closed Lost' },
                        ]
                    },
                    {
                        name: 'Post-Complaint Resolution Meeting',
                        outcomes: [
                            { label: 'Issue Resolved – Client Happy', score: 20, stage: 'Booked' },
                            { label: 'Client Still Angry – Threat of Legal', score: -30, stage: 'Booked' },
                            { label: 'Compensation Agreed', score: 5, stage: 'Booked' },
                            { label: 'Client Cancelling Deal', score: -60, stage: 'Closed Lost' },
                            { label: 'Referral Despite Complaint', score: 30, stage: 'Prospect' },
                        ]
                    },
                    {
                        name: 'Channel Partner / Broker Meeting',
                        outcomes: [
                            { label: 'CP Committed to Push Project', score: 15, stage: 'Prospect' },
                            { label: 'Co-Brokerage Agreement Signed', score: 20, stage: 'Prospect' },
                            { label: 'CP Already Tied with Competitor', score: -10, stage: 'New' },
                            { label: 'CP Brought 3 Leads Same Day', score: 35, stage: 'Prospect' },
                            { label: 'Commission Rate Negotiated', score: 5, stage: 'Prospect' },
                        ]
                    },
                ]
            },
            // ─────────────────────────────────────────────────────────────────────
            // 5. TASK
            // ─────────────────────────────────────────────────────────────────────
            {
                name: 'Task',
                purposes: [
                    {
                        name: 'Document Preparation',
                        outcomes: [
                            { label: 'All Documents Ready', score: 10, stage: 'Booked' },
                            { label: 'Partial – 2 More Pending', score: 3, stage: 'Negotiation' },
                            { label: 'Client Not Sharing', score: -5, stage: 'Negotiation' },
                            { label: 'Documents Sent for Verification', score: 8, stage: 'Booked' },
                        ]
                    },
                    {
                        name: 'Legal / Title Verification',
                        outcomes: [
                            { label: 'Title Clear', score: 20, stage: 'Negotiation' },
                            { label: 'Minor Encumbrance – Resolvable', score: 5, stage: 'Negotiation' },
                            { label: 'Title Dispute Found', score: -40, stage: 'Closed Lost' },
                            { label: 'Additional Documents Requested from Owner', score: 0, stage: 'Negotiation' },
                        ]
                    },
                    {
                        name: 'Loan File Processing',
                        outcomes: [
                            { label: 'File Submitted', score: 10, stage: 'Negotiation' },
                            { label: 'Sanction Letter Received', score: 40, stage: 'Booked' },
                            { label: 'File Rejected – Reapplication', score: -15, stage: 'Qualified' },
                            { label: 'Additional Documents Requested by Bank', score: 2, stage: 'Negotiation' },
                        ]
                    },
                    {
                        name: 'Inventory Blocking / Holding',
                        outcomes: [
                            { label: 'Unit Blocked Successfully', score: 15, stage: 'Opportunity' },
                            { label: 'Unit Available to Others – Token Not Paid', score: -10, stage: 'Negotiation' },
                            { label: 'Extension Given for 48 Hours', score: 5, stage: 'Opportunity' },
                            { label: 'Unit Released – Client Not Committed', score: -20, stage: 'Qualified' },
                        ]
                    },
                    {
                        name: 'Agreement Draft Preparation',
                        outcomes: [
                            { label: 'Draft Ready – Sent to Client', score: 10, stage: 'Booked' },
                            { label: 'Client Requested Changes', score: 0, stage: 'Booked' },
                            { label: 'Legal Issue in Draft', score: -5, stage: 'Negotiation' },
                            { label: 'Final Version Approved', score: 15, stage: 'Booked' },
                        ]
                    },
                    {
                        name: 'Stamp Duty / Registration Coordination',
                        outcomes: [
                            { label: 'Registration Date Confirmed', score: 20, stage: 'Booked' },
                            { label: 'Awaiting State Limit Slots', score: 2, stage: 'Booked' },
                            { label: 'Stamp Duty Paid', score: 15, stage: 'Booked' },
                            { label: 'Client Postponing Registry', score: -10, stage: 'Booked' },
                            { label: 'Registration Completed', score: 100, stage: 'Closed Won' },
                        ]
                    },
                    {
                        name: 'CRM Data / Reporting Task',
                        outcomes: [
                            { label: 'Completed On-Time', score: 0, stage: 'Prospect' },
                            { label: 'Delayed', score: 0, stage: 'Prospect' },
                            { label: 'Incomplete', score: 0, stage: 'Prospect' },
                        ]
                    },
                    {
                        name: 'Follow-up / Reminder Set',
                        outcomes: [
                            { label: 'Follow-up Scheduled', score: 2, stage: 'Prospect' },
                            { label: 'Not Scheduled', score: -2, stage: 'Prospect' },
                        ]
                    },
                    {
                        name: 'Snag List / Possession Inspection Task',
                        outcomes: [
                            { label: 'Snag List Cleared', score: 20, stage: 'Booked' },
                            { label: '8+ Issues – Developer Working', score: 5, stage: 'Booked' },
                            { label: 'Major Civil Defects', score: -10, stage: 'Booked' },
                            { label: 'Possession Given', score: 50, stage: 'Closed Won' },
                        ]
                    },
                ]
            },
        ]
    });


    const updateActivityMasterFields = useCallback((activities) => {
        setActivityMasterFields(prev => ({ ...prev, activities }));
    }, [setActivityMasterFields]);

    // --- STAGE MAPPING RULES (Explicit Override Rules) ---
    const [stageMappingRules, setStageMappingRules] = useLocalStorage('stageMappingRules', []);

    const addStageMappingRule = useCallback((rule) => {
        setStageMappingRules(prev => [
            ...prev,
            { ...rule, id: Date.now().toString(), isActive: true, priority: prev.length + 1 }
        ]);
    }, [setStageMappingRules]);

    const updateStageMappingRule = useCallback((id, changes) => {
        setStageMappingRules(prev => prev.map(r => r.id === id ? { ...r, ...changes } : r));
    }, [setStageMappingRules]);

    const deleteStageMappingRule = useCallback((id) => {
        setStageMappingRules(prev => prev.filter(r => r.id !== id));
    }, [setStageMappingRules]);

    // Update a single outcome's stage in activityMasterFields
    const updateOutcomeStage = useCallback((activityName, purposeName, outcomeLabel, newStage) => {
        setActivityMasterFields(prev => {
            const activities = prev.activities.map(act => {
                if (act.name !== activityName) return act;
                return {
                    ...act,
                    purposes: act.purposes.map(purp => {
                        if (purp.name !== purposeName) return purp;
                        return {
                            ...purp,
                            outcomes: purp.outcomes.map(out =>
                                out.label === outcomeLabel ? { ...out, stage: newStage } : out
                            )
                        };
                    })
                };
            });
            return { ...prev, activities };
        });
    }, [setActivityMasterFields]);

    // ─── STEP 7: Lead ↔ Deal Sync Rules ───
    const [syncRules, setSyncRules] = useLocalStorage('syncRules', [
        { id: 'rule_booked', priority: 1, label: 'Any lead Booked → Deal Booked', condition: 'ANY_LEAD', conditionStage: 'Booked', dealStage: 'Booked', isActive: true, isLocked: true },
        { id: 'rule_closed_won', priority: 2, label: 'Any lead Closed Won → Deal Closed Won', condition: 'ANY_LEAD', conditionStage: 'Closed Won', dealStage: 'Closed Won', isActive: true, isLocked: true },
        { id: 'rule_all_lost', priority: 3, label: 'All leads Closed Lost → Deal Open', condition: 'ALL_LEADS', conditionStage: 'Closed Lost', dealStage: 'Open', isActive: true, isLocked: true },
        { id: 'rule_owner_withdrawal', priority: 4, label: 'Owner Withdrawal → Deal Closed Lost', condition: 'ACTIVITY', conditionActivity: 'Owner Withdrawal', dealStage: 'Closed Lost', dealReason: 'Owner Withdrawn', isActive: true, isLocked: false },
    ]);
    const updateSyncRule = useCallback((id, changes) => setSyncRules(prev => prev.map(r => r.id === id ? { ...r, ...changes } : r)), [setSyncRules]);
    const addSyncRule = useCallback((rule) => setSyncRules(prev => [...prev, { ...rule, id: Date.now().toString(), isActive: true }]), [setSyncRules]);
    const deleteSyncRule = useCallback((id) => setSyncRules(prev => prev.filter(r => r.id !== id)), [setSyncRules]);

    // ─── STEP 8: Activity Sequence Guard ───
    const [sequenceConfig, setSequenceConfig] = useLocalStorage('sequenceConfig', {
        enforcementMode: 'warn', // 'off' | 'warn' | 'block'
        sequence: [
            { stage: 'New', order: 0, requiredActivity: null, icon: 'fa-star' },
            { stage: 'Prospect', order: 1, requiredActivity: 'Introduction / Call', icon: 'fa-user' },
            { stage: 'Qualified', order: 2, requiredActivity: 'Requirement Gathering', icon: 'fa-check-circle' },
            { stage: 'Opportunity', order: 3, requiredActivity: 'Follow-up / Site Visit', icon: 'fa-fire' },
            { stage: 'Negotiation', order: 4, requiredActivity: 'Negotiation Call', icon: 'fa-comments-dollar' },
            { stage: 'Booked', order: 5, requiredActivity: 'Token / Booking', icon: 'fa-calendar-check' },
            { stage: 'Closed Won', order: 6, requiredActivity: 'Agreement Signed', icon: 'fa-trophy' },
        ]
    });
    const updateSequenceConfig = useCallback((changes) => setSequenceConfig(prev => ({ ...prev, ...changes })), [setSequenceConfig]);

    // ─── STEP 9: Pipeline Ageing Rules ───
    const [agingRules, setAgingRules] = useLocalStorage('agingRules', {
        negotiationMaxDays: { value: 15, label: 'Negotiation Risk Threshold (days)', action: 'Risk Flag' },
        activityGapDays: { value: 7, label: 'Activity Gap Warning (days)', action: 'Score Penalty' },
        bookedNoAgreementDays: { value: 10, label: 'Booked → Agreement Max Days', action: 'Admin Alert' },
        prospectMaxDays: { value: 30, label: 'Prospect Stale Threshold (days)', action: 'Risk Flag' },
        opportunityMaxDays: { value: 21, label: 'Opportunity Risk Threshold (days)', action: 'Risk Flag' },
    });
    const updateAgingRule = useCallback((key, changes) => setAgingRules(prev => ({ ...prev, [key]: { ...prev[key], ...changes } })), [setAgingRules]);

    // ─── STEP 10: Revenue Forecast Config ───
    const [forecastConfig, setForecastConfig] = useLocalStorage('forecastConfig', {
        commissionRate: { value: 2.0, label: 'Commission Rate (%)' },
        showWeighted: { value: true, label: 'Show Weighted Pipeline Value' },
        showExpected: { value: true, label: 'Show Expected Commission' },
        showStageWise: { value: true, label: 'Show Stage-wise Breakdown' },
    });
    const updateForecastConfig = useCallback((key, changes) => setForecastConfig(prev => ({ ...prev, [key]: { ...prev[key], ...changes } })), [setForecastConfig]);

    // ─── STEP 11: Deal Health Config ───
    const [dealHealthConfig, setDealHealthConfig] = useLocalStorage('dealHealthConfig', {
        stageWeight: { weight: 40, label: 'Stage Weight' },
        scoreWeight: { weight: 35, label: 'Lead Score Weight' },
        agePenalty: { weight: 15, label: 'Age Penalty' },
        riskPenalty: { weight: 10, label: 'Risk Signal Penalty' },
        thresholds: {
            green: { min: 70, label: 'Healthy', color: '#10b981' },
            yellow: { min: 40, label: 'Watch', color: '#f59e0b' },
            red: { min: 0, label: 'At Risk', color: '#ef4444' },
        }
    });
    const updateDealHealthConfig = useCallback((changes) => setDealHealthConfig(prev => ({ ...prev, ...changes })), [setDealHealthConfig]);

    // ─── STEP 12: Intent Signals ───
    const [intentSignals, setIntentSignals] = useLocalStorage('intentSignals', {
        visitRepeat: { weight: 15, label: 'Repeat Site Visit', icon: 'fa-redo', isActive: true },
        offerRevisions: { weight: 12, label: 'Offer Revisions Count', icon: 'fa-file-invoice', isActive: true },
        legalDocRequest: { weight: 18, label: 'Legal Doc Requested', icon: 'fa-file-contract', isActive: true },
        budgetGapPct: { weight: -10, label: 'Budget Gap % (penalty)', icon: 'fa-money-bill-wave', isActive: true },
        familyVisit: { weight: 20, label: 'Family Brought for Visit', icon: 'fa-users', isActive: true },
        whatsappResponse: { weight: 5, label: 'WhatsApp Response Rate', icon: 'fa-comments', isActive: true },
    });
    const updateIntentSignal = useCallback((key, changes) => setIntentSignals(prev => ({ ...prev, [key]: { ...prev[key], ...changes } })), [setIntentSignals]);


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
        updateActivityMasterFields,
        stageMappingRules,
        addStageMappingRule,
        updateStageMappingRule,
        deleteStageMappingRule,
        updateOutcomeStage,
        // Step 7 — Sync Engine
        syncRules, updateSyncRule, addSyncRule, deleteSyncRule,
        // Step 8 — Sequence Guard
        sequenceConfig, updateSequenceConfig,
        // Step 9 — Ageing Rules
        agingRules, updateAgingRule,
        // Step 10 — Revenue Forecast
        forecastConfig, updateForecastConfig,
        // Step 11 — Deal Health
        dealHealthConfig, updateDealHealthConfig,
        // Step 12 — Intent Signals
        intentSignals, updateIntentSignal,
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
