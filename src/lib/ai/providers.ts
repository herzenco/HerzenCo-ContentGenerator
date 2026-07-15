export type AiProvider = "anthropic" | "openai" | "google" | "replicate";

export type TextGenerationRequest = {
  model: string;
  prompt: string;
  timeoutMs?: number;
};

export type TextGenerationResult = {
  text: string;
  model: string;
  provider: AiProvider;
  tokensIn?: number;
  tokensOut?: number;
};

export type ImageGenerationRequest = {
  model: string;
  prompt: string;
  size?: "1792x1024" | "1536x864" | "1024x1024";
  timeoutMs?: number;
};

export type ImageGenerationResult = {
  imageUrl: string;
  model: string;
  provider: AiProvider;
  cost?: number;
};

export interface ContentAiProvider {
  provider: AiProvider;
  isConfigured(): boolean;
  generateText(request: TextGenerationRequest): Promise<TextGenerationResult>;
  generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(provider: AiProvider) {
    super(`${provider} provider is missing its API key`);
    this.name = "ProviderNotConfiguredError";
  }
}

export class ImageGenerationNotSupportedError extends Error {
  constructor(provider: AiProvider) {
    super(`${provider} does not support image generation in this engine`);
    this.name = "ImageGenerationNotSupportedError";
  }
}

export class AnthropicProvider implements ContentAiProvider {
  provider: AiProvider = "anthropic";

  isConfigured() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  async generateText(request: TextGenerationRequest) {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError(this.provider);
    return {
      text: "",
      model: request.model,
      provider: this.provider,
    };
  }

  async generateImage(): Promise<ImageGenerationResult> {
    throw new ImageGenerationNotSupportedError(this.provider);
  }
}

export class OpenAiProvider implements ContentAiProvider {
  provider: AiProvider = "openai";

  isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  async generateText(request: TextGenerationRequest) {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError(this.provider);
    return {
      text: "",
      model: request.model,
      provider: this.provider,
    };
  }

  async generateImage(request: ImageGenerationRequest) {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError(this.provider);
    return {
      imageUrl: "",
      model: request.model,
      provider: this.provider,
    };
  }
}

export function getProvider(provider: AiProvider): ContentAiProvider {
  if (provider === "openai") return new OpenAiProvider();
  return new AnthropicProvider();
}
