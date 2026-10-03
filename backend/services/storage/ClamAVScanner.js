import { MalwareScanner, ScanResult, ScanOutcome } from './MalwareScanner.js';
import http from 'http';

/**
 * Concrete Scanner Adapter for ClamAV REST (e.g. clamav-rest API)
 * Strictly fail-closed architecture avoiding buffering.
 */
export default class ClamAVScanner extends MalwareScanner {
    constructor() {
        super();
        this.host = process.env.CLAMAV_HOST || '127.0.0.1';
        this.port = parseInt(process.env.CLAMAV_PORT || '9000', 10);
        this.timeoutMs = parseInt(process.env.CLAMAV_TIMEOUT_MS || '30000', 10);
    }

    /**
     * @param {stream.Readable|Buffer} contentStream 
     * @param {string} mimeType 
     * @param {number} sizeBytes 
     * @param {string} expectedChecksum 
     * @returns {Promise<ScanResult>}
     */
    async scan(contentStream, mimeType, sizeBytes, expectedChecksum) {
        return new Promise((resolve) => {
            const req = http.request({
                method: 'POST',
                host: this.host,
                port: this.port,
                path: '/api/v1/scan', // Example standard REST wrapper endpoint
                headers: {
                    'Content-Type': mimeType,
                    'Content-Length': sizeBytes
                },
                timeout: this.timeoutMs
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        return resolve(new ScanResult(ScanOutcome.ERROR, { statusCode: res.statusCode }));
                    }
                    
                    try {
                        const payload = JSON.parse(body);
                        if (payload.status === 'CLEAN') {
                            return resolve(new ScanResult(ScanOutcome.CLEAN, payload));
                        } else if (payload.status === 'INFECTED') {
                            return resolve(new ScanResult(ScanOutcome.INFECTED, payload));
                        } else {
                            // Unexpected payload
                            return resolve(new ScanResult(ScanOutcome.INVALID_RESULT, payload));
                        }
                    } catch (err) {
                        // Malformed response
                        return resolve(new ScanResult(ScanOutcome.INVALID_RESULT, { error: 'Parse Error', raw: body }));
                    }
                });
            });

            req.on('error', (err) => {
                if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
                    return resolve(new ScanResult(ScanOutcome.UNAVAILABLE, { error: err.message }));
                }
                return resolve(new ScanResult(ScanOutcome.ERROR, { error: err.message }));
            });

            req.on('timeout', () => {
                req.destroy();
                return resolve(new ScanResult(ScanOutcome.TIMEOUT, { error: 'Request timeout' }));
            });

            if (Buffer.isBuffer(contentStream)) {
                req.write(contentStream);
                req.end();
            } else {
                contentStream.pipe(req);
                contentStream.on('error', (err) => {
                    req.destroy();
                    // If source stream fails, it's not a scanner issue, but we abort
                    resolve(new ScanResult(ScanOutcome.ERROR, { error: 'Source Stream Error' }));
                });
            }
        });
    }
}
