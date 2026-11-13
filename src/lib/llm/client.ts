import OpenAI from "openai";
import type { Provider } from "./config";

export type Usage = { prompt_tokens?: number | null; completion_tokens?: number | null } | null;
export type CompletionResult = {
  choices?: Array<{ message?: { content?: string | null; reasoning_content?: string | null } }>;
  usage?: Usage;
};
export type StreamChunk = {
  choices?: Array<{ delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null } }>;
  usage?: Usage;
};

/** The slice of the OpenAI client the gateway uses. Tests inject a fake with this shape. */
export interface ChatClient {
  chat: {
    completions: {
      create(
        body: Record<string, unknown>,
        options?: { signal?: AbortSignal },
      ): Promise<CompletionResult | AsyncIterable<StreamChunk>>;
    };
  };
}

export type ClientFactory = (provider: Provider) => ChatClient;

/** A real OpenAI-compatible client for a provider. Retries are the gateway's job, so none here. */
export function createRawClient(p: Provider): ChatClient {
  return new OpenAI({ apiKey: p.apiKey, baseURL: p.baseURL, maxRetries: 0 }) as unknown as ChatClient;
}

const realFactory: ClientFactory = createRawClient;

let factory: ClientFactory = realFactory;
const cache = new Map<string, ChatClient>();

/** Replace how clients are built (tests). `null` restores the real OpenAI client. */
export function setClientFactory(f: ClientFactory | null): void {
  factory = f ?? realFactory;
  cache.clear();
}

export function getClient(p: Provider): ChatClient {
  const key = `${p.name}|${p.baseURL}|${p.apiKey}`;
  let c = cache.get(key);
  if (!c) cache.set(key, (c = factory(p)));
  return c;
}
