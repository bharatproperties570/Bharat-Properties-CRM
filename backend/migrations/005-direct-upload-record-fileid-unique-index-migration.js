import mongoose from 'mongoose';
import DirectUploadRecord from '../models/DirectUploadRecord.js';

export const MIGRATION_NAME = '005-direct-upload-record-fileid-unique-index-migration';
export const TARGET_INDEX_NAME = 'direct_upload_records_fileid_unique';
export const TARGET_INDEX_SPEC = { fileId: 1 };
export const TARGET_INDEX_OPTIONS = {
    name: TARGET_INDEX_NAME,
    unique: true,
    background: true
};

/**
 * Preflight check: scans DirectUploadRecord collection for existing duplicate fileIds.
 * SAFETY RULE: NEVER deletes or overwrites any existing records.
 * Returns { status: 'PROCEED' | 'ABORT', hasDuplicates: boolean, duplicateCount: number, duplicates: Array, reason?: string }
 */
export async function preflightCheck(model = DirectUploadRecord) {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
        throw new Error('Database connection is not ready for migration preflight');
    }

    const duplicates = await model.aggregate([
        {
            $group: {
                _id: '$fileId',
                count: { $sum: 1 },
                docIds: { $push: '$_id' },
                userIds: { $push: '$userId' },
                tenantIds: { $push: '$tenantId' }
            }
        },
        {
            $match: {
                count: { $gt: 1 }
            }
        }
    ]);

    if (duplicates && duplicates.length > 0) {
        return {
            status: 'ABORT',
            hasDuplicates: true,
            duplicateCount: duplicates.length,
            duplicates: duplicates.map(d => ({
                fileId: d._id,
                count: d.count,
                docIds: d.docIds,
                userIds: d.userIds,
                tenantIds: d.tenantIds
            })),
            reason: `Detected ${duplicates.length} duplicate fileId value(s) in collection. Migration cannot apply unique index without manual DBA resolution.`
        };
    }

    return {
        status: 'PROCEED',
        hasDuplicates: false,
        duplicateCount: 0,
        duplicates: []
    };
}

/**
 * Executes migration safely:
 * 1. Runs preflight duplicate scan.
 * 2. If duplicates are found, aborts immediately without modifying or deleting any records.
 * 3. Inspects existing index definitions.
 * 4. Drops any legacy conflicting single-field indexes without swallowing drop errors.
 * 5. Builds the target unique index with post-build verification and handles concurrent writes fail-closed.
 * 6. Completely safe and idempotent on repeated execution.
 */
export async function runMigration(model = DirectUploadRecord) {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
        throw new Error('Database connection is not ready for migration execution');
    }

    const preflight = await preflightCheck(model);

    if (preflight.status === 'ABORT') {
        const error = new Error(`Migration ${MIGRATION_NAME} ABORTED: Pre-existing duplicates detected on fileId. Preserving all records.`);
        error.preflight = preflight;
        throw error;
    }

    // Check existing indexes
    const existingIndexes = await model.collection.indexes();
    
    // Check if target unique index already exists with correct name and uniqueness
    const hasTargetUniqueIndex = existingIndexes.some(idx => 
        idx.name === TARGET_INDEX_NAME && idx.unique === true && idx.key && idx.key.fileId === 1 && Object.keys(idx.key).length === 1
    );

    if (hasTargetUniqueIndex) {
        return {
            success: true,
            migration: MIGRATION_NAME,
            indexName: TARGET_INDEX_NAME,
            alreadyApplied: true,
            preflight
        };
    }

    // Identify legacy or conflicting single-field index on fileId (e.g. legacy fileId_1)
    const legacyFileIdIndexes = existingIndexes.filter(idx => 
        idx.key && Object.keys(idx.key).length === 1 && idx.key.fileId === 1 && idx.name !== TARGET_INDEX_NAME
    );

    // Drop legacy conflicting index without swallowing drop failures
    for (const legacyIdx of legacyFileIdIndexes) {
        try {
            await model.collection.dropIndex(legacyIdx.name);
        } catch (dropErr) {
            const err = new Error(`Migration ${MIGRATION_NAME} failed to drop conflicting legacy index "${legacyIdx.name}": ${dropErr.message}`);
            err.originalError = dropErr;
            err.legacyIndex = legacyIdx;
            throw err;
        }

        const postDropIndexes = await model.collection.indexes();
        if (postDropIndexes.some(i => i.name === legacyIdx.name)) {
            throw new Error(`Migration ${MIGRATION_NAME} index drop verification failed: Index "${legacyIdx.name}" still exists after dropIndex.`);
        }
    }

    // Build the unique index
    try {
        await model.collection.createIndex(TARGET_INDEX_SPEC, TARGET_INDEX_OPTIONS);
    } catch (idxErr) {
        // Detect concurrent write collision during index creation
        if (idxErr.code === 11000 || idxErr.codeName === 'DuplicateKey' || (idxErr.message && idxErr.message.includes('E11000'))) {
            const concurrentErr = new Error(`Migration ${MIGRATION_NAME} ABORTED: Concurrent write introduced duplicate fileId during unique index creation: ${idxErr.message}. All existing records preserved.`);
            concurrentErr.code = 11000;
            concurrentErr.isConcurrentCollision = true;
            throw concurrentErr;
        }

        // If created concurrently with identical options, verify and succeed
        if (idxErr.codeName === 'IndexOptionsConflict' || (idxErr.message && idxErr.message.includes('already exists'))) {
            const refreshed = await model.collection.indexes();
            const exists = refreshed.some(i => i.name === TARGET_INDEX_NAME && i.unique === true);
            if (!exists) {
                throw new Error(`Migration ${MIGRATION_NAME} failed during unique index creation: ${idxErr.message}`);
            }
        } else {
            throw new Error(`Migration ${MIGRATION_NAME} failed during unique index creation: ${idxErr.message}`);
        }
    }

    // Post-build verification
    const postBuildIndexes = await model.collection.indexes();
    const verifiedIndex = postBuildIndexes.find(i => 
        i.name === TARGET_INDEX_NAME && i.unique === true && i.key && i.key.fileId === 1 && Object.keys(i.key).length === 1
    );

    if (!verifiedIndex) {
        throw new Error(`Migration ${MIGRATION_NAME} post-build verification failed: Unique index "${TARGET_INDEX_NAME}" was not found in collection indexes.`);
    }

    return {
        success: true,
        migration: MIGRATION_NAME,
        indexName: TARGET_INDEX_NAME,
        alreadyApplied: false,
        preflight
    };
}

/**
 * Rollback helper: drops the unique index if needed by DBA.
 */
export async function rollbackMigration(model = DirectUploadRecord) {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
        throw new Error('Database connection is not ready for migration rollback');
    }

    const existingIndexes = await model.collection.indexes();
    const hasTarget = existingIndexes.some(i => i.name === TARGET_INDEX_NAME);

    if (hasTarget) {
        await model.collection.dropIndex(TARGET_INDEX_NAME);
    }

    const postRollbackIndexes = await model.collection.indexes();
    const stillExists = postRollbackIndexes.some(i => i.name === TARGET_INDEX_NAME);
    if (stillExists) {
        throw new Error(`Migration ${MIGRATION_NAME} rollback verification failed: Index "${TARGET_INDEX_NAME}" still exists after dropIndex.`);
    }

    return {
        success: true,
        migration: MIGRATION_NAME,
        indexDropped: hasTarget
    };
}
