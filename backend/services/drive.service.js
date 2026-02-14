import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

/**
 * Google Drive Service
 * Handles uploading files to Google Drive and setting permissions
 */

// Load credentials from environment variables or a service account file
// Prefer environment variables for better security/portability
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const getAuth = () => {
    try {
        // Attempt to parse Service Account JSON from environment variable
        if (process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON) {
            const credentials = JSON.parse(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON);
            return new google.auth.JWT(
                credentials.client_email,
                null,
                credentials.private_key,
                SCOPES
            );
        }

        // Fallback to individual env vars
        if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
            return new google.auth.JWT(
                process.env.GOOGLE_CLIENT_EMAIL,
                null,
                process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                SCOPES
            );
        }

        console.warn('Google Drive credentials not found in environment variables.');
        return null;
    } catch (error) {
        console.error('Error initializing Google Drive Authentication:', error.message);
        return null;
    }
};

const drive = google.drive({ version: 'v3', auth: getAuth() });

/**
 * Upload a file to Google Drive
 * @param {Object} file - The file object from multer
 * @param {string} folderId - Optional Google Drive Folder ID
 * @returns {Promise<string>} - The web view link of the uploaded file
 */
export const uploadFileToDrive = async (file, folderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID) => {
    const auth = getAuth();
    if (!auth) {
        throw new Error('Google Drive authentication failed of is not configured.');
    }

    try {
        const fileMetadata = {
            name: file.originalname,
            parents: folderId ? [folderId] : [],
        };

        const media = {
            mimeType: file.mimetype,
            body: fs.createReadStream(file.path),
        };

        const response = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webViewLink, webContentLink',
        });

        const fileId = response.data.id;

        // Set permissions to "anyone with the link can view"
        await drive.permissions.create({
            fileId: fileId,
            requestBody: {
                role: 'reader',
                type: 'anyone',
            },
        });

        // Clean up local temporary file
        if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }

        return response.data.webViewLink;
    } catch (error) {
        console.error('Error uploading to Google Drive:', error.message);
        // Ensure local file is cleaned up even on error
        if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }
        throw error;
    }
};
