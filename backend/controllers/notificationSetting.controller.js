import NotificationSetting from '../models/NotificationSetting.js';

// @desc    Get notification settings for current user
// @route   GET /api/notification-settings
export const getNotificationSettings = async (req, res) => {
    try {
        let settings = await NotificationSetting.findOne({ user: req.user.id });
        
        if (!settings) {
            // Create default settings if not exists
            settings = await NotificationSetting.create({
                user: req.user.id,
                presets: {
                    'assignments': { 'web': true, 'email': true },
                    'reminders': { 'web': true, 'email': true, 'whatsapp': true }
                }
            });
        }
        
        res.json({ success: true, data: settings });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update notification settings
// @route   PUT /api/notification-settings
export const updateNotificationSettings = async (req, res) => {
    try {
        const settings = await NotificationSetting.findOneAndUpdate(
            { user: req.user.id },
            req.body,
            { new: true, upsert: true }
        );
        res.json({ success: true, data: settings });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Add personalized notification rule
// @route   POST /api/notification-settings/personalized
export const addPersonalizedRule = async (req, res) => {
    try {
        const rule = req.body;
        const settings = await NotificationSetting.findOneAndUpdate(
            { user: req.user.id },
            { $push: { personalizedRules: rule } },
            { new: true, upsert: true }
        );
        res.json({ success: true, data: settings });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
