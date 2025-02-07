import { z } from 'zod';

interface FirecrawlResponse {
  success: boolean;
  data: {
    markdown?: string;
    html?: string;
    metadata: {
      title?: string;
      description?: string;
      sourceURL: string;
      statusCode: number;
    };
  };
}

export class FirecrawlClient {
  private apiKey: string;
  private baseUrl = 'https://api.firecrawl.dev/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(query: string, options: { timeout?: number; limit?: number } = {}): Promise<FirecrawlResponse> {
    const response = await fetch(`${this.baseUrl}/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        formats: ['markdown', 'html'],
        scrapeOptions: {
          minContentLength: 500,
          maxContentLength: 100000,
          removeBoilerplate: true,
          removeAds: true,
          removeNavigation: true
        },
        actions: [
          { type: 'wait', milliseconds: 2000 }, // Wait for page to load
          { type: 'screenshot' } // Optional: capture the search results
        ]
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Firecrawl API error: ${error.message || response.statusText}`);
    }

    return response.json();
  }
} 