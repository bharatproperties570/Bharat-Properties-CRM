import mongoose from 'mongoose';

export default function ownershipPlugin(schema, options = {}) {
    schema.add({
        organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
        branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
        ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
        teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
        visibility: { type: String, enum: ['Everyone', 'Team', 'Private'], default: 'Team' },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    });

    // Automatically update `updatedBy` if passed via options
    schema.pre('save', function (next, options) {
        if (options && options.userId) {
            this.updatedBy = options.userId;
            if (this.isNew && !this.createdBy) {
                this.createdBy = options.userId;
            }
        }
        next();
    });
}
