import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import Intake from '../../models/Intake.js';
import { intakeQueue } from '../../services/intakeQueue/IntakeQueue.js';

const STORAGE_ROOT = path.resolve(process.cwd(), 'storage/intake');
const PERMANENT_OCR_DIR = path.resolve(STORAGE_ROOT, 'ocr');

/**
 * Scan and clean orphan files in permanent OCR storage.
 * 
 * STRICT ISOLATION RULES:
 * 1. Scans ONLY storage/intake/ocr/. NEVER touches storage/intake/quarantine/.
 * 2. Every permanent file encodes the exact MongoDB Intake ID: ${intakeId}_${hash}.${ext}.
 * 3. Checks the specific Intake document: Active states (Queued, Processing, Needs Review, Deal Linked) are NEVER deleted.
 * 4. Non-existent DB records require mtime > 2 hours + double verification before unlinking.
 * 5. Unknown, malformed or non-ObjectId filenames are PRESERVED for manual reconciliation.
 * 
 * @param {Object} options 
 * @param {number} options.maxAgeHours - Minimum age before an unreferenced file is considered orphan (default: 2)
 * @returns {Promise<{ scanned: number, unlinked: number, preserved: number, malformed: number }>}
 */
export const scanAndCleanOrphanFiles = async ({ maxAgeHours = 2 } = {}) => {
    if (!fs.existsSync(PERMANENT_OCR_DIR)) {
        return { scanned: 0, unlinked: 0, preserved: 0, malformed: 0 };
    }

    const files = fs.readdirSync(PERMANENT_OCR_DIR);
    const now = Date.now();
    const ageThreshold = maxAgeHours * 60 * 60 * 1000;

    let scanned = 0;
    let unlinked = 0;
    let preserved = 0;
    let malformed = 0;

    for (const file of files) {
        if (file.startsWith('.')) continue; // Skip hidden/system files
        scanned++;

        const filePath = path.resolve(PERMANENT_OCR_DIR, file);
        let stat;
        try {
            stat = fs.statSync(filePath);
        } catch (e) {
            continue;
        }

        if (!stat.isFile()) continue;

        // Extract intakeId: Format is ${intakeId}_${fileHash}.${ext}
        const parts = file.split('_');
        const candidateId = parts[0];

        if (!candidateId || !mongoose.Types.ObjectId.isValid(candidateId)) {
            // Malformed filename: Preserve for manual reconciliation
            console.warn(`[ORPHAN CLEANER] Preserving file with non-standard format: ${file}`);
            malformed++;
            continue;
        }

        // Query corresponding Intake document
        const intake = await Intake.findById(candidateId).select('status file_status').lean();

        if (intake) {
            // Document exists in database
            // Active intakes (Queued, Processing, Needs Review, Ready for Review, Deal Linked, Lead Created) are strictly IMMUNE!
            preserved++;
            continue;
        }

        // Intake document does NOT exist in MongoDB
        // Check age: Must be older than 2 hours to prevent race with in-flight transactions
        const fileAge = now - stat.mtimeMs;
        if (fileAge < ageThreshold) {
            preserved++;
            continue;
        }

        // Double check after 100ms delay to eliminate any transient replica lag
        await new Promise(r => setTimeout(r, 100));
        const recheck = await Intake.findById(candidateId).select('_id').lean();
        if (recheck) {
            preserved++;
            continue;
        }

        // Confirmed unreferenced orphan older than 2 hours: Unlink safely
        try {
            fs.unlinkSync(filePath);
            unlinked++;
            console.info(`[ORPHAN CLEANER] Successfully unlinked orphan file: ${file}`);
        } catch (uErr) {
            console.error(`[ORPHAN CLEANER] Failed to unlink orphan file ${file}:`, uErr.message);
            preserved++;
        }
    }

    return { scanned, unlinked, preserved, malformed };
};

/**
 * Reconcile queued intakes that have not reached BullMQ.
 * Dispatches missing jobs with deterministic jobId: 'ocr_' + intakeId to prevent duplicate jobs.
 * 
 * @param {Object} options 
 * @param {number} options.maxAgeMinutes - Minimum age in minutes before re-enqueueing (default: 2)
 * @returns {Promise<{ scanned: number, reenqueued: number }>}
 */
export const reconcileUnqueuedIntakes = async ({ maxAgeMinutes = 2 } = {}) => {
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
    const queuedIntakes = await Intake.find({
        status: 'Queued',
        file_status: 'ready',
        createdAt: { $lte: cutoff }
    }).limit(100).lean();

    let scanned = 0;
    let reenqueued = 0;

    for (const intake of queuedIntakes) {
        scanned++;
        const deterministicJobId = `ocr_${intake._id}`;

        try {
            // BullMQ will ignore duplicate if job with deterministicJobId already exists in queue
            await intakeQueue.add('process-intake', {
                intakeId: intake._id,
                sourceType: 'ocr',
                rawData: {
                    filePath: intake.raw_source_data?.storagePath,
                    fileHash: intake.raw_source_data?.fileHash,
                    mimeType: intake.raw_source_data?.mimeType,
                    originalName: intake.raw_source_data?.originalName
                },
                userId: intake.createdBy
            }, {
                jobId: deterministicJobId,
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 }
            });
            reenqueued++;
        } catch (qErr) {
            console.warn(`[RECONCILIATION] Notice for intake ${intake._id}:`, qErr.message);
        }
    }

    return { scanned, reenqueued };
};
