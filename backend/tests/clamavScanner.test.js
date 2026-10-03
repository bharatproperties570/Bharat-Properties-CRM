import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'net';
import crypto from 'crypto';
import ClamAVScanner from '../services/storage/ClamAVScanner.js';
import { ScanOutcome } from '../services/storage/MalwareScanner.js';

test('ClamAV Scanner Native TCP Protocol & Checksum Tests', async (t) => {
    let testServer;
    let serverResponse = '';
    let lastReceivedChunks = [];
    
    // Setup isolated test TCP server simulating clamd
    await new Promise((resolve, reject) => {
        testServer = net.createServer((socket) => {
            socket.on('data', (data) => {
                lastReceivedChunks.push(data);
                
                // If we receive the termination chunk (0 size), send the mock response
                if (data.length >= 4 && data.readUInt32BE(data.length - 4) === 0) {
                    if (serverResponse === 'TIMEOUT') {
                        // do nothing, let it timeout
                    } else if (serverResponse === 'DROP') {
                        socket.destroy();
                    } else {
                        socket.write(serverResponse);
                        socket.end();
                    }
                }
            });
        });
        
        testServer.listen(0, '127.0.0.1', () => {
            resolve();
        });
        testServer.on('error', reject);
    });

    const port = testServer.address().port;

    const createScanner = (timeoutMs = 1000) => {
        const scanner = new ClamAVScanner();
        scanner.host = '127.0.0.1';
        scanner.port = port;
        scanner.timeoutMs = timeoutMs;
        return scanner;
    };

    t.after(() => {
        if (testServer) testServer.close();
    });

    t.beforeEach(() => {
        serverResponse = '';
        lastReceivedChunks = [];
    });

    await t.test('G1. CLEAN -> OK', async () => {
        serverResponse = 'stream: OK\n';
        const scanner = createScanner();
        const content = Buffer.from('test content');
        const result = await scanner.scan(content, 'text/plain', content.length, null);
        assert.strictEqual(result.outcome, ScanOutcome.CLEAN);
        assert.strictEqual(result.providerMetadata.raw, 'stream: OK');
    });

    await t.test('G2. INFECTED -> FOUND', async () => {
        serverResponse = 'stream: Eicar-Test-Signature FOUND\n';
        const scanner = createScanner();
        const content = Buffer.from('test content');
        const result = await scanner.scan(content, 'text/plain', content.length, null);
        assert.strictEqual(result.outcome, ScanOutcome.INFECTED);
        assert.strictEqual(result.providerMetadata.malware, 'Eicar-Test-Signature');
    });

    await t.test('G3. MALFORMED RESPONSE -> INVALID_RESULT', async () => {
        serverResponse = 'some weird response';
        const scanner = createScanner();
        const content = Buffer.from('test content');
        const result = await scanner.scan(content, 'text/plain', content.length, null);
        assert.strictEqual(result.outcome, ScanOutcome.INVALID_RESULT);
    });

    await t.test('G4. TIMEOUT -> TIMEOUT', async () => {
        serverResponse = 'TIMEOUT'; // Instructs mock server to drop
        const scanner = createScanner(100); // 100ms timeout
        const content = Buffer.from('test content');
        const result = await scanner.scan(content, 'text/plain', content.length, null);
        assert.strictEqual(result.outcome, ScanOutcome.TIMEOUT);
    });

    await t.test('G5. CONNECTION FAILURE -> UNAVAILABLE', async () => {
        const scanner = createScanner();
        scanner.port = port + 1; // Wrong port, connection refused
        const content = Buffer.from('test content');
        const result = await scanner.scan(content, 'text/plain', content.length, null);
        assert.strictEqual(result.outcome, ScanOutcome.UNAVAILABLE);
    });

    await t.test('H. ACTUAL CHECKSUM MATCH', async () => {
        serverResponse = 'stream: OK\n';
        const scanner = createScanner();
        const content = Buffer.from('verified content bytes');
        const expectedChecksum = crypto.createHash('sha256').update(content).digest('hex');
        
        const result = await scanner.scan(content, 'text/plain', content.length, expectedChecksum);
        
        // Protocol verify: chunk length header sent
        assert.ok(lastReceivedChunks.length > 0);
        
        // Assert result
        assert.strictEqual(result.outcome, ScanOutcome.CLEAN);
    });

    await t.test('I. ACTUAL CHECKSUM MISMATCH', async () => {
        serverResponse = 'stream: OK\n';
        const scanner = createScanner();
        const content = Buffer.from('verified content bytes');
        const wrongChecksum = crypto.createHash('sha256').update('different content').digest('hex');
        
        const result = await scanner.scan(content, 'text/plain', content.length, wrongChecksum);
        
        assert.strictEqual(result.outcome, ScanOutcome.INVALID_RESULT);
        assert.strictEqual(result.providerMetadata.error, 'Checksum mismatch during scan');
    });
});

test('J. BACKPRESSURE / STREAM INTEGRITY - Multiple chunks', async () => {
    let testServer;
    let receivedBytes = 0;
    
    await new Promise((resolve, reject) => {
        testServer = net.createServer((socket) => {
            socket.on('data', (data) => {
                // subtract the first 'zINSTREAM\0' which is 10 bytes
                if (data.toString().includes('zINSTREAM')) {
                    receivedBytes += (data.length - 10);
                } else {
                    receivedBytes += data.length;
                }
                
                if (data.length >= 4 && data.readUInt32BE(data.length - 4) === 0) {
                    socket.write('stream: OK\n');
                    socket.end();
                }
            });
        });
        testServer.listen(0, '127.0.0.1', () => resolve());
    });

    const port = testServer.address().port;
    const scanner = new ClamAVScanner();
    scanner.host = '127.0.0.1';
    scanner.port = port;

    // Simulate a stream that chunks large data
    const { Readable } = await import('stream');
    const contentStream = new Readable({
        read(size) {}
    });

    // Write 5 chunks of 1MB each
    const chunkSize = 1024 * 1024;
    const expectedBytes = chunkSize * 5;
    
    for (let i=0; i<5; i++) {
        contentStream.push(Buffer.alloc(chunkSize, 'A'));
    }
    contentStream.push(null);

    const result = await scanner.scan(contentStream, 'application/octet-stream', expectedBytes, null);
    
    assert.strictEqual(result.outcome, ScanOutcome.CLEAN);
    // Every chunk has a 4-byte length header, plus the 4-byte terminator
    assert.strictEqual(receivedBytes, expectedBytes + (5 * 4) + 4);
    
    testServer.close();
});
