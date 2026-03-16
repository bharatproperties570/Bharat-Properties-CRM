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

// 1. Fetch all published listings (Deals)
export const getListings = async (req, res) => {
    try {
        const listings = await Deal.find({ isPublished: true })
            .select('projectName block unitNo unitType propertyType size sizeUnit price quotePrice websiteMetadata location status category subCategory documents publishedAt')
            .lean();

        res.status(200).json({
            success: true,
            count: listings.length,
            data: listings
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 2. Fetch all published projects
export const getProjects = async (req, res) => {
    try {
        const projects = await Project.find({ isPublished: true })
            .select('name developerName description category subCategory reraNumber landArea totalUnits status address websiteMetadata projectImages projectVideos launchDate expectedCompletionDate possessionDate blocks amenities pricing')
            .lean();

        res.status(200).json({
            success: true,
            count: projects.length,
            data: projects
        });
    } catch (error) {
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
