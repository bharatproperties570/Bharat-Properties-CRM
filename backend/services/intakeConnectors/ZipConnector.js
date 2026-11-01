import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import BaseConnector from './BaseConnector.js';
import { parseContent } from '../../src/modules/intake/intakeParser.js';
import { validateZipPreflight, ZIP_LIMITS, ZipSecurityError } from '../../src/utils/zipPreflightValidator.js';

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

            // 🛡️ Gate 2R.12: Terminable Extraction Worker with 5,000ms hard timeout
            let timeoutId;
            const extractionPromise = (async () => {
                const contents = await JSZip.loadAsync(data);
                const extractedTexts = [];
                let cumulativeExtractedBytes = 0;

                for (const filename of Object.keys(contents.files)) {
                    const file = contents.files[filename];

                    if (file.dir || filename.startsWith('__MACOSX') || filename.split('/').pop().startsWith('.')) {
                        continue;
                    }

                    const lowerName = filename.toLowerCase();
                    if (lowerName.endsWith('.txt') || lowerName.endsWith('.csv')) {
                        const text = await file.async('string');
                        cumulativeExtractedBytes += Buffer.byteLength(text, 'utf8');

                        if (cumulativeExtractedBytes > ZIP_LIMITS.MAX_TOTAL_UNCOMPRESSED_SIZE) {
                            throw new ZipSecurityError(
                                'ZIP_CUMULATIVE_SIZE_EXCEEDED',
                                `Extracted contents exceeded maximum cumulative size limit (${(ZIP_LIMITS.MAX_TOTAL_UNCOMPRESSED_SIZE / (1024 * 1024)).toFixed(0)} MB)`
                            );
                        }

                        extractedTexts.push({
                            filename,
                            content: text
                        });
                    }
                }

                return extractedTexts;
            })();

            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new ZipSecurityError(
                        'EXTRACTION_TIMEOUT',
                        `ZIP extraction exceeded maximum timeout of ${ZIP_LIMITS.EXTRACTION_TIMEOUT_MS}ms`
                    ));
                }, ZIP_LIMITS.EXTRACTION_TIMEOUT_MS);
            });

            let extractedTexts;
            try {
                extractedTexts = await Promise.race([extractionPromise, timeoutPromise]);
            } finally {
                clearTimeout(timeoutId);
            }

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
            // Guarantee file cleanup
            if (fs.existsSync(filePath)) {
                try { fs.unlinkSync(filePath); } catch (e) {}
            }
        }
    }
}

export default new ZipConnector();
