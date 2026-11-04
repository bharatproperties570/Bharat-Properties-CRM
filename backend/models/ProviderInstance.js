import mongoose from "mongoose";

export const ProviderInstanceStatus = ['ACTIVE', 'DISABLED', 'DECOMMISSIONED'];
export const ProviderTypes = ['S3_COMPATIBLE', 'GOOGLE_DRIVE_LEGACY', 'LOCAL', 'OTHER'];

const ProviderInstanceSchema = new mongoose.Schema({
    providerInstanceId: { type: String, required: true, unique: true, index: true },
    providerType: { type: String, enum: ProviderTypes, required: true },
    
    displayName: { type: String, required: true },
    
    status: { type: String, enum: ProviderInstanceStatus, default: 'ACTIVE', index: true },
    
    // Abstract capabilities array
    capabilities: [{ type: String }],
    
    // NON-SECRET configuration (e.g. endpoint, bucket name, region)
    configurationReference: { type: mongoose.Schema.Types.Mixed },
    
    // Abstract reference pointing to an external secret manager (AWS Secrets Manager, Vault, etc.)
    // MUST NEVER CONTAIN PLAINTEXT CREDENTIALS!
    credentialReference: { type: String, required: true }
}, {
    timestamps: true 
});

export default mongoose.model("ProviderInstance", ProviderInstanceSchema);
