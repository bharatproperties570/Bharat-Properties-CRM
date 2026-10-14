import mongoose from 'mongoose';
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
            50
        );

        // Strict enterprise check: A conversation is only truly unread if the LAST message was from the customer (role === 'user')
        const trulyUnread = [];
        const staleIdsToHeal = [];

        for (const c of conversations) {
            const msgs = c.messages || [];
            if (msgs.length === 0) {
                staleIdsToHeal.push(c._id);
                continue;
            }
            const lastMsg = msgs[msgs.length - 1];
            if (lastMsg && lastMsg.role === 'user') {
                trulyUnread.push(c);
            } else {
                // Outbound reply was already sent by agent/bot, so clear unreadCount
                staleIdsToHeal.push(c._id);
            }
        }

        // Auto-heal stale unread counts in background
        if (staleIdsToHeal.length > 0) {
            Conversation.updateMany(
                { _id: { $in: staleIdsToHeal } },
                { $set: { 'metadata.unreadCount': 0 } },
                { timestamps: false }
            ).catch(err => console.warn('[ConversationController] Auto-heal error:', err.message));
        }

        // Enrich group metadata so notifications and clients always have proper groupName
        const enrichedUnread = [];
        for (const c of trulyUnread) {
            const cObj = c.toObject ? c.toObject() : { ...c };
            const isGroup = Boolean(
                cObj.isGroup || 
                cObj.metadata?.isGroup || 
                (cObj.phoneNumber && String(cObj.phoneNumber).includes('@g.us'))
            );

            if (isGroup) {
                cObj.isGroup = true;
                let resolvedGroupName = cObj.groupName || cObj.metadata?.groupName;

                if (!resolvedGroupName || resolvedGroupName.includes('@g.us')) {
                    const lastMsg = cObj.messages?.[cObj.messages.length - 1];
                    if (lastMsg?.metadata?.groupName && !lastMsg.metadata.groupName.includes('@g.us')) {
                        resolvedGroupName = lastMsg.metadata.groupName;
                    } else {
                        const anyMsgWithGrp = (cObj.messages || []).slice().reverse().find(m => m.metadata?.groupName && !m.metadata.groupName.includes('@g.us'));
                        if (anyMsgWithGrp) resolvedGroupName = anyMsgWithGrp.metadata.groupName;
                    }
                }

                if (!resolvedGroupName || resolvedGroupName.includes('@g.us')) {
                    try {
                        const { default: BaileysConnectionManager } = await import('../services/baileysQueue/BaileysConnectionManager.js');
                        const cached = BaileysConnectionManager.getGroupSubject(cObj.phoneNumber);
                        if (cached) resolvedGroupName = cached;
                    } catch (e) {}
                }

                if ((!resolvedGroupName || resolvedGroupName.includes('@g.us')) && cObj.title && !cObj.title.includes('@g.us')) {
                    resolvedGroupName = cObj.title;
                }

                if (resolvedGroupName && !resolvedGroupName.includes('@g.us')) {
                    cObj.groupName = resolvedGroupName;
                    if (!cObj.metadata) cObj.metadata = {};
                    cObj.metadata.groupName = resolvedGroupName;

                    // Asynchronously heal the Conversation document
                    Conversation.updateOne(
                        { _id: c._id },
                        { 
                            $set: { 
                                isGroup: true, 
                                groupName: resolvedGroupName, 
                                groupJid: cObj.phoneNumber,
                                title: resolvedGroupName,
                                'metadata.isGroup': true,
                                'metadata.groupName': resolvedGroupName 
                            } 
                        }
                    ).catch(() => {});
                } else {
                    cObj.groupName = 'WhatsApp Group';
                }
            }

            enrichedUnread.push(cObj);
        }
            
        res.status(200).json({ success: true, data: enrichedUnread });
    } catch (error) {
        console.error("Failed to fetch unread conversations:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

export const markConversationAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(200).json({ success: true, message: "No conversation identifier provided" });
        }

        const isObjId = mongoose.Types.ObjectId.isValid(id);
        const isGroup = String(id).includes('@g.us');
        
        let query;
        if (isObjId) {
            query = { _id: id };
        } else if (isGroup) {
            query = {
                $or: [
                    { phoneNumber: id },
                    { 'metadata.groupJid': id },
                    { 'metadata.sessionId': id }
                ]
            };
        } else {
            const cleanDigits = String(id).replace(/\D/g, '');
            const cleanPhone10 = cleanDigits.slice(-10);
            const phoneVariants = [id];
            if (cleanDigits) phoneVariants.push(cleanDigits);
            if (cleanPhone10 && cleanPhone10.length === 10) {
                phoneVariants.push(cleanPhone10, '+91' + cleanPhone10, '91' + cleanPhone10, '0' + cleanPhone10);
            }
            query = {
                $or: [
                    { phoneNumber: { $in: phoneVariants } },
                    ...(cleanPhone10.length === 10 ? [{ phoneNumber: { $regex: cleanPhone10 + '$' } }] : []),
                    { 'metadata.sessionId': id }
                ]
            };
        }

        const conversation = await Conversation.findOneAndUpdate(
            query,
            { $set: { 'metadata.unreadCount': 0 } },
            { new: true, timestamps: false }
        );
        
        // 🛡️ Enterprise Strategy: Marking as read is idempotent. If no conversation document exists yet,
        // it means 0 unread messages exist. Return 200 OK gracefully to prevent false 404 UI error toasts.
        return res.status(200).json({ 
            success: true, 
            message: conversation ? "Conversation marked as read" : "Already read or no conversation to update", 
            data: conversation || null 
        });
    } catch (error) {
        console.error("Failed to mark conversation as read:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

