export const COMMUNICATION_TYPES = ['Incoming', 'Outgoing'];
export const PLATFORMS = ['WhatsApp', 'SMS', 'GSM Call', 'Email', 'Telegram', 'FB Messenger', 'RCS', 'Gmail', 'Outlook', 'Yahoo Mail'];
export const OUTCOMES = ['Interested', 'Not Interested', 'Delivered', 'Read', 'Sent', 'Call Back Later', 'Unread'];
export const TIME_FRAMES = ['Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days'];

const parseRelativeDate = (dateStr) => {
    if (!dateStr) return new Date(0); // Old date if missing

    const now = new Date();
    const lc = dateStr.toLowerCase();

    // Simple parsing for "X days/hours/minutes ago"
    const match = lc.match(/(\d+)\s+(day|days|hour|hours|minute|minutes)\s+ago/);
    if (match) {
        const val = parseInt(match[1]);
        const unit = match[2];

        if (unit.startsWith('day')) {
            now.setDate(now.getDate() - val);
        } else if (unit.startsWith('hour')) {
            now.setHours(now.getHours() - val);
        } else if (unit.startsWith('minute')) {
            now.setMinutes(now.getMinutes() - val);
        }
        return now;
    }

    // Handle "Yesterday" or "Today" if present in data
    if (lc.includes('yesterday')) {
        now.setDate(now.getDate() - 1);
        return now;
    }
    if (lc.includes('today')) {
        return now;
    }

    // Try parsing as regular date just in case
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) return parsed;

    return new Date(0); // Fallback
};

export const applyCommunicationFilters = (items, filters, searchQuery = '') => {
    return items.filter(item => {
        // 1. Search Query
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const participant = (item.participant || '').toLowerCase();
            const platform = (item.platform || '').toLowerCase();
            const deal = (item.associatedDeals || '').toLowerCase();
            const type = (item.type || '').toLowerCase();

            if (!participant.includes(q) && !platform.includes(q) && !deal.includes(q) && !type.includes(q)) {
                return false;
            }
        }

        // 2. Type (Direction)
        if (filters.direction && filters.direction.length > 0) {
            // Data has "Incoming Call", "Outgoing Message". Check includes.
            const itemType = (item.type || '').toLowerCase();
            const matchesDirection = filters.direction.some(dir => itemType.includes(dir.toLowerCase()));
            if (!matchesDirection) return false;
        }

        // 3. Platform
        if (filters.platform && filters.platform.length > 0) {
            // Check mapping. e.g. "WhatsApp" vs "WhatsApp Call"
            // Filter "WhatsApp" should match "WhatsApp" and "WhatsApp Call"?
            // Or exact match? Mock data has "WhatsApp Call" (for calls) and "WhatsApp" (for messages).
            // Let's do loose match or check if item.platform includes one of the filters.
            // Actually, item.platform is specific e.g., 'GSM Call', 'WhatsApp Call'.
            const itemPlat = (item.platform || '').toLowerCase();
            const match = filters.platform.some(f => itemPlat.includes(f.toLowerCase()));
            if (!match) return false;
        }

        // 4. Outcome
        if (filters.outcome && filters.outcome.length > 0) {
            const itemOutcome = (item.outcome || '').toLowerCase();
            const match = filters.outcome.some(f => itemOutcome === f.toLowerCase());
            if (!match) return false;
        }

        // 5. Time Frame
        if (filters.timeFrame) {
            const itemDate = parseRelativeDate(item.date);
            const now = new Date();
            const startOfDay = new Date(new Date().setHours(0, 0, 0, 0));

            if (filters.timeFrame === 'Today') {
                if (itemDate < startOfDay) return false;
            } else if (filters.timeFrame === 'Yesterday') {
                const startOfYesterday = new Date(startOfDay);
                startOfYesterday.setDate(startOfDay.getDate() - 1);
                // strictly yesterday? or "since yesterday"? Usually strictly yesterday.
                // But simplified: >= Yesterday Start && < Today Start
                if (itemDate < startOfYesterday || itemDate >= startOfDay) return false;
            } else if (filters.timeFrame === 'Last 7 Days') {
                const limit = new Date(now);
                limit.setDate(now.getDate() - 7);
                if (itemDate < limit) return false;
            } else if (filters.timeFrame === 'Last 30 Days') {
                const limit = new Date(now);
                limit.setDate(now.getDate() - 30);
                if (itemDate < limit) return false;
            }
        }

        return true;
    });
};
