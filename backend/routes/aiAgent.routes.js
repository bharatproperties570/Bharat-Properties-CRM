import express from 'express';
import {
    getAiAgents,
    getAiAgent,
    createAiAgent,
    updateAiAgent,
    deleteAiAgent
} from '../controllers/aiAgent.controller.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router
    .route('/')
    .get(getAiAgents)
    .post(createAiAgent);

router
    .route('/:id')
    .get(getAiAgent)
    .put(updateAiAgent)
    .delete(deleteAiAgent);

export default router;
