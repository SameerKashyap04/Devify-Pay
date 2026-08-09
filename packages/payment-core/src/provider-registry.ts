import type { PaymentProvider, PaymentProviderName } from "@devify/types";

/**
 * Central registry the payment engine uses to resolve a provider
 * implementation by name. Controllers/services never import a
 * concrete provider directly — they ask the registry for one.
 */
export class ProviderRegistry {
  private providers = new Map<PaymentProviderName, PaymentProvider>();

  register(provider: PaymentProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: PaymentProviderName): PaymentProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new ProviderNotConfiguredError(name);
    }
    return provider;
  }

  has(name: PaymentProviderName): boolean {
    return this.providers.has(name);
  }
}

export class ProviderNotConfiguredError extends Error {
  code = "PROVIDER_NOT_CONFIGURED";
  constructor(name: PaymentProviderName) {
    super(`Provider "${name}" is not configured`);
    this.name = "ProviderNotConfiguredError";
  }
}

export * from "./state-machine.js";
