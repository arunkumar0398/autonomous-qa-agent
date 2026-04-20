import { getConfig } from '../../config/index.js';
import { OpenAiAdapter } from './openai.js';
import { AnthropicAdapter } from './anthropic.js';

/** @type {import('./adapter.js').LlmAdapter | null} */
let _llm = null;

/**
 * Return the singleton LLM adapter, creating it on first call.
 * @returns {import('./adapter.js').LlmAdapter}
 */
export function getLlm() {
  if (_llm) return _llm;

  const { llm } = getConfig();

  switch (llm.provider) {
    case 'openai': {
      if (!llm.apiKey) {
        throw new Error(
          'Missing LLM API key. Set TESTPILOT_LLM_API_KEY or OPENAI_API_KEY.',
        );
      }
      _llm = new OpenAiAdapter({
        apiKey: llm.apiKey,
        model: llm.model,
        maxTokens: llm.maxTokens,
        temperature: llm.temperature,
        baseUrl: llm.baseUrl,
      });
      break;
    }
    case 'anthropic': {
      if (!llm.apiKey) {
        throw new Error(
          'Missing LLM API key. Set TESTPILOT_LLM_API_KEY or ANTHROPIC_API_KEY.',
        );
      }
      _llm = new AnthropicAdapter({
        apiKey: llm.apiKey,
        model: llm.model,
        maxTokens: llm.maxTokens,
        temperature: llm.temperature,
      });
      break;
    }
    case 'ollama': {
      // Ollama adapter will be added in Phase 4
      throw new Error('Ollama provider is not yet implemented.');
    }
    default:
      throw new Error(`Unknown LLM provider: "${llm.provider}"`);
  }

  return _llm;
}

/**
 * Reset the singleton (useful for testing).
 */
export function resetLlm() {
  _llm = null;
}
