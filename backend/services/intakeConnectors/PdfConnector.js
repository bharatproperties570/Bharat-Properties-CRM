import fs from 'fs';
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
        const { filePath, originalName, user_id } = inputData;
        
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdf(filePath);
        
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
        const extracted = await parseContent(finalContent);

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
