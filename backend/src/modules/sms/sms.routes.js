import express from 'express';
import {
    getSmsProviders,
    upsertSmsProvider,
    activateSmsProvider,
    testSmsConnection,
    getSmsTemplates,
    upsertSmsTemplate,
    deleteSmsTemplate,
    getSmsLogs,
    sendSms,
    getActiveProviderStatus
} from './sms.controller.js';

const router = express.Router();

router.get('/status', getActiveProviderStatus);

// Configuration
router.get('/', getSmsProviders);
router.post('/config', upsertSmsProvider);
router.patch('/activate/:provider', activateSmsProvider);
router.post('/test', testSmsConnection);
router.post('/send', sendSms);

// Templates
router.get('/templates', getSmsTemplates);
router.post('/templates', upsertSmsTemplate);
router.delete('/templates/:id', deleteSmsTemplate);

// Logs
router.get('/logs', getSmsLogs);

export default router;
