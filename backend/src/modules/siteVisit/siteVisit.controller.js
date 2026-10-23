import SiteVisitService from './siteVisit.service.js';

export const scheduleSiteVisit = async (req, res) => {
    try {
        const result = await SiteVisitService.schedule(req.body, req.user);
        const statusCode = result.alreadyScheduled ? 200 : 201;
        return res.status(statusCode).json({
            success: true,
            data: result.activity,
            alreadyScheduled: result.alreadyScheduled,
            message: result.message
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
};

export const rescheduleSiteVisit = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await SiteVisitService.reschedule(id, req.body, req.user);
        return res.status(200).json({
            success: true,
            data: result.activity,
            message: result.message
        });
    } catch (err) {
        const status = err.message.includes('not found') ? 404 : 400;
        return res.status(status).json({
            success: false,
            message: err.message
        });
    }
};

export const cancelSiteVisit = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await SiteVisitService.cancel(id, req.body, req.user);
        return res.status(200).json({
            success: true,
            data: result.activity,
            message: result.message
        });
    } catch (err) {
        const status = err.message.includes('not found') ? 404 : 400;
        return res.status(status).json({
            success: false,
            message: err.message
        });
    }
};

export const completeSiteVisit = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await SiteVisitService.complete(id, req.body, req.user);
        return res.status(200).json({
            success: true,
            data: result.activity,
            stageTransition: result.stageTransition,
            feedbackDispatch: result.feedbackDispatch,
            message: result.message
        });
    } catch (err) {
        const status = err.message.includes('not found') ? 404 : 400;
        return res.status(status).json({
            success: false,
            message: err.message
        });
    }
};

export const getSiteVisit = async (req, res) => {
    try {
        const { id } = req.params;
        const activity = await SiteVisitService.getById(id);
        return res.status(200).json({
            success: true,
            data: activity
        });
    } catch (err) {
        const status = err.message.includes('not found') ? 404 : 400;
        return res.status(status).json({
            success: false,
            message: err.message
        });
    }
};

export const listSiteVisits = async (req, res) => {
    try {
        const result = await SiteVisitService.list(req.query);
        return res.status(200).json({
            success: true,
            data: result.items,
            pagination: result.pagination
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
};
