import express from 'express';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { uploadGeneric } from '../src/middlewares/upload.middleware.js';
import { uploadFileToDrive, deleteFileFromDrive, getFileMetadata, downloadFileBuffer } from '../services/drive.service.js';
import { authenticate } from "../src/middlewares/auth.middleware.js";
import Document from '../models/Document.js';
import DocumentVersion from '../models/DocumentVersion.js';
import DirectUploadRecord from '../models/DirectUploadRecord.js';
import DocumentAccessService from '../services/storage/DocumentAccessService.js';
import { getVisibilityFilter } from '../utils/visibility.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * In-memory registry for uploaded file ownership to protect direct uploads
 * before or alongside MongoDB document association.
 */
export const fileUploadOwnership = new Map();

/**
 * Evaluates whether a requesting user is authorized to access an ownership record
 * under strict multi-tenant isolation rules.
 */
export function isAuthorizedForRecord(record, user, userId, userTenantId) {
    if (!record || !user) return false;

    const roleName = user.role?.name?.toLowerCase() || (typeof user.role === 'string' ? user.role.toLowerCase() : '');
    const dataScope = user.dataScope?.toLowerCase() || '';
    const isPlatformAdmin = (roleName === 'admin' || roleName === 'super admin') && dataScope === 'all';

    // Platform administrator override under documented policy:
    // A platform administrator with global dataScope ('all') and without tenant lockdown can administer files across tenants
    if (isPlatformAdmin && !userTenantId) {
        return true;
    }

    // Strict tenant identity enforcement:
    // If the record has a tenantId, the requesting user MUST have a matching tenant identity
    if (record.tenantId) {
        // Missing tenant identity must NOT bypass tenant isolation
        if (!userTenantId) {
            return false;
        }

        // Different tenant is strictly rejected
        if (record.tenantId !== userTenantId) {
            return false;
        }

        // Within the matching tenant:
        // 1. Same owner + same tenant -> ALLOWED
        if (record.userId && userId && String(record.userId) === String(userId)) {
            return true;
        }

        // 2. Tenant administrator / manager within matching tenant -> ALLOWED
        if (roleName === 'admin' || roleName === 'super admin' || roleName === 'manager') {
            return true;
        }

        // 3. Different user in same tenant without elevated permissions -> DENIED
        return false;
    }

    // Unscoped record (no tenantId on record):
    if (record.userId && userId && String(record.userId) === String(userId)) {
        return true;
    }

    if (isPlatformAdmin) {
        return true;
    }

    return false;
}

/**
 * Register file upload ownership for IDOR protection.
 * Updates the in-memory cache and persists a durable record in MongoDB.
 * Enforces collision detection and insert-only semantics: never overwrites existing records without explicit verified ownership policy.
 * Fails closed if durable persistence cannot be completed when MongoDB is expected to be available.
 */
export async function registerUploadedFile(fileId, user, options = {}) {
    if (!fileId || !user) return null;
    const sanitized = path.basename(fileId);
    const userId = user._id || user.id;
    const rawTenantId = user.tenantId || user.tenant;
    const tenantId = rawTenantId ? String(rawTenantId) : null;
    const batchToken = options.batchToken || options.tracker?.batchToken || crypto.randomUUID();

    const record = {
        userId: userId ? String(userId) : null,
        tenantId,
        storage: options.storage || (fileId.startsWith('gdrive:') ? 'google_drive' : 'local'),
        originalName: options.originalName || null,
        mimeType: options.mimeType || null,
        sizeBytes: options.sizeBytes || null,
        batchToken,
        timestamp: Date.now()
    };

    // 1. In-memory collision detection
    const existingMem = fileUploadOwnership.get(fileId) || fileUploadOwnership.get(sanitized);
    if (existingMem) {
        if (existingMem.userId && String(existingMem.userId) !== String(userId)) {
            throw new Error(`Upload collision: file ID ${fileId} already exists in ownership registry for another user`);
        }
        const isSameBatch = existingMem.batchToken && existingMem.batchToken === batchToken;
        if (!options.allowOverwrite && !isSameBatch) {
            throw new Error(`Upload collision: file ID ${fileId} is already registered in ownership registry`);
        }
    }

    // Persist to durable CRM record in MongoDB if connected
    const isMongoConnected = mongoose.connection && mongoose.connection.readyState === 1;
    const isMongoExpected = Boolean(process.env.MONGODB_URI || process.env.NODE_ENV === 'production' || isMongoConnected);

    let createdRecordIds = [];
    if (isMongoConnected) {
        let docsToInsert = [];
        try {
            // Collision detection query in MongoDB (checks both fileId and sanitizedFileId alias)
            const existingRecords = await DirectUploadRecord.find({
                $or: [
                    { fileId: { $in: [fileId, sanitized] } },
                    { sanitizedFileId: { $in: [fileId, sanitized] } }
                ]
            }).lean();

            for (const existing of existingRecords) {
                if (existing.userId && String(existing.userId) !== String(userId)) {
                    throw new Error(`Upload collision: file ID ${existing.fileId} already exists and belongs to another user`);
                }
                const isSameBatch = existing.batchToken && existing.batchToken === batchToken;
                if (!options.allowOverwrite && !isSameBatch) {
                    throw new Error(`Upload collision: file ID ${existing.fileId} is already registered for this user`);
                }
            }

            // Insert-only semantics with unique IDs and batch-scoped ownership token
            docsToInsert = [
                new DirectUploadRecord({
                    fileId,
                    sanitizedFileId: sanitized,
                    userId: record.userId,
                    tenantId: record.tenantId,
                    batchToken,
                    storage: record.storage,
                    originalName: record.originalName,
                    mimeType: record.mimeType,
                    sizeBytes: record.sizeBytes
                })
            ];

            if (sanitized !== fileId) {
                docsToInsert.push(new DirectUploadRecord({
                    fileId: sanitized,
                    sanitizedFileId: sanitized,
                    userId: record.userId,
                    tenantId: record.tenantId,
                    batchToken,
                    storage: record.storage,
                    originalName: record.originalName,
                    mimeType: record.mimeType,
                    sizeBytes: record.sizeBytes
                }));
            }

            // Pre-notify tracker of the exact _ids and fileIds BEFORE executing bulkWrite
            if (options.tracker) {
                docsToInsert.forEach(d => {
                    options.tracker.addRecordId?.(String(d._id));
                    options.tracker.addFileId?.(d.fileId);
                });
            }

            const bulkOps = docsToInsert.map(doc => ({
                insertOne: { document: doc.toObject() }
            }));

            await DirectUploadRecord.bulkWrite(bulkOps, { ordered: true });

            createdRecordIds = docsToInsert.map(d => String(d._id));

            // Set memory cache only AFTER successful durable persistence
            fileUploadOwnership.set(sanitized, record);
            fileUploadOwnership.set(fileId, record);
        } catch (dbErr) {
            // Check for MongoDB E11000 duplicate key error and handle as controlled upload collision (P1)
            const isE11000 = dbErr.code === 11000 ||
                             (dbErr.writeErrors && dbErr.writeErrors.some(e => e.code === 11000)) ||
                             (dbErr.message && dbErr.message.includes('E11000'));

            if (isE11000) {
                // Roll back in-memory registrations for this specific attempt ONLY if set by this batchToken
                const mem1 = fileUploadOwnership.get(sanitized);
                if (mem1 && mem1.batchToken === batchToken) fileUploadOwnership.delete(sanitized);
                const mem2 = fileUploadOwnership.get(fileId);
                if (mem2 && mem2.batchToken === batchToken) fileUploadOwnership.delete(fileId);

                // Clean up any partially inserted records in MongoDB for this specific batchToken
                try {
                    const cleanupConditions = [{ batchToken }];
                    if (docsToInsert.length > 0) {
                        cleanupConditions.push({ _id: { $in: docsToInsert.map(d => d._id) } });
                    }
                    const cleanupQuery = { $or: cleanupConditions };
                    if (record.userId) {
                        cleanupQuery.userId = record.userId;
                    }
                    await DirectUploadRecord.deleteMany(cleanupQuery);
                } catch (cleanupErr) {
                    console.error('[UploadAuth] Emergency cleanup failed on E11000:', cleanupErr.message);
                }

                const dupKey = dbErr.keyValue?.fileId || dbErr.writeErrors?.[0]?.keyValue?.fileId || fileId;
                const collisionError = new Error(`Upload collision: duplicate key E11000 on fileId ${dupKey} already exists in database`);
                collisionError.code = 11000;
                collisionError.isCollision = true;
                throw collisionError;
            }

            if (dbErr.message && dbErr.message.includes('Upload collision:')) {
                throw dbErr;
            }

            // Roll back in-memory registrations for this specific attempt ONLY if set by this batchToken
            const mem1 = fileUploadOwnership.get(sanitized);
            if (mem1 && mem1.batchToken === batchToken) fileUploadOwnership.delete(sanitized);
            const mem2 = fileUploadOwnership.get(fileId);
            if (mem2 && mem2.batchToken === batchToken) fileUploadOwnership.delete(fileId);

            // Clean up any partially inserted records in MongoDB for this specific batchToken
            try {
                const cleanupConditions = [{ batchToken }];
                if (docsToInsert.length > 0) {
                    cleanupConditions.push({ _id: { $in: docsToInsert.map(d => d._id) } });
                }
                const cleanupQuery = { $or: cleanupConditions };
                if (record.userId) {
                    cleanupQuery.userId = record.userId;
                }
                await DirectUploadRecord.deleteMany(cleanupQuery);
            } catch (cleanupErr) {
                console.error('[UploadAuth] Emergency cleanup failed:', cleanupErr.message);
            }

            console.error('[UploadAuth] Failed to persist durable DirectUploadRecord:', dbErr.message);
            throw new Error(`Failed to persist durable ownership record for file ${sanitized}: ${dbErr.message}`);
        }
    } else if (isMongoExpected) {
        throw new Error(`MongoDB connection is not ready for durable upload registration of ${sanitized}`);
    } else {
        // Disconnected unit tests without MongoDB
        fileUploadOwnership.set(sanitized, record);
        fileUploadOwnership.set(fileId, record);
    }

    if (options.tracker) {
        options.tracker.addFileId?.(fileId);
        options.tracker.addFileId?.(sanitized);
    }

    return {
        fileId,
        sanitized,
        batchToken,
        recordIds: createdRecordIds
    };
}

/**
 * Enforces strict document-level authorization on legacy file access endpoints.
 * Prevents Insecure Direct Object References (IDOR) across users and tenants.
 *
 * Rules:
 * 1. Checks memory ownership table for fast direct upload lookup using strict tenant policy.
 * 2. Queries durable DirectUploadRecord in MongoDB (handles server restarts and multi-instance deployments).
 * 3. Checks canonical DocumentVersion & Document models using DocumentAccessService.
 *    - Respects entity visibility, lifecycle rules, legal hold, and RBAC permissions.
 * 4. Checks CRM entities (Lead, Deal, Contact, Inventory, Project) using getVisibilityFilter.
 * 5. Disallowed or unverified resources return false (triggering a generic 404).
 */
export async function authorizeFileAccess(user, fileId, operation = 'READ') {
    if (!user) return false;
    if (!fileId || typeof fileId !== 'string') return false;

    const sanitized = path.basename(fileId.trim());
    if (!sanitized) return false;

    const userId = user._id || user.id;
    const rawTenantId = user.tenantId || user.tenant;
    const userTenantId = rawTenantId ? String(rawTenantId) : null;

    // 1. Check in-memory upload registry for direct uploads
    if (fileUploadOwnership.has(sanitized) || fileUploadOwnership.has(fileId)) {
        const record = fileUploadOwnership.get(sanitized) || fileUploadOwnership.get(fileId);
        return isAuthorizedForRecord(record, user, userId, userTenantId);
    }

    // 2. If MongoDB is connected, query durable CRM records
    if (mongoose.connection && mongoose.connection.readyState === 1) {
        // 2a. Query durable DirectUploadRecord (handles server restarts and multi-instance deployments)
        try {
            const durableRecord = await DirectUploadRecord.findOne({
                $or: [
                    { fileId },
                    { sanitizedFileId: sanitized },
                    { fileId: sanitized }
                ]
            }).lean();

            if (durableRecord) {
                // Populate into in-memory cache for subsequent requests
                fileUploadOwnership.set(fileId, durableRecord);
                fileUploadOwnership.set(sanitized, durableRecord);

                return isAuthorizedForRecord(durableRecord, user, userId, userTenantId);
            }
        } catch (dbErr) {
            console.error('[UploadAuth] DirectUploadRecord check failed:', dbErr.message);
        }

        const accessService = new DocumentAccessService();

        // 2b. Check DocumentVersion by providerVersionId, objectKey, or versionId
        try {
            const version = await DocumentVersion.findOne({
                $or: [
                    { providerVersionId: sanitized },
                    { providerVersionId: fileId },
                    { objectKey: sanitized },
                    { objectKey: fileId },
                    { versionId: sanitized },
                    { versionId: fileId }
                ]
            }).lean();

            if (version) {
                try {
                    await accessService.authorizeAccess(user, version.documentId, operation, version.versionId);
                    return true;
                } catch (e) {
                    return false;
                }
            }
        } catch (dbErr) {
            console.error('[UploadAuth] DocumentVersion check failed:', dbErr.message);
        }

        // 2c. Check Document by documentId, metadata.fileId, or URL
        try {
            const doc = await Document.findOne({
                $or: [
                    { documentId: sanitized },
                    { documentId: fileId },
                    { 'metadata.fileId': sanitized },
                    { 'metadata.fileId': fileId }
                ]
            }).lean();

            if (doc) {
                try {
                    await accessService.authorizeAccess(user, doc.documentId, operation);
                    return true;
                } catch (e) {
                    return false;
                }
            }
        } catch (dbErr) {
            console.error('[UploadAuth] Document check failed:', dbErr.message);
        }

        // 2d. Check CRM entities (Lead, Deal, Contact, Inventory, Project) using canonical visibility filter
        try {
            const visibilityFilter = await getVisibilityFilter(user);
            const entityModels = ['Lead', 'Deal', 'Contact', 'Inventory', 'Project'];
            for (const modelName of entityModels) {
                if (mongoose.models[modelName]) {
                    const Model = mongoose.model(modelName);
                    const fileRegex = new RegExp(sanitized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                    const query = {
                        ...visibilityFilter,
                        $or: [
                            { 'documents.fileId': { $in: [sanitized, fileId] } },
                            { 'documents.url': fileRegex },
                            { 'files.fileId': { $in: [sanitized, fileId] } },
                            { 'attachments.fileId': { $in: [sanitized, fileId] } }
                        ]
                    };
                    const exists = await Model.exists(query);
                    if (exists) {
                        if (operation === 'DELETE') {
                            const hasPerm = await accessService.hasPermission(user, modelName.toLowerCase(), 'delete');
                            if (!hasPerm) return false;
                        }
                        return true;
                    }
                }
            }
        } catch (entityErr) {
            console.error('[UploadAuth] CRM entity check failed:', entityErr.message);
        }

        // In connected DB mode: file does not match any authorized Document or Entity -> FAIL CLOSED
        return false;
    }

    // 3. Fallback for non-connected database environments (e.g. lightweight isolated unit tests)
    // Only platform super-admins with dataScope 'all' and no tenant restriction are permitted
    const roleName = user.role?.name?.toLowerCase() || (typeof user.role === 'string' ? user.role.toLowerCase() : '');
    const dataScope = user.dataScope?.toLowerCase() || '';
    if (!userTenantId && (roleName === 'admin' || roleName === 'super admin') && dataScope === 'all') {
        return true;
    }

    return false;
}

/**
 * @route   POST /api/upload
 * @desc    Upload documents/images/videos to Google Drive with local fallback
 * @access  Private
 */
router.post('/', uploadGeneric.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded.' });
        }

        const { entityType, entityName, folderId, docCategory, docType } = req.body;
        
        const batchToken = `single-${Date.now()}-${crypto.randomUUID()}`;
        const singleRegisteredFileIds = new Set();
        const singleCreatedRecordIds = new Set();
        const tracker = {
            batchToken,
            addFileId(id) {
                if (id) {
                    singleRegisteredFileIds.add(id);
                    singleRegisteredFileIds.add(path.basename(id));
                }
            },
            addRecordId(id) {
                if (id) singleCreatedRecordIds.add(String(id));
            }
        };

        try {
            const driveService = req.app?.get?.('driveService') || undefined;
            // Attempt Google Drive Upload
            const result = await uploadFileToDrive(req.file, { 
                entityType, 
                entityName, 
                folderId,
                docCategory,
                docType,
                userId: req.user?._id || req.user?.id,
                driveService
            });

            try {
                await registerUploadedFile(result.id, req.user, {
                    storage: 'google_drive',
                    originalName: req.file.originalname,
                    mimeType: req.file.mimetype,
                    sizeBytes: req.file.size,
                    batchToken,
                    tracker
                });
                if (req.file.filename && req.file.filename !== result.id) {
                    await registerUploadedFile(req.file.filename, req.user, {
                        storage: 'google_drive',
                        originalName: req.file.originalname,
                        mimeType: req.file.mimetype,
                        sizeBytes: req.file.size,
                        batchToken,
                        tracker
                    });
                }
            } catch (regError) {
                // If durable ownership could not be persisted, fail closed!
                for (const id of singleRegisteredFileIds) {
                    const mem = fileUploadOwnership.get(id);
                    if (mem && mem.batchToken === batchToken) {
                        fileUploadOwnership.delete(id);
                    }
                }
                if (mongoose.connection && mongoose.connection.readyState === 1) {
                    const userId = req.user?._id || req.user?.id;
                    const deleteConditions = [{ batchToken }];
                    if (singleCreatedRecordIds.size > 0) {
                        deleteConditions.push({ _id: { $in: Array.from(singleCreatedRecordIds) } });
                    }
                    const deleteQuery = { $or: deleteConditions };
                    if (userId) deleteQuery.userId = String(userId);
                    await DirectUploadRecord.deleteMany(deleteQuery).catch(() => {});
                }
                console.error('[UploadRoute] Durable ownership registration failed:', regError.message);
                return res.status(500).json({
                    success: false,
                    error: 'Upload failed: could not establish durable file ownership record.',
                    details: regError.message
                });
            }

            return res.status(200).json({
                success: true,
                url: result.url,
                fileId: result.id,
                downloadUrl: result.downloadUrl,
                fileName: req.file.originalname,
                mimeType: req.file.mimetype,
                storage: 'google_drive',
                batchToken
            });
        } catch (driveError) {
            console.warn('[UploadRoute] Google Drive upload failed, falling back to LOCAL storage:', driveError.message);
            
            // Fallback: Return local URL (the file is already saved in uploads/ by multer)
            const localUrl = `/uploads/${req.file.filename}`;
            try {
                await registerUploadedFile(req.file.filename, req.user, {
                    storage: 'local',
                    originalName: req.file.originalname,
                    mimeType: req.file.mimetype,
                    sizeBytes: req.file.size,
                    batchToken,
                    tracker
                });
            } catch (regError) {
                for (const id of singleRegisteredFileIds) {
                    const mem = fileUploadOwnership.get(id);
                    if (mem && mem.batchToken === batchToken) {
                        fileUploadOwnership.delete(id);
                    }
                }
                if (mongoose.connection && mongoose.connection.readyState === 1) {
                    const userId = req.user?._id || req.user?.id;
                    const deleteConditions = [{ batchToken }];
                    if (singleCreatedRecordIds.size > 0) {
                        deleteConditions.push({ _id: { $in: Array.from(singleCreatedRecordIds) } });
                    }
                    const deleteQuery = { $or: deleteConditions };
                    if (userId) deleteQuery.userId = String(userId);
                    await DirectUploadRecord.deleteMany(deleteQuery).catch(() => {});
                }
                if (req.file && req.file.path && fs.existsSync(req.file.path)) {
                    try { fs.unlinkSync(req.file.path); } catch (e) {}
                }
                console.error('[UploadRoute] Durable ownership registration failed for local file:', regError.message);
                return res.status(500).json({
                    success: false,
                    error: 'Upload failed: could not establish durable file ownership record.',
                    details: regError.message
                });
            }
            
            return res.status(200).json({
                success: true,
                url: localUrl,
                fileId: req.file.filename,
                downloadUrl: localUrl,
                fileName: req.file.originalname,
                mimeType: req.file.mimetype,
                storage: 'local',
                batchToken
            });
        }
    } catch (error) {
        console.error('Upload Route Error:', error.message);
        // Clean up the uploaded file if we failed completely (e.g. invalid request parameters)
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (unlinkErr) {
                console.error('Failed to delete temp file on route error:', unlinkErr.message);
            }
        }
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   POST /api/upload/multiple
 * @desc    Upload multiple files with per-file Google Drive & local fallback
 *          Enforces atomic batch ownership registration with complete fail-closed rollback.
 * @access  Private
 */
router.post('/multiple', uploadGeneric.array('files', 10), async (req, res) => {
    // Generate a unique batch-scoped ownership token and exact record ID tracker
    const batchToken = `batch-${Date.now()}-${crypto.randomUUID()}`;
    const batchRegisteredFileIds = new Set();
    const batchCreatedRecordIds = new Set();

    const tracker = {
        batchToken,
        addFileId(id) {
            if (id) {
                batchRegisteredFileIds.add(id);
                batchRegisteredFileIds.add(path.basename(id));
            }
        },
        addRecordId(id) {
            if (id) {
                batchCreatedRecordIds.add(String(id));
            }
        }
    };

    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: 'No files uploaded.' });
        }

        const { entityType, entityName, folderId, docCategory, docType } = req.body;
        const userId = req.user?._id || req.user?.id;
        const driveService = req.app?.get?.('driveService') || undefined;

        // Process all files in the batch concurrently
        const uploadPromises = req.files.map(async (file, index) => {
            try {
                // 1. Attempt Google Drive Upload
                const driveRes = await uploadFileToDrive(file, {
                    entityType,
                    entityName,
                    folderId,
                    docCategory,
                    docType,
                    userId,
                    driveService
                });

                // Step 1a: Register Drive file ID
                await registerUploadedFile(driveRes.id, req.user, {
                    storage: 'google_drive',
                    originalName: file.originalname,
                    mimeType: file.mimetype,
                    sizeBytes: file.size,
                    batchToken,
                    tracker
                });

                // Step 1b: Register local filename alias if distinct
                if (file.filename && file.filename !== driveRes.id) {
                    try {
                        await registerUploadedFile(file.filename, req.user, {
                            storage: 'google_drive',
                            originalName: file.originalname,
                            mimeType: file.mimetype,
                            sizeBytes: file.size,
                            batchToken,
                            tracker
                        });
                    } catch (aliasErr) {
                        // Failure during second registration for this file!
                        // Remove its first registration from cache ONLY if matching batchToken
                        const memDrive = fileUploadOwnership.get(driveRes.id);
                        if (memDrive && memDrive.batchToken === batchToken) {
                            fileUploadOwnership.delete(driveRes.id);
                        }
                        const sanitizedDriveId = path.basename(driveRes.id);
                        const memSan = fileUploadOwnership.get(sanitizedDriveId);
                        if (memSan && memSan.batchToken === batchToken) {
                            fileUploadOwnership.delete(sanitizedDriveId);
                        }
                        console.error(`[UploadRoute] Alias registration failed for ${file.originalname}:`, aliasErr.message);
                        throw aliasErr;
                    }
                }

                return {
                    success: true,
                    url: driveRes.url,
                    fileId: driveRes.id,
                    downloadUrl: driveRes.downloadUrl,
                    fileName: file.originalname,
                    mimeType: file.mimetype,
                    storage: 'google_drive'
                };
            } catch (driveErr) {
                // If error was an explicit ownership registration failure, fail closed immediately!
                if (driveErr.message && (
                    driveErr.message.includes('durable ownership record') ||
                    driveErr.message.includes('Failed to persist durable ownership record') ||
                    driveErr.message.includes('Upload collision:')
                )) {
                    throw driveErr;
                }

                // Otherwise, Google Drive upload itself failed; fall back to local storage
                console.warn(`[UploadRoute] Multiple upload: Drive failed for ${file.originalname}, falling back to LOCAL:`, driveErr.message);
                const localUrl = `/uploads/${file.filename}`;

                await registerUploadedFile(file.filename, req.user, {
                    storage: 'local',
                    originalName: file.originalname,
                    mimeType: file.mimetype,
                    sizeBytes: file.size,
                    batchToken,
                    tracker
                });

                return {
                    success: true,
                    url: localUrl,
                    fileId: file.filename,
                    downloadUrl: localUrl,
                    fileName: file.originalname,
                    mimeType: file.mimetype,
                    storage: 'local'
                };
            }
        });

        // Settle all upload promises concurrently to ensure no async operations leak records after rollback
        const settledResults = await Promise.allSettled(uploadPromises);

        const rejected = settledResults.filter(r => r.status === 'rejected');
        if (rejected.length > 0) {
            // At least one file failed registration -> Trigger complete batch rollback!
            const firstReason = rejected[0]?.reason?.message || 'Batch ownership registration failed';
            console.error(`[UploadRoute] Batch upload encountered ${rejected.length} failure(s). Executing batch rollback:`, firstReason);

            // 1. Clean up in-memory cache for all registrations created by THIS batch
            for (const id of batchRegisteredFileIds) {
                const mem = fileUploadOwnership.get(id);
                if (mem && mem.batchToken === batchToken) {
                    fileUploadOwnership.delete(id);
                }
            }

            // 2. Clean up durable MongoDB records created by THIS batch
            // Strictly scoped to batchToken and exact created record _ids so unrelated/earlier records are untouched!
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                const deleteConditions = [{ batchToken }];
                if (batchCreatedRecordIds.size > 0) {
                    deleteConditions.push({ _id: { $in: Array.from(batchCreatedRecordIds) } });
                }
                const deleteQuery = { $or: deleteConditions };
                if (userId) {
                    deleteQuery.userId = String(userId);
                }
                await DirectUploadRecord.deleteMany(deleteQuery).catch(delErr => {
                    console.error('[UploadRoute] Batch cleanup failed to delete durable records:', delErr.message);
                });
            }

            // 3. Clean up local files on disk for the failed batch
            if (req.files && req.files.length > 0) {
                for (const file of req.files) {
                    if (file.path && fs.existsSync(file.path)) {
                        try {
                            fs.unlinkSync(file.path);
                        } catch (unlinkErr) {}
                    }
                }
            }

            // 4. Return clear batch failure response - never report partial success
            return res.status(500).json({
                success: false,
                error: 'Batch upload failed: could not establish durable file ownership records for all files in batch.',
                details: firstReason,
                failedCount: rejected.length,
                totalCount: req.files.length,
                batchToken
            });
        }

        // All files in batch succeeded
        const results = settledResults.map(r => r.value);
        return res.status(200).json({
            success: true,
            data: results,
            batchToken
        });
    } catch (error) {
        console.error('Multiple Upload Route Fatal Error:', error.message);

        // Emergency rollback if error occurred outside settled promise handling
        for (const id of batchRegisteredFileIds) {
            const mem = fileUploadOwnership.get(id);
            if (mem && mem.batchToken === batchToken) {
                fileUploadOwnership.delete(id);
            }
        }

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            const userId = req.user?._id || req.user?.id;
            const deleteConditions = [{ batchToken }];
            if (batchCreatedRecordIds.size > 0) {
                deleteConditions.push({ _id: { $in: Array.from(batchCreatedRecordIds) } });
            }
            const deleteQuery = { $or: deleteConditions };
            if (userId) {
                deleteQuery.userId = String(userId);
            }
            await DirectUploadRecord.deleteMany(deleteQuery).catch(() => {});
        }

        // Clean up all local files from the failed batch
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                if (file.path && fs.existsSync(file.path)) {
                    try {
                        fs.unlinkSync(file.path);
                    } catch (unlinkErr) {}
                }
            });
        }

        return res.status(500).json({
            success: false,
            error: 'Batch upload failed: could not establish durable file ownership records for all files in batch.',
            details: error.message,
            batchToken
        });
    }
});

/**
 * @route   DELETE /api/upload/:fileId
 * @desc    Delete a document from Google Drive or local storage
 * @access  Private (authorized users only)
 */
router.delete('/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        if (!fileId) {
            return res.status(400).json({ success: false, error: 'File ID is required.' });
        }

        // Enforce document-level authorization
        const isAuthorized = await authorizeFileAccess(req.user, fileId, 'DELETE');
        if (!isAuthorized) {
            return res.status(404).json({
                success: false,
                error: 'Document not found or unauthorized'
            });
        }

        // Sanitize to prevent path traversal on local checks
        const sanitized = path.basename(fileId);
        const localPath = path.join(process.cwd(), 'uploads', sanitized);

        if (fs.existsSync(localPath)) {
            try {
                fs.unlinkSync(localPath);
                fileUploadOwnership.delete(sanitized);
                fileUploadOwnership.delete(fileId);
                if (mongoose.connection && mongoose.connection.readyState === 1) {
                    await DirectUploadRecord.deleteMany({
                        $or: [{ fileId }, { sanitizedFileId: sanitized }, { fileId: sanitized }]
                    }).catch(() => {});
                }
                return res.status(200).json({
                    success: true,
                    message: `Local file ${sanitized} deleted successfully.`,
                    storage: 'local'
                });
            } catch (unlinkErr) {
                console.error(`[UploadRoute] Failed to delete local file ${sanitized}:`, unlinkErr.message);
                return res.status(500).json({ success: false, error: unlinkErr.message });
            }
        }

        // Otherwise attempt Google Drive deletion
        try {
            const driveResult = await deleteFileFromDrive(fileId);
            fileUploadOwnership.delete(sanitized);
            fileUploadOwnership.delete(fileId);
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                await DirectUploadRecord.deleteMany({
                    $or: [{ fileId }, { sanitizedFileId: sanitized }, { fileId: sanitized }]
                }).catch(() => {});
            }
            return res.status(200).json({
                success: true,
                message: driveResult.message,
                storage: 'google_drive'
            });
        } catch (driveErr) {
            console.error(`[UploadRoute] Drive deletion failed for ${fileId}:`, driveErr.message);
            return res.status(500).json({
                success: false,
                error: `Failed to delete file from storage: ${driveErr.message}`
            });
        }
    } catch (error) {
        console.error('Delete Route Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   GET /api/upload/metadata/:fileId
 * @desc    Get document metadata from Google Drive or local storage
 * @access  Private (authorized users only)
 */
router.get('/metadata/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        if (!fileId) {
            return res.status(400).json({ success: false, error: 'File ID is required.' });
        }

        // Enforce document-level authorization
        const isAuthorized = await authorizeFileAccess(req.user, fileId, 'READ');
        if (!isAuthorized) {
            return res.status(404).json({
                success: false,
                error: 'Document not found or unauthorized'
            });
        }

        const sanitized = path.basename(fileId);
        const localPath = path.join(process.cwd(), 'uploads', sanitized);

        if (fs.existsSync(localPath)) {
            const stats = fs.statSync(localPath);
            return res.status(200).json({
                success: true,
                data: {
                    fileId: sanitized,
                    fileName: sanitized,
                    size: stats.size,
                    createdTime: stats.birthtime,
                    modifiedTime: stats.mtime,
                    storage: 'local',
                    url: `/uploads/${sanitized}`
                }
            });
        }

        // Try Google Drive
        try {
            const metadata = await getFileMetadata(fileId);
            return res.status(200).json({
                success: true,
                data: metadata
            });
        } catch (driveErr) {
            return res.status(404).json({
                success: false,
                error: `Document not found in storage: ${driveErr.message}`
            });
        }
    } catch (error) {
        console.error('Metadata Route Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   GET /api/upload/file/:fileId
 * @desc    CRM-mediated secure preview and download of Drive or local file
 * @access  Private (authenticated and authorized CRM users)
 */
router.get('/file/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        if (!fileId) {
            return res.status(400).json({ success: false, error: 'File ID is required.' });
        }

        // Enforce document-level authorization
        const isAuthorized = await authorizeFileAccess(req.user, fileId, 'READ');
        if (!isAuthorized) {
            return res.status(404).json({
                success: false,
                error: 'Document not found or unauthorized'
            });
        }

        const isDownload = req.query.download === 'true';

        // Check local storage first
        const sanitized = path.basename(fileId);
        const localPath = path.join(process.cwd(), 'uploads', sanitized);
        if (fs.existsSync(localPath)) {
            if (isDownload) {
                return res.download(localPath);
            }
            return res.sendFile(localPath);
        }

        // Fetch from Google Drive via backend buffer with CRM authorization
        try {
            const { buffer, mimeType, fileName } = await downloadFileBuffer(fileId);
            res.setHeader('Content-Type', mimeType || 'application/octet-stream');
            res.setHeader(
                'Content-Disposition',
                `${isDownload ? 'attachment' : 'inline'}; filename="${fileName || 'file'}"`
            );
            return res.send(buffer);
        } catch (driveErr) {
            console.error(`[UploadRoute] Drive retrieval failed for ${fileId}:`, driveErr.message);
            return res.status(404).json({
                success: false,
                error: `File not found or inaccessible in storage: ${driveErr.message}`
            });
        }
    } catch (error) {
        console.error('File Route Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;