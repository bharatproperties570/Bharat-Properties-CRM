/**
 * Role Templates Configuration
 * Predefined roles for each department
 */

const ROLE_TEMPLATES = {
    // Sales Department Roles
    SALES_EXECUTIVE: {
        name: 'Sales Executive',
        department: 'sales',
        description: 'Entry-level sales position handling leads and deals',
        isSystemRole: true,

        moduleAccess: {
            leads: { view: true, create: true, edit: true, delete: false },
            deals: { view: true, create: true, edit: true, delete: false },
            contacts: { view: true, create: true, edit: true, delete: false },
            companies: { view: true, create: true, edit: true, delete: false },
            activities: { view: true, create: true, edit: true, delete: false },
            inventory: { view: true, create: false, edit: false, delete: false },
            reports: { view: true, create: false, edit: false, delete: false },
            payments: { view: false, create: false, edit: false, delete: false },
            commission: { view: true, create: false, edit: false, delete: false },
            campaigns: { view: true, create: false, edit: false, delete: false },
            matching: { view: true, create: false, edit: false, delete: false }
        },

        defaultDataScope: 'assigned',

        financialPermissions: {
            viewMargin: false,
            editCommission: false,
            overrideCommission: false,
            approvePayment: false,
            approvePayout: false
        },

        approvalRights: {
            approveDeal: false,
            approveDiscount: false,
            approveStageChange: false,
            approveListingPublish: false
        }
    },

    SALES_MANAGER: {
        name: 'Sales Manager',
        department: 'sales',
        description: 'Team lead managing sales executives',
        isSystemRole: true,

        moduleAccess: {
            leads: { view: true, create: true, edit: true, delete: true },
            deals: { view: true, create: true, edit: true, delete: true },
            contacts: { view: true, create: true, edit: true, delete: true },
            companies: { view: true, create: true, edit: true, delete: true },
            activities: { view: true, create: true, edit: true, delete: true },
            inventory: { view: true, create: false, edit: false, delete: false },
            reports: { view: true, create: true, edit: true, delete: false },
            payments: { view: true, create: false, edit: false, delete: false },
            commission: { view: true, create: true, edit: true, delete: false },
            campaigns: { view: true, create: false, edit: false, delete: false },
            matching: { view: true, create: true, edit: true, delete: false }
        },

        defaultDataScope: 'team',

        financialPermissions: {
            viewMargin: true,
            editCommission: true,
            overrideCommission: false,
            approvePayment: false,
            approvePayout: false
        },

        approvalRights: {
            approveDeal: true,
            approveDiscount: true,
            approveStageChange: true,
            approveListingPublish: false
        }
    },

    // Marketing Department Roles
    MARKETING_EXECUTIVE: {
        name: 'Marketing Executive',
        department: 'marketing',
        description: 'Campaign execution and lead generation',
        isSystemRole: true,

        moduleAccess: {
            campaigns: { view: true, create: true, edit: true, delete: false },
            leads: { view: true, create: true, edit: true, delete: false },
            contacts: { view: true, create: true, edit: true, delete: false },
            activities: { view: true, create: true, edit: true, delete: false },
            reports: { view: true, create: false, edit: false, delete: false },
            deals: { view: true, create: false, edit: false, delete: false },
            inventory: { view: true, create: false, edit: false, delete: false },
            payments: { view: false, create: false, edit: false, delete: false },
            commission: { view: false, create: false, edit: false, delete: false },
            companies: { view: true, create: true, edit: true, delete: false },
            matching: { view: true, create: false, edit: false, delete: false }
        },

        defaultDataScope: 'department',

        financialPermissions: {
            viewMargin: false,
            editCommission: false,
            overrideCommission: false,
            approvePayment: false,
            approvePayout: false
        },

        approvalRights: {
            approveDeal: false,
            approveDiscount: false,
            approveStageChange: false,
            approveListingPublish: false
        }
    },

    MARKETING_MANAGER: {
        name: 'Marketing Manager',
        department: 'marketing',
        description: 'Campaign strategy and team management',
        isSystemRole: true,

        moduleAccess: {
            campaigns: { view: true, create: true, edit: true, delete: true },
            leads: { view: true, create: true, edit: true, delete: true },
            contacts: { view: true, create: true, edit: true, delete: true },
            activities: { view: true, create: true, edit: true, delete: true },
            reports: { view: true, create: true, edit: true, delete: false },
            deals: { view: true, create: false, edit: false, delete: false },
            inventory: { view: true, create: false, edit: false, delete: false },
            payments: { view: false, create: false, edit: false, delete: false },
            commission: { view: false, create: false, edit: false, delete: false },
            companies: { view: true, create: true, edit: true, delete: true },
            matching: { view: true, create: false, edit: false, delete: false }
        },

        defaultDataScope: 'department',

        financialPermissions: {
            viewMargin: false,
            editCommission: false,
            overrideCommission: false,
            approvePayment: false,
            approvePayout: false
        },

        approvalRights: {
            approveDeal: false,
            approveDiscount: false,
            approveStageChange: false,
            approveListingPublish: true
        }
    },

    // Inventory Department Roles
    INVENTORY_EXECUTIVE: {
        name: 'Inventory Executive',
        department: 'inventory',
        description: 'Property listing and management',
        isSystemRole: true,

        moduleAccess: {
            inventory: { view: true, create: true, edit: true, delete: false },
            projects: { view: true, create: true, edit: true, delete: false },
            sizes: { view: true, create: true, edit: true, delete: false },
            contacts: { view: true, create: true, edit: true, delete: false },
            activities: { view: true, create: true, edit: true, delete: false },
            reports: { view: true, create: false, edit: false, delete: false },
            leads: { view: true, create: false, edit: false, delete: false },
            deals: { view: true, create: false, edit: false, delete: false },
            payments: { view: false, create: false, edit: false, delete: false },
            commission: { view: false, create: false, edit: false, delete: false },
            campaigns: { view: false, create: false, edit: false, delete: false },
            companies: { view: true, create: true, edit: true, delete: false },
            matching: { view: true, create: false, edit: false, delete: false }
        },

        defaultDataScope: 'all',

        financialPermissions: {
            viewMargin: false,
            editCommission: false,
            overrideCommission: false,
            approvePayment: false,
            approvePayout: false
        },

        approvalRights: {
            approveDeal: false,
            approveDiscount: false,
            approveStageChange: false,
            approveListingPublish: true
        }
    },

    INVENTORY_MANAGER: {
        name: 'Inventory Manager',
        department: 'inventory',
        description: 'Property portfolio management',
        isSystemRole: true,

        moduleAccess: {
            inventory: { view: true, create: true, edit: true, delete: true },
            projects: { view: true, create: true, edit: true, delete: true },
            sizes: { view: true, create: true, edit: true, delete: true },
            contacts: { view: true, create: true, edit: true, delete: true },
            activities: { view: true, create: true, edit: true, delete: true },
            reports: { view: true, create: true, edit: true, delete: false },
            leads: { view: true, create: false, edit: false, delete: false },
            deals: { view: true, create: false, edit: false, delete: false },
            payments: { view: false, create: false, edit: false, delete: false },
            commission: { view: false, create: false, edit: false, delete: false },
            campaigns: { view: false, create: false, edit: false, delete: false },
            companies: { view: true, create: true, edit: true, delete: true },
            matching: { view: true, create: true, edit: true, delete: false }
        },

        defaultDataScope: 'all',

        financialPermissions: {
            viewMargin: false,
            editCommission: false,
            overrideCommission: false,
            approvePayment: false,
            approvePayout: false
        },

        approvalRights: {
            approveDeal: false,
            approveDiscount: false,
            approveStageChange: false,
            approveListingPublish: true
        }
    },

    // Accounts Department Roles
    ACCOUNTS_EXECUTIVE: {
        name: 'Accounts Executive',
        department: 'accounts',
        description: 'Payment processing and commission tracking',
        isSystemRole: true,

        moduleAccess: {
            deals: { view: true, create: false, edit: true, delete: false },
            payments: { view: true, create: true, edit: true, delete: false },
            commission: { view: true, create: true, edit: true, delete: false },
            reports: { view: true, create: true, edit: true, delete: false },
            contacts: { view: true, create: false, edit: true, delete: false },
            companies: { view: true, create: false, edit: true, delete: false },
            leads: { view: true, create: false, edit: false, delete: false },
            inventory: { view: true, create: false, edit: false, delete: false },
            projects: { view: true, create: false, edit: false, delete: false },
            activities: { view: true, create: true, edit: true, delete: false },
            campaigns: { view: false, create: false, edit: false, delete: false },
            sizes: { view: false, create: false, edit: false, delete: false },
            matching: { view: false, create: false, edit: false, delete: false }
        },

        defaultDataScope: 'all',

        financialPermissions: {
            viewMargin: true,
            editCommission: true,
            overrideCommission: false,
            approvePayment: false,
            approvePayout: false
        },

        approvalRights: {
            approveDeal: false,
            approveDiscount: false,
            approveStageChange: false,
            approveListingPublish: false
        }
    },

    ACCOUNTS_MANAGER: {
        name: 'Accounts Manager',
        department: 'accounts',
        description: 'Financial oversight and approvals',
        isSystemRole: true,

        moduleAccess: {
            deals: { view: true, create: false, edit: true, delete: false },
            payments: { view: true, create: true, edit: true, delete: true },
            commission: { view: true, create: true, edit: true, delete: true },
            reports: { view: true, create: true, edit: true, delete: false },
            contacts: { view: true, create: false, edit: true, delete: false },
            companies: { view: true, create: false, edit: true, delete: false },
            leads: { view: true, create: false, edit: false, delete: false },
            inventory: { view: true, create: false, edit: false, delete: false },
            projects: { view: true, create: false, edit: false, delete: false },
            activities: { view: true, create: true, edit: true, delete: true },
            campaigns: { view: false, create: false, edit: false, delete: false },
            sizes: { view: false, create: false, edit: false, delete: false },
            matching: { view: false, create: false, edit: false, delete: false }
        },

        defaultDataScope: 'all',

        financialPermissions: {
            viewMargin: true,
            editCommission: true,
            overrideCommission: true,
            approvePayment: true,
            approvePayout: true
        },

        approvalRights: {
            approveDeal: true,
            approveDiscount: true,
            approveStageChange: false,
            approveListingPublish: false
        }
    }
};

// Helper functions
export const getRoleTemplatesByDepartment = (departmentId) => {
    return Object.values(ROLE_TEMPLATES).filter(role => role.department === departmentId);
};

export const getAllRoleTemplates = () => {
    return Object.values(ROLE_TEMPLATES);
};

export { ROLE_TEMPLATES };

export default {
    ROLE_TEMPLATES,
    getRoleTemplatesByDepartment,
    getAllRoleTemplates
};
