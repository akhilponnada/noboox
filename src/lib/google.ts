interface GoogleSearchOptions {
  num?: number;
  start?: number;
  dateRestrict?: string;
}

interface GoogleSearchResponse {
  items?: Array<{
    title: string;
    link: string;
    snippet: string;
    pagemap?: {
      metatags?: Array<{
        'og:title'?: string;
        'og:description'?: string;
      }>;
    };
  }>;
}

export class GoogleSearchClient {
  private baseUrl = 'https://customsearch.googleapis.com/customsearch/v1';
  private apiKey: string;
  private cx: string;

  constructor(apiKey: string, cx: string) {
    this.apiKey = apiKey;
    this.cx = cx;
  }

  private async searchPage(query: string, options: GoogleSearchOptions = {}): Promise<GoogleSearchResponse> {
    const params = new URLSearchParams({
      key: this.apiKey,
      cx: this.cx,
      q: query,
      num: Math.min(options.num || 10, 10).toString(), // Ensure we don't exceed Google's limit of 10
      start: (options.start || 1).toString(),
      ...(options.dateRestrict ? { dateRestrict: options.dateRestrict } : {}),
    });

    const response = await fetch(`${this.baseUrl}?${params}`);

    if (!response.ok) {
      throw new Error(`Google Search API error: ${response.statusText}`);
    }

    return response.json();
  }

  async search(query: string, options: GoogleSearchOptions = {}): Promise<GoogleSearchResponse> {
    const desiredResults = options.num || 10;
    const maxPages = Math.ceil(Math.min(desiredResults, 100) / 10); // Limit to 100 total results
    const allItems: GoogleSearchResponse['items'] = [];

    for (let page = 0; page < maxPages; page++) {
      try {
        const pageResponse = await this.searchPage(query, {
          ...options,
          num: 10,
          start: page * 10 + 1,
        });

        if (pageResponse.items) {
          allItems.push(...pageResponse.items);
        }

        // If we got fewer items than requested, we've reached the end
        if (!pageResponse.items || pageResponse.items.length < 10) {
          break;
        }

        // Add a small delay between requests to respect rate limits
        if (page < maxPages - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (error) {
        console.error(`Error fetching page ${page + 1}:`, error);
        break;
      }
    }

    return { items: allItems.slice(0, desiredResults) };
  }
} 