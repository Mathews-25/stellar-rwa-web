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

describe('requestCache empty/zero input', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // An empty URL is not a valid request target. The behaviour is deliberate:
  // requestCache still delegates to fetch (no silent short-circuit), so the
  // caller observes the same rejection path as any other failed request.
  it('delegates an empty string URL to fetch and rejects on failure', async () => {
    const failure = new Error('invalid url');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(failure);

    const result = requestCache('');

    await expect(result).rejects.toThrow('invalid url');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith('');
  });

  // A zero/empty cache key must not be treated as a cache hit or silently
  // resolved. It flows through the same fetch path and surfaces errors.
  it('treats a zero/empty key as a normal request rather than a cache hit', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok'));

    const result = requestCache('');

    await expect(result).resolves.toBeDefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
