import Conversation from '../models/Conversation.js';

import { getVisibilityFilter } from '../utils/visibility.js';
import Lead from '../models/Lead.js';
import Contact from '../models/Contact.js';

const getSecureConversations = async (baseQuery, req, populateConfigs, sortConfig, limitNum) => {
    const visibilityFilter = await getVisibilityFilter(req.user);
    
    // Admin / All scope bypass
    if (Object.keys(visibilityFilter).length === 0) {
        let q = Conversation.find(baseQuery);
        for (const p of populateConfigs) q = q.populate(p.path, p.select);
        return await q.sort(sortConfig).limit(limitNum);
    }
    
    // 1. Fetch IDs of active conversations
    const convos = await Conversation.find(baseQuery, 'lead contact').lean();
    const leadIds = convos.map(c => c.lead).filter(Boolean);
    const contactIds = convos.map(c => c.contact).filter(Boolean);
    
    let allowedLeadIds = [];
    let allowedContactIds = [];
    
    // 2. Filter IDs through visibility check
    if (leadIds.length > 0) {
        const allowedLeads = await Lead.find({ _id: { $in: leadIds }, ...visibilityFilter }, '_id').lean();
        allowedLeadIds = allowedLeads.map(l => l._id);
    }
    
    if (contactIds.length > 0) {
        const allowedContacts = await Contact.find({ _id: { $in: contactIds }, ...visibilityFilter }, '_id').lean();
        allowedContactIds = allowedContacts.map(c => c._id);
    }
    
    // 3. Final secure query
    const secureQuery = {
        ...baseQuery,
        $or: [
            { lead: { $in: allowedLeadIds } },
            { contact: { $in: allowedContactIds } }
        ]
    };
    
    if (allowedLeadIds.length === 0 && allowedContactIds.length === 0) {
        return [];
    }
    
    let q = Conversation.find(secureQuery);
    for (const p of populateConfigs) q = q.populate(p.path, p.select);
    return await q.sort(sortConfig).limit(limitNum);
};



export const getActiveConversations = async (req, res) => {
    try {
        const conversations = await getSecureConversations(
            { status: 'active' },
            req,
            [{ path: 'lead', select: 'firstName lastName intent_index customFields' }],
            { updatedAt: -1 },
            50
        );
            
        res.status(200).json({ success: true, data: conversations });
    } catch (error) {
        console.error("Failed to fetch active conversations:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

export const updateConversationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const conversation = await Conversation.findByIdAndUpdate(
            id, 
            { status }, 
            { new: true }
        );
        
        if (!conversation) {
            return res.status(404).json({ success: false, message: "Conversation not found" });
        }
        
        res.status(200).json({ success: true, data: conversation });
    } catch (error) {
        console.error("Failed to update conversation:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

export const getUnreadConversations = async (req, res) => {
    try {
        const conversations = await getSecureConversations(
            { status: 'active', 'metadata.unreadCount': { $gt: 0 } },
            req,
            [
                { path: 'lead', select: 'firstName lastName mobile' },
                { path: 'contact', select: 'name phones' }
            ],
            { 'metadata.lastMessageAt': -1, updatedAt: -1 },
            20
        );
            
        res.status(200).json({ success: true, data: conversations });
    } catch (error) {
        console.error("Failed to fetch unread conversations:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

export const markConversationAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const conversation = await Conversation.findByIdAndUpdate(
            id,
            { $set: { 'metadata.unreadCount': 0 } },
            { new: true }
        );
        
        if (!conversation) {
            return res.status(404).json({ success: false, message: "Conversation not found" });
        }
        
        res.status(200).json({ success: true, data: conversation });
    } catch (error) {
        console.error("Failed to mark conversation as read:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};
