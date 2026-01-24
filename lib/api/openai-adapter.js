const APIAdapter = require('./adapter');
const https = require('https');

/**
 * OpenAI API Adapter
 * 
 * Implements diary generation using OpenAI's Chat Completion API
 */
class OpenAIAdapter extends APIAdapter {
  constructor(config = {}) {
    super();
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.model = config.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    this.maxTokens = config.maxTokens || parseInt(process.env.OPENAI_MAX_TOKENS || '2000', 10);
    this.timeout = config.timeout || parseInt(process.env.OPENAI_TIMEOUT || '60', 10) * 1000;
  }

  getName() {
    return 'OpenAI';
  }

  async validate() {
    if (!this.apiKey) {
      return {
        valid: false,
        error: 'OpenAI API key is not configured. Please set OPENAI_API_KEY in your .env file.'
      };
    }

    if (!this.apiKey.startsWith('sk-')) {
      return {
        valid: false,
        error: 'Invalid OpenAI API key format. Key should start with "sk-"'
      };
    }

    return { valid: true };
  }

  /**
   * Generate developer diary from transcript using OpenAI API
   * @param {string} transcript - The full daily transcript text
   * @param {Object} options - Optional configuration (prompt, etc.)
   * @returns {Promise<{success: boolean, content?: string, error?: string}>}
   */
  async generateDiary(transcript, options = {}) {
    const validation = await this.validate();
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const systemPrompt = options.systemPrompt || this._getDefaultSystemPrompt();
    const userPrompt = options.userPrompt || this._getDefaultUserPrompt(transcript);

    const payload = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: this.maxTokens,
      temperature: 0.7
    };

    try {
      const response = await this._makeAPIRequest(payload);
      
      if (response.choices && response.choices.length > 0) {
        const content = response.choices[0].message.content;
        return { success: true, content };
      } else {
        return { success: false, error: 'No content returned from API' };
      }
    } catch (error) {
      return { success: false, error: this._formatError(error) };
    }
  }

  /**
   * Make HTTPS request to OpenAI API
   * @private
   */
  _makeAPIRequest(payload) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(payload);
      const dataBuffer = Buffer.from(data, 'utf8');
      
      const options = {
        hostname: 'api.openai.com',
        port: 443,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': dataBuffer.length,
          'Authorization': `Bearer ${this.apiKey}`
        },
        timeout: this.timeout
      };

      const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            
            if (res.statusCode === 200) {
              resolve(parsed);
            } else {
              reject({
                statusCode: res.statusCode,
                message: parsed.error?.message || 'API request failed',
                type: parsed.error?.type
              });
            }
          } catch (error) {
            reject({ message: 'Failed to parse API response', raw: responseData });
          }
        });
      });

      req.on('error', (error) => {
        reject({ message: error.message, code: error.code });
      });

      req.on('timeout', () => {
        req.destroy();
        reject({ message: 'API request timed out', code: 'ETIMEDOUT' });
      });

      req.write(dataBuffer);
      req.end();
    });
  }

  /**
   * Format error messages for user display
   * @private
   */
  _formatError(error) {
    if (error.code === 'ETIMEDOUT') {
      return 'Request timed out. Please check your internet connection and try again.';
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return 'Cannot connect to OpenAI API. Please check your internet connection.';
    }

    if (error.statusCode === 401) {
      return 'Invalid API key. Please check your OPENAI_API_KEY in .env file.';
    }

    if (error.statusCode === 429) {
      return 'Rate limit exceeded. Please try again in a few moments.';
    }

    if (error.statusCode === 500 || error.statusCode === 503) {
      return 'OpenAI API is currently unavailable. Please try again later.';
    }

    return error.message || 'An unexpected error occurred while generating the diary.';
  }

  /**
   * Default system prompt for diary generation
   * @private
   */
  _getDefaultSystemPrompt() {
    return `You are an assistant that helps developers create structured daily work summaries.
Your task is to analyze audio transcripts of a developer's work day and create a clear, well-organized developer diary.
This transcript contain things I was saying while coding, thinking aloud, and working through problems. 
I might used non-english words, technical jargon, or incomplete sentences as I worked.

Focus on:
- Summary of the day's work
- Specific tasks completed or worked on
- Technical decisions made
- Problems encountered and how they were resolved
- Progress on ongoing projects
- Next steps or planned work

Format the output in clear Markdown with appropriate headings and bullet points.
Be concise but informative. Preserve important technical details.`;
  }

  /**
   * Default user prompt with transcript
   * @private
   */
  _getDefaultUserPrompt(transcript) {
    return `Here is the transcript from my work day. Please create a structured developer diary based on this content:

---
${transcript}
---

Generate a developer diary that summarizes my day, tasks, decisions, and next steps.`;
  }
}

module.exports = OpenAIAdapter;
