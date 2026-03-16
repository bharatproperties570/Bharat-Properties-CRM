import SalesGoal from '../models/SalesGoal.js';
import User from '../models/User.js';

// @desc    Get sales goals for current user or team members
// @route   GET /api/sales-goals
export const getSalesGoals = async (req, res) => {
    try {
        const { year, month } = req.query;
        const currentYear = year ? parseInt(year) : new Date().getFullYear();
        const currentMonth = month ? parseInt(month) : new Date().getMonth();

        // Populate user to get role name accurately
        const user = await User.findById(req.user.id).populate('role');
        const isAdmin = user?.role?.name === 'admin';

        const query = {
            month: currentMonth,
            year: currentYear
        };

        if (!isAdmin) {
            query.user = req.user.id;
        }

        const goals = await SalesGoal.find(query).populate('user', 'fullName avatar');
        res.json({ success: true, data: goals || [] });
    } catch (error) {
        console.error('Get sales goals error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Set or Update goal for a user (Unified Form)
// @route   POST /api/sales-goals
export const setSalesGoal = async (req, res) => {
    try {
        const { userId, month, year, revenueGoal, dealsGoal, siteVisitsGoal, period } = req.body;

        const targetUserId = userId || req.user.id;
        
        const goal = await SalesGoal.findOneAndUpdate(
            { user: targetUserId, month, year },
            { 
                revenueGoal, 
                dealsGoal, 
                siteVisitsGoal, 
                period: period || 'monthly'
            },
            { new: true, upsert: true }
        );

        res.json({ success: true, data: goal });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all active users for goal setting
// @route   GET /api/sales-goals/users
export const getSalesUsers = async (req, res) => {
    try {
        const users = await User.find({ isActive: true }).select('fullName avatar role').populate('role', 'name');
        res.json({ success: true, data: users });
    } catch (error) {
        console.error('Get sales users error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
