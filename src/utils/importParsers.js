import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';

// Configure PDF Worker
// Use local worker via Vite URL import for robustness
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/**
 * Parses a WhatsApp Export .zip file
 * @param {File} file - The uploaded .zip file
 * @returns {Promise<Array>} - Array of parsed messages
 */
export const parseWhatsAppZip = async (file) => {
    try {
        const zip = new JSZip();
        const contents = await zip.loadAsync(file);

        // Robust File Search: Find _chat.txt OR any large .txt file
        // Filter out directories and hidden files (starting with .)
        const chatFile = Object.values(contents.files).find(f =>
            !f.dir &&
            f.name.toLowerCase().endsWith('.txt') &&
            !f.name.startsWith('__MACOSX') &&
            !f.name.split('/').pop().startsWith('.')
        );

        if (!chatFile) {
            throw new Error('No valid .txt chat file found in the ZIP archive.');
        }

        const text = await chatFile.async('string');
        const lines = text.split(/\r?\n/);
        const parsedItems = [];

        // Advanced Regex for Multi-Format Support
        // 1. iOS: [dd/mm/yy, hh:mm:ss AM] Sender: Msg
        // 2. Android: dd/mm/yy, hh:mm - Sender: Msg
        // 3. US: mm/dd/yy, hh:mm AM - Sender: Msg

        // Parts:
        // Date: \d{1,4}[-./]\d{1,2}[-./]\d{2,4} (Any separator)
        // Time: \d{1,2}:\d{2}(:\d{2})?(\s?[APap][Mm])? (With optional seconds and AM/PM)
        // Separator: " - " or "] "

        const timestampRegex = /^(\[?(\d{1,4}[-./]\d{1,2}[-./]\d{2,4}),?\s+(\d{1,2}:\d{2}(:\d{2})?(\s?[APap][Mm])?)\]?)(?:\s-\s|\s)(.+?):/;

        lines.forEach(line => {
            // Clean control chars (LTR/RTL marks)
            line = line.replace(/[\u200e\u200f]/g, "");

            const match = line.match(timestampRegex);

            if (match) {
                // match[1] = Full Timestamp "[date, time]"
                // match[6] = Sender Name
                const sender = match[6];

                // Content is everything after the "Sender: " part
                // We find where sender match ends + 1 (for colon)
                // This is safer than regex grouping for content which might contain colons
                const headerEndIndex = line.indexOf(sender + ':');
                let message = '';

                if (headerEndIndex !== -1) {
                    message = line.substring(headerEndIndex + sender.length + 1).trim();
                }

                // Filter System Messages
                if (!message ||
                    message.includes('Messages to this chat are now secured') ||
                    message.includes('created this group') ||
                    message.includes('added you') ||
                    message.includes('changed to') ||
                    message.includes('Media omitted')) { // "Media omitted" is useless for text intake
                    return;
                }

                parsedItems.push({
                    id: Date.now() + Math.random(),
                    source: 'WhatsApp',
                    content: `${sender}: ${message}`,
                    receivedAt: new Date().toISOString(), // Mock current time as received time
                    metadata: { sender, originalTimestamp: match[1] }
                });
            } else {
                // Handle multi-line messages (append to last item)
                if (parsedItems.length > 0 && line.trim()) {
                    parsedItems[parsedItems.length - 1].content += `\n${line}`;
                }
            }
        });

        // If strict parsing failed, try a distinct fallback or just return what we have.
        // If we have 0 items, maybe the regex is STILL wrong.
        if (parsedItems.length === 0 && lines.length > 0) {
            console.warn("Strict regex failed. Trying loose fallback.");
            // Loose Fallback: If line starts with date-like digits and has a colon
            lines.forEach(line => {
                if (line.match(/^\d+/) && line.includes(':')) {
                    // Heuristic: Assume first part is date/time, try to find sender
                    const parts = line.split(':');
                    if (parts.length > 2) {
                        // Likely "Date, Time - Sender: Msg"
                        parsedItems.push({
                            id: Date.now() + Math.random(),
                            source: 'WhatsApp (Loose)',
                            content: line,
                            receivedAt: new Date().toISOString()
                        });
                    }
                }
            });
        }

        return parsedItems.reverse();

    } catch (error) {
        console.error('WhatsApp Parse Error:', error);
        throw new Error('Failed to parse WhatsApp file: ' + error.message);
    }
};

/**
 * Parses a Tribune Advertisement PDF
 * @param {File} file - The uploaded .pdf file
 * @returns {Promise<Array>} - Array of extracted ad texts
 */
/**
 * Parses a Tribune Advertisement PDF with World-Class Precision
 * @param {File} file - The uploaded .pdf file
 * @returns {Promise<Array>} - Array of extracted ad texts
 */
export const parseTribunePdf = async (file) => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';

        // improved Text Extraction: Add space between items to prevents words merging
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();

            // Filter out empty strings but KEEP short ones (could be letters of a word)
            const cleanItems = textContent.items.filter(item => item.str.trim().length > 0);

            const pageText = cleanItems.map(item => item.str).join(' '); // Join with spaces to prevent words gluing
            fullText += pageText + '\n\n';
        }

        console.log("Extracted Text Length:", fullText.length);
        console.log("Preview:", fullText.substring(0, 100));

        // --- OCR FALLBACK FOR SCANNED PDFS ---
        // If text content is extremely sparse or just whitespace
        if (fullText.trim().length < 50) {
            console.warn("Low text density detected. Switching to OCR mode...");
            fullText = ''; // Reset to fill with OCR data

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 2.0 });

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                await page.render({ canvasContext: context, viewport: viewport }).promise;

                const imageBlob = await new Promise(resolve => canvas.toBlob(resolve));

                const { data: { text } } = await Tesseract.recognize(
                    imageBlob,
                    'eng',
                    { logger: m => console.log(m) }
                );

                fullText += text + '\n\n';
            }
        }

        // --- WORLD CLASS NORMALIZATION ---
        fullText = fullText.replace(/THE TRIBUNE/gi, '')
            .replace(/CHANDIGARH/gi, '')
            .replace(/CLASSIFIEDS/gi, '')
            .replace(/PROPERTY FOR SALE/gi, '')
            .replace(/TO LET/gi, '')
            .replace(/\s+/g, ' '); // Normalize spaces

        // --- SMART AD SEGMENTATION ---
        const phoneRegex = /([6-9]\d{4}[-\s]?\d{5})/g;
        const parts = fullText.split(phoneRegex);

        const chunks = [];

        for (let i = 1; i < parts.length; i += 2) {
            const phone = parts[i];
            const previousText = parts[i - 1];
            // Take larger slice to be safe
            const relevantContent = previousText.slice(-600).trim();

            // RELAXED FILTER: Accept if it has a phone number context, even without specific keywords
            // This is "Professional" - trust the user's file over our regex
            if (relevantContent.length > 10) {
                chunks.push({
                    id: Date.now() + Math.random(),
                    source: 'Tribune Ad (Smart)',
                    content: relevantContent.replace(/^[^\w]+/, '') + ` (Ph: ${phone})`,
                    receivedAt: new Date().toISOString()
                });
            }
        }

        // --- ULTIMATE FALLBACK: RAW DUMP ---
        // If NO chunks were found, just dump the whole text so the user can manually edit it.
        // This prevents "No valid message found" error.
        if (chunks.length === 0) {
            console.warn("Segmentation failed. Returning Raw Text.");
            if (fullText.trim().length > 0) {
                chunks.push({
                    id: Date.now(),
                    source: 'Raw Import (Unsegmented)',
                    content: fullText.substring(0, 5000), // Cap at 5000 chars to avoid memory issues
                    receivedAt: new Date().toISOString()
                });
            }
        }

        return chunks;

    } catch (error) {
        console.error('PDF Parse Error:', error);
        // Fallback: If it was a "worker" error, suggest checking network/version.
        if (error.message.includes('Setting up fake worker failed')) {
            throw new Error('PDF Worker Error. Please check internet connection or reload.');
        }
        throw new Error('PDF Error: ' + error.message);
    }
};
