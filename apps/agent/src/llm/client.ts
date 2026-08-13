import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

let client: Anthropic | null = null;

/// Lazy on purpose: a DRY_RUN L0-only worker (or the test suite) should
/// never fail to start just because ANTHROPIC_API_KEY is unset — the error
/// should surface only when an L1/L2 call is actually attempted.
export function getAnthropicClient(): Anthropic {
  if (!client) {
    if (!config.anthropicApiKey) {
      throw new Error("ANTHROPIC_API_KEY not configured — required for L1/L2 model calls");
    }
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}
