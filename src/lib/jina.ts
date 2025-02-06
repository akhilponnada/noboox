interface JinaExtractResponse {
  text?: string
  title?: string
  error?: string
}

export class JinaClient {
  private baseUrl = 'https://api.jina.ai/v1/extract'
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async extract(url: string): Promise<JinaExtractResponse> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ url }),
      })

      if (!response.ok) {
        throw new Error(`JinaAI API error: ${response.statusText}`)
      }

      return response.json()
    } catch (error) {
      console.error('JinaAI extraction error:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }
} 