import { SiteVisitJourneyService } from './siteVisitJourney.service.js';

export const getJourney = async (req, res) => {
    try {
        const rawToken = req.params.token || req.query.token || req.query.ref || req.headers['x-journey-token'];
        if (!rawToken) {
            return res.status(400).json({ success: false, message: 'Journey token is required' });
        }

        const { activity } = await SiteVisitJourneyService.verifyJourneyToken(rawToken);
        const itinerary = await SiteVisitJourneyService.getSanitizedItinerary(activity);

        return res.status(200).json({
            success: true,
            data: itinerary
        });
    } catch (err) {
        const status = err.statusCode || 500;
        return res.status(status).json({
            success: false,
            message: err.message || 'Failed to load site visit journey'
        });
    }
};

export const recordPropertyNavigation = async (req, res) => {
    try {
        const rawToken = req.params.token || req.query.token || req.query.ref || req.headers['x-journey-token'];
        const propertyId = req.params.propertyId;

        if (!rawToken || !propertyId) {
            return res.status(400).json({ success: false, message: 'Token and property identifier are required' });
        }

        const { activity } = await SiteVisitJourneyService.verifyJourneyToken(rawToken);
        const result = await SiteVisitJourneyService.recordNavigation(activity._id, propertyId);

        return res.status(200).json({
            success: true,
            data: result
        });
    } catch (err) {
        const status = err.statusCode || 500;
        return res.status(status).json({
            success: false,
            message: err.message || 'Failed to record property navigation'
        });
    }
};

export const submitPropertyFeedback = async (req, res) => {
    try {
        const rawToken = req.params.token || req.query.token || req.query.ref || req.headers['x-journey-token'];
        const propertyId = req.params.propertyId;

        if (!rawToken || !propertyId) {
            return res.status(400).json({ success: false, message: 'Token and property identifier are required' });
        }

        const { activity } = await SiteVisitJourneyService.verifyJourneyToken(rawToken);

        const sourceMeta = {
            ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
            userAgent: req.headers['user-agent']
        };

        const result = await SiteVisitJourneyService.submitPropertyFeedback(
            activity._id,
            propertyId,
            req.body || {},
            { sourceMeta }
        );

        const httpStatus = result.duplicate ? 200 : 201;
        return res.status(httpStatus).json({
            success: true,
            ...result
        });
    } catch (err) {
        const status = err.statusCode || 500;
        return res.status(status).json({
            success: false,
            message: err.message || 'Failed to submit property feedback'
        });
    }
};
