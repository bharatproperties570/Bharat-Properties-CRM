/**
 * ErrorClassificationService — Maps errors to user-friendly categories
 * with retryability guidance and recovery suggestions.
 *
 * Extends the existing jobErrorClassifier patterns.
 */

const ERROR_CATEGORIES = {
  unrecoverable: {
    label: 'Unrecoverable Error',
    retryable: false,
    severity: 'critical',
    suggestion: 'This error cannot be automatically recovered. Manual investigation required.',
    pattern: /UnrecoverableError|fatal|critical|panic/i,
  },
  rate_limit: {
    label: 'Rate Limited',
    retryable: true,
    severity: 'warning',
    suggestion: 'Wait and retry. The external service has throttled requests.',
    pattern: /rate.?limit|throttl|429|too many request/i,
  },
  permission: {
    label: 'Permission Denied',
    retryable: false,
    severity: 'error',
    suggestion: 'User does not have sufficient permissions for this operation.',
    pattern: /permission|forbidden|403|access.?denied|not.?allowed/i,
  },
  auth_expired: {
    label: 'Authentication Expired',
    retryable: false,
    severity: 'error',
    suggestion: 'Re-authenticate the integration. Token has expired or been revoked.',
    pattern: /401|unauthorized|token.?expir|invalid.?token|auth.?fail|auth.?error/i,
  },
  network: {
    label: 'Network Error',
    retryable: true,
    severity: 'warning',
    suggestion: 'Retry when network connectivity is restored.',
    pattern: /ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|network|socket hang up|connect timeout/i,
  },
  timeout: {
    label: 'Timeout',
    retryable: true,
    severity: 'warning',
    suggestion: 'The operation took too long. Retry with smaller batch size.',
    pattern: /timeout|timed.?out|deadline.?exceeded/i,
  },
  validation: {
    label: 'Validation Error',
    retryable: false,
    severity: 'error',
    suggestion: 'Fix the input data. One or more fields failed validation.',
    pattern: /validat|invalid|required.?field|missing.?field|must.?be|cast.?to|schema/i,
  },
  duplicate: {
    label: 'Duplicate Entry',
    retryable: false,
    severity: 'info',
    suggestion: 'Record already exists. Skip or update instead.',
    pattern: /duplicate|E11000|already.?exist|unique.?constraint/i,
  },
  quota: {
    label: 'Quota Exceeded',
    retryable: false,
    severity: 'error',
    suggestion: 'Provider quota has been reached. Check billing or upgrade plan.',
    pattern: /quota|limit.?exceed|billing|credit|insufficient.?fund/i,
  },
  provider: {
    label: 'Provider Error',
    retryable: true,
    severity: 'warning',
    suggestion: 'The external service returned an error. Check provider status page.',
    pattern: /500|502|503|504|internal.?server|service.?unavailable|bad.?gateway/i,
  },
  file_error: {
    label: 'File Error',
    retryable: false,
    severity: 'error',
    suggestion: 'File is corrupted, too large, or in unsupported format.',
    pattern: /ENOENT|EACCES|unsupported.?format|parse.?error|csv.?error|xlsx.?error/i,
  },
  database: {
    label: 'Database Error',
    retryable: true,
    severity: 'error',
    suggestion: 'Database operation failed. Check MongoDB connectivity.',
    pattern: /mongo|mongoose|database|BSON|cursor|aggregate|collection/i,
  },
  redis: {
    label: 'Redis Error',
    retryable: true,
    severity: 'warning',
    suggestion: 'Redis connection lost. Operations will resume when reconnected.',
    pattern: /redis|ECONNREFUSED.*6379|ReplyError|WRONGTYPE|MOVED/i,
  },
  payload_too_large: {
    label: 'Payload Too Large',
    retryable: false,
    severity: 'error',
    suggestion: 'Reduce the batch size or file size and try again.',
    pattern: /payload.?too.?large|413|entity.?too.?large|max.?size/i,
  },
};

class ErrorClassificationService {
  /**
   * Classify an error into a category.
   * @param {Error|string} error
   * @returns {{ category: string, label: string, retryable: boolean, severity: string, suggestion: string }}
   */
  static classify(error) {
    const msg = typeof error === 'string' ? error : error?.message || '';
    const code = error?.code || error?.statusCode || '';
    const combined = `${msg} ${code}`;

    for (const [key, cat] of Object.entries(ERROR_CATEGORIES)) {
      if (cat.pattern.test(combined)) {
        return { category: key, ...cat, pattern: undefined };
      }
    }

    return {
      category: 'unknown',
      label: 'Unknown Error',
      retryable: false,
      severity: 'error',
      suggestion: 'An unexpected error occurred. Review the error details for more information.',
    };
  }

  /**
   * Determine if an error is retryable.
   * @param {Error|string} error
   * @returns {boolean}
   */
  static isRetryable(error) {
    return this.classify(error).retryable;
  }

  /**
   * Get a user-friendly error message.
   * @param {Error|string} error
   * @returns {string}
   */
  static getUserMessage(error) {
    const c = this.classify(error);
    return `${c.label}: ${c.suggestion}`;
  }

  /**
   * Get severity level.
   * @param {Error|string} error
   * @returns {'info'|'warning'|'error'|'critical'}
   */
  static getSeverity(error) {
    return this.classify(error).severity;
  }
}

export default ErrorClassificationService;
