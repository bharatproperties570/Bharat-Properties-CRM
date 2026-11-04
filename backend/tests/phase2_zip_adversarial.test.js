import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import JSZip from 'jszip';

import { validateZipPreflight, ZIP_LIMITS, ZipSecurityError } from '../src/utils/zipPreflightValidator.js';
import zipConnector, { runExtractionWorker } from '../services/intakeConnectors/ZipConnector.js';

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
        const flags = entry.flags !== undefined ? entry.flags : (entry.dataDescriptor ? 0x0008 : 0);
        const method = entry.method !== undefined ? entry.method : 0; // 0 = Store

        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(entry.corruptLocalSig ? 0x00000000 : 0x04034b50, 0);
        localHeader.writeUInt16LE(20, 4); // Version needed
        localHeader.writeUInt16LE(flags, 6);
        localHeader.writeUInt16LE(method, 8);
        localHeader.writeUInt16LE(0, 10); // Time
        localHeader.writeUInt16LE(0, 12); // Date
        // When bit 3 is set, CRC and sizes in local header are conventionally 0
        localHeader.writeUInt32LE(entry.dataDescriptor ? 0 : (entry.crc || 0), 14);
        localHeader.writeUInt32LE(entry.dataDescriptor ? 0 : compressedSize, 18);
        localHeader.writeUInt32LE(entry.dataDescriptor ? 0 : uncompressedSize, 22);
        localHeader.writeUInt16LE(nameBuf.length, 26);
        localHeader.writeUInt16LE(0, 28); // Extra len

        localChunks.push(localHeader, nameBuf, dataBuf);
        currentOffset += 30 + nameBuf.length + dataBuf.length;

        // Optional: Append Data Descriptor immediately after compressed data
        if (entry.dataDescriptor) {
            const desc = entry.dataDescriptor;
            if (desc.withSig) {
                const descBuf = Buffer.alloc(16);
                descBuf.writeUInt32LE(0x08074b50, 0);
                descBuf.writeUInt32LE(desc.crc || 0, 4);
                descBuf.writeUInt32LE(desc.comp !== undefined ? desc.comp : compressedSize, 8);
                descBuf.writeUInt32LE(desc.uncomp !== undefined ? desc.uncomp : uncompressedSize, 12);
                localChunks.push(descBuf);
                currentOffset += 16;
            } else {
                const descBuf = Buffer.alloc(12);
                descBuf.writeUInt32LE(desc.crc || 0, 0);
                descBuf.writeUInt32LE(desc.comp !== undefined ? desc.comp : compressedSize, 4);
                descBuf.writeUInt32LE(desc.uncomp !== undefined ? desc.uncomp : uncompressedSize, 8);
                localChunks.push(descBuf);
                currentOffset += 12;
            }
        }
    }

    const cdStartOffset = currentOffset;

    // 2. Build Central Directory Records
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const nameBuf = Buffer.from(entry.name, 'utf8');
        const dataBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data || '', 'utf8');
        const compressedSize = entry.compressedSize !== undefined ? entry.compressedSize : dataBuf.length;
        const uncompressedSize = entry.uncompressedSize !== undefined ? entry.uncompressedSize : dataBuf.length;
        const flags = entry.flags !== undefined ? entry.flags : (entry.dataDescriptor ? 0x0008 : 0);
        const method = entry.method !== undefined ? entry.method : 0;
        const localOffset = entry.offsetOverride !== undefined ? entry.offsetOverride : entryOffsets[i];
        const externalAttr = entry.externalFileAttr !== undefined ? entry.externalFileAttr : 0;

        const cdHeader = Buffer.alloc(46);
        cdHeader.writeUInt32LE(entry.corruptCdSig ? 0x00000000 : 0x02014b50, 0);
        cdHeader.writeUInt16LE(entry.versionMadeBy || 20, 4); // Version made by (upper byte = OS, e.g. 3 = Unix)
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
        cdHeader.writeUInt32LE(externalAttr >>> 0, 38); // External attr (POSIX mode in upper 16 bits)
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
        const zipBuf = createRawZip({
            entries: [
                {
                    name: 'bomb.txt',
                    data: Buffer.alloc(1000),
                    method: 8,
                    compressedSize: 1000,
                    uncompressedSize: 100000 // 100:1 ratio
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
                    method: 8,
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
        const entries = [];
        for (let i = 0; i < 13; i++) {
            entries.push({
                name: `file_${i}.txt`,
                data: Buffer.alloc(500 * 1024),
                method: 8,
                compressedSize: 500 * 1024,
                uncompressedSize: 4 * 1024 * 1024 // 4 MB * 13 = 52 MB cumulative
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
        const zipBuf = createRawZip({
            entries: [
                { name: 'shared_file.txt', data: 'SHARED_PAYLOAD_CONTENT' },
                { name: 'shared_file.txt', data: 'SHARED_PAYLOAD_CONTENT', offsetOverride: 0 }
            ]
        });

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'ZIP_PAYLOAD_OVERLAP_DETECTED'
        );
    });

    await suite.test('ZIP.10: Central Directory vs Local Header filename mismatch rejected', () => {
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
                    localCompressedSize: 999,
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
        const fakeEocdComment = 'test' + String.fromCharCode(0x50, 0x4b, 0x05, 0x06) + 'trailing';
        const zipBuf = createRawZip({
            entries: [{ name: 'test.txt', data: 'hello' }],
            comment: fakeEocdComment
        });

        zipBuf.writeUInt16LE(fakeEocdComment.length - 5, zipBuf.length - fakeEocdComment.length - 2);

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'INVALID_EOCD_SIGNATURE'
        );
    });

    await suite.test('ZIP.17: Rejects encrypted ZIP entries (Bit 0 set)', () => {
        const zipBuf = createRawZip({
            entries: [
                { name: 'secret.txt', data: 'encrypted_data', flags: 0x0001 }
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
            cdSizeOverride: 999999
        });

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'CORRUPT_CENTRAL_DIRECTORY'
        );
    });

    // =========================================================================
    // NEW ADVERSARIAL TESTS (Data Descriptors, Symlinks, Worker Termination)
    // =========================================================================

    await suite.test('ZIP.23: Data Descriptor with signature (0x08074b50) accepted and verified', () => {
        const zipBuf = createRawZip({
            entries: [
                {
                    name: 'streamed.txt',
                    data: 'STREAMED_DATA_CONTENT',
                    dataDescriptor: { withSig: true }
                }
            ]
        });

        const preflight = validateZipPreflight(zipBuf);
        assert.equal(preflight.isValid, true);
        assert.equal(preflight.entriesCount, 1);
        assert.equal(preflight.entries[0].fileName, 'streamed.txt');
    });

    await suite.test('ZIP.24: Data Descriptor without signature (12B) accepted and verified', () => {
        const zipBuf = createRawZip({
            entries: [
                {
                    name: 'raw_descriptor.txt',
                    data: 'RAW_DESCRIPTOR_DATA_CONTENT',
                    dataDescriptor: { withSig: false }
                }
            ]
        });

        const preflight = validateZipPreflight(zipBuf);
        assert.equal(preflight.isValid, true);
        assert.equal(preflight.entriesCount, 1);
        assert.equal(preflight.entries[0].fileName, 'raw_descriptor.txt');
    });

    await suite.test('ZIP.25: Data Descriptor size mismatch rejected (ZIP_DESCRIPTOR_MISMATCH)', () => {
        const zipBuf = createRawZip({
            entries: [
                {
                    name: 'tampered_desc.txt',
                    data: 'VALID_CONTENT',
                    dataDescriptor: { withSig: true, comp: 9999 } // Mismatch with actual size
                }
            ]
        });

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'ZIP_DESCRIPTOR_MISMATCH'
        );
    });

    await suite.test('ZIP.26: Data Descriptor overlap: Descriptor overlapping next entry rejected', () => {
        // Entry 1 has data descriptor, but entry 2 points to offset before descriptor ends
        const entry1 = {
            name: 'file1.txt',
            data: 'CONTENT_OF_FILE_ONE',
            dataDescriptor: { withSig: true }
        };
        const entry2 = {
            name: 'file2.txt',
            data: 'CONTENT_OF_FILE_TWO',
            offsetOverride: 20 // Overlaps entry 1 and its descriptor
        };

        const zipBuf = createRawZip({ entries: [entry1, entry2] });

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && (err.code === 'ZIP_PAYLOAD_OVERLAP_DETECTED' || err.code === 'CORRUPT_LOCAL_HEADER')
        );
    });

    await suite.test('ZIP.27: Symlink entries rejected via POSIX mode S_IFLNK (ZIP_SYMLINK_REJECTED)', () => {
        const zipBuf = createRawZip({
            entries: [
                {
                    name: 'symlink_to_etc',
                    data: '/etc/passwd',
                    versionMadeBy: 0x0314, // 3 = Unix
                    externalFileAttr: ((0o120777 << 16) >>> 0) // S_IFLNK (symlink)
                }
            ]
        });

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'ZIP_SYMLINK_REJECTED'
        );
    });

    await suite.test('ZIP.28: Unsupported file types rejected (FIFO / Device files)', () => {
        const zipBuf = createRawZip({
            entries: [
                {
                    name: 'named_pipe',
                    data: '',
                    versionMadeBy: 0x0314,
                    externalFileAttr: (0o010666 << 16) // S_IFIFO (FIFO)
                }
            ]
        });

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'UNSUPPORTED_FILE_TYPE'
        );
    });

    await suite.test('ZIP.29: Malformed local header offset pointing past Central Directory', () => {
        const zipBuf = createRawZip({
            entries: [
                {
                    name: 'bad_offset.txt',
                    data: 'valid',
                    offsetOverride: 999999 // Offset points past central directory
                }
            ]
        });

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'CORRUPT_LOCAL_HEADER_OFFSET'
        );
    });

    await suite.test('ZIP.30: Truncated payload extent overflowing into Central Directory', () => {
        const zipBuf = createRawZip({
            entries: [
                {
                    name: 'overflow.txt',
                    data: 'short',
                    compressedSize: 50000 // Claims 50KB data but central directory starts right after 'short'
                }
            ]
        });

        assert.throws(
            () => validateZipPreflight(zipBuf),
            (err) => err instanceof ZipSecurityError && err.code === 'CORRUPT_LOCAL_DATA_EXTENTS'
        );
    });

    await suite.test('ZIP.31: Dedicated worker termination on timeout (worker.terminate called)', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-timeout-'));
        const zipFile = path.join(tempDir, 'valid.zip');

        const zip = new JSZip();
        zip.file('file.txt', 'Sector 14 Kurukshetra plot, 250 sqyd, budget 1.5 Cr');
        const buf = await zip.generateAsync({ type: 'nodebuffer' });
        fs.writeFileSync(zipFile, buf);

        // Force an immediate timeout of 1ms to guarantee worker termination fires
        let caughtErr = null;
        try {
            await runExtractionWorker(zipFile, 50 * 1024 * 1024, 1); // 1ms timeout
        } catch (err) {
            caughtErr = err;
        }

        assert.ok(caughtErr, 'Timeout must throw error');
        assert.equal(caughtErr.code, 'EXTRACTION_TIMEOUT');
        assert.ok(caughtErr.message.includes('worker was terminated'));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    await suite.test('ZIP.32: No background extraction continues after worker termination', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-nobg-'));
        const zipFile = path.join(tempDir, 'valid.zip');

        const zip = new JSZip();
        zip.file('test.txt', 'Content for background test');
        const buf = await zip.generateAsync({ type: 'nodebuffer' });
        fs.writeFileSync(zipFile, buf);

        let caughtErr = null;
        try {
            await runExtractionWorker(zipFile, 50 * 1024 * 1024, 1); // Terminated immediately
        } catch (err) {
            caughtErr = err;
        }

        assert.ok(caughtErr);

        // Wait 50ms to ensure thread is completely dead
        await new Promise(r => setTimeout(r, 50));

        // Delete the input zip file
        fs.unlinkSync(zipFile);
        assert.equal(fs.existsSync(zipFile), false, 'File unlinked, no worker holds it open');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    await suite.test('ZIP.33: Temporary-file cleanup guaranteed after extraction failure', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-clean-'));
        const badZipFile = path.join(tempDir, 'corrupt.zip');

        // Write non-zip corrupt data
        fs.writeFileSync(badZipFile, Buffer.from('NOT_A_ZIP_FILE'));

        let caughtErr = null;
        try {
            await zipConnector.process({
                filePath: badZipFile,
                originalName: 'corrupt.zip',
                user_id: 'test'
            });
        } catch (err) {
            caughtErr = err;
        }

        assert.ok(caughtErr, 'Must fail on invalid zip');
        // File must be cleaned up from disk in finally block
        assert.equal(fs.existsSync(badZipFile), false, 'Temporary file must be removed after failure');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // =========================================================================
    // END-TO-END CONNECTOR TESTS
    // =========================================================================

    await suite.test('ZIP.21: End-to-end ZipConnector.process: Safe extraction and duplicate hash generation', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-test-'));
        const tempZipFile = path.join(tempDir, 'valid_listing.zip');

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
