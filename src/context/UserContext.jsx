import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usersAPI, rolesAPI } from '../utils/api';

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

            if (usersRes.success) setUsers(usersRes.data || []);
            if (rolesRes.success) setRoles(rolesRes.data || []);
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

    const deleteRole = async (id) => {
        try {
            const response = await rolesAPI.delete(id);
            if (response.success) {
                setRoles(prev => prev.filter(r => r._id !== id));
                return { success: true };
            }
        } catch (err) {
            return { success: false, error: err.response?.data?.message || err.message };
        }
    };

    const refreshData = fetchAllData;

    const value = {
        users,
        roles,
        loading,
        error,
        addUser,
        updateUser,
        deleteUser,
        addRole,
        updateRole,
        deleteRole,
        refreshData
    };

    return (
        <UserContext.Provider value={value}>
            {children}
        </UserContext.Provider>
    );
};

export default UserContext;
