import { Injectable, Logger } from '@nestjs/common';

interface ChatMessage {
  role: string;
  content: string;
}

interface ChatCompletionOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  systemPrompt?: string;
}

interface ImageGenerationOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  size?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

@Injectable()
export class OpenRouterService {
  private readonly logger = new Logger(OpenRouterService.name);

  async chatCompletion(options: ChatCompletionOptions): Promise<string> {
    const endpoint = `${this.normalizeBaseUrl(options.baseUrl)}/chat/completions`;
    const messages = this.withSystemPrompt(options.messages, options.systemPrompt);

    const body: Record<string, unknown> = {
      model: options.model,
      messages
    };
    if (typeof options.maxTokens === 'number') {
      body.max_tokens = options.maxTokens;
    }

    const payload = await this.requestWithRetry({
      endpoint,
      apiKey: options.apiKey,
      body
    });
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const firstChoice = asRecord(choices[0]);
    const message = asRecord(firstChoice.message);
    const content = message.content;

    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      const chunks = content
        .map((item) => asRecord(item))
        .map((item) => asString(item.text))
        .filter((text) => text.length > 0);
      if (chunks.length > 0) {
        return chunks.join('\n');
      }
    }

    throw new Error('OpenRouter chat completion returned empty content');
  }

  async generateImage(options: ImageGenerationOptions): Promise<string> {
    const endpoint = `${this.normalizeBaseUrl(options.baseUrl)}/images/generations`;
    const payload = await this.requestWithRetry({
      endpoint,
      apiKey: options.apiKey,
      body: {
        model: options.model,
        prompt: options.prompt,
        n: 1,
        size: options.size ?? '1024x1024',
        response_format: 'b64_json'
      }
    });

    const rows = Array.isArray(payload.data) ? payload.data : [];
    const firstRow = asRecord(rows[0]);
    const imageBase64 = asString(firstRow.b64_json);
    if (!imageBase64) {
      throw new Error('OpenRouter image generation returned empty b64_json');
    }
    return imageBase64;
  }

  private normalizeBaseUrl(url: string): string {
    return url.replace(/\/+$/, '');
  }

  private withSystemPrompt(messages: ChatMessage[], systemPrompt?: string): ChatMessage[] {
    if (!systemPrompt || !systemPrompt.trim()) {
      return messages;
    }
    return [{ role: 'system', content: systemPrompt }, ...messages];
  }

  private async requestWithRetry(options: {
    endpoint: string;
    apiKey: string;
    body: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= 1; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(options.endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(options.body)
        });
      } catch (networkError) {
        // 网络错误 — 可重试
        lastError = networkError instanceof Error ? networkError : new Error(String(networkError));
        if (attempt === 0) {
          this.logger.warn('OpenRouter network error, retrying once after 2s');
          await this.sleep(2000);
          continue;
        }
        break;
      }

      if (!response.ok) {
        const text = await response.text();
        const isRetriable = response.status === 429 || response.status >= 500;
        if (isRetriable && attempt === 0) {
          this.logger.warn(
            `OpenRouter request failed (${response.status}), retrying once after 2s`
          );
          await this.sleep(2000);
          continue;
        }
        // 不可重试的 HTTP 错误 (400/401/403 等) — 直接抛出，不重试
        throw new Error(`OpenRouter request failed (${response.status}): ${text}`);
      }

      const data = (await response.json()) as unknown;
      return asRecord(data);
    }

    throw lastError ?? new Error('OpenRouter request failed');
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

