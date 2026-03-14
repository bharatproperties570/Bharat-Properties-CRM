import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import { globalSearch } from '../controllers/search.controller.js';

const router = express.Router();

router.get('/', protect, globalSearch);

export default router;
