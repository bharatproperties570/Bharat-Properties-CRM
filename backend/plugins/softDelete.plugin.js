import mongoose from 'mongoose';
import { EventEmitter } from 'events';

// Keeping EventEmitter ONLY as a post-commit notification mechanism for non-audit async tasks
export const softDeleteEventBus = new EventEmitter();

export default function softDeletePlugin(schema, options = {}) {
    if (!schema.path('isDeleted')) {
        schema.add({
            isDeleted: { type: Boolean, default: false, index: true }
        });
    }
    if (!schema.path('deletedAt')) {
        schema.add({
            deletedAt: { type: Date, default: null }
        });
    }
    if (!schema.path('deletedBy')) {
        schema.add({
            deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
        });
    }

    const createAuditRecord = async (modelName, docId, action, userId, reason, previousState, session) => {
        try {
            // Option A - Transactional Audit Record using Native driver to bypass validations, ensuring atomicity
            const activityCollection = mongoose.connection.collection('activities');
            await activityCollection.insertOne({
                entityId: docId,
                entityType: modelName,
                subject: `${action}: ${modelName}`,
                type: 'System Event',
                dueDate: new Date(),
                action: action,
                userId: userId || null,
                reason: reason || 'Application operation',
                previousState: previousState,
                createdAt: new Date(),
                updatedAt: new Date()
            }, session ? { session } : {});
        } catch (auditErr) {
            console.warn(`[SOFT_DELETE_AUDIT_WARN] Could not record audit for ${modelName}:${docId}:`, auditErr.message);
        }
    };

    // --- INSTANCE METHODS ---
    schema.methods.softDelete = async function (userId, sessionOpts = {}) {
        this.isDeleted = true;
        this.deletedAt = new Date();
        if (userId) this.deletedBy = userId;
        const res = await this.save(sessionOpts);
        
        await createAuditRecord(this.constructor.modelName, this._id, 'SOFT_DELETE', userId, sessionOpts.reason, null, sessionOpts.session);
        softDeleteEventBus.emit('SOFT_DELETE', { modelName: this.constructor.modelName, id: this._id, userId });
        
        return res;
    };

    schema.methods.restore = async function (sessionOpts = {}) {
        this.isDeleted = false;
        this.deletedAt = null;
        this.deletedBy = null;
        const res = await this.save(sessionOpts);
        
        await createAuditRecord(this.constructor.modelName, this._id, 'RESTORE', sessionOpts.userId, sessionOpts.reason, null, sessionOpts.session);
        softDeleteEventBus.emit('RESTORE', { modelName: this.constructor.modelName, id: this._id });
        
        return res;
    };

    // --- STATIC METHODS ---
    schema.statics.softDeleteOne = async function (query, options = {}) {
        const update = { $set: { isDeleted: true, deletedAt: new Date() } };
        if (options.userId) update.$set.deletedBy = options.userId;
        
        const doc = await this.findOne(query, null, { session: options.session });
        if (!doc) return null;
        
        const res = await this.updateOne({ _id: doc._id }, update, options);
        if (res.modifiedCount > 0) {
            await createAuditRecord(this.modelName, doc._id, 'SOFT_DELETE', options.userId, options.reason, doc.toObject ? doc.toObject() : doc, options.session);
            softDeleteEventBus.emit('SOFT_DELETE', { modelName: this.modelName, id: doc._id, userId: options.userId });
        }
        return Object.assign(doc, {
            acknowledged: res.acknowledged !== false,
            matchedCount: res.matchedCount || 1,
            modifiedCount: res.modifiedCount || 1,
            isDeleted: true,
            deletedAt: update.$set.deletedAt,
            deletedBy: update.$set.deletedBy
        });
    };

    schema.statics.softDeleteMany = async function (query, options = {}) {
        const update = { $set: { isDeleted: true, deletedAt: new Date() } };
        if (options.userId) update.$set.deletedBy = options.userId;
        
        const docs = await this.find(query, null, { session: options.session });
        if (docs.length === 0) return { acknowledged: true, matchedCount: 0, modifiedCount: 0, deletedCount: 0 };
        
        const ids = docs.map(d => d._id);
        const res = await this.updateMany({ _id: { $in: ids } }, update, options);
        res.deletedCount = res.modifiedCount;
        
        for (const doc of docs) {
            await createAuditRecord(this.modelName, doc._id, 'SOFT_DELETE', options.userId, options.reason, doc.toObject ? doc.toObject() : doc, options.session);
            softDeleteEventBus.emit('SOFT_DELETE', { modelName: this.modelName, id: doc._id, userId: options.userId });
        }
        return res;
    };

    schema.statics.restoreOne = async function (query, options = {}) {
        const doc = await this.findOne(query, null, { includeDeleted: true, session: options.session });
        if (!doc) return null;
        
        const res = await this.updateOne({ _id: doc._id }, { $set: { isDeleted: false, deletedAt: null, deletedBy: null } }, { ...options, includeDeleted: true });
        if (res.modifiedCount > 0) {
            await createAuditRecord(this.modelName, doc._id, 'RESTORE', options.userId, options.reason, doc.toObject ? doc.toObject() : doc, options.session);
            softDeleteEventBus.emit('RESTORE', { modelName: this.modelName, id: doc._id });
        }
        return Object.assign(doc, {
            acknowledged: res.acknowledged !== false,
            matchedCount: res.modifiedCount || 1,
            modifiedCount: res.modifiedCount || 1,
            isDeleted: false,
            deletedAt: null,
            deletedBy: null
        });
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
            const pipeline = this.pipeline();
            if (pipeline && pipeline.length > 0 && pipeline[0].$geoNear) {
                pipeline.splice(1, 0, { $match: { isDeleted: { $ne: true } } });
            } else if (pipeline) {
                pipeline.unshift({ $match: { isDeleted: { $ne: true } } });
            }
        }
        next();
    });

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
    const originalBulkWrite = schema.statics.bulkWrite || mongoose.Model.bulkWrite;
    schema.statics.bulkWrite = function (ops, options) {
        for (const op of ops) {
            if (op.deleteOne || op.deleteMany) {
                throw new Error("Physical deletion via bulkWrite is strictly prohibited. Convert to updateOne with { $set: { isDeleted: true } }.");
            }
            if (op.replaceOne) {
                if (op.replaceOne.filter && !op.replaceOne.filter.isDeleted) {
                     op.replaceOne.filter.isDeleted = { $ne: true };
                }
            }
        }
        return originalBulkWrite.call(this, ops, options);
    };
}
