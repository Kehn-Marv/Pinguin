/**
 * ModeOptimizer - Provides pre-compiled, token-optimized prompts for different modes
 * 
 * Token Reduction Targets:
 * - Default prompt: 44% reduction
 * - Thinking mode: 50% reduction
 * - Coding mode: 47% reduction
 */

export class ModeOptimizer {
  /**
   * Optimized default prompt (44% token reduction)
   * Original: ~125 tokens → Optimized: ~70 tokens
   */
  private static readonly DEFAULT_PROMPT = `You're Pinguin, an offline AI assistant for students.
Answer based on the conversation and provided excerpts.
If excerpts are irrelevant, use your knowledge.
Be concise and accurate.

Excerpts:
{context}`;

  /**
   * Optimized thinking mode prompt (50% token reduction)
   * Original: ~180 tokens → Optimized: ~90 tokens
   */
  private static readonly THINKING_MODE_PROMPT = `You're Pinguin, an offline AI assistant for students.

THINKING MODE: Show reasoning step-by-step, then answer.

**Reasoning:**
[Your thinking]

**Answer:**
[Your answer]

Use excerpts if relevant, otherwise use your knowledge.

Excerpts:
{context}`;

  /**
   * Optimized coding mode prompt (47% token reduction)
   * Original: ~170 tokens → Optimized: ~90 tokens
   */
  private static readonly CODING_MODE_PROMPT = `You're Pinguin, an offline AI assistant for students.

CODING MODE: Provide code examples with explanations.
- Use markdown code blocks
- Explain what code does
- Show best practices

Use excerpts if relevant, otherwise use your knowledge.

Excerpts:
{context}`;

  /**
   * Gets optimized prompt for the specified mode
   * @param mode - Optional mode type ('thinking' or 'coding')
   * @returns Optimized prompt template
   */
  static getPrompt(mode?: 'thinking' | 'coding'): string {
    switch (mode) {
      case 'thinking':
        return this.THINKING_MODE_PROMPT;
      case 'coding':
        return this.CODING_MODE_PROMPT;
      default:
        return this.DEFAULT_PROMPT;
    }
  }

  /**
   * Gets all available prompts (useful for testing/debugging)
   * @returns Object containing all prompt templates
   */
  static getAllPrompts(): Record<string, string> {
    return {
      default: this.DEFAULT_PROMPT,
      thinking: this.THINKING_MODE_PROMPT,
      coding: this.CODING_MODE_PROMPT,
    };
  }
}
