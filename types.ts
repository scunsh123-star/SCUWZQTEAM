export enum AppMode {
  CHAT = 'CHAT',
  IMAGES = 'IMAGES',
  VIDEO = 'VIDEO',
  LIVE = 'LIVE',
  AUDIO = 'AUDIO'
}

export enum ChatModelType {
  FAST = 'gemini-2.5-flash-lite',
  STANDARD = 'gemini-2.5-flash',
  SMART = 'gemini-3-pro-preview',
  THINKING = 'gemini-3-pro-preview-thinking', // Internal flag
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  images?: string[];
  grounding?: {
    search?: { uri: string; title: string }[];
    maps?: { uri: string; title: string }[];
  };
  thinking?: boolean;
}

export interface ImageGenerationConfig {
  aspectRatio: string;
  size?: '1K' | '2K' | '4K';
  count: number;
}