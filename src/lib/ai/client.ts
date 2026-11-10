/**
 * NEAR AI Cloud client (OpenAI-compatible).
 *
 * Deliberately a small hand-written client rather than an SDK: the surface we use is one
 * endpoint, and every request/response shape is validated here so a provider change fails loudly
 * instead of producing a plausible-looking wrong answer.
 *
 * Attestation and message-signature verification are documented in
 * `.agents/skills/near-ai-cloud/` and intentionally not implemented: this product does not claim
 * verifiable inference, so it does not pretend to verify it.
 */

export type ChatRole = "system" | "user" | "assistant" | "tool";

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ChatCompletion = {
  id: string;
  model: string;
  message: { role: "assistant"; content: string | null; tool_calls?: ToolCall[] };
  finishReason: string | null;
  usage: { promptTokens: number | null; completionTokens: number | null } | null;
};

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export class AiResponseError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, status: number, retryable = false) {
    super(message);
    this.name = "AiResponseError";
    this.status = status;
    this.retryable = retryable;
  }
}

export type NearAiClientOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

const DEFAULT_TIMEOUT_MS = 45_000;

export class NearAiClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: NearAiClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.NEARAI_API_KEY ?? undefined;
    this.baseUrl = (options.baseUrl ?? process.env.NEAR_AI_BASE_URL ?? "https://cloud-api.near.ai/v1").replace(/\/+$/, "");
    this.model = options.model ?? process.env.NEAR_AI_MODEL ?? "z-ai/glm-5.3-flash";
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get modelId(): string {
    return this.model;
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(input: {
    messages: ChatMessage[];
    tools?: ToolDefinition[];
    responseFormat?: "text" | "json_object";
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<ChatCompletion> {
    if (!this.apiKey) {
      throw new AiUnavailableError(
        "NEARAI_API_KEY is not set. The deterministic planner will be used instead.",
      );
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages: input.messages,
      temperature: input.temperature ?? 0.2,
      max_tokens: input.maxTokens ?? 2_000,
    };
    if (input.tools?.length) {
      body.tools = input.tools;
      body.tool_choice = "auto";
    }
    if (input.responseFormat === "json_object") {
      body.response_format = { type: "json_object" };
    }

    const payload = await this.request(body, input.signal);
    return parseCompletion(payload);
  }

  private async request(body: unknown, outerSignal?: AbortSignal, attempt = 0): Promise<unknown> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = outerSignal ? AbortSignal.any([timeout, outerSignal]) : timeout;

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (cause) {
      if (attempt === 0 && !outerSignal?.aborted) return this.request(body, outerSignal, 1);
      throw new AiResponseError(
        `NEAR AI request failed: ${cause instanceof Error ? cause.message : "network error"}`,
        0,
        true,
      );
    }

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }

    if (!response.ok) {
      const message =
        (parsed as { error?: { message?: string } } | undefined)?.error?.message ??
        `NEAR AI returned HTTP ${response.status}`;
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt === 0) return this.request(body, outerSignal, 1);
      throw new AiResponseError(message, response.status, retryable);
    }

    return parsed;
  }
}

function parseCompletion(payload: unknown): ChatCompletion {
  const record = payload as
    | {
        id?: unknown;
        model?: unknown;
        choices?: Array<{
          message?: { role?: unknown; content?: unknown; tool_calls?: unknown };
          finish_reason?: unknown;
        }>;
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
      }
    | undefined;

  const choice = record?.choices?.[0];
  const message = choice?.message;
  if (!message) {
    throw new AiResponseError("NEAR AI response contained no choices", 502);
  }

  const content = typeof message.content === "string" ? message.content : null;

  const rawCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const toolCalls: ToolCall[] = rawCalls.flatMap((call) => {
    const c = call as {
      id?: unknown;
      type?: unknown;
      function?: { name?: unknown; arguments?: unknown };
    };
    if (typeof c?.id !== "string" || typeof c?.function?.name !== "string") return [];
    return [
      {
        id: c.id,
        type: "function" as const,
        function: {
          name: c.function.name,
          arguments:
            typeof c.function.arguments === "string" ? c.function.arguments : "{}",
        },
      },
    ];
  });

  if (content === null && toolCalls.length === 0) {
    throw new AiResponseError("NEAR AI response had neither content nor tool calls", 502);
  }

  return {
    id: typeof record?.id === "string" ? record.id : "unknown",
    model: typeof record?.model === "string" ? record.model : "unknown",
    message: {
      role: "assistant",
      content,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    },
    finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : null,
    usage: record?.usage
      ? {
          promptTokens:
            typeof record.usage.prompt_tokens === "number" ? record.usage.prompt_tokens : null,
          completionTokens:
            typeof record.usage.completion_tokens === "number"
              ? record.usage.completion_tokens
              : null,
        }
      : null,
  };
}
