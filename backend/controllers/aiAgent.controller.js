import AiAgent from '../models/AiAgent.js';

// @desc    Get all AI Agents
// @route   GET /api/settings/ai-agents
// @access  Private/Admin
export const getAiAgents = async (req, res, next) => {
    try {
        const agents = await AiAgent.find().populate('createdBy', 'name email').sort('-createdAt');
        res.status(200).json({ success: true, count: agents.length, data: agents });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get single AI Agent
// @route   GET /api/settings/ai-agents/:id
// @access  Private/Admin
export const getAiAgent = async (req, res, next) => {
    try {
        const agent = await AiAgent.findById(req.params.id).populate('createdBy', 'name email');
        if (!agent) {
            return res.status(404).json({ success: false, message: `AI Agent not found with id of ${req.params.id}` });
        }
        res.status(200).json({ success: true, data: agent });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create new AI Agent
// @route   POST /api/settings/ai-agents
// @access  Private/Admin
export const createAiAgent = async (req, res, next) => {
    try {
        const agentData = {
            ...req.body,
            createdBy: req.user.id
        };
        const agent = await AiAgent.create(agentData);
        res.status(201).json({ success: true, data: agent });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Update AI Agent
// @route   PUT /api/settings/ai-agents/:id
// @access  Private/Admin
export const updateAiAgent = async (req, res, next) => {
    try {
        let agent = await AiAgent.findById(req.params.id);
        if (!agent) {
            return res.status(404).json({ success: false, message: `AI Agent not found with id of ${req.params.id}` });
        }
        agent = await AiAgent.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });
        res.status(200).json({ success: true, data: agent });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Delete AI Agent
// @route   DELETE /api/settings/ai-agents/:id
// @access  Private/Admin
export const deleteAiAgent = async (req, res, next) => {
    try {
        const agent = await AiAgent.findById(req.params.id);
        if (!agent) {
            return res.status(404).json({ success: false, message: `AI Agent not found with id of ${req.params.id}` });
        }
        await AiAgent.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
