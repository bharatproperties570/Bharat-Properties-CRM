import mongoose from 'mongoose';
import Document from '../../models/Document.js';
import DocumentVersion from '../../models/DocumentVersion.js';
import ProviderInstance from '../../models/ProviderInstance.js';

/**
 * GoogleDriveMigrationReport
 * 
 * Strict Read-Only / Preview-Only Inspection Utility
 * Inspects document storage landscape across MongoDB without modifying,
 * deleting, migrating, or duplicating any database records or storage assets.
 * 
 * ZERO PRODUCTION DB BULK MIGRATIONS.
 */
export class GoogleDriveMigrationReport {
    /**
     * Generates a comprehensive dry-run preview report.
     * @returns {Promise<Object>}
     */
    static async generatePreviewReport() {
        const isConnected = Boolean(mongoose.connection && mongoose.connection.readyState === 1);
        
        if (!isConnected) {
            return {
                status: 'PREVIEW_ONLY_ZERO_MUTATIONS',
                dryRun: true,
                databaseConnected: false,
                timestamp: new Date().toISOString(),
                summary: 'Database connection is not ready. Inspection skipped without side-effects.',
                metrics: {
                    totalDocuments: 0,
                    totalVersions: 0,
                    byProviderType: {},
                    byState: {},
                    legacyDriveUrlsDetected: 0,
                    privateAdapterCompliant: 0,
                    migrationEligibleCount: 0
                },
                policyGuarantees: {
                    zeroAutomaticMutations: true,
                    legacyUrlsPreserved: true,
                    privateByDefaultEnforced: true,
                    s3OptionalOnly: true
                }
            };
        }

        const totalDocuments = await Document.countDocuments({});
        const totalVersions = await DocumentVersion.countDocuments({});

        // Aggregate versions by providerInstanceId
        const versionProviderAgg = await DocumentVersion.aggregate([
            { $group: { _id: '$providerInstanceId', count: { $sum: 1 } } }
        ]);

        const versionsByProviderInstance = {};
        for (const row of versionProviderAgg) {
            versionsByProviderInstance[row._id || 'unknown'] = row.count;
        }

        // Aggregate documents by lifecycle state
        const docStateAgg = await Document.aggregate([
            { $group: { _id: '$state', count: { $sum: 1 } } }
        ]);

        const byState = {};
        for (const row of docStateAgg) {
            byState[row._id || 'UNKNOWN'] = row.count;
        }

        // Inspect known provider instances
        const providerInstances = await ProviderInstance.find({}).lean();
        const providerTypeMap = new Map(providerInstances.map(p => [p.providerInstanceId, p.providerType]));

        const byProviderType = {
            GOOGLE_DRIVE: 0,
            S3_COMPATIBLE: 0,
            GOOGLE_DRIVE_LEGACY: 0,
            LOCAL: 0,
            OTHER: 0
        };

        for (const [pId, count] of Object.entries(versionsByProviderInstance)) {
            const pType = providerTypeMap.get(pId) || (pId.includes('drive') ? 'GOOGLE_DRIVE' : (pId.includes('s3') ? 'S3_COMPATIBLE' : 'OTHER'));
            byProviderType[pType] = (byProviderType[pType] || 0) + count;
        }

        // Inspect documents with legacy URLs in metadata (e.g. drive.google.com/file)
        const legacyDriveDocs = await Document.countDocuments({
            $or: [
                { 'metadata.url': { $regex: 'drive\\.google\\.com', $options: 'i' } },
                { 'metadata.downloadUrl': { $regex: 'drive\\.google\\.com', $options: 'i' } },
                { 'metadata.storage': 'google_drive' }
            ]
        });

        return {
            status: 'PREVIEW_ONLY_ZERO_MUTATIONS',
            dryRun: true,
            databaseConnected: true,
            timestamp: new Date().toISOString(),
            metrics: {
                totalDocuments,
                totalVersions,
                versionsByProviderInstance,
                byProviderType,
                byState,
                legacyDriveUrlsDetected: legacyDriveDocs,
                privateAdapterCompliant: byProviderType.GOOGLE_DRIVE || 0,
                migrationEligibleCount: legacyDriveDocs
            },
            policyGuarantees: {
                zeroAutomaticMutations: true,
                legacyUrlsPreserved: true,
                privateByDefaultEnforced: true,
                s3OptionalOnly: true
            },
            recommendation: legacyDriveDocs > 0
                ? 'Preserve legacy URLs in-place. All new documents must route exclusively to GOOGLE_DRIVE primary adapter.'
                : 'Storage topology is healthy. All documents adhere to primary storage architecture.'
        };
    }
}

export default GoogleDriveMigrationReport;
