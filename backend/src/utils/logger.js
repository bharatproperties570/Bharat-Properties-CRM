import pino from 'pino';
import api from '@opentelemetry/api';
import { AsyncLocalStorage } from 'async_hooks';

// Central AsyncLocalStorage for request correlation
export const correlationStore = new AsyncLocalStorage();

// Centralized Redaction Policy
// Protects secrets and credentials. Business PII (phone/email) is allowed in 
// explicit business auditing, but not globally redacted here unless specified.
const redactPaths = [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["set-cookie"]',
    'res.headers["set-cookie"]',
    'password',
    '*.password',
    '*.*.password',
    '*.*.*.password',
    'token',
    '*.token',
    '*.*.token',
    'accessToken',
    '*.accessToken',
    'refreshToken',
    '*.refreshToken',
    'clientSecret',
    '*.clientSecret',
    'apiKey',
    '*.apiKey',
    'secret',
    '*.secret',
    '*.*.secret',
    'error.config.headers.authorization',
    'DATABASE_URL',
    'MONGO_URI',
    'REDIS_URI'
];

const pinoLogger = pino({
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    formatters: {
        level: (label) => {
            return { level: label };
        },
    },
    base: {
        service: 'bharat-crm-backend',
        environment: process.env.NODE_ENV || 'development',
    },
    redact: {
        paths: redactPaths,
        censor: '[REDACTED]',
        remove: false
    },
    mixin() {
        const metadata = {};
        
        // Inject Correlation ID if within request context
        const reqId = correlationStore.getStore();
        if (reqId) {
            metadata.reqId = reqId;
        }

        // Inject OpenTelemetry context if active
        const span = api.trace.getSpan(api.context.active());
        if (span) {
            const spanContext = span.spanContext();
            metadata.traceId = spanContext.traceId;
            metadata.spanId = spanContext.spanId;
        }

        return metadata;
    },
    timestamp: pino.stdTimeFunctions.isoTime
});

// Stable Interface Export
export const logger = {
    debug: (msg, meta = {}) => pinoLogger.debug(meta, msg),
    info: (msg, meta = {}) => pinoLogger.info(meta, msg),
    warn: (msg, meta = {}) => pinoLogger.warn(meta, msg),
    error: (msg, meta = {}) => pinoLogger.error(meta, msg),
    fatal: (msg, meta = {}) => pinoLogger.fatal(meta, msg),
    // Expose the raw pino logger for pino-http integration if needed
    _pino: pinoLogger
};
