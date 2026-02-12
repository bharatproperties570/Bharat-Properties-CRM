/**
 * Department Master Configuration
 * Defines the 4 core departments with their default permissions
 */

const DEPARTMENTS = {
    SALES: {
        id: 'sales',
        name: 'Sales',
        description: 'Lead & Deal management team',
        color: '#3b82f6', // Blue

        // Default module visibility
        defaultModules: {
            leads: { view: true, create: true, edit: true, delete: false },
            deals: { view: true, create: true, edit: true, delete: false },
            contacts: { view: true, create: true, edit: true, delete: false },
            companies: { view: true, create: true, edit: true, delete: false },
            activities: { view: true, create: true, edit: true, delete: false },
            inventory: { view: true, create: false, edit: false, delete: false },
            reports: { view: true, create: false, edit: false, delete: false }
        },

        // Default data scope
        defaultDataScope: 'team',

        // Default financial access
        defaultFinancialAccess: {
            canViewMargin: false,
            canEditCommission: false,
            canOverrideCommission: false,
            canApprovePayment: false,
            canApprovePayout: false
        },

        // Dashboard type
        dashboardType: 'sales'
    },

    MARKETING: {
        id: 'marketing',
        name: 'Marketing',
        description: 'Campaign & lead generation team',
        color: '#8b5cf6', // Purple

        defaultModules: {
            campaigns: { view: true, create: true, edit: true, delete: false },
            leads: { view: true, create: true, edit: true, delete: false },
            contacts: { view: true, create: true, edit: true, delete: false },
            activities: { view: true, create: true, edit: true, delete: false },
            reports: { view: true, create: false, edit: false, delete: false }
        },

        defaultDataScope: 'department',

        defaultFinancialAccess: {
            canViewMargin: false,
            canEditCommission: false,
            canOverrideCommission: false,
            canApprovePayment: false,
            canApprovePayout: false
        },

        dashboardType: 'marketing'
    },

    INVENTORY: {
        id: 'inventory',
        name: 'Inventory Management',
        description: 'Property & project management team',
        color: '#10b981', // Green

        defaultModules: {
            inventory: { view: true, create: true, edit: true, delete: true },
            projects: { view: true, create: true, edit: true, delete: false },
            sizes: { view: true, create: true, edit: true, delete: false },
            contacts: { view: true, create: true, edit: true, delete: false },
            activities: { view: true, create: true, edit: true, delete: false },
            reports: { view: true, create: false, edit: false, delete: false }
        },

        defaultDataScope: 'all',

        defaultFinancialAccess: {
            canViewMargin: false,
            canEditCommission: false,
            canOverrideCommission: false,
            canApprovePayment: false,
            canApprovePayout: false
        },

        dashboardType: 'inventory'
    },

    ACCOUNTS: {
        id: 'accounts',
        name: 'Accounts (PostSales)',
        description: 'Financial & payment management team',
        color: '#f59e0b', // Amber

        defaultModules: {
            deals: { view: true, create: false, edit: true, delete: false },
            payments: { view: true, create: true, edit: true, delete: false },
            commission: { view: true, create: true, edit: true, delete: false },
            reports: { view: true, create: true, edit: true, delete: false },
            contacts: { view: true, create: false, edit: true, delete: false },
            companies: { view: true, create: false, edit: true, delete: false }
        },

        defaultDataScope: 'all',

        defaultFinancialAccess: {
            canViewMargin: true,
            canEditCommission: true,
            canOverrideCommission: false,
            canApprovePayment: true,
            canApprovePayout: true
        },

        dashboardType: 'financial'
    }
};

// Helper functions
export const getDepartmentById = (id) => {
    return Object.values(DEPARTMENTS).find(dept => dept.id === id);
};

export const getDepartmentList = () => {
    return Object.values(DEPARTMENTS).map(dept => ({
        id: dept.id,
        name: dept.name,
        description: dept.description,
        color: dept.color
    }));
};

export const validateDepartment = (departmentId) => {
    return Object.values(DEPARTMENTS).some(dept => dept.id === departmentId);
};

export { DEPARTMENTS };

export default {
    DEPARTMENTS,
    getDepartmentById,
    getDepartmentList,
    validateDepartment
};
