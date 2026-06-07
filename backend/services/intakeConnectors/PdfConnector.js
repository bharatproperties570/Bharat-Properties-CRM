import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';
import BaseConnector from './BaseConnector.js';
import { parseContent } from '../../src/modules/intake/intakeParser.js';

class PdfConnector extends BaseConnector {
    constructor() {
        super();
        this.sourceType = 'pdf';
    }

    async process(inputData) {
        // inputData should contain the path to the uploaded PDF
        const { filePath: rawPath, originalName, user_id } = inputData;
        const filePath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);

        console.log(`[PdfConnector] Processing file: ${filePath}`);
        console.log(`[PdfConnector] Current Working Directory: ${process.cwd()}`);
        
        if (!fs.existsSync(filePath)) {
            console.error(`[PdfConnector] CRITICAL ERROR: File NOT found at ${filePath}`);
            throw new Error(`File not found at: ${filePath}`);
        }
        
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdf(dataBuffer);
        
        const extractedText = data.text;
        const metadata = data.info || {};
        
        const metadataText = [
            metadata.Title,
            metadata.Author,
            metadata.Subject,
            metadata.Keywords
        ].filter(Boolean).join(' ');

        let finalContent = extractedText;
        if (metadataText.trim().length > 0) {
            finalContent = `${metadataText}\n\n${extractedText}`;
        }

        // Use the existing NLP parser
        const extracted = await parseContent(finalContent, inputData.tenantId);

        const normalized = {
            title: extracted.projectName || extracted.location || originalName || 'PDF Import',
            description: finalContent,
            location: extracted.location || '',
            sector: extracted.sector || '',
            property_type: extracted.property_type || '',
            size: extracted.size || '',
            price: extracted.budget || extracted.price || '',
            contact_numbers: extracted.contact_numbers || [],
            seller_intent: extracted.intent || 'unknown',
            extracted_entities: extracted,
            verification_status: 'unverified',
            source_confidence: extractedText.trim().length > 50 ? 80 : 30,
            tenantId: inputData.tenantId || null,
            raw_source_data: { metadata, pages: data.numpages, originalName }
        };

        const finalData = this.validateAndClean(normalized);
        const hash = this.generateDuplicateHash(finalContent);

        // Cleanup
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        return { ...finalData, duplicate_hash: hash, createdBy: user_id };
    }
}

export default new PdfConnector();
