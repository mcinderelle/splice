/**
 * Browser- and Tauri-compatible HTTP fetch wrapper.
 */

type ResponseTypeOption = 'Json' | 'Binary' | 'Text';

export interface HttpFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  responseType?: ResponseTypeOption;
  retries?: number;
  retryDelayMs?: number;
}

export interface HttpFetchJsonResult<T = unknown> { data: T }
export interface HttpFetchBinaryResult { data: Uint8Array }
export interface HttpFetchTextResult { data: string }
export type HttpFetchResult<T = unknown> = HttpFetchBinaryResult | HttpFetchJsonResult<T> | HttpFetchTextResult;

/**
 * Performs an HTTP request in both Tauri and browser environments.
 */
export async function httpFetch<T = unknown>(url: string, options: HttpFetchOptions = {}): Promise<HttpFetchResult<T>> {
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error('Invalid URL provided to httpFetch');
  }
  const maxRetries = options.retries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 300;

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const attemptOnce = async (): Promise<HttpFetchResult<T>> => {
    // Tauri v1 detection via global flag on window
    if (typeof window !== 'undefined' && '__TAURI__' in window) {
      const { fetch: tauriFetch, ResponseType } = await import('@tauri-apps/api/http');

      const rt = options.responseType === 'Binary'
        ? ResponseType.Binary
        : options.responseType === 'Text'
          ? ResponseType.Text
          : ResponseType.JSON;

      const response = await tauriFetch(url, {
        method: options.method ?? 'GET',
        headers: options.headers ?? {},
        body: options.body !== undefined ? { type: 'Json', payload: options.body } : undefined,
        responseType: rt,
      } as any);

      if (rt === ResponseType.Binary) {
        const raw = (response as any).data;
        if (raw instanceof Uint8Array) return { data: raw };
        if (raw instanceof ArrayBuffer) return { data: new Uint8Array(raw) };
        return { data: new Uint8Array(raw as ArrayLike<number>) };
      }

      if (rt === ResponseType.Text) {
        const rawData = (response as any).data;
        return { data: typeof rawData === 'string' ? rawData : String(rawData) };
      }

      // JSON
      const jsonData = (response as any).data as T;
      return { data: jsonData } as HttpFetchJsonResult<T>;
    }

    // Browser fallback with simple proxy mapping for known CORS hosts
    let proxyUrl = url;
    if (url.includes('surfaces-graphql.splice.com')) {
      proxyUrl = url.replace('https://surfaces-graphql.splice.com/graphql', '/graphql');
    }
    if (url.includes('spliceproduction.s3.us-west-1.amazonaws.com')) {
      const urlPath = url.substring(url.indexOf('/audio_samples'));
      proxyUrl = urlPath;
    }

    // Ensure JSON body and headers are aligned in browser
    const isJsonBody = options.body !== undefined;
    const headers = new Headers(options.headers ?? {});
    if (isJsonBody && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

    const response = await fetch(proxyUrl, {
      method: options.method ?? 'GET',
      headers,
      body: isJsonBody ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    if (options.responseType === 'Binary') {
      const arrayBuffer = await response.arrayBuffer();
      return { data: new Uint8Array(arrayBuffer) };
    }

    if (options.responseType === 'Text') {
      const text = await response.text();
      return { data: text };
    }

    // Default to JSON parsing
    const data = (await response.json()) as T;
    return { data } as HttpFetchJsonResult<T>;
  };

  let lastError: unknown = null;
  for (let attemptIndex = 0; attemptIndex <= maxRetries; attemptIndex++) {
    try {
      const result = await attemptOnce();
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('httpFetch:success', { detail: { url, attempt: attemptIndex + 1 } }));
        }
      } catch {}
      return result;
    } catch (err) {
      lastError = err;
      if (attemptIndex < maxRetries) {
        try {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('httpFetch:retry', { detail: { url, attempt: attemptIndex + 1, error: String(err) } }));
          }
        } catch {}
        await delay(retryDelayMs * (attemptIndex + 1));
        continue;
      }
    }
  }

  // Exhausted retries
  // eslint-disable-next-line no-console
  console.error(`Error fetching ${url}:`, lastError);
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('httpFetch:error', { detail: { url, error: String(lastError) } }));
    }
  } catch {}
  throw lastError as Error;
}

