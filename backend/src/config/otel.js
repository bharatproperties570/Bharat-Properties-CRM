import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import api from '@opentelemetry/api';

const isOtlpConfigured = !!(process.env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT);

const traceExporter = isOtlpConfigured
    ? new OTLPTraceExporter()
    : new ConsoleSpanExporter();

console.log(`[OTel] Initializing distributed tracing. Exporter: ${isOtlpConfigured ? 'OTLP' : 'Console'}`);

const sdk = new NodeSDK({
    serviceName: 'bharat-properties-crm',
    traceExporter,
    instrumentations: [
        getNodeAutoInstrumentations({
            // Disable extremely verbose or unneeded auto-instrumentations
            '@opentelemetry/instrumentation-fs': { enabled: false },
            '@opentelemetry/instrumentation-net': { enabled: false },
            '@opentelemetry/instrumentation-dns': { enabled: false },
        })
    ]
});

try {
    sdk.start();
    console.log('✅ OpenTelemetry SDK initialized successfully');
} catch (err) {
    console.error('❌ Failed to initialize OpenTelemetry SDK:', err);
}

export const tracer = api.trace.getTracer('crm-backend');
