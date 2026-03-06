/**
 * Shared AI provider instances.
 *
 * The @ai-sdk/anthropic v3 defaults to /messages instead of /v1/messages,
 * so we explicitly set the base URL here.
 */
import { createAnthropic } from '@ai-sdk/anthropic'

export const anthropic = createAnthropic({
  baseURL: 'https://api.anthropic.com/v1',
})
