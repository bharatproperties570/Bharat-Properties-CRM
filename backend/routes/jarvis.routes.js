import express from 'express';
import { protect } from '../middleware/auth.js';
import {
    handleJarvisCommand,
    confirmJarvisAction,
    cancelJarvisAction,
    getJarvisSession,
    getJarvisHistory,
    getJarvisStatus,
    handleProcessCallIntel,
    getCallIntelligenceList,
    getCallIntelligenceById,
    getDailyBriefingController,
    getProactiveSuggestionsController,
    getJarvisAnalyticsController,
    getTeamPerformanceController,
    processMeetingNotesController,
    handleJarvisSpeak,
    getJarvisVoiceConfig,
    saveJarvisVoiceConfig
} from '../controllers/jarvis.controller.js';

const router = express.Router();

// Protected voice & action endpoints
router.post('/command', protect, handleJarvisCommand);
router.post('/confirm/:actionId', protect, confirmJarvisAction);
router.delete('/confirm/:actionId', protect, cancelJarvisAction);
router.get('/session', protect, getJarvisSession);
router.get('/history', protect, getJarvisHistory);
router.get('/status', protect, getJarvisStatus);

// Voice OS Speech Synthesis & Voice Config
router.post('/speak', protect, handleJarvisSpeak);
router.get('/voice-config', protect, getJarvisVoiceConfig);
router.post('/voice-config', protect, saveJarvisVoiceConfig);

// Phase 3: Call Intelligence Engine Endpoints
router.post('/call-intel', protect, handleProcessCallIntel);
router.get('/call-intel', protect, getCallIntelligenceList);
router.get('/call-intel/:id', protect, getCallIntelligenceById);

// Phase 4: Intelligence, Briefing, Suggestions & Analytics
router.get('/briefing', protect, getDailyBriefingController);
router.get('/suggestions', protect, getProactiveSuggestionsController);
router.get('/analytics', protect, getJarvisAnalyticsController);

// Phase 5: Team Performance & Smart Meeting Dictation
router.get('/team-performance', protect, getTeamPerformanceController);
router.post('/meeting-notes', protect, processMeetingNotesController);

export default router;
