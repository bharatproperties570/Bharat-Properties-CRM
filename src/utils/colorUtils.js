export const getBadgeColor = (str) => {
    if (!str) return { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' };
    const s = String(str).toLowerCase();
    if (s.includes('new') || s.includes('incoming')) return { bg: '#eff6ff', text: '#3b82f6', border: '#bfdbfe' };
    if (s.includes('hot') || s.includes('won') || s.includes('book')) return { bg: '#ecfdf5', text: '#10b981', border: '#a7f3d0' };
    if (s.includes('warm') || s.includes('nego') || s.includes('prospect')) return { bg: '#fffbeb', text: '#f59e0b', border: '#fde68a' };
    if (s.includes('at risk') || s.includes('stalled')) return { bg: '#fff1f2', text: '#e11d48', border: '#fecdd3' };
    if (s.includes('cold') || s.includes('lost') || s.includes('cancel')) return { bg: '#fef2f2', text: '#ef4444', border: '#fecaca' };
    if (s.includes('opp') || s.includes('quote')) return { bg: '#f5f3ff', text: '#8b5cf6', border: '#ddd6fe' };
    
    // Hash string to dynamic color
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
        hash = s.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = [
        { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' },
        { bg: '#fdf4ff', text: '#c026d3', border: '#fbcfe8' },
        { bg: '#ecfeff', text: '#0891b2', border: '#a5f3fc' },
        { bg: '#fff7ed', text: '#ea580c', border: '#fed7aa' },
        { bg: '#f8fafc', text: '#475569', border: '#e2e8f0' }
    ];
    return colors[Math.abs(hash) % colors.length];
};
