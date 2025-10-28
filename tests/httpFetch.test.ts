import { describe, it, expect, vi, beforeEach } from 'vitest';
import { httpFetch } from '../src/utils/httpFetch';

describe('httpFetch (browser)', () => {
  beforeEach(() => {
    // Remove Tauri flag
    // @ts-expect-error
    delete (window as any).__TAURI__;
  });

  it('should fetch JSON and return parsed data', async () => {
    const mockJson = { ok: true };
    // @ts-expect-error
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockJson) });
    const resp = await httpFetch('/graphql', { method: 'POST' });
    expect(resp.data).toEqual(mockJson);
  });

  it('should retry on error and eventually fail', async () => {
    // @ts-expect-error
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(httpFetch('/graphql', { method: 'POST', retries: 1, retryDelayMs: 1 })).rejects.toThrow();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});


