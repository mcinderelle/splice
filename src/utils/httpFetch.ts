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
  // Check if we're in Tauri environment
  if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
    // Dynamic import for Tauri fetch
    const { fetch } = await import('@tauri-apps/api/http');
    return await fetch(url, options);
  }
  
  // Browser fallback - use proxy to bypass CORS
  let proxyUrl = url;
  
  // Handle GraphQL API
  if (url.includes('surfaces-graphql.splice.com')) {
    proxyUrl = url.replace('https://surfaces-graphql.splice.com/graphql', '/graphql');
  }
  
  // Handle S3 audio files
  if (url.includes('spliceproduction.s3.us-west-1.amazonaws.com')) {
    const urlPath = url.substring(url.indexOf('/audio_samples'));
    proxyUrl = urlPath;
  }
  
  try {
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
      return {
        data: new Uint8Array(arrayBuffer)
      };
    }
    
    const data = await response.json();
    return {
      data: data
    };
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    throw error;
  }
}

