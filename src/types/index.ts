export interface TemplateData {
  heading: string;
  body: string;
  senderName: string;
}

export interface GenerateRequest {
  prompt: string;
  templateId: string;
  templateType: string;
}

export interface GenerateResponse {
  heading: string;
  body: string;
  senderName: string;
}

export interface TemplateInput {
  slug: string;
  type: string;
  category: string;
  title: string;
  description: string;
  emoji: string;
  color: string;
  previewText: string;
  bodyText: string;
  bgGradient: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
