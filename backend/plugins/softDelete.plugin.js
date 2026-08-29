import mongoose from 'mongoose';

export default function softDeletePlugin(schema, options = {}) {
    schema.add({
        isDeleted: { type: Boolean, default: false, index: true },
        deletedAt: { type: Date, default: null },
        deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
    });

    // --- INSTANCE METHODS ---
    schema.methods.softDelete = function (userId, sessionOpts = {}) {
        this.isDeleted = true;
        this.deletedAt = new Date();
        if (userId) this.deletedBy = userId;
        return this.save(sessionOpts);
    };

    schema.methods.restore = function (sessionOpts = {}) {
        this.isDeleted = false;
        this.deletedAt = null;
        this.deletedBy = null;
        return this.save(sessionOpts);
    };

    // --- STATIC METHODS (SAFE REPOSITORY LAYER) ---
    // Instead of unsafely shadowing native Model.deleteOne which can break Mongoose internals,
    // we provide explicit service-layer methods.

    schema.statics.softDeleteOne = function (query, options = {}) {
        const update = { $set: { isDeleted: true, deletedAt: new Date() } };
        if (options.userId) update.$set.deletedBy = options.userId;
        return this.updateOne(query, update, options);
    };

    schema.statics.softDeleteMany = function (query, options = {}) {
        const update = { $set: { isDeleted: true, deletedAt: new Date() } };
        if (options.userId) update.$set.deletedBy = options.userId;
        return this.updateMany(query, update, options);
    };

    schema.statics.hardDeleteOne = function (query, options = {}) {
        if (!options.hardDelete) throw new Error("Hard delete requires explicit { hardDelete: true } intent.");
        return this.deleteOne(query, options);
    };

    schema.statics.hardDeleteMany = function (query, options = {}) {
        if (!options.hardDelete) throw new Error("Hard delete requires explicit { hardDelete: true } intent.");
        return this.deleteMany(query, options);
    };

    schema.statics.restoreOne = function (query, options = {}) {
        return this.updateOne(query, { $set: { isDeleted: false, deletedAt: null, deletedBy: null } }, options);
    };

    // --- QUERY MIDDLEWARE ---
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
