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
        const activity = await SiteVisitService.getById(id, req.user);
        return res.status(200).json({
            success: true,
            data: activity
        });
    } catch (err) {
        const status = err.message.includes('Authorization failed') ? 403 : (err.message.includes('not found') ? 404 : 400);
        return res.status(status).json({
            success: false,
            message: err.message
        });
    }
};

export const listSiteVisits = async (req, res) => {
    try {
        const result = await SiteVisitService.list(req.query, req.user);
        return res.status(200).json({
            success: true,
            data: result.items,
            pagination: result.pagination
        });
    } catch (err) {
        const status = err.message.includes('Authorization failed') ? 403 : 400;
        return res.status(status).json({
            success: false,
            message: err.message
        });
    }
};

export const getSiteVisitJourneyLink = async (req, res) => {
    try {
        const { id } = req.params;
        const options = {
            rotate: req.query.rotate === 'true' || req.body?.rotate === true,
            rotationReason: req.query.reason || req.body?.reason
        };
        const result = await SiteVisitService.getJourneyLink(id, req.user, options);
        return res.status(200).json({
            success: true,
            data: result
        });
    } catch (err) {
        const status = err.statusCode || (err.message.includes('Authorization failed') ? 403 : (err.message.includes('not found') ? 404 : 400));
        return res.status(status).json({
            success: false,
            message: err.message
        });
    }
};

export const rotateSiteVisitJourneyLink = async (req, res) => {
    try {
        const { id } = req.params;
        const options = {
            rotate: true,
            rotationReason: req.body?.reason || 'Explicit rotation requested by CRM user'
        };
        const result = await SiteVisitService.getJourneyLink(id, req.user, options);
        return res.status(200).json({
            success: true,
            data: result,
            message: 'Journey link rotated successfully. Old link has been invalidated.'
        });
    } catch (err) {
        const status = err.statusCode || (err.message.includes('Authorization failed') ? 403 : (err.message.includes('not found') ? 404 : 400));
        return res.status(status).json({
            success: false,
            message: err.message
        });
    }
};

export const revokeSiteVisitJourneyLink = async (req, res) => {
    try {
        const { id } = req.params;
        const reason = req.body?.reason || 'Revoked by CRM administrator';
        const result = await SiteVisitService.revokeJourneyLink(id, reason, req.user);
        return res.status(200).json({
            success: true,
            data: result,
            message: 'Journey link revoked successfully.'
        });
    } catch (err) {
        const status = err.statusCode || (err.message.includes('Authorization failed') ? 403 : (err.message.includes('not found') ? 404 : 400));
        return res.status(status).json({
            success: false,
            message: err.message
        });
    }
};

export const resendSiteVisitJourney = async (req, res) => {
    try {
        const { id } = req.params;
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Authorize access and tenant scope using canonical SiteVisitService contract
        const { SiteVisitService } = await import('./siteVisit.service.js');
        const activity = await SiteVisitService.getById(id, req.user);
        if (!activity) {
            return res.status(404).json({
                success: false,
                message: 'Site visit not found'
            });
        }

        if (activity.status === 'Cancelled') {
            return res.status(410).json({
                success: false,
                message: 'Cannot resend journey template for cancelled visit'
            });
        }

        if (activity.status === 'Completed') {
            return res.status(400).json({
                success: false,
                message: 'Cannot resend journey template for completed visit'
            });
        }

        const { SiteVisitConfirmationService } = await import('./siteVisitConfirmation.service.js');
        const result = await SiteVisitConfirmationService.resendJourneyTemplate(activity, req.user, {
            force: true,
            reason: req.body?.reason || 'Manual resend requested by CRM staff'
        });

        return res.status(200).json({
            success: result.success,
            data: result,
            message: result.success
                ? 'Site Visit Journey template dispatched successfully to customer WhatsApp.'
                : `Journey template dispatch failed: ${result.error || 'Pending Meta approval'}`
        });
    } catch (err) {
        const status = err.statusCode || (
            err.message.includes('Authorization failed') || err.message.includes('Access denied') ? 403 :
            err.message.includes('not found') ? 404 :
            err.message.includes('cancelled') ? 410 : 400
        );
        return res.status(status).json({
            success: false,
            message: err.message
        });
    }
};
