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
 * Returns { status: 'PROCEED' | 'ABORT', hasDuplicates: boolean, duplicateCount: number, duplicates: Array }
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
 * 1. Runs preflight check.
 * 2. If duplicates are found, aborts immediately without modifying any records.
 * 3. If clean, ensures the unique index is created on fileId.
 */
export async function runMigration(model = DirectUploadRecord) {
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
        idx.name === TARGET_INDEX_NAME && idx.unique === true
    );

    if (!hasTargetUniqueIndex) {
        // Drop any legacy or conflicting single-field index on fileId (e.g. standard fileId_1)
        const legacyFileIdIndexes = existingIndexes.filter(idx => 
            idx.key && Object.keys(idx.key).length === 1 && idx.key.fileId === 1 && idx.name !== TARGET_INDEX_NAME
        );
        for (const legacyIdx of legacyFileIdIndexes) {
            await model.collection.dropIndex(legacyIdx.name).catch(() => {});
        }

        try {
            await model.collection.createIndex(TARGET_INDEX_SPEC, TARGET_INDEX_OPTIONS);
        } catch (idxErr) {
            // If already created concurrently with identical options, verify and succeed
            if (idxErr.codeName === 'IndexOptionsConflict' || (idxErr.message && idxErr.message.includes('already exists'))) {
                const refreshed = await model.collection.indexes();
                const exists = refreshed.some(i => i.key && Object.keys(i.key).length === 1 && i.key.fileId === 1 && i.unique);
                if (!exists) throw idxErr;
            } else {
                throw idxErr;
            }
        }
    }

    return {
        success: true,
        migration: MIGRATION_NAME,
        indexName: TARGET_INDEX_NAME,
        preflight
    };
}
