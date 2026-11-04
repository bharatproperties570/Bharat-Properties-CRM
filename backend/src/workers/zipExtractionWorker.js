import { parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import JSZip from 'jszip';

/**
 * Dedicated Thread Worker for ZIP Decompression (Gate 2R.12 / APPNOTE 6.3.3)
 * 
 * Runs in an isolated thread so that CPU-intensive or rogue decompression
 * can be immediately terminated via worker.terminate() upon timeout.
 */
(async () => {
    try {
        const { filePath, maxBytes = 50 * 1024 * 1024 } = workerData || {};

        if (!filePath || !fs.existsSync(filePath)) {
            throw new Error(`File not found at: ${filePath}`);
        }

        const data = fs.readFileSync(filePath);
        const zip = await JSZip.loadAsync(data);
        const extractedTexts = [];
        let cumulativeBytes = 0;

        for (const filename of Object.keys(zip.files)) {
            const file = zip.files[filename];

            if (file.dir || filename.startsWith('__MACOSX') || filename.split('/').pop().startsWith('.')) {
                continue;
            }

            const lowerName = filename.toLowerCase();
            if (lowerName.endsWith('.txt') || lowerName.endsWith('.csv')) {
                const text = await file.async('string');
                cumulativeBytes += Buffer.byteLength(text, 'utf8');

                if (cumulativeBytes > maxBytes) {
                    throw new Error(`ZIP_CUMULATIVE_SIZE_EXCEEDED: Extracted content exceeds ${maxBytes} bytes`);
                }

                extractedTexts.push({
                    filename,
                    content: text
                });
            }
        }

        parentPort.postMessage({ success: true, extractedTexts });
    } catch (err) {
        parentPort.postMessage({
            success: false,
            error: err.message,
            code: err.code || 'EXTRACTION_ERROR'
        });
    }
})();
