// Distribution Engine - Core Logic for Work Assignment
// This engine controls WHO gets WHAT work, WHEN, and WHY

/**
 * Evaluate conditions against entity data
 * @param {Array} conditions - Array of condition objects
 * @param {Object} entityData - The entity being evaluated
 * @returns {boolean} - Whether conditions are met
 */
export const evaluateConditions = (conditions, entityData) => {
    if (!conditions || conditions.length === 0) return true;

    let result = true;
    let currentLogic = 'AND';

    for (let i = 0; i < conditions.length; i++) {
        const condition = conditions[i];
        const fieldValue = getNestedValue(entityData, condition.field);
        const conditionMet = evaluateSingleCondition(fieldValue, condition.operator, condition.value);

        if (i === 0) {
            result = conditionMet;
        } else {
            if (currentLogic === 'AND') {
                result = result && conditionMet;
            } else {
                result = result || conditionMet;
            }
        }

        currentLogic = condition.logic || 'AND';
    }

    return result;
};

/**
 * Round Robin Distribution with Weighting and Availability
 * Cycles through available agents based on their assigned weights
 */
export const distributeRoundRobin = (assignmentTarget, agentWorkload, lastAssignedIndex = 0, users = []) => {
    // Filter agents by: 1. Active Status, 2. Availability, 3. Capping
    const eligibleAgents = assignmentTarget.ids.filter(id => {
        const user = users.find(u => u.id === id);
        const workload = agentWorkload[id] || {};

        // 1. Real-time Availability Check
        const isAvailable = user?.availability === 'Available';

        // 2. Capacity Capping Check
        const weightData = assignmentTarget.weights?.[id] || { weight: 1, cap: 999 };
        const totalLoad = (workload.activeLeads || 0) + (workload.activeActivities || 0);
        const isUnderCap = totalLoad < (weightData.cap || 999);

        return isAvailable && isUnderCap;
    });

    if (eligibleAgents.length === 0) return null;

    // Use weights if available
    const weights = assignmentTarget.weights || {};

    // Weighted selection logic
    // Create a pool of IDs based on weights
    let pool = [];
    eligibleAgents.forEach(id => {
        const weight = weights[id]?.weight || 1;
        for (let i = 0; i < weight; i++) {
            pool.push(id);
        }
    });

    if (pool.length === 0) return null;

    // Select based on index in pool
    const nextPoolIndex = (lastAssignedIndex + 1) % pool.length;
    return {
        assignedTo: pool[nextPoolIndex],
        nextIndex: nextPoolIndex
    };
};

/**
 * Load Based Distribution with Weighting
 * Assigns to agent with lowest percentage of their capacity filled
 */
export const distributeLoadBased = (assignmentTarget, agentWorkload, users = []) => {
    const eligibleAgents = assignmentTarget.ids.filter(id => {
        const user = users.find(u => u.id === id);
        return user?.availability === 'Available';
    });

    if (eligibleAgents.length === 0) return null;

    let lowestLoadRatio = Infinity;
    let selectedAgent = null;

    eligibleAgents.forEach(agentId => {
        const workload = agentWorkload[agentId] || {};
        const weightData = assignmentTarget.weights?.[agentId] || { cap: 100 };
        const totalLoad = (workload.activeLeads || 0) + (workload.activeActivities || 0);

        // Use ratio of load to cap for fairer balancing
        const loadRatio = totalLoad / (weightData.cap || 100);

        if (loadRatio < lowestLoadRatio) {
            lowestLoadRatio = loadRatio;
            selectedAgent = agentId;
        }
    });

    return { assignedTo: selectedAgent };
};

/**
 * Skill Based Distribution
 * Matches entity requirements to agent skills
 */
export const distributeSkillBased = (assignmentTarget, entityData, agentSkills) => {
    const availableAgents = assignmentTarget.ids.filter(id => {
        const skills = agentSkills[id];
        return skills && skills.isActive !== false;
    });

    if (availableAgents.length === 0) return null;

    // Score each agent based on skill match
    let bestScore = -1;
    let selectedAgent = null;

    availableAgents.forEach(agentId => {
        const skills = agentSkills[agentId];
        let score = 0;

        // Budget range match
        if (entityData.budget && skills.budgetRange) {
            const budget = parseFloat(entityData.budget);
            if (budget >= skills.budgetRange.min && budget <= skills.budgetRange.max) {
                score += 3;
            }
        }

        // Location match
        if (entityData.location && skills.locations) {
            if (skills.locations.includes(entityData.location)) {
                score += 2;
            }
        }

        // Property type match
        if (entityData.propertyType && skills.propertyTypes) {
            if (skills.propertyTypes.includes(entityData.propertyType)) {
                score += 2;
            }
        }

        // Experience level
        if (skills.experienceYears) {
            score += Math.min(skills.experienceYears / 2, 3);
        }

        if (score > bestScore) {
            bestScore = score;
            selectedAgent = agentId;
        }
    });

    return { assignedTo: selectedAgent };
};

/**
 * Location Based Distribution
 * Assigns based on geographic territory
 */
export const distributeLocationBased = (assignmentTarget, entityData, agentTerritories) => {
    const location = entityData.location || entityData.preferredLocation || entityData.sector;

    if (!location) return null;

    // Find agent responsible for this location
    for (const agentId of assignmentTarget.ids) {
        const territories = agentTerritories[agentId];
        if (territories && territories.includes(location)) {
            return { assignedTo: agentId };
        }
    }

    return null;
};

/**
 * Source Based Distribution
 * Routes by lead source quality
 */
export const distributeSourceBased = (assignmentTarget, entityData, sourceMapping) => {
    const source = entityData.source;

    if (!source || !sourceMapping) return null;

    // Get tier for this source
    const tier = sourceMapping[source] || 'standard';

    // Filter agents by tier
    const eligibleAgents = assignmentTarget.ids.filter(agentId => {
        const agentTier = sourceMapping.agentTiers?.[agentId];
        return agentTier === tier || agentTier === 'all';
    });

    if (eligibleAgents.length === 0) return null;

    // Use round robin within tier
    const randomIndex = Math.floor(Math.random() * eligibleAgents.length);
    return { assignedTo: eligibleAgents[randomIndex] };
};

/**
 * Score Based Distribution
 * Uses lead score for assignment
 */
export const distributeScoreBased = (assignmentTarget, entityData, scoreBands) => {
    const score = entityData.leadScore || entityData.score || 0;

    // Determine score band
    let band = 'cold';
    if (score >= 81) band = 'superHot';
    else if (score >= 61) band = 'hot';
    else if (score >= 31) band = 'warm';

    // Get agents for this band
    const bandAgents = scoreBands[band] || assignmentTarget.ids;

    if (bandAgents.length === 0) return null;

    // Use round robin within band
    const randomIndex = Math.floor(Math.random() * bandAgents.length);
    return { assignedTo: bandAgents[randomIndex] };
};

/**
 * Calculate agent workload
 */
export const calculateWorkload = (agentId, leads, activities) => {
    const activeLeads = leads.filter(l => l.owner === agentId && l.stage !== 'Closed').length;
    const activeActivities = activities.filter(a => a.assignedTo === agentId && a.status !== 'Completed').length;

    return {
        activeLeads,
        activeActivities,
        totalLoad: activeLeads + activeActivities
    };
};

/**
 * Check if reassignment is needed
 */
export const checkReassignment = (entity, reassignmentPolicy, currentTime) => {
    if (!reassignmentPolicy.enabled) return false;

    const lastActivity = entity.lastActivityDate || entity.createdAt;
    const hoursSinceActivity = (currentTime - new Date(lastActivity)) / (1000 * 60 * 60);

    return hoursSinceActivity >= reassignmentPolicy.inactivityHours;
};

/**
 * Validate assignment target
 */
export const validateAssignment = (assignedTo, users, teams) => {
    // Check if user exists and is active
    const user = users.find(u => u.id === assignedTo);
    if (!user) return { valid: false, reason: 'User not found' };
    if (user.status !== 'Active') return { valid: false, reason: 'User is inactive' };

    return { valid: true };
};

/**
 * Get fallback assignment
 */
export const getFallbackAssignment = (fallbackTarget, users, teams) => {
    if (!fallbackTarget) return null;

    if (fallbackTarget.type === 'user') {
        const user = users.find(u => u.id === fallbackTarget.id);
        return user && user.status === 'Active' ? fallbackTarget.id : null;
    }

    if (fallbackTarget.type === 'team') {
        const team = teams.find(t => t.id === fallbackTarget.id);
        if (!team) return null;

        // Get first active user in team
        const activeUser = team.members.find(memberId => {
            const user = users.find(u => u.id === memberId);
            return user && user.status === 'Active';
        });

        return activeUser || null;
    }

    return null;
};
