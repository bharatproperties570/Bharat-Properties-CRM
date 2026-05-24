import AiAgent from "./aiAgent.model.js";

export const getAllAgents = async (req, res, next) => {
    try {
        const agents = await AiAgent.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: agents });
    } catch (error) {
        next(error);
    }
};

export const getAgentById = async (req, res, next) => {
    try {
        const agent = await AiAgent.findById(req.params.id);
        if (!agent) return res.status(404).json({ success: false, message: "Agent not found" });
        res.status(200).json({ success: true, data: agent });
    } catch (error) {
        next(error);
    }
};

export const createAgent = async (req, res, next) => {
    try {
        const agent = await AiAgent.create(req.body);
        res.status(201).json({ success: true, data: agent });
    } catch (error) {
        next(error);
    }
};

export const updateAgent = async (req, res, next) => {
    try {
        const agent = await AiAgent.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!agent) return res.status(404).json({ success: false, message: "Agent not found" });
        res.status(200).json({ success: true, data: agent });
    } catch (error) {
        next(error);
    }
};

export const deleteAgent = async (req, res, next) => {
    try {
        const agent = await AiAgent.findByIdAndDelete(req.params.id);
        if (!agent) return res.status(404).json({ success: false, message: "Agent not found" });
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        next(error);
    }
};
