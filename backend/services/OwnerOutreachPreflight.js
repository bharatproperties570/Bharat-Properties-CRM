const CHANNELS = new Set(['whatsapp', 'sms', 'rcs', 'email']);

export function evaluateOwnerOutreachPreflight(input = {}) {
    const deny = (code) => ({ allowed: false, code });
    if (!CHANNELS.has(input.channel)) return deny('CHANNEL_UNSUPPORTED');
    if (input.providerAccount?.connected !== true) return deny('PROVIDER_NOT_CONNECTED');
    if (input.providerAccount?.authorized !== true) return deny('PROVIDER_NOT_AUTHORIZED');
    if (input.providerAccount?.channel !== input.channel) return deny('PROVIDER_CHANNEL_MISMATCH');
    if (input.consent?.explicit !== true || input.consent?.current !== true) return deny('CONSENT_NOT_CURRENT');
    if (input.consent?.optedOut === true) return deny('RECIPIENT_OPTED_OUT');
    if (input.priorDeliveryState === 'DELIVERY_UNKNOWN') return deny('DELIVERY_OUTCOME_UNKNOWN');
    if (input.periodAlreadyReserved === true) return deny('PERIOD_DUPLICATE_SUPPRESSED');
    if (!Number.isInteger(input.globalReservedCount) || !Number.isInteger(input.globalDailyCap) ||
        input.globalDailyCap < 1 || input.globalReservedCount < 0) return deny('GLOBAL_BUDGET_UNAVAILABLE');
    if (input.globalReservedCount >= input.globalDailyCap) return deny('GLOBAL_DAILY_CAP_REACHED');
    if (!Number.isInteger(input.channelReservedCount) || !Number.isInteger(input.channelDailyCap) ||
        input.channelDailyCap < 1 || input.channelReservedCount < 0) return deny('CHANNEL_BUDGET_UNAVAILABLE');
    if (input.channelReservedCount >= input.channelDailyCap) return deny('CHANNEL_DAILY_CAP_REACHED');
    return { allowed: true, code: 'PREFLIGHT_ALLOWED' };
}
