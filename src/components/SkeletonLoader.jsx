/**
 * Enterprise Skeleton Loader Components
 * - Mimics real UI structure exactly
 * - Animated shimmer effect
 * - Zero layout shift when data loads
 */
import React from 'react';
import './SkeletonLoader.css';

// Base shimmer box
export const SkeletonBox = ({ width = '100%', height = '16px', borderRadius = '6px', style = {} }) => (
    <div
        className="skeleton-shimmer"
        style={{ width, height, borderRadius, ...style }}
    />
);

// Lead row skeleton — matches actual LeadsPage list row
export const LeadRowSkeleton = () => (
    <div className="skeleton-lead-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <SkeletonBox width="16px" height="16px" borderRadius="3px" />
            <SkeletonBox width="40px" height="40px" borderRadius="50%" />
            <div style={{ flex: 1 }}>
                <SkeletonBox width="140px" height="14px" style={{ marginBottom: '6px' }} />
                <SkeletonBox width="100px" height="11px" />
            </div>
        </div>
        <div>
            <SkeletonBox width="90px" height="11px" style={{ marginBottom: '6px' }} />
            <SkeletonBox width="70px" height="11px" />
        </div>
        <SkeletonBox width="80px" height="11px" />
        <div>
            <SkeletonBox width="60px" height="22px" borderRadius="12px" style={{ marginBottom: '6px' }} />
            <SkeletonBox width="50px" height="11px" />
        </div>
        <div>
            <SkeletonBox width="80px" height="11px" style={{ marginBottom: '6px' }} />
            <SkeletonBox width="60px" height="11px" />
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
            <SkeletonBox width="28px" height="28px" borderRadius="8px" />
            <SkeletonBox width="28px" height="28px" borderRadius="8px" />
            <SkeletonBox width="28px" height="28px" borderRadius="8px" />
        </div>
    </div>
);

// Contact row skeleton
export const ContactRowSkeleton = () => (
    <div className="skeleton-lead-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <SkeletonBox width="16px" height="16px" borderRadius="3px" />
            <SkeletonBox width="40px" height="40px" borderRadius="50%" />
            <div style={{ flex: 1 }}>
                <SkeletonBox width="130px" height="14px" style={{ marginBottom: '6px' }} />
                <SkeletonBox width="90px" height="11px" />
            </div>
        </div>
        <SkeletonBox width="100px" height="11px" />
        <SkeletonBox width="80px" height="22px" borderRadius="12px" />
        <SkeletonBox width="90px" height="11px" />
        <div style={{ display: 'flex', gap: '6px' }}>
            <SkeletonBox width="28px" height="28px" borderRadius="8px" />
            <SkeletonBox width="28px" height="28px" borderRadius="8px" />
        </div>
    </div>
);

// Full leads page skeleton
export const LeadsPageSkeleton = ({ count = 10 }) => (
    <div style={{ padding: '0' }}>
        {/* Toolbar skeleton */}
        <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 2rem', borderBottom: '1px solid var(--border-color, #eef2f5)',
            background: '#fff', marginBottom: '0'
        }}>
            <SkeletonBox width="280px" height="36px" borderRadius="10px" />
            <div style={{ display: 'flex', gap: '10px' }}>
                <SkeletonBox width="80px" height="32px" borderRadius="8px" />
                <SkeletonBox width="80px" height="32px" borderRadius="8px" />
                <SkeletonBox width="100px" height="32px" borderRadius="8px" />
            </div>
        </div>

        {/* Header row skeleton */}
        <div style={{
            display: 'grid', gridTemplateColumns: '40px 2fr 1fr 1fr 1fr 1fr 1fr',
            gap: '12px', padding: '8px 1.5rem',
            background: 'var(--header-bg-translucent, #f8fafc)',
            borderBottom: '2px solid var(--border-color, #eef2f5)'
        }}>
            {[40, 140, 90, 80, 80, 90, 80].map((w, i) => (
                <SkeletonBox key={i} width={`${w}px`} height="11px" />
            ))}
        </div>

        {/* Lead rows */}
        {Array.from({ length: count }).map((_, i) => (
            <LeadRowSkeleton key={i} />
        ))}
    </div>
);

// Stats card skeleton (for pipeline dashboard)
export const StatCardSkeleton = () => (
    <div style={{
        background: 'var(--card-bg, #fff)',
        border: '1px solid var(--border-color, #eef2f5)',
        borderRadius: '12px', padding: '16px', minWidth: '140px'
    }}>
        <SkeletonBox width="60px" height="11px" style={{ marginBottom: '10px' }} />
        <SkeletonBox width="80px" height="28px" style={{ marginBottom: '6px' }} />
        <SkeletonBox width="50px" height="10px" />
    </div>
);

export default LeadsPageSkeleton;
