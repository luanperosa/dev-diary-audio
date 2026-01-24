/**
 * Diary Generation Prompts
 * 
 * Centralized prompt templates for developer diary generation.
 * These can be customized or extended in the future.
 */

const SYSTEM_PROMPT = `You are an assistant that helps developers create structured daily work summaries.
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

/**
 * Generate user prompt with transcript
 * @param {string} transcript - The full daily transcript
 * @returns {string} The formatted user prompt
 */
function getUserPrompt(transcript) {
  return `Here is the transcript from my work day. Please create a structured developer diary based on this content:

---
${transcript}
---

Generate a developer diary that summarizes my day, tasks, decisions, and next steps.`;
}

/**
 * Get the system prompt for diary generation
 * @returns {string}
 */
function getSystemPrompt() {
  return SYSTEM_PROMPT;
}

module.exports = {
  getSystemPrompt,
  getUserPrompt
};
