interface KlusterAIResponse {
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

export interface KlusterAIOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export class KlusterAI {
  private apiKey: string;
  private baseUrl = 'https://api.kluster.ai/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generate(prompt: string, options: KlusterAIOptions = {}): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-ai/DeepSeek-R1',
          messages: [{ role: 'user', content: prompt }],
          max_completion_tokens: options.maxTokens ?? 1000,
          temperature: options.temperature ?? 0.7,
          top_p: options.topP ?? 1,
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
        throw new Error(`Kluster AI API error (${response.status}): ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      if (!data?.choices?.[0]?.message?.content) {
        throw new Error('Invalid response format from Kluster AI API');
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