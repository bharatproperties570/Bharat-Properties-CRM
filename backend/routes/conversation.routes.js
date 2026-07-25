import express from 'express';
import { getActiveConversations, updateConversationStatus, getUnreadConversations, markConversationAsRead } from '../controllers/conversation.controller.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect); // Ensure all dashboard calls are authenticated

router.get('/active', getActiveConversations);
router.get('/unread', getUnreadConversations);
router.patch('/:id/status', updateConversationStatus);
router.patch('/:id/read', markConversationAsRead);

export default router;
