import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCompliance } from './useCompliance';

const mockGetCompliance = vi.fn();

vi.mock('@/lib/contracts', () => ({
  getCompliance: (...args: unknown[]) => mockGetCompliance(...args),
}));

describe('useCompliance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('surfaces a rejected compliance lookup as readable error state', async () => {
    mockGetCompliance.mockRejectedValueOnce(new Error('RPC unavailable'));

    const { result } = renderHook(() => useCompliance('GABC123'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('RPC unavailable');
    expect(result.current.compliance).toBeNull();
  });

  it('re-runs the lookup when the address changes (no stale closure)', async () => {
    mockGetCompliance.mockResolvedValue({ compliant: true });

    const { result, rerender } = renderHook(
      ({ address }: { address: string }) => useCompliance(address),
      { initialProps: { address: 'GABC123' } },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(mockGetCompliance).toHaveBeenCalledTimes(1);
    expect(mockGetCompliance).toHaveBeenLastCalledWith('GABC123');

    rerender({ address: 'GDEF456' });

    await waitFor(() => {
      expect(mockGetCompliance).toHaveBeenCalledTimes(2);
    });
    expect(mockGetCompliance).toHaveBeenLastCalledWith('GDEF456');
  });

  it('does not set state after unmount', async () => {
    let resolveLookup: (value: unknown) => void = () => {};
    mockGetCompliance.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLookup = resolve;
      }),
    );

    const { unmount } = renderHook(() => useCompliance('GABC123'));

    unmount();
    resolveLookup({ compliant: true });

    await waitFor(() => {
      expect(mockGetCompliance).toHaveBeenCalledTimes(1);
    });
  });

  it('does not warn about state updates when unmounted during an in-flight call', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let resolveLookup: (value: unknown) => void = () => {};
    mockGetCompliance.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLookup = resolve;
      }),
    );

    const { unmount } = renderHook(() => useCompliance('GABC123'));

    expect(mockGetCompliance).toHaveBeenCalledTimes(1);

    // Unmount while the async lookup is still pending, then let it settle.
    unmount();
    resolveLookup({ compliant: true });

    // Flush pending microtasks so any post-unmount state update would fire.
    await Promise.resolve();
    await Promise.resolve();

    const stateUpdateWarnings = consoleErrorSpy.mock.calls.filter((args) =>
      args.some(
        (arg) =>
          typeof arg === 'string' &&
          /state update on an unmounted component|Can't perform a React state update/i.test(arg),
      ),
    );
    expect(stateUpdateWarnings).toHaveLength(0);
  });

  it('does not leak stale-network data when the network switches mid-session', async () => {
    // Simulate a testnet lookup that resolves after the user has already
    // switched to mainnet. The stale testnet result must not surface.
    let resolveTestnet: (value: unknown) => void = () => {};
    mockGetCompliance.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTestnet = resolve;
      }),
    );

    const { result, rerender } = renderHook(
      ({ address, network }: { address: string; network: string }) =>
        useCompliance(address, network),
      { initialProps: { address: 'GABC123', network: 'testnet' } },
    );

    expect(mockGetCompliance).toHaveBeenCalledTimes(1);

    // Switch network while the testnet lookup is still in flight.
    mockGetCompliance.mockResolvedValueOnce({ compliant: false });
    rerender({ address: 'GABC123', network: 'mainnet' });

    await waitFor(() => {
      expect(mockGetCompliance).toHaveBeenCalledTimes(2);
    });

    // Now let the stale testnet lookup settle; it must be ignored.
    resolveTestnet({ compliant: true });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // The mainnet result wins; the stale testnet result never leaks through.
    expect(result.current.compliance).toEqual({ compliant: false });
  });

  it('does not show cached testnet data after switching to mainnet', async () => {
    mockGetCompliance.mockResolvedValueOnce({ compliant: true });

    const { result, rerender } = renderHook(
      ({ address, network }: { address: string; network: string }) =>
        useCompliance(address, network),
      { initialProps: { address: 'GABC123', network: 'testnet' } },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.compliance).toEqual({ compliant: true });

    // Switch to mainnet; the new lookup is still pending.
    let resolveMainnet: (value: unknown) => void = () => {};
    mockGetCompliance.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveMainnet = resolve;
      }),
    );
    rerender({ address: 'GABC123', network: 'mainnet' });

    // While the mainnet lookup is in flight, stale testnet data must not be shown.
    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });
    expect(result.current.compliance).toBeNull();

    resolveMainnet({ compliant: false });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.compliance).toEqual({ compliant: false });
  });
});
