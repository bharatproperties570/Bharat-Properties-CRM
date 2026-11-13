import OwnerOutreachService from '../services/OwnerOutreachService.js';

const service = new OwnerOutreachService();

export const previewOwnerOutreachAudience = async (req, res) => {
    try {
        const result = await service.preview(req.body || {}, req.user);
        return res.json({ success: true, data: result });
    } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
    }
};

export const createOwnerOutreachDraft = async (req, res) => {
    try {
        const result = await service.createDraft(req.body || {}, req.user);
        return res.status(201).json({ success: true, data: result });
    } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
    }
};

export const listOwnerOutreachCampaigns = async (req, res) => {
    try {
        const data = await service.listCampaigns(req.user, req.query.limit);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Unable to load owner outreach campaigns' });
    }
};

export const getOwnerOutreachCampaign = async (req, res) => {
    try {
        const data = await service.getCampaign(req.user, req.params.id);
        if (!data) return res.status(404).json({ success: false, error: 'Campaign not found' });
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Unable to load owner outreach campaign' });
    }
};

export const approveOwnerOutreachCampaign = async (req, res) => {
    try {
        const data = await service.approveCampaign(req.user, req.params.id);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
    }
};

export const pauseOwnerOutreachCampaign = async (req, res) => {
    try {
        const data = await service.pauseCampaign(req.user, req.params.id);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(409).json({ success: false, error: error.message });
    }
};

export const resumeOwnerOutreachCampaign = async (req, res) => {
    try {
        const data = await service.resumeCampaign(req.user, req.params.id);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(409).json({ success: false, error: error.message });
    }
};

export const cancelOwnerOutreachCampaign = async (req, res) => {
    try {
        const data = await service.cancelCampaign(req.user, req.params.id, req.body?.reason);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(409).json({ success: false, error: error.message });
    }
};
