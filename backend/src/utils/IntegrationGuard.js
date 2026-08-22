import config from '../config/env.js';

class IntegrationGuard {
    static canSendEmail() {
        return !config.disableEmail;
    }
    static canSendSms() {
        return !config.disableSms;
    }
    static canSendWhatsapp() {
        return !config.disableWhatsapp;
    }
    static canExecuteWebhooks() {
        return !config.disableWebhooks;
    }
    static logBlock(service, target) {
        console.warn(`[Staging Safety Guard] Blocked ${service} to ${target} (Environment: ${config.nodeEnv})`);
    }
}

export default IntegrationGuard;
