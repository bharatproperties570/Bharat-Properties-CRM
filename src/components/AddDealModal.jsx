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
import { findMatchedSize, resolveUnitDimensionsAndSize, extractAreaFromLabel, formatDimension, getMetricAbbreviation } from '../utils/sizeDimensionUtils';

const AddDealModal = ({ isOpen, onClose, onSave, deal = null, title, restrictToProperties }) => {
    const { isDark } = useTheme() || {};
    const { getLookupId, getLookupValue, dealMasterFields, sizes = [] } = usePropertyConfig() || {};
    const { validateAsync = async () => ({ isValid: true, errors: {} }) } = useFieldRules() || {};
    const { fireEvent = () => {} } = useTriggers() || {};
    const { executeDistribution = async () => null } = useDistribution() || {};
    const { data: users = [] } = useActiveUsers() || {};
    
    const { data: teams = [] } = useTeams() || {};
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
        sizeLabel: '',
        sizeId: null,
        sizeConfig: null,
        width: '',
        length: '',
        widthMetric: 'Feet',
        lengthMetric: 'Feet',
        roadWidth: '',
        facing: '',
        direction: '',
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
        visibleTo: 'Team',

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
                    const totalMatches = typeof matchRes.data.totalCount === 'number'
                        ? matchRes.data.totalCount
                        : (matchRes.data.count || 0);
                    setLiveMatchCount(totalMatches);
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
        'kanal': 500,
        'acre': 4840,
        'hectare': 11959.9
    };

    const METRIC_IN_SQ_YARD = {
        'sqyard': 1,
        'sq.yard': 1,
        'sq yard': 1,
        'sqyd': 1,
        'sq yd': 1,
        'yard': 1,
        'yards': 1,
        'gaj': 1,
        'sq feet': 1 / 9,
        'sqfeet': 1 / 9,
        'sq.feet': 1 / 9,
        'sq ft': 1 / 9,
        'sq.ft': 1 / 9,
        'sq.ft.': 1 / 9,
        'sqft': 1 / 9,
        'ft': 1 / 9,
        'sqmeter': 1.19599,
        'sq meter': 1.19599,
        'sq.meter': 1.19599,
        'sqm': 1.19599,
        'sq m': 1.19599,
        'meter': 1.19599,
        'marla': 25,
        'kanal': 500,
        'kananl': 500,
        'acre': 4840,
        'hectare': 11959.9
    };

    const normalizeUnitKey = (unitStr) => {
        if (!unitStr) return 'sqyard';
        return String(unitStr).toLowerCase().replace(/[^a-z0-9.]/g, '');
    };

    const getFactorInSqYard = (unitStr) => {
        const key = normalizeUnitKey(unitStr);
        for (const [k, factor] of Object.entries(METRIC_IN_SQ_YARD)) {
            if (key === normalizeUnitKey(k)) return factor;
        }
        return 1;
    };

    const convertSizeToMetric = (rawSize, sourceUnit = 'Sq Yard', targetMetric = 'SqYard') => {
        if (rawSize === null || rawSize === undefined || rawSize === '') return 0;
        const numSize = parseFloat(String(rawSize).replace(/[^0-9.]/g, ''));
        if (isNaN(numSize) || numSize <= 0) return 0;

        const sourceFactor = getFactorInSqYard(sourceUnit);
        const targetFactor = getFactorInSqYard(targetMetric);

        const sizeInSqYard = numSize * sourceFactor;
        return sizeInSqYard / targetFactor;
    };

    const getUnitShortName = (unit) => {
        const map = {
            'SqYard': 'Sq.Yd',
            'sqMeter': 'Sq.Mt',
            'sq feet': 'Sq.Ft',
            'marla': 'Marla',
            'kananl': 'Kanal',
            'kanal': 'Kanal',
            'acre': 'Acre',
            'hectare': 'Hectare'
        };
        return map[unit] || unit || 'Sq.Yd';
    };

    const getUnitDisplayName = (unit) => {
        const map = {
            'SqYard': 'Sq. Yard (Gaj)',
            'sqMeter': 'Sq. Meter',
            'sq feet': 'Sq. Feet',
            'marla': 'Marla',
            'kananl': 'Kanal',
            'kanal': 'Kanal',
            'acre': 'Acre',
            'hectare': 'Hectare'
        };
        return map[unit] || unit || 'Sq. Yard';
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

    /**
     * Enterprise Area Resolver:
     * Ground Truth Principle: The count inside brackets of sizeLabel (e.g. "8 Marla (200.01 Sq Yd)")
     * represents the TRUE total area in Sq. Yard (Gaj).
     * Total Expected Price / Bracket Count = Rate per Sq. Yard.
     * Rate per Sq. Yard * Bracket Count = Total Expected Price.
     */
    const resolveEffectiveArea = useCallback((formObj = formData) => {
        // Priority 1: Check sizeLabel or unitSpecification.sizeLabel
        const labelCandidates = [
            formObj?.sizeLabel,
            formObj?.unitSpecification?.sizeLabel,
            formObj?.sizeConfig
        ];

        for (const cand of labelCandidates) {
            if (typeof cand === 'string' && cand) {
                const parsed = extractAreaFromLabel(cand);
                if (parsed && parsed.area > 0) {
                    const areaInSqYard = convertSizeToMetric(parsed.area, parsed.unit, 'SqYard');
                    return {
                        areaInSqYard,
                        bracketCount: parsed.area,
                        bracketUnit: parsed.unit,
                        rawUnit: parsed.rawUnit,
                        source: 'label_bracket',
                        label: cand
                    };
                }
            }
        }

        // Priority 2: Check matched size from master sizes
        const matched = findMatchedSize(formObj, null, sizes);
        if (matched) {
            if (matched.name) {
                const parsed = extractAreaFromLabel(matched.name);
                if (parsed && parsed.area > 0) {
                    const areaInSqYard = convertSizeToMetric(parsed.area, parsed.unit, 'SqYard');
                    return {
                        areaInSqYard,
                        bracketCount: parsed.area,
                        bracketUnit: parsed.unit,
                        rawUnit: parsed.rawUnit,
                        source: 'master_bracket',
                        label: matched.name
                    };
                }
            }
            if (matched.totalArea && parseFloat(matched.totalArea) > 0) {
                const num = parseFloat(matched.totalArea);
                const metric = matched.resultMetric || matched.unit || 'Sq Yard';
                const areaInSqYard = convertSizeToMetric(num, metric, 'SqYard');
                return {
                    areaInSqYard,
                    bracketCount: num,
                    bracketUnit: metric,
                    rawUnit: metric,
                    source: 'master_totalArea',
                    label: matched.name || formObj?.sizeLabel
                };
            }
        }

        // Priority 3: Direct formData.size and sizeUnit
        const numSize = parseFloat(String(formObj?.size || '').replace(/[^0-9.]/g, '') || '0');
        if (numSize > 0) {
            const unit = formObj?.sizeUnit || 'Sq Yard';
            const areaInSqYard = convertSizeToMetric(numSize, unit, 'SqYard');
            return {
                areaInSqYard,
                bracketCount: numSize,
                bracketUnit: unit,
                rawUnit: unit,
                source: 'direct_size',
                label: formObj?.sizeLabel || `${numSize} ${unit}`
            };
        }

        return null;
    }, [formData, sizes]);

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

                // Enterprise: Calculate rates if missing and we have prices + area
                let initialRate = cleanStr(deal.ratePrice, prev.ratePrice);
                let initialQuoteRate = cleanStr(deal.quoteRatePrice, prev.quoteRatePrice);
                const effective = resolveEffectiveArea({
                    ...prev,
                    ...deal,
                    price: finalPrice,
                    quotePrice: finalQuotePrice,
                    size: cleanStr(deal.size, prev.size),
                    sizeUnit: cleanStr(deal.sizeUnit, prev.sizeUnit)
                });

                if (effective && effective.areaInSqYard > 0) {
                    const targetFactor = getFactorInSqYard(deal.priceUnit || prev.priceUnit || 'SqYard');
                    const sizeInTarget = effective.areaInSqYard / targetFactor;

                    if (sizeInTarget > 0) {
                        if (finalPrice && parseFloat(finalPrice) > 0 && !initialRate) {
                            initialRate = Math.round(parseFloat(finalPrice) / sizeInTarget).toString();
                        }
                        if (finalQuotePrice && parseFloat(finalQuotePrice) > 0 && !initialQuoteRate) {
                            initialQuoteRate = Math.round(parseFloat(finalQuotePrice) / sizeInTarget).toString();
                        }
                    }
                }

                const updated = {
                    ...prev,
                    ...deal,
                    projectName: cleanStr(deal.projectName, prev.projectName),
                    block: cleanStr(deal.block, prev.block),
                    unitNo: cleanStr(deal.unitNo, prev.unitNo),
                    unitType: getLookupValue('UnitType', deal.unitType || deal.unitSpecification?.unitType) || cleanStr(deal.unitType || deal.unitSpecification?.unitType, prev.unitType || 'Ordinary'),
                    roadWidth: getLookupValue('RoadWidth', deal.roadWidth || deal.unitSpecification?.roadWidth) || cleanStr(deal.roadWidth || deal.unitSpecification?.roadWidth, prev.roadWidth || ''),
                    facing: getLookupValue('Facing', deal.facing || deal.unitSpecification?.facing) || cleanStr(deal.facing || deal.unitSpecification?.facing, prev.facing || ''),
                    direction: getLookupValue('Orientation', deal.direction || deal.orientation || deal.unitSpecification?.direction || deal.unitSpecification?.orientation) || cleanStr(deal.direction || deal.orientation || deal.unitSpecification?.direction || deal.unitSpecification?.orientation, prev.direction || ''),
                    location: cleanStr(deal.location, prev.location),
                    size: cleanStr(deal.size, prev.size),
                    sizeUnit: cleanStr(deal.sizeUnit, prev.sizeUnit),
                    sizeLabel: cleanStr(deal.sizeLabel || deal.unitSpecification?.sizeLabel, prev.sizeLabel),
                    width: cleanStr(deal.width || deal.unitSpecification?.width, prev.width),
                    length: cleanStr(deal.length || deal.unitSpecification?.length, prev.length),
                    widthMetric: cleanStr(deal.widthMetric || deal.dimensionMetric || deal.unitSpecification?.widthMetric, prev.widthMetric || 'Feet'),
                    lengthMetric: cleanStr(deal.lengthMetric || deal.dimensionMetric || deal.unitSpecification?.lengthMetric, prev.lengthMetric || 'Feet'),
                    source: getLookupValue('Source', deal.source) || cleanStr(deal.source, prev.source),
                    dealType: cleanStr(deal.dealType, prev.dealType),
                    transactionType: cleanStr(deal.transactionType, prev.transactionType),
                    price: finalPrice,
                    priceInWords: numberToIndianWords(finalPrice),
                    quotePrice: finalQuotePrice,
                    quotePriceInWords: numberToIndianWords(finalQuotePrice),
                    ratePrice: initialRate,
                    quoteRatePrice: initialQuoteRate,
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

        const projectTeam = project ? (project.team?.[0] || project.teams?.[0] || project.team) : '';
        const projectAssignee = project ? (project.assign?.[0] || project.assignedTo || project.owner) : '';
        const projectVisibility = project ? (project.visibleTo === 'Public' ? 'Everyone' : (project.visibleTo || 'Team')) : 'Team';

        let assignedTo = projectAssignee || formData.assignedTo;
        let team = projectTeam || formData.team;
        let visibleTo = projectVisibility || formData.visibleTo || 'Team';

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
            category: '',
            subCategory: '',
            unitType: 'Ordinary',
            size: '',
            sizeLabel: '',
            sizeConfig: '',
            sizeId: '',
            width: '',
            length: '',
            roadWidth: '',
            facing: '',
            direction: '',
            unitSpecification: {},
            ratePrice: '',
            quoteRatePrice: '',
            price: '',
            quotePrice: '',
            priceInWords: '',
            quotePriceInWords: '',
            owner: { name: '', phone: '', email: '' },
            associatedContact: { name: '', phone: '', email: '' },
            assignedTo,
            team,
            visibleTo: visibleTo === 'Public' ? 'Everyone' : visibleTo
        }));
    }, [projects, formData, executeDistribution]);

    const handleUnitChange = useCallback((unitNo) => {
        const targetClean = String(unitNo || '').trim().toLowerCase();
        const unit = units.find(i => {
            const u1 = String(renderValue(i.unitNo) || '').trim().toLowerCase();
            const u2 = String(renderValue(i.unitNumber) || '').trim().toLowerCase();
            const u3 = String(i.unitNo || '').trim().toLowerCase();
            const u4 = String(i.unitNumber || '').trim().toLowerCase();
            return u1 === targetClean || u2 === targetClean || u3 === targetClean || u4 === targetClean;
        });

        if (unit) {
            const cleanStr = (val, fallback = '') => {
                const s = renderValue(val);
                return s !== '-' ? s : fallback;
            };

            setFormData(prev => {
                const matchedSize = findMatchedSize(unit, null, sizes);
                const inheritedSizeLabel = unit.sizeLabel || unit.unitSpecification?.sizeLabel || matchedSize?.name || prev.sizeLabel;
                const parsedBracket = extractAreaFromLabel(inheritedSizeLabel) || extractAreaFromLabel(matchedSize?.name);

                // Enterprise: Prioritize the bracket count in sizeLabel as the true total area
                const newSize = parsedBracket?.area 
                    ? String(parsedBracket.area) 
                    : (matchedSize?.totalArea ? String(matchedSize.totalArea) : cleanStr(unit.size, prev.size));
                const newUnit = parsedBracket?.unit || matchedSize?.resultMetric || cleanStr(unit.sizeUnit, prev.sizeUnit) || 'Sq Yard';

                const inheritedWidth = unit.width || unit.frontage || unit.unitSpecification?.width || matchedSize?.width || matchedSize?.metadata?.width || prev.width || '';
                const inheritedLength = unit.length || unit.depth || unit.unitSpecification?.length || matchedSize?.length || matchedSize?.metadata?.length || prev.length || '';
                const inheritedWidthMetric = unit.widthMetric || unit.dimensionMetric || unit.unitSpecification?.widthMetric || matchedSize?.widthMetric || matchedSize?.dimensionMetric || matchedSize?.metadata?.widthMetric || prev.widthMetric || 'Feet';
                const inheritedLengthMetric = unit.lengthMetric || unit.dimensionMetric || unit.unitSpecification?.lengthMetric || matchedSize?.lengthMetric || matchedSize?.dimensionMetric || matchedSize?.metadata?.lengthMetric || prev.lengthMetric || 'Feet';
                const inheritedSizeId = unit.sizeId || matchedSize?.id || matchedSize?._id || prev.sizeId;

                const inheritedFacing = getLookupValue('Facing', unit.facing || unit.unitSpecification?.facing) || cleanStr(unit.facing || unit.unitSpecification?.facing, '');
                const inheritedDirection = getLookupValue('Orientation', unit.direction || unit.orientation || unit.unitSpecification?.direction || unit.unitSpecification?.orientation) || cleanStr(unit.direction || unit.orientation || unit.unitSpecification?.direction || unit.unitSpecification?.orientation, '');
                const inheritedRoadWidth = getLookupValue('RoadWidth', unit.roadWidth || unit.unitSpecification?.roadWidth) || cleanStr(unit.roadWidth || unit.unitSpecification?.roadWidth, '');
                const inheritedUnitType = getLookupValue('UnitType', unit.unitType || unit.unitSpecification?.unitType) || cleanStr(unit.unitType || unit.unitSpecification?.unitType, prev.unitType || 'Ordinary');

                // Recalculate prices if size changes and we have rates/totals
                let updates = {
                    unitNo,
                    inventoryId: unit._id,
                    propertyType: getLookupValue('PropertyType', unit.type || unit.category) || cleanStr(unit.type || unit.category, prev.propertyType),
                    category: getLookupValue('Category', unit.category) || cleanStr(unit.category, ''),
                    subCategory: getLookupValue('SubCategory', unit.subCategory) || cleanStr(unit.subCategory, ''),
                    unitType: inheritedUnitType,
                    size: newSize,
                    sizeUnit: newUnit,
                    sizeId: inheritedSizeId,
                    sizeConfig: unit.sizeConfig || inheritedSizeId,
                    sizeLabel: inheritedSizeLabel,
                    width: inheritedWidth,
                    length: inheritedLength,
                    widthMetric: inheritedWidthMetric,
                    lengthMetric: inheritedLengthMetric,
                    roadWidth: inheritedRoadWidth,
                    facing: inheritedFacing,
                    direction: inheritedDirection,

                    // Detailed Data Inheritance
                    unitSpecification: {
                        facing: inheritedFacing,
                        direction: inheritedDirection,
                        orientation: inheritedDirection,
                        roadWidth: inheritedRoadWidth,
                        unitType: inheritedUnitType,
                        builtupType: unit.builtupType,
                        ownership: unit.ownership,
                        length: inheritedLength,
                        width: inheritedWidth,
                        lengthMetric: inheritedLengthMetric,
                        widthMetric: inheritedWidthMetric,
                        sizeLabel: inheritedSizeLabel,
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
                    isAssociateSelected: (unit.associates?.[0]?.contact?._id || unit.associates?.[0]?.name) ? true : false,
                    team: (unit.team?.[0] || unit.teams?.[0] || unit.team || prev.team),
                    assignedTo: (unit.assignedTo || unit.assign?.[0] || prev.assignedTo),
                    visibleTo: (unit.visibleTo ? (unit.visibleTo === 'Public' ? 'Everyone' : unit.visibleTo) : prev.visibleTo)
                };

                // Trigger Recalculation logic based on true bracket ground-truth area
                if (newSize) {
                    const effectiveAreaInSqYard = convertSizeToMetric(newSize, newUnit, 'SqYard');
                    const targetFactor = getFactorInSqYard(prev.priceUnit || 'SqYard');
                    const sizeInMetric = effectiveAreaInSqYard / targetFactor;

                    if (sizeInMetric > 0) {
                        // Recalculate based on current Pricing Mode
                        if (prev.pricingMode === 'Rate') {
                            if (prev.ratePrice && parseFloat(prev.ratePrice) > 0) {
                                const total = Math.round(sizeInMetric * parseFloat(prev.ratePrice));
                                updates.price = total.toString();
                                updates.priceInWords = numberToIndianWords(total);
                            }
                            if (prev.quoteRatePrice && parseFloat(prev.quoteRatePrice) > 0) {
                                const totalQuote = Math.round(sizeInMetric * parseFloat(prev.quoteRatePrice));
                                updates.quotePrice = totalQuote.toString();
                                updates.quotePriceInWords = numberToIndianWords(totalQuote);
                            }
                        } else {
                            if (prev.price && parseFloat(prev.price) > 0) {
                                const rate = Math.round(parseFloat(prev.price) / sizeInMetric);
                                updates.ratePrice = rate.toString();
                                updates.priceInWords = numberToIndianWords(prev.price);
                            }
                            if (prev.quotePrice && parseFloat(prev.quotePrice) > 0) {
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

    // Pricing Logic Helpers (Enterprise Grade - Ground truth from Size Label Bracket Count)
    const calculatePriceValues = useCallback((type, value, currentSize, currentUnit, mode, metric) => {
        const numValue = parseFloat(String(value || '').replace(/[^0-9.]/g, '') || '0');
        const targetMetric = metric || formData.priceUnit || 'SqYard';

        // Ground truth area via resolveEffectiveArea
        const effective = resolveEffectiveArea({
            ...formData,
            size: currentSize !== undefined ? currentSize : formData.size,
            sizeUnit: currentUnit !== undefined ? currentUnit : formData.sizeUnit
        });

        let sizeInTarget = 0;
        if (effective && effective.areaInSqYard > 0) {
            const targetFactor = getFactorInSqYard(targetMetric);
            sizeInTarget = effective.areaInSqYard / targetFactor;
        }

        let updates = {};

        if (mode === 'Rate') {
            // User entered RATE (per target metric, e.g. per Sq.Yard)
            updates[type === 'expected' ? 'ratePrice' : 'quoteRatePrice'] = value;

            if (sizeInTarget > 0 && numValue > 0) {
                // Rate * Area = Total Price
                const total = Math.round(sizeInTarget * numValue);
                updates[type === 'expected' ? 'price' : 'quotePrice'] = total.toString();
                updates[type === 'expected' ? 'priceInWords' : 'quotePriceInWords'] = numberToIndianWords(total);
            } else if (!value) {
                updates[type === 'expected' ? 'price' : 'quotePrice'] = '';
                updates[type === 'expected' ? 'priceInWords' : 'quotePriceInWords'] = '';
            }
        } else {
            // User entered TOTAL PRICE
            updates[type === 'expected' ? 'price' : 'quotePrice'] = value;
            if (value && numValue > 0) {
                updates[type === 'expected' ? 'priceInWords' : 'quotePriceInWords'] = numberToIndianWords(numValue);
            } else {
                updates[type === 'expected' ? 'priceInWords' : 'quotePriceInWords'] = '';
            }

            if (sizeInTarget > 0 && numValue > 0) {
                // Total Price / Bracket Count Area = Rate per Unit
                const rate = Math.round(numValue / sizeInTarget);
                updates[type === 'expected' ? 'ratePrice' : 'quoteRatePrice'] = rate.toString();
            } else if (!value) {
                updates[type === 'expected' ? 'ratePrice' : 'quoteRatePrice'] = '';
            }
        }
        return updates;
    }, [formData, resolveEffectiveArea]);

    const handlePriceFieldChange = useCallback((field, rawValue) => {
        const cleanVal = rawValue.replace(/[^0-9.]/g, '');
        const isQuote = field === 'quotePrice' || field === 'quoteRatePrice';
        const isRate = field === 'ratePrice' || field === 'quoteRatePrice';
        const type = isQuote ? 'quote' : 'expected';
        const mode = isRate ? 'Rate' : 'Total';

        setFormData(prev => {
            try {
                const updates = calculatePriceValues(
                    type,
                    cleanVal,
                    prev.size,
                    prev.sizeUnit,
                    mode,
                    prev.priceUnit
                );
                return {
                    ...prev,
                    ...updates,
                    pricingMode: mode
                };
            } catch (error) {
                console.error("Error in handlePriceFieldChange:", error);
                return prev;
            }
        });
    }, [calculatePriceValues]);

    const handlePriceChange = useCallback((field, value) => {
        handlePriceFieldChange(field, value);
    }, [handlePriceFieldChange]);

    const handleMetricChange = (metric) => {
        setFormData(prev => {
            const updates = { priceUnit: metric };
            const effective = resolveEffectiveArea(prev);

            if (effective && effective.areaInSqYard > 0) {
                const targetFactor = getFactorInSqYard(metric);
                const sizeInMetric = effective.areaInSqYard / targetFactor;

                if (sizeInMetric > 0) {
                    if (prev.price && parseFloat(prev.price) > 0) {
                        const rate = Math.round(parseFloat(prev.price) / sizeInMetric);
                        updates.ratePrice = rate.toString();
                    }
                    if (prev.quotePrice && parseFloat(prev.quotePrice) > 0) {
                        const quoteRate = Math.round(parseFloat(prev.quotePrice) / sizeInMetric);
                        updates.quoteRatePrice = quoteRate.toString();
                    }
                }
            }
            return { ...prev, ...updates };
        });
    };

    const handleSizeLabelChange = (selectedLabel) => {
        const selected = sizes.find(s => s.name === selectedLabel || s.id === selectedLabel || s._id === selectedLabel);

        setFormData(prev => {
            const parsedBracket = extractAreaFromLabel(selectedLabel) || extractAreaFromLabel(selected?.name);
            const area = parsedBracket?.area || selected?.totalArea || selected?.size || prev.size;
            const unit = parsedBracket?.unit || selected?.resultMetric || selected?.unit || prev.sizeUnit || 'Sq Yard';
            const width = selected?.width || prev.width || '';
            const length = selected?.length || prev.length || '';
            const label = selected?.name || selectedLabel;

            const newSize = area ? String(area) : prev.size;
            const newUnit = unit || prev.sizeUnit;

            const updates = {
                sizeLabel: label,
                sizeId: selected?.id || selected?._id || prev.sizeId,
                sizeConfig: selected?.id || selected?._id || prev.sizeConfig,
                size: newSize,
                sizeUnit: newUnit,
                width,
                length,
                unitSpecification: {
                    ...prev.unitSpecification,
                    sizeLabel: label,
                    width: width || prev.unitSpecification?.width,
                    length: length || prev.unitSpecification?.length
                }
            };

            const effective = resolveEffectiveArea({ ...prev, ...updates });
            if (effective && effective.areaInSqYard > 0) {
                const targetFactor = getFactorInSqYard(prev.priceUnit || 'SqYard');
                const sizeInMetric = effective.areaInSqYard / targetFactor;

                if (sizeInMetric > 0) {
                    if (prev.pricingMode === 'Rate' && prev.ratePrice && parseFloat(prev.ratePrice) > 0) {
                        const total = Math.round(sizeInMetric * parseFloat(prev.ratePrice));
                        updates.price = total.toString();
                        updates.priceInWords = numberToIndianWords(total);
                    } else if (prev.price && parseFloat(prev.price) > 0) {
                        const rate = Math.round(parseFloat(prev.price) / sizeInMetric);
                        updates.ratePrice = rate.toString();
                    }

                    if (prev.pricingMode === 'Rate' && prev.quoteRatePrice && parseFloat(prev.quoteRatePrice) > 0) {
                        const totalQ = Math.round(sizeInMetric * parseFloat(prev.quoteRatePrice));
                        updates.quotePrice = totalQ.toString();
                        updates.quotePriceInWords = numberToIndianWords(totalQ);
                    } else if (prev.quotePrice && parseFloat(prev.quotePrice) > 0) {
                        const rateQ = Math.round(parseFloat(prev.quotePrice) / sizeInMetric);
                        updates.quoteRatePrice = rateQ.toString();
                    }
                }
            }

            return { ...prev, ...updates };
        });
    };

    const handleSizeChange = (field, value) => {
        setFormData(prev => {
            const cleanVal = field === 'size' ? value.replace(/[^0-9.]/g, '') : value;
            const newSize = field === 'size' ? cleanVal : prev.size;
            const newUnit = field === 'sizeUnit' ? value : prev.sizeUnit;

            const updates = { [field]: cleanVal };

            const effective = resolveEffectiveArea({
                ...prev,
                size: newSize,
                sizeUnit: newUnit
            });

            if (effective && effective.areaInSqYard > 0) {
                const targetFactor = getFactorInSqYard(prev.priceUnit || 'SqYard');
                const sizeInMetric = effective.areaInSqYard / targetFactor;

                if (sizeInMetric > 0) {
                    if (prev.pricingMode === 'Rate' && prev.ratePrice && parseFloat(prev.ratePrice) > 0) {
                        const total = Math.round(sizeInMetric * parseFloat(prev.ratePrice));
                        updates.price = total.toString();
                        updates.priceInWords = numberToIndianWords(total);
                    } else if (prev.price && parseFloat(prev.price) > 0) {
                        const rate = Math.round(parseFloat(prev.price) / sizeInMetric);
                        updates.ratePrice = rate.toString();
                    }

                    if (prev.pricingMode === 'Rate' && prev.quoteRatePrice && parseFloat(prev.quoteRatePrice) > 0) {
                        const totalQ = Math.round(sizeInMetric * parseFloat(prev.quoteRatePrice));
                        updates.quotePrice = totalQ.toString();
                        updates.quotePriceInWords = numberToIndianWords(totalQ);
                    } else if (prev.quotePrice && parseFloat(prev.quotePrice) > 0) {
                        const rateQ = Math.round(parseFloat(prev.quotePrice) / sizeInMetric);
                        updates.quoteRatePrice = rateQ.toString();
                    }
                }
            }

            return { ...prev, ...updates };
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
                source: getLookupId('Source', formData.source) || formData.source,
                team: formData.team || null,
                assignedTo: formData.assignedTo || null,
                status: formData.status,
                width: formData.width || formData.unitSpecification?.width,
                length: formData.length || formData.unitSpecification?.length,
                widthMetric: formData.widthMetric || formData.unitSpecification?.widthMetric || 'Feet',
                lengthMetric: formData.lengthMetric || formData.unitSpecification?.lengthMetric || 'Feet',
                sizeId: formData.sizeId,
                sizeConfig: formData.sizeConfig,
                sizeLabel: formData.sizeLabel,
                unitType: getLookupId('UnitType', formData.unitType) || formData.unitType,
                roadWidth: formData.roadWidth || formData.unitSpecification?.roadWidth,
                facing: formData.facing || formData.unitSpecification?.facing,
                direction: formData.direction || formData.unitSpecification?.direction,
                // Ensure inherited data is saved
                unitSpecification: {
                    ...formData.unitSpecification,
                    width: formData.width || formData.unitSpecification?.width,
                    length: formData.length || formData.unitSpecification?.length,
                    widthMetric: formData.widthMetric || formData.unitSpecification?.widthMetric || 'Feet',
                    lengthMetric: formData.lengthMetric || formData.unitSpecification?.lengthMetric || 'Feet',
                    sizeLabel: formData.sizeLabel || formData.unitSpecification?.sizeLabel
                },
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
        { id: 'commercials', label: 'Commercials, Terms & Registry', icon: 'fas fa-file-invoice-dollar', color: '#10b981' },
        { id: 'marketing', label: 'Marketing, Assignment & Notes', icon: 'fas fa-bullhorn', color: '#f59e0b' },
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
                                category: '',
                                subCategory: '',
                                unitType: 'Ordinary',
                                size: '',
                                sizeLabel: '',
                                sizeConfig: '',
                                sizeId: '',
                                width: '',
                                length: '',
                                roadWidth: '',
                                facing: '',
                                direction: '',
                                unitSpecification: {},
                                ratePrice: '',
                                quoteRatePrice: '',
                                price: '',
                                quotePrice: '',
                                priceInWords: '',
                                quotePriceInWords: '',
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

            {/* Property & Unit Specifications (Unified Enterprise Section) */}
            <div style={{
                background: isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc',
                border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0',
                borderRadius: '14px',
                padding: '16px 18px',
                marginBottom: '18px'
            }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '28px', height: '28px', borderRadius: '8px',
                            background: isDark ? 'rgba(79,70,229,0.25)' : '#eef2ff',
                            color: '#4f46e5', border: '1px solid #c7d2fe',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem'
                        }}>
                            <i className="fas fa-layer-group"></i>
                        </div>
                        <div>
                            <span style={{ fontSize: '0.86rem', fontWeight: 800, color: isDark ? '#f1f5f9' : '#0f172a' }}>
                                Unit Specifications & Orientation
                            </span>
                            <span style={{ fontSize: '0.72rem', color: isDark ? '#94a3b8' : '#64748b', marginLeft: '8px' }}>
                                (Inherited from backend inventory database)
                            </span>
                        </div>
                    </div>
                    {formData.unitNo && (
                        <span style={{
                            fontSize: '0.72rem', fontWeight: 800, padding: '3px 10px', borderRadius: '6px',
                            background: isDark ? 'rgba(79,70,229,0.2)' : '#eef2ff',
                            color: '#4f46e5', border: '1px solid #c7d2fe',
                            display: 'inline-flex', alignItems: 'center', gap: '4px'
                        }}>
                            <i className="fas fa-lock mr-1"></i> Unit #{formData.unitNo} Registered Specs
                        </span>
                    )}
                </div>

                {!formData.unitNo ? (
                    <div style={{
                        padding: '14px 16px',
                        borderRadius: '10px',
                        background: isDark ? 'rgba(255,255,255,0.02)' : '#ffffff',
                        border: isDark ? '1px dashed rgba(255,255,255,0.1)' : '1px dashed #cbd5e1',
                        fontSize: '0.76rem',
                        color: isDark ? '#94a3b8' : '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                    }}>
                        <div style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '6px',
                            background: isDark ? 'rgba(99,102,241,0.15)' : '#eef2ff',
                            color: '#6366f1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            fontSize: '0.75rem'
                        }}>
                            <i className="fas fa-info-circle"></i>
                        </div>
                        <span>Select a <strong>Project Name</strong>, <strong>Block / Sector</strong>, and <strong>Unit Number</strong> above to reflect its verified Category, Subcategory, Unit Type, Size Label, and Orientation metadata.</span>
                    </div>
                ) : (
                    (() => {
                        const linkedUnit = units.find(u => {
                            const u1 = String(renderValue(u.unitNo) || '').trim().toLowerCase();
                            const u2 = String(renderValue(u.unitNumber) || '').trim().toLowerCase();
                            const u3 = String(u.unitNo || '').trim().toLowerCase();
                            const u4 = String(u.unitNumber || '').trim().toLowerCase();
                            const target = String(formData.unitNo || '').trim().toLowerCase();
                            return u1 === target || u2 === target || u3 === target || u4 === target;
                        });

                        const dimData = resolveUnitDimensionsAndSize(formData, {
                            linkedInventory: linkedUnit,
                            sizes,
                            getLookupValue
                        });

                        // Resolve Master Size Label
                        const resolvedSizeLabel = formData.sizeLabel || dimData.sizeLabel || linkedUnit?.sizeLabel || '-';

                        // Resolve Raw Dimensions
                        const rawWidth = (formData.width !== undefined && formData.width !== null && formData.width !== '' && formData.width !== '-')
                            ? formData.width
                            : (dimData.width || linkedUnit?.width || linkedUnit?.frontage);

                        const rawLength = (formData.length !== undefined && formData.length !== null && formData.length !== '' && formData.length !== '-')
                            ? formData.length
                            : (dimData.length || linkedUnit?.length || linkedUnit?.depth);

                        // Resolve Metrics with explicit unit inheritance
                        const widthMetric = formData.widthMetric || dimData.widthMetric || linkedUnit?.widthMetric || linkedUnit?.dimensionMetric || 'Feet';
                        const lengthMetric = formData.lengthMetric || dimData.lengthMetric || linkedUnit?.lengthMetric || linkedUnit?.dimensionMetric || 'Feet';

                        // Formatted Width & Length using exact saved metric (useAbbr = false for full metric display)
                        const displayWidthText = formatDimension(rawWidth, widthMetric, false);
                        const displayLengthText = formatDimension(rawLength, lengthMetric, false);

                        const renderSpecBadge = (label, value, icon, accentColor) => {
                            const displayVal = renderValue(value);
                            const hasVal = displayVal && displayVal !== '-';

                            return (
                                <div style={{
                                    background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#ffffff',
                                    border: isDark ? '1px solid rgba(255, 255, 255, 0.07)' : '1px solid #e2e8f0',
                                    borderRadius: '12px',
                                    padding: '10px 14px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '11px',
                                    boxShadow: isDark ? 'none' : '0 1px 3px rgba(0, 0, 0, 0.02)',
                                    transition: 'all 0.15s ease'
                                }}>
                                    <div style={{
                                        width: '34px',
                                        height: '34px',
                                        borderRadius: '9px',
                                        background: isDark ? `${accentColor}25` : `${accentColor}12`,
                                        color: accentColor,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.82rem',
                                        flexShrink: 0
                                    }}>
                                        <i className={icon}></i>
                                    </div>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <div style={{
                                            fontSize: '0.64rem',
                                            fontWeight: 800,
                                            color: isDark ? '#94a3b8' : '#64748b',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px',
                                            marginBottom: '2px'
                                        }}>
                                            {label}
                                        </div>
                                        <div style={{
                                            fontSize: '0.86rem',
                                            fontWeight: 700,
                                            color: hasVal ? (isDark ? '#f1f5f9' : '#0f172a') : (isDark ? '#64748b' : '#94a3b8'),
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap'
                                        }} title={displayVal}>
                                            {displayVal}
                                        </div>
                                    </div>
                                </div>
                            );
                        };

                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
                                {/* Row 1: Top Tier - Size Label & Dimensions (Length & Width with saved metrics) */}
                                <div style={{
                                    background: isDark
                                        ? 'linear-gradient(135deg, rgba(79, 70, 229, 0.18) 0%, rgba(124, 58, 237, 0.10) 100%)'
                                        : 'linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%)',
                                    border: isDark ? '1.5px solid rgba(99, 102, 241, 0.4)' : '1.5px solid #c7d2fe',
                                    borderRadius: '12px',
                                    padding: '12px 16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    flexWrap: 'wrap',
                                    gap: '12px',
                                    boxShadow: isDark ? 'none' : '0 1px 4px rgba(79, 70, 229, 0.05)'
                                }}>
                                    {/* Left: Master Size Label */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '220px', flex: '1 1 auto' }}>
                                        <div style={{
                                            width: '38px',
                                            height: '38px',
                                            borderRadius: '10px',
                                            background: '#4f46e5',
                                            color: '#ffffff',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '0.95rem',
                                            boxShadow: '0 2px 6px rgba(79, 70, 229, 0.3)',
                                            flexShrink: 0
                                        }}>
                                            <i className="fas fa-ruler-combined"></i>
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{
                                                fontSize: '0.64rem',
                                                fontWeight: 800,
                                                color: isDark ? '#a5b4fc' : '#4f46e5',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                marginBottom: '2px'
                                            }}>
                                                <span>SIZE LABEL (REGISTERED)</span>
                                                <span style={{
                                                    fontSize: '0.56rem',
                                                    fontWeight: 800,
                                                    color: '#ffffff',
                                                    background: '#4f46e5',
                                                    padding: '1px 5px',
                                                    borderRadius: '4px',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '3px'
                                                }}>
                                                    <i className="fas fa-lock" style={{ fontSize: '0.5rem' }}></i> Master
                                                </span>
                                            </div>
                                            <div style={{
                                                fontSize: '1rem',
                                                fontWeight: 800,
                                                color: isDark ? '#ffffff' : '#1e1b4b',
                                                letterSpacing: '-0.2px'
                                            }}>
                                                {renderValue(resolvedSizeLabel) !== '-' ? renderValue(resolvedSizeLabel) : 'Size TBA'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right: Width & Length with exact saved metrics */}
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        flexWrap: 'wrap'
                                    }}>
                                        {/* Width Badge */}
                                        <div style={{
                                            background: isDark ? 'rgba(15, 23, 42, 0.65)' : '#ffffff',
                                            border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #c7d2fe',
                                            borderRadius: '9px',
                                            padding: '6px 12px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}>
                                            <div style={{
                                                width: '24px',
                                                height: '24px',
                                                borderRadius: '6px',
                                                background: isDark ? 'rgba(99, 102, 241, 0.25)' : '#e0e7ff',
                                                color: '#4f46e5',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '0.72rem',
                                                flexShrink: 0
                                            }}>
                                                <i className="fas fa-arrows-alt-h"></i>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.58rem', fontWeight: 800, color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                                    WIDTH
                                                </div>
                                                <div style={{ fontSize: '0.84rem', fontWeight: 800, color: isDark ? '#f1f5f9' : '#0f172a' }}>
                                                    {displayWidthText}
                                                </div>
                                            </div>
                                        </div>

                                        <span style={{ color: isDark ? '#64748b' : '#94a3b8', fontWeight: 800, fontSize: '0.95rem' }}>×</span>

                                        {/* Length Badge */}
                                        <div style={{
                                            background: isDark ? 'rgba(15, 23, 42, 0.65)' : '#ffffff',
                                            border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #c7d2fe',
                                            borderRadius: '9px',
                                            padding: '6px 12px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}>
                                            <div style={{
                                                width: '24px',
                                                height: '24px',
                                                borderRadius: '6px',
                                                background: isDark ? 'rgba(99, 102, 241, 0.25)' : '#e0e7ff',
                                                color: '#4f46e5',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '0.72rem',
                                                flexShrink: 0
                                            }}>
                                                <i className="fas fa-arrows-alt-v"></i>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.58rem', fontWeight: 800, color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                                    LENGTH
                                                </div>
                                                <div style={{ fontSize: '0.84rem', fontWeight: 800, color: isDark ? '#f1f5f9' : '#0f172a' }}>
                                                    {displayLengthText}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Row 2: Category > Subcategory > Unit Type (Single horizontal line) */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                                    {renderSpecBadge('Category', formData.category, 'fas fa-layer-group', '#6366f1')}
                                    {renderSpecBadge('Subcategory', formData.subCategory, 'fas fa-tags', '#059669')}
                                    {renderSpecBadge('Unit Type', formData.unitType !== '-' ? formData.unitType : 'Ordinary', 'fas fa-shapes', '#d97706')}
                                </div>

                                {/* Row 3: Orientation Data - Direction, Facing, Road Width (Single horizontal line) */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                                    {renderSpecBadge('Direction', formData.unitSpecification?.direction || formData.unitSpecification?.orientation || formData.direction, 'fas fa-location-arrow', '#8b5cf6')}
                                    {renderSpecBadge('Facing', formData.unitSpecification?.facing || formData.facing, 'fas fa-compass', '#e11d48')}
                                    {renderSpecBadge('Road Width', formData.unitSpecification?.roadWidth || formData.roadWidth, 'fas fa-road', '#0284c7')}
                                </div>
                            </div>
                        );
                    })()
                )}
            </div>

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
    const renderCommercialsSection = () => {
        const effective = resolveEffectiveArea(formData);
        const activeUnitDisplay = getUnitDisplayName(formData.priceUnit);
        const activeUnitShort = getUnitShortName(formData.priceUnit);
        const activeSizeLabel = formData.sizeLabel || (formData.unitSpecification?.sizeLabel) || '-';

        const targetFactor = getFactorInSqYard(formData.priceUnit);
        const effectiveAreaInTarget = (effective && effective.areaInSqYard > 0)
            ? (effective.areaInSqYard / targetFactor)
            : 0;
        const totalSizeNum = effectiveAreaInTarget;

        return (
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

                    {/* Rate Unit Metric Selector */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase' }}>
                            Rate Unit:
                        </span>
                        <select
                            value={formData.priceUnit}
                            onChange={(e) => handleMetricChange(e.target.value)}
                            style={{
                                padding: '6px 12px', borderRadius: '8px',
                                border: isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid #cbd5e1',
                                fontSize: '0.8rem', fontWeight: 700,
                                backgroundColor: isDark ? '#1e293b' : '#ffffff',
                                color: isDark ? '#f1f5f9' : '#0f172a',
                                outline: 'none', cursor: 'pointer',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }}
                        >
                            <option value="SqYard">Per Sq. Yard (Gaj)</option>
                            <option value="sqMeter">Per Sq. Meter</option>
                            <option value="sq feet">Per Sq. Feet</option>
                            <option value="marla">Per Marla</option>
                            <option value="kananl">Per Kanal</option>
                            <option value="acre">Per Acre</option>
                        </select>
                    </div>
                </div>

                {/* Calculation Basis / Size Linkage Banner */}
                <div style={{
                    marginBottom: '18px',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background: totalSizeNum > 0
                        ? (isDark ? 'rgba(16,185,129,0.08)' : '#f0fdf4')
                        : (isDark ? 'rgba(245,158,11,0.08)' : '#fffbeb'),
                    border: totalSizeNum > 0
                        ? (isDark ? '1px solid rgba(16,185,129,0.25)' : '1px solid #bbf7d0')
                        : (isDark ? '1px solid rgba(245,158,11,0.25)' : '1px solid #fde68a'),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.78rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '28px', height: '28px', borderRadius: '8px',
                            background: totalSizeNum > 0 ? '#10b981' : '#f59e0b', color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.82rem'
                        }}>
                            <i className={totalSizeNum > 0 ? "fas fa-calculator" : "fas fa-triangle-exclamation"}></i>
                        </div>
                        <div>
                            {totalSizeNum > 0 ? (
                                <div style={{ color: isDark ? '#f1f5f9' : '#0f172a' }}>
                                    <span style={{ fontWeight: 800, color: '#10b981', marginRight: '6px' }}>
                                        Calculation Basis:
                                    </span>
                                    Size Label: <strong style={{ color: '#4f46e5' }}>{activeSizeLabel !== '-' ? activeSizeLabel : 'Configured Size'}</strong>
                                    {' '}• Total Area (Bracket Count): <strong style={{ color: '#059669' }}>{effective.bracketCount} {effective.bracketUnit || 'Sq.Yard'}</strong>
                                    {formData.priceUnit !== 'SqYard' && (
                                        <span style={{ color: isDark ? '#94a3b8' : '#64748b' }}>
                                            {' '}(= <strong>{effectiveAreaInTarget % 1 === 0 ? effectiveAreaInTarget : effectiveAreaInTarget.toFixed(2)} {activeUnitShort}</strong>)
                                        </span>
                                    )}
                                    <div style={{ fontSize: '0.72rem', color: isDark ? '#a7f3d0' : '#047857', fontWeight: 600, marginTop: '2px' }}>
                                        Formula: Rate / {activeUnitShort} = Total Price ÷ {effectiveAreaInTarget % 1 === 0 ? effectiveAreaInTarget : effectiveAreaInTarget.toFixed(2)} {activeUnitShort}
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <span style={{ fontWeight: 800, color: '#d97706', marginRight: '6px' }}>
                                        Notice:
                                    </span>
                                    No Property Size configured yet. Total Price and Rate per Unit cannot synchronize automatically without total size.
                                </div>
                            )}
                            <div style={{ fontSize: '0.71rem', color: isDark ? '#94a3b8' : '#64748b', marginTop: '2px' }}>
                                {totalSizeNum > 0
                                    ? `Enter Total Price to calculate Rate/${activeUnitShort}, or enter Rate/${activeUnitShort} to calculate Total Price.`
                                    : 'Please configure size label or enter total size in "Property & Unit Configuration".'}
                            </div>
                        </div>
                    </div>
                    {totalSizeNum <= 0 && (
                        <button
                            type="button"
                            onClick={() => setCurrentTab('property')}
                            style={{
                                padding: '6px 12px', borderRadius: '8px',
                                background: '#f59e0b', color: '#ffffff', border: 'none',
                                fontSize: '0.74rem', fontWeight: 800, cursor: 'pointer'
                            }}
                        >
                            Set Size Now
                        </button>
                    )}
                </div>

                {/* Expected Price Row - Two-way sync */}
                <div style={{ marginBottom: '18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <label style={{ ...ent.label, marginBottom: 0 }}>
                            {(formData.intent === 'Rent' || formData.intent === 'Lease') ? 'Expected Rent & Rate' : 'Expected Valuation & Rate per Unit'}
                        </label>
                        {formData.priceInWords && (
                            <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 700, fontStyle: 'italic' }}>
                                ({formData.priceInWords} Rupees Only)
                            </span>
                        )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                        {/* Total Expected Price */}
                        <div>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b', marginBottom: '4px' }}>
                                Total {(formData.intent === 'Rent' || formData.intent === 'Lease') ? 'Rent (₹)' : 'Expected Price (₹)'}
                            </div>
                            <div style={{ position: 'relative' }}>
                                <span style={{
                                    position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                                    fontWeight: 700, color: isDark ? '#64748b' : '#94a3b8'
                                }}>₹</span>
                                <input
                                    style={{ ...ent.input, paddingLeft: '28px' }}
                                    value={formData.price}
                                    onChange={e => handlePriceFieldChange('price', e.target.value)}
                                    placeholder={totalSizeNum > 0 ? "Enter total price (auto-calculates rate)" : "Enter total price"}
                                />
                            </div>
                        </div>

                        {/* Rate per Unit */}
                        <div>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b', marginBottom: '4px' }}>
                                Rate per {activeUnitDisplay} (₹)
                            </div>
                            <div style={{ position: 'relative' }}>
                                <span style={{
                                    position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                                    fontWeight: 700, color: isDark ? '#64748b' : '#94a3b8'
                                }}>₹</span>
                                <input
                                    style={{
                                        ...ent.input,
                                        paddingLeft: '28px',
                                        paddingRight: '76px',
                                        backgroundColor: (!totalSizeNum) ? (isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc') : undefined
                                    }}
                                    value={formData.ratePrice}
                                    onChange={e => handlePriceFieldChange('ratePrice', e.target.value)}
                                    placeholder={totalSizeNum > 0 ? "Enter rate (auto-calculates total)" : "Requires size"}
                                    disabled={!totalSizeNum}
                                />
                                <span style={{
                                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                                    fontSize: '0.72rem', fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b',
                                    background: isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9',
                                    padding: '2px 6px', borderRadius: '4px'
                                }}>
                                    /{activeUnitShort}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Live Calculation Formula Equation */}
                    {formData.price && totalSizeNum > 0 && (
                        <div style={{
                            marginTop: '8px', padding: '6px 10px', borderRadius: '8px',
                            background: isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc',
                            border: isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #f1f5f9',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            fontSize: '0.73rem', color: isDark ? '#94a3b8' : '#64748b'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i className="fas fa-equals" style={{ color: '#10b981' }}></i>
                                <span>
                                    <strong>₹{new Intl.NumberFormat('en-IN').format(parseFloat(formData.price) || 0)}</strong>
                                    {' '}÷{' '}
                                    <strong>{totalSizeNum % 1 === 0 ? totalSizeNum : totalSizeNum.toFixed(2)} {activeUnitShort}</strong>
                                    {' '}={' '}
                                    <strong style={{ color: '#16a34a' }}>₹{new Intl.NumberFormat('en-IN').format(parseFloat(formData.ratePrice) || 0)}</strong> / {activeUnitShort}
                                </span>
                            </div>
                            <span style={{ color: '#16a34a', fontWeight: 700 }}>
                                <i className="fas fa-check-circle mr-1"></i> Rate Synced
                            </span>
                        </div>
                    )}
                </div>

                {/* Quote Price Row - Two-way sync */}
                <div style={{ marginBottom: '18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <label style={{ ...ent.label, marginBottom: 0 }}>
                            {(formData.intent === 'Rent' || formData.intent === 'Lease') ? 'Quote Rent & Rate' : 'Quote Price & Rate per Unit'}
                        </label>
                        {formData.quotePriceInWords && (
                            <span style={{ fontSize: '0.72rem', color: '#2563eb', fontWeight: 700, fontStyle: 'italic' }}>
                                ({formData.quotePriceInWords} Rupees Only)
                            </span>
                        )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                        {/* Total Quote Price */}
                        <div>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b', marginBottom: '4px' }}>
                                Total {(formData.intent === 'Rent' || formData.intent === 'Lease') ? 'Quote Rent (₹)' : 'Quote Price (₹)'}
                            </div>
                            <div style={{ position: 'relative' }}>
                                <span style={{
                                    position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                                    fontWeight: 700, color: isDark ? '#64748b' : '#94a3b8'
                                }}>₹</span>
                                <input
                                    style={{ ...ent.input, paddingLeft: '28px' }}
                                    value={formData.quotePrice}
                                    onChange={e => handlePriceFieldChange('quotePrice', e.target.value)}
                                    placeholder={totalSizeNum > 0 ? "Enter quote price (auto-calculates rate)" : "Enter quote price"}
                                />
                            </div>
                        </div>

                        {/* Quote Rate per Unit */}
                        <div>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b', marginBottom: '4px' }}>
                                Quote Rate per {activeUnitDisplay} (₹)
                            </div>
                            <div style={{ position: 'relative' }}>
                                <span style={{
                                    position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                                    fontWeight: 700, color: isDark ? '#64748b' : '#94a3b8'
                                }}>₹</span>
                                <input
                                    style={{
                                        ...ent.input,
                                        paddingLeft: '28px',
                                        paddingRight: '76px',
                                        backgroundColor: (!totalSizeNum) ? (isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc') : undefined
                                    }}
                                    value={formData.quoteRatePrice}
                                    onChange={e => handlePriceFieldChange('quoteRatePrice', e.target.value)}
                                    placeholder={totalSizeNum > 0 ? "Enter quote rate (auto-calculates total)" : "Requires size"}
                                    disabled={!totalSizeNum}
                                />
                                <span style={{
                                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                                    fontSize: '0.72rem', fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b',
                                    background: isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9',
                                    padding: '2px 6px', borderRadius: '4px'
                                }}>
                                    /{activeUnitShort}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Live Quote Calculation Formula Equation */}
                    {formData.quotePrice && totalSizeNum > 0 && (
                        <div style={{
                            marginTop: '8px', padding: '6px 10px', borderRadius: '8px',
                            background: isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc',
                            border: isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #f1f5f9',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            fontSize: '0.73rem', color: isDark ? '#94a3b8' : '#64748b'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i className="fas fa-equals" style={{ color: '#2563eb' }}></i>
                                <span>
                                    <strong>₹{new Intl.NumberFormat('en-IN').format(parseFloat(formData.quotePrice) || 0)}</strong>
                                    {' '}÷{' '}
                                    <strong>{totalSizeNum % 1 === 0 ? totalSizeNum : totalSizeNum.toFixed(2)} {activeUnitShort}</strong>
                                    {' '}={' '}
                                    <strong style={{ color: '#2563eb' }}>₹{new Intl.NumberFormat('en-IN').format(parseFloat(formData.quoteRatePrice) || 0)}</strong> / {activeUnitShort}
                                </span>
                            </div>
                            <span style={{ color: '#2563eb', fontWeight: 700 }}>
                                <i className="fas fa-check-circle mr-1"></i> Quote Rate Synced
                            </span>
                        </div>
                    )}
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
        </div>
    );
};

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
                        {(() => {
                            const rawSources = dealMasterFields?.sources && dealMasterFields.sources.length > 0
                                ? dealMasterFields.sources
                                : ['Walk-in', 'Newspaper', '99acres', 'Social Media', 'Cold Calling', 'Own Website', 'Referral'];
                            const sourcesList = formData.source && !rawSources.includes(formData.source)
                                ? [formData.source, ...rawSources]
                                : rawSources;
                            return sourcesList.map(src => {
                                const sVal = typeof src === 'string' ? src : renderValue(src);
                                return (
                                    <option key={sVal} value={sVal}>{sVal}</option>
                                );
                            });
                        })()}
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
                    {currentTab === 'commercials' && (
                        <>
                            {renderCommercialsSection()}
                            {renderTermsSection()}
                        </>
                    )}
                    {currentTab === 'marketing' && (
                        <>
                            {renderMarketingSection()}
                            {renderAssignmentSection()}
                        </>
                    )}
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

                        {currentTab !== 'marketing' && currentTab !== 'all' && (
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
