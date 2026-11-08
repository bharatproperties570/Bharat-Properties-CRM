process.env.NODE_ENV = 'test';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { uploadGeneric } from '../src/middlewares/upload.middleware.js';

describe('Upload Middleware Video & Cross-Browser MIME Compatibility Suite', () => {
    // Extract fileFilter from uploadGeneric
    const fileFilter = uploadGeneric.fileFilter;

    const testFileFilter = (file) => {
        return new Promise((resolve) => {
            fileFilter({}, file, (err, accepted) => {
                resolve({ err, accepted: Boolean(accepted) });
            });
        });
    };

    it('1. Accepts standard MP4 with video/mp4 MIME', async () => {
        const file = { originalname: 'sample_tour.mp4', mimetype: 'video/mp4' };
        const result = await testFileFilter(file);
        assert.equal(result.accepted, true);
        assert.equal(result.err, null);
    });

    it('2. Accepts Safari macOS QuickTime MP4 with video/quicktime MIME', async () => {
        // macOS Safari often emits video/quicktime for .mp4 files
        const file = { originalname: 'property_walkthrough.mp4', mimetype: 'video/quicktime' };
        const result = await testFileFilter(file);
        assert.equal(result.accepted, true);
        assert.equal(result.err, null);
    });

    it('3. Accepts MP4 uploaded as application/octet-stream fallback', async () => {
        // Browser file pickers on certain OS / webviews emit application/octet-stream
        const file = { originalname: 'drone_shoot.mp4', mimetype: 'application/octet-stream' };
        const result = await testFileFilter(file);
        assert.equal(result.accepted, true);
        assert.equal(result.err, null);
    });

    it('4. Accepts MP4 with empty MIME type', async () => {
        const file = { originalname: 'villa_video.mp4', mimetype: '' };
        const result = await testFileFilter(file);
        assert.equal(result.accepted, true);
        assert.equal(result.err, null);
    });

    it('5. Accepts 3GP and WebM WhatsApp supported video formats', async () => {
        const file3gp = { originalname: 'mobile_clip.3gp', mimetype: 'video/3gpp' };
        const res3gp = await testFileFilter(file3gp);
        assert.equal(res3gp.accepted, true);

        const fileWebm = { originalname: 'web_clip.webm', mimetype: 'video/webm' };
        const resWebm = await testFileFilter(fileWebm);
        assert.equal(resWebm.accepted, true);
    });

    it('6. Accepts MOV files with video/quicktime', async () => {
        const fileMov = { originalname: 'iphone_video.mov', mimetype: 'video/quicktime' };
        const resMov = await testFileFilter(fileMov);
        assert.equal(resMov.accepted, true);
    });

    it('7. Rejects dangerous executable extensions even if MIME is spoofed', async () => {
        const fileExe = { originalname: 'malware.exe', mimetype: 'video/mp4' };
        const resExe = await testFileFilter(fileExe);
        assert.equal(resExe.accepted, false);
        assert.match(resExe.err.message, /Validation failed/);
    });
});
