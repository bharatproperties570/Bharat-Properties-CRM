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

export function fixDriveUrl(url) {
    if (!url) return url;
    if (url.includes('drive.google.com')) {
        const fileIdMatch = url.match(/\/file\/d\/([^/]+)/) || url.match(/[?&]id=([^&]+)/);
        if (fileIdMatch && fileIdMatch[1]) {
            return `https://drive.google.com/uc?export=view&id=${fileIdMatch[1]}`;
        }
    }
    return url;
}

export function getYoutubeId(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}
