import express from 'express';
import { protect } from '../middleware/auth.js';
import { getSalesGoals, setSalesGoal, getSalesUsers } from '../controllers/salesGoal.controller.js';

const router = express.Router();

router.use(protect);

router.get('/', getSalesGoals);
router.post('/', setSalesGoal);
router.get('/users', getSalesUsers);

export default router;
