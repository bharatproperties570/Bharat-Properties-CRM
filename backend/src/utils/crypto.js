import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const algorithm = 'aes-256-cbc';
const secretKey = process.env.JWT_SECRET || 'vEry_S3cure_D3f4ult_K3y_For_SMS_Encrpt10n';
/**
 * Encrypt a string
 */
export const encrypt = (text) => {
    if (!text || typeof text !== 'string') return text;
    const freshIv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, crypto.scryptSync(secretKey, 'salt', 32), freshIv);
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
    return {
        iv: freshIv.toString('hex'),
        content: encrypted.toString('hex')
    };
};

/**
 * Decrypt an encrypted object
 */
export const decrypt = (hash) => {
    if (!hash || !hash.iv || !hash.content) return hash;
    const decipher = crypto.createDecipheriv(
        algorithm,
        crypto.scryptSync(secretKey, 'salt', 32),
        Buffer.from(hash.iv, 'hex')
    );
    const decrypted = Buffer.concat([decipher.update(Buffer.from(hash.content, 'hex')), decipher.final()]);
    return decrypted.toString();
};
