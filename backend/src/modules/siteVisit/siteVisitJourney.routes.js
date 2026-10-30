import express from 'express';
import {
    getJourney,
    recordPropertyNavigation,
    submitPropertyFeedback
} from './siteVisitJourney.controller.js';

const router = express.Router();

// Canonical Public Journey Routes
router.get('/:token', getJourney);
router.post('/:token/navigate/:propertyId', recordPropertyNavigation);
router.post('/:token/feedback/:propertyId', submitPropertyFeedback);

// Backward-Compatibility Aliases
router.post('/:token/properties/:propertyId/navigate', recordPropertyNavigation);
router.post('/:token/property/:propertyId/navigate', recordPropertyNavigation);
router.post('/:token/properties/:propertyId/feedback', submitPropertyFeedback);
router.post('/:token/property/:propertyId/feedback', submitPropertyFeedback);

export default router;
