import DynamicForm from "../models/DynamicForm.js";
import DynamicFormSubmission from "../models/DynamicFormSubmission.js";
import Lead from "../models/Lead.js";
import slugify from "slugify";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

export const resolveToken = async (req, res, next) => {
    try {
        const { token } = req.params;
        if (!token) return res.status(400).json({ success: false, message: "No token provided" });

        // Meta WhatsApp doesn't allow dots in URL variables, so we encode them as dashes
        const normalizedToken = token.includes("-") ? token.replace(/-/g, ".") : token;
        
        // In a real professional setup, we verify the JWT. 
        // For simplicity and resilience, we'll try to decode it.
        const decoded = jwt.verify(normalizedToken, process.env.JWT_SECRET || 'crm_secret_key');
        
        if (!decoded || !decoded.leadId) {
            return res.status(400).json({ success: false, message: "Invalid token" });
        }

        const lead = await Lead.findById(decoded.leadId)
            .select('firstName lastName mobile email requirement budget location sector')
            .lean();

        if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

        // Add matched property context if present in token
        const context = {
            lead,
            matchedProject: decoded.projectId || null,
            properties: decoded.properties || [],
            hidePrice: decoded.hidePrice || false,
            hideUnit: decoded.hideUnit || false,
            hideLocation: decoded.hideLocation || false
        };

        res.json({ success: true, data: context });
    } catch (error) {
        console.error("[TOKEN RESOLVE ERROR]:", error);
        res.status(400).json({ success: false, message: "Token expired or invalid" });
    }
};

export const getDynamicOptions = async (req, res, next) => {
    try {
        const { source } = req.params;
        let options = [];

        if (source === 'projects') {
            const Project = mongoose.model('Project');
            // User requested to show ALL projects in the Site Visit dropdown, not just published ones
            const projects = await Project.find({}).select('name projectName').lean();
            options = projects.map(p => p.name || p.projectName);
        } else if (source === 'users') {
            const User = mongoose.model('User');
            const users = await User.find({ status: 'Active' }).select('name').lean();
            options = users.map(u => u.name);
        }

        res.json({ success: true, data: options });
    } catch (error) {
        next(error);
    }
};

export const createForm = async (req, res) => {
    try {
        const { name, category, sections, settings, description } = req.body;
        const slug = slugify(name, { lower: true, strict: true }) + "-" + Math.random().toString(36).substring(2, 7);
        
        const form = new DynamicForm({
            name,
            slug,
            category,
            sections,
            settings,
            description
        });
        
        await form.save();
        res.status(201).json({ success: true, data: form });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

export const getForms = async (req, res) => {
    try {
        const { category } = req.query;
        const query = category ? { category } : {};
        const forms = await DynamicForm.find(query).sort({ createdAt: -1 });
        res.json({ success: true, data: forms });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

export const getFormBySlug = async (req, res) => {
    try {
        const form = await DynamicForm.findOne({ slug: req.params.slug });
        if (!form) return res.status(404).json({ success: false, error: "Form not found" });
        
        // Increment views
        form.analytics.views += 1;
        await form.save();
        
        res.json({ success: true, data: form });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

export const updateForm = async (req, res) => {
    try {
        const form = await DynamicForm.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, data: form });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

export const deleteForm = async (req, res) => {
    try {
        await DynamicForm.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Form deleted" });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

export const submitForm = async (req, res) => {
    try {
        const form = await DynamicForm.findOne({ slug: req.params.slug });
        if (!form) return res.status(404).json({ success: false, error: "Form not found" });
        
        const submission = new DynamicFormSubmission({
            formId: form._id,
            data: req.body.data,
            metadata: {
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                referrer: req.headers.referrer
            }
        });
        
        await submission.save();
        
        // Update analytics
        form.analytics.submissions += 1;
        await form.save();
        
        res.json({ success: true, message: "Submitted successfully" });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};
