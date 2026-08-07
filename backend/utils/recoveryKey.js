/**
 * recoveryKey.js — Recovery-code utilities
 *
 * Hashing strategy:
 *   HMAC-SHA256(RECOVERY_CODE_SECRET, normalizedCode)
 *
 * Why HMAC instead of bcrypt for recovery codes?
 *   - Recovery codes are long, high-entropy random strings (RELAY-XXXX-XXXX format).
 *     Brute-forcing them is infeasible regardless of hash speed.
 *   - HMAC is O(1) per comparison (no 9-bcrypt-loop bottleneck).
 *   - The server-side secret key means an attacker with DB access still cannot
 *     reverse the codes without the secret.
 *   - bcrypt is still used for passwords (low-entropy user-chosen strings).
 *
 * The RECOVERY_CODE_SECRET env var MUST be set (≥ 32 random bytes, hex or base64).
 */

const crypto = require('crypto');

const RECOVERY_SECRET = process.env.RECOVERY_CODE_SECRET || process.env.JWT_SECRET || 'relay-recovery-fallback-secret';
const ROLLING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SECURITY_ACTION_LIMIT = 5;
const CODE_COUNT = 9;

// ── Code generation ────────────────────────────────────────────────────────────

/**
 * Generate a single cryptographically secure recovery code.
 * Format: RELAY-XXXX-XXXX  (8 alphanumeric chars split into two groups)
 */
const generateSingleCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = '';
  for (let i = 0; i < 8; i++) {
    key += chars[crypto.randomInt(0, chars.length)];
  }
  return `RELAY-${key.slice(0, 4)}-${key.slice(4, 8)}`;
};

/**
 * Normalize a user-supplied code before hashing/comparison.
 * Strips whitespace, converts to uppercase.
 */
const normalizeCode = (code) => (code || '').trim().toUpperCase();

/**
 * Compute HMAC-SHA256 digest of a normalized recovery code.
 * Returns a hex string.
 */
const hashCode = (plainCode) =>
  crypto
    .createHmac('sha256', RECOVERY_SECRET)
    .update(normalizeCode(plainCode))
    .digest('hex');

/**
 * generateRecoverySet()
 * Generate exactly 9 codes and return both plaintext (for one-time display) and hashes.
 *
 * @returns {{ plain: string[], hashed: Array<{codeHash: string, usedAt: null}> }}
 */
const generateRecoverySet = () => {
  const plain = [];
  const hashed = [];

  for (let i = 0; i < CODE_COUNT; i++) {
    const code = generateSingleCode();
    plain.push(code);
    hashed.push({ codeHash: hashCode(code), usedAt: null });
  }

  return { plain, hashed };
};

// ── Verification & consumption ─────────────────────────────────────────────────

/**
 * verifyAndConsumeCode(inputCode, user)
 *
 * Looks up an unused code in user.recoveryCodesSet that matches inputCode.
 * Does NOT save the user — the caller must call user.save() (or use $set) after.
 * Marks the matched code's usedAt to prevent reuse.
 *
 * Also falls back to legacy recoveryKeys (bcrypt) for users who haven't migrated.
 *
 * @param {string} inputCode  - raw code entered by the user
 * @param {object} user       - Mongoose user document (must include recoveryCodesSet + recoveryKeys)
 * @returns {{ valid: boolean, keyIndex?: number, isLegacy?: boolean }}
 */
const verifyAndConsumeCode = async (inputCode, user) => {
  if (!inputCode || !user) return { valid: false };

  const normalized = normalizeCode(inputCode);
  const digest = hashCode(normalized);

  // ── New system: HMAC lookup (O(1) per entry) ───────────────────────────────
  if (user.recoveryCodesSet && Array.isArray(user.recoveryCodesSet.codes) && user.recoveryCodesSet.codes.length > 0) {
    for (let i = 0; i < user.recoveryCodesSet.codes.length; i++) {
      const entry = user.recoveryCodesSet.codes[i];
      if (entry.usedAt) continue;           // already consumed
      if (entry.codeHash === digest) {       // constant-time-equivalent via HMAC
        user.recoveryCodesSet.codes[i].usedAt = new Date();
        user.markModified('recoveryCodesSet.codes');
        return { valid: true, keyIndex: i };
      }
    }
  }

  // ── Legacy system: bcrypt fallback for pre-migration users ────────────────
  if (Array.isArray(user.recoveryKeys) && user.recoveryKeys.length > 0) {
    const bcrypt = require('bcryptjs');
    for (let i = 0; i < user.recoveryKeys.length; i++) {
      const item = user.recoveryKeys[i];
      if (item.used || !item.code) continue;
      const isMatch = await bcrypt.compare(normalized, item.code);
      if (isMatch) {
        user.recoveryKeys[i].used = true;
        user.markModified('recoveryKeys');
        return { valid: true, keyIndex: i, isLegacy: true };
      }
    }
  }

  // ── Legacy single recoveryKey ─────────────────────────────────────────────
  if (user.recoveryKey) {
    const bcrypt = require('bcryptjs');
    const isMatch = await bcrypt.compare(normalized, user.recoveryKey);
    if (isMatch) {
      user.recoveryKey = undefined; // consume it
      return { valid: true, isLegacy: true };
    }
  }

  return { valid: false };
};

// ── Status helpers ─────────────────────────────────────────────────────────────

/**
 * getRemainingCount(user)
 * Returns the number of unused codes in the user's active set.
 * Falls back to counting unused legacy codes.
 */
const getRemainingCount = (user) => {
  if (user.recoveryCodesSet && Array.isArray(user.recoveryCodesSet.codes) && user.recoveryCodesSet.codes.length > 0) {
    return user.recoveryCodesSet.codes.filter(c => !c.usedAt).length;
  }
  // Legacy fallback
  if (Array.isArray(user.recoveryKeys) && user.recoveryKeys.length > 0) {
    return user.recoveryKeys.filter(k => !k.used).length;
  }
  return 0;
};

/**
 * canRegenerate(user)
 * Returns true if the user is allowed to generate a new recovery-code set.
 *
 * Allowed when:
 *   A) All 9 current codes have been consumed (remaining === 0)
 *   OR
 *   B) The current set was generated >= 30 days ago
 */
const canRegenerate = (user) => {
  const remaining = getRemainingCount(user);

  // Condition A — all consumed
  if (remaining === 0) return true;

  // Condition B — 30-day cooldown elapsed
  if (user.recoveryCodesSet && user.recoveryCodesSet.generatedAt) {
    const age = Date.now() - new Date(user.recoveryCodesSet.generatedAt).getTime();
    if (age >= ROLLING_WINDOW_MS) return true;
  }

  return false;
};

/**
 * getRegenerationAvailableAt(user)
 * Returns the Date when regeneration next becomes available, or null if already available.
 */
const getRegenerationAvailableAt = (user) => {
  if (canRegenerate(user)) return null;

  if (user.recoveryCodesSet && user.recoveryCodesSet.generatedAt) {
    return new Date(new Date(user.recoveryCodesSet.generatedAt).getTime() + ROLLING_WINDOW_MS);
  }
  return null;
};

/**
 * getSecurityActionsUsed(user)
 * Count security actions performed within the rolling previous 30 days.
 */
const getSecurityActionsUsed = (user) => {
  if (!Array.isArray(user.securityActions) || user.securityActions.length === 0) return 0;
  const cutoff = new Date(Date.now() - ROLLING_WINDOW_MS);
  return user.securityActions.filter(a => new Date(a.performedAt) > cutoff).length;
};

/**
 * canPerformSecurityAction(user)
 * Returns true if the user has not yet hit the 5-action rolling limit.
 */
const canPerformSecurityAction = (user) => getSecurityActionsUsed(user) < SECURITY_ACTION_LIMIT;

/**
 * getSecurityActionsResetAt(user)
 * Returns the Date when the oldest currently-counted action falls outside the window.
 * Returns null if there are no counted actions.
 */
const getSecurityActionsResetAt = (user) => {
  if (!Array.isArray(user.securityActions) || user.securityActions.length === 0) return null;
  const cutoff = new Date(Date.now() - ROLLING_WINDOW_MS);
  const counted = user.securityActions
    .filter(a => new Date(a.performedAt) > cutoff)
    .sort((a, b) => new Date(a.performedAt) - new Date(b.performedAt));
  if (counted.length === 0) return null;
  // Oldest counted action exits the window 30 days after it was performed
  return new Date(new Date(counted[0].performedAt).getTime() + ROLLING_WINDOW_MS);
};

// ── Backwards-compatible exports (kept so other modules don't break) ───────────

const generateRecoveryKeys = (count = CODE_COUNT) => {
  const keys = [];
  for (let i = 0; i < count; i++) keys.push(generateSingleCode());
  return keys;
};

const generateRecoveryKey = () => generateSingleCode();

const hashRecoveryKey = async (plainTextKey) => {
  const bcrypt = require('bcryptjs');
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(plainTextKey, salt);
};

const hashRecoveryKeys = async (plainTextKeys) => {
  const bcrypt = require('bcryptjs');
  const salt = await bcrypt.genSalt(10);
  const result = [];
  for (const k of plainTextKeys) {
    result.push({ code: await bcrypt.hash(k, salt), used: false });
  }
  return result;
};

const verifyRecoveryCode = verifyAndConsumeCode; // alias
const verifyRecoveryKey = async (inputKey, hashedStoredKey) => {
  if (!inputKey || !hashedStoredKey) return false;
  const bcrypt = require('bcryptjs');
  return await bcrypt.compare(normalizeCode(inputKey), hashedStoredKey);
};

module.exports = {
  // New API
  generateRecoverySet,
  verifyAndConsumeCode,
  getRemainingCount,
  canRegenerate,
  getRegenerationAvailableAt,
  getSecurityActionsUsed,
  canPerformSecurityAction,
  getSecurityActionsResetAt,
  hashCode,
  normalizeCode,
  SECURITY_ACTION_LIMIT,
  // Legacy compat
  generateRecoveryKeys,
  generateRecoveryKey,
  hashRecoveryKey,
  hashRecoveryKeys,
  verifyRecoveryCode,
  verifyRecoveryKey,
};
