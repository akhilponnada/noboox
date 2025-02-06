interface DeepseekResponse {
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

interface DeepseekApiError {
  error?: {
    message?: string;
    type?: string;
  };
}

export interface DeepseekOptions {
  temperature?: number;
  maxTokens?: number;
}

export class DeepseekAI {
  private apiKey: string;
  private baseUrl = 'https://api.deepseek.com/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generate(prompt: string, options: DeepseekOptions = {}): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 second timeout

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-reasoner',
          messages: [{ role: 'user', content: prompt }],
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 4000,
          top_p: 0.95,
          frequency_penalty: 0.1,
          presence_penalty: 0.1,
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Check if the response is empty
      if (!response.body) {
        throw new Error('Empty response received from DeepSeek API');
      }

      let data: DeepseekResponse;
      try {
        const rawText = await response.text();
        
        // Check if we got an empty response
        if (!rawText.trim()) {
          throw new Error('Empty response text received from DeepSeek API');
        }

        try {
          data = JSON.parse(rawText) as DeepseekResponse;
        } catch {
          // If JSON parsing fails, include the raw text in the error for debugging
          throw new Error(`JSON Parse Error. Status: ${response.status}. Raw response: ${rawText.slice(0, 200)}...`);
        }
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to process DeepSeek response: ${error.message}`);
        }
        throw error;
      }

      if (!response.ok) {
        const errorMessage = data?.error?.message || response.statusText;
        if (errorMessage.includes('Content Exists Risk')) {
          throw new Error('Content flagged for safety reasons. Please try rephrasing your request.');
        }
        throw new Error(`DeepSeek API error (${response.status}): ${errorMessage}`);
      }

      if (!data?.choices?.[0]?.message?.content) {
        throw new Error(`Invalid response format from DeepSeek API. Response status: ${response.status}`);
      }

      return data.choices[0].message.content;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('DeepSeek API request timed out after 45 seconds. Please try again.');
        }
        if (error.message.includes('Failed to fetch')) {
          throw new Error('Failed to connect to DeepSeek API. Please check your internet connection.');
        }
        throw error;
      }
      throw new Error('Unknown error occurred while calling DeepSeek API');
    }
  }
} 