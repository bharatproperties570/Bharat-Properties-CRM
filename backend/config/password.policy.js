/**
 * Password Policy Configuration
 * Enforces strong password requirements
 */

export const PASSWORD_POLICY = {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    specialChars: '@$!%*?&#^()_+-=[]{}|;:,.<>',

    // Password history
    preventReuse: true,
    historyCount: 5, // Remember last 5 passwords

    // Expiration
    expiryDays: 90,
    warnBeforeDays: 7,

    // Lockout policy
    maxFailedAttempts: 5,
    lockoutDurationMinutes: 30
};

/**
 * Validate password against policy
 */
export const validatePassword = (password) => {
    const errors = [];

    if (!password) {
        return { valid: false, errors: ['Password is required'] };
    }

    if (password.length < PASSWORD_POLICY.minLength) {
        errors.push(`Password must be at least ${PASSWORD_POLICY.minLength} characters long`);
    }

    if (password.length > PASSWORD_POLICY.maxLength) {
        errors.push(`Password must not exceed ${PASSWORD_POLICY.maxLength} characters`);
    }

    if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }

    if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }

    if (PASSWORD_POLICY.requireNumbers && !/\d/.test(password)) {
        errors.push('Password must contain at least one number');
    }

    if (PASSWORD_POLICY.requireSpecialChars) {
        const specialCharsRegex = new RegExp(`[${PASSWORD_POLICY.specialChars.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}]`);
        if (!specialCharsRegex.test(password)) {
            errors.push(`Password must contain at least one special character (${PASSWORD_POLICY.specialChars})`);
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
};

/**
 * Check if password is in history
 */
export const isPasswordInHistory = async (user, newPasswordHash) => {
    if (!PASSWORD_POLICY.preventReuse || !user.passwordHistory) {
        return false;
    }

    const bcrypt = await import('bcryptjs');

    for (const historyEntry of user.passwordHistory) {
        const match = await bcrypt.compare(newPasswordHash, historyEntry.hash);
        if (match) {
            return true;
        }
    }

    return false;
};

/**
 * Check if password is expired
 */
export const isPasswordExpired = (user) => {
    if (!user.passwordExpiresAt) {
        return false;
    }

    return new Date() > user.passwordExpiresAt;
};

/**
 * Check if password expiry warning should be shown
 */
export const shouldWarnPasswordExpiry = (user) => {
    if (!user.passwordExpiresAt) {
        return false;
    }

    const warnDate = new Date(user.passwordExpiresAt);
    warnDate.setDate(warnDate.getDate() - PASSWORD_POLICY.warnBeforeDays);

    return new Date() >= warnDate && new Date() < user.passwordExpiresAt;
};

/**
 * Calculate password expiry date
 */
export const calculatePasswordExpiry = () => {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + PASSWORD_POLICY.expiryDays);
    return expiryDate;
};

/**
 * Check if account is locked
 */
export const isAccountLocked = (user) => {
    if (user.failedLoginAttempts < PASSWORD_POLICY.maxFailedAttempts) {
        return false;
    }

    if (!user.lastFailedLogin) {
        return true;
    }

    const lockoutEnd = new Date(user.lastFailedLogin);
    lockoutEnd.setMinutes(lockoutEnd.getMinutes() + PASSWORD_POLICY.lockoutDurationMinutes);

    return new Date() < lockoutEnd;
};

/**
 * Get lockout remaining time in minutes
 */
export const getLockoutRemainingTime = (user) => {
    if (!isAccountLocked(user)) {
        return 0;
    }

    const lockoutEnd = new Date(user.lastFailedLogin);
    lockoutEnd.setMinutes(lockoutEnd.getMinutes() + PASSWORD_POLICY.lockoutDurationMinutes);

    const remainingMs = lockoutEnd - new Date();
    return Math.ceil(remainingMs / (1000 * 60));
};

export default {
    PASSWORD_POLICY,
    validatePassword,
    isPasswordInHistory,
    isPasswordExpired,
    shouldWarnPasswordExpiry,
    calculatePasswordExpiry,
    isAccountLocked,
    getLockoutRemainingTime
};
