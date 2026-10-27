import crypto from 'crypto';

const META_SIGNATURE_PREFIX = 'sha256=';

export const isValidMetaSignature = (rawBody, signature, appSecret) => {
    if (!appSecret) return true;
    if (!rawBody || !signature || !signature.startsWith(META_SIGNATURE_PREFIX)) return false;
    const expected = Buffer.from(META_SIGNATURE_PREFIX + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex'));
    const received = Buffer.from(signature);
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
};

export const isValidVerifyToken = (mode, token, expectedToken) =>
    mode === 'subscribe' && Boolean(expectedToken) && token === expectedToken;

export const extractWhatsAppChanges = (body) => (body?.entry || []).flatMap(entry =>
    (entry?.changes || []).filter(change => change?.field === 'messages').map(change => change.value || {})
);

export const buildFlowSummary = (response = {}) => {
    let summary = '📝 WhatsApp Flow Feedback:\n';
    if (response.interested) summary += `• Interested: ${response.interested}\n`;
    if (response.not_interested) summary += `• Not Interested: ${response.not_interested}\n`;
    if (response.call_date) summary += `• Call Date: ${response.call_date}\n`;
    if (response.call_time) summary += `• Call Time: ${response.call_time}\n`;
    if (response.message) summary += `• Notes: ${response.message}\n`;
    return summary;
};

export const normalizeTextMessage = (message = {}) => {
    if (message.type === 'text') return { text: message.text?.body || '', flowResponse: null };
    if (message.type === 'button') return { text: message.button?.text || message.button?.payload || '', flowResponse: null };
    if (message.type !== 'interactive') return { text: '', flowResponse: null };
    const interactive = message.interactive || {};
    if (interactive.type === 'button_reply') return { text: interactive.button_reply?.title || interactive.button_reply?.id || '', flowResponse: null };
    if (interactive.type === 'list_reply') return { text: interactive.list_reply?.title || interactive.list_reply?.description || interactive.list_reply?.id || '', flowResponse: null };
    if (interactive.type !== 'nfm_reply') return { text: '', flowResponse: null };
    try {
        const flowResponse = JSON.parse(interactive.nfm_reply?.response_json || '{}');
        return { text: buildFlowSummary(flowResponse), flowResponse };
    } catch { return { text: '[Meta Flow Form Submitted]', flowResponse: null }; }
};

export const extractCoexistenceChanges = (body) => (body?.entry || []).flatMap(entry =>
    (entry?.changes || []).filter(change => 
        change?.field === 'smb_message_echoes' || 
        change?.field === 'smb_app_state_sync' || 
        change?.field === 'history'
    ).map(change => ({ field: change.field, value: change.value || {} }))
);

/**
 * Canonical status hierarchy for WhatsApp outbound messages.
 * Higher number indicates further along in the message lifecycle.
 */
export const STATUS_WEIGHTS = {
    'queued': 0,
    'accepted': 1,
    'sent': 2,
    'delivered': 3,
    'read': 4,
    'failed': -1
};

/**
 * Checks whether an incoming status transition is monotonic.
 * Prevents late or out-of-order 'sent' or 'delivered' events from regressing
 * a message that has already been recorded as 'read' or 'delivered'.
 */
export const isMonotonicStatusTransition = (currentStatus, newStatus) => {
    if (!currentStatus) return true;
    if (currentStatus === 'failed') return false; // Once marked failed, do not regress to sent/delivered
    if (newStatus === 'failed') {
        // A message confirmed delivered or read cannot subsequently regress to failed
        return currentStatus !== 'read' && currentStatus !== 'delivered';
    }
    const currentWeight = STATUS_WEIGHTS[currentStatus] ?? 0;
    const newWeight = STATUS_WEIGHTS[newStatus] ?? 0;
    return newWeight >= currentWeight;
};

export const OPT_OUT_KEYWORDS = ['stop', 'unsubscribe', 'cancel', 'optout', 'opt-out', 'halt', 'roko', 'band karo'];
export const OPT_IN_KEYWORDS = ['start', 'unstop', 'optin', 'opt-in', 'subscribe', 'shuru karo'];

export const isOptOutMessage = (text) => {
    if (!text || typeof text !== 'string') return false;
    const clean = text.trim().toLowerCase();
    return OPT_OUT_KEYWORDS.includes(clean);
};

export const isOptInMessage = (text) => {
    if (!text || typeof text !== 'string') return false;
    const clean = text.trim().toLowerCase();
    return OPT_IN_KEYWORDS.includes(clean);
};

/**
 * Redacts tokens, keys, and authorization headers from strings or objects.
 */
export const sanitizeSecrets = (str) => {
    if (!str) return str;
    const text = typeof str === 'string' ? str : JSON.stringify(str);
    return text
        .replace(/(Bearer\s+)[a-zA-Z0-9_\-\.]{8,}/gi, '$1[REDACTED]')
        .replace(/((?:access_)?token=)[a-zA-Z0-9_\-\.]{8,}/gi, '$1[REDACTED]')
        .replace(/(systemUserToken":\s*")[^"]+/gi, '$1[REDACTED]')
        .replace(/(appSecret":\s*")[^"]+/gi, '$1[REDACTED]');
};
