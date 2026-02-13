import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api'; // Assuming there's a pre-configured axios instance

const ActivityContext = createContext();

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
            const response = await api.get('/activities', { params: filters });
            if (response.data.success) {
                setActivities(response.data.data);
                setPagination(response.data.pagination);
            }
        } catch (error) {
            console.error('Failed to fetch activities:', error);
        } finally {
            setLoading(false);
        }
    };

    const addActivity = async (activityData) => {
        try {
            const response = await api.post('/activities', activityData);
            if (response.data.success) {
                // Fetch again to ensure consistency or local update
                setActivities(prev => [response.data.data, ...prev]);
                return response.data.data;
            }
        } catch (error) {
            console.error('Failed to add activity:', error);
            throw error;
        }
    };

    const updateActivity = async (id, updates) => {
        try {
            const response = await api.put(`/activities/${id}`, updates);
            if (response.data.success) {
                setActivities(prev => prev.map(activity =>
                    activity._id === id ? response.data.data : activity
                ));
                return response.data.data;
            }
        } catch (error) {
            console.error('Failed to update activity:', error);
            throw error;
        }
    };

    const deleteActivity = async (id) => {
        try {
            const response = await api.delete(`/activities/${id}`);
            if (response.data.success) {
                setActivities(prev => prev.filter(activity => activity._id !== id));
                return true;
            }
        } catch (error) {
            console.error('Failed to delete activity:', error);
            throw error;
        }
    };

    useEffect(() => {
        fetchActivities();
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
