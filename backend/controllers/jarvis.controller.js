import JarvisService from '../services/JarvisService.js';
import JarvisCommand from '../models/JarvisCommand.js';

/**
 * POST /api/jarvis/command
 * Primary voice / text command processor
 */
export const handleJarvisCommand = async (req, res) => {
    try {
        const { transcript, inputType, sessionId, source, deviceInfo } = req.body;

        if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Command transcript is required'
            });
        }

        const result = await JarvisService.processCommand(req.user, {
            transcript,
            inputType: inputType || 'voice',
            sessionId,
            source: source || 'web',
            deviceInfo
        });

        return res.json(result);
    } catch (error) {
        console.error('[JarvisController] Error handling command:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error while processing Jarvis command',
            error: error.message
        });
    }
};

/**
 * POST /api/jarvis/confirm/:actionId
 * Confirm and execute a pending Tier 2 action
 */
export const confirmJarvisAction = async (req, res) => {
    try {
        const { actionId } = req.params;
        if (!actionId) {
            return res.status(400).json({ success: false, message: 'Action ID is required' });
        }

        const result = await JarvisService.confirmAction(req.user, actionId);
        return res.json(result);
    } catch (error) {
        console.error('[JarvisController] Error confirming action:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to confirm action',
            error: error.message
        });
    }
};

/**
 * DELETE /api/jarvis/confirm/:actionId
 * Cancel a pending Tier 2 action
 */
export const cancelJarvisAction = async (req, res) => {
    try {
        const { actionId } = req.params;
        if (!actionId) {
            return res.status(400).json({ success: false, message: 'Action ID is required' });
        }

        const result = await JarvisService.cancelAction(req.user, actionId);
        return res.json(result);
    } catch (error) {
        console.error('[JarvisController] Error cancelling action:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to cancel action',
            error: error.message
        });
    }
};

/**
 * GET /api/jarvis/session
 * Get recent session context (last 10 commands memory)
 */
export const getJarvisSession = async (req, res) => {
    try {
        const userId = req.user?._id;
        const sessionId = req.query.sessionId;

        const query = { userId };
        if (sessionId) query.sessionId = sessionId;

        const sessionCommands = await JarvisCommand.find(query)
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        const pendingAction = await JarvisCommand.findOne({
            userId,
            status: 'pending_confirmation'
        }).sort({ createdAt: -1 }).lean();

        return res.json({
            success: true,
            commands: sessionCommands,
            pendingAction: pendingAction || null
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * GET /api/jarvis/history
 * Fetch recent voice commands executed by user
 */
export const getJarvisHistory = async (req, res) => {
    try {
        const userId = req.user?._id;
        const limit = Math.min(Number(req.query.limit) || 20, 50);

        const history = await JarvisCommand.find({ userId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        return res.json({
            success: true,
            data: history
        });
    } catch (error) {
        console.error('[JarvisController] Error fetching history:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch command history',
            error: error.message
        });
    }
};

/**
 * GET /api/jarvis/status
 * Health check & capabilities for Jarvis
 */
export const getJarvisStatus = async (req, res) => {
    try {
        const totalCommands = await JarvisCommand.countDocuments({ userId: req.user?._id });

        return res.json({
            success: true,
            status: 'online',
            model: 'gemini-flash-lite-latest',
            provider: 'google-genai',
            user: {
                name: req.user?.name,
                email: req.user?.email,
                role: req.user?.role?.name || 'User'
            },
            totalCommandsExecuted: totalCommands,
            phase: 'Phase 5: Enterprise Scale, Team Intelligence, Driving Mode & Smart Meeting Dictation'
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * POST /api/jarvis/call-intel
 * Process Call Intelligence from audio or transcript
 */
export const handleProcessCallIntel = async (req, res) => {
    try {
        const {
            clientPhone,
            clientName,
            callType,
            duration,
            callStartTime,
            callEndTime,
            recordingUrl,
            recordingSource,
            transcript,
            audioBase64,
            audioMimeType,
            source,
            deviceInfo
        } = req.body;

        if (!transcript && !audioBase64) {
            return res.status(400).json({
                success: false,
                message: 'Either conversation transcript or audio recording is required'
            });
        }

        const result = await JarvisService.processCallIntelligence(req.user, {
            clientPhone,
            clientName,
            callType: callType || 'INCOMING',
            duration: Number(duration) || 0,
            callStartTime,
            callEndTime,
            recordingUrl,
            recordingSource: recordingSource || (audioBase64 ? 'in_app' : 'dictation'),
            transcript,
            audioBase64,
            audioMimeType,
            source: source || 'mobile',
            deviceInfo
        });

        return res.json(result);
    } catch (error) {
        console.error('[JarvisController] Error processing Call Intelligence:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to process Call Intelligence',
            error: error.message
        });
    }
};

/**
 * GET /api/jarvis/call-intel
 * Fetch Call Intelligence records with pagination
 */
export const getCallIntelligenceList = async (req, res) => {
    try {
        const result = await JarvisService.getCallIntelligenceList(req.user, req.query);
        return res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('[JarvisController] Error fetching call intelligence list:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch call intelligence list',
            error: error.message
        });
    }
};

/**
 * GET /api/jarvis/call-intel/:id
 * Fetch single Call Intelligence record
 */
export const getCallIntelligenceById = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await JarvisService.getCallIntelligenceById(req.user, id);
        if (!result) {
            return res.status(404).json({ success: false, message: 'Call Intelligence record not found' });
        }
        return res.json({
            success: true,
            data: result
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * GET /api/jarvis/briefing
 * Daily executive agenda briefing
 */
export const getDailyBriefingController = async (req, res) => {
    try {
        const result = await JarvisService.getDailyBriefing(req.user);
        return res.json(result);
    } catch (error) {
        console.error('[JarvisController] Error getting daily briefing:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to generate daily briefing',
            error: error.message
        });
    }
};

/**
 * GET /api/jarvis/suggestions
 * Proactive AI recommendations & alerts
 */
export const getProactiveSuggestionsController = async (req, res) => {
    try {
        const result = await JarvisService.getProactiveSuggestions(req.user);
        return res.json(result);
    } catch (error) {
        console.error('[JarvisController] Error getting proactive suggestions:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve proactive suggestions',
            error: error.message
        });
    }
};

/**
 * GET /api/jarvis/analytics
 * Jarvis Voice OS usage metrics & performance
 */
export const getJarvisAnalyticsController = async (req, res) => {
    try {
        const result = await JarvisService.getJarvisAnalytics(req.user, req.query);
        return res.json(result);
    } catch (error) {
        console.error('[JarvisController] Error getting analytics:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve analytics',
            error: error.message
        });
    }
};

/**
 * GET /api/jarvis/team-performance
 * Phase 5: Manager-mode team performance intelligence
 */
export const getTeamPerformanceController = async (req, res) => {
    try {
        const result = await JarvisService.getTeamPerformance(req.user, req.query);
        return res.json(result);
    } catch (error) {
        console.error('[JarvisController] Error getting team performance:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve team performance',
            error: error.message
        });
    }
};

/**
 * POST /api/jarvis/meeting-notes
 * Phase 5: Smart meeting notes dictation & auto-actionizer
 */
export const processMeetingNotesController = async (req, res) => {
    try {
        const result = await JarvisService.processMeetingNotes(req.user, req.body);
        return res.json(result);
    } catch (error) {
        console.error('[JarvisController] Error processing meeting notes:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to process meeting notes',
            error: error.message
        });
    }
};
