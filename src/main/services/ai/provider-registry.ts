import type { AiProvider } from '../../../shared/ai';
import type { ProviderProtocol } from '../../../shared/providers';
import { AiProviderError, createAiError } from './ai-errors';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

export class ProviderRegistry {
  private readonly providers = new Map<ProviderProtocol, AiProvider>();

  register(provider: AiProvider): void {
    this.providers.set(provider.protocol, provider);
  }

  get(protocol: ProviderProtocol): AiProvider {
    const provider = this.providers.get(protocol);
    if (!provider) {
      throw new AiProviderError(
        createAiError(
          'unsupported_protocol',
          `No adapter is registered for the “${protocol}” protocol.`,
          false,
        ),
      );
    }
    return provider;
  }

  protocols(): ProviderProtocol[] {
    return [...this.providers.keys()];
  }
}

export function createDefaultProviderRegistry(fetchImpl?: typeof fetch): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(
    new OpenAiCompatibleProvider({
      protocol: 'openai-compatible',
      includeAuth: true,
      ...(fetchImpl ? { fetchImpl } : {}),
    }),
  );
  registry.register(
    new OpenAiCompatibleProvider({
      protocol: 'ollama',
      includeAuth: false,
      ...(fetchImpl ? { fetchImpl } : {}),
    }),
  );
  return registry;
}
