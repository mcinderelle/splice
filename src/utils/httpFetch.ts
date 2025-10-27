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
    // Use Tauri's HTTP client
    const { getClient } = await import('@tauri-apps/api/http');
    
    try {
      const client = await getClient({
        maxRedirections: 5
      });
      
      const response = await client.request<any>({
        url: url,
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body ? {
          type: 'Json',
          payload: options.body
        } : undefined,
        responseType: options.responseType === 'Binary' ? 0 as any : 1 as any // 0 = Binary, 1 = Text/JSON
      });
      
      // Handle binary response
      if (options.responseType === 'Binary') {
        return {
          data: response.data
        };
      }
      
      // Parse the text response as JSON
      const parsedData = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      
      return {
        data: parsedData
      };
    } catch (error) {
      console.error(`Tauri HTTP error for ${url}:`, error);
      throw error;
    }
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

