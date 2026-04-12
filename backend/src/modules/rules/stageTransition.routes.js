import express from 'express';
import {
    getStageTransitionRules,
    saveStageTransitionRules,
    addStageTransitionRule,
    updateStageTransitionRule,
    deleteStageTransitionRule,
    seedDefaultRules
} from './stageTransition.controller.js';
import { authenticate } from "../../../src/middlewares/auth.middleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

router.get('/',            getStageTransitionRules);
router.post('/',           saveStageTransitionRules);
router.post('/add',        addStageTransitionRule);
router.post('/seed',       seedDefaultRules);
router.put('/:ruleId',    updateStageTransitionRule);
router.delete('/:ruleId', deleteStageTransitionRule);

export default router;
