import express from 'express';
import {
    completeActivity,
    completeActivityWithForm,
    recalculateLeadScore
} from './activityCompletion.controller.js';

const router = express.Router();

// Complete an activity → stage transition + scoring pipeline
router.post('/:id/complete',           completeActivity);

// Phase 2: Submit required fields form and finalize stage transition
router.post('/:id/complete-with-form', completeActivityWithForm);

// Manual score recalculation for a lead
router.post('/leads/:leadId/recalculate-score', recalculateLeadScore);

export default router;
