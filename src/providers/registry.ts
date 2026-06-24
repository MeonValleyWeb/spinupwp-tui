// Provider adapter registry — builds the active set of hosting provider
// adapters from the resolved config. Only providers with a configured token
// are instantiated, so the app stays single-provider (SpinupWP-only) until a
// user adds a token for another platform.

import type { AppConfig } from "../config.ts"
import type { ProviderAdapter } from "./types.ts"
import { VercelProviderAdapter } from "./vercel.ts"

export function buildAdapters(config: AppConfig): ProviderAdapter[] {
  const adapters: ProviderAdapter[] = []

  if (config.hostingTokens.vercel) {
    adapters.push(
      new VercelProviderAdapter({
        token: config.hostingTokens.vercel,
        teamId: config.hostingTokens.vercelTeamId ?? undefined,
      }),
    )
  }

  return adapters
}
