import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';

// Use a temp directory for credentials
const tmpDir = path.join(fs.realpathSync(require('os').tmpdir()), `tao-test-${Date.now()}`);
const credentialsDir = path.join(tmpDir, '.taobao-tool', 'credentials');

// Must come before any import of session module
const origHomedir = require('os').homedir;
require('os').homedir = () => tmpDir;

const { saveSession, loadSession, sessionExists } = require('../../src/shared/session.js');

describe('session', () => {
  beforeEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    require('os').homedir = origHomedir;
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('saveSession', () => {
    it('saves cookies to a profile file', () => {
      const cookies = [
        { name: '_tb_token_', value: 'abc123', domain: '.taobao.com' },
        { name: 'cookie2', value: 'xyz789', domain: '.taobao.com' },
      ];
      saveSession('default', cookies);

      const filePath = path.join(credentialsDir, 'default.json');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(content.profile).toBe('default');
      expect(content.cookies).toEqual(cookies);
      expect(content.savedAt).toBeDefined();
    });

    it('saves to different profiles independently', () => {
      saveSession('profile1', [{ name: 'a', value: '1' }]);
      saveSession('profile2', [{ name: 'b', value: '2' }]);

      const p1 = loadSession('profile1');
      const p2 = loadSession('profile2');

      expect(p1.cookies[0].name).toBe('a');
      expect(p2.cookies[0].name).toBe('b');
    });

    it('sets file permission to 600', () => {
      saveSession('default', [{ name: 'test', value: 'val' }]);
      const filePath = path.join(credentialsDir, 'default.json');
      const stat = fs.statSync(filePath);
      expect(stat.mode & 0o777).toBe(0o600);
    });

    it('creates directory with mode 700', () => {
      saveSession('default', [{ name: 'test', value: 'val' }]);
      const stat = fs.statSync(credentialsDir);
      expect(stat.mode & 0o777).toBe(0o700);
    });
  });

  describe('loadSession', () => {
    it('returns null when profile does not exist', () => {
      const result = loadSession('nonexistent');
      expect(result).toBeNull();
    });

    it('loads previously saved session', () => {
      const cookies = [{ name: 'token', value: 'secret' }];
      saveSession('default', cookies);

      const loaded = loadSession('default');
      expect(loaded).not.toBeNull();
      expect(loaded.profile).toBe('default');
      expect(loaded.cookies).toEqual(cookies);
    });

    it('returns null for corrupt JSON', () => {
      fs.mkdirSync(credentialsDir, { recursive: true, mode: 0o700 });
      const filePath = path.join(credentialsDir, 'corrupt.json');
      fs.writeFileSync(filePath, 'not valid json{{{', { mode: 0o600 });

      const result = loadSession('corrupt');
      expect(result).toBeNull();
    });
  });

  describe('sessionExists', () => {
    it('returns false for non-existent profile', () => {
      expect(sessionExists('ghost')).toBe(false);
    });

    it('returns true after saving', () => {
      saveSession('default', [{ name: 'x', value: 'y' }]);
      expect(sessionExists('default')).toBe(true);
    });

    it('returns false for different profile', () => {
      saveSession('default', [{ name: 'x', value: 'y' }]);
      expect(sessionExists('other')).toBe(false);
    });
  });
});
