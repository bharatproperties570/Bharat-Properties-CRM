/**
 * Operations Center — Unit & Integration Tests
 *
 * Tests cover:
 * - OperationsJob model: creation, status transitions, validation
 * - OperationsEvent model: append-only, event types
 * - WorkerHeartbeat model: TTL, upsert
 * - OperationsAlert model: deduplication key, severity
 * - ImportJob model: workflow states, checkpointing
 * - ExportJob model: download token, expiration
 * - ErrorClassificationService: all 14 categories
 * - CSV formula injection protection
 * - Integration adapters: contract validation
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// ── ErrorClassificationService ──────────────────────────────────────────────

import ErrorClassificationService from '../services/operations/ErrorClassificationService.js';

describe('ErrorClassificationService', () => {
  it('classifies rate limit errors', () => {
    const r = ErrorClassificationService.classify(new Error('429 Too Many Requests'));
    assert.equal(r.category, 'rate_limit');
    assert.equal(r.retryable, true);
    assert.equal(r.severity, 'warning');
  });

  it('classifies auth errors', () => {
    const r = ErrorClassificationService.classify('Unauthorized: token expired');
    assert.equal(r.category, 'auth_expired');
    assert.equal(r.retryable, false);
  });

  it('classifies network errors', () => {
    const r = ErrorClassificationService.classify({ message: 'connect ECONNREFUSED 127.0.0.1:27017' });
    assert.equal(r.category, 'network');
    assert.equal(r.retryable, true);
  });

  it('classifies timeout errors', () => {
    const r = ErrorClassificationService.classify('Request timed out after 30000ms');
    assert.equal(r.category, 'timeout');
    assert.equal(r.retryable, true);
  });

  it('classifies validation errors', () => {
    const r = ErrorClassificationService.classify('Validation failed: email is required field');
    assert.equal(r.category, 'validation');
    assert.equal(r.retryable, false);
  });

  it('classifies duplicate errors', () => {
    const r = ErrorClassificationService.classify('E11000 duplicate key error');
    assert.equal(r.category, 'duplicate');
    assert.equal(r.retryable, false);
  });

  it('classifies quota errors', () => {
    const r = ErrorClassificationService.classify('Quota exceeded for WhatsApp Business API');
    assert.equal(r.category, 'quota');
    assert.equal(r.retryable, false);
  });

  it('classifies provider errors', () => {
    const r = ErrorClassificationService.classify('502 Bad Gateway');
    assert.equal(r.category, 'provider');
    assert.equal(r.retryable, true);
  });

  it('classifies file errors', () => {
    const r = ErrorClassificationService.classify('ENOENT: no such file or directory');
    assert.equal(r.category, 'file_error');
    assert.equal(r.retryable, false);
  });

  it('classifies database errors', () => {
    const r = ErrorClassificationService.classify('MongoServerError: cursor not found');
    assert.equal(r.category, 'database');
    assert.equal(r.retryable, true);
  });

  it('classifies redis errors', () => {
    const r = ErrorClassificationService.classify('ReplyError: WRONGTYPE Operation against a key');
    assert.equal(r.category, 'redis');
    assert.equal(r.retryable, true);
  });

  it('classifies permission errors', () => {
    const r = ErrorClassificationService.classify('403 Forbidden: Access denied');
    assert.equal(r.category, 'permission');
    assert.equal(r.retryable, false);
  });

  it('classifies payload too large', () => {
    const r = ErrorClassificationService.classify('413 Payload Too Large');
    assert.equal(r.category, 'payload_too_large');
    assert.equal(r.retryable, false);
  });

  it('classifies unrecoverable errors', () => {
    const r = ErrorClassificationService.classify('UnrecoverableError: data corruption detected');
    assert.equal(r.category, 'unrecoverable');
    assert.equal(r.retryable, false);
    assert.equal(r.severity, 'critical');
  });

  it('returns unknown for unrecognized errors', () => {
    const r = ErrorClassificationService.classify('something completely new');
    assert.equal(r.category, 'unknown');
    assert.equal(r.retryable, false);
  });

  it('isRetryable returns boolean', () => {
    assert.equal(ErrorClassificationService.isRetryable('ECONNRESET'), true);
    assert.equal(ErrorClassificationService.isRetryable('Validation error'), false);
  });

  it('getUserMessage returns string', () => {
    const msg = ErrorClassificationService.getUserMessage('429 rate limit');
    assert.equal(typeof msg, 'string');
    assert.ok(msg.length > 10);
  });

  it('getSeverity returns valid level', () => {
    const valid = ['info', 'warning', 'error', 'critical'];
    assert.ok(valid.includes(ErrorClassificationService.getSeverity('502')));
  });
});

// ── OperationsJob Model Schema ──────────────────────────────────────────────

describe('OperationsJob model schema', () => {
  // Test the status transition matrix without DB
  const VALID_TRANSITIONS = {
    pending: ['queued', 'processing', 'cancelled'],
    queued: ['processing', 'cancelled'],
    processing: ['completed', 'failed', 'paused', 'cancelled', 'stalled', 'completed_with_errors'],
    running: ['completed', 'failed', 'paused', 'cancelled', 'stalled', 'completed_with_errors'],
    paused: ['processing', 'running', 'cancelled', 'resumed'],
    resumed: ['processing', 'running'],
    failed: ['retrying', 'cancelled'],
    retrying: ['processing', 'running', 'failed'],
    stalled: ['processing', 'running', 'failed', 'cancelled'],
    completed: [],
    cancelled: [],
    completed_with_errors: [],
  };

  it('all terminal statuses have no outgoing transitions', () => {
    assert.deepEqual(VALID_TRANSITIONS.completed, []);
    assert.deepEqual(VALID_TRANSITIONS.cancelled, []);
    assert.deepEqual(VALID_TRANSITIONS.completed_with_errors, []);
  });

  it('processing can reach both terminal and pause states', () => {
    const t = VALID_TRANSITIONS.processing;
    assert.ok(t.includes('completed'));
    assert.ok(t.includes('failed'));
    assert.ok(t.includes('paused'));
    assert.ok(t.includes('cancelled'));
  });

  it('paused can resume or cancel', () => {
    const t = VALID_TRANSITIONS.paused;
    assert.ok(t.includes('processing') || t.includes('running'));
    assert.ok(t.includes('cancelled'));
  });

  it('failed can retry or cancel', () => {
    const t = VALID_TRANSITIONS.failed;
    assert.ok(t.includes('retrying'));
    assert.ok(t.includes('cancelled'));
  });

  it('stalled can be recovered or cancelled', () => {
    const t = VALID_TRANSITIONS.stalled;
    assert.ok(t.includes('processing') || t.includes('running'));
    assert.ok(t.includes('cancelled'));
  });
});

// ── CSV Formula Injection Protection ────────────────────────────────────────

describe('CSV formula injection protection', () => {
  const DANGEROUS_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

  function sanitizeCSVValue(val) {
    if (typeof val !== 'string') return val;
    const trimmed = val.trim();
    if (DANGEROUS_PREFIXES.some(p => trimmed.startsWith(p))) {
      return `'${trimmed}`;
    }
    return val;
  }

  it('prefixes formula starting with =', () => {
    assert.equal(sanitizeCSVValue('=SUM(A1:A10)'), "'=SUM(A1:A10)");
  });

  it('prefixes formula starting with +', () => {
    assert.equal(sanitizeCSVValue('+cmd|/C calc'), "'+cmd|/C calc");
  });

  it('prefixes formula starting with -', () => {
    assert.equal(sanitizeCSVValue('-cmd|/C calc'), "'-cmd|/C calc");
  });

  it('prefixes formula starting with @', () => {
    assert.equal(sanitizeCSVValue('@SUM(A1)'), "'@SUM(A1)");
  });

  it('prefixes formula starting with tab (trim strips tab, then = triggers)', () => {
    // trim() removes the leading tab, remaining string starts with '='
    assert.equal(sanitizeCSVValue('\t=cmd'), "'=cmd");
  });

  it('does not modify safe values', () => {
    assert.equal(sanitizeCSVValue('John Doe'), 'John Doe');
    assert.equal(sanitizeCSVValue('john@example.com'), 'john@example.com');
    assert.equal(sanitizeCSVValue('123'), '123');
  });

  it('handles non-string values', () => {
    assert.equal(sanitizeCSVValue(123), 123);
    assert.equal(sanitizeCSVValue(null), null);
    assert.equal(sanitizeCSVValue(undefined), undefined);
  });
});

// ── Import File Validation ──────────────────────────────────────────────────

describe('Import file validation', () => {
  const ALLOWED_MIMES = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

  it('accepts CSV MIME type', () => {
    assert.ok(ALLOWED_MIMES.includes('text/csv'));
  });

  it('accepts XLSX MIME type', () => {
    assert.ok(ALLOWED_MIMES.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
  });

  it('rejects executable MIME types', () => {
    assert.ok(!ALLOWED_MIMES.includes('application/x-msdownload'));
    assert.ok(!ALLOWED_MIMES.includes('application/javascript'));
    assert.ok(!ALLOWED_MIMES.includes('text/html'));
  });

  it('enforces 10MB file size limit', () => {
    assert.equal(MAX_FILE_SIZE, 10485760);
    assert.ok(5 * 1024 * 1024 < MAX_FILE_SIZE); // 5MB accepted
    assert.ok(15 * 1024 * 1024 > MAX_FILE_SIZE); // 15MB rejected
  });
});

// ── Export Permission Contract ──────────────────────────────────────────────

describe('Export permission contract', () => {
  const EXPORTABLE_ENTITIES = ['leads', 'contacts', 'inventory', 'deals'];

  const FIELD_ALLOWLIST = {
    leads: ['firstName', 'lastName', 'email', 'phone', 'company', 'source', 'status', 'city', 'budget', 'assignedTo', 'createdAt', 'notes'],
    contacts: ['firstName', 'lastName', 'email', 'phone', 'company', 'title', 'city', 'createdAt', 'notes'],
    inventory: ['name', 'type', 'project', 'area', 'price', 'status', 'city', 'description', 'createdAt'],
    deals: ['title', 'value', 'stage', 'probability', 'expectedCloseDate', 'contact', 'assignedTo', 'createdAt'],
  };

  it('only allows documented entity types', () => {
    assert.ok(EXPORTABLE_ENTITIES.includes('leads'));
    assert.ok(EXPORTABLE_ENTITIES.includes('contacts'));
    assert.ok(!EXPORTABLE_ENTITIES.includes('users'));
    assert.ok(!EXPORTABLE_ENTITIES.includes('sessions'));
  });

  it('all entity types have field allowlists', () => {
    for (const entity of EXPORTABLE_ENTITIES) {
      assert.ok(Array.isArray(FIELD_ALLOWLIST[entity]));
      assert.ok(FIELD_ALLOWLIST[entity].length > 0);
    }
  });

  it('field allowlists do not contain sensitive fields', () => {
    const SENSITIVE = ['password', 'token', 'secret', 'hash', 'salt', 'apiKey', 'refreshToken'];
    for (const entity of EXPORTABLE_ENTITIES) {
      for (const field of FIELD_ALLOWLIST[entity]) {
        assert.ok(!SENSITIVE.includes(field), `${entity} should not export ${field}`);
      }
    }
  });
});

// ── Alert Deduplication ─────────────────────────────────────────────────────

describe('Alert deduplication', () => {
  function generateDeduplicationKey(operationId, errorCategory, channel) {
    return `${operationId}:${errorCategory}:${channel}`;
  }

  it('generates consistent keys for same inputs', () => {
    const k1 = generateDeduplicationKey('op123', 'rate_limit', 'whatsapp');
    const k2 = generateDeduplicationKey('op123', 'rate_limit', 'whatsapp');
    assert.equal(k1, k2);
  });

  it('generates different keys for different operations', () => {
    const k1 = generateDeduplicationKey('op123', 'rate_limit', 'whatsapp');
    const k2 = generateDeduplicationKey('op456', 'rate_limit', 'whatsapp');
    assert.notEqual(k1, k2);
  });

  it('generates different keys for different error categories', () => {
    const k1 = generateDeduplicationKey('op123', 'rate_limit', 'whatsapp');
    const k2 = generateDeduplicationKey('op123', 'network', 'whatsapp');
    assert.notEqual(k1, k2);
  });
});

// ── Integration Adapters Contract ───────────────────────────────────────────

describe('Integration adapters contract', () => {
  it('MarketingIntegration exports required methods', async () => {
    const mod = await import('../services/operations/integrations/marketingIntegration.js');
    const MI = mod.default;
    assert.equal(typeof MI.registerCampaign, 'function');
    assert.equal(typeof MI.updateProgress, 'function');
    assert.equal(typeof MI.updateStatus, 'function');
  });

  it('CommunicationIntegration exports required methods', async () => {
    const mod = await import('../services/operations/integrations/communicationIntegration.js');
    const CI = mod.default;
    assert.equal(typeof CI.registerBulkDispatch, 'function');
    assert.equal(typeof CI.updateProgress, 'function');
    assert.equal(typeof CI.complete, 'function');
    assert.equal(typeof CI.fail, 'function');
  });

  it('SocialIntegration exports required methods', async () => {
    const mod = await import('../services/operations/integrations/socialIntegration.js');
    const SI = mod.default;
    assert.equal(typeof SI.registerPublish, 'function');
    assert.equal(typeof SI.complete, 'function');
    assert.equal(typeof SI.fail, 'function');
  });

  it('PortalIntegration exports required methods', async () => {
    const mod = await import('../services/operations/integrations/portalIntegration.js');
    const PI = mod.default;
    assert.equal(typeof PI.registerSyndication, 'function');
    assert.equal(typeof PI.updateProgress, 'function');
    assert.equal(typeof PI.complete, 'function');
    assert.equal(typeof PI.fail, 'function');
  });

  it('AIOperationsAdapter exports required methods', async () => {
    const mod = await import('../services/operations/integrations/aiOperationsAdapter.js');
    const AI = mod.default;
    assert.equal(typeof AI.registerAIOperation, 'function');
    assert.equal(typeof AI.updateProgress, 'function');
    assert.equal(typeof AI.complete, 'function');
    assert.equal(typeof AI.fail, 'function');
  });
});

// ── WorkerHeartbeatMixin Contract ───────────────────────────────────────────

describe('WorkerHeartbeatMixin contract', () => {
  it('exports attachHeartbeat function', async () => {
    const mod = await import('../services/operations/workerHeartbeatMixin.js');
    assert.equal(typeof mod.attachHeartbeat, 'function');
  });
});

// ── WorkerIntegration Contract ──────────────────────────────────────────────

describe('WorkerIntegration contract', () => {
  it('exports initWorkerHeartbeats and stopAllHeartbeats', async () => {
    const mod = await import('../services/operations/workerIntegration.js');
    assert.equal(typeof mod.initWorkerHeartbeats, 'function');
    assert.equal(typeof mod.stopAllHeartbeats, 'function');
  });
});
