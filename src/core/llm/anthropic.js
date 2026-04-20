import Anthropic from '@anthropic-ai/sdk';
import { LlmAdapter } from './adapter.js';

export class AnthropicAdapter extends LlmAdapter {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey
   * @param {string} [opts.model]
   * @param {number} [opts.maxTokens]
   * @param {number} [opts.temperature]
   */
  constructor(opts) {
    super();
    this._model = opts.model ?? 'claude-sonnet-4-6';
    this._maxTokens = opts.maxTokens ?? 4096;
    this._temperature = opts.temperature ?? 0.2;
    this._client = new Anthropic({ apiKey: opts.apiKey });
  }

  /** @override */
  async chat(messages, options = {}) {
    // Separate system message from conversation messages
    let system;
    const conversation = [];
    for (const msg of messages) {
      if (msg.role === 'system') {
        system = msg.content;
      } else {
        conversation.push({ role: msg.role, content: msg.content });
      }
    }

    const response = await this._client.messages.create({
      model: options.model ?? this._model,
      max_tokens: options.maxTokens ?? this._maxTokens,
      temperature: options.temperature ?? this._temperature,
      ...(system ? { system } : {}),
      messages: conversation,
    });

    const block = response.content?.[0];
    if (!block?.text) {
      throw new Error('Anthropic returned an empty response');
    }
    return block.text;
  }

  /** @override */
  getProvider() {
    return 'anthropic';
  }
}
