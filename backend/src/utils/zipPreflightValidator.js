import path from 'path';

/**
 * Enterprise ZIP Binary Preflight & Security Validator (Gate 2R.12 / APPNOTE 6.3.3)
 * 
 * Implements byte-level binary preflight directly on raw ZIP buffers to neutralize:
 * 1. Zip bombs (compression ratio > 10:1, cumulative > 50 MB, single entry > 5 MB, entries > 100).
 * 2. Path traversal attacks (relative paths `..`, root slash `/`, Windows volume `C:`).
 * 3. Shared-payload overlapping file intervals.
 * 4. Local header vs Central Directory header spoofing / mismatches.
 * 5. ZIP64 and multi-disk spanned archives (unsupported attack vectors).
 * 6. Forged EOCD signatures in archive comment fields.
 */

export const ZIP_LIMITS = {
    MAX_COMPRESSED_SIZE: 25 * 1024 * 1024,         // 25 MB max archive size
    MAX_TOTAL_UNCOMPRESSED_SIZE: 50 * 1024 * 1024,    // 50 MB max cumulative decompressed size
    MAX_SINGLE_FILE_SIZE: 5 * 1024 * 1024,         // 5 MB max per entry
    MAX_ENTRIES_COUNT: 100,                        // 100 entries max
    MAX_COMPRESSION_RATIO: 10,                     // 10:1 ratio limit
    EXTRACTION_TIMEOUT_MS: 5000                    // 5,000 ms hard execution timeout
};

// PKZIP Signatures
const SIGNATURES = {
    LOCAL_FILE_HEADER: 0x04034b50,       // PK\x03\x04
    CENTRAL_DIR_HEADER: 0x02014b50,      // PK\x01\x02
    EOCD: 0x06054b50,                    // PK\x05\x06
    ZIP64_EOCD_LOCATOR: 0x07064b50,      // PK\x06\x07
    ZIP64_EOCD_RECORD: 0x06064b50        // PK\x06\x06
};

export class ZipSecurityError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'ZipSecurityError';
        this.code = code;
    }
}

/**
 * Validates raw buffer before any decompression attempt.
 * @param {Buffer} buffer - Raw file buffer
 * @returns {Object} Validated metadata: { entriesCount, cumulativeUncompressedSize, entries }
 */
export const validateZipPreflight = (buffer) => {
    if (!Buffer.isBuffer(buffer)) {
        throw new ZipSecurityError('INVALID_BUFFER', 'Input must be a valid Buffer');
    }

    const bufLen = buffer.length;

    // 1. File Size Verification
    if (bufLen < 22) {
        throw new ZipSecurityError('INVALID_ZIP_TOO_SMALL', 'Buffer is too small to contain valid ZIP End-of-Central-Directory record (min 22 bytes)');
    }
    if (bufLen > ZIP_LIMITS.MAX_COMPRESSED_SIZE) {
        throw new ZipSecurityError('ZIP_FILE_TOO_LARGE', `Compressed archive size (${(bufLen / (1024 * 1024)).toFixed(2)} MB) exceeds 25 MB limit`);
    }

    // 2. Reject ZIP64 Signatures anywhere in buffer
    if (buffer.includes(Buffer.from([0x50, 0x4b, 0x06, 0x07])) || buffer.includes(Buffer.from([0x50, 0x4b, 0x06, 0x06]))) {
        throw new ZipSecurityError('ZIP64_UNSUPPORTED', 'ZIP64 format is not supported for security isolation');
    }

    // 3. Reverse Scan for EOCD (End of Central Directory)
    // EOCD record is 22 bytes minimum; comment field can be at most 65,535 bytes
    const maxSearch = Math.min(bufLen, 22 + 65535);
    let eocdOffset = -1;

    for (let i = bufLen - 22; i >= bufLen - maxSearch; i--) {
        if (buffer.readUInt32LE(i) === SIGNATURES.EOCD) {
            const commentLength = buffer.readUInt16LE(i + 20);
            // Verify exact boundary consistency to defeat forged EOCD signatures in comments
            if (i + 22 + commentLength === bufLen) {
                eocdOffset = i;
                break;
            }
        }
    }

    if (eocdOffset === -1) {
        throw new ZipSecurityError('INVALID_EOCD_SIGNATURE', 'Valid End-of-Central-Directory (EOCD) record not found or comment length boundary mismatched');
    }

    // 4. Parse & Validate EOCD Record
    const diskNumber = buffer.readUInt16LE(eocdOffset + 4);
    const diskStart = buffer.readUInt16LE(eocdOffset + 6);
    const diskEntries = buffer.readUInt16LE(eocdOffset + 8);
    const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
    const cdSize = buffer.readUInt32LE(eocdOffset + 12);
    const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

    // Multi-disk spanned archives rejection
    if (diskNumber !== 0 || diskStart !== 0 || diskEntries !== totalEntries) {
        throw new ZipSecurityError('MULTI_DISK_ZIP_REJECTED', 'Multi-disk or spanned ZIP archives are strictly prohibited');
    }

    // ZIP64 sentinel values rejection
    if (totalEntries === 0xFFFF || cdSize === 0xFFFFFFFF || cdOffset === 0xFFFFFFFF) {
        throw new ZipSecurityError('ZIP64_UNSUPPORTED', 'ZIP64 sentinel field detected in EOCD');
    }

    // Entry count restriction
    if (totalEntries > ZIP_LIMITS.MAX_ENTRIES_COUNT) {
        throw new ZipSecurityError('ZIP_TOO_MANY_ENTRIES', `Archive contains ${totalEntries} entries, exceeding maximum allowed limit (${ZIP_LIMITS.MAX_ENTRIES_COUNT})`);
    }

    if (totalEntries === 0) {
        return { entriesCount: 0, cumulativeUncompressedSize: 0, entries: [] };
    }

    // Central Directory bounds verification
    if (cdOffset + cdSize > eocdOffset) {
        throw new ZipSecurityError('CORRUPT_CENTRAL_DIRECTORY', 'Central Directory overlaps End-of-Central-Directory record');
    }
    if (cdOffset > eocdOffset) {
        throw new ZipSecurityError('CORRUPT_CENTRAL_DIRECTORY', 'Central Directory offset points past EOCD');
    }

    // 5. Parse Central Directory Headers
    let pointer = cdOffset;
    let cumulativeUncompressedSize = 0;
    const entries = [];
    const payloadIntervals = [];

    for (let idx = 0; idx < totalEntries; idx++) {
        if (pointer + 46 > cdOffset + cdSize) {
            throw new ZipSecurityError('CORRUPT_CENTRAL_DIRECTORY', `Central directory truncated at entry ${idx}`);
        }

        const cdSig = buffer.readUInt32LE(pointer);
        if (cdSig !== SIGNATURES.CENTRAL_DIR_HEADER) {
            throw new ZipSecurityError('INVALID_CD_HEADER_SIGNATURE', `Invalid Central Directory signature at offset ${pointer}`);
        }

        const flag = buffer.readUInt16LE(pointer + 8);
        const method = buffer.readUInt16LE(pointer + 10);
        const compressedSize = buffer.readUInt32LE(pointer + 20);
        const uncompressedSize = buffer.readUInt32LE(pointer + 24);
        const fileNameLength = buffer.readUInt16LE(pointer + 28);
        const extraFieldLength = buffer.readUInt16LE(pointer + 30);
        const commentLength = buffer.readUInt16LE(pointer + 32);
        const localHeaderOffset = buffer.readUInt32LE(pointer + 42);

        // Encryption Check (Bit 0)
        if ((flag & 0x0001) !== 0) {
            throw new ZipSecurityError('ENCRYPTED_ZIP_REJECTED', 'Encrypted or password-protected ZIP entries are strictly prohibited');
        }

        // Compression Method Check (0 = Store, 8 = Deflate)
        if (method !== 0 && method !== 8) {
            throw new ZipSecurityError('UNSUPPORTED_COMPRESSION_METHOD', `Unsupported compression method: ${method}. Only Store (0) and Deflate (8) allowed`);
        }

        // Filename extraction
        const nameStart = pointer + 46;
        const nameEnd = nameStart + fileNameLength;
        if (nameEnd > cdOffset + cdSize) {
            throw new ZipSecurityError('CORRUPT_CENTRAL_DIRECTORY', 'Entry filename overflows Central Directory');
        }
        const fileName = buffer.toString('utf8', nameStart, nameEnd);

        // Path Traversal Security Checks
        if (
            fileName.includes('..') ||
            fileName.startsWith('/') ||
            fileName.startsWith('\\') ||
            /^[a-zA-Z]:/.test(fileName) ||
            path.isAbsolute(fileName) ||
            path.normalize(fileName).startsWith('..')
        ) {
            throw new ZipSecurityError('ZIP_PATH_TRAVERSAL_DETECTED', `Path traversal sequence detected in entry filename: ${fileName}`);
        }

        // Single Entry Size Check
        if (uncompressedSize > ZIP_LIMITS.MAX_SINGLE_FILE_SIZE) {
            throw new ZipSecurityError('ZIP_SINGLE_ENTRY_SIZE_EXCEEDED', `Entry "${fileName}" uncompressed size (${(uncompressedSize / (1024 * 1024)).toFixed(2)} MB) exceeds 5 MB limit`);
        }

        // Compression Ratio Bomb Check (for files > 10 KB)
        if (uncompressedSize > 10240) {
            const ratio = uncompressedSize / Math.max(compressedSize, 1);
            if (ratio > ZIP_LIMITS.MAX_COMPRESSION_RATIO) {
                throw new ZipSecurityError('ZIP_COMPRESSION_RATIO_EXCEEDED', `Compression ratio for "${fileName}" (${ratio.toFixed(1)}:1) exceeds 10:1 safety threshold`);
            }
        }

        // Cumulative Size Accumulation
        cumulativeUncompressedSize += uncompressedSize;
        if (cumulativeUncompressedSize > ZIP_LIMITS.MAX_TOTAL_UNCOMPRESSED_SIZE) {
            throw new ZipSecurityError('ZIP_CUMULATIVE_SIZE_EXCEEDED', `Total uncompressed size (${(cumulativeUncompressedSize / (1024 * 1024)).toFixed(2)} MB) exceeds 50 MB safety limit`);
        }

        // 6. Local Header Consistency & Boundary Validation
        if (localHeaderOffset + 30 > cdOffset) {
            throw new ZipSecurityError('CORRUPT_LOCAL_HEADER_OFFSET', `Local header offset ${localHeaderOffset} for "${fileName}" overflows Central Directory`);
        }

        const localSig = buffer.readUInt32LE(localHeaderOffset);
        if (localSig !== SIGNATURES.LOCAL_FILE_HEADER) {
            throw new ZipSecurityError('CORRUPT_LOCAL_HEADER', `Invalid local file header signature for "${fileName}" at offset ${localHeaderOffset}`);
        }

        const localFlag = buffer.readUInt16LE(localHeaderOffset + 6);
        const localCompressed = buffer.readUInt32LE(localHeaderOffset + 18);
        const localUncompressed = buffer.readUInt32LE(localHeaderOffset + 22);
        const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
        const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);

        const localName = buffer.toString('utf8', localHeaderOffset + 30, localHeaderOffset + 30 + localNameLen);

        // Header consistency verification
        if (localName !== fileName) {
            throw new ZipSecurityError('ZIP_HEADER_MISMATCH', `Local header filename ("${localName}") does not match central directory ("${fileName}")`);
        }

        // Bit 3 (Data Descriptor): If bit 3 is NOT set, local and central sizes must match exactly
        if ((flag & 0x0008) === 0) {
            if (localCompressed !== compressedSize || localUncompressed !== uncompressedSize) {
                throw new ZipSecurityError('ZIP_HEADER_MISMATCH', `Size mismatch between local header and central directory for "${fileName}"`);
            }
        }

        // Data payload extents
        const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
        const dataEnd = dataStart + compressedSize;

        if (dataEnd > cdOffset) {
            throw new ZipSecurityError('CORRUPT_LOCAL_DATA_EXTENTS', `Payload for "${fileName}" overflows into Central Directory boundary`);
        }

        payloadIntervals.push({
            start: localHeaderOffset,
            end: dataEnd,
            fileName
        });

        entries.push({
            fileName,
            compressedSize,
            uncompressedSize,
            method,
            isDir: fileName.endsWith('/')
        });

        // Advance to next Central Directory record
        pointer += 46 + fileNameLength + extraFieldLength + commentLength;
    }

    // 7. Overlap Detection (Shared-Payload / Zip Bomb Neutralization)
    payloadIntervals.sort((a, b) => a.start - b.start);

    for (let i = 0; i < payloadIntervals.length - 1; i++) {
        const current = payloadIntervals[i];
        const next = payloadIntervals[i + 1];

        if (current.end > next.start) {
            throw new ZipSecurityError(
                'ZIP_PAYLOAD_OVERLAP_DETECTED',
                `Overlapping payload intervals detected between "${current.fileName}" [${current.start}..${current.end}) and "${next.fileName}" [${next.start}..${next.end})`
            );
        }
    }

    return {
        isValid: true,
        entriesCount: totalEntries,
        cumulativeUncompressedSize,
        entries
    };
};

export default {
    ZIP_LIMITS,
    ZipSecurityError,
    validateZipPreflight
};
