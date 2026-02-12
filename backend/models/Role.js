import mongoose from "mongoose";

const RoleSchema = new mongoose.Schema({
    // ========== Basic Info ==========
    name: {
        type: String,
        required: [true, "Role name is required"],
        trim: true,
    },
    department: {
        type: String,
        enum: {
            values: ['sales', 'marketing', 'inventory', 'accounts'],
            message: '{VALUE} is not a valid department'
        },
        required: [true, 'Department is required'],
        index: true
    },
    description: {
        type: String,
        trim: true
    },
    isSystemRole: {
        type: Boolean,
        default: false,
    },

    // ========== Module Access ==========
    // CRUD permissions for each module
    moduleAccess: {
        // Core CRM Modules
        leads: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        },
        deals: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        },
        contacts: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        },
        companies: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        },

        // Inventory Modules
        inventory: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        },
        projects: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        },
        sizes: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        },

        // Financial Modules
        payments: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        },
        commission: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        },

        // Marketing Modules
        campaigns: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        },

        // Other Modules
        reports: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        },
        matching: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        },
        activities: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        }
    },

    // ========== Data Scope Control ==========
    defaultDataScope: {
        type: String,
        enum: {
            values: ['assigned', 'team', 'department', 'all'],
            message: '{VALUE} is not a valid data scope'
        },
        default: 'assigned'
    },

    // ========== Financial Permissions ==========
    financialPermissions: {
        viewMargin: { type: Boolean, default: false },
        editCommission: { type: Boolean, default: false },
        overrideCommission: { type: Boolean, default: false },
        approvePayment: { type: Boolean, default: false },
        approvePayout: { type: Boolean, default: false }
    },

    // ========== Approval Rights ==========
    approvalRights: {
        approveDeal: { type: Boolean, default: false },
        approveDiscount: { type: Boolean, default: false },
        approveStageChange: { type: Boolean, default: false },
        approveListingPublish: { type: Boolean, default: false }
    },

    // ========== Legacy Support ==========
    // Keep old 'permissions' field for backward compatibility
    permissions: {
        type: Object,
        default: {}
    },
    isSystem: {
        type: Boolean,
        get: function () {
            return this.isSystemRole;
        }
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true, getters: true },
    toObject: { virtuals: true, getters: true }
});

// ========== Indexes ==========
RoleSchema.index({ department: 1, isSystemRole: 1 });
RoleSchema.index({ name: 1, department: 1 }, { unique: true });

// ========== Methods ==========
// Check if role has specific module permission
RoleSchema.methods.hasModuleAccess = function (module, action) {
    if (!this.moduleAccess || !this.moduleAccess[module]) {
        return false;
    }
    return this.moduleAccess[module][action] === true;
};

// Get all accessible modules
RoleSchema.methods.getAccessibleModules = function () {
    const modules = [];
    if (!this.moduleAccess) return modules;

    for (const [module, permissions] of Object.entries(this.moduleAccess)) {
        if (permissions.view) {
            modules.push(module);
        }
    }
    return modules;
};

// Clone role (for creating custom roles from templates)
RoleSchema.methods.clone = function (newName, newDescription) {
    const clonedRole = {
        name: newName,
        department: this.department,
        description: newDescription || this.description,
        isSystemRole: false,
        moduleAccess: JSON.parse(JSON.stringify(this.moduleAccess)),
        defaultDataScope: this.defaultDataScope,
        financialPermissions: JSON.parse(JSON.stringify(this.financialPermissions)),
        approvalRights: JSON.parse(JSON.stringify(this.approvalRights))
    };
    return clonedRole;
};

// ========== Static Methods ==========
// Get all roles for a department
RoleSchema.statics.getByDepartment = function (department) {
    return this.find({ department }).sort({ isSystemRole: -1, name: 1 });
};

// Get system roles only
RoleSchema.statics.getSystemRoles = function () {
    return this.find({ isSystemRole: true }).sort({ department: 1, name: 1 });
};

// Get custom roles only
RoleSchema.statics.getCustomRoles = function () {
    return this.find({ isSystemRole: false }).sort({ department: 1, name: 1 });
};

export default mongoose.model("Role", RoleSchema);
