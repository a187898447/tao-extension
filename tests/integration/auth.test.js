import { describe, it, expect } from 'vitest';
import { checkSession, loadSessionCookies } from '../../src/shared/auth.js';

describe('auth integration', () => {
  describe('checkSession', () => {
    it('returns invalid when no session file exists', async () => {
      const result = await checkSession('nonexistent-profile-test-xyz');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('no session file');
    });
  });

  describe('loadSessionCookies', () => {
    it('returns null for non-existent profile', async () => {
      const result = await loadSessionCookies('__definitely_not_a_real_profile__');
      expect(result).toBeNull();
    });
  });
});
