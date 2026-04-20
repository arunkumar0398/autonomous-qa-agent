/**
 * Abstract LLM adapter interface.
 *
 * Every concrete provider (OpenAI, Anthropic, Ollama) must implement these methods.
 */
export class LlmAdapter {
  /**
   * Send a chat-completion request.
   *
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} [options]
   * @param {string} [options.model]
   * @param {number} [options.maxTokens]
   * @param {number} [options.temperature]
   * @returns {Promise<string>} The assistant's reply text.
   */
  async chat(_messages, _options) {
    throw new Error('LlmAdapter.chat() not implemented');
  }

  /**
   * Return the provider name (e.g. 'openai', 'anthropic', 'ollama').
   * @returns {string}
   */
  getProvider() {
    throw new Error('LlmAdapter.getProvider() not implemented');
  }
}
