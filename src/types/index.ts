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
  // Festival (Holi) specific fields
  hindiTitle?: string;
  // Eid specific fields
  urduTitle?: string;
  // Shared festival fields
  englishSubtitle?: string;
  homeWishMessage?: string;
  congratsMessage?: string;
  // Wedding specific fields
  blessing?: string;
  brideDescription?: string;
  groomDescription?: string;
  // Reception specific fields
  tagline?: string;
  venueTimings?: string;
  // Love-GF / Birthday-GF specific fields
  personalMessage?: string;
  birthdayWish?: string;
  wishMessage?: string;
  photoLetters?: string[];
  quizQuestions?: Array<{ question: string; options: string[]; correct: number }>;
  truthQuestions?: string[];
  dareQuestions?: string[];
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
