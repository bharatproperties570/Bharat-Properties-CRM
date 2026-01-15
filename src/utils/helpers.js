export function getInitials(name) {
    if (!name) return '';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}

export function getSourceBadgeClass(source) {
    if (!source) return 'source-default';
    const s = source.toLowerCase();
    if (s.includes('google')) return 'source-google';
    if (s.includes('fb') || s.includes('facebook')) return 'source-fb';
    if (s.includes('ig') || s.includes('instagram')) return 'source-ig';
    if (s.includes('whatsapp')) return 'source-whatsapp';
    return 'source-default';
}
