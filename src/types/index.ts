export type ModelType = 'gemini-2.0-flash';

export interface Source {
  title: string;
  url: string;
  favicon?: string;
  snippet?: string;
}

export interface ResearchMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
} 