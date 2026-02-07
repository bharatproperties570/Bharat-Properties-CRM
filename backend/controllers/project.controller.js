import Project from "../models/Project.js";

export const getProjects = async (req, res) => {
    try {
        const projects = await Project.find().lean();
        res.json({ success: true, data: projects });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const addProject = async (req, res) => {
    try {
        const project = await Project.create(req.body);
        res.json({ success: true, data: project });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updateProject = async (req, res) => {
    try {
        const project = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!project) return res.status(404).json({ success: false, error: "Project not found" });
        res.json({ success: true, data: project });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const deleteProject = async (req, res) => {
    try {
        const project = await Project.findByIdAndDelete(req.params.id);
        if (!project) return res.status(404).json({ success: false, error: "Project not found" });
        res.json({ success: true, message: "Project deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
