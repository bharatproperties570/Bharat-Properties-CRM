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
