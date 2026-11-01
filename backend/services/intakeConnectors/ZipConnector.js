import fs from 'fs';
import path from 'path';
import { Worker } from 'node:worker_threads';
import BaseConnector from './BaseConnector.js';
import { parseContent } from '../../src/modules/intake/intakeParser.js';
import { validateZipPreflight, ZIP_LIMITS, ZipSecurityError } from '../../src/utils/zipPreflightValidator.js';

const WORKER_SCRIPT_PATH = path.resolve(process.cwd(), 'backend/src/workers/zipExtractionWorker.js');

/**
 * Spawns a dedicated worker thread for ZIP decompression with hard cancellation.
 * @param {string} filePath - Absolute path to zip file
 * @param {number} maxBytes - Maximum cumulative allowed uncompressed bytes
 * @param {number} timeoutMs - Execution timeout in ms
 * @returns {Promise<Array<{filename: string, content: string}>>}
 */
export const runExtractionWorker = (
    filePath,
    maxBytes = ZIP_LIMITS.MAX_TOTAL_UNCOMPRESSED_SIZE,
    timeoutMs = ZIP_LIMITS.EXTRACTION_TIMEOUT_MS
) => {
    return new Promise((resolve, reject) => {
        let isSettled = false;
        let worker;

        try {
            worker = new Worker(WORKER_SCRIPT_PATH, {
                workerData: { filePath, maxBytes }
            });
        } catch (spawnErr) {
            return reject(new ZipSecurityError('WORKER_SPAWN_FAILED', spawnErr.message));
        }

        const timer = setTimeout(async () => {
            if (isSettled) return;
            isSettled = true;
            try {
                await worker.terminate();
            } catch (termErr) {
                console.error('[ZipConnector] Error terminating worker on timeout:', termErr.message);
            }
            reject(new ZipSecurityError(
                'EXTRACTION_TIMEOUT',
                `ZIP extraction exceeded maximum timeout of ${timeoutMs}ms and worker was terminated`
            ));
        }, timeoutMs);

        worker.on('message', (message) => {
            if (isSettled) return;
            isSettled = true;
            clearTimeout(timer);
            if (message && message.success) {
                resolve(message.extractedTexts || []);
            } else {
                reject(new ZipSecurityError(message?.code || 'EXTRACTION_ERROR', message?.error || 'Extraction failed in worker'));
            }
        });

        worker.on('error', (err) => {
            if (isSettled) return;
            isSettled = true;
            clearTimeout(timer);
            reject(new ZipSecurityError('WORKER_ERROR', err.message));
        });

        worker.on('exit', (code) => {
            if (isSettled) return;
            isSettled = true;
            clearTimeout(timer);
            if (code !== 0) {
                reject(new ZipSecurityError('WORKER_EXITED', `Extraction worker exited abnormally with code ${code}`));
            }
        });
    });
};

class ZipConnector extends BaseConnector {
    constructor() {
        super();
        this.sourceType = 'zip';
    }

    async process(inputData) {
        const { filePath: rawPath, originalName, user_id } = inputData;
        const filePath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
        
        console.log(`[ZipConnector] Processing file: ${filePath}`);
        
        if (!fs.existsSync(filePath)) {
            console.error(`[ZipConnector] CRITICAL ERROR: File NOT found at ${filePath}`);
            throw new Error(`File not found at: ${filePath}`);
        }
        
        try {
            const data = fs.readFileSync(filePath);

            // 🛡️ Gate 2R.12: Binary Preflight Security Validation
            // Validates EOCD, rejects ZIP64/multi-disk, checks header consistency, detects overlaps, enforces limits
            validateZipPreflight(data);

            // 🛡️ Gate 2R.12: Dedicated Terminable Extraction Worker Thread
            // Runs decompression in an isolated thread; immediately terminates thread on 5,000ms timeout
            const extractedTexts = await runExtractionWorker(
                filePath,
                ZIP_LIMITS.MAX_TOTAL_UNCOMPRESSED_SIZE,
                ZIP_LIMITS.EXTRACTION_TIMEOUT_MS
            );

            const consolidatedContent = extractedTexts.map(t => `--- File: ${t.filename} ---\n${t.content}`).join('\n\n');
            
            // Pass consolidated content to NLP Parser
            const extracted = await parseContent(consolidatedContent);

            const normalized = {
                title: extracted.projectName || extracted.location || originalName || 'ZIP Import',
                description: consolidatedContent,
                location: extracted.location || '',
                sector: extracted.sector || '',
                property_type: extracted.property_type || '',
                size: extracted.size || '',
                price: extracted.budget || extracted.price || '',
                contact_numbers: extracted.contact_numbers || [],
                seller_intent: extracted.intent || 'unknown',
                extracted_entities: extracted,
                verification_status: 'unverified',
                source_confidence: extractedTexts.length > 0 ? 80 : 10,
                raw_source_data: { extractedFilesCount: extractedTexts.length, originalName }
            };

            const finalData = this.validateAndClean(normalized);
            const hash = this.generateDuplicateHash(consolidatedContent);

            return { ...finalData, duplicate_hash: hash, createdBy: user_id };
        } finally {
            // Guarantee file cleanup after completion, failure, or timeout
            if (fs.existsSync(filePath)) {
                try { fs.unlinkSync(filePath); } catch (e) {}
            }
        }
    }
}

export default new ZipConnector();
