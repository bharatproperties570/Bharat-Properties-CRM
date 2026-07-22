export const parseShareToMarlas = (shareStr) => {
    if (!shareStr) return 0;
    try {
        if (shareStr.includes('/')) {
            const [num, den] = shareStr.split('/');
            const n = parseFloat(num);
            const d = parseFloat(den);
            if (!isNaN(n) && !isNaN(d) && d !== 0) {
                return (n / d) * 160;
            }
        } else {
            const val = parseFloat(shareStr);
            if (!isNaN(val)) return val * 160;
        }
    } catch (e) {
        return 0;
    }
    return 0;
};

export const formatMarlas = (totalMarlas) => {
    const acres = Math.floor(totalMarlas / 160);
    const remainingMarlasAfterAcres = totalMarlas % 160;
    const kanals = Math.floor(remainingMarlasAfterAcres / 20);
    const marlas = Math.round(remainingMarlasAfterAcres % 20);
    return `${acres} Acre ${kanals} Kanal ${marlas} Marla`;
};
