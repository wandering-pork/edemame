// TODO: verify against current Gemini 3.5 Flash pricing before using estimatedCostUsd for real billing.
// Zeroed deliberately (not a guessed number) so estimatedCostUsd stays visibly inert until real
// pricing is filled in here — token counts (the verifiable part) are tracked accurately regardless.
const GEMINI_FLASH_PRICING = { inputPerMillionTokens: 0, outputPerMillionTokens: 0 };

export function estimateCostUsd(promptTokens: number, candidatesTokens: number): number {
  return (promptTokens / 1_000_000) * GEMINI_FLASH_PRICING.inputPerMillionTokens
       + (candidatesTokens / 1_000_000) * GEMINI_FLASH_PRICING.outputPerMillionTokens;
}
