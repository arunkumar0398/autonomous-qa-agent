import OpenAI from 'openai';
import { LlmAdapter } from './adapter.js';

export class OpenAiAdapter extends LlmAdapter {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey
   * @param {string} [opts.model]
   * @param {number} [opts.maxTokens]
   * @param {number} [opts.temperature]
   * @param {string} [opts.baseUrl]
   */
  constructor(opts) {
    super();
    this._model = opts.model ?? 'gpt-4o-mini';
    this._maxTokens = opts.maxTokens ?? 4096;
    this._temperature = opts.temperature ?? 0.2;
    this._client = new OpenAI({
      apiKey: opts.apiKey,
      ...(opts.baseUrl ? { baseURL: opts.baseUrl } : {}),
    });
  }

  /** @override */
  async chat(messages, options = {}) {
    const response = await this._client.chat.completions.create({
      model: options.model ?? this._model,
      messages,
      max_tokens: options.maxTokens ?? this._maxTokens,
      temperature: options.temperature ?? this._temperature,
    });

    const choice = response.choices?.[0];
    if (!choice?.message?.content) {
      throw new Error('OpenAI returned an empty response');
    }
    return choice.message.content;
  }

  /** @override */
  getProvider() {
    return 'openai';
  }
}
