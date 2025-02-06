interface BingSearchOptions {
  count?: number
  offset?: number
  freshness?: 'Day' | 'Week' | 'Month' | 'Year'
  responseFilter?: string[]
}

interface BingSearchResponse {
  webPages?: {
    value: Array<{
      name: string
      url: string
      snippet: string
    }>
  }
}

export class BingSearchClient {
  private baseUrl = 'https://api.bing.microsoft.com/v7.0/search'
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async search(query: string, options: BingSearchOptions = {}): Promise<BingSearchResponse> {
    const params = new URLSearchParams({
      q: query,
      count: (options.count || 10).toString(),
      offset: (options.offset || 0).toString(),
      responseFilter: (options.responseFilter || []).join(','),
      freshness: options.freshness || 'Year',
    })

    const response = await fetch(`${this.baseUrl}?${params}`, {
      headers: {
        'Ocp-Apim-Subscription-Key': this.apiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`Bing Search API error: ${response.statusText}`)
    }

    return response.json()
  }
} 