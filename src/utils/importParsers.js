/**
 * Parses a WhatsApp Export .zip file
 * @param {File} file - The uploaded .zip file
 * @returns {Promise<Array>} - Array of parsed messages
 */
export const parseWhatsAppZip = async (file) => {
    try {
        // Dynamic Import to reduce initial bundle
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        const contents = await zip.loadAsync(file);

        // Robust File Search: Find _chat.txt OR any large .txt file
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

        const timestampRegex = /^(\[?(\d{1,4}[-./]\d{1,2}[-./]\d{2,4}),?\s+(\d{1,2}:\d{2}(:\d{2})?(\s?[APap][Mm])?)\]?)(?:\s-\s|\s)(.+?):/;

        lines.forEach(line => {
            line = line.replace(/[\u200e\u200f]/g, "");
            const match = line.match(timestampRegex);

            if (match) {
                const sender = match[6];
                const headerEndIndex = line.indexOf(sender + ':');
                let message = '';

                if (headerEndIndex !== -1) {
                    message = line.substring(headerEndIndex + sender.length + 1).trim();
                }

                if (!message ||
                    message.includes('Messages to this chat are now secured') ||
                    message.includes('created this group') ||
                    message.includes('added you') ||
                    message.includes('changed to') ||
                    message.includes('Media omitted')) {
                    return;
                }

                parsedItems.push({
                    id: Date.now() + Math.random(),
                    source: 'WhatsApp',
                    content: `${sender}: ${message}`,
                    receivedAt: new Date().toISOString(),
                    metadata: { sender, originalTimestamp: match[1] }
                });
            } else {
                if (parsedItems.length > 0 && line.trim()) {
                    parsedItems[parsedItems.length - 1].content += `\n${line}`;
                }
            }
        });

        if (parsedItems.length === 0 && lines.length > 0) {
            lines.forEach(line => {
                if (line.match(/^\d+/) && line.includes(':')) {
                    parsedItems.push({
                        id: Date.now() + Math.random(),
                        source: 'WhatsApp (Loose)',
                        content: line,
                        receivedAt: new Date().toISOString()
                    });
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
 * Parses a Tribune Advertisement PDF with World-Class Precision
 * @param {File} file - The uploaded .pdf file
 * @returns {Promise<Array>} - Array of extracted ad texts
 */
export const parseTribunePdf = async (file) => {
    try {
        // Dynamic Imports
        const pdfjsLib = await import('pdfjs-dist');
        const { default: pdfWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');

        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const cleanItems = textContent.items.filter(item => item.str.trim().length > 0);
            const pageText = cleanItems.map(item => item.str).join(' ');
            fullText += pageText + '\n\n';
        }

        // --- OCR FALLBACK IF NEEDED ---
        if (fullText.trim().length < 50) {
            console.warn("Low text density detected. Switching to OCR mode...");
            const { default: Tesseract } = await import('tesseract.js');
            fullText = '';

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
                    'eng'
                );

                fullText += text + '\n\n';
            }
        }

        fullText = fullText.replace(/THE TRIBUNE/gi, '')
            .replace(/CHANDIGARH/gi, '')
            .replace(/CLASSIFIEDS/gi, '')
            .replace(/PROPERTY FOR SALE/gi, '')
            .replace(/TO LET/gi, '')
            .replace(/\s+/g, ' ');

        const phoneRegex = /([6-9]\d{4}[-\s]?\d{5})/g;
        const parts = fullText.split(phoneRegex);

        const chunks = [];

        for (let i = 1; i < parts.length; i += 2) {
            const phone = parts[i];
            const previousText = parts[i - 1];
            const relevantContent = previousText.slice(-600).trim();

            if (relevantContent.length > 10) {
                chunks.push({
                    id: Date.now() + Math.random(),
                    source: 'Tribune Ad (Smart)',
                    content: relevantContent.replace(/^[^\w]+/, '') + ` (Ph: ${phone})`,
                    receivedAt: new Date().toISOString()
                });
            }
        }

        if (chunks.length === 0 && fullText.trim().length > 0) {
            chunks.push({
                id: Date.now(),
                source: 'Raw Import (Unsegmented)',
                content: fullText.substring(0, 5000),
                receivedAt: new Date().toISOString()
            });
        }

        return chunks;

    } catch (error) {
        console.error('PDF Parse Error:', error);
        throw new Error('PDF Error: ' + error.message);
    }
};
