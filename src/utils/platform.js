export const isWeb = typeof window !== 'undefined' && (window.document || window.navigator);
export const isMobile = !isWeb;

export const safeWindow = typeof window !== 'undefined' ? window : {
    location: { pathname: '/', search: '', hash: '' },
    history: { pushState: () => {}, back: () => {} },
    dispatchEvent: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
};

export const getPathname = () => {
    if (isWeb && typeof window !== 'undefined') {
        return window.location.pathname;
    }
    return '/';
};
