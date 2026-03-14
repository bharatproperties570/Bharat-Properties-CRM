import express from 'express';
import { protect } from '../middleware/auth.js';
import { 
    getNotificationSettings, 
    updateNotificationSettings, 
    addPersonalizedRule 
} from '../controllers/notificationSetting.controller.js';

const router = express.Router();

router.use(protect);

router.get('/', getNotificationSettings);
router.put('/', updateNotificationSettings);
router.post('/personalized', addPersonalizedRule);

export default router;
