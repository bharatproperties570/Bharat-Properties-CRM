import fs from 'fs';
import path from 'path';
import { createWorker } from 'tesseract.js';
import BaseConnector from './BaseConnector.js';
import { parseContent } from '../../src/modules/intake/intakeParser.js';

class OcrConnector extends BaseConnector {
    constructor() {
        super();
        this.sourceType = 'ocr';
    }

    async process(inputData) {
        const { filePath: rawPath, originalName, mimeType, fileHash, user_id } = inputData;
        const filePath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);

        console.log(`[OcrConnector] Processing OCR image at: ${filePath}`);

        if (!fs.existsSync(filePath)) {
            console.error(`[OcrConnector] CRITICAL ERROR: File NOT found at ${filePath}`);
            throw new Error(`OCR image file not found on disk at: ${filePath}`);
        }

        let extractedText = '';
        const worker = await createWorker('eng');
        try {
            const start = Date.now();
            const { data } = await worker.recognize(filePath);
            extractedText = data?.text || '';
            const duration = ((Date.now() - start) / 1000).toFixed(2);
            console.log(`[OcrConnector] Recognition complete in ${duration}s. Text length: ${extractedText.length}`);
        } finally {
            await worker.terminate();
        }

        // Parse extracted text with NLP Entity Parser
        const extracted = await parseContent(extractedText);

        const normalized = {
            title: extracted.projectName || extracted.location || originalName || 'OCR Document',
            description: extractedText,
            content: extractedText,
            location: extracted.location || '',
            sector: extracted.sector || '',
            property_type: extracted.property_type || '',
            size: extracted.size || '',
            price: extracted.budget || extracted.price || '',
            contact_numbers: extracted.contact_numbers || [],
            seller_intent: extracted.intent || 'unknown',
            extracted_entities: extracted,
            verification_status: 'unverified',
            source_confidence: extractedText.length > 50 ? 80 : 25,
            raw_source_data: {
                originalName,
                mimeType,
                fileHash,
                storagePath: filePath,
                extractedLength: extractedText.length
            }
        };

        const finalData = this.validateAndClean(normalized);
        const hash = fileHash || this.generateDuplicateHash(extractedText || originalName);

        // 🛡️ CRITICAL RULE: The permanent image file is PRESERVED on disk for operator review!
        // It is strictly NOT deleted here.

        return { ...finalData, duplicate_hash: hash, createdBy: user_id };
    }
}

export default new OcrConnector();
