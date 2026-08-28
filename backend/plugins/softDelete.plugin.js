import mongoose from 'mongoose';

export default function softDeletePlugin(schema, options = {}) {
    schema.add({
        isDeleted: { type: Boolean, default: false, index: true },
        deletedAt: { type: Date, default: null },
        deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
    });

    schema.methods.softDelete = function (userId) {
        this.isDeleted = true;
        this.deletedAt = new Date();
        if (userId) this.deletedBy = userId;
        return this.save();
    };

    schema.methods.restore = function () {
        this.isDeleted = false;
        this.deletedAt = null;
        this.deletedBy = null;
        return this.save();
    };

    const excludeDeleted = function (next) {
        if (!this.getOptions().includeDeleted) {
            this.where({ isDeleted: { $ne: true } });
        }
        next();
    };

    schema.pre('find', excludeDeleted);
    schema.pre('findOne', excludeDeleted);
    schema.pre('count', excludeDeleted);
    schema.pre('countDocuments', excludeDeleted);
    schema.pre('aggregate', function (next) {
        if (!this.options || !this.options.includeDeleted) {
            this.pipeline().unshift({ $match: { isDeleted: { $ne: true } } });
        }
        next();
    });
}
