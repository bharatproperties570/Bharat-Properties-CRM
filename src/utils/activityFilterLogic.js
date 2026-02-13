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
        // 1. Search Term (Subject, Contact Name, Type)
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            const subject = (activity.subject || '').toLowerCase();
            const contact = (activity.relatedTo?.[0]?.name || '').toLowerCase();
            const type = (activity.type || '').toLowerCase();
            const description = (activity.description || '').toLowerCase();

            if (!subject.includes(term) && !contact.includes(term) && !type.includes(term) && !description.includes(term)) {
                return false;
            }
        }

        // 2. Activity Type Filter
        if (filters.activityType && filters.activityType.length > 0) {
            const type = activity.type;
            if (!filters.activityType.includes(type)) return false;
        }

        // 3. Status Filter
        if (filters.status && filters.status.length > 0) {
            const actStatus = (activity.status || 'Pending').toLowerCase();
            const filterStatuses = filters.status.map(s => s.toLowerCase());

            if (!filterStatuses.includes(actStatus)) {
                // Map 'Upcoming' to 'Pending' if needed
                const isPending = actStatus === 'pending';
                const wantsPending = filterStatuses.includes('pending') || filterStatuses.includes('upcoming');

                if (!(isPending && wantsPending)) return false;
            }
        }

        // 4. Priority Filter
        if (filters.priority && filters.priority.length > 0) {
            const priority = (activity.priority || 'Normal');
            if (!filters.priority.includes(priority)) return false;
        }

        // 5. Owner (Performed By) Filter
        if (filters.owner && filters.owner.length > 0) {
            const owner = activity.performedBy || 'System';
            if (!filters.owner.includes(owner)) return false;
        }

        // 6. Date Range Filter
        if (filters.dateRange && (filters.dateRange.start || filters.dateRange.end)) {
            const dateStr = activity.dueDate;
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
