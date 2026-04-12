import mongoose from "mongoose";
import Team from "../models/Team.js";

/**
 * Enterprise Visibility Engine
 * Generates robust MongoDB filters based on User Data Scope and Team assignments.
 * Supports: Assigned, Team, Department, and Global scopes.
 */
export const getVisibilityFilter = async (user) => {
    // 0. Safety Check: If user is just a decoded token (unhydrated fallback)
    if (user && !user.dataScope && !user.teams && user.id) {
        console.warn(`[Visibility] User ${user.id} provided without dataScope/teams. Request might be missing hydration.`);
    }

    if (!user) return { _id: null }; // No user, no data (Shielded)

    // 1. Super Admin / Global Scope / Dynamic Role Detection
    const roleName = user.role?.name?.toLowerCase() || '';
    const isElevated = user.dataScope === 'all' || 
                      ['admin', 'super admin', 'sales manager', 'owner'].includes(roleName);

    console.log(`[Visibility] 🚦 Resolving scope for User: ${user.fullName} | Role: ${roleName} | Scope: ${user.dataScope} | Elevated: ${isElevated}`);

    if (isElevated) {
        console.log(`[Visibility] ✅ Full Access Granted (Elevated Role/All Scope)`);
        return {}; 
    }

    const userId = user?._id || user?.id;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId.toString())) {
        console.warn(`[Visibility] No valid ObjectId found for user. Returning empty filter.`);
        return { _id: null };
    }
    const userObjectId = new mongoose.Types.ObjectId(userId.toString());

    // Hybrid resolution: supports single team (legacy) and plural teams (new)
    const rawTeams = Array.isArray(user.teams) ? user.teams : (user.team ? [user.team] : []);
    const userTeams = rawTeams
        .map(t => (t && typeof t === 'object' && t._id) ? t._id : t)
        .filter(t => t && mongoose.Types.ObjectId.isValid(t.toString()))
        .map(t => new mongoose.Types.ObjectId(t.toString()));

    // 2. Department Scope: Resolve all teams within the user's department
    if (user.dataScope === 'department' && user.department) {
        const TeamModel = mongoose.model('Team');
        const deptTeams = await TeamModel.find({ department: user.department, isActive: true }).select('_id');
        const deptTeamIds = deptTeams.map(t => t._id).filter(id => mongoose.Types.ObjectId.isValid(id.toString()));
        
        return {
            $or: [
                { assignedTo: userObjectId },
                { owner: userObjectId },
                { assign: { $in: [userObjectId] } },
                { 'assignment.assignedTo': userObjectId },
                { teams: { $in: deptTeamIds } },
                { team: { $in: deptTeamIds } },
                { 'assignment.team': { $in: deptTeamIds } },
                { visibleTo: { $in: ['Everyone', 'Public'] } },
                { 'assignment.visibleTo': { $in: ['Everyone', 'Public'] } },
                { owner: null },
                { owner: { $exists: false } }
            ]
        };
    }

    // 3. Team Scope: Restricted to user's assigned teams
    if (user.dataScope === 'team' && userTeams.length > 0) {
        return {
            $or: [
                { assignedTo: userObjectId },
                { owner: userObjectId },
                { assign: { $in: [userObjectId] } },
                { 'assignment.assignedTo': userObjectId },
                { teams: { $in: userTeams } },
                { team: { $in: userTeams } },
                { 'assignment.team': { $in: userTeams } },
                { visibleTo: { $in: ['Everyone', 'Public'] } },
                { 'assignment.visibleTo': { $in: ['Everyone', 'Public'] } },
                { owner: null },
                { owner: { $exists: false } }
            ]
        };
    }


    // 4. Default: Assigned Scope (Strict isolation)
    return {
        $or: [
            { assignedTo: userObjectId },
            { owner: userObjectId },
            { assign: { $in: [userObjectId] } },
            { 'assignment.assignedTo': userObjectId },
            { visibleTo: { $in: ['Everyone', 'Public'] } },
            { 'assignment.visibleTo': { $in: ['Everyone', 'Public'] } }
        ]
    };
};
