export type ModelType = 
  | 'gemini-1.5-pro'
  | 'gemini-2.0-flash'
  | 'o3-mini'
  | 'deepseek-r1';

export type ResearchDepth = 'low' | 'high';

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