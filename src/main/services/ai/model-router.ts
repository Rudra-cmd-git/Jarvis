import type { AiError } from '../../../shared/ai';
import type {
  ProviderCredentialState,
  ProviderProtocol,
  ProviderSummary,
} from '../../../shared/providers';
import { providerSecretId } from '../../../shared/providers';
import type { SecretsService } from '../secrets.service';
import type { SettingsService } from '../settings.service';
import type { ProvidersService } from '../providers.service';
import { AiProviderError, createAiError } from './ai-errors';

export interface ResolvedProviderConfig {
  providerId: string;
  providerName: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  apiKey: string | null;
  credentialState: ProviderCredentialState;
}

export interface ResolvedAiProvider extends ResolvedProviderConfig {
  model: string;
}

function providerMissing(): AiProviderError {
  return new AiProviderError(
    createAiError('provider_missing', 'No active AI provider is configured.', false),
  );
}

export class ModelRouter {
  constructor(
    private readonly providers: ProvidersService,
    private readonly settings: SettingsService,
    private readonly secrets: SecretsService,
  ) {}

  resolveConfig(providerId?: string): ResolvedProviderConfig {
    const requestedId = providerId ?? this.settings.get('ai.activeProviderId');
    if (!requestedId) {
      throw providerMissing();
    }

    const provider: ProviderSummary | undefined = this.providers.get(requestedId);
    if (!provider) {
      throw new AiProviderError(
        createAiError(
          'provider_missing',
          'The selected AI provider no longer exists. Choose another provider in Settings.',
          false,
        ),
      );
    }
    if (!provider.enabled) {
      throw new AiProviderError(
        createAiError(
          'provider_disabled',
          `The provider “${provider.name}” is disabled. Enable it in Settings.`,
          false,
        ),
      );
    }

    const secretId = providerSecretId(provider.id);
    let apiKey: string | null = null;
    let credentialState: ProviderCredentialState = 'missing';

    try {
      if (this.secrets.hasSecret(secretId)) {
        apiKey = this.secrets.getSecretInternal(secretId);
        credentialState = 'configured';
      }
    } catch {
      throw new AiProviderError(
        createAiError(
          'credential_unavailable',
          'The stored API key could not be read. Re-enter it in Settings.',
          false,
        ),
      );
    }

    return {
      providerId: provider.id,
      providerName: provider.name,
      protocol: provider.protocol,
      baseUrl: provider.baseUrl,
      apiKey,
      credentialState,
    };
  }

  resolve(modelOverride?: string, providerId?: string): ResolvedAiProvider {
    const config = this.resolveConfig(providerId);
    const provider = this.providers.get(config.providerId);
    if (!provider) {
      throw providerMissing();
    }

    const override = modelOverride?.trim();
    if (override && override.length > 120) {
      throw new AiProviderError(
        createAiError('model_missing', 'The requested model identifier is too long.', false),
      );
    }

    const storedDefault = this.settings.get('ai.defaultModel').trim();
    const model = override || storedDefault || provider.modelIds[0] || '';
    if (!model) {
      throw new AiProviderError(
        createAiError(
          'model_missing',
          'No model is selected for the active provider. Add a model in Settings.',
          false,
        ),
      );
    }

    return { ...config, model };
  }

  /** Never throws; used to render an honest status panel. */
  describe(): {
    provider: ProviderSummary | null;
    config: ResolvedProviderConfig | null;
    model: string | null;
    error: AiError | null;
  } {
    const activeId = this.settings.get('ai.activeProviderId');
    if (!activeId) {
      return {
        provider: null,
        config: null,
        model: null,
        error: createAiError('provider_missing', 'No active AI provider is configured.', false),
      };
    }

    const provider = this.providers.get(activeId) ?? null;
    if (!provider) {
      return {
        provider: null,
        config: null,
        model: null,
        error: createAiError(
          'provider_missing',
          'The selected AI provider no longer exists.',
          false,
        ),
      };
    }

    try {
      const resolved = this.resolve();
      return { provider, config: resolved, model: resolved.model, error: null };
    } catch (error) {
      return {
        provider,
        config: null,
        model: null,
        error:
          error instanceof AiProviderError
            ? error.aiError
            : createAiError('unknown', 'The AI runtime could not be resolved.', false),
      };
    }
  }
}
