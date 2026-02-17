import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usersAPI, rolesAPI, teamsAPI } from '../utils/api';

const UserContext = createContext();

export const useUserContext = () => {
    const context = useContext(UserContext);
    if (!context) {
        throw new Error('useUserContext must be used within a UserProvider');
    }
    return context;
};

export const UserProvider = ({ children }) => {
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Fetch initial data
    const fetchAllData = useCallback(async () => {
        setLoading(true);
        try {
            const [usersRes, rolesRes] = await Promise.all([
                usersAPI.getAll(),
                rolesAPI.getAll()
            ]);

            if (usersRes.success) {
                const activeUsers = (usersRes.data || []).filter(u => u.status === 'active' || u.isActive);
                setUsers(activeUsers);
            }
            if (rolesRes.success) setRoles(rolesRes.data || []);

            // Fetch teams separately to not block initial load if it fails
            try {
                const teamsRes = await teamsAPI.getAll();
                if (teamsRes.success) setTeams(teamsRes.data || []);
            } catch (e) {
                console.warn('Failed to fetch teams:', e);
            }

            setError(null);
        } catch (err) {
            console.error('Failed to fetch user data:', err);
            setError(err.message || 'Failed to load users and roles');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);

    // User Operations
    const addUser = async (userData) => {
        try {
            const response = await usersAPI.create(userData);
            if (response.success) {
                setUsers(prev => [response.data, ...prev]);
                return { success: true, data: response.data };
            }
        } catch (err) {
            return { success: false, error: err.message };
        }
    };

    const updateUser = async (id, userData) => {
        try {
            const response = await usersAPI.update(id, userData);
            if (response.success) {
                setUsers(prev => prev.map(u => u._id === id ? response.data : u));
                return { success: true, data: response.data };
            }
        } catch (err) {
            return { success: false, error: err.message };
        }
    };

    const deleteUser = async (id) => {
        try {
            const response = await usersAPI.delete(id);
            if (response.success) {
                setUsers(prev => prev.filter(u => u._id !== id));
                return { success: true };
            }
        } catch (err) {
            return { success: false, error: err.message };
        }
    };

    const toggleUserStatus = async (id, status, reason, duration, customDate) => {
        try {
            const response = await usersAPI.toggleStatus(id, { status, reason, duration, customDate });
            if (response.success) {
                // Update user in state
                setUsers(prev => prev.map(u => u._id === id ? response.data : u));
                return { success: true, data: response.data };
            }
        } catch (err) {
            return { success: false, error: err.message };
        }
    };

    // Role Operations
    const addRole = async (roleData) => {
        try {
            const response = await rolesAPI.create(roleData);
            if (response.success) {
                setRoles(prev => [response.data, ...prev]);
                return { success: true, data: response.data };
            }
        } catch (err) {
            return { success: false, error: err.message };
        }
    };

    const updateRole = async (id, roleData) => {
        try {
            const response = await rolesAPI.update(id, roleData);
            if (response.success) {
                setRoles(prev => prev.map(r => r._id === id ? response.data : r));
                return { success: true, data: response.data };
            }
        } catch (err) {
            return { success: false, error: err.message };
        }
    };

    const deleteRole = async (id, force = false) => {
        try {
            const response = await rolesAPI.delete(id, force);
            if (response.success) {
                setRoles(prev => prev.filter(r => r._id !== id));
                return { success: true };
            }
        } catch (err) {
            return { success: false, error: err.message };
        }
    };

    // Team Operations
    const addTeam = async (teamData) => {
        try {
            const response = await teamsAPI.create(teamData);
            if (response.success) {
                setTeams(prev => [response.data, ...prev].sort((a, b) => a.name.localeCompare(b.name)));
                return { success: true, data: response.data };
            }
        } catch (err) {
            return { success: false, error: err.message };
        }
    };

    const updateTeam = async (id, teamData) => {
        try {
            const response = await teamsAPI.update(id, teamData);
            if (response.success) {
                setTeams(prev => prev.map(t => t._id === id ? { ...t, ...response.data } : t));
                return { success: true, data: response.data };
            }
        } catch (err) {
            return { success: false, error: err.message };
        }
    };

    const deleteTeam = async (id) => {
        try {
            const response = await teamsAPI.delete(id);
            if (response.success) {
                setTeams(prev => prev.filter(t => t._id !== id));
                return { success: true };
            }
        } catch (err) {
            return { success: false, error: err.message };
        }
    };

    const refreshData = fetchAllData;

    const value = {
        users,
        roles,
        teams,
        loading,
        error,
        addUser,
        updateUser,
        deleteUser,
        toggleUserStatus,
        addRole,
        updateRole,
        deleteRole,
        addTeam,
        updateTeam,
        deleteTeam,
        refreshData
    };

    return (
        <UserContext.Provider value={value}>
            {children}
        </UserContext.Provider>
    );
};

export default UserContext;
