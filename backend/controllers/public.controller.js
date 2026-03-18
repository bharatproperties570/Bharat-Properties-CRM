import Deal from "../models/Deal.js";
import Project from "../models/Project.js";
import Contact from "../models/Contact.js";
import Lead from "../models/Lead.js";
import Activity from "../models/Activity.js";
import Lookup from "../models/Lookup.js";
import mongoose from "mongoose";

const resolveLookup = async (type, value) => {
    if (!value) return null;
    if (mongoose.Types.ObjectId.isValid(value)) return value;
    const escapedValue = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
        
        // City Filtering
        if (cityName) {
            query['location'] = { $regex: new RegExp(cityName, 'i') };
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

        // City Filtering
        if (cityName) {
            query['$or'] = [
                { 'address.city': { $regex: new RegExp(cityName, 'i') } },
                { 'locationSearch': { $regex: new RegExp(cityName, 'i') } }
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

        // 2. Create Deal (Pending Verification)
        const dealData = {
            projectName: propertyData.project,
            block: propertyData.block,
            unitNo: propertyData.unitNo,
            priceDetails: { totalAmount: propertyData.expectedPrice },
            propertyDetails: {
                area: propertyData.totalArea,
                areaUnit: propertyData.areaUnit,
                type: await resolveLookup('PropertyType', propertyData.type === 'calculated' ? 'Residential' : propertyData.type)
            },
            status: 'Pending Verification',
            description: propertyData.remarks,
            owner: contactRecord._id,
            isPublished: false
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

// 5. Submit Lead Form (Website -> CRM Lead)
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

        // 2. Create Activity
        const activity = await Activity.create({
            type: activityType || 'Note',
            subject: `${activityType || 'Website Inquiry'}: ${reason || 'General'}`,
            description: remarks || `Website submission for ${projectName || 'General Inquiry'}. Full data: ${JSON.stringify(rest)}`,
            status: 'Pending',
            entityType: 'Lead',
            entityId: lead._id,
            dueDate: rest.dueDate || new Date(),
            dueTime: rest.dueTime
        });

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
