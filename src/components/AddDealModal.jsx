import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTeams, useActiveUsers, useAddDealMutation, useUpdateDealMutation } from '../utils/crmHooks';
import { useTheme } from '../context/ThemeContext';
import { useFieldRules } from '../context/FieldRulesContext';
import { useTriggers } from '../context/TriggersContext';
import { useUserContext } from '../context/UserContext';
import { useDistribution } from '../context/DistributionContext';
import { useSequences } from '../context/SequenceContext';
import { usePropertyConfig } from '../context/PropertyConfigContext';
import { numberToIndianWords } from '../utils/numberToWords';
import { api, systemSettingsAPI } from '../utils/api';
import toast from 'react-hot-toast';
import whatsappService from '../services/whatsappService';

const AddDealModal = ({ isOpen, onClose, onSave, deal = null, title, restrictToProperties }) => {
    const { isDark } = useTheme();
    const { getLookupId, getLookupValue, dealMasterFields } = usePropertyConfig();
    const { validateAsync } = useFieldRules();
    const { fireEvent } = useTriggers();
    const { executeDistribution } = useDistribution();
    const { data: users = [] } = useActiveUsers();
    
    const { data: teams = [] } = useTeams();
    const evaluateAndEnroll = useSequences()?.evaluateAndEnroll || (() => { });

    const addDealMutation = useAddDealMutation();
    const updateDealMutation = useUpdateDealMutation({ isPartial: true });

    const [currentTab, setCurrentTab] = useState('property');
    const [isSaving, setIsSaving] = useState(false);

    const [isGeneratingAi, setIsGeneratingAi] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);
    const [projects, setProjects] = useState([]);
    const [units, setUnits] = useState([]);
    const [isLoadingProjects, setIsLoadingProjects] = useState(false);
    const [isLoadingUnits, setIsLoadingUnits] = useState(false);

    const [formData, setFormData] = useState({
        projectName: '',
        block: '',
        unitNo: '',
        unitType: 'Ordinary',
        propertyType: 'Plot(Residential)',
        category: '',
        subCategory: '',
        size: '',
        sizeUnit: 'Sq Yard',
        location: '',
        intent: 'Sell', // Sell, Rent, Lease

        // Inheritance fields
        inventoryId: null,
        unitSpecification: {},
        locationDetails: {},
        builtupDetails: [],
        furnishing: {},
        documents: [],

        // Pricing
        price: '',
        quotePrice: '',
        pricingMode: 'Total', // Total, Rate
        priceUnit: 'SqYard', // Metric: SqYard, sqMeter, sq feet, marla, kananl, acre, hectare
        ratePrice: '', // Per selected metric
        quoteRatePrice: '', 
        priceInWords: '',
        quotePriceInWords: '',
        pricingNature: {
            negotiable: false,
            fixed: false
        },

        // Rent/Lease specifics
        securityDeposit: '',
        lockInMonths: '',
        leaseTermMonths: '',

        status: 'Open', // Open, Quote, Negotiation, Booked, Won, Lost

        // New Fields
        dealType: 'Registry case', // Registry case, Transfer case, GPA, Society case, Lease/Rent, Other
        transactionType: 'Full White', // Full White, Collector Rate, Flexible
        flexiblePercentage: 50, // Default 50% if Flexible
        source: 'Walk-in', // New paper, 99 acrer, social media, walkin, Cold calling, own website

        // Contact Selection
        isOwnerSelected: false,
        isAssociateSelected: false,

        // Publish On Toggles
        publishOn: {
            website: false,
            facebook: false,
            instagram: false,
            whatsapp: false,
            linkedin: false,
            x: false
        },

        // Website Integration Settings
        websiteMetadata: {
            shareUnitNumber: true,
            shareLocation: true
        },

        // Send Matched Deal
        sendMatchedDeal: {
            sms: false,
            whatsapp: false,
            whatsapp_app: false,
            email: false,
            rcs: false,
            templateId: 'free_text',
            hidePrice: false,
            hideLocation: false,
            hideUnit: false
        },

        // Contacts
        owner: { name: '', phone: '', email: '' },
        associatedContact: { name: '', phone: '', email: '' },

        // Assignment
        team: '',
        assignedTo: '',
        visibleTo: 'Public',

        remarks: '',
        description: '',
        date: new Date().toISOString().split('T')[0]
    });

    // Live Match Preview State
    const [liveMatchCount, setLiveMatchCount] = useState(null);
    const [isLiveMatching, setIsLiveMatching] = useState(false);
    const [liveMatchedLeads, setLiveMatchedLeads] = useState([]);

    useEffect(() => {
        const fetchMatches = async () => {
            if (!formData.projectName && !formData.price && !formData.location) {
                setLiveMatchCount(null);
                setLiveMatchedLeads([]);
                return;
            }
            setIsLiveMatching(true);
            try {
                // We use POST to send the draft deal data
                const matchRes = await api.post('leads/match', { deal: formData });
                if (matchRes.data?.success) {
                    setLiveMatchCount(matchRes.data.count || 0);
                    setLiveMatchedLeads(matchRes.data.matchingLeads || []);
                } else {
                    setLiveMatchCount(0);
                    setLiveMatchedLeads([]);
                }
            } catch(e) {
                setLiveMatchCount(0);
                setLiveMatchedLeads([]);
            } finally {
                setIsLiveMatching(false);
            }
        };
        const timer = setTimeout(fetchMatches, 800);
        return () => clearTimeout(timer);
    }, [formData.projectName, formData.price, formData.location, formData.category, formData.subCategory, formData.propertyType, formData.size]);

    const METRIC_FACTORS = {
        'SqYard': 1,
        'sqMeter': 1.19599,
        'sq feet': 0.111111,
        'marla': 25,
        'kananl': 500,
        'acre': 4840,
        'hectare': 11959.9
    };

    const getUnitLabel = (size) => {
        return formData.priceUnit || "SqYard";
    };

    const unitLabel = getUnitLabel(formData.size);

    const renderValue = (val) => {
        if (!val) return '-';
        if (typeof val === 'object') {
            return val.lookup_value || val.name || val.label || val.value || val.unit || '-';
        }
        return val;
    };

    const initialInheritanceRef = useRef(false);
    // removed existingDeals state




    useEffect(() => {
        if (!isOpen) {
            initialInheritanceRef.current = false;
        }
    }, [isOpen]);

    const duplicateDeal = null; // previously used existingDeals

    const isFormLocked = !!duplicateDeal;

    const normalizeId = (val) => (val && typeof val === 'object') ? (val._id || val.id) : val;

    useEffect(() => {
        if (deal && isOpen) {
            // Handle nested price objects from inventory
            const getPriceValue = (priceObj) => {
                if (!priceObj) return '';
                if (typeof priceObj === 'object') {
                    return priceObj.value || priceObj.total || '';
                }
                return priceObj;
            };

            const rawIntent = renderValue(deal.intent);
            const intent = (rawIntent && rawIntent !== '-') ? rawIntent : 'Sell';
            const inventoryPrice = intent === 'Rent' ? deal.rentPrice : (intent === 'Lease' ? deal.leasePrice : deal.price || deal.sellPrice);
            const initialPrice = getPriceValue(inventoryPrice);

            const cleanStr = (val, fallback = '') => {
                const s = renderValue(val);
                return s !== '-' ? s : fallback;
            };

            setFormData(prev => {
                const newOwner = typeof deal.owner === 'object' ? { ...prev.owner, ...deal.owner } : (deal.owner ? { ...prev.owner, _id: deal.owner } : prev.owner);
                const newAssociate = typeof deal.associatedContact === 'object' ? { ...prev.associatedContact, ...deal.associatedContact } : (deal.associatedContact ? { ...prev.associatedContact, _id: deal.associatedContact } : prev.associatedContact);
                
                const finalPrice = initialPrice || getPriceValue(deal.price) || prev.price;
                const finalQuotePrice = getPriceValue(deal.quotePrice) || prev.quotePrice;

                const updated = {
                    ...prev,
                    ...deal,
                    projectName: cleanStr(deal.projectName, prev.projectName),
                    block: cleanStr(deal.block, prev.block),
                    unitNo: cleanStr(deal.unitNo, prev.unitNo),
                    unitType: cleanStr(deal.unitType, prev.unitType),
                    location: cleanStr(deal.location, prev.location),
                    size: cleanStr(deal.size, prev.size),
                    sizeUnit: cleanStr(deal.sizeUnit, prev.sizeUnit),
                    source: cleanStr(deal.source, prev.source),
                    dealType: cleanStr(deal.dealType, prev.dealType),
                    transactionType: cleanStr(deal.transactionType, prev.transactionType),
                    price: finalPrice,
                    priceInWords: numberToIndianWords(finalPrice),
                    quotePrice: finalQuotePrice,
                    quotePriceInWords: numberToIndianWords(finalQuotePrice),
                    intent: intent,
                    owner: newOwner,
                    associatedContact: newAssociate,
                    assignedTo: normalizeId(deal.assignedTo) || prev.assignedTo,
                    team: normalizeId(deal.team) || prev.team,
                    category: getLookupValue('Category', deal.category) || cleanStr(deal.category, ''),
                    subCategory: getLookupValue('SubCategory', deal.subCategory) || cleanStr(deal.subCategory, ''),
                    propertyType: getLookupValue('PropertyType', deal.propertyType) || cleanStr(deal.propertyType, ''),
                    status: cleanStr(deal.status, 'Open') || 'Open',
                    description: deal.description || deal.websiteMetadata?.description || prev.description || '',
                    isOwnerSelected: !!newOwner._id || !!newOwner.name,
                    isAssociateSelected: !!newAssociate._id || !!newAssociate.name,
                    websiteMetadata: {
                        shareUnitNumber: deal.websiteMetadata?.shareUnitNumber !== false,
                        shareLocation: deal.websiteMetadata?.shareLocation !== false,
                        description: deal.description || deal.websiteMetadata?.description || ''
                    }
                };

                return updated;
            });

            // If we have unit data but not inventoryId, it's likely a direct inventory-to-deal transition
            // We should give handleUnitChange a chance to run once units are loaded
        }
    }, [deal, isOpen, getLookupValue]);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleNestedInputChange = (parent, field, value) => {
        setFormData(prev => ({
            ...prev,
            [parent]: { ...prev[parent], [field]: value }
        }));
    };

    const handleProjectChange = useCallback((projectName) => {
        const project = projects.find(p => renderValue(p.name) === projectName);
        const availableBlocks = project ? (project.blocks || []).map(b => typeof b === 'string' ? b : renderValue(b)).filter(b => b && b !== '-') : [];
        const defaultBlock = availableBlocks.length === 1 ? availableBlocks[0] : '';

        let assignedTo = formData.assignedTo;
        let team = formData.team;

        const result = executeDistribution('deals', { ...formData, projectName, block: defaultBlock });
        if (result && result.success) {
            assignedTo = result.assignedTo;
            team = result.team || team;
            toast.success(`Deal automatically assigned to ${result.assignedTo}`);
        }

        setFormData(prev => ({
            ...prev,
            projectName,
            block: defaultBlock,
            unitNo: '', // Reset unit when project changes
            propertyType: '', // Reset unit-dependent fields
            size: '',
            owner: { name: '', phone: '', email: '' },
            associatedContact: { name: '', phone: '', email: '' },
            assignedTo,
            team
        }));
    }, [projects, formData, executeDistribution]);

    const handleUnitChange = useCallback((unitNo) => {
        const unit = units.find(i =>
            (renderValue(i.unitNo) === unitNo || renderValue(i.unitNumber) === unitNo)
        );

        if (unit) {
            const cleanStr = (val, fallback = '') => {
                const s = renderValue(val);
                return s !== '-' ? s : fallback;
            };

            setFormData(prev => {
                const newSize = cleanStr(unit.size, prev.size);

                // Recalculate prices if size changes and we have rates/totals
                let updates = {
                    unitNo,
                    inventoryId: unit._id,
                    propertyType: getLookupValue('PropertyType', unit.type || unit.category) || cleanStr(unit.type || unit.category, prev.propertyType),
                    category: getLookupValue('Category', unit.category) || cleanStr(unit.category, ''),
                    subCategory: getLookupValue('SubCategory', unit.subCategory) || cleanStr(unit.subCategory, ''),
                    size: newSize,
                    sizeUnit: cleanStr(unit.sizeUnit, prev.sizeUnit),

                    // Detailed Data Inheritance
                    unitSpecification: {
                        facing: unit.facing,
                        direction: unit.direction,
                        orientation: unit.orientation,
                        roadWidth: unit.roadWidth,
                        builtupType: unit.builtupType,
                        ownership: unit.ownership,
                        length: unit.length,
                        width: unit.width,
                        sizeLabel: unit.sizeLabel,
                        totalSaleableArea: unit.totalSaleableArea,
                        builtUpArea: unit.builtUpArea,
                        carpetArea: unit.carpetArea
                    },
                    locationDetails: unit.address || {},
                    builtupDetails: unit.builtupDetails || [],
                    furnishing: {
                        furnishType: unit.furnishType,
                        furnishedItems: unit.furnishedItems,
                        possessionStatus: unit.possessionStatus,
                        constructionAge: unit.constructionAge || unit.ageOfConstruction
                    },
                    documents: unit.inventoryDocuments || [],

                    owner: {
                        _id: unit.owners?.[0]?._id || null,
                        name: cleanStr(unit.owners?.[0]?.name || unit.ownerName, ''),
                        phone: cleanStr(unit.owners?.[0]?.phones?.[0]?.number || unit.owners?.[0]?.phone || unit.ownerPhone, ''),
                        email: cleanStr(unit.owners?.[0]?.emails?.[0]?.address || unit.owners?.[0]?.email || unit.ownerEmail, '')
                    },
                    associatedContact: {
                        _id: unit.associates?.[0]?.contact?._id || unit.associates?.[0]?._id || null,
                        name: cleanStr(unit.associates?.[0]?.contact?.name || unit.associates?.[0]?.name || unit.associatedContact, ''),
                        phone: cleanStr(unit.associates?.[0]?.contact?.phones?.[0]?.number || unit.associates?.[0]?.mobile || unit.associatedPhone, ''),
                        email: cleanStr(unit.associates?.[0]?.contact?.emails?.[0]?.address || unit.associates?.[0]?.email || unit.associatedEmail, '')
                    },
                    isOwnerSelected: (unit.owners?.[0]?._id || unit.ownerName) ? true : false,
                    isAssociateSelected: (unit.associates?.[0]?.contact?._id || unit.associates?.[0]?.name) ? true : false
                };

                // Trigger Recalculation logic if size changed
                if (newSize && newSize !== prev.size) {
                    const sizeValSqYard = parseFloat(newSize.toString().replace(/[^0-9.]/g, '') || '0');
                    const factor = METRIC_FACTORS[prev.priceUnit] || 1;
                    const sizeInMetric = sizeValSqYard / factor;

                    if (sizeValSqYard > 0) {
                        // Recalculate based on current Pricing Mode
                        if (prev.pricingMode === 'Rate') {
                            if (prev.ratePrice) {
                                const total = Math.round(sizeInMetric * parseFloat(prev.ratePrice || 0));
                                updates.price = total.toString();
                                updates.priceInWords = numberToIndianWords(total);
                            }
                            if (prev.quoteRatePrice) {
                                const totalQuote = Math.round(sizeInMetric * parseFloat(prev.quoteRatePrice || 0));
                                updates.quotePrice = totalQuote.toString();
                                updates.quotePriceInWords = numberToIndianWords(totalQuote);
                            }
                        } else {
                            if (prev.price) {
                                const rate = Math.round(parseFloat(prev.price) / sizeInMetric);
                                updates.ratePrice = rate.toString();
                                updates.priceInWords = numberToIndianWords(prev.price);
                            }
                            if (prev.quotePrice) {
                                const rateQuote = Math.round(parseFloat(prev.quotePrice) / sizeInMetric);
                                updates.quoteRatePrice = rateQuote.toString();
                                updates.quotePriceInWords = numberToIndianWords(prev.quotePrice);
                            }
                        }
                    }
                }

                return { ...prev, ...updates };
            });
            toast.success(`Inherited details for Unit ${unitNo}`);
        } else {
            // Safe fallback if handleInputChange is available
            setFormData(prev => ({ ...prev, unitNo }));
        }
    }, [units]);

    // Pricing Logic Helpers
    const calculatePriceValues = (type, value, currentSize, mode, metric) => {
        const sizeValSqYard = parseFloat(currentSize ? currentSize.toString().replace(/[^0-9.]/g, '') : '0');
        const numValue = parseFloat(value || '0');
        const factor = METRIC_FACTORS[metric || formData.priceUnit] || 1;

        let updates = {};

        if (mode === 'Rate') {
            // User entered RATE (per Metric)
            updates[type === 'expected' ? 'ratePrice' : 'quoteRatePrice'] = value;

            if (!isNaN(sizeValSqYard) && sizeValSqYard > 0 && !isNaN(numValue)) {
                // Total Price = (Size in Metric) * Rate
                // Size in Metric = Size in SqYard / Factor
                const sizeInMetric = sizeValSqYard / factor;
                const total = Math.round(sizeInMetric * numValue);
                updates[type === 'expected' ? 'price' : 'quotePrice'] = total.toString();
                updates[type === 'expected' ? 'priceInWords' : 'quotePriceInWords'] = numberToIndianWords(total);
            } else {
                updates[type === 'expected' ? 'price' : 'quotePrice'] = '';
                updates[type === 'expected' ? 'priceInWords' : 'quotePriceInWords'] = '';
            }
        } else {
            // User entered TOTAL
            updates[type === 'expected' ? 'price' : 'quotePrice'] = value;
            updates[type === 'expected' ? 'priceInWords' : 'quotePriceInWords'] = numberToIndianWords(value);

            if (!isNaN(sizeValSqYard) && sizeValSqYard > 0 && !isNaN(numValue)) {
                // Rate = Total / Size in Metric
                const sizeInMetric = sizeValSqYard / factor;
                const rate = Math.round(numValue / sizeInMetric);
                updates[type === 'expected' ? 'ratePrice' : 'quoteRatePrice'] = rate.toString();
            } else {
                updates[type === 'expected' ? 'ratePrice' : 'quoteRatePrice'] = '';
            }
        }
        return updates;
    };

    const handlePriceChange = useCallback((field, value) => {
        setFormData(prev => {
            try {
                const isQuote = field === 'quotePrice' || field === 'quoteRatePrice';
                const type = isQuote ? 'quote' : 'expected';
                const updates = calculatePriceValues(
                    type,
                    value,
                    prev.size,
                    prev.pricingMode,
                    prev.priceUnit
                );
                return { ...prev, ...updates };
            } catch (error) {
                console.error("Error in handlePriceChange:", error);
                return prev;
            }
        });
    }, [calculatePriceValues]);

    const handleMetricChange = (metric) => {
        setFormData(prev => {
            const updates = calculatePriceValues('expected', prev.price, prev.size, 'Total', metric);
            const quoteUpdates = calculatePriceValues('quote', prev.quotePrice, prev.size, 'Total', metric);
            return { ...prev, ...updates, ...quoteUpdates, priceUnit: metric };
        });
    };

    const handlePricingNatureChange = (type) => {
        setFormData(prev => ({
            ...prev,
            pricingNature: {
                negotiable: type === 'negotiable' ? !prev.pricingNature.negotiable : false,
                fixed: type === 'fixed' ? !prev.pricingNature.fixed : false
            }
        }));
    };

    // Fetch Projects on Mount
    useEffect(() => {
        const fetchProjects = async () => {
            if (restrictToProperties && restrictToProperties.length > 0) {
                // Derive projects from restricted list (safely extracting lookup strings)
                const getAreaName = (p) => {
                    const v = renderValue(p.projectName || p.area || p.address?.area);
                    return v !== '-' ? v : '';
                };
                const getBlockName = (p) => {
                    const v = renderValue(p.block || p.location || p.address?.locality);
                    return v !== '-' ? v : '';
                };
                const projectNames = [...new Set(restrictToProperties.map(getAreaName))].filter(Boolean);
                const derivedProjects = projectNames.map(name => ({
                    _id: name,
                    name: name,
                    blocks: [...new Set(restrictToProperties.filter(p => getAreaName(p) === name).map(getBlockName))].filter(Boolean)
                }));
                setProjects(derivedProjects);
                return;
            }

            setIsLoadingProjects(true);
            try {
                const response = await api.get('/projects');
                if (response.data && response.data.success) {
                    setProjects(response.data.data);
                }
            } catch (error) {
                console.error("Error fetching projects:", error);
                toast.error("Failed to load projects");
            } finally {
                setIsLoadingProjects(false);
            }
        };
        if (isOpen) fetchProjects();
    }, [isOpen, restrictToProperties]);

    // Fetch Units when Project or Block changes
    useEffect(() => {
        const fetchUnits = async () => {
            if (!formData.projectName) {
                setUnits([]);
                return;
            }

            if (restrictToProperties && restrictToProperties.length > 0) {
                // Filter units from restricted list
                const filteredUnits = restrictToProperties.filter(p => {
                    const areaName = renderValue(p.projectName || p.area || p.address?.area);
                    const blockName = renderValue(p.block || p.location || p.address?.locality);
                    return areaName === formData.projectName &&
                        (!formData.block || blockName === formData.block);
                });
                setUnits(filteredUnits);
                return;
            }

            setIsLoadingUnits(true);
            try {
                const params = new URLSearchParams();
                params.append('area', formData.projectName);
                params.append('statusCategory', 'Active'); // Only show active units in Add Deal modal
                if (formData.block) {
                    params.append('location', formData.block);
                }
                const response = await api.get(`/inventory?${params.toString()}`);
                if (response.data && response.data.success) {
                    const fetchedUnits = response.data.records || response.data.data || [];
                    setUnits(fetchedUnits);
                }
            } catch (error) {
                console.error("Error fetching units:", error);
            } finally {
                setIsLoadingUnits(false);
            }
        };
        if (isOpen && formData.projectName) fetchUnits();
    }, [formData.projectName, formData.block, isOpen, restrictToProperties]);

    useEffect(() => {
        if (isOpen && formData.unitNo && units.length > 0 && !initialInheritanceRef.current) {
            const searchVal = String(formData.unitNo).toLowerCase().trim();
            const unit = units.find(u => 
                String(u.unitNo || u.unitNumber || '').toLowerCase().trim() === searchVal
            );
            
            if (unit) {
                console.log('[AddDealModal] Auto-selecting unit:', unit.unitNo);
                initialInheritanceRef.current = true;
                handleUnitChange(unit.unitNo || unit.unitNumber);
            }
        }
    }, [units, isOpen, formData.unitNo, handleUnitChange]);



    const handleSave = async () => {
        setIsSaving(true);
        const toastId = toast.loading('Saving deal...');

        try {
            if (isFormLocked) {
                toast.error("Cannot save: A Sell deal already exists for this unit.");
                setIsSaving(false);
                return;
            }
            if (validateAsync) {
                const validationResult = await validateAsync('deals', formData);
                if (!validationResult.isValid) {
                    toast.error(`Validation Failed: ${Object.values(validationResult.errors).join(', ')}`, { id: toastId });
                    setIsSaving(false);
                    return;
                }
            }

            // Transform names to IDs for Lookup fields
            const transformedData = {
                ...formData,
                category: getLookupId('Category', formData.category),
                subCategory: getLookupId('SubCategory', formData.subCategory),
                propertyType: getLookupId('PropertyType', formData.propertyType),
                source: getLookupId('Source', formData.source),
                team: formData.team || null,
                assignedTo: formData.assignedTo || null,
                status: formData.status,
                // Ensure inherited data is saved
                unitSpecification: formData.unitSpecification,
                locationDetails: formData.locationDetails,
                builtupDetails: formData.builtupDetails,
                furnishing: formData.furnishing,
                documents: formData.documents,
                publishOn: formData.publishOn,
                description: formData.description,
                websiteMetadata: {
                    ...formData.websiteMetadata,
                    description: formData.description
                },
                sendMatchedDeal: formData.sendMatchedDeal,
                financialDetails: {
                    securityDeposit: formData.securityDeposit,
                    lockInMonths: formData.lockInMonths,
                    leaseTermMonths: formData.leaseTermMonths,
                    monthlyRent: (formData.intent === 'Rent' || formData.intent === 'Lease') ? formData.price : null
                }
            };

            if (formData.isOwnerSelected && formData.owner?._id) {
                transformedData.owner = formData.owner._id;
            } else {
                transformedData.owner = null;
            }
            
            if (formData.isAssociateSelected && formData.associatedContact?._id) {
                transformedData.associatedContact = formData.associatedContact._id;
            } else {
                transformedData.associatedContact = null;
            }

            // Real API call
            let response;
            if (deal && deal._id) {
                response = { data: await updateDealMutation.mutateAsync({ id: deal._id, payload: transformedData }) };
            } else {
                response = { data: await addDealMutation.mutateAsync(transformedData) };
            }

            if (!response.data || !response.data.success) {
                throw new Error(response.data?.error || 'Failed to save deal');
            }

            const savedData = response.data.data;

            toast.success('Deal Saved!', { id: toastId });

            if (deal) {
                fireEvent('deal_updated', savedData, { entityType: 'deals', previousEntity: deal });
                window.dispatchEvent(new CustomEvent('deal-updated', { detail: { dealId: savedData._id } }));
            } else {
                fireEvent('deal_created', savedData, { entityType: 'deals' });
                window.dispatchEvent(new CustomEvent('deal-updated', { detail: { dealId: savedData._id } }));

                // Enroll linked contacts into sequences
                if (formData.owner.phone) {
                    evaluateAndEnroll({ ...formData.owner, mobile: formData.owner.phone }, 'contacts');
                }
                if (formData.associatedContact.phone) {
                    evaluateAndEnroll({ ...formData.associatedContact, mobile: formData.associatedContact.phone }, 'contacts');
                }
            }

            // Removed AI Lead Matching & Outreach block as it is now handled by Automated Actions

            onSave && onSave(savedData);
            onClose();
        } catch (error) {
            console.error("Save Error:", error);
            const errorMessage = error.response?.data?.error || error.message || "Failed to save deal";
            toast.error(errorMessage, { id: toastId, duration: 5000 });
        } finally {
            setIsSaving(false);
        }
    };

    const handleGenerateAiDescription = async () => {
        if (!formData.projectName) {
            toast.error("Please select a Project Name first to generate description.");
            return;
        }
        
        setIsGeneratingAi(true);
        const toastId = toast.loading('AI is drafting a premium property description...');

        try {
            const unitDetailStr = `Project: ${formData.projectName}${formData.block ? `, Block: ${formData.block}` : ''}${formData.unitNo ? `, Unit No: ${formData.unitNo}` : ''} (${formData.propertyType || 'Residential'})`;
            const locationStr = `${formData.locationDetails?.locality || formData.location || ''} ${formData.locationDetails?.city || 'Kurukshetra'}`.trim();
            
            // Builtup Area
            const carpet = formData.unitSpecification?.carpetArea;
            const builtup = formData.unitSpecification?.builtUpArea;
            const saleable = formData.unitSpecification?.totalSaleableArea;
            const builtupStr = `Size: ${formData.size} ${formData.sizeUnit}${builtup ? `, Built-up Area: ${builtup} Sq.Ft.` : ''}${carpet ? `, Carpet Area: ${carpet} Sq.Ft.` : ''}${saleable ? `, Saleable Area: ${saleable} Sq.Ft.` : ''}`;
            
            // Expected Price
            const priceVal = formData.price || formData.quotePrice;
            const expectedPriceStr = priceVal ? `₹${new Intl.NumberFormat('en-IN').format(priceVal)} ${formData.pricingMode === 'Rate' ? `per ${formData.priceUnit || 'Sq.Ft.'}` : '(Total Expected Price)'}` : 'Price on Request';
            
            // 4 Deal Details Fields
            const dealDetailsStr = `Deal Status: ${formData.status}, Deal Type: ${formData.dealType}, Transaction Type: ${formData.transactionType}, Lead/Deal Source: ${formData.source}`;

            // Furnishing details
            const furnishType = formData.furnishing?.furnishType || '';
            const possessionStatus = formData.furnishing?.possessionStatus || '';
            const constructionAge = formData.furnishing?.constructionAge || '';
            const furnishedItems = Array.isArray(formData.furnishing?.furnishedItems) ? formData.furnishing.furnishedItems.filter(Boolean).join(', ') : '';
            const furnishingStr = [
                furnishType ? `Furnishing Status: ${furnishType}` : '',
                possessionStatus ? `Possession: ${possessionStatus}` : '',
                constructionAge ? `Age of Construction: ${constructionAge} years` : '',
                furnishedItems ? `Amenities/Furnished Items: ${furnishedItems}` : ''
            ].filter(Boolean).join(', ');

            // Specification details
            const facing = formData.unitSpecification?.facing || '';
            const orientation = formData.unitSpecification?.orientation || '';
            const roadWidth = formData.unitSpecification?.roadWidth || '';
            const ownership = formData.unitSpecification?.ownership || '';
            const specsStr = [
                facing ? `Facing: ${facing}` : '',
                orientation ? `Orientation: ${orientation}` : '',
                roadWidth ? `Road Width: ${roadWidth}` : '',
                ownership ? `Ownership: ${ownership}` : ''
            ].filter(Boolean).join(', ');

            // Category and Intent
            const intent = formData.intent || '';
            const category = formData.category || '';
            const subCategory = formData.subCategory || '';
            const categoryStr = [
                intent ? `Transaction Intent: For ${intent}` : '',
                category ? `Category: ${category}` : '',
                subCategory ? `Sub-category: ${subCategory}` : ''
            ].filter(Boolean).join(', ');

            const systemPrompt = `You are a world-class luxury real estate copywriter and SEO expert. Write a highly engaging, sophisticated, and professional description for a property listing that ranks high on Google Search.

CRITICAL FORMATTING & WRITING RULES:
1. PARAGRAPH LENGTH: Write ONLY short, concise paragraphs (maximum 2-3 sentences per paragraph). Use 3-4 short paragraphs in total.
2. SEO OPTIMIZATION: Seamlessly integrate relevant keywords like project name, locality, city, property type, and key features so the listing ranks high on Google Search.
3. TONE & STYLE: Premium, high-converting, and elegant (SaaS Real Estate standard). Emphasize key selling points, prime location attributes, built-up configuration, pricing value, furnishing, and transaction clarity. Do not use generic placeholders or templates.
4. CALL TO ACTION: Include a brief, compelling, professional call to action at the end to get in touch.

Return ONLY the final description. Do not include any intro, metadata, or titles.`;

            const userPrompt = `Draft a premium, SEO-friendly, high-converting real estate description based on these property specifications:
- **Unit Details**: ${unitDetailStr}
- **Location**: ${locationStr}${formData.locationDetails?.landmark ? ` (Landmark: ${formData.locationDetails.landmark})` : ''}
- **Built-up Details**: ${builtupStr}
- **Expected Price**: ${expectedPriceStr}
- **Transaction Details**: ${categoryStr}
- **Furnishing & Possession**: ${furnishingStr || 'Not Specified'}
- **Property Specifications**: ${specsStr || 'Not Specified'}
- **Deal Details (Status, Type, Transaction, Source)**: ${dealDetailsStr}
- **Additional Context / Remarks**: ${formData.remarks || 'Prime property with excellent connectivity.'}

Write a highly engaging, SEO-optimized description with short, readable paragraphs (maximum 2-3 sentences each) suitable for publication on our public website directory.`;

            const response = await api.post('/marketing/generate-with-model', {
                provider: 'claude',
                model: 'claude-3-haiku-20240307',
                prompt: userPrompt,
                systemPrompt: systemPrompt
            });

            if (response.data && response.data.success && response.data.content) {
                const generatedText = response.data.content;
                setFormData(prev => ({ ...prev, description: generatedText }));
                toast.success('Description successfully generated!', { id: toastId });
            } else {
                throw new Error("Could not extract generated content");
            }
        } catch (error) {
            console.error("AI Generation Error:", error);
            toast.error("Failed to generate description with AI. Please try again.", { id: toastId });
        } finally {
            setIsGeneratingAi(false);
        }
    };

    const ent = {
        card: {
            background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#ffffff',
            padding: '20px 22px',
            borderRadius: '16px',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #e2e8f0',
            boxShadow: isDark ? 'none' : '0 1px 4px rgba(0, 0, 0, 0.03)',
            marginBottom: '18px'
        },
        sectionHeader: (color) => ({
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
            paddingBottom: '12px',
            borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid #f1f5f9'
        }),
        iconBadge: (color) => ({
            width: '32px',
            height: '32px',
            borderRadius: '10px',
            background: color + (isDark ? '25' : '15'),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: color,
            flexShrink: 0,
            fontSize: '14px'
        }),
        sectionTitle: {
            margin: 0,
            fontSize: '0.9rem',
            fontWeight: 800,
            color: isDark ? '#f1f5f9' : '#0f172a',
            letterSpacing: '-0.01em'
        },
        sectionSubtitle: {
            margin: '2px 0 0 0',
            fontSize: '0.74rem',
            color: isDark ? '#94a3b8' : '#64748b',
            fontWeight: 500
        },
        label: {
            display: 'block',
            fontSize: '0.71rem',
            fontWeight: 800,
            color: isDark ? '#94a3b8' : '#64748b',
            marginBottom: '6px',
            textTransform: 'uppercase',
            letterSpacing: '0.45px'
        },
        input: {
            width: '100%',
            padding: '9px 12px',
            borderRadius: '10px',
            border: isDark ? '1.5px solid rgba(255, 255, 255, 0.12)' : '1.5px solid #e2e8f0',
            fontSize: '0.84rem',
            fontWeight: 500,
            outline: 'none',
            color: isDark ? '#f1f5f9' : '#1e293b',
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#ffffff',
            height: '40px',
            boxSizing: 'border-box',
            transition: 'all 0.15s ease'
        },
        select: {
            width: '100%',
            padding: '9px 12px',
            borderRadius: '10px',
            border: isDark ? '1.5px solid rgba(255, 255, 255, 0.12)' : '1.5px solid #e2e8f0',
            fontSize: '0.84rem',
            fontWeight: 500,
            outline: 'none',
            color: isDark ? '#f1f5f9' : '#1e293b',
            backgroundColor: isDark ? '#1e293b' : '#ffffff',
            height: '40px',
            boxSizing: 'border-box',
            transition: 'all 0.15s ease',
            appearance: 'none',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
            backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2364748b%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
            backgroundSize: '10px',
            paddingRight: '32px',
            cursor: 'pointer'
        },
        selectDisabled: {
            width: '100%',
            padding: '9px 12px',
            borderRadius: '10px',
            border: isDark ? '1.5px solid rgba(255, 255, 255, 0.05)' : '1.5px solid #f1f5f9',
            fontSize: '0.84rem',
            fontWeight: 500,
            outline: 'none',
            color: isDark ? '#64748b' : '#94a3b8',
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc',
            height: '40px',
            boxSizing: 'border-box',
            cursor: 'not-allowed',
            backgroundImage: 'none'
        }
    };

    const TABS = [
        { id: 'property', label: 'Property & Unit', icon: 'fas fa-city', color: '#3b82f6' },
        { id: 'commercials', label: 'Pricing & Commercials', icon: 'fas fa-sack-dollar', color: '#10b981' },
        { id: 'terms', label: 'Deal Terms & Stage', icon: 'fas fa-file-contract', color: '#8b5cf6' },
        { id: 'marketing', label: 'Omnichannel Marketing', icon: 'fas fa-rocket', color: '#f59e0b' },
        { id: 'assignment', label: 'Assignment & Notes', icon: 'fas fa-users-gear', color: '#06b6d4' },
        { id: 'all', label: 'All Details', icon: 'fas fa-table-cells', color: '#64748b' },
    ];

    const handleNextTab = () => {
        const idx = TABS.findIndex(t => t.id === currentTab);
        if (idx >= 0 && idx < TABS.length - 2) {
            setCurrentTab(TABS[idx + 1].id);
        } else if (idx === TABS.length - 2) {
            setCurrentTab(TABS[0].id);
        }
    };

    const handlePrevTab = () => {
        const idx = TABS.findIndex(t => t.id === currentTab);
        if (idx > 0) {
            setCurrentTab(TABS[idx - 1].id);
        }
    };

    if (!isOpen) return null;

    // Sub-renderer: Property & Unit Section
    const renderPropertySection = () => (
        <div style={ent.card}>
            <div style={ent.sectionHeader('#3b82f6')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={ent.iconBadge('#3b82f6')}>
                        <i className="fas fa-city"></i>
                    </div>
                    <div>
                        <h4 style={ent.sectionTitle}>Property & Unit Configuration</h4>
                        <p style={ent.sectionSubtitle}>Select intent, project hierarchy, unit, and auto-inherit registered details</p>
                    </div>
                </div>
                {formData.unitNo && (
                    <span style={{
                        fontSize: '0.73rem', fontWeight: 800, padding: '3px 10px', borderRadius: '6px',
                        background: isDark ? 'rgba(59,130,246,0.2)' : '#eff6ff',
                        color: '#3b82f6', border: '1px solid #bfdbfe'
                    }}>
                        UNIT #{formData.unitNo} SELECTED
                    </span>
                )}
            </div>

            {/* Intent Segmented Control */}
            <div style={{ marginBottom: '18px' }}>
                <label style={ent.label}>Deal Intent</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    {[
                        { label: 'Sell', icon: 'fas fa-tag', color: '#2563eb' },
                        { label: 'Rent', icon: 'fas fa-key', color: '#10b981' },
                        { label: 'Lease', icon: 'fas fa-file-signature', color: '#8b5cf6' }
                    ].map(option => {
                        const active = formData.intent === option.label;
                        return (
                            <button
                                key={option.label}
                                type="button"
                                onClick={() => handleInputChange('intent', option.label)}
                                style={{
                                    padding: '11px 16px',
                                    borderRadius: '10px',
                                    border: `2px solid ${active ? option.color : (isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0')}`,
                                    background: active ? (isDark ? `${option.color}25` : `${option.color}10`) : (isDark ? 'rgba(255,255,255,0.03)' : '#ffffff'),
                                    color: active ? option.color : (isDark ? '#94a3b8' : '#64748b'),
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    fontSize: '0.86rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    transition: 'all 0.15s ease',
                                    boxShadow: active ? `0 2px 8px ${option.color}20` : 'none'
                                }}
                            >
                                <i className={option.icon}></i>
                                <span>{option.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Project, Block, Unit Hierarchy */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '14px', marginBottom: '18px' }}>
                <div>
                    <label style={ent.label}>Project Name</label>
                    <select
                        style={ent.select}
                        value={formData.projectName}
                        onChange={e => handleProjectChange(e.target.value)}
                        disabled={isLoadingProjects}
                    >
                        <option value="">{isLoadingProjects ? 'Loading Projects...' : 'Select Project'}</option>
                        {projects.map(p => {
                            const pName = renderValue(p.name) !== '-' ? renderValue(p.name) : '';
                            return (
                                <option key={p._id || p.id || pName} value={pName}>
                                    {pName}
                                </option>
                            );
                        })}
                    </select>
                </div>
                <div>
                    <label style={ent.label}>Block / Sector</label>
                    <select
                        style={formData.projectName ? ent.select : ent.selectDisabled}
                        value={formData.block}
                        onChange={e => {
                            const block = e.target.value;
                            setFormData(prev => ({
                                ...prev,
                                block,
                                unitNo: '',
                                propertyType: '',
                                size: '',
                                owner: { name: '', phone: '', email: '' },
                                associatedContact: { name: '', phone: '', email: '' }
                            }));
                        }}
                        disabled={!formData.projectName}
                    >
                        <option value="">{isLoadingUnits ? 'Refreshing...' : 'Select Block'}</option>
                        {projects.find(p => renderValue(p.name) === formData.projectName)?.blocks?.map(block => {
                            const bName = typeof block === 'string' ? block : renderValue(block);
                            if (!bName || bName === '-') return null;
                            return (
                                <option key={bName} value={bName}>
                                    {bName}
                                </option>
                            );
                        })}
                    </select>
                </div>
                <div>
                    <label style={ent.label}>Unit Number</label>
                    <select
                        style={(!formData.block || isLoadingUnits) ? ent.selectDisabled : ent.select}
                        value={formData.unitNo}
                        disabled={!formData.block || isLoadingUnits}
                        onChange={e => handleUnitChange(e.target.value)}
                    >
                        <option value="">{isLoadingUnits ? 'Loading Units...' : 'Select Unit'}</option>
                        {units.map(unit => {
                            const uNo = renderValue(unit.unitNo || unit.unitNumber);
                            return (
                                <option key={unit._id || uNo} value={uNo}>{uNo}</option>
                            );
                        })}
                    </select>
                </div>
            </div>

            {/* Inherited Specifications Chips */}
            {(formData.size || formData.propertyType || formData.category || formData.unitSpecification?.facing) && (
                <div style={{
                    padding: '12px 14px', borderRadius: '12px',
                    background: isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc',
                    border: isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #f1f5f9',
                    display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '18px'
                }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', marginRight: '4px' }}>
                        Inherited Specs:
                    </span>
                    {formData.size && (
                        <span style={{ fontSize: '0.74rem', color: '#4f46e5', background: isDark ? 'rgba(79,70,229,0.15)' : '#eef2ff', padding: '3px 8px', borderRadius: '6px', fontWeight: 700, border: '1px solid #c7d2fe' }}>
                            <i className="fas fa-expand-arrows-alt mr-1"></i> {renderValue(formData.size)} {formData.sizeUnit || ''}
                        </span>
                    )}
                    {formData.propertyType && (
                        <span style={{ fontSize: '0.74rem', color: '#0284c7', background: isDark ? 'rgba(2,132,199,0.15)' : '#f0f9ff', padding: '3px 8px', borderRadius: '6px', fontWeight: 700, border: '1px solid #bae6fd' }}>
                            <i className="fas fa-building mr-1"></i> {renderValue(formData.propertyType)}
                        </span>
                    )}
                    {formData.category && (
                        <span style={{ fontSize: '0.74rem', color: '#059669', background: isDark ? 'rgba(5,150,105,0.15)' : '#ecfdf5', padding: '3px 8px', borderRadius: '6px', fontWeight: 700, border: '1px solid #a7f3d0' }}>
                            <i className="fas fa-layer-group mr-1"></i> {renderValue(formData.category)}
                        </span>
                    )}
                    {formData.unitSpecification?.facing && (
                        <span style={{ fontSize: '0.74rem', color: '#d97706', background: isDark ? 'rgba(217,119,6,0.15)' : '#fffbeb', padding: '3px 8px', borderRadius: '6px', fontWeight: 700, border: '1px solid #fde68a' }}>
                            <i className="fas fa-compass mr-1"></i> Facing: {renderValue(formData.unitSpecification.facing)}
                        </span>
                    )}
                </div>
            )}

            {/* Owner & Associate Selection Cards */}
            {formData.unitNo && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', paddingTop: '16px', borderTop: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f1f5f9' }}>
                    {/* Property Owner */}
                    <div
                        onClick={() => handleInputChange('isOwnerSelected', !formData.isOwnerSelected)}
                        style={{
                            padding: '12px 14px', borderRadius: '12px',
                            border: `2px solid ${formData.isOwnerSelected ? '#2563eb' : (isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0')}`,
                            background: formData.isOwnerSelected ? (isDark ? 'rgba(37,99,235,0.15)' : '#eff6ff') : (isDark ? 'rgba(255,255,255,0.02)' : '#ffffff'),
                            cursor: 'pointer', transition: 'all 0.15s ease', position: 'relative'
                        }}
                    >
                        <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
                            <input type="checkbox" checked={formData.isOwnerSelected} readOnly style={{ width: '16px', height: '16px', accentColor: '#2563eb' }} />
                        </div>
                        <label style={{ ...ent.label, marginBottom: '6px', color: formData.isOwnerSelected ? '#2563eb' : (isDark ? '#94a3b8' : '#64748b') }}>
                            <i className="fas fa-user-tie mr-1"></i> Property Owner
                        </label>
                        <div style={{ fontSize: '0.86rem', fontWeight: 700, color: isDark ? '#f1f5f9' : '#1e293b' }}>
                            {renderValue(formData.owner?.name) !== '-' ? renderValue(formData.owner?.name) : 'No Registered Owner'}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: isDark ? '#94a3b8' : '#64748b', marginTop: '2px' }}>
                            {renderValue(formData.owner?.phone) !== '-' ? renderValue(formData.owner?.phone) : 'No phone linked'}
                        </div>
                    </div>

                    {/* Associated Dealer */}
                    <div
                        onClick={() => handleInputChange('isAssociateSelected', !formData.isAssociateSelected)}
                        style={{
                            padding: '12px 14px', borderRadius: '12px',
                            border: `2px solid ${formData.isAssociateSelected ? '#2563eb' : (isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0')}`,
                            background: formData.isAssociateSelected ? (isDark ? 'rgba(37,99,235,0.15)' : '#eff6ff') : (isDark ? 'rgba(255,255,255,0.02)' : '#ffffff'),
                            cursor: 'pointer', transition: 'all 0.15s ease', position: 'relative'
                        }}
                    >
                        <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
                            <input type="checkbox" checked={formData.isAssociateSelected} readOnly style={{ width: '16px', height: '16px', accentColor: '#2563eb' }} />
                        </div>
                        <label style={{ ...ent.label, marginBottom: '6px', color: formData.isAssociateSelected ? '#2563eb' : (isDark ? '#94a3b8' : '#64748b') }}>
                            <i className="fas fa-user-friends mr-1"></i> Associated Contact (Dealer)
                        </label>
                        <div style={{ fontSize: '0.86rem', fontWeight: 700, color: isDark ? '#f1f5f9' : '#1e293b' }}>
                            {renderValue(formData.associatedContact?.name) !== '-' ? renderValue(formData.associatedContact?.name) : 'No Dealer Linked'}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: isDark ? '#94a3b8' : '#64748b', marginTop: '2px' }}>
                            {renderValue(formData.associatedContact?.phone) !== '-' ? renderValue(formData.associatedContact?.phone) : 'No phone linked'}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    // Sub-renderer: Commercials & Pricing Section
    const renderCommercialsSection = () => (
        <div style={ent.card}>
            <div style={ent.sectionHeader('#10b981')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={ent.iconBadge('#10b981')}>
                        <i className="fas fa-sack-dollar"></i>
                    </div>
                    <div>
                        <h4 style={ent.sectionTitle}>Commercials & Financials</h4>
                        <p style={ent.sectionSubtitle}>Expected valuation, quote price, rate conversion, and lease contracts</p>
                    </div>
                </div>

                {/* Pricing Mode Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ display: 'flex', background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
                        <button
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, pricingMode: 'Total' }))}
                            style={{
                                padding: '5px 12px', borderRadius: '6px', border: 'none', fontSize: '0.78rem', fontWeight: 700,
                                cursor: 'pointer',
                                backgroundColor: formData.pricingMode === 'Total' ? (isDark ? '#3b82f6' : '#ffffff') : 'transparent',
                                color: formData.pricingMode === 'Total' ? (isDark ? '#ffffff' : '#0f172a') : (isDark ? '#94a3b8' : '#64748b'),
                                boxShadow: formData.pricingMode === 'Total' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                transition: 'all 0.15s'
                            }}
                        >
                            Total Amount
                        </button>
                        <button
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, pricingMode: 'Rate' }))}
                            style={{
                                padding: '5px 12px', borderRadius: '6px', border: 'none', fontSize: '0.78rem', fontWeight: 700,
                                cursor: 'pointer',
                                backgroundColor: formData.pricingMode === 'Rate' ? (isDark ? '#3b82f6' : '#ffffff') : 'transparent',
                                color: formData.pricingMode === 'Rate' ? (isDark ? '#ffffff' : '#0f172a') : (isDark ? '#94a3b8' : '#64748b'),
                                boxShadow: formData.pricingMode === 'Rate' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                transition: 'all 0.15s'
                            }}
                        >
                            Rate / Unit
                        </button>
                    </div>
                    {formData.pricingMode === 'Rate' && (
                        <select
                            value={formData.priceUnit}
                            onChange={(e) => handleMetricChange(e.target.value)}
                            style={{
                                padding: '5px 10px', borderRadius: '8px',
                                border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid #e2e8f0',
                                fontSize: '0.78rem', fontWeight: 700,
                                backgroundColor: isDark ? '#1e293b' : '#ffffff',
                                color: isDark ? '#f1f5f9' : '#0f172a',
                                outline: 'none', cursor: 'pointer'
                            }}
                        >
                            {Object.keys(METRIC_FACTORS).map(metric => (
                                <option key={metric} value={metric}>{metric}</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            {/* Expected Price Row */}
            <div style={{ marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ ...ent.label, marginBottom: 0 }}>
                        {(formData.intent === 'Rent' || formData.intent === 'Lease') ? 'Expected Rent' : 'Expected Price'} {formData.pricingMode === 'Rate' ? `(Per ${unitLabel})` : '(Total)'}
                    </label>
                    {formData.priceInWords && (
                        <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 700, fontStyle: 'italic' }}>
                            ({formData.priceInWords} Rupees Only)
                        </span>
                    )}
                </div>
                <div style={{ position: 'relative' }}>
                    <input
                        style={{
                            ...ent.input,
                            paddingRight: (formData.pricingMode === 'Total' && formData.ratePrice) ? '130px' : (formData.pricingMode === 'Rate' && formData.price) ? '160px' : '12px'
                        }}
                        value={formData.pricingMode === 'Total' ? formData.price : formData.ratePrice}
                        onChange={e => handlePriceChange(formData.pricingMode === 'Total' ? 'price' : 'ratePrice', e.target.value)}
                        placeholder={formData.pricingMode === 'Total' ? `Enter total ${(formData.intent === 'Rent' || formData.intent === 'Lease') ? 'rent' : 'expected amount'}` : `Enter rate per ${unitLabel}`}
                    />
                    {formData.pricingMode === 'Total' && formData.ratePrice && (
                        <div style={{
                            position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                            fontSize: '0.72rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 700,
                            background: isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc',
                            padding: '3px 8px', borderRadius: '6px', border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0'
                        }}>
                            ₹{formData.ratePrice}/{unitLabel}
                        </div>
                    )}
                    {formData.pricingMode === 'Rate' && formData.price && (
                        <div style={{
                            position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                            fontSize: '0.72rem', color: '#16a34a', fontWeight: 800,
                            background: isDark ? 'rgba(22,163,74,0.15)' : '#f0fdf4',
                            padding: '3px 8px', borderRadius: '6px', border: isDark ? '1px solid rgba(22,163,74,0.3)' : '1px solid #bbf7d0'
                        }}>
                            TOTAL: ₹{new Intl.NumberFormat('en-IN').format(formData.price)}
                        </div>
                    )}
                </div>
            </div>

            {/* Quote Price Row */}
            <div style={{ marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ ...ent.label, marginBottom: 0 }}>
                        {(formData.intent === 'Rent' || formData.intent === 'Lease') ? 'Quote Rent' : 'Quote Price'} {formData.pricingMode === 'Rate' ? `(Per ${unitLabel})` : '(Total)'}
                    </label>
                    {formData.quotePriceInWords && (
                        <span style={{ fontSize: '0.72rem', color: '#2563eb', fontWeight: 700, fontStyle: 'italic' }}>
                            ({formData.quotePriceInWords} Rupees Only)
                        </span>
                    )}
                </div>
                <div style={{ position: 'relative' }}>
                    <input
                        style={{
                            ...ent.input,
                            paddingRight: (formData.pricingMode === 'Total' && formData.quoteRatePrice) ? '130px' : (formData.pricingMode === 'Rate' && formData.quotePrice) ? '160px' : '12px'
                        }}
                        value={formData.pricingMode === 'Total' ? formData.quotePrice : formData.quoteRatePrice}
                        onChange={e => handlePriceChange(formData.pricingMode === 'Total' ? 'quotePrice' : 'quoteRatePrice', e.target.value)}
                        placeholder={formData.pricingMode === 'Total' ? `Enter total ${(formData.intent === 'Rent' || formData.intent === 'Lease') ? 'rent' : 'quote amount'}` : `Enter quote rate per ${unitLabel}`}
                    />
                    {formData.pricingMode === 'Total' && formData.quoteRatePrice && (
                        <div style={{
                            position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                            fontSize: '0.72rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 700,
                            background: isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc',
                            padding: '3px 8px', borderRadius: '6px', border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0'
                        }}>
                            ₹{formData.quoteRatePrice}/{unitLabel}
                        </div>
                    )}
                    {formData.pricingMode === 'Rate' && formData.quotePrice && (
                        <div style={{
                            position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                            fontSize: '0.72rem', color: '#2563eb', fontWeight: 800,
                            background: isDark ? 'rgba(37,99,235,0.15)' : '#eff6ff',
                            padding: '3px 8px', borderRadius: '6px', border: isDark ? '1px solid rgba(37,99,235,0.3)' : '1px solid #bfdbfe'
                        }}>
                            TOTAL: ₹{new Intl.NumberFormat('en-IN').format(formData.quotePrice)}
                        </div>
                    )}
                </div>
            </div>

            {/* Rent Specific Fields */}
            {(formData.intent === 'Rent' || formData.intent === 'Lease') && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '18px' }}>
                    <div>
                        <label style={ent.label}>Security Deposit</label>
                        <input
                            type="number"
                            style={ent.input}
                            value={formData.securityDeposit}
                            onChange={e => handleInputChange('securityDeposit', e.target.value)}
                            placeholder="Security Amount (₹)"
                        />
                    </div>
                    <div>
                        <label style={ent.label}>Lease Term (Months)</label>
                        <input
                            type="number"
                            style={ent.input}
                            value={formData.leaseTermMonths}
                            onChange={e => handleInputChange('leaseTermMonths', e.target.value)}
                            placeholder="Duration in Months"
                        />
                    </div>
                    <div>
                        <label style={ent.label}>Lock-in Period (Months)</label>
                        <input
                            type="number"
                            style={ent.input}
                            value={formData.lockInMonths}
                            onChange={e => handleInputChange('lockInMonths', e.target.value)}
                            placeholder="Lock-in Months"
                        />
                    </div>
                </div>
            )}

            {/* Pricing Nature Checkboxes */}
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, color: isDark ? '#cbd5e1' : '#334155' }}>
                    <input
                        type="checkbox"
                        checked={formData.pricingNature.negotiable}
                        onChange={() => handlePricingNatureChange('negotiable')}
                        style={{ width: '16px', height: '16px', accentColor: '#2563eb' }}
                    />
                    Price is Negotiable
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, color: isDark ? '#cbd5e1' : '#334155' }}>
                    <input
                        type="checkbox"
                        checked={formData.pricingNature.fixed}
                        onChange={() => handlePricingNatureChange('fixed')}
                        style={{ width: '16px', height: '16px', accentColor: '#2563eb' }}
                    />
                    Strictly Fixed Price
                </label>
            </div>

            {/* Live Matched Buyer Audience Card */}
            {liveMatchCount !== null && liveMatchCount > 0 && (
                <div style={{
                    marginTop: '18px', padding: '12px 16px', borderRadius: '12px',
                    background: isDark ? 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(59,130,246,0.12) 100%)' : 'linear-gradient(135deg, #ecfdf5 0%, #eff6ff 100%)',
                    border: isDark ? '1px solid rgba(16,185,129,0.3)' : '1px solid #bbf7d0',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '32px', height: '32px', borderRadius: '8px',
                            background: '#10b981', color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem'
                        }}>
                            <i className="fas fa-crosshairs"></i>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: isDark ? '#f1f5f9' : '#0f172a' }}>
                                Enterprise Match Engine Active
                            </div>
                            <div style={{ fontSize: '0.74rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                                {liveMatchCount} buyer leads in CRM match this budget and property criteria.
                            </div>
                        </div>
                    </div>
                    <span style={{
                        fontSize: '0.76rem', fontWeight: 800, padding: '4px 10px', borderRadius: '6px',
                        background: isDark ? 'rgba(16,185,129,0.2)' : '#d1fae5', color: isDark ? '#34d399' : '#047857'
                    }}>
                        🎯 {liveMatchCount} Ready Buyers
                    </span>
                </div>
            )}
        </div>
    );

    // Sub-renderer: Deal Terms & Stages Section
    const renderTermsSection = () => (
        <div style={ent.card}>
            <div style={ent.sectionHeader('#8b5cf6')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={ent.iconBadge('#8b5cf6')}>
                        <i className="fas fa-file-contract"></i>
                    </div>
                    <div>
                        <h4 style={ent.sectionTitle}>Deal Terms & Registry Configuration</h4>
                        <p style={ent.sectionSubtitle}>Stage pipeline, legal case status, transaction mix, and acquisition source</p>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '16px' }}>
                <div>
                    <label style={ent.label}>Deal Status</label>
                    <select
                        style={ent.select}
                        value={formData.status}
                        onChange={e => handleInputChange('status', e.target.value)}
                    >
                        <option value="Open">Open</option>
                        <option value="Quote">Quote</option>
                        <option value="Negotiation">Negotiation</option>
                        <option value="Booked">Booked</option>
                        <option value="Won">Won</option>
                        <option value="Lost">Lost</option>
                    </select>
                </div>
                <div>
                    <label style={ent.label}>Deal Type</label>
                    <select
                        style={ent.select}
                        value={formData.dealType}
                        onChange={e => handleInputChange('dealType', e.target.value)}
                    >
                        {dealMasterFields?.dealTypes?.map(type => {
                            const tVal = typeof type === 'string' ? type : renderValue(type);
                            return (
                                <option key={tVal} value={tVal}>{tVal}</option>
                            );
                        })}
                    </select>
                </div>
                <div>
                    <label style={ent.label}>Source</label>
                    <select
                        style={ent.select}
                        value={formData.source}
                        onChange={e => handleInputChange('source', e.target.value)}
                    >
                        <option value="Walk-in">Walk-in</option>
                        <option value="Newspaper">Newspaper</option>
                        <option value="99acres">99acres</option>
                        <option value="Social Media">Social Media</option>
                        <option value="Cold Calling">Cold Calling</option>
                        <option value="Own Website">Own Website</option>
                    </select>
                </div>
                <div>
                    <label style={ent.label}>Transaction Type</label>
                    <select
                        style={ent.select}
                        value={formData.transactionType}
                        onChange={e => handleInputChange('transactionType', e.target.value)}
                    >
                        <option value="Full White">Full White</option>
                        <option value="Collector Rate">Collector Rate</option>
                        <option value="Flexible">Flexible</option>
                    </select>
                </div>
            </div>

            {/* Flexible White Component Slider */}
            {formData.transactionType === 'Flexible' && (
                <div style={{
                    marginTop: '16px', padding: '14px 16px', borderRadius: '12px',
                    background: isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc',
                    border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e2e8f0'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <label style={{ ...ent.label, marginBottom: 0 }}>White Component Allocation</label>
                        <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#2563eb' }}>{formData.flexiblePercentage}%</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={formData.flexiblePercentage}
                        onChange={e => handleInputChange('flexiblePercentage', e.target.value)}
                        style={{ width: '100%', cursor: 'pointer', accentColor: '#2563eb' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.73rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>
                        <span>0% (Full Cash Component)</span>
                        <span>100% (Full White Registry)</span>
                    </div>
                </div>
            )}
        </div>
    );

    // Sub-renderer: Omnichannel Marketing Section
    const renderMarketingSection = () => (
        <div style={ent.card}>
            <div style={ent.sectionHeader('#f59e0b')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={ent.iconBadge('#f59e0b')}>
                        <i className="fas fa-rocket"></i>
                    </div>
                    <div>
                        <h4 style={ent.sectionTitle}>Omnichannel Marketing Command Center</h4>
                        <p style={ent.sectionSubtitle}>Auto-syndicate listing across web portals, social feeds, and AI copywriter</p>
                    </div>
                </div>
            </div>

            <label style={ent.label}>Syndicate & Publish On</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px', marginBottom: '18px' }}>
                {[
                    { id: 'website', icon: 'fas fa-globe', label: 'Website', color: '#2563eb' },
                    { id: 'facebook', icon: 'fab fa-facebook', label: 'Facebook', color: '#1877f2' },
                    { id: 'instagram', icon: 'fab fa-instagram', label: 'Instagram', color: '#e4405f' },
                    { id: 'whatsapp', icon: 'fab fa-whatsapp', label: 'WhatsApp', color: '#25d366' },
                    { id: 'linkedin', icon: 'fab fa-linkedin', label: 'LinkedIn', color: '#0077b5' },
                    { id: 'x', icon: 'fab fa-twitter', label: 'X', color: '#0f172a' }
                ].map(platform => {
                    const active = formData.publishOn[platform.id];
                    return (
                        <button
                            key={platform.id}
                            type="button"
                            onClick={() => handleNestedInputChange('publishOn', platform.id, !active)}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 8px',
                                borderRadius: '10px',
                                border: `1.5px solid ${active ? platform.color : (isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0')}`,
                                background: active ? (isDark ? `${platform.color}25` : `${platform.color}12`) : (isDark ? 'rgba(255,255,255,0.03)' : '#ffffff'),
                                cursor: 'pointer', transition: 'all 0.15s ease',
                                color: active ? (isDark ? '#ffffff' : platform.color) : (isDark ? '#94a3b8' : '#64748b'),
                                fontSize: '0.8rem', fontWeight: 700
                            }}
                        >
                            <i className={platform.icon} style={{ color: active ? platform.color : 'inherit' }}></i>
                            <span>{platform.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Website Privacy Settings */}
            {formData.publishOn.website && (
                <div style={{
                    marginBottom: '18px', padding: '14px 16px', borderRadius: '12px',
                    background: isDark ? 'rgba(37,99,235,0.08)' : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                    border: isDark ? '1px solid rgba(37,99,235,0.2)' : '1px solid #e2e8f0'
                }}>
                    <h5 style={{ margin: '0 0 10px 0', fontSize: '0.82rem', fontWeight: 800, color: isDark ? '#93c5fd' : '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="fas fa-shield-alt" style={{ color: '#2563eb' }}></i> Public Website Privacy Controls
                    </h5>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155' }}>
                            <input
                                type="checkbox"
                                checked={formData.websiteMetadata?.shareUnitNumber !== false}
                                onChange={(e) => handleNestedInputChange('websiteMetadata', 'shareUnitNumber', e.target.checked)}
                                style={{ width: '16px', height: '16px', accentColor: '#2563eb' }}
                            />
                            <span>Display Exact Unit Number on Website</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155' }}>
                            <input
                                type="checkbox"
                                checked={formData.websiteMetadata?.shareLocation !== false}
                                onChange={(e) => handleNestedInputChange('websiteMetadata', 'shareLocation', e.target.checked)}
                                style={{ width: '16px', height: '16px', accentColor: '#2563eb' }}
                            />
                            <span>Display Interactive Map Location on Website</span>
                        </label>
                    </div>
                </div>
            )}

            {/* AI-Assisted Website Listing Description */}
            <div style={{
                borderRadius: '12px', padding: '16px',
                background: isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc',
                border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #cbd5e1',
                position: 'relative'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <label style={{ ...ent.label, marginBottom: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="fas fa-globe text-blue-500"></i> Public Website Listing Description
                    </label>
                    <button
                        type="button"
                        onClick={handleGenerateAiDescription}
                        disabled={isGeneratingAi}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '6px 12px', borderRadius: '8px',
                            border: '1px solid #c7d2fe',
                            background: 'linear-gradient(135deg, #e0e7ff 0%, #eef2ff 100%)',
                            color: '#4f46e5', fontSize: '0.74rem', fontWeight: 800,
                            cursor: 'pointer', transition: 'all 0.15s ease',
                            opacity: isGeneratingAi ? 0.7 : 1
                        }}
                    >
                        <i className={isGeneratingAi ? "fas fa-spinner fa-spin" : "fas fa-magic"}></i>
                        <span>{isGeneratingAi ? "Drafting Listing..." : "Generate with AI"}</span>
                    </button>
                </div>
                <textarea
                    style={{
                        ...ent.input,
                        minHeight: '120px',
                        resize: 'vertical',
                        lineHeight: '1.5',
                        height: 'auto'
                    }}
                    value={formData.description}
                    onChange={e => handleInputChange('description', e.target.value)}
                    placeholder="Draft an engaging, high-converting property overview for the public website. (Tip: Click 'Generate with AI' to generate automatically using selected unit attributes!)"
                />
            </div>
        </div>
    );

    // Sub-renderer: System Assignment & Notes Section
    const renderAssignmentSection = () => (
        <div style={ent.card}>
            <div style={ent.sectionHeader('#06b6d4')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={ent.iconBadge('#06b6d4')}>
                        <i className="fas fa-users-gear"></i>
                    </div>
                    <div>
                        <h4 style={ent.sectionTitle}>Internal Ownership & System Settings</h4>
                        <p style={ent.sectionSubtitle}>Assign internal sales team, lead executive, access scope, and private remarks</p>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '18px' }}>
                <div>
                    <label style={ent.label}>Assigned Team</label>
                    <select
                        style={ent.select}
                        value={formData.team}
                        onChange={e => {
                            const newTeam = e.target.value;
                            setFormData(prev => ({
                                ...prev,
                                team: newTeam,
                                assignedTo: ''
                            }));
                        }}
                    >
                        <option value="">Select Team</option>
                        {teams?.map(team => (
                            <option key={team._id} value={team._id}>{team.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label style={ent.label}>Assigned Agent</label>
                    <select
                        style={ent.select}
                        value={formData.assignedTo}
                        onChange={e => handleInputChange('assignedTo', e.target.value)}
                    >
                        <option value="">Select Agent</option>
                        {users
                            .filter(user => !formData.team || (user.team && user.team === formData.team) || (user.team?._id === formData.team))
                            .map(user => (
                                <option key={user._id || user.id} value={user._id || user.id}>{user.name}</option>
                            ))
                        }
                    </select>
                </div>
                <div>
                    <label style={ent.label}>Record Visibility</label>
                    <select
                        style={ent.select}
                        value={formData.visibleTo}
                        onChange={e => handleInputChange('visibleTo', e.target.value)}
                    >
                        <option value="Private">Private</option>
                        <option value="Team">Team</option>
                        <option value="Everyone">Everyone</option>
                    </select>
                </div>
            </div>

            <div>
                <label style={ent.label}>Internal Remarks & Audit Notes</label>
                <textarea
                    style={{
                        ...ent.input,
                        minHeight: '90px',
                        resize: 'vertical',
                        lineHeight: '1.4',
                        height: 'auto'
                    }}
                    value={formData.remarks}
                    onChange={e => handleInputChange('remarks', e.target.value)}
                    placeholder="Internal team notes, negotiation background, broker commissions, or special terms..."
                />
            </div>
        </div>
    );

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.65)',
                zIndex: 1000,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                backdropFilter: 'blur(8px)',
                padding: '16px'
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: isDark ? '#0f172a' : '#ffffff',
                    width: '960px',
                    maxWidth: '96vw',
                    maxHeight: 'min(92vh, 920px)',
                    height: 'min(92vh, 920px)',
                    borderRadius: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.4)',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0',
                    color: isDark ? '#f1f5f9' : '#0f172a'
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Enterprise Header */}
                <div style={{
                    padding: '16px 24px',
                    borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #f1f5f9',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: isDark ? 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)' : 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
                    flexShrink: 0
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{
                            width: '42px', height: '42px', borderRadius: '12px',
                            background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)', color: '#fff',
                            flexShrink: 0, fontSize: '18px'
                        }}>
                            <i className="fas fa-handshake"></i>
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h2 style={{ fontSize: '1.18rem', fontWeight: 800, color: isDark ? '#f1f5f9' : '#0f172a', margin: 0, letterSpacing: '-0.01em' }}>
                                    {title || (deal ? 'Update Deal' : 'Add New Deal')}
                                </h2>
                                <span style={{
                                    fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px',
                                    background: deal ? (isDark ? 'rgba(245,158,11,0.2)' : '#fef3c7') : (isDark ? 'rgba(59,130,246,0.2)' : '#eff6ff'),
                                    color: deal ? '#d97706' : '#2563eb',
                                    border: deal ? '1px solid #fde68a' : '1px solid #bfdbfe'
                                }}>
                                    {deal ? 'EDIT MODE' : 'NEW RECORD'}
                                </span>
                                {(formData.projectName || formData.unitNo) && (
                                    <span style={{
                                        fontSize: '0.72rem', fontWeight: 700, color: isDark ? '#93c5fd' : '#2563eb',
                                        background: isDark ? 'rgba(37,99,235,0.15)' : '#eff6ff',
                                        padding: '2px 8px', borderRadius: '6px', border: '1px solid #bfdbfe'
                                    }}>
                                        {[renderValue(formData.projectName), renderValue(formData.unitNo)].filter(v => v && v !== '-').join(' • ')}
                                    </span>
                                )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.73rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600, marginTop: '3px' }}>
                                <i className="far fa-clock" style={{ color: '#2563eb', fontSize: '11px' }}></i>
                                <span>{currentTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                <span style={{ opacity: 0.4 }}>•</span>
                                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: isDark ? '#e2e8f0' : '#1e293b' }}>
                                    {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {/* Live Matched Count Badge */}
                        {liveMatchCount !== null && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '5px 12px', borderRadius: '20px',
                                background: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ecfdf5',
                                border: isDark ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid #a7f3d0',
                                color: isDark ? '#34d399' : '#059669',
                                fontSize: '0.74rem', fontWeight: 800
                            }}>
                                <i className={isLiveMatching ? "fas fa-spinner fa-spin" : "fas fa-bullseye"}></i>
                                <span>{isLiveMatching ? 'Matching...' : `🎯 ${liveMatchCount} Matched Leads`}</span>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                width: '36px', height: '36px', borderRadius: '10px',
                                border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0',
                                background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f8fafc',
                                color: isDark ? '#cbd5e1' : '#64748b',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', transition: 'all 0.15s'
                            }}
                            title="Close"
                        >
                            <i className="fas fa-times" style={{ fontSize: '14px' }}></i>
                        </button>
                    </div>
                </div>

                {/* Tab Navigation Bar */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 24px',
                    background: isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc',
                    borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e2e8f0',
                    overflowX: 'auto',
                    flexShrink: 0
                }} className="no-scrollbar">
                    {TABS.map(tab => {
                        const active = currentTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setCurrentTab(tab.id)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '8px 14px',
                                    borderRadius: '10px',
                                    border: 'none',
                                    background: active ? (isDark ? 'rgba(37,99,235,0.2)' : '#ffffff') : 'transparent',
                                    color: active ? (isDark ? '#60a5fa' : '#2563eb') : (isDark ? '#94a3b8' : '#64748b'),
                                    boxShadow: active ? (isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.08)') : 'none',
                                    fontWeight: active ? 800 : 600,
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <i className={tab.icon} style={{ color: active ? tab.color : 'inherit', fontSize: '13px' }}></i>
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Modal Body */}
                <div
                    className="no-scrollbar"
                    style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '20px 24px',
                        background: isDark ? '#0b1329' : '#f8fafc',
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none'
                    }}
                >
                    {currentTab === 'property' && renderPropertySection()}
                    {currentTab === 'commercials' && renderCommercialsSection()}
                    {currentTab === 'terms' && renderTermsSection()}
                    {currentTab === 'marketing' && renderMarketingSection()}
                    {currentTab === 'assignment' && renderAssignmentSection()}
                    {currentTab === 'all' && (
                        <div>
                            {renderPropertySection()}
                            {renderCommercialsSection()}
                            {renderTermsSection()}
                            {renderMarketingSection()}
                            {renderAssignmentSection()}
                        </div>
                    )}
                </div>

                {/* Footer pinned at bottom */}
                <div style={{
                    padding: '14px 24px',
                    borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #f1f5f9',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: isDark ? '#0f172a' : '#ffffff',
                    flexShrink: 0
                }}>
                    {/* Left: Summary / Match Indicator */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {liveMatchCount !== null && (
                            <div style={{ fontSize: '0.76rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>
                                <i className="fas fa-bullseye text-blue-500 mr-1"></i>
                                <span>{liveMatchCount} buyer leads ready for this deal</span>
                            </div>
                        )}
                    </div>

                    {/* Right: Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                padding: '9px 20px', borderRadius: '10px',
                                border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1',
                                background: isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
                                color: isDark ? '#cbd5e1' : '#475569',
                                fontWeight: 700, fontSize: '0.82rem',
                                cursor: 'pointer', transition: 'all 0.15s'
                            }}
                        >
                            Cancel
                        </button>

                        {currentTab !== 'property' && currentTab !== 'all' && (
                            <button
                                type="button"
                                onClick={handlePrevTab}
                                style={{
                                    padding: '9px 18px', borderRadius: '10px',
                                    border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1',
                                    background: isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
                                    color: isDark ? '#cbd5e1' : '#475569',
                                    fontWeight: 700, fontSize: '0.82rem',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                <i className="fas fa-arrow-left"></i>
                                <span>Previous</span>
                            </button>
                        )}

                        {currentTab !== 'assignment' && currentTab !== 'all' && (
                            <button
                                type="button"
                                onClick={handleNextTab}
                                style={{
                                    padding: '9px 20px', borderRadius: '10px',
                                    border: 'none',
                                    background: isDark ? 'rgba(37,99,235,0.2)' : '#eff6ff',
                                    color: '#2563eb',
                                    fontWeight: 800, fontSize: '0.82rem',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                <span>Next</span>
                                <i className="fas fa-arrow-right"></i>
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={isSaving}
                            style={{
                                padding: '9px 26px', borderRadius: '10px',
                                border: 'none',
                                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                                color: '#ffffff', fontWeight: 800, fontSize: '0.84rem',
                                cursor: 'pointer',
                                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
                                transition: 'all 0.15s ease',
                                opacity: isSaving ? 0.7 : 1,
                                display: 'flex', alignItems: 'center', gap: '8px'
                            }}
                        >
                            {isSaving && <i className="fas fa-spinner fa-spin"></i>}
                            <span>{isSaving ? 'Saving...' : (deal ? 'Update Deal' : 'Create Deal')}</span>
                        </button>
                    </div>
                </div>
            </div>
            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
                .no-scrollbar { -ms-overflow-style: none !important; scrollbar-width: none !important; }
            `}</style>
        </div>
    );
};

export default AddDealModal;
