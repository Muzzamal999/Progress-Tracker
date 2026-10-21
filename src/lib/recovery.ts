/**
 * Cookie that marks "this browser session came from a password-recovery link". It is set (httpOnly) by
 * /auth/callback after a recovery code is successfully exchanged, and checked by the reset page and by the
 * server action that changes the password. A normal signed-in session never carries it, so visiting
 * /reset-password while logged in cannot be used to change a password without the emailed link.
 */
export const RECOVERY_COOKIE = "sja_recovery";
export const RECOVERY_MAX_AGE_SECONDS = 15 * 60;
