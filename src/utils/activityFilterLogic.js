export const ACTIVITY_TYPES = ['Call', 'Meeting', 'Site Visit', 'Email', 'Task'];
export const ACTIVITY_STATUSES = ['Upcoming', 'Overdue', 'Completed', 'Pending'];
export const PRIORITIES = ['High', 'Normal', 'Low'];

/**
 * Filter activities based on provided criteria
 * @param {Array} activities - List of activity objects
 * @param {Object} filters - Filter criteria
 * @param {string} searchTerm - Search query
 * @returns {Array} - Filtered activities
 */
export const applyActivityFilters = (activities, filters, searchTerm = '') => {
    return activities.filter(activity => {
        // 1. Search Term (Agenda, Contact Name, Type)
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            const agenda = (activity.agenda || activity.subject || '').toLowerCase();
            const contact = (activity.contactName || '').toLowerCase();
            const type = (activity.type || activity.activityType || '').toLowerCase();

            if (!agenda.includes(term) && !contact.includes(term) && !type.includes(term)) {
                return false;
            }
        }

        // 2. Activity Type Filter
        if (filters.activityType && filters.activityType.length > 0) {
            const type = activity.type || activity.activityType;
            if (!filters.activityType.includes(type)) return false;
        }

        // 3. Status Filter
        if (filters.status && filters.status.length > 0) {
            // Normalize status from data (usually lowercase 'complete', 'overdue') to match filter (Title Case)
            const actStatus = (activity.status || 'pending').toLowerCase();
            const filterStatuses = filters.status.map(s => s.toLowerCase());

            // Handle 'Upcoming' logic if strictly needed, but for now map broadly
            // If data has 'complete', 'overdue', 'pending'
            // Map 'Completed' -> 'complete'
            // 'Overdue' -> 'overdue'
            // 'Pending' -> 'pending' (or 'upcoming'?)

            // Let's assume exact match after normalization for now, 
            // but if 'Upcoming' is selected, it might mean 'pending' and date >= today.
            // For simplicity, we check if the normalized status is in the filter list.
            if (!filterStatuses.includes(actStatus)) {
                // Special handling if needed (e.g. 'Upcoming' vs 'Pending')
                // If filter has 'Upcoming' and status is 'pending', we accept it?
                const isPending = actStatus === 'pending' || actStatus === 'upcoming';
                const wantsPending = filterStatuses.includes('pending') || filterStatuses.includes('upcoming');

                if (!(isPending && wantsPending)) return false;
            }
        }

        // 4. Priority Filter
        if (filters.priority && filters.priority.length > 0) {
            const priority = (activity.priority || 'Normal');
            if (!filters.priority.includes(priority)) return false;
        }

        // 5. Owner (Scheduled By) Filter
        if (filters.owner && filters.owner.length > 0) {
            const owner = activity.scheduledBy || activity.scheduled || 'Unknown';
            if (!filters.owner.includes(owner)) return false;
        }

        // 6. Date Range Filter
        if (filters.dateRange && (filters.dateRange.start || filters.dateRange.end)) {
            const dateStr = activity.scheduledDate || activity.date;
            if (!dateStr) return false;

            const actDate = new Date(dateStr);
            actDate.setHours(0, 0, 0, 0);

            if (filters.dateRange.start) {
                const start = new Date(filters.dateRange.start);
                start.setHours(0, 0, 0, 0);
                if (actDate < start) return false;
            }

            if (filters.dateRange.end) {
                const end = new Date(filters.dateRange.end);
                end.setHours(23, 59, 59, 999);
                if (actDate > end) return false;
            }
        }

        return true;
    });
};
