/**
 * Base API Adapter Interface
 * 
 * This abstract class defines the interface that all API adapters must implement.
 * It allows easy swapping between different AI service providers (OpenAI, Anthropic, local models, etc.)
 */

class APIAdapter {
  /**
   * Generate developer diary from transcript
   * @param {string} transcript - The full daily transcript text
   * @param {Object} options - Optional configuration
   * @returns {Promise<{success: boolean, content?: string, error?: string}>}
   */
  async generateDiary(transcript, options = {}) {
    throw new Error('generateDiary() must be implemented by subclass');
  }

  /**
   * Validate that the adapter is properly configured
   * @returns {Promise<{valid: boolean, error?: string}>}
   */
  async validate() {
    throw new Error('validate() must be implemented by subclass');
  }

  /**
   * Get adapter name/identifier
   * @returns {string}
   */
  getName() {
    throw new Error('getName() must be implemented by subclass');
  }
}

module.exports = APIAdapter;
