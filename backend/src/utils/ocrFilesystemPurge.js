import fs from 'fs';
import path from 'path';
import Intake from '../../models/Intake.js';

const STORAGE_ROOT = path.resolve(process.cwd(), 'storage/intake');
const PERMANENT_OCR_DIR = path.resolve(STORAGE_ROOT, 'ocr');
const TRASH_DIR = path.resolve(STORAGE_ROOT, 'trash');

/**
 * Ensure storage directories exist
 */
export const ensureStorageDirectories = () => {
    if (!fs.existsSync(PERMANENT_OCR_DIR)) {
        fs.mkdirSync(PERMANENT_OCR_DIR, { recursive: true });
    }
    if (!fs.existsSync(TRASH_DIR)) {
        fs.mkdirSync(TRASH_DIR, { recursive: true });
    }
};

/**
 * Safely revert a staged trash file to permanent storage using atomic no-replace semantics.
 * If the destination already exists (e.g. a replacement was uploaded during lease expiry),
 * the replacement is PRESERVED, the stale trash is discarded, and a reconciliation warning is logged.
 * 
 * @param {string} trashPath 
 * @param {string} permanentPath 
 * @returns {boolean} true if restored to destination, false if destination existed and trash discarded
 */
export const safelyRevertTrash = (trashPath, permanentPath) => {
    if (!fs.existsSync(trashPath)) return false;

    try {
        // Atomic no-replace via hardlink: Fails with EEXIST if destination already exists!
        fs.linkSync(trashPath, permanentPath);
        fs.unlinkSync(trashPath);
        return true;
    } catch (err) {
        if (err.code === 'EEXIST') {
            console.warn(`[PURGE FENCE] Permanent destination already exists (${permanentPath}). Preserving current file; discarding stale trash (${trashPath}).`);
            try { fs.unlinkSync(trashPath); } catch (uErr) {}
            return false;
        }
        // Fallback for cross-device links or filesystems that reject hardlinks
        if (err.code === 'EXDEV' || err.code === 'ENOTSUP') {
            if (fs.existsSync(permanentPath)) {
                console.warn(`[PURGE FENCE] Fallback: Destination already exists. Discarding stale trash without overwrite.`);
                try { fs.unlinkSync(trashPath); } catch (uErr) {}
                return false;
            }
            fs.renameSync(trashPath, permanentPath);
            return true;
        }
        throw err;
    }
};

/**
 * Purge archived OCR images older than 7 days using monotonic fencing tokens and two-phase staging.
 * 
 * STRICT RETENTION RULE: Only 'Archived' status with purgeScheduledAt <= now is eligible.
 * Active, Needs Review, Queued, Processing, Deal Linked, and Failed are strictly immune.
 * 
 * @param {Object} options 
 * @param {number} options.olderThanDays - Default 7 days (Approved policy)
 * @param {number} options.batchSize - Batch size per sweep
 * @returns {Promise<{ scanned: number, purged: number, skipped: number }>}
 */
export const purgeArchivedOcrImages = async ({ olderThanDays = 7, batchSize = 50 } = {}) => {
    ensureStorageDirectories();
    const now = new Date();
    const cutoff = new Date(now.getTime() - olderThanDays * 24 * 60 * 60 * 1000);

    const candidates = await Intake.find({
        status: 'Archived',
        file_status: 'ready',
        $or: [
            { purgeScheduledAt: { $lte: now } },
            { archivedAt: { $lte: cutoff } },
            { updatedAt: { $lte: cutoff } }
        ]
    }).limit(batchSize).lean();

    let scanned = 0;
    let purged = 0;
    let skipped = 0;

    for (const intake of candidates) {
        scanned++;
        const filePath = intake.raw_source_data?.storagePath;
        if (!filePath || !fs.existsSync(filePath)) {
            // File already absent on disk; finalize DB
            await Intake.updateOne(
                { _id: intake._id, status: 'Archived' },
                { $set: { file_status: 'purged' }, $unset: { 'raw_source_data.storagePath': 1, purgeScheduledAt: 1 } }
            );
            purged++;
            continue;
        }

        // 1. Atomically acquire purge lease with monotonic fencing token increment
        const lease = await Intake.findOneAndUpdate(
            {
                _id: intake._id,
                status: 'Archived',
                file_status: 'ready',
                $or: [
                    { purgeLeaseExpiresAt: { $lte: now } },
                    { purgeLeaseExpiresAt: { $exists: false } }
                ]
            },
            {
                $set: {
                    file_status: 'purging',
                    purgeLeaseExpiresAt: new Date(now.getTime() + 30000) // 30s lease
                },
                $inc: { purgeFencingToken: 1 }
            },
            { new: true }
        );

        if (!lease) {
            skipped++;
            continue; // Leased by another worker or restored by operator
        }

        const fencingToken = lease.purgeFencingToken;
        const trashPath = path.resolve(TRASH_DIR, `${intake._id}.${fencingToken}.trash`);

        try {
            // 2. Stage file to trash path
            fs.renameSync(filePath, trashPath);

            // 3. Fenced confirmation check: verify token has not been bumped and status is still purging
            const confirmed = await Intake.findOneAndUpdate(
                {
                    _id: intake._id,
                    file_status: 'purging',
                    purgeFencingToken: fencingToken
                },
                {
                    $set: { file_status: 'purged' },
                    $unset: { 'raw_source_data.storagePath': 1, purgeScheduledAt: 1, purgeLeaseExpiresAt: 1 }
                },
                { new: true }
            );

            if (confirmed) {
                // Token matches; unlink staged trash safely
                if (fs.existsSync(trashPath)) {
                    fs.unlinkSync(trashPath);
                }
                purged++;
            } else {
                // Token mismatched (lease expired or restored by operator): Safely revert trash!
                safelyRevertTrash(trashPath, filePath);
                skipped++;
            }
        } catch (stageErr) {
            console.error(`[PURGE FENCE Error] Failed staging intake ${intake._id}:`, stageErr.message);
            if (fs.existsSync(trashPath)) {
                safelyRevertTrash(trashPath, filePath);
            }
            await Intake.updateOne(
                { _id: intake._id, file_status: 'purging', purgeFencingToken: fencingToken },
                { $set: { file_status: 'ready' }, $unset: { purgeLeaseExpiresAt: 1 } }
            );
            skipped++;
        }
    }

    return { scanned, purged, skipped };
};
