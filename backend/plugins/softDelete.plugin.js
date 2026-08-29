import mongoose from 'mongoose';
import { EventEmitter } from 'events';

// Global Event Bus for Audit
export const softDeleteEventBus = new EventEmitter();

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
        const res = this.save(sessionOpts);
        softDeleteEventBus.emit('SOFT_DELETE', { modelName: this.constructor.modelName, id: this._id, userId });
        return res;
    };

    schema.methods.restore = function (sessionOpts = {}) {
        this.isDeleted = false;
        this.deletedAt = null;
        this.deletedBy = null;
        const res = this.save(sessionOpts);
        softDeleteEventBus.emit('RESTORE', { modelName: this.constructor.modelName, id: this._id });
        return res;
    };

    // --- STATIC METHODS ---
    schema.statics.softDeleteOne = async function (query, options = {}) {
        const update = { $set: { isDeleted: true, deletedAt: new Date() } };
        if (options.userId) update.$set.deletedBy = options.userId;
        const doc = await this.findOne(query);
        const res = await this.updateOne(query, update, options);
        if (doc) {
            softDeleteEventBus.emit('SOFT_DELETE', { modelName: this.modelName, id: doc._id, userId: options.userId });
        }
        return res;
    };

    schema.statics.softDeleteMany = async function (query, options = {}) {
        const update = { $set: { isDeleted: true, deletedAt: new Date() } };
        if (options.userId) update.$set.deletedBy = options.userId;
        const docs = await this.find(query);
        const res = await this.updateMany(query, update, options);
        docs.forEach(doc => {
            softDeleteEventBus.emit('SOFT_DELETE', { modelName: this.modelName, id: doc._id, userId: options.userId });
        });
        return res;
    };

    schema.statics.restoreOne = async function (query, options = {}) {
        const doc = await this.findOne(query, null, { includeDeleted: true });
        const res = await this.updateOne(query, { $set: { isDeleted: false, deletedAt: null, deletedBy: null } }, { ...options, includeDeleted: true });
        if (doc) {
            softDeleteEventBus.emit('RESTORE', { modelName: this.modelName, id: doc._id });
        }
        return res;
    };

    // --- QUERY MIDDLEWARE (HIDE DELETED & PREVENT RESURRECTION) ---
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

    // Prevent ReplaceOne and UpdateOne from operating on deleted documents unless explicitly requested
    const preventUpdateOnDeleted = function (next) {
        if (!this.getOptions().includeDeleted) {
            this.where({ isDeleted: { $ne: true } });
        }
        next();
    };
    
    schema.pre('updateOne', preventUpdateOnDeleted);
    schema.pre('updateMany', preventUpdateOnDeleted);
    schema.pre('findOneAndUpdate', preventUpdateOnDeleted);
    schema.pre('replaceOne', preventUpdateOnDeleted);

    // --- BULKWRITE PROTECTION ---
    // Overriding bulkWrite to throw if a delete operation is found
    const originalBulkWrite = schema.statics.bulkWrite || mongoose.Model.bulkWrite;
    schema.statics.bulkWrite = function (ops, options) {
        for (const op of ops) {
            if (op.deleteOne || op.deleteMany) {
                throw new Error("Physical deletion via bulkWrite is strictly prohibited. Convert to updateOne with { $set: { isDeleted: true } }.");
            }
            if (op.replaceOne) {
                // Ensure replaceOne doesn't resurrect silently by forcing it to fail if trying to replace a deleted doc
                // Mongoose bulkWrite doesn't trigger query middleware, so we must enforce it in the query filter
                if (op.replaceOne.filter && !op.replaceOne.filter.isDeleted) {
                     op.replaceOne.filter.isDeleted = { $ne: true };
                }
            }
        }
        return originalBulkWrite.call(this, ops, options);
    };
}
