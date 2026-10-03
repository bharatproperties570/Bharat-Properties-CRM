import { MalwareScanner, ScanResult, ScanOutcome } from './MalwareScanner.js';
import net from 'net';
import crypto from 'crypto';

/**
 * Concrete Scanner Adapter for NATIVE ClamAV Daemon (clamd) via TCP INSTREAM.
 * This directly targets the ClamAV daemon (default port 3310) without any REST wrapper.
 * Strictly fail-closed architecture avoiding full buffering.
 */
export default class ClamAVScanner extends MalwareScanner {
    constructor() {
        super();
        this.host = process.env.CLAMAV_HOST || '127.0.0.1';
        this.port = parseInt(process.env.CLAMAV_PORT || '3310', 10);
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
            const socket = new net.Socket();
            const hash = crypto.createHash('sha256');
            let responseData = '';
            let resolved = false;

            const finish = (result) => {
                if (resolved) return;
                resolved = true;
                socket.destroy();
                resolve(result);
            };

            socket.setTimeout(this.timeoutMs);

            socket.on('timeout', () => {
                finish(new ScanResult(ScanOutcome.TIMEOUT, { error: 'ClamAV Socket timeout' }));
            });

            socket.on('error', (err) => {
                if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
                    finish(new ScanResult(ScanOutcome.UNAVAILABLE, { error: err.message }));
                } else {
                    finish(new ScanResult(ScanOutcome.ERROR, { error: err.message }));
                }
            });

            socket.on('data', (chunk) => {
                responseData += chunk.toString('utf8');
            });

            socket.on('end', () => {
                const actualChecksum = hash.digest('hex');
                if (expectedChecksum && actualChecksum !== expectedChecksum) {
                    return finish(new ScanResult(ScanOutcome.INVALID_RESULT, { 
                        error: 'Checksum mismatch during scan', 
                        expected: expectedChecksum, 
                        actual: actualChecksum 
                    }));
                }

                const response = responseData.trim();
                
                if (!response) {
                    return finish(new ScanResult(ScanOutcome.INVALID_RESULT, { error: 'Empty ClamAV response' }));
                }

                if (response.endsWith(' OK')) {
                    finish(new ScanResult(ScanOutcome.CLEAN, { raw: response }));
                } else if (response.endsWith(' FOUND')) {
                    const match = response.match(/stream: (.+) FOUND/);
                    const malwareName = match ? match[1] : 'Unknown';
                    finish(new ScanResult(ScanOutcome.INFECTED, { raw: response, malware: malwareName }));
                } else if (response.endsWith(' ERROR')) {
                    finish(new ScanResult(ScanOutcome.ERROR, { raw: response }));
                } else {
                    finish(new ScanResult(ScanOutcome.INVALID_RESULT, { raw: response, error: 'Unrecognized ClamAV response' }));
                }
            });

            socket.connect(this.port, this.host, () => {
                socket.write('zINSTREAM\0');
                
                if (Buffer.isBuffer(contentStream)) {
                    hash.update(contentStream);
                    const lengthBuffer = Buffer.alloc(4);
                    lengthBuffer.writeUInt32BE(contentStream.length, 0);
                    socket.write(lengthBuffer);
                    socket.write(contentStream);
                    
                    const endBuffer = Buffer.alloc(4);
                    endBuffer.writeUInt32BE(0, 0);
                    socket.write(endBuffer);
                } else {
                    contentStream.on('data', (chunk) => {
                        if (resolved) return;
                        hash.update(chunk);
                        const lengthBuffer = Buffer.alloc(4);
                        lengthBuffer.writeUInt32BE(chunk.length, 0);
                        socket.write(lengthBuffer);
                        socket.write(chunk);
                    });
                    
                    contentStream.on('end', () => {
                        if (resolved) return;
                        const endBuffer = Buffer.alloc(4);
                        endBuffer.writeUInt32BE(0, 0);
                        socket.write(endBuffer);
                    });
                    
                    contentStream.on('error', (err) => {
                        finish(new ScanResult(ScanOutcome.ERROR, { error: 'Source Stream Error' }));
                    });
                }
            });
        });
    }
}
