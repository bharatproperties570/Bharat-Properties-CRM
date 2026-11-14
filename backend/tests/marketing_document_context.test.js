import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {
    collectBounded,
    sanitizePublicText,
    MarketingDocumentContextError
} from '../services/marketing/MarketingDocumentContextService.js';

test('marketing PDF context redacts direct identifiers before returning text', () => {
    const source = [
        'Public project brochure and floor plan.',
        'Call +91 9876543210 or owner@example.com.',
        'PAN ABCDE1234F and Aadhaar 2345 6789 0123.',
        'Bank account number 1234567890123456.'
    ].join(' ');
    const sanitized = sanitizePublicText(source);

    assert.match(sanitized, /Public project brochure/);
    assert.doesNotMatch(sanitized, /9876543210|owner@example\.com|ABCDE1234F|2345 6789 0123|1234567890123456/);
    assert.match(sanitized, /REDACTED/);
});

test('collectBounded accepts buffers and async streams within the byte limit', async () => {
    const expected = Buffer.from('%PDF-1.7 sample');
    const fromBuffer = await collectBounded(expected, 64);
    const fromStream = await collectBounded(Readable.from([expected.subarray(0, 5), expected.subarray(5)]), 64);

    assert.deepEqual(fromBuffer, expected);
    assert.deepEqual(fromStream, expected);
});

test('collectBounded rejects an oversized stream and does not return partial content', async () => {
    const stream = Readable.from([Buffer.alloc(5), Buffer.alloc(6)]);
    await assert.rejects(
        collectBounded(stream, 10),
        (error) => error instanceof MarketingDocumentContextError && error.code === 'PDF_SIZE_LIMIT_EXCEEDED'
    );
});
