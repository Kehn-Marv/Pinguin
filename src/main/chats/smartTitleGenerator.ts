/**
 * SmartTitleGenerator (v2)
 *
 * - Few-shot candidate generation (3 candidates)
 * - Heuristic ranking & selection
 * - Strong cleaning & enforced max words / chars
 * - Backwards compatible: generateTitle(...) returns a single string (best)
 *
 * Only this file touches title generation behavior.
 */

class SmartTitleGenerator {
  private static readonly MAX_TITLE_LENGTH = 60; // chars
  private static readonly MAX_WORDS = 6;
  private static readonly LLM_SNIPPET_LIMIT = 700;
  private static readonly CANDIDATE_COUNT = 3;

  private static readonly STOPWORDS = new Set([
    "the","a","an","in","on","at","to","for","and","or","but","of","is","are","was","were","that","this","these","those",
    "with","by","about","as","it","be","from","we","you","i","my","your","our"
  ]);

  /**
   * Main public entrypoint (backwards compatible).
   * Returns the single best title as string.
   */
  static async generateTitle(message: string, ollamaHost: string, model: string): Promise<string> {
    if (!message || message.trim().length === 0) return "New Chat";

    try {
      const candidates = await this.generateCandidates(message, ollamaHost, model, this.CANDIDATE_COUNT);
      if (!candidates || candidates.length === 0) {
        return this.fallbackTitle(message);
      }
      // pick the best candidate using heuristic scoring
      const best = this.chooseBestCandidate(candidates, message);
      return best || this.fallbackTitle(message);
    } catch (err) {
      console.error("SmartTitleGenerator.generateTitle failed:", err);
      return this.fallbackTitle(message);
    }
  }

  /**
   * Generate N candidate titles from the LLM (few-shot).
   * Returns array of cleaned candidate strings, or empty array on failure.
   */
  static async generateCandidates(
    message: string,
    ollamaHost: string,
    model: string,
    n = 3
  ): Promise<string[]> {
    const snippet = message.trim().substring(0, this.LLM_SNIPPET_LIMIT);

    // Few-shot prompt with examples so model follows the exact style
    const fewShot = [
      "You are a concise title generator. Respond ONLY with N short titles (no explanation).",
      `Constraints:`,
      `- Return exactly ${n} titles, each on its own line.`,
      `- Each title: max ${this.MAX_WORDS} words, no surrounding quotes or markdown, no trailing punctuation.`,
      `- Avoid generic names like "New Chat" or "Untitled".`,
      "",
      "Examples:",
      `Message: "How do I calculate the derivative of sin(x)*e^x using product rule?"`,
      "Titles:",
      `1. Derivative of sin(x) * e^x`,
      `2. Product rule: sin(x) and e^x`,
      `3. Differentiating sin(x)·e^x`,
      "",
      `Message: "I need help understanding Bayesian inference — prior, likelihood, posterior."`,
      "Titles:",
      `1. Bayesian inference basics`,
      `2. Prior, likelihood, posterior explained`,
      `3. Intro to Bayesian updating`,
      "",
      `Now generate titles for the message below.`,
      `Message:`,
      `${snippet}`,
      "",
      `Titles:`
    ].join("\n");

    try {
      const res = await fetch(`${ollamaHost}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: fewShot,
          stream: false,
          options: { temperature: 0.12, num_predict: 40 }
        })
      });

      if (!res.ok) {
        throw new Error(`LLM failed with ${res.status}`);
      }

      const data = await res.json();
      const raw = (data?.response ?? data?.choices?.[0]?.text ?? "").toString().trim();

      if (!raw) return [];

      // Parse lines looking for up to n titles
      const lines = raw.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
      const parsed: string[] = [];

      for (const line of lines) {
        // remove leading "1." or "Title:" tokens
        const cleanedLine = line.replace(/^\d+\.\s*/, "").replace(/^(Title|Titles)\s*[:\-–—]\s*/i, "").trim();
        const c = this.cleanTitle(cleanedLine);
        if (c) parsed.push(c);
        if (parsed.length >= n) break;
      }

      // If LLM returned a single comma-separated line, split by comma
      if (parsed.length === 0 && raw.includes(",")) {
        const parts = raw.split(",").map((p: string) => this.cleanTitle(p)).filter(Boolean);
        parsed.push(...parts.slice(0, n));
      }

      // enforce uniqueness & final cleaning
      const unique = Array.from(new Set(parsed))
        .map((p: string) => this.finalizeCandidate(p))
        .filter((x): x is string => x !== null);
      return unique.slice(0, n);
    } catch (err) {
      console.error("generateCandidates error:", err);
      return [];
    }
  }

  /**
   * Choose the best candidate via scoring heuristics.
   * Heuristics:
   * - Penalize generic words ("question", "chat", "untitled")
   * - Prefer medium length (not too short, not too long)
   * - Prefer candidates containing rare/content words from original message
   */
  private static chooseBestCandidate(candidates: string[], originalMessage: string): string | null {
    if (!candidates || candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    const msgTokens = new Set(
      originalMessage
        .toLowerCase()
        .replace(/[^a-z0-9\s]/gi, " ")
        .split(/\s+/)
        .filter(Boolean)
    );

    let bestScore = -Infinity;
    let bestCandidate: string | null = null;

    for (const cand of candidates) {
      let score = 0;

      const words = cand.split(/\s+/).filter(Boolean);
      const len = cand.length;

      // length score: prefer between 10 and 45 chars
      if (len >= 10 && len <= 45) score += 2;
      else if (len < 10) score += 0.5;
      else score += 1;

      // penalize generic tokens
      const lower = cand.toLowerCase();
      if (/(untitled|new chat|question|chat|conversation)/i.test(lower)) score -= 5;

      // reward presence of rare/content words that also appear in the message
      let contentMatches = 0;
      for (const w of words) {
        const clean = w.replace(/[^a-z0-9]/gi, "").toLowerCase();
        if (!clean) continue;
        if (!this.STOPWORDS.has(clean) && msgTokens.has(clean)) contentMatches++;
      }
      score += contentMatches * 2;

      // small preference to fewer words (brevity)
      score += Math.max(0, (this.MAX_WORDS - words.length) * 0.3);

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = cand;
      }
    }

    // fallback safety: return first
    return bestCandidate ?? candidates[0];
  }

  /**
   * Final cleaning & enforce caps on candidate string
   */
  private static finalizeCandidate(candidate: string): string | null {
    if (!candidate) return null;
    let c = this.cleanTitle(candidate);
    c = this.enforceWordLimit(c, this.MAX_WORDS);
    if (c.length > this.MAX_TITLE_LENGTH) {
      // try to cut at whitespace
      c = c.substring(0, this.MAX_TITLE_LENGTH + 1);
      const lastSpace = c.lastIndexOf(" ");
      if (lastSpace > 0 && lastSpace > Math.floor(this.MAX_TITLE_LENGTH * 0.6)) {
        c = c.substring(0, lastSpace);
      } else {
        c = c.substring(0, this.MAX_TITLE_LENGTH);
      }
      c = c.replace(/[.,;:!?-]+$/g, "").trim();
      if (c.length === 0) return null;
      c = `${c}...`;
    }
    return this.toTitleCase(c);
  }

  /* ----------------- helper methods ----------------- */

  private static cleanTitle(title: string): string {
    if (!title) return "";
    let t = title;
    t = t.replace(/```[\s\S]*?```/g, "");
    t = t.replace(/(^|\s)[>#*-]+\s*/g, " ");
    t = t.replace(/[*_~`]/g, "");
    t = t.replace(/^["'“‘]+|["'”’]+$/g, "");
    t = t.replace(/^(title|chat|conversation)\s*[:\-–—]\s*/i, "");
    t = t.replace(/https?:\/\/\S+/gi, "");
    t = t.replace(/\S+@\S+\.\S+/gi, "");
    t = t.replace(/\s{2,}/g, " ").trim();
    return t;
  }

  private static enforceWordLimit(title: string, maxWords: number): string {
    const words = title.split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return title;
    // keep content words first
    const kept: string[] = [];
    for (const w of words) {
      const normalized = w.replace(/[^\w'-]/g, "").toLowerCase();
      if (!this.STOPWORDS.has(normalized) && kept.length < maxWords) kept.push(w);
    }
    if (kept.length < maxWords) {
      for (const w of words) {
        if (kept.length >= maxWords) break;
        if (!kept.includes(w)) kept.push(w);
      }
    }
    return kept.slice(0, maxWords).join(" ");
  }

  private static extractFirstSentence(message: string): string {
    const match = message.match(/([^.?!]*[.?!])/);
    if (match && match[0]) return match[0].trim();
    return message.split(/\r?\n/)[0].trim();
  }

  private static extractKeyPhrase(message: string): string {
    const split = message.split(/[,;:\-–—]/);
    if (split && split.length > 0 && split[0].trim().length > 0) return split[0].trim();
    const tokens = message.split(/\s+/).filter(Boolean);
    const kept: string[] = [];
    for (const w of tokens) {
      const clean = w.replace(/[^\w'-]/g, "");
      if (!this.STOPWORDS.has(clean.toLowerCase())) {
        kept.push(clean);
        if (kept.length >= this.MAX_WORDS) break;
      }
    }
    if (kept.length > 0) return kept.join(" ");
    return tokens.slice(0, this.MAX_WORDS).join(" ");
  }

  private static toTitleCase(s: string): string {
    return s
      .split(/\s+/)
      .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1) : ""))
      .join(" ")
      .trim();
  }

  private static fallbackTitle(message: string): string {
    const trimmed = message.trim();
    const firstLine = trimmed.split(/\r?\n/)[0];
    if (firstLine.length <= this.MAX_TITLE_LENGTH && firstLine.split(/\s+/).length <= this.MAX_WORDS) {
      return this.toTitleCase(this.cleanTitle(firstLine));
    }
    const firstSentence = this.extractFirstSentence(trimmed);
    let candidate = firstSentence;
    if (candidate.split(/\s+/).length > this.MAX_WORDS) {
      candidate = this.extractKeyPhrase(trimmed);
    }
    candidate = this.cleanTitle(candidate);
    candidate = this.enforceWordLimit(candidate, this.MAX_WORDS);
    if (candidate.length > this.MAX_TITLE_LENGTH) {
      candidate = candidate.substring(0, this.MAX_TITLE_LENGTH).trim();
      const lastSpace = candidate.lastIndexOf(" ");
      if (lastSpace > 0) candidate = candidate.substring(0, lastSpace);
      candidate = candidate.replace(/[.,;:!?-]+$/g, "").trim();
      candidate = candidate ? `${candidate}...` : candidate;
    }
    if (!candidate) return "New Chat";
    return this.toTitleCase(candidate);
  }
}

export default SmartTitleGenerator;
