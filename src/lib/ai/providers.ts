import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type AiProvider = "anthropic" | "openai" | "google" | "replicate";

export type TextGenerationRequest = {
  model: string;
  prompt: string;
  instructions?: string;
  maxOutputTokens?: number;
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
  size?: "1536x1024" | "1024x1536" | "1024x1024";
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

export class UnsupportedProviderError extends Error {
  constructor(provider: AiProvider) {
    super(`${provider} provider is not implemented`);
    this.name = "UnsupportedProviderError";
  }
}

export class EmptyProviderResponseError extends Error {
  constructor(provider: AiProvider) {
    super(`${provider} returned an empty response`);
    this.name = "EmptyProviderResponseError";
  }
}

export class ImageGenerationNotSupportedError extends Error {
  constructor(provider: AiProvider) {
    super(`${provider} does not support image generation in this engine`);
    this.name = "ImageGenerationNotSupportedError";
  }
}

const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 8_000;

export class AnthropicProvider implements ContentAiProvider {
  provider: AiProvider = "anthropic";

  isConfigured() {
    return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  }

  async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError(this.provider);

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxRetries: 2,
    });
    const response = await client.messages.create({
      model: request.model,
      max_tokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      ...(request.instructions ? { system: request.instructions } : {}),
      messages: [{ role: "user", content: request.prompt }],
    });
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!text) throw new EmptyProviderResponseError(this.provider);

    return {
      text,
      model: response.model,
      provider: this.provider,
      tokensIn: response.usage.input_tokens,
      tokensOut: response.usage.output_tokens,
    };
  }

  async generateImage(): Promise<ImageGenerationResult> {
    throw new ImageGenerationNotSupportedError(this.provider);
  }
}

export class OpenAiProvider implements ContentAiProvider {
  provider: AiProvider = "openai";

  isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY?.trim());
  }

  async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError(this.provider);

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxRetries: 2,
    });
    const response = await client.responses.create({
      model: request.model,
      input: request.prompt,
      ...(request.instructions ? { instructions: request.instructions } : {}),
      max_output_tokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    });
    const text = response.output_text.trim();

    if (!text) throw new EmptyProviderResponseError(this.provider);

    return {
      text,
      model: response.model,
      provider: this.provider,
      tokensIn: response.usage?.input_tokens,
      tokensOut: response.usage?.output_tokens,
    };
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError(this.provider);

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxRetries: 2,
    });
    const response = await client.images.generate({
      model: request.model,
      prompt: request.prompt,
      size: request.size ?? "1536x1024",
    });
    const image = response.data?.[0];
    const imageUrl = image?.url ?? (image?.b64_json ? `data:image/png;base64,${image.b64_json}` : "");

    if (!imageUrl) throw new EmptyProviderResponseError(this.provider);

    return {
      imageUrl,
      model: request.model,
      provider: this.provider,
    };
  }
}

export function getProvider(provider: AiProvider): ContentAiProvider {
  if (provider === "anthropic") return new AnthropicProvider();
  if (provider === "openai") return new OpenAiProvider();
  throw new UnsupportedProviderError(provider);
}
