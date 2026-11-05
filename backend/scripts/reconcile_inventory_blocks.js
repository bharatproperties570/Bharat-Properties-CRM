/**
 * Enterprise Inventory Block Canonicalization Migration Script
 * 
 * Reconciles casing drift across Inventory documents by harmonizing them with
 * the canonical Project definition blocks (e.g. standardizing "C BLOCK" to "C Block").
 */
import 'dotenv/config';
import connectDB from '../config/db.js';
import mongoose from 'mongoose';
import '../models/Project.js';
import '../models/Inventory.js';

const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const runMigration = async () => {
    console.log('[MIGRATION] Starting Enterprise Inventory Block Reconciliation...');
    await connectDB();

    const Project = mongoose.model('Project');
    const Inventory = mongoose.model('Inventory');

    const projects = await Project.find({ "blocks.0": { $exists: true } }).select('_id name blocks').lean();
    console.log(`[MIGRATION] Found ${projects.length} projects with configured blocks.`);

    let totalUpdated = 0;
    const projectSummary = [];

    for (const proj of projects) {
        if (!proj.blocks || proj.blocks.length === 0) continue;

        let projectModified = 0;

        for (const blockObj of proj.blocks) {
            const canonicalName = blockObj.name;
            if (!canonicalName) continue;

            const escapedBlock = escapeRegExp(canonicalName);
            const regex = new RegExp(`^${escapedBlock}$`, 'i');

            // Find and update all documents belonging to this project where block matches case-insensitively but not strictly
            const filter = {
                $or: [
                    { projectId: proj._id },
                    { projectName: { $regex: new RegExp(`^${escapeRegExp(proj.name)}$`, 'i') } }
                ],
                block: { $regex: regex, $ne: canonicalName }
            };

            const result = await Inventory.updateMany(filter, { $set: { block: canonicalName } });
            if (result.modifiedCount > 0) {
                projectModified += result.modifiedCount;
                totalUpdated += result.modifiedCount;
                console.log(`  [UPDATE] Project "${proj.name}" -> Block "${canonicalName}": Updated ${result.modifiedCount} items`);
            }
        }

        if (projectModified > 0) {
            projectSummary.push({ project: proj.name, count: projectModified });
        }
    }

    console.log('\n======================================================');
    console.log(`[MIGRATION SUCCESS] Reconciled ${totalUpdated} total Inventory documents across ${projectSummary.length} projects.`);
    console.log('======================================================\n');
    await mongoose.disconnect();
    process.exit(0);
};

runMigration().catch(err => {
    console.error('[MIGRATION FATAL ERROR]:', err);
    process.exit(1);
});
