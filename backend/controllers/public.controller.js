import Deal from "../models/Deal.js";
import Project from "../models/Project.js";
import Contact from "../models/Contact.js";
import Lead from "../models/Lead.js";
import Activity from "../models/Activity.js";
import Lookup from "../models/Lookup.js";
import Inventory from "../models/Inventory.js";
import SystemSetting from "../models/SystemSetting.js";
import mongoose from "mongoose";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const escapeRegExp = (string) => {
    if (!string) return '';
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const resolveLookup = async (type, value) => {
    if (!value) return null;
    if (mongoose.Types.ObjectId.isValid(value)) return value;
    const escapedValue = escapeRegExp(value);
    let lookup = await Lookup.findOne({ lookup_type: type, lookup_value: { $regex: new RegExp(`^${escapedValue}$`, 'i') } });
    if (!lookup) {
        lookup = await Lookup.create({ lookup_type: type, lookup_value: value });
    }
    return lookup._id;
};

/**
 * PUBLIC API CONTROLLER
 * These endpoints are used by the public website.
 * Security is handled by API Key middleware.
 */

// 1. Fetch all published listings (Deals) with optional filtering/sorting
export const getListings = async (req, res) => {
    try {
        const { type, limit = 10, city: cityName } = req.query;
        let query = { isPublished: true };
        
        // City Filtering: Search in location OR projectName
        if (cityName) {
            query['$or'] = [
                { 'location': { $regex: new RegExp(cityName, 'i') } },
                { 'projectName': { $regex: new RegExp(cityName, 'i') } }
            ];
        }

        let sort = { publishedAt: -1 }; 

        if (type === 'hot') {
            // HOT Deals: Score 70+
            query['dealScore'] = { $gte: 70 };
            sort = { dealScore: -1, publishedAt: -1 };
        } else if (type === 'latest') {
            sort = { createdAt: -1 };
        } else if (type === 'cheapest') {
            // "Cheapest in segment": Group by unique combo of propertyType, subCategory, and size
            const cheapestInSegments = await Deal.aggregate([
                { $match: query },
                { $sort: { price: 1 } },
                {
                    $group: {
                        _id: {
                            type: "$propertyType",
                            sub: "$subCategory",
                            size: "$size"
                        },
                        deal: { $first: "$$ROOT" }
                    }
                },
                { $replaceRoot: { newRoot: "$deal" } },
                { $sort: { price: 1 } },
                { $limit: parseInt(limit) }
            ]);

            // Now we need to add visits to these specific deals
            const dealIds = cheapestInSegments.map(d => d._id);
            const listingsWithVisits = await Deal.aggregate([
                { $match: { _id: { $in: dealIds } } },
                { $sort: { price: 1 } },
                {
                    $lookup: {
                        from: 'activities',
                        let: { dealId: '$_id' },
                        pipeline: [
                            { $match: { 
                                $expr: { $eq: ['$entityId', '$$dealId'] },
                                type: 'Site Visit',
                                status: 'Completed'
                            }}
                        ],
                        as: 'visits'
                    }
                },
                {
                    $addFields: {
                        siteVisitCount: { $size: '$visits' },
                        id: '$_id'
                    }
                },
                {
                    $project: {
                        visits: 0, owner: 0, associatedContact: 0, partyStructure: 0, commission: 0, internalRM: 0
                    }
                }
            ]);

            return res.status(200).json({
                success: true,
                count: listingsWithVisits.length,
                data: listingsWithVisits
            });
        }

        // Use aggregation to include Site Visit counts
        const listings = await Deal.aggregate([
            { $match: query },
            { $sort: sort },
            { $limit: parseInt(limit) },
            {
                $lookup: {
                    from: 'activities',
                    let: { dealId: '$_id' },
                    pipeline: [
                        { $match: { 
                            $expr: { $eq: ['$entityId', '$$dealId'] },
                            type: 'Site Visit',
                            status: 'Completed'
                        }}
                    ],
                    as: 'visits'
                }
            },
            {
                $addFields: {
                    siteVisitCount: { $size: '$visits' },
                    id: '$_id' // For frontend compatibility
                }
            },
            {
                $project: {
                    visits: 0,
                    owner: 0,
                    associatedContact: 0,
                    partyStructure: 0,
                    commission: 0,
                    internalRM: 0
                }
            }
        ]);

        res.status(200).json({
            success: true,
            count: listings.length,
            data: listings
        });
    } catch (error) {
        console.error('getListings error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// 2. Fetch all published projects
export const getProjects = async (req, res) => {
    try {
        const { status, city: cityName, limit = 10 } = req.query;
        let query = { isPublished: true };

        // City Filtering: Search in address.city OR locationSearch
        if (cityName) {
            query['$or'] = [
                { 'address.city': { $regex: new RegExp(cityName, 'i') } },
                { 'locationSearch': { $regex: new RegExp(cityName, 'i') } },
                { 'name': { $regex: new RegExp(cityName, 'i') } }
            ];
        }

        // Status Filtering
        if (status && status !== 'All') {
            const statusId = await resolveLookup('ProjectStatus', status);
            if (statusId) {
                query['status'] = statusId;
            }
        }

        const projects = await Project.find(query)
            .select('name developerName description category subCategory reraNumber landArea totalUnits status address websiteMetadata projectImages projectVideos launchDate expectedCompletionDate possessionDate blocks amenities pricing')
            .sort({ publishedAt: -1, createdAt: -1 })
        // Sanitize projects to avoid "Cast to ObjectId failed" errors
        const sanitizedProjects = projects.map(p => {
            p._resolvedAddress = {};
            if (p.address) {
                ['city', 'locality', 'state', 'country'].forEach(field => {
                    const val = p.address[field];
                    if (val && typeof val === 'string' && !mongoose.Types.ObjectId.isValid(val)) {
                        p._resolvedAddress[field] = val;
                        p.address[field] = null;
                    } else if (val === "") {
                        p.address[field] = null;
                    }
                });
            }
            if (p.status && typeof p.status === 'string' && !mongoose.Types.ObjectId.isValid(p.status)) {
                p._resolvedStatus = p.status;
                p.status = null;
            } else if (p.status === "") {
                p.status = null;
            }
            
            if (Array.isArray(p.category)) p.category = p.category.filter(c => c && mongoose.Types.ObjectId.isValid(c));
            if (Array.isArray(p.subCategory)) p.subCategory = p.subCategory.filter(s => s && mongoose.Types.ObjectId.isValid(s));
            
            return p;
        });

        const populatedProjects = await Project.populate(sanitizedProjects, [
            { path: 'status', select: 'lookup_value' },
            { path: 'category', select: 'lookup_value' },
            { path: 'subCategory', select: 'lookup_value' },
            { path: 'address.city', model: 'Lookup', select: 'lookup_value' },
            { path: 'address.locality', model: 'Lookup', select: 'lookup_value' },
            { path: 'address.state', model: 'Lookup', select: 'lookup_value' },
            { path: 'address.country', model: 'Lookup', select: 'lookup_value' }
        ]);

        // Restore non-ID strings and format output
        const finalProjects = populatedProjects.map(p => {
            if (p._resolvedAddress) {
                Object.keys(p._resolvedAddress).forEach(field => {
                    if (p.address) p.address[field] = p._resolvedAddress[field];
                });
                delete p._resolvedAddress;
            }
            if (p._resolvedStatus) {
                p.status = p._resolvedStatus;
                delete p._resolvedStatus;
            }
            return p;
        });

        res.status(200).json({
            success: true,
            count: finalProjects.length,
            data: finalProjects
        });
    } catch (error) {
        console.error('getProjects error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// 3. Fetch listing by slug
export const getListingBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        
        // Search by slug OR by ID
        const query = {
            $or: [
                { 'websiteMetadata.slug': slug },
                { _id: slug.match(/^[0-9a-fA-F]{24}$/) ? slug : null }
            ],
            isPublished: true
        };

        const listing = await Deal.findOne(query)
            .select('-owner -associatedContact -partyStructure -commission -internalRM')
            .lean();

        if (!listing) {
            return res.status(404).json({ success: false, message: 'Listing not found' });
        }

        res.status(200).json({ success: true, data: listing });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 4. Fetch project by slug
export const getProjectBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        
        const query = {
            $or: [
                { 'websiteMetadata.slug': slug },
                { _id: slug.match(/^[0-9a-fA-F]{24}$/) ? slug : null }
            ],
            isPublished: true
        };

        const project = await Project.findOne(query)
            .select('-owner -assign -team -visibleTo')
            .lean();

        if (!project) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }

        // Sanitize and populate manually to avoid cast errors on mixed data
        const sanitizedProject = { ...project };
        sanitizedProject._resolvedAddress = {};
        if (sanitizedProject.address) {
            ['city', 'locality', 'state', 'country'].forEach(field => {
                const val = sanitizedProject.address[field];
                if (val && typeof val === 'string' && !mongoose.Types.ObjectId.isValid(val)) {
                    sanitizedProject._resolvedAddress[field] = val;
                    sanitizedProject.address[field] = null;
                } else if (val === "") {
                    sanitizedProject.address[field] = null;
                }
            });
        }
        if (sanitizedProject.status && typeof sanitizedProject.status === 'string' && !mongoose.Types.ObjectId.isValid(sanitizedProject.status)) {
            sanitizedProject._resolvedStatus = sanitizedProject.status;
            sanitizedProject.status = null;
        }

        const populatedProject = await Project.populate(sanitizedProject, [
            { path: 'status', select: 'lookup_value' },
            { path: 'category', select: 'lookup_value' },
            { path: 'subCategory', select: 'lookup_value' },
            { path: 'address.city', model: 'Lookup', select: 'lookup_value' },
            { path: 'address.locality', model: 'Lookup', select: 'lookup_value' },
            { path: 'address.state', model: 'Lookup', select: 'lookup_value' },
            { path: 'address.country', model: 'Lookup', select: 'lookup_value' }
        ]);

        // Restore
        if (populatedProject._resolvedAddress) {
            Object.keys(populatedProject._resolvedAddress).forEach(field => {
                if (populatedProject.address) populatedProject.address[field] = populatedProject._resolvedAddress[field];
            });
        }
        if (populatedProject._resolvedStatus) {
            populatedProject.status = populatedProject._resolvedStatus;
        }

        // Fetch associated deals
        const deals = await Deal.find({ projectId: project._id, isPublished: true })
            .select('projectName block unitNo unitType propertyType size sizeUnit price quotePrice websiteMetadata location status category subCategory documents publishedAt')
            .lean();

        res.status(200).json({ 
            success: true, 
            data: {
                ...project,
                associatedDeals: deals
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 4. Submit Property Form (Website -> CRM Deal)
export const submitPropertyForm = async (req, res) => {
    try {
        const { contact, ...propertyData } = req.body;
        const projectName = propertyData.projectName || propertyData.project;
        const block = propertyData.block;
        const unitNo = propertyData.unitNo;

        // 1. Resolve Contact
        let contactRecord = await Contact.findOne({ 
            $or: [
                { 'phones.number': contact.mobile },
                { 'emails.address': contact.email }
            ].filter(q => Object.values(q)[0])
        });

        if (!contactRecord) {
            contactRecord = await Contact.create({
                name: contact.name,
                phones: [{ number: contact.mobile, type: 'Personal' }],
                emails: contact.email ? [{ address: contact.email, type: 'Personal' }] : [],
                personalAddress: { city: await resolveLookup('City', contact.city) },
                source: await resolveLookup('Source', 'Website - Post Property')
            });
        }

        // 1.5 Find Matching Inventory for Enrichment
        let inventoryId = null;
        let inheritedSpecs = {};
        if (projectName && block && unitNo) {
            const inventory = await Inventory.findOne({
                projectName: { $regex: new RegExp(`^${escapeRegExp(projectName)}$`, 'i') },
                block: { $regex: new RegExp(`^${escapeRegExp(block)}$`, 'i') },
                $or: [
                    { unitNo: { $regex: new RegExp(`^${escapeRegExp(unitNo)}$`, 'i') } },
                    { unitNumber: { $regex: new RegExp(`^${escapeRegExp(unitNo)}$`, 'i') } }
                ]
            });
            
            if (inventory) {
                inventoryId = inventory._id;
                inheritedSpecs = {
                    unitSpecification: {
                        facing: inventory.facing,
                        direction: inventory.direction,
                        orientation: inventory.orientation,
                        roadWidth: inventory.roadWidth,
                        builtupType: inventory.builtupType,
                        ownership: inventory.ownership,
                        length: inventory.length,
                        width: inventory.width,
                        sizeLabel: inventory.sizeLabel,
                        totalSaleableArea: inventory.totalSaleableArea?.value,
                        builtUpArea: inventory.builtUpArea?.value,
                        carpetArea: inventory.carpetArea?.value
                    },
                    locationDetails: inventory.address,
                    builtupDetails: inventory.builtupDetails,
                    furnishing: {
                        furnishType: inventory.furnishType,
                        furnishedItems: inventory.furnishedItems,
                        possessionStatus: inventory.possessionStatus,
                        constructionAge: inventory.constructionAge || inventory.ageOfConstruction
                    },
                    category: inventory.category,
                    subCategory: inventory.subCategory,
                    propertyType: inventory.unitType || inventory.category
                };
            }
        }

        // 2. Create Deal (Standard CRM Structure)
        const dealData = {
            projectName,
            block,
            unitNo,
            inventoryId,
            intent: propertyData.intent || propertyData.availableFor || 'Sell',
            price: propertyData.expectedPrice || propertyData.price,
            size: propertyData.totalArea || inheritedSpecs.unitSpecification?.totalSaleableArea,
            sizeUnit: propertyData.areaUnit || 'Sq Yard',
            propertyType: inheritedSpecs.propertyType || await resolveLookup('PropertyType', propertyData.propertyType || 'Residential'),
            category: inheritedSpecs.category,
            subCategory: inheritedSpecs.subCategory,
            unitSpecification: inheritedSpecs.unitSpecification,
            locationDetails: inheritedSpecs.locationDetails,
            builtupDetails: inheritedSpecs.builtupDetails,
            furnishing: inheritedSpecs.furnishing,
            status: 'Pending Verification',
            tags: ['unverified', 'Professional-Capture'],
            description: propertyData.remarks || propertyData.description,
            owner: contactRecord._id,
            ownerName: contactRecord.name,
            ownerPhone: contact.mobile,
            associateRole: propertyData.role || propertyData.associateWith,
            associateRelationship: propertyData.relationship,
            isPublished: false,
            source: 'Website - Professional Deal Capture'
        };

        const deal = await Deal.create(dealData);

        res.status(201).json({
            success: true,
            message: 'Property submitted successfully. Our team will verify and publish it soon.',
            dealId: deal._id
        });
    } catch (error) {
        console.error('Property submission error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// 5. Submit Lead Form (Website -> CRM Lead & Activity)
export const submitLeadForm = async (req, res) => {
    try {
        const { name, mobile, email, city, activityType, reason, remarks, projectName, ...rest } = req.body;

        // 1. Resolve/Create Lead
        let lead = await Lead.findOne({ mobile });

        if (!lead) {
            lead = await Lead.create({
                firstName: name.split(' ')[0],
                lastName: name.split(' ').slice(1).join(' '),
                mobile,
                email,
                locCity: city,
                source: await resolveLookup('Source', 'Website'),
                status: await resolveLookup('Status', 'New'),
                stage: await resolveLookup('Stage', 'Lead Created'),
                description: `Captured from website ${activityType || 'Contact'} form.`
            });
        }

        // 2. Prepare Activity Data
        let normalizedType = activityType;
        if (activityType === 'Phone Consultation') normalizedType = 'Call';
        
        // Resolve Project ID if possible
        let projectId = null;
        if (projectName && projectName !== 'General Inquiry') {
            const project = await Project.findOne({ name: { $regex: new RegExp(`^${escapeRegExp(projectName)}$`, 'i') } }).lean();
            if (project) projectId = project._id;
        }

        const activityData = {
            type: normalizedType || 'Meeting',
            subject: `Consultation [${normalizedType}]: ${name} - ${reason || 'General'}`,
            description: remarks || `Website consultation request for ${projectName || 'General Inquiry'}.`,
            status: 'Pending',
            entityType: 'Lead',
            entityId: lead._id,
            dueDate: rest.dueDate || new Date(),
            dueTime: rest.dueTime || '10:00',
            tags: ['Website-Consultation'],
            details: {
                source: 'Website - Professional Consultation',
                projectName: projectName,
                projectId: projectId,
                block: rest.block,
                unitNumber: rest.unitNumber,
            }
        };

        // Enrich details based on type for CRM UI alignment
        if (normalizedType === 'Meeting') {
            activityData.details.meetingType = rest.locationType === 'Virtual' ? 'Virtual' : 'Office';
            activityData.details.meetingLocation = rest.locationAddress || rest.meetingLocation;
            activityData.details.purpose = reason; // Mapped to Agenda
        } else if (normalizedType === 'Site Visit') {
            activityData.details.meetingLocation = rest.locationAddress;
            activityData.details.purpose = reason; // Mapped to Visit Type
            activityData.details.visitedProperties = [{
                project: projectName,
                block: rest.block,
                property: rest.unitNumber,
                result: 'Interested' 
            }];
        } else if (normalizedType === 'Call') {
            activityData.details.purpose = reason; // Mapped to Call Purpose
            activityData.details.callOutcome = 'Scheduled';
        }

        // 3. Create Activity
        const activity = await Activity.create(activityData);

        res.status(201).json({
            success: true,
            message: 'Inquiry received. We will contact you shortly.',
            leadId: lead._id,
            activityId: activity._id
        });
    } catch (error) {
        console.error('Lead submission error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// 6. Fetch Public Settings (Relations, Activity Lookups etc.)
export const getPublicSettings = async (req, res) => {
    try {
        const masterFields = await SystemSetting.findOne({ key: 'masterFields' }).lean();
        const activityFields = await SystemSetting.findOne({ key: 'activityMasterFields' }).lean();
        
        const relations = masterFields?.value?.relations || [];
        const activityMasterFields = activityFields?.value || {};
        
        res.status(200).json({
            success: true,
            data: {
                relations,
                activityMasterFields
            }
        });
    } catch (error) {
        console.error('getPublicSettings error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// 7. Fetch Available Units for Project/Block
export const getAvailableUnits = async (req, res) => {
    try {
        const { project, block } = req.query;
        if (!project) {
            return res.status(400).json({ success: false, message: 'Project is required' });
        }

        const query = { 
            $or: [
                { projectName: project },
                { projectId: mongoose.Types.ObjectId.isValid(project) ? project : undefined }
            ].filter(q => q.projectName || q.projectId)
        };

        if (block) {
            query.block = block;
        }

        // Fetch distinct unit numbers
        const units = await Inventory.find(query)
            .select('unitNo unitNumber size price status')
            .lean();

        // Format units for frontend dropdown
        const formattedUnits = units.map(u => ({
            id: u._id,
            unitNo: u.unitNo || u.unitNumber,
            size: u.size,
            price: u.price,
            status: u.status 
        }));

        res.status(200).json({
            success: true,
            count: formattedUnits.length,
            data: formattedUnits
        });
    } catch (error) {
        console.error('getAvailableUnits error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// 8. Get Google Reviews with 24h Caching
export const getGoogleReviews = async (req, res) => {
    const CACHE_FILE = path.join(__dirname, '../cache/google-reviews.json');
    const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
    const PLACE_ID = 'ChIJKzFpydBGDjkRbTCco1_G2I4';
    const API_KEY = process.env.GOOGLE_PLACES_API_KEY;

    try {
        // 1. Check Cache
        if (fs.existsSync(CACHE_FILE)) {
            const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
            const now = Date.now();
            if (now - cacheData.timestamp < CACHE_TTL) {
                console.log('Serving Google Reviews from cache');
                return res.status(200).json({
                    success: true,
                    source: 'cache',
                    data: cacheData.data
                });
            }
        }

        // 2. Fetch from Google
        if (!API_KEY) {
            throw new Error('Google Places API Key is not configured');
        }

        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${PLACE_ID}&fields=reviews,rating,user_ratings_total&key=${API_KEY}`;
        const response = await axios.get(url);

        if (response.data.status !== 'OK') {
            throw new Error(`Google API Error: ${response.data.status}`);
        }

        const result = response.data.result;
        
        // Normalize reviews to match frontend ReviewCard format
        const normalizedReviews = (result.reviews || []).map((rev, index) => ({
            id: `google-${index}-${rev.time}`,
            name: rev.author_name,
            photo: rev.profile_photo_url,
            rating: rev.rating,
            review: rev.text,
            platform: 'google',
            date: new Date(rev.time * 1000).toISOString().split('T')[0],
            verified: true
        }));

        const finalData = {
            rating: result.rating,
            totalReviews: result.user_ratings_total,
            reviews: normalizedReviews
        };

        // 3. Save to Cache
        const cacheDir = path.dirname(CACHE_FILE);
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        fs.writeFileSync(CACHE_FILE, JSON.stringify({
            timestamp: Date.now(),
            data: finalData
        }));

        res.status(200).json({
            success: true,
            source: 'network',
            data: finalData
        });

    } catch (error) {
        console.error('getGoogleReviews error:', error);
        
        // If API fails but cache exists (even if stale), serve cache as fallback
        if (fs.existsSync(CACHE_FILE)) {
            const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
            console.log('Serving stale cache due to API error');
            return res.status(200).json({
                success: true,
                source: 'stale-cache',
                data: cacheData.data
            });
        }

        res.status(500).json({ success: false, message: error.message });
    }
};
