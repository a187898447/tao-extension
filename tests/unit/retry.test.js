import { describe, it, expect, vi, beforeEach } from 'vitest';
import { retryClick, retryApi, sleep } from '../../src/shared/retry.js';

describe('sleep', () => {
  it('resolves after the given time', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});

describe('retryLoop (via retryClick with mock page/checkFn)', () => {
  let mockPage;
  let mockClick;

  beforeEach(() => {
    mockClick = vi.fn();
    mockPage = {
      click: mockClick,
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('returns success when checkFn succeeds on first attempt', async () => {
    const checkFn = vi.fn().mockResolvedValue({ success: true });

    const result = await retryClick(
      mockPage,
      { retryInterval: 10, retryWindow: 5000 },
      checkFn,
      '#btn'
    );

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(checkFn).toHaveBeenCalledTimes(1);
  });

  it('retries when checkFn returns retryable=true', async () => {
    const checkFn = vi.fn()
      .mockResolvedValueOnce({ success: false, retryable: true, reason: 'blocked' })
      .mockResolvedValueOnce({ success: false, retryable: true, reason: 'blocked' })
      .mockResolvedValueOnce({ success: true });

    const result = await retryClick(
      mockPage,
      { retryInterval: 10, retryWindow: 5000 },
      checkFn,
      '#btn'
    );

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(3);
    expect(checkFn).toHaveBeenCalledTimes(3);
  });

  it('stops on terminal error (retryable=false)', async () => {
    const checkFn = vi.fn()
      .mockResolvedValueOnce({ success: false, retryable: true, reason: 'blocked' })
      .mockResolvedValueOnce({ success: false, retryable: false, reason: 'sold out' });

    const result = await retryClick(
      mockPage,
      { retryInterval: 10, retryWindow: 5000 },
      checkFn,
      '#btn'
    );

    expect(result.success).toBe(false);
    expect(result.reason).toBe('sold out');
    expect(result.attempts).toBe(2);
  });

  it('returns timeout when window expires', async () => {
    const checkFn = vi.fn().mockResolvedValue({ success: false, retryable: true, reason: 'blocked' });

    const result = await retryClick(
      mockPage,
      { retryInterval: 100, retryWindow: 50 },
      checkFn,
      '#btn'
    );

    expect(result.success).toBe(false);
    expect(result.reason).toBe('time window expired');
  });

  it('still calls checkFn when click throws', async () => {
    mockClick.mockRejectedValue(new Error('element not found'));
    const checkFn = vi.fn().mockResolvedValue({ success: true });

    const result = await retryClick(
      mockPage,
      { retryInterval: 10, retryWindow: 5000 },
      checkFn,
      '#btn'
    );

    expect(result.success).toBe(true);
    expect(checkFn).toHaveBeenCalledTimes(1);
  });
});

describe('retryApi', () => {
  it('returns success when request succeeds and passes check', async () => {
    const mockResponse = { status: 200, data: { success: true } };
    const requestFn = vi.fn().mockResolvedValue(mockResponse);
    const checkFn = vi.fn().mockReturnValue({ success: true });

    const result = await retryApi(
      requestFn,
      { retryInterval: 10, retryWindow: 5000 },
      checkFn
    );

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
  });

  it('retries and eventually succeeds', async () => {
    const mockResponse = { status: 200 };
    const requestFn = vi.fn().mockResolvedValue(mockResponse);
    const checkFn = vi.fn()
      .mockReturnValueOnce({ success: false, retryable: true })
      .mockReturnValueOnce({ success: true });

    const result = await retryApi(
      requestFn,
      { retryInterval: 10, retryWindow: 2000 },
      checkFn
    );

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('stops on terminal error from checkFn', async () => {
    const mockResponse = { status: 200, data: 'sold out' };
    const requestFn = vi.fn().mockResolvedValue(mockResponse);
    const checkFn = vi.fn().mockReturnValue({ success: false, retryable: false, reason: 'sold out' });

    const result = await retryApi(
      requestFn,
      { retryInterval: 10, retryWindow: 5000 },
      checkFn
    );

    expect(result.success).toBe(false);
    expect(result.reason).toBe('sold out');
  });
});
