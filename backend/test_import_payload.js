import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { importInventory } from './controllers/inventory.controller.js';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const testPayload = {
    data: [
        {
            projectId: '6990b7c3e4b00a001c9b3a1a', // Fake ID
            projectName: 'Test Project',
            unitNo: 'A-101',
            block: 'A',
            sizeLabel: '2BHK',
            team: 'Sales', // This could cause CastError
            assignedTo: 'John Doe',
            ownerName: 'Test Owner'
        }
    ]
};

async function runTest() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        let responseStatus, responseJson;
        const res = {
            status: (code) => { responseStatus = code; return res; },
            json: (data) => { responseJson = data; }
        };
        const req = { body: testPayload };

        await importInventory(req, res);

        console.log('--- Controller Response ---');
        console.log('Status code:', responseStatus);
        console.log('Response JSON:', JSON.stringify(responseJson, null, 2));

        await mongoose.disconnect();
    } catch (e) {
        console.error('Fatal Test Error:', e);
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    }
}
runTest();
