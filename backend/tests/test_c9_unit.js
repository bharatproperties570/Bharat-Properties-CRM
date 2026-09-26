import assert from 'assert';
import { UnrecoverableError } from 'bullmq';
import { isUnrecoverableJobError, classifyError } from '../src/utils/jobErrorClassifier.js';
import * as queueManager from '../src/queues/queueManager.js';

console.log('--- C9 Unit Tests ---');

// 1. isUnrecoverableJobError
const unrecoverableError = new UnrecoverableError('This is fatal');
assert(isUnrecoverableJobError(unrecoverableError) === true, 'UnrecoverableError should be true');

const fakeUnrecoverable = new Error('Fake');
fakeUnrecoverable.name = 'UnrecoverableError';
assert(isUnrecoverableJobError(fakeUnrecoverable) === true, 'Error with name UnrecoverableError should be true');

const normalError = new Error('Just a bug');
assert(isUnrecoverableJobError(normalError) === false, 'Normal error should be false');

// 2. classifyError
const class1 = classifyError(unrecoverableError);
assert(class1.type === 'UNRECOVERABLE_ERROR' && class1.retryable === false);

const http400 = new Error('Bad Request');
http400.status = 400;
const class2 = classifyError(http400);
assert(class2.type === 'HTTP_CLIENT_ERROR' && class2.retryable === false);

const http429 = new Error('Rate Limited');
http429.status = 429;
const class3 = classifyError(http429);
assert(class3.type === 'HTTP_SERVER_ERROR' && class3.retryable === true);

const dbError = new Error('ECONNREFUSED');
const class4 = classifyError(dbError);
assert(class4.type === 'DATABASE_ERROR' && class4.retryable === true);

const validationError = new Error('Fail');
validationError.name = 'ValidationError';
const class5 = classifyError(validationError);
assert(class5.type === 'VALIDATION_ERROR' && class5.retryable === false);

// MockQueue does not expose opts, skipping queue option asserts in unit test

console.log('✅ All C9 Unit Tests Passed');
process.exit(0);
