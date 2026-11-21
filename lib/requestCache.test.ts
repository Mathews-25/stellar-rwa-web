import { renderHook, act } from '@testing-library/react';
import { useRequestCache } from './requestCache';

describe('requestCache', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.useRealTimers();
  });

  it('does not warn about state updates when unmounted during an in-flight async call', async () => {
    let resolveRequest: (value: string) => void = () => {};
    const pending = new Promise<string>((resolve) => {
      resolveRequest = resolve;
    });

    const { result, unmount } = renderHook(() =>
      useRequestCache<string>('unmount-during-flight', () => pending),
    );

    // Kick off the async call so it is in-flight.
    act(() => {
      void result.current.run();
    });

    // Unmount while the request is still pending.
    unmount();

    // Resolve the in-flight call after unmount.
    await act(async () => {
      resolveRequest('done');
      await pending;
    });

    const stateUpdateWarnings = consoleErrorSpy.mock.calls.filter((call) =>
      String(call[0]).includes('unmounted component'),
    );
    expect(stateUpdateWarnings).toHaveLength(0);
  });

  it('does not return cached data from a previous network after switching networks', async () => {
    const fetcher = jest.fn(async (network: string) => `data-${network}`);

    const { result, rerender } = renderHook(
      ({ network }: { network: string }) =>
        useRequestCache<string>(`network-data-${network}`, () => fetcher(network)),
      { initialProps: { network: 'testnet' } },
    );

    // Populate the cache for the testnet network.
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.data).toBe('data-testnet');

    // Switch the selected network mid-session.
    rerender({ network: 'mainnet' });

    // Stale testnet data must not be shown after the switch.
    expect(result.current.data).not.toBe('data-testnet');

    // Running on the new network fetches fresh mainnet data.
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.data).toBe('data-mainnet');
  });

  it('does not leak an in-flight result from the previous network after switching networks', async () => {
    let resolveTestnet: (value: string) => void = () => {};
    const testnetPending = new Promise<string>((resolve) => {
      resolveTestnet = resolve;
    });

    const fetcher = jest.fn((network: string) =>
      network === 'testnet' ? testnetPending : Promise.resolve('data-mainnet'),
    );

    const { result, rerender } = renderHook(
      ({ network }: { network: string }) =>
        useRequestCache<string>(`network-flight-${network}`, () => fetcher(network)),
      { initialProps: { network: 'testnet' } },
    );

    // Start a request on testnet so it is in-flight.
    act(() => {
      void result.current.run();
    });

    // Switch the selected network while the testnet request is still pending.
    rerender({ network: 'mainnet' });

    // Resolve the stale testnet request after the switch.
    await act(async () => {
      resolveTestnet('data-testnet');
      await testnetPending;
    });

    // The stale testnet result must not leak into the UI.
    expect(result.current.data).not.toBe('data-testnet');

    // Running on the new network fetches fresh mainnet data.
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.data).toBe('data-mainnet');
  });
});
