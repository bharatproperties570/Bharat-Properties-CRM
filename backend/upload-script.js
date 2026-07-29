import { uploadFileToDrive } from './services/drive.service.js';
import dotenv from 'dotenv';
dotenv.config();

const fileObj = {
    originalname: 'bharatproperties_header.png',
    mimetype: 'image/png',
    path: '/Users/bharatproperties/.gemini/antigravity/brain/a96f7ba8-b8e4-414d-ad69-ef981df11aa4/.user_uploaded/media__1785217254672.png'
};

async function run() {
    try {
        console.log('Uploading to Google Drive...');
        const result = await uploadFileToDrive(fileObj, { entityType: 'System' });
        console.log('Success:', JSON.stringify(result, null, 2));
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
}
run();
