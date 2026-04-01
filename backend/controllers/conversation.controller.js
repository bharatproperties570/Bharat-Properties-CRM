import Conversation from '../models/Conversation.js';

export const getActiveConversations = async (req, res) => {
    try {
        const conversations = await Conversation.find({ status: 'active' })
            .populate('lead', 'firstName lastName intent_index customFields')
            .sort({ updatedAt: -1 })
            .limit(50);
            
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
