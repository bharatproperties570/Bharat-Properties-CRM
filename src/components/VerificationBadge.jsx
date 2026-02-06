import React from 'react';

/**
 * VerificationBadge - Reusable component to display call verification status
 * 
 * @param {string} status - Verification status: 'confirmed' | 'follow-up' | 'not-interested' | 'unverified' | null
 * @param {string} size - Badge size: 'small' | 'medium' | 'large'
 * @param {boolean} showIcon - Whether to show icon
 */
const VerificationBadge = ({ status, size = 'medium', showIcon = true }) => {
    if (!status || status === 'unverified') {
        return (
            <span style={{
                padding: size === 'small' ? '2px 6px' : size === 'large' ? '6px 12px' : '4px 8px',
                borderRadius: '4px',
                fontSize: size === 'small' ? '0.65rem' : size === 'large' ? '0.85rem' : '0.7rem',
                fontWeight: 700,
                background: '#e0e7ff',
                color: '#3730a3',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
            }}>
                {showIcon && '○'}
                Not Verified
            </span>
        );
    }

    const isConfirmed = status === 'confirmed';
    const isFollowUp = status.includes('follow');
    const isNotInterested = status.includes('not-interested');

    const background = isConfirmed ? '#dcfce7' : isFollowUp ? '#fef3c7' : '#fee2e2';
    const color = isConfirmed ? '#166534' : isFollowUp ? '#b45309' : '#991b1b';
    const icon = isConfirmed ? '✓' : isFollowUp ? '⏳' : '❌';
    const text = isConfirmed ? 'Verified' : isFollowUp ? 'Follow-up' : 'Not Interested';

    return (
        <span style={{
            padding: size === 'small' ? '2px 6px' : size === 'large' ? '6px 12px' : '4px 8px',
            borderRadius: '4px',
            fontSize: size === 'small' ? '0.65rem' : size === 'large' ? '0.85rem' : '0.7rem',
            fontWeight: 700,
            background,
            color,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px'
        }}>
            {showIcon && icon}
            {text}
        </span>
    );
};

export default VerificationBadge;
