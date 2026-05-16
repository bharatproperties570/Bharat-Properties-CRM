import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import BaseConnector from './BaseConnector.js';
import { parseContent } from '../../src/modules/intake/intakeParser.js';

class ZipConnector extends BaseConnector {
    constructor() {
        super();
        this.sourceType = 'zip';
    }

    async process(inputData) {
        const { filePath: rawPath, originalName, user_id } = inputData;
        const filePath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
        
        console.log(`[ZipConnector] Processing file: ${filePath}`);
        console.log(`[ZipConnector] Current Working Directory: ${process.cwd()}`);
        
        if (!fs.existsSync(filePath)) {
            console.error(`[ZipConnector] CRITICAL ERROR: File NOT found at ${filePath}`);
            throw new Error(`File not found at: ${filePath}`);
        }
        
        const data = fs.readFileSync(filePath);
        
        const extractedTexts = [];

        for (const filename of Object.keys(contents.files)) {
            const file = contents.files[filename];

            if (file.dir || filename.startsWith('__MACOSX') || filename.split('/').pop().startsWith('.')) {
                continue;
            }

            const lowerName = filename.toLowerCase();
            if (lowerName.endsWith('.txt') || lowerName.endsWith('.csv')) {
                const text = await file.async('string');
                extractedTexts.push({
                    filename,
                    content: text
                });
            }
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

        // Cleanup
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        return { ...finalData, duplicate_hash: hash, createdBy: user_id };
    }
}

export default new ZipConnector();
