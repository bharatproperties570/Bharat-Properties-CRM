import express from 'express';
import { getActiveConversations, updateConversationStatus } from '../controllers/conversation.controller.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect); // Ensure all dashboard calls are authenticated

router.get('/active', getActiveConversations);
router.patch('/:id/status', updateConversationStatus);

export default router;
