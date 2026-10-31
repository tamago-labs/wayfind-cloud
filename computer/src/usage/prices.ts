// Central price book for metered calls. One place — tools and the usage
// reporter reference these, never hardcode prices inline.
//
// Known prices: Muse Image is a flat $0.01 per generated image. Everything
// else records quantities (tokens, calls, seconds) with cost computed when
// rates are known; unknown rates mean "tracked, not yet priced".
export const IMAGE_USD_EACH = 0.01;

export type UsageKind =
  | 'chat'
  | 'grounded_search'
  | 'voice'
  | 'image'
  | 'read_file'
  | 'websearch'
  | 'summarize';

export type UsageUnit = 'tokens' | 'images' | 'seconds' | 'calls' | 'chars';
