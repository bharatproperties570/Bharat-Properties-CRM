import express from 'express';
import { authenticate } from '../src/middlewares/auth.middleware.js';
import {
    getScoringRules,
    createScoringRule,
    updateScoringRule,
    deleteScoringRule
} from '../controllers/scoringRule.controller.js';

const router = express.Router();

router.use(authenticate);

router.route('/')
    .get(getScoringRules)
    .post(createScoringRule);

router.route('/:id')
    .put(updateScoringRule)
    .delete(deleteScoringRule);

export default router;
