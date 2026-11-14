import axios from 'axios';
import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';

const MAX_BYTES = 15 * 1024 * 1024;

const ipv4ToInt = (address) => address.split('.').reduce((value, octet) => ((value << 8) | Number(octet)) >>> 0, 0);

const inCidr = (address, network, prefix) => {
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (ipv4ToInt(address) & mask) === (ipv4ToInt(network) & mask);
};

export const isPublicMarketingMediaIPv4 = (address) => {
    if (net.isIP(address) !== 4) return false;
    const blocked = [
        ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10],
        ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
        ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16],
        ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
        ['224.0.0.0', 4], ['240.0.0.0', 4]
    ];
    return !blocked.some(([network, prefix]) => inCidr(address, network, prefix));
};

const configuredHosts = () => new Set(
    String(process.env.MARKETING_MEDIA_ALLOWED_HOSTS || '')
        .split(',')
        .map(host => host.trim().toLowerCase())
        .filter(Boolean)
);

export const isAllowedMarketingMediaUrl = (value, hosts = configuredHosts()) => {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' &&
            url.username === '' &&
            url.password === '' &&
            (!url.port || url.port === '443') &&
            hosts.has(url.hostname.toLowerCase());
    } catch {
        return false;
    }
};

/**
 * Fetch only from explicitly configured HTTPS hosts. Resolve and pin a public
 * IPv4 address to the socket to prevent DNS rebinding between validation and connect.
 * Redirects and environment proxy routing are disabled.
 */
export const fetchApprovedMarketingImage = async (value) => {
    if (!isAllowedMarketingMediaUrl(value)) {
        throw new Error('MARKETING_MEDIA_HOST_NOT_ALLOWED');
    }

    const url = new URL(value);
    const resolved = await dns.lookup(url.hostname, { all: true, verbatim: true, family: 4 });
    if (!resolved.length || resolved.some(({ address }) => !isPublicMarketingMediaIPv4(address))) {
        throw new Error('MARKETING_MEDIA_ADDRESS_NOT_PUBLIC');
    }

    const pinnedAddress = resolved[0].address;
    const agent = new https.Agent({
        keepAlive: false,
        lookup(hostname, options, callback) {
            if (hostname.toLowerCase() !== url.hostname.toLowerCase()) {
                callback(new Error('MARKETING_MEDIA_HOST_CHANGED'));
                return;
            }
            callback(null, pinnedAddress, 4);
        }
    });

    try {
        const response = await axios.get(url.toString(), {
            responseType: 'arraybuffer',
            timeout: 5000,
            maxContentLength: MAX_BYTES,
            maxBodyLength: MAX_BYTES,
            maxRedirects: 0,
            proxy: false,
            httpsAgent: agent,
            headers: { 'User-Agent': 'BharatProperties-CRM/1.0' }
        });
        const mimeType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (!mimeType.startsWith('image/')) {
            throw new Error('MARKETING_MEDIA_MIME_REJECTED');
        }
        return Buffer.from(response.data);
    } finally {
        agent.destroy();
    }
};
