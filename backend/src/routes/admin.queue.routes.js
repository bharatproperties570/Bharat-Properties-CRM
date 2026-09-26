import express from 'express';
import * as QueueManager from '../queues/queueManager.js';
import { protect, authorize } from '../../middleware/auth.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(protect);
router.use(authorize('admin', 'super admin', 'superadmin'));

const getQueueStats = async (queue) => {
    try {
        const [waiting, active, delayed, failed, completed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getDelayedCount(),
            queue.getFailedCount(),
            queue.getCompletedCount()
        ]);
        
        return {
            name: queue.name,
            waiting,
            active,
            delayed,
            failed,
            completed,
            workerHealth: 'unknown' // To be enhanced in future phases if needed
        };
    } catch (err) {
        throw new Error(`Failed to get stats for queue ${queue.name}: ${err.message}`);
    }
};

router.get('/', async (req, res) => {
    try {
        // Collect stats from the 7 C9 queues explicitly defined
        const queues = [
            QueueManager.enrichmentQueue,
            QueueManager.notificationQueue,
            QueueManager.cronQueue,
            QueueManager.googleSyncQueue,
            QueueManager.marketingQueue,
            QueueManager.distributionQueue,
            QueueManager.domainEventQueue
        ];

        const stats = await Promise.all(queues.map(getQueueStats));

        res.json({ success: true, data: stats });
    } catch (err) {
        console.error('[Admin Queue API] Redis unavailable or error fetching stats:', err.message);
        res.status(503).json({ success: false, message: 'Redis unavailable or error fetching queue stats' });
    }
});

export default router;
