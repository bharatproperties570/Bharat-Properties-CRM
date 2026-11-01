import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import JSZip from 'jszip';

import { validateZipPreflight, ZIP_LIMITS, ZipSecurityError } from '../src/utils/zipPreflightValidator.js';
import zipConnector from '../services/intakeConnectors/ZipConnector.js';

/**
 * Low-level binary ZIP builder for crafting byte-exact adversarial scenarios.
 */
function createRawZip({
    entries = [],
    comment = '',
    diskNumber = 0,
    diskStart = 0,
    totalEntriesOverride = null,
    cdOffsetOverride = null,
    cdSizeOverride = null,
    injectZip64Locator = false,
    corruptEOCD = false
}) {
    const localChunks = [];
    const cdChunks = [];
    let currentOffset = 0;

    const entryOffsets = [];

    // 1. Build Local File Records
    for (const entry of entries) {
        entryOffsets.push(currentOffset);

        const nameBuf = Buffer.from(entry.localName !== undefined ? entry.localName : entry.name, 'utf8');
        const dataBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data || '', 'utf8');
        const compressedSize = entry.localCompressedSize !== undefined ? entry.localCompressedSize : (entry.compressedSize !== undefined ? entry.compressedSize : dataBuf.length);
        const uncompressedSize = entry.localUncompressedSize !== undefined ? entry.localUncompressedSize : (entry.uncompressedSize !== undefined ? entry.uncompressedSize : dataBuf.length);
        const flags = entry.flags !== undefined ? entry.flags : 0;
        const method = entry.method !== undefined ? entry.method : 0; // 0 = Store

        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(entry.corruptLocalSig ? 0x00000000 : 0x04034b50, 0);
        localHeader.writeUInt16LE(20, 4); // Version needed
        localHeader.writeUInt16LE(flags, 6);
        localHeader.writeUInt16LE(method, 8);
        localHeader.writeUInt16LE(0, 10); // Time
        localHeader.writeUInt16LE(0, 12); // Date
        localHeader.writeUInt32LE(entry.crc || 0, 14);
        localHeader.writeUInt32LE(compressedSize, 18);
        localHeader.writeUInt32LE(uncompressedSize, 22);
        localHeader.writeUInt16LE(nameBuf.length, 26);
        localHeader.writeUInt16LE(0, 28); // Extra len

        localChunks.push(localHeader, nameBuf, dataBuf);
        currentOffset += 30 + nameBuf.length + dataBuf.length;
    }

    const cdStartOffset = currentOffset;

    // 2. Build Central Directory Records
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const nameBuf = Buffer.from(entry.name, 'utf8');
        const dataBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data || '', 'utf8');
        const compressedSize = entry.compressedSize !== undefined ? entry.compressedSize : dataBuf.length;
        const uncompressedSize = entry.uncompressedSize !== undefined ? entry.uncompressedSize : dataBuf.length;
        const flags = entry.flags !== undefined ? entry.flags : 0;
        const method = entry.method !== undefined ? entry.method : 0;
        const localOffset = entry.offsetOverride !== undefined ? entry.offsetOverride : entryOffsets[i];

        const cdHeader = Buffer.alloc(46);
        cdHeader.writeUInt32LE(entry.corruptCdSig ? 0x00000000 : 0x02014b50, 0);
        cdHeader.writeUInt16LE(20, 4); // Version made by
        cdHeader.writeUInt16LE(20, 6); // Version needed
        cdHeader.writeUInt16LE(flags, 8);
        cdHeader.writeUInt16LE(method, 10);
        cdHeader.writeUInt16LE(0, 12); // Time
        cdHeader.writeUInt16LE(0, 14); // Date
        cdHeader.writeUInt32LE(entry.crc || 0, 16);
        cdHeader.writeUInt32LE(compressedSize, 20);
        cdHeader.writeUInt32LE(uncompressedSize, 24);
        cdHeader.writeUInt16LE(nameBuf.length, 28);
        cdHeader.writeUInt16LE(0, 30); // Extra len
        cdHeader.writeUInt16LE(0, 32); // Comment len
        cdHeader.writeUInt16LE(0, 34); // Disk start
        cdHeader.writeUInt16LE(0, 36); // Internal attr
        cdHeader.writeUInt32LE(0, 38); // External attr
        cdHeader.writeUInt32LE(localOffset, 42);

        cdChunks.push(cdHeader, nameBuf);
        currentOffset += 46 + nameBuf.length;
    }

    const cdTotalSize = currentOffset - cdStartOffset;

    // Optional: Inject ZIP64 Locator
    if (injectZip64Locator) {
        const zip64Locator = Buffer.alloc(20);
        zip64Locator.writeUInt32LE(0x07064b50, 0); // PK\x06\x07
        zip64Locator.writeUInt32LE(0, 4); // disk number with zip64 EOCD
        zip64Locator.writeBigUInt64LE(0n, 8); // relative offset of zip64 EOCD
        zip64Locator.writeUInt32LE(1, 16); // total number of disks
        cdChunks.push(zip64Locator);
        currentOffset += 20;
    }

    // 3. Build End of Central Directory (EOCD)
    const commentBuf = Buffer.from(comment, 'utf8');
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(corruptEOCD ? 0x00000000 : 0x06054b50, 0);
    eocd.writeUInt16LE(diskNumber, 4);
    eocd.writeUInt16LE(diskStart, 6);
    eocd.writeUInt16LE(totalEntriesOverride !== null ? totalEntriesOverride : entries.length, 8);
    eocd.writeUInt16LE(totalEntriesOverride !== null ? totalEntriesOverride : entries.length, 10);
    eocd.writeUInt32LE(cdSizeOverride !== null ? cdSizeOverride : cdTotalSize, 12);
    eocd.writeUInt32LE(cdOffsetOverride !== null ? cdOffsetOverride : cdStartOffset, 16);
    eocd.writeUInt16LE(commentBuf.length, 20);

    return Buffer.concat([...localChunks, ...cdChunks, eocd, commentBuf]);
}

test('=== PHASE 2 ADVERSARIAL ZIP SECURITY SUITE (Gate 2R.12) ===', async (suite) => {

    await suite.test('ZIP.1: Valid standard ZIP archive passes preflight and parses metadata', async () => {
        const zipBuf = createRawZip({
            entries: [
                { name: 'property_listing.txt', data: 'Sector 14 Kurukshetra Plot for sale, 250 sqyd, budget 1.5 Cr' },
                { name: 'details.csv', data: 'id,price,size\n1,15000000,250' }
            ]
        });

        const preflight = validateZipPreflight(zipBuf);
        assert.equal(preflight.isValid, true);
        assert.equal(preflight.entriesCount, 2);
        assert.equal(preflight.entries[0].fileName, 'property_listing.txt');
        assert.equal(preflight.entries[1].fileName, 'details.csv');
    });

    await suite.test('ZIP.2: Path Traversal: Rejects directory traversal (../)', () => {
        const zipBuf = createRawZip({
            entries: [
                { name: '../../etc/passwd', data: 'root:x:0:0:root:/root:/bin/bash' }
            ]
        });

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'ZIP_PATH_TRAVERSAL_DETECTED'
        );
    });

    await suite.test('ZIP.3: Path Traversal: Rejects absolute root paths (/)', () => {
        const zipBuf = createRawZip({
            entries: [
                { name: '/var/log/system.log', data: 'malicious payload' }
            ]
        });

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'ZIP_PATH_TRAVERSAL_DETECTED'
        );
    });

    await suite.test('ZIP.4: Path Traversal: Rejects Windows drive paths (C:)', () => {
        const zipBuf = createRawZip({
            entries: [
                { name: 'C:\\Windows\\System32\\evil.exe', data: 'binary' }
            ]
        });

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'ZIP_PATH_TRAVERSAL_DETECTED'
        );
    });

    await suite.test('ZIP.5: Zip Bomb: Rejects high compression ratio (> 10:1)', () => {
        // Uncompressed size 100,000 bytes, compressed size 1,000 bytes -> 100:1 ratio
        const zipBuf = createRawZip({
            entries: [
                {
                    name: 'bomb.txt',
                    data: Buffer.alloc(1000), // 1KB compressed
                    compressedSize: 1000,
                    uncompressedSize: 100000  // Claims 100KB uncompressed (ratio 100:1)
                }
            ]
        });

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'ZIP_COMPRESSION_RATIO_EXCEEDED'
        );
    });

    await suite.test('ZIP.6: Zip Bomb: Rejects single entry exceeding 5 MB limit', () => {
        const zipBuf = createRawZip({
            entries: [
                {
                    name: 'huge_single.txt',
                    data: Buffer.alloc(1000),
                    compressedSize: 1000,
                    uncompressedSize: 6 * 1024 * 1024 // 6 MB
                }
            ]
        });

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'ZIP_SINGLE_ENTRY_SIZE_EXCEEDED'
        );
    });

    await suite.test('ZIP.7: Zip Bomb: Rejects cumulative size exceeding 50 MB limit', () => {
        // 13 files, each 4 MB uncompressed and 500 KB compressed (ratio 8.2:1 < 10:1 ratio limit)
        // Cumulative uncompressed = 13 * 4 MB = 52 MB > 50 MB cumulative limit
        const entries = [];
        for (let i = 0; i < 13; i++) {
            entries.push({
                name: `file_${i}.txt`,
                data: Buffer.alloc(500 * 1024),
                compressedSize: 500 * 1024,
                uncompressedSize: 4 * 1024 * 1024
            });
        }
        const zipBuf = createRawZip({ entries });

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'ZIP_CUMULATIVE_SIZE_EXCEEDED'
        );
    });

    await suite.test('ZIP.8: Zip Bomb: Rejects entry count flood (> 100 entries)', () => {
        const entries = [];
        for (let i = 0; i < 105; i++) {
            entries.push({
                name: `flood_${i}.txt`,
                data: 'data'
            });
        }
        const zipBuf = createRawZip({ entries });

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'ZIP_TOO_MANY_ENTRIES'
        );
    });

    await suite.test('ZIP.9: Overlap Detection: Rejects shared-payload overlapping intervals', () => {
        // Construct an archive where multiple Central Directory entries share/overlap the exact same local payload
        const zipBuf = createRawZip({
            entries: [
                { name: 'shared_file.txt', data: 'SHARED_PAYLOAD_CONTENT' },
                { name: 'shared_file.txt', data: 'SHARED_PAYLOAD_CONTENT', offsetOverride: 0 } // Overlaps entry 1 at offset 0
            ]
        });

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'ZIP_PAYLOAD_OVERLAP_DETECTED'
        );
    });

    await suite.test('ZIP.10: Central Directory vs Local Header filename mismatch rejected', () => {
        // Local header says "innocent.txt", but Central Directory says "trojan.exe"
        const zipBuf = createRawZip({
            entries: [
                { name: 'trojan.exe', localName: 'innocent.txt', data: 'spoofed content' }
            ]
        });

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'ZIP_HEADER_MISMATCH'
        );
    });

    await suite.test('ZIP.11: Local size vs Central size mismatch (Bit 3 unset) rejected', () => {
        const zipBuf = createRawZip({
            entries: [
                {
                    name: 'mismatched_size.txt',
                    data: 'content',
                    compressedSize: 7,
                    uncompressedSize: 7,
                    localCompressedSize: 999, // Mismatch with central
                    localUncompressedSize: 999
                }
            ]
        });

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'ZIP_HEADER_MISMATCH'
        );
    });

    await suite.test('ZIP.12: Rejects ZIP64 format (ZIP64 locator injected)', () => {
        const zipBuf = createRawZip({
            entries: [{ name: 'test.txt', data: 'hello' }],
            injectZip64Locator: true
        });

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'ZIP64_UNSUPPORTED'
        );
    });

    await suite.test('ZIP.13: Rejects ZIP64 sentinel field (0xFFFF in entries)', () => {
        const zipBuf = createRawZip({
            entries: [{ name: 'test.txt', data: 'hello' }],
            totalEntriesOverride: 0xFFFF
        });

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'ZIP64_UNSUPPORTED'
        );
    });

    await suite.test('ZIP.14: Rejects multi-disk spanned archive (diskNumber > 0)', () => {
        const zipBuf = createRawZip({
            entries: [{ name: 'test.txt', data: 'hello' }],
            diskNumber: 1
        });

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'MULTI_DISK_ZIP_REJECTED'
        );
    });

    await suite.test('ZIP.15: Rejects corrupted or missing EOCD record', () => {
        const zipBuf = createRawZip({
            entries: [{ name: 'test.txt', data: 'hello' }],
            corruptEOCD: true
        });

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'INVALID_EOCD_SIGNATURE'
        );
    });

    await suite.test('ZIP.16: Rejects forged EOCD signature in comment field', () => {
        // EOCD signature embedded in trailing comment with bad comment length
        const fakeEocdComment = 'test' + String.fromCharCode(0x50, 0x4b, 0x05, 0x06) + 'trailing';
        const zipBuf = createRawZip({
            entries: [{ name: 'test.txt', data: 'hello' }],
            comment: fakeEocdComment
        });

        // Corrupt the EOCD offset boundary
        zipBuf.writeUInt16LE(fakeEocdComment.length - 5, zipBuf.length - fakeEocdComment.length - 2);

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'INVALID_EOCD_SIGNATURE'
        );
    });

    await suite.test('ZIP.17: Rejects encrypted ZIP entries (Bit 0 set)', () => {
        const zipBuf = createRawZip({
            entries: [
                { name: 'secret.txt', data: 'encrypted_data', flags: 0x0001 } // Bit 0 = Encrypted
            ]
        });

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'ENCRYPTED_ZIP_REJECTED'
        );
    });

    await suite.test('ZIP.18: Rejects unsupported compression method (e.g. LZMA = 14)', () => {
        const zipBuf = createRawZip({
            entries: [
                { name: 'lzma.txt', data: 'compressed', method: 14 }
            ]
        });

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'UNSUPPORTED_COMPRESSION_METHOD'
        );
    });

    await suite.test('ZIP.19: Rejects corrupted local file header signature', () => {
        const zipBuf = createRawZip({
            entries: [
                { name: 'corrupted_sig.txt', data: 'test', corruptLocalSig: true }
            ]
        });

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'CORRUPT_LOCAL_HEADER'
        );
    });

    await suite.test('ZIP.20: Rejects Central Directory overlapping EOCD', () => {
        const zipBuf = createRawZip({
            entries: [{ name: 'test.txt', data: 'data' }],
            cdSizeOverride: 999999 // Overflows past EOCD
        });

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'CORRUPT_CENTRAL_DIRECTORY'
        );
    });

    await suite.test('ZIP.21: End-to-end ZipConnector.process: Safe extraction and duplicate hash generation', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-test-'));
        const tempZipFile = path.join(tempDir, 'valid_listing.zip');

        // Create standard valid zip file with real property listing
        const zip = new JSZip();
        zip.file('deal_kurukshetra.txt', 'Sector 7 Kurukshetra, 300 sqyd plot, direct owner, price 2.2 Cr. Call 9876543210');
        zip.file('notes.csv', 'field,value\nproject,Sector 7\nprice,22000000');
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

        fs.writeFileSync(tempZipFile, zipBuffer);

        const result = await zipConnector.process({
            filePath: tempZipFile,
            originalName: 'valid_listing.zip',
            user_id: 'test_user_123'
        });

        assert.ok(result, 'Result should be returned');
        assert.ok(result.duplicate_hash, 'Duplicate hash must be computed');
        assert.equal(result.raw_source_data.extractedFilesCount, 2, 'Two files extracted');
        assert.equal(fs.existsSync(tempZipFile), false, 'Uploaded file must be cleaned up from disk');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    await suite.test('ZIP.22: End-to-end ZipConnector.process: Malicious traversal archive is rejected and cleaned up', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-test2-'));
        const evilZipFile = path.join(tempDir, 'traversal.zip');

        const zipBuf = createRawZip({
            entries: [
                { name: '../../etc/shadow', data: 'root:$6$hash' }
            ]
        });

        fs.writeFileSync(evilZipFile, zipBuf);

        let caughtErr = null;
        try {
            await zipConnector.process({
                filePath: evilZipFile,
                originalName: 'traversal.zip',
                user_id: 'bad_actor'
            });
        } catch (err) {
            caughtErr = err;
        }

        assert.ok(caughtErr, 'Must throw error on malicious archive');
        assert.equal(caughtErr.code, 'ZIP_PATH_TRAVERSAL_DETECTED');
        assert.equal(fs.existsSync(evilZipFile), false, 'Malicious file must be cleaned up immediately');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

});
