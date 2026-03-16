import { getDriveService } from '../utils/googleAuth.js';
import fs from 'fs';
import path from 'path';

/**
 * Google Drive Service
 * Handles uploading files to Google Drive and setting permissions
 */

/**
 * Get or create a folder in Google Drive
 * @param {string} folderName 
 * @param {string} parentId 
 * @returns {Promise<string>} - Folder ID
 */
export const getOrCreateFolder = async (folderName, parentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID) => {
    const driveService = await getDriveService();
    if (!driveService) return parentId;

    try {
        // Search for existing folder
        const response = await driveService.files.list({
            q: `name = '${folderName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)',
            spaces: 'drive',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
        });

        if (response.data.files && response.data.files.length > 0) {
            return response.data.files[0].id;
        }

        // Create new folder
        const fileMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId],
        };

        const folder = await driveService.files.create({
            requestBody: fileMetadata,
            fields: 'id',
            supportsAllDrives: true,
        });

        return folder.data.id;
    } catch (error) {
        console.error(`Error in getOrCreateFolder for ${folderName}:`, error.message);
        return parentId; // Fallback to parent
    }
};

/**
 * Get a structured folder ID (Root > ...pathSegments)
 * @param {string[]} pathSegments - Array of folder names in order
 * @returns {Promise<string>}
 */
export const getStructuredFolder = async (pathSegments = []) => {
    let parentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
    
    for (const segment of pathSegments) {
        if (segment && segment.trim()) {
            parentId = await getOrCreateFolder(segment.trim(), parentId);
        }
    }
    
    return parentId;
};

/**
 * Upload a file to Google Drive
 * @param {Object} file - The file object from multer
 * @param {Object} options - { folderId, entityType, entityName, docCategory, docType }
 * @returns {Promise<Object>} - File details
 */
export const uploadFileToDrive = async (file, options = {}) => {
    let { folderId, entityType, entityName, docCategory, docType } = options;
    
    const driveService = await getDriveService();
    if (!driveService) {
        throw new Error('Google Drive authentication failed or is not configured.');
    }

    try {
        // Resolve the folderId based on entity structure if not provided
        if (!folderId) {
            const pathSegments = [entityType, entityName, docCategory, docType].filter(Boolean);
            if (pathSegments.length > 0) {
                folderId = await getStructuredFolder(pathSegments);
            } else {
                folderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
            }
        }

        // Handle File Renaming
        // Pattern: [docType] - [entityName].[ext] or [docType] - [originalName].[ext]
        let finalFileName = file.originalname;
        if (docType && entityName) {
            const ext = path.extname(file.originalname);
            finalFileName = `${docType} - ${entityName}${ext}`;
        } else if (docType) {
            const ext = path.extname(file.originalname);
            finalFileName = `${docType} - ${file.originalname}`;
        }

        const fileMetadata = {
            name: finalFileName,
            parents: folderId ? [folderId] : [],
        };

        const media = {
            mimeType: file.mimetype,
            body: fs.createReadStream(file.path),
        };

        const response = await driveService.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id, webViewLink, webContentLink',
            supportsAllDrives: true,
            supportsTeamDrives: true, // Legacy support
        });

        const fileId = response.data.id;

        // Set permissions to "anyone with the link can view"
        // This is necessary for CRM users to access the file links directly
        await driveService.permissions.create({
            fileId: fileId,
            requestBody: {
                role: 'reader',
                type: 'anyone',
            },
            supportsAllDrives: true,
            supportsTeamDrives: true, // Legacy support
        });

        // Clean up local temporary file
        if (file.path && fs.existsSync(file.path)) {
            try {
                fs.unlinkSync(file.path);
            } catch (err) {
                console.warn('Failed to delete temp file:', file.path);
            }
        }

        return {
            id: fileId,
            url: response.data.webViewLink,
            downloadUrl: response.data.webContentLink,
            supportsAllDrives: true
        };
    } catch (error) {
        console.error('Error uploading to Google Drive:', error.response?.data || error.message);
        // Ensure local file is cleaned up even on error
        if (file.path && fs.existsSync(file.path)) {
            try {
                fs.unlinkSync(file.path);
            } catch (err) { }
        }
        throw error;
    }
};
