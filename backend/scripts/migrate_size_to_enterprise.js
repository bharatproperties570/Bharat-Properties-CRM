/**
 * ✅ ENTERPRISE SIZE MIGRATION SCRIPT
 * ====================================
 * Purpose: Convert existing Size lookups from:
 *   metadata.project + metadata.block (top-level)
 * To:
 *   metadata.projectMappings: [{ project, block }] (array)
 *
 * This is SAFE and IDEMPOTENT:
 * - Run with --dry-run first to preview changes
 * - Run without --dry-run to apply
 * - Already-migrated sizes (with projectMappings) are SKIPPED
 * - No data is deleted until projectMappings are confirmed
 *
 * Usage:
 *   node scripts/migrate_size_to_enterprise.js --dry-run
 *   node scripts/migrate_size_to_enterprise.js
 *
 * Author: Antigravity Enterprise Upgrade
 */

import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
dotenv.config();

const DRY_RUN = process.argv.includes('--dry-run');
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not found in .env file');
    process.exit(1);
}

async function migrate() {
    const client = new MongoClient(MONGODB_URI);

    try {
        await client.connect();
        console.log('✅ Connected to MongoDB');

        const db = client.db();
        const lookups = db.collection('lookups');

        // Fetch all Size lookups
        const sizes = await lookups.find({ lookup_type: 'Size' }).toArray();
        console.log(`\n📊 Total Size entries found: ${sizes.length}`);
        console.log(DRY_RUN ? '🔍 DRY RUN MODE — No changes will be made\n' : '🚀 LIVE MODE — Changes will be applied\n');

        let migrated = 0;
        let alreadyMigrated = 0;
        let noProjectData = 0;
        let errors = 0;

        for (const size of sizes) {
            const meta = size.metadata || {};
            const existingMappings = Array.isArray(meta.projectMappings) ? meta.projectMappings : null;

            // SKIP: Already has projectMappings (already migrated)
            if (existingMappings !== null) {
                alreadyMigrated++;
                continue;
            }

            const project = meta.project;
            const block = meta.block;

            // Build projectMappings from existing project/block
            const projectMappings = [];
            if (project) {
                projectMappings.push({
                    project: project,
                    block: block || ''
                });
            }

            if (!project) {
                noProjectData++;
                console.log(`  ⚠️  No project data: "${size.lookup_value}" (ID: ${size._id})`);
            }

            // Build new clean metadata (project/block KEPT for now as backup, mappings ADDED)
            // We add projectMappings first, then in Phase 2 we can remove project/block
            const newMetadata = {
                ...meta,
                projectMappings: projectMappings,
                // Keep project/block as _legacy_ backup for 30 days
                _legacyProject: project || null,
                _legacyBlock: block || null
            };

            if (DRY_RUN) {
                console.log(`  📋 [DRY RUN] Would migrate: "${size.lookup_value}"`);
                console.log(`      Old: project="${project}" block="${block}"`);
                console.log(`      New: projectMappings=${JSON.stringify(projectMappings)}`);
                migrated++;
                continue;
            }

            // Apply migration
            try {
                await lookups.updateOne(
                    { _id: size._id },
                    { $set: { metadata: newMetadata } }
                );
                migrated++;
                if (migrated % 50 === 0) {
                    console.log(`  ✅ Migrated ${migrated} sizes...`);
                }
            } catch (err) {
                errors++;
                console.error(`  ❌ Error migrating "${size.lookup_value}":`, err.message);
            }
        }

        // ============== SUMMARY ==============
        console.log('\n' + '='.repeat(60));
        console.log('📊 MIGRATION SUMMARY');
        console.log('='.repeat(60));
        console.log(`  Total sizes:          ${sizes.length}`);
        console.log(`  Migrated:             ${migrated}`);
        console.log(`  Already migrated:     ${alreadyMigrated}`);
        console.log(`  No project data:      ${noProjectData}`);
        console.log(`  Errors:               ${errors}`);
        console.log('='.repeat(60));

        if (DRY_RUN) {
            console.log('\n✅ DRY RUN complete. No changes made.');
            console.log('   Run without --dry-run to apply migration.');
        } else if (errors === 0) {
            console.log('\n✅ Migration complete! All sizes now have projectMappings.');
            console.log('   Next step: Verify UI shows correct data, then run Phase 2 to clean legacy fields.');
        } else {
            console.log('\n⚠️  Migration complete with some errors. Review above logs.');
        }

    } catch (err) {
        console.error('❌ Fatal error:', err.message);
        process.exit(1);
    } finally {
        await client.close();
        console.log('\n🔌 Disconnected from MongoDB');
    }
}

migrate();
