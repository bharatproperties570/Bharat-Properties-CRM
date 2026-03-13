import express from 'express';
import {
    getStageTransitionRules,
    saveStageTransitionRules,
    addStageTransitionRule,
    updateStageTransitionRule,
    deleteStageTransitionRule,
    seedDefaultRules
} from './stageTransition.controller.js';

const router = express.Router();

router.get('/',            getStageTransitionRules);
router.post('/',           saveStageTransitionRules);
router.post('/add',        addStageTransitionRule);
router.post('/seed',       seedDefaultRules);
router.put('/:ruleId',    updateStageTransitionRule);
router.delete('/:ruleId', deleteStageTransitionRule);

export default router;
