export function humanizeCode(code: string) {
  const labels: Record<string, string> = {
    brand_profile_incomplete:
      "The brand profile needs a little more context before generation can run.",
    autopilot_skipped_queue_full:
      "Autopilot paused because pieces are already waiting to publish.",
    autopilot_skipped_duplicate:
      "Autopilot skipped a topic because it was too similar to recent content.",
    visual_profile_incomplete:
      "The article can publish, but images are skipped until the visual style is filled in.",
    jsonld_invalid:
      "The article's structured data was malformed and should be fixed on regenerate.",
  };
  return labels[code] ?? code.replaceAll("_", " ");
}

export function humanizeEval(name: string, detail?: string) {
  const labels: Record<string, string> = {
    "Brand alignment":
      "Held: the piece needs a closer check against the property's brand context.",
    "SEO heading hierarchy":
      "Held: the headings need a cleaner H1/H2/H3 structure.",
    "SEO metadata":
      "Held: the title or description needs to fit search rules.",
    "SEO slug": "Held: the URL slug needs to be shorter and keyword-aligned.",
    "AEO answer-first":
      "Held: the opening needs to answer the core question more directly.",
    "AEO FAQ block":
      "Held: the FAQ section needs clearer question-and-answer headings.",
    "AEO JSON-LD":
      "Held: the article's structured data needs to validate before publishing.",
    "Keyword placement":
      "Review: the primary keyword could be placed more naturally.",
    "Internal link suggestions":
      "Review: add useful links to related published pieces if they fit.",
    Readability: "Review: tighten the paragraphs so the piece is easier to scan.",
    "Extractable list":
      "Review: add a list or step sequence if it helps the topic.",
    Language: "Review: confirm the output language matches the property.",
  };
  return labels[name] ?? detail ?? name;
}

export function primaryReviewReason(evals: Array<{ name: string; passed: boolean; hard?: boolean; detail?: string }>) {
  const failedHard = evals.find((entry) => entry.hard && !entry.passed);
  const failedAny = evals.find((entry) => !entry.passed);
  const target = failedHard ?? failedAny;
  if (!target) return "Needs a final human pass before publishing.";
  return humanizeEval(target.name, target.detail);
}
