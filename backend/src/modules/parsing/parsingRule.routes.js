import express from 'express';
import * as parsingRuleController from './parsingRule.controller.js';
import { protect } from '../../../middleware/auth.js';

const router = express.Router();

// Publicly accessible for rule detection on mobile/web startup
router.get('/', parsingRuleController.getRules);

// Protected mutation routes
router.use(protect);
router.post('/', parsingRuleController.addRule);
router.post('/bulk', parsingRuleController.bulkAddRules);
router.delete('/:id', parsingRuleController.deleteRule);

export default router;
