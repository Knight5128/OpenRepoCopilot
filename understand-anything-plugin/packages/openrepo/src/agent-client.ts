import fs from "node:fs";
import { agentEnvFile } from "./paths.js";
import type { OpenRepoAgentSettings } from "./types.js";

export interface AgentCredentialLookup {
  apiKey?: string;
  apiKeyFilePath: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export class OpenAICompatibleAgentClient {
  constructor(private readonly settings: OpenRepoAgentSettings, private readonly apiKey: string) {}

  async createChatCompletion(options: ChatCompletionOptions): Promise<string> {
    const response = await fetch(chatCompletionsUrl(this.settings.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.settings.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens,
        stream: false,
      }),
      signal: options.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Agent API request failed (${response.status}): ${safeErrorText(text)}`);
    }

    const payload = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("Agent API response did not include choices[0].message.content.");
    }
    return content;
  }

  async testConnection(): Promise<void> {
    await this.createChatCompletion({
      messages: [
        { role: "system", content: "You are a connectivity test for OpenRepoCopilot." },
        { role: "user", content: "Reply with OK." },
      ],
      temperature: 0,
      maxTokens: 16,
    });
  }
}

export function readAgentCredential(settings: OpenRepoAgentSettings, home: string, env: NodeJS.ProcessEnv = process.env): AgentCredentialLookup {
  const apiKeyFilePath = agentEnvFile(home);
  const envValue = env[settings.apiKeyEnv];
  if (envValue) return { apiKey: envValue, apiKeyFilePath };

  const fileValues = readAgentEnvFile(apiKeyFilePath);
  return {
    apiKey: fileValues[settings.apiKeyEnv],
    apiKeyFilePath,
  };
}

export function createAgentClient(settings: OpenRepoAgentSettings, home: string): OpenAICompatibleAgentClient {
  const credential = readAgentCredential(settings, home);
  if (!credential.apiKey) {
    throw new Error(`Missing ${settings.apiKeyEnv}. Set it in the environment or ${credential.apiKeyFilePath}.`);
  }
  return new OpenAICompatibleAgentClient(settings, credential.apiKey);
}

export function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("Agent API base URL is required.");
  return `${trimmed}/chat/completions`;
}

function readAgentEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const values: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const normalized = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
    const equalsIndex = normalized.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = normalized.slice(0, equalsIndex).trim();
    const rawValue = normalized.slice(equalsIndex + 1).trim();
    values[key] = unquoteEnvValue(rawValue);
  }
  return values;
}

function unquoteEnvValue(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function safeErrorText(text: string): string {
  if (!text) return "empty response";
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}
