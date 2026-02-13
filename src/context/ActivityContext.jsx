import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, activitiesAPI } from '../utils/api';

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
            const response = await activitiesAPI.create(activityData);
            if (response.success) {
                // Fetch again to ensure consistency or local update
                setActivities(prev => [response.data, ...prev]);
                return response.data;
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
