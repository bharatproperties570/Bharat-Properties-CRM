import express from 'express';
import * as parsingRuleController from './parsingRule.controller.js';
import { protect } from '../../../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/', parsingRuleController.getRules);
router.post('/', parsingRuleController.addRule);
router.post('/bulk', parsingRuleController.bulkAddRules);
router.delete('/:id', parsingRuleController.deleteRule);

export default router;
