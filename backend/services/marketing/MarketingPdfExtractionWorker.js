import { parentPort, workerData } from 'node:worker_threads';

const MAX_PAGES = 25;
const MAX_TEXT_CHARS = 120000;

const hasSensitiveContent = (text) => {
    const patterns = [
        /(?:\+?91[\s-]?)?[6-9]\d{9}\b/,
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
        /\b[A-Z]{5}[0-9]{4}[A-Z]\b/i,
        /\b[2-9][0-9]{3}[\s-]?[0-9]{4}[\s-]?[0-9]{4}\b/,
        /\b(?:bank\s+)?(?:account|a\/c)\s*(?:no\.?|number)?\s*[:=-]\s*\d{9,18}\b/i,
        /\bIFSC\s*(?:code)?\s*[:=-]\s*[A-Z]{4}0[A-Z0-9]{6}\b/i,
        /\b(?:applicant|allottee|buyer|seller|owner|contact person|signature|signed by)\s*(?:name|details|:|-)\s*[:=-]?\s*[A-Z][A-Z .'-]{2,60}/i
    ];
    return patterns.some((pattern) => pattern.test(text));
};

try {
    const pdfParse = (await import('pdf-parse')).default;
    const bytes = Buffer.from(workerData.pdfBytes);
    const parsed = await pdfParse(bytes, { max: MAX_PAGES });
    const pageCount = Number(parsed.numpages || 0);
    if (!pageCount || pageCount > MAX_PAGES) {
        parentPort.postMessage({ ok: false, code: 'PDF_PAGE_POLICY_REJECTED' });
    } else {
        const text = String(parsed.text || '').slice(0, MAX_TEXT_CHARS);
        // Empty text is rejected: image-only/scanned PDFs cannot be reliably screened here.
        if (text.trim().length < 40) {
            parentPort.postMessage({ ok: false, code: 'PDF_TEXT_NOT_VERIFIABLE' });
        } else if (hasSensitiveContent(text)) {
            parentPort.postMessage({ ok: false, code: 'PDF_SENSITIVE_CONTENT_DETECTED' });
        } else {
            parentPort.postMessage({ ok: true, pageCount, text });
        }
    }
} catch {
    // Never return parser exception details or source content to logs/callers.
    parentPort.postMessage({ ok: false, code: 'PDF_PARSE_FAILED' });
}
