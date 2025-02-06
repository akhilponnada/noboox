interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
    type?: string;
  };
}

export interface OpenRouterOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export class OpenRouterAI {
  private apiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generate(prompt: string, options: OpenRouterOptions = {}): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://noboox.vercel.app',
          'X-Title': 'Noboox'
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-r1:free',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: options.maxTokens ?? 1000,
          temperature: options.temperature ?? 0.7,
          top_p: options.topP ?? 1,
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
        throw new Error(`OpenRouter API error (${response.status}): ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      if (!data?.choices?.[0]?.message?.content) {
        throw new Error('Invalid response format from OpenRouter API');
      }

      return data.choices[0].message.content;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to generate content: ${error.message}`);
      }
      throw error;
    }
  }
} 