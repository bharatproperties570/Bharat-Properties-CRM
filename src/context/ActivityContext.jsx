import React, { createContext, useContext, useState } from 'react';

const ActivityContext = createContext();

export const useActivities = () => {
    const context = useContext(ActivityContext);
    if (!context) {
        throw new Error('useActivities must be used within an ActivityProvider');
    }
    return context;
};

export const ActivityProvider = ({ children }) => {
    // Initial mock data moved from ActivitiesPage
    const [activities, setActivities] = useState([
        {
            id: 'C1',
            type: 'Meeting',
            contactName: 'Mr. Pale Ram',
            contactPhone: '9988675732',
            contactEmail: '',
            scheduledDate: '2025-12-10T17:18',
            agenda: 'MEETING with Mr. Pale Ram undefined For Requirement Meeting of at Office @ 2025-12-10T17:18.',
            activityType: 'Meeting',
            scheduledBy: 'Suresh',
            scheduledFor: 'Prospect',
            stage: 'Prospect',
            status: 'complete',
            feedback: ''
        },
        {
            id: 'C2',
            type: 'Call',
            contactName: 'Mr. Rajesh kumar Singhal',
            contactPhone: '7988275300/9410535300',
            contactEmail: '5481050305448/5@gmail.com',
            scheduledDate: '2025-12-14T12:31',
            agenda: 'Call Mr. Rajesh kumar Singhal undefined for Site Visit @ 2025-12-14T12:31.',
            activityType: 'Call',
            scheduledBy: 'Suresh',
            scheduledFor: '',
            stage: '',
            status: 'complete',
            feedback: ''
        },
        {
            id: 'C3',
            type: 'Call',
            contactName: 'Mr. Pale Ram',
            contactPhone: '9988675732',
            contactEmail: '',
            scheduledDate: '2025-12-10T17:19',
            agenda: 'Call Mr. Pale Ram undefined for Inventory Availability @ 2025-12-10T17:19.',
            activityType: 'Call',
            scheduledBy: 'Suresh',
            scheduledFor: 'Prospect',
            stage: '',
            status: 'overdue',
            feedback: ''
        },
        {
            id: '1',
            type: 'Site Visit',
            contactName: 'Mr. Rajesh kumar Singhal',
            contactPhone: '7988275300/9410535300',
            contactEmail: '5481050305448/5@gmail.com',
            lead: 'Sector 4 Kurukshetra',
            project: 'Sector 4 Kurukshetra',
            date: '2025-10-07T11:13',
            scheduled: 'Suresh',
            refreshed: '',
            agenda: 'Site Visit with Mr. Rajesh kumar Singhal undefined For 1550-Second Block-Sector 4-Kurukshetra @ 2025-10-07T11:13',
            source: '',
            feedback: 'postponed for low budget',
            stage: '',
            status: 'complete'
        },
        {
            id: '2',
            type: 'Site Visit',
            contactName: 'Mr. Karan Singh Arni',
            contactPhone: '9457200442/9',
            contactEmail: '',
            lead: 'Sector 3 Kurukshetra',
            project: 'Sector 4 Kurukshetra',
            date: '2025-11-26T11:03',
            scheduled: 'Suresh',
            refreshed: '',
            agenda: 'Site Visit with Mr. Karan Singh Arni undefined For 1550-Second Block-Sector 4 Kurukshetra @ 2025-11-26T11:03',
            source: '',
            feedback: 'interested in 800 and want 800, 850 1832, 1835 in sec 0',
            stage: '',
            status: 'complete'
        },
        {
            id: '3',
            type: 'Site Visit',
            contactName: 'Mrs. Sapna JASSI',
            contactPhone: '9992461080',
            contactEmail: '',
            lead: 'Sector 3 Kurukshetra',
            project: '',
            date: '2025-10-24T12:05',
            scheduled: 'Vivek',
            refreshed: '',
            agenda: 'Site Visit with Mrs. Sapna JASSI undefined For @ 2025-10-24T12:05',
            source: '',
            feedback: 'Visit done sector 3 booth interested in 25 (10,17).',
            stage: '',
            status: 'complete'
        },
        {
            id: '5',
            type: 'Site Visit',
            contactName: 'Mr. Satish Kumar',
            contactPhone: '9830645455',
            contactEmail: '',
            lead: 'Sector 4 Kurukshetra',
            project: 'Sector 8 Kurukshetra Sector 3 Kurukshetra',
            date: '2025-10-30T09:00',
            scheduled: 'Vivek',
            refreshed: '',
            agenda: 'Site Visit with Mr. Satish Kumar undefined For @ 2025-10-30T09:00',
            source: '',
            feedback: 'Come for visit 6m south in sector 4,8,3 budget 1,30cr Call for confirm.',
            stage: '',
            status: 'overdue'
        }
    ]);

    const addActivity = (newActivity) => {
        setActivities(prev => [{ id: Date.now().toString(), ...newActivity }, ...prev]);
    };

    const updateActivity = (id, updates) => {
        setActivities(prev => prev.map(activity => activity.id === id ? { ...activity, ...updates } : activity));
    };

    const deleteActivity = (id) => {
        setActivities(prev => prev.filter(activity => activity.id !== id));
    };

    return (
        <ActivityContext.Provider value={{ activities, addActivity, updateActivity, deleteActivity }}>
            {children}
        </ActivityContext.Provider>
    );
};
