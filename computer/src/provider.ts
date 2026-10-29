// OpenAI-compatible provider client (chat-further provider.ts pattern,
// pointed at env instead of Amplify secrets).
import OpenAI from 'openai';
import { setDefaultOpenAIClient, setTracingDisabled } from '@openai/agents';
import { PROVIDER_API_KEY, PROVIDER_BASE_URL } from './config.js';

let ready = false;

export function initProvider(): void {
  if (ready) return;
  const client = new OpenAI({ apiKey: PROVIDER_API_KEY, baseURL: PROVIDER_BASE_URL });
  setDefaultOpenAIClient(client);
  setTracingDisabled(true);
  ready = true;
}
