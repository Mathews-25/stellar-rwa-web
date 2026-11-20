import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestCache } from './requestCache';

describe('requestCache error path', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects predictably when the underlying fetch fails', async () => {
    const failure = new Error('network down');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(failure);

    const result = requestCache('https://example.test/resource');

    await expect(result).rejects.toThrow('network down');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('surfaces the failure as readable state instead of an unhandled exception', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));

    let caught: unknown;
    try {
      await requestCache('https://example.test/resource');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('boom');
  });
});
