/**
 * P14-I5 Secret Provider Contract
 * Abstract boundary for retrieving runtime secrets.
 * Target Production Implementation: AWS SSM / Secrets Manager.
 */

class SecretProvider {
    getSecret(name) {
        return process.env[name];
    }

    getRequiredSecret(name) {
        const value = this.getSecret(name);
        const isProduction = process.env.NODE_ENV === 'production';
        
        if (!value || value === 'placeholder-requires-external-secret') {
            if (isProduction) {
                console.error(`❌ CRITICAL [SecretProvider]: Required secret '${name}' is missing in production environment.`);
                process.exit(1);
            } else {
                console.warn(`⚠️  WARNING [SecretProvider]: Required secret '${name}' is missing. (LOCAL ONLY ALLOWED)`);
            }
        }
        return value;
    }

    hasSecret(name) {
        const val = this.getSecret(name);
        return val !== undefined && val !== null && val !== 'placeholder-requires-external-secret';
    }
}

export default new SecretProvider();
