/** Provider abstraction: metadata (always loaded) + a lazily-imported adapter. */

export type ProviderId =
  | 'gemini'
  | 'anthropic'
  | 'openai'
  | 'groq'
  | 'openrouter'
  | 'mistral';

export interface RefineResult {
  corrected: string;
  translated: string;
}

export interface ProviderRefineArgs {
  apiKey: string;
  model: string;
  text: string;
  signal: AbortSignal;
}

export type ProviderRefineFn = (args: ProviderRefineArgs) => Promise<RefineResult>;

export type ProviderErrorKind =
  | 'auth' // bad/missing key, no credit, forbidden
  | 'rate-limit' // quota / too many requests
  | 'truncated' // model hit its output limit
  | 'bad-response' // couldn't parse the result
  | 'unknown';

/** Thrown by provider adapters; `refine.ts` converts it to a RefineError. */
export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  constructor(kind: ProviderErrorKind, message: string) {
    super(message);
    this.name = 'ProviderError';
    this.kind = kind;
  }
}

/** Static description of a provider — no SDK imports, safe to load eagerly. */
export interface ProviderMeta {
  id: ProviderId;
  label: string;
  cost: 'free' | 'paid';
  /** One-line cost summary shown in the settings panel. */
  costNote: string;
  /** Where the user gets a key. */
  apiKeyUrl: string;
  /** Short hint about the key's format. */
  keyHint: string;
  /** Numbered "how to get a key" steps for non-technical users. */
  steps: string[];
  /** Used when the user hasn't overridden the model. */
  defaultModel: string;
}

export interface ProviderEntry extends ProviderMeta {
  /** Dynamically imports the adapter (keeps provider SDKs out of the initial bundle). */
  loadRefine: () => Promise<ProviderRefineFn>;
}
