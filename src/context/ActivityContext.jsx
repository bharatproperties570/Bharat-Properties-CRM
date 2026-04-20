import { createContext, useContext, useState, useEffect } from 'react';
import { activitiesAPI } from '../utils/api';

const ActivityContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useActivities = () => {
    const context = useContext(ActivityContext);
    if (!context) {
        throw new Error('useActivities must be used within an ActivityProvider');
    }
    return context;
};

export const ActivityProvider = ({ children }) => {
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });

    const fetchActivities = async (filters = {}) => {
        setLoading(true);
        try {
            const response = await activitiesAPI.getAll(filters);
            if (response.success) {
                setActivities(response.data);
                if (response.pagination) {
                    setPagination(response.pagination);
                }
            }
        } catch (error) {
            console.error('Failed to fetch activities:', error);
        } finally {
            setLoading(false);
        }
    };

    const addActivity = async (activityData) => {
        try {
            // --- Normalization Layer START ---
            // Handle legacy/inconsistent payloads from various modules
            const normalizedData = { ...activityData };

            // 1. Normalize relatedTo (handle string or missing model)
            if (!normalizedData.relatedTo) normalizedData.relatedTo = [];

            // If contactName is provided separately, ensure it's in relatedTo if missing
            if (activityData.contactName && normalizedData.relatedTo.length === 0) {
                normalizedData.relatedTo.push({
                    id: activityData.contactPhone || activityData.mobile || 'Unknown',
                    name: activityData.contactName,
                    model: activityData.entityType || 'Lead'
                });
            }

            // 2. Normalize participants (handle legacy mobile/phone)
            if (!normalizedData.participants) normalizedData.participants = [];

            // If a single mobile number is provided as a top-level field, add to participants
            const mobileNum = activityData.mobile || activityData.contactPhone || activityData.phone;
            if (mobileNum && normalizedData.participants.length === 0) {
                normalizedData.participants.push({
                    name: activityData.contactName || 'Participant',
                    mobile: mobileNum
                });
            }

            // 3. Ensure entityId and entityType are set if possible from relatedTo
            if (!normalizedData.entityId && normalizedData.relatedTo.length > 0) {
                normalizedData.entityId = normalizedData.relatedTo[0].id;
                normalizedData.entityType = normalizedData.relatedTo[0].model || normalizedData.relatedTo[0].type;
            }

            // 4. Source Tracking (Enterprise Level)
            // Tag activities created in the web UI so they can be distinguished from mobile/system logs
            if (!normalizedData.details) normalizedData.details = {};
            if (!normalizedData.details.platform) normalizedData.details.platform = 'WebCRM';
            if (!normalizedData.details.source) normalizedData.details.source = 'ManualForm';
            // --- Normalization Layer END ---

            console.log('[ActivityContext] addActivity Payload (Normalized):', normalizedData);
            const response = await activitiesAPI.create(normalizedData);
            console.log('[ActivityContext] addActivity Response:', response);
            if (response.success) {
                // Fetch again to ensure consistency or local update
                setActivities(prev => [response.data, ...prev]);
                return response.data;
            } else {
                console.error('[ActivityContext] backend returned success: false', response);
            }
        } catch (error) {
            console.error('Failed to add activity:', error);
            throw error;
        }
    };

    const updateActivity = async (id, updates) => {
        try {
            const response = await activitiesAPI.update(id, updates);
            if (response.success) {
                setActivities(prev => prev.map(activity =>
                    activity._id === id ? response.data : activity
                ));
                return response.data;
            }
        } catch (error) {
            console.error('Failed to update activity:', error);
            throw error;
        }
    };

    const deleteActivity = async (id) => {
        try {
            const response = await activitiesAPI.delete(id);
            if (response.success) {
                setActivities(prev => prev.filter(activity => activity._id !== id));
                return true;
            }
        } catch (error) {
            console.error('Failed to delete activity:', error);
            throw error;
        }
    };

    useEffect(() => {
        const token = localStorage.getItem('authToken');
        if (token) {
            fetchActivities();
        }
    }, []);

    return (
        <ActivityContext.Provider value={{
            activities,
            loading,
            pagination,
            fetchActivities,
            addActivity,
            updateActivity,
            deleteActivity
        }}>
            {children}
        </ActivityContext.Provider>
    );
};
