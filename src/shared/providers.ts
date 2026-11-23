export const PROVIDER_PROTOCOLS = ['openai-compatible', 'ollama'] as const;
export type ProviderProtocol = (typeof PROVIDER_PROTOCOLS)[number];

export type ProviderCredentialState = 'configured' | 'missing' | 'error';

export interface ProviderPreset {
  id: string;
  label: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  modelIds: string[];
  requiresApiKey: boolean;
  note: string;
}

/**
 * Presets only prefill the form. The stored provider is fully user-editable,
 * so no vendor is hardcoded as the only option.
 */
export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    modelIds: ['gpt-4o-mini', 'gpt-4o'],
    requiresApiKey: true,
    note: 'OpenAI-compatible chat completions endpoint.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    protocol: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelIds: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet'],
    requiresApiKey: true,
    note: 'Aggregated access to many providers through one API key.',
  },
  {
    id: 'groq',
    label: 'Groq',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    modelIds: ['llama-3.3-70b-versatile'],
    requiresApiKey: true,
    note: 'Fast OpenAI-compatible inference.',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    modelIds: ['deepseek-chat', 'deepseek-reasoner'],
    requiresApiKey: true,
    note: 'DeepSeek chat and reasoning models.',
  },
  {
    id: 'gemini',
    label: 'Google Gemini (OpenAI-compatible)',
    protocol: 'openai-compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    modelIds: ['gemini-2.0-flash'],
    requiresApiKey: true,
    note: 'Gemini through its OpenAI-compatible endpoint.',
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    protocol: 'ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    modelIds: ['llama3.2'],
    requiresApiKey: false,
    note: 'Local models; no API key required.',
  },
  {
    id: 'custom',
    label: 'Custom OpenAI-compatible endpoint',
    protocol: 'openai-compatible',
    baseUrl: '',
    modelIds: [],
    requiresApiKey: true,
    note: 'Any server that implements the OpenAI chat completions API.',
  },
];

export interface ProviderInput {
  id?: string;
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  modelIds: string[];
  enabled: boolean;
  priority: number;
}

export interface ProviderSummary {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  modelIds: string[];
  enabled: boolean;
  priority: number;
  createdAt: number;
  updatedAt: number;
  credentialState: ProviderCredentialState;
  isActive: boolean;
}

export interface ProviderValidationErrors {
  id?: string;
  name?: string;
  protocol?: string;
  baseUrl?: string;
  modelIds?: string;
  priority?: string;
  enabled?: string;
}

export interface ProviderValidationResult {
  valid: boolean;
  errors: ProviderValidationErrors;
}

export function providerSecretId(providerId: string): string {
  return `provider:${providerId}`;
}

export function normalizeModelIds(modelIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of modelIds) {
    const value = raw.trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }

  return result;
}

function validateBaseUrl(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return 'Enter a valid absolute URL.';
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'Only http and https endpoints are supported.';
  }
  if (parsed.username || parsed.password) {
    return 'Credentials must not be embedded in the URL.';
  }
  if (parsed.hash) {
    return 'Remove the URL fragment.';
  }
  if (!parsed.hostname) {
    return 'The URL must include a hostname.';
  }

  return null;
}

export function validateProviderInput(input: ProviderInput): ProviderValidationResult {
  const errors: ProviderValidationErrors = {};
  const name = input.name.trim();
  const baseUrl = input.baseUrl.trim();
  const models = normalizeModelIds(input.modelIds);

  if (name.length < 1 || name.length > 80) {
    errors.name = 'Name must be between 1 and 80 characters.';
  }

  if (!(PROVIDER_PROTOCOLS as readonly string[]).includes(input.protocol)) {
    errors.protocol = 'Choose a supported protocol.';
  }

  const urlError = validateBaseUrl(baseUrl);
  if (urlError) {
    errors.baseUrl = urlError;
  }

  if (models.length < 1) {
    errors.modelIds = 'Add at least one model identifier.';
  } else if (models.length > 20) {
    errors.modelIds = 'A provider can list at most 20 models.';
  } else if (models.some((model) => model.length > 120)) {
    errors.modelIds = 'Model identifiers must be 120 characters or fewer.';
  }

  if (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 1000) {
    errors.priority = 'Priority must be a whole number between 0 and 1000.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
