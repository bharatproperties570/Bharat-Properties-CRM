import path from 'path';

/**
 * Enterprise ZIP Binary Preflight & Security Validator (Gate 2R.12 / APPNOTE 6.3.3)
 * 
 * Implements byte-level binary preflight directly on raw ZIP buffers to neutralize:
 * 1. Zip bombs (compression ratio > 10:1, cumulative > 50 MB, single entry > 5 MB, entries > 100).
 * 2. Path traversal attacks (relative paths `..`, root slash `/`, Windows volume `C:`, alternate data streams `:`).
 * 3. Shared-payload and descriptor-overlapping file intervals.
 * 4. Local header vs Central Directory header spoofing / mismatches.
 * 5. Data Descriptor validation (Bit 3) with signature (16B) and without signature (12B).
 * 6. ZIP symbolic-link (S_IFLNK) and unsupported file-type rejection (FIFO, device files, sockets).
 * 7. ZIP64 and multi-disk spanned archives.
 * 8. Forged EOCD signatures in archive comment fields and central-directory boundary integrity.
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
    DATA_DESCRIPTOR: 0x08074b50,         // PK\x07\x08
    ZIP64_EOCD_LOCATOR: 0x07064b50,      // PK\x06\x07
    ZIP64_EOCD_RECORD: 0x06064b50        // PK\x06\x06
};

// POSIX File Types in externalFileAttr (upper 16 bits)
const POSIX_TYPES = {
    S_IFMT:   0o170000,
    S_IFSOCK: 0o140000,
    S_IFLNK:  0o120000,
    S_IFREG:  0o100000,
    S_IFBLK:  0o060000,
    S_IFDIR:  0o040000,
    S_IFCHR:  0o020000,
    S_IFIFO:  0o010000
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
    const maxSearch = Math.min(bufLen, 22 + 65535);
    let eocdOffset = -1;

    for (let i = bufLen - 22; i >= bufLen - maxSearch; i--) {
        if (buffer.readUInt32LE(i) === SIGNATURES.EOCD) {
            const commentLength = buffer.readUInt16LE(i + 20);
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
        if (cdOffset !== eocdOffset || cdSize !== 0) {
            throw new ZipSecurityError('CORRUPT_CENTRAL_DIRECTORY', 'Empty archive contains non-zero Central Directory pointer');
        }
        return { entriesCount: 0, cumulativeUncompressedSize: 0, entries: [] };
    }

    // Central Directory and EOCD boundary integrity: Central Directory must end exactly where EOCD begins
    if (cdOffset + cdSize !== eocdOffset) {
        throw new ZipSecurityError('CORRUPT_CENTRAL_DIRECTORY', `Central Directory extent (${cdOffset} + ${cdSize} = ${cdOffset + cdSize}) does not match EOCD start boundary (${eocdOffset})`);
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

        const versionMadeBy = buffer.readUInt16LE(pointer + 4);
        const flag = buffer.readUInt16LE(pointer + 8);
        const method = buffer.readUInt16LE(pointer + 10);
        const crc = buffer.readUInt32LE(pointer + 16);
        const compressedSize = buffer.readUInt32LE(pointer + 20);
        const uncompressedSize = buffer.readUInt32LE(pointer + 24);
        const fileNameLength = buffer.readUInt16LE(pointer + 28);
        const extraFieldLength = buffer.readUInt16LE(pointer + 30);
        const commentLength = buffer.readUInt16LE(pointer + 32);
        const externalFileAttr = buffer.readUInt32LE(pointer + 38);
        const localHeaderOffset = buffer.readUInt32LE(pointer + 42);

        // Security: File Type & Symlink Verification via POSIX mode
        const posixMode = (externalFileAttr >>> 16) & POSIX_TYPES.S_IFMT;
        if (posixMode === POSIX_TYPES.S_IFLNK) {
            throw new ZipSecurityError('ZIP_SYMLINK_REJECTED', `Symbolic link entry detected in ZIP archive (mode: 0o${posixMode.toString(8)})`);
        }
        if (posixMode !== 0 && posixMode !== POSIX_TYPES.S_IFREG && posixMode !== POSIX_TYPES.S_IFDIR) {
            throw new ZipSecurityError('UNSUPPORTED_FILE_TYPE', `Unsupported file type detected in ZIP archive (mode: 0o${posixMode.toString(8)})`);
        }
        // MSDOS Volume label check
        if ((externalFileAttr & 0x08) !== 0) {
            throw new ZipSecurityError('UNSUPPORTED_FILE_TYPE', 'MS-DOS volume label entries are not supported');
        }

        // Encryption Check (Bit 0)
        if ((flag & 0x0001) !== 0) {
            throw new ZipSecurityError('ENCRYPTED_ZIP_REJECTED', 'Encrypted or password-protected ZIP entries are strictly prohibited');
        }

        // Compression Method Check (0 = Store, 8 = Deflate)
        if (method !== 0 && method !== 8) {
            throw new ZipSecurityError('UNSUPPORTED_COMPRESSION_METHOD', `Unsupported compression method: ${method}. Only Store (0) and Deflate (8) allowed`);
        }

        // For Stored files, compressed and uncompressed size must be identical
        if (method === 0 && compressedSize !== uncompressedSize) {
            throw new ZipSecurityError('CORRUPT_LOCAL_DATA_EXTENTS', `Stored entry specifies compressed size ${compressedSize} !== uncompressed size ${uncompressedSize}`);
        }

        // Filename extraction & normalization checks
        const nameStart = pointer + 46;
        const nameEnd = nameStart + fileNameLength;
        if (nameEnd > cdOffset + cdSize) {
            throw new ZipSecurityError('CORRUPT_CENTRAL_DIRECTORY', 'Entry filename overflows Central Directory');
        }
        const fileName = buffer.toString('utf8', nameStart, nameEnd);

        // Disallow null bytes and control characters
        if (fileName.includes('\0')) {
            throw new ZipSecurityError('ZIP_PATH_TRAVERSAL_DETECTED', 'Null byte detected in entry filename');
        }
        if (/[\x01-\x1f]/.test(fileName)) {
            throw new ZipSecurityError('INVALID_ENTRY_FILENAME', 'Control characters detected in entry filename');
        }

        // Path Traversal Security Checks (including Windows alternate data streams ':')
        const normalized = path.normalize(fileName.replace(/\\/g, '/'));
        if (
            fileName.includes('..') ||
            fileName.includes(':') ||
            fileName.startsWith('/') ||
            fileName.startsWith('\\') ||
            path.isAbsolute(fileName) ||
            normalized.startsWith('../') ||
            normalized === '..' ||
            path.isAbsolute(normalized)
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

        const hasDataDescriptor = (flag & 0x0008) !== 0;

        // If Bit 3 is NOT set, local and central sizes must match exactly
        if (!hasDataDescriptor) {
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

        let entryEndOffset = dataEnd;

        // 🛡️ Data Descriptor Validation (Bit 3)
        if (hasDataDescriptor) {
            let descriptorFound = false;

            // Form A: With signature 0x08074b50 (16 bytes: sig 4B, crc 4B, comp 4B, uncomp 4B)
            if (dataEnd + 16 <= cdOffset && buffer.readUInt32LE(dataEnd) === SIGNATURES.DATA_DESCRIPTOR) {
                const descComp = buffer.readUInt32LE(dataEnd + 8);
                const descUncomp = buffer.readUInt32LE(dataEnd + 12);
                if (descComp !== compressedSize || descUncomp !== uncompressedSize) {
                    throw new ZipSecurityError('ZIP_DESCRIPTOR_MISMATCH', `Data descriptor size mismatch for "${fileName}"`);
                }
                entryEndOffset = dataEnd + 16;
                descriptorFound = true;
            }
            // Form B: Without signature (12 bytes: crc 4B, comp 4B, uncomp 4B)
            else if (dataEnd + 12 <= cdOffset) {
                const descComp = buffer.readUInt32LE(dataEnd + 4);
                const descUncomp = buffer.readUInt32LE(dataEnd + 8);
                if (descComp === compressedSize && descUncomp === uncompressedSize) {
                    entryEndOffset = dataEnd + 12;
                    descriptorFound = true;
                }
            }

            if (!descriptorFound) {
                throw new ZipSecurityError('CORRUPT_DATA_DESCRIPTOR', `Valid Data Descriptor not found following compressed payload for "${fileName}"`);
            }
        }

        // Ensure entry extent does not overflow into Central Directory
        if (entryEndOffset > cdOffset) {
            throw new ZipSecurityError('CORRUPT_LOCAL_DATA_EXTENTS', `Entry "${fileName}" with descriptor overflows Central Directory`);
        }

        payloadIntervals.push({
            start: localHeaderOffset,
            end: entryEndOffset,
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
                `Overlapping payload/descriptor intervals detected between "${current.fileName}" [${current.start}..${current.end}) and "${next.fileName}" [${next.start}..${next.end})`
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
