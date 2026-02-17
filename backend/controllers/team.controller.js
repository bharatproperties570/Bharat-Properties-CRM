import Team from "../models/Team.js";
import User from "../models/User.js";

// @desc    Create a new team
// @route   POST /api/teams
// @access  Private
export const createTeam = async (req, res) => {
    try {
        const { name, description, manager, department, parentTeam } = req.body;

        const team = await Team.create({
            name,
            description,
            manager,
            department,
            parentTeam
        });

        // Handle members assignment
        if (req.body.members && Array.isArray(req.body.members) && req.body.members.length > 0) {
            await User.updateMany(
                { _id: { $in: req.body.members } },
                { $set: { team: team._id } }
            );
        }

        // Populate manager details
        await team.populate('manager', 'fullName email');

        res.status(201).json({
            success: true,
            data: team
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Get all teams (with filtering)
// @route   GET /api/teams
// @access  Private
export const getTeams = async (req, res) => {
    try {
        const { department, isActive } = req.query;

        const query = {};
        if (department) query.department = department;
        if (isActive !== undefined) query.isActive = isActive === 'true';

        const teams = await Team.find(query)
            .populate('manager', 'fullName email')
            .populate('parentTeam', 'name')
            .sort({ name: 1 });

        // Get member counts for each team
        const teamsWithCounts = await Promise.all(teams.map(async (team) => {
            const memberCount = await User.countDocuments({ team: team._id, status: 'active' });
            return {
                ...team.toObject(),
                memberCount
            };
        }));

        res.status(200).json({
            success: true,
            data: teamsWithCounts
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Get single team
// @route   GET /api/teams/:id
// @access  Private
export const getTeam = async (req, res) => {
    try {
        const team = await Team.findById(req.params.id)
            .populate('manager', 'fullName email')
            .populate('parentTeam', 'name');

        if (!team) {
            return res.status(404).json({
                success: false,
                message: 'Team not found'
            });
        }

        const members = await User.find({ team: team._id, status: 'active' }).select('fullName email role department');

        res.status(200).json({
            success: true,
            data: {
                ...team.toObject(),
                members
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Update team
// @route   PUT /api/teams/:id
// @access  Private
export const updateTeam = async (req, res) => {
    try {
        const team = await Team.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        }).populate('manager', 'fullName email');

        if (!team) {
            return res.status(404).json({
                success: false,
                message: 'Team not found'
            });
        }

        // Handle members assignment
        if (req.body.members && Array.isArray(req.body.members)) {
            // 1. Remove team from users who are no longer in the list
            await User.updateMany(
                { team: team._id, _id: { $nin: req.body.members } },
                { $unset: { team: "" } } // or set to null
            );

            // 2. Add team to users who are in the list
            await User.updateMany(
                { _id: { $in: req.body.members } },
                { $set: { team: team._id } }
            );
        }

        res.status(200).json({
            success: true,
            data: team
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Delete team
// @route   DELETE /api/teams/:id
// @access  Private
export const deleteTeam = async (req, res) => {
    try {
        const team = await Team.findById(req.params.id);

        if (!team) {
            return res.status(404).json({
                success: false,
                message: 'Team not found'
            });
        }

        // Check if there are users in this team
        const userCount = await User.countDocuments({ team: team._id, status: 'active' });
        if (userCount > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete team with ${userCount} active members. Please reassign them first.`
            });
        }

        await team.deleteOne();

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
