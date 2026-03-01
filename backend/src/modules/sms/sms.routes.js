import express from 'express';
import {
    getSmsProviders,
    upsertSmsProvider,
    activateSmsProvider,
    testSmsConnection,
    getSmsTemplates,
    upsertSmsTemplate,
    deleteSmsTemplate,
    getSmsLogs
} from './sms.controller.js';

const router = express.Router();

// Configuration
router.get('/', getSmsProviders);
router.post('/config', upsertSmsProvider);
router.patch('/activate/:provider', activateSmsProvider);
router.post('/test', testSmsConnection);

// Templates
router.get('/templates', getSmsTemplates);
router.post('/templates', upsertSmsTemplate);
router.delete('/templates/:id', deleteSmsTemplate);

// Logs
router.get('/logs', getSmsLogs);

export default router;
