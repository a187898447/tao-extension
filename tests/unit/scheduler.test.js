import { describe, it, expect } from 'vitest';
import { parseTargetTime, schedulePurchase } from '../../src/shared/scheduler.js';

describe('parseTargetTime', () => {
  it('parses ISO format', () => {
    const result = parseTargetTime('2026-12-25T10:00:00Z');
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).not.toBeNaN();
  });

  it('parses "YYYY-MM-DD HH:mm:ss" format', () => {
    const result = parseTargetTime('2026-12-25 10:00:00');
    expect(result).toBeInstanceOf(Date);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(11);
    expect(result.getDate()).toBe(25);
    expect(result.getHours()).toBe(10);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
  });

  it('parses "HH:mm:ss" format (uses today)', () => {
    const today = new Date();
    const result = parseTargetTime('15:30:45');
    expect(result).toBeInstanceOf(Date);
    expect(result.getFullYear()).toBe(today.getFullYear());
    expect(result.getMonth()).toBe(today.getMonth());
    expect(result.getDate()).toBe(today.getDate());
    expect(result.getHours()).toBe(15);
    expect(result.getMinutes()).toBe(30);
    expect(result.getSeconds()).toBe(45);
    expect(result.getMilliseconds()).toBe(0);
  });

  it('returns null for empty string', () => {
    expect(parseTargetTime('')).toBeNull();
  });

  it('returns null for null/undefined', () => {
    expect(parseTargetTime(null)).toBeNull();
    expect(parseTargetTime(undefined)).toBeNull();
  });

  it('returns null for invalid format', () => {
    expect(parseTargetTime('not-a-time')).toBeNull();
  });

  it('returns null for random text', () => {
    expect(parseTargetTime('hello world')).toBeNull();
  });

  it('handles single-digit hours in HH:mm:ss format', () => {
    const result = parseTargetTime('9:05:03');
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(5);
    expect(result.getSeconds()).toBe(3);
  });
});

describe('schedulePurchase', () => {
  it('throws error when target time is in the past', async () => {
    const pastTime = new Date(Date.now() - 10000);
    await expect(
      schedulePurchase({
        targetTime: pastTime,
        leadTimeMs: 5000,
        prepare: async () => ({}),
        execute: async () => ({ success: true }),
      })
    ).rejects.toThrow('目标时间已过');
  });

  it('calls prepare then execute for future target', async () => {
    const now = Date.now();
    const targetTime = new Date(now + 200);
    const leadTimeMs = 100;
    const callOrder = [];

    const result = await schedulePurchase({
      targetTime,
      leadTimeMs,
      prepare: async () => {
        callOrder.push('prepare');
        return { prepared: true };
      },
      execute: async (prepResult) => {
        callOrder.push('execute');
        return { success: true, prep: prepResult };
      },
    });

    expect(callOrder).toEqual(['prepare', 'execute']);
    expect(result.success).toBe(true);
    expect(result.prep).toEqual({ prepared: true });
  });

  it('passes prepare result to execute', async () => {
    const targetTime = new Date(Date.now() + 150);
    const leadTimeMs = 50;

    const result = await schedulePurchase({
      targetTime,
      leadTimeMs,
      prepare: async () => ({ page: 'mockPage', browser: 'mockBrowser' }),
      execute: async (prep) => prep,
    });

    expect(result).toEqual({ page: 'mockPage', browser: 'mockBrowser' });
  });

  it('defaults leadTimeMs to 5000', async () => {
    const targetTime = new Date(Date.now() + 200);

    const result = await schedulePurchase({
      targetTime,
      prepare: async () => 'ready',
      execute: async () => ({ success: true }),
    });

    expect(result.success).toBe(true);
  });
});
