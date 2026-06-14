import type { OpenRepoAgentProvider, OpenRepoAgentProviderPreset } from "./types.js";

export const DEFAULT_AGENT_PROVIDER: OpenRepoAgentProvider = "dashscope";

export const AGENT_PROVIDER_PRESETS: Record<OpenRepoAgentProvider, OpenRepoAgentProviderPreset> = {
  dashscope: {
    id: "dashscope",
    label: "DashScope / Alibaba Bailian",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "glm-5.1",
    apiKeyEnv: "DASHSCOPE_API_KEY",
  },
  zhipuai: {
    id: "zhipuai",
    label: "ZhipuAI",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-5.1",
    apiKeyEnv: "ZHIPUAI_API_KEY",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    apiKeyEnv: "OPENAI_API_KEY",
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    apiKeyEnv: "DEEPSEEK_API_KEY",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
    apiKeyEnv: "OPENROUTER_API_KEY",
  },
  custom: {
    id: "custom",
    label: "Custom OpenAI-compatible",
    baseUrl: "https://api.example.com/v1",
    model: "glm-5.1",
    apiKeyEnv: "OPENREPO_AGENT_API_KEY",
  },
};

export function providerPreset(provider: string | undefined): OpenRepoAgentProviderPreset {
  return AGENT_PROVIDER_PRESETS[isAgentProvider(provider) ? provider : DEFAULT_AGENT_PROVIDER];
}

export function isAgentProvider(value: unknown): value is OpenRepoAgentProvider {
  return typeof value === "string" && value in AGENT_PROVIDER_PRESETS;
}

export function agentProviderPresets(): OpenRepoAgentProviderPreset[] {
  return Object.values(AGENT_PROVIDER_PRESETS);
}
