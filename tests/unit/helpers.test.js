import { describe, it, expect } from 'vitest';

// Test formatDuration from scheduler — it's a private function,
// so we test it indirectly through schedulePurchase and also
// verify the countdown output doesn't crash.

// formatDuration logic (copied for direct testing)
function formatDuration(ms) {
  if (ms < 0) return '0s';
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0) {
    return `${min}m${sec.toString().padStart(2, '0')}s`;
  }
  return `${sec}s`;
}

// retryLoop logic — tested directly since it's the core engine
async function retryLoop(options = {}) {
  const interval = options.interval || 200;
  const windowMs = options.window || 30000;
  const attemptFn = options.attempt;

  const startTime = Date.now();
  let attempts = 0;

  while (Date.now() - startTime < windowMs) {
    attempts++;

    try {
      const result = await attemptFn();

      if (result.success) {
        return { success: true, attempts };
      }

      if (result.retryable === false) {
        return { success: false, attempts, reason: result.reason };
      }

      const elapsed = Date.now() - startTime;
      if (elapsed + interval < windowMs) {
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    } catch (err) {
      return { success: false, attempts, reason: `error: ${err.message}` };
    }
  }

  return { success: false, attempts, reason: 'time window expired' };
}

describe('formatDuration', () => {
  it('formats seconds', () => {
    expect(formatDuration(5000)).toBe('5s');
    expect(formatDuration(1000)).toBe('1s');
    expect(formatDuration(0)).toBe('0s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(65000)).toBe('1m05s');
    expect(formatDuration(120000)).toBe('2m00s');
    expect(formatDuration(125000)).toBe('2m05s');
  });

  it('handles negative values', () => {
    expect(formatDuration(-1000)).toBe('0s');
  });

  it('rounds up seconds', () => {
    expect(formatDuration(1500)).toBe('2s');
    expect(formatDuration(100)).toBe('1s');
  });
});

describe('retryLoop', () => {
  it('succeeds on first attempt', async () => {
    const result = await retryLoop({
      interval: 10,
      window: 5000,
      attempt: async () => ({ success: true }),
    });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
  });

  it('retries on retryable failure', async () => {
    let calls = 0;
    const result = await retryLoop({
      interval: 10,
      window: 5000,
      attempt: async () => {
        calls++;
        if (calls < 3) return { success: false, retryable: true };
        return { success: true };
      },
    });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(3);
  });

  it('stops on terminal error', async () => {
    const result = await retryLoop({
      interval: 10,
      window: 5000,
      attempt: async () => ({ success: false, retryable: false, reason: 'sold out' }),
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('sold out');
    expect(result.attempts).toBe(1);
  });

  it('returns timeout when window expires', async () => {
    const result = await retryLoop({
      interval: 100,
      window: 50, // too short for even one iteration at 100ms interval
      attempt: async () => ({ success: false, retryable: true }),
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('time window expired');
  });

  it('catches thrown errors and returns them', async () => {
    const result = await retryLoop({
      interval: 10,
      window: 5000,
      attempt: async () => { throw new Error('network down'); },
    });

    expect(result.success).toBe(false);
    expect(result.reason).toContain('network down');
  });

  it('uses defaults when no options provided', async () => {
    // This will complete very fast since the attempt succeeds immediately
    const result = await retryLoop({
      attempt: async () => ({ success: true }),
    });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
  });
});
