/**
 * Browser-compatible fetch wrapper that works in both Tauri and browser environments
 */

/**
 * Performs an HTTP fetch request, compatible with both Tauri and browser environments
 * @param url - The URL to fetch
 * @param options - Fetch options (method, headers, body, responseType)
 * @returns Promise containing the response data
 */
export async function httpFetch(url: string, options: any): Promise<any> {
  const maxRetries = options?.retries ?? 2;
  const retryDelayMs = options?.retryDelayMs ?? 300;

  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  const attemptOnce = async () => {
    // Check if we're in Tauri environment (Tauri v1 detection)
    if (typeof window !== 'undefined' && '__TAURI__' in window) {
      // Use Tauri v1 HTTP client
      const { fetch: tauriFetch } = await import('@tauri-apps/api/http');
      
      const response = await tauriFetch(url, {
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body ? {
          type: 'Json',
          payload: options.body
        } : undefined,
        responseType: options.responseType === 'Binary' ? 2 : 1 // 1 = Text, 2 = Binary
      });
      
      if (options.responseType === 'Binary') {
        let binaryData: Uint8Array;
        if (response.data instanceof Uint8Array) {
          binaryData = response.data;
        } else if (response.data instanceof ArrayBuffer) {
          binaryData = new Uint8Array(response.data);
        } else {
          binaryData = new Uint8Array(response.data as ArrayLike<number>);
        }
        return { data: binaryData };
      }
      
      const parsedData = typeof response.data === 'string'
        ? JSON.parse(response.data)
        : response.data;
      return { data: parsedData };
    }
    
    // Browser fallback - use proxy to bypass CORS
    let proxyUrl = url;
    if (url.includes('surfaces-graphql.splice.com')) {
      proxyUrl = url.replace('https://surfaces-graphql.splice.com/graphql', '/graphql');
    }
    if (url.includes('spliceproduction.s3.us-west-1.amazonaws.com')) {
      const urlPath = url.substring(url.indexOf('/audio_samples'));
      proxyUrl = urlPath;
    }
    
    const response = await fetch(proxyUrl, {
      method: options.method || 'GET',
      headers: options.headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    if (options.responseType === 'Binary') {
      const arrayBuffer = await response.arrayBuffer();
      return { data: new Uint8Array(arrayBuffer) };
    }
    const data = await response.json();
    return { data };
  };

  let lastError: any = null;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const result = await attemptOnce();
      // Dispatch success event
      try {
        window.dispatchEvent(new CustomEvent('httpFetch:success', {
          detail: { url, attempt: i + 1 }
        }));
      } catch {}
      return result;
    } catch (err) {
      lastError = err;
      if (i < maxRetries) {
        // Dispatch retry event
        try {
          window.dispatchEvent(new CustomEvent('httpFetch:retry', {
            detail: { url, attempt: i + 1, error: String(err) }
          }));
        } catch {}
        await delay(retryDelayMs * (i + 1));
        continue;
      }
    }
  }
  console.error(`Error fetching ${url}:`, lastError);
  try {
    window.dispatchEvent(new CustomEvent('httpFetch:error', {
      detail: { url, error: String(lastError) }
    }));
  } catch {}
  throw lastError;
}

