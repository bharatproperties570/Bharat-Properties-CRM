import express from 'express';
import {
    scheduleSiteVisit,
    rescheduleSiteVisit,
    cancelSiteVisit,
    completeSiteVisit,
    getSiteVisit,
    listSiteVisits
} from './siteVisit.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticate);

router.post('/', scheduleSiteVisit);
router.get('/', listSiteVisits);
router.get('/:id', getSiteVisit);
router.post('/:id/reschedule', rescheduleSiteVisit);
router.post('/:id/cancel', cancelSiteVisit);
router.post('/:id/complete', completeSiteVisit);

export default router;
