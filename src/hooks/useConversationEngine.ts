import { useCallback } from "react";
import type {
  ChatMessage,
  ContentSettings,
  DraftContent,
  SourceAnalysis,
  StrategicPosition,
  AngleOption,
  FormatOption,
  IntakeRevisionTarget,
  SessionState,
  UserPerspective,
  ContentBrief,
  BriefField,
  ToneOption,
} from "@/types/content";
import { analyzeDocumentWithAI } from "@/services/aiAnalysis";
import { analyzeMultimodalDocument } from "@/services/multimodalAnalysis";
import { diagnoseDraft, refineDraft, type RefinementContext } from "@/services/aiRefinement";
import { addTopicEntry } from "@/services/topicMemory";
import type { PDFParseResult } from "@/services/pdfParser";

// ============================================================
// INTENT DETECTION
// Centralised "user wants to move forward" logic.
// Covers typed messages AND chip clicks across every phase.
// ============================================================

/**
 * Returns true if the user's message is a forward-motion signal
 * (proceed, yes, create draft, go ahead, etc.) rather than a
 * substantive edit or question.
 */
function isProceedIntent(input: string): boolean {
  const t = input.trim().toLowerCase();

  // Exact short-form matches (most common chip / typed replies)
  const EXACT: string[] = [
    "yes", "yep", "yeah", "yup", "sure", "ok", "okay", "k",
    "proceed", "continue", "next", "go", "ready", "done",
    "confirm", "confirmed", "approve", "approved",
    "go ahead", "do it", "let's go", "let's do it", "lets go",
    "sounds good", "looks good", "looks great", "looks right",
    "all good", "perfect", "great", "good",
    "create draft", "generate draft", "write draft", "draft it",
    "make it", "make the draft", "build it",
    "generate", "write it", "start",
    "proceed anyway", "skip", "move on", "let's move on",
    "all three — let's go! 🚀", "all three", "let's go! 🚀",
    "give me a draft", "prep the draft", "prep a draft", "prep my draft",
    "just draft it", "draft now", "draft please",
  ];
  if (EXACT.includes(t)) return true;

  // Prefix / substring patterns
  const PATTERNS: RegExp[] = [
    /^(yes|yep|yeah|sure|ok|okay),?\s/i,
    /^proceed\b/i,                                                                    // anything STARTING with "proceed"
    /\bgo ahead\b/i,
    /\blet'?s\s+(go|do\s*it|start|proceed|begin|create|generate|write)\b/i,
    /\b(create|generate|write|make|build|draft)\s+(a\s+)?draft\b/i,
    /\bstart\s+draft(ing)?\b/i,
    /\b(sounds?|looks?)\s+(good|great|right|perfect|fine)\b/i,
    /\ball\s+(three|3)\b/i,
    /\bi'?m\s+ready\b/i,
    /\b(move|carry)\s+on\b/i,
    /\bjust\s+(do|go|make|create|generate|write)\b/i,
    /\bskip\s+(questions?|this)\b/i,
    // "let's go" / "lets go" with anything after
    /^lets?\s+go\b/i,
    // "give me a draft" variants
    /\bgive\s+me\s+(a\s+|the\s+|my\s+)?draft\b/i,
    // "quickly/quick/fast prep/create/make/write/gen the draft"
    /\b(quickly|quick|fast|rapidly)\s+(prep|prepare|create|make|write|gen|generate|build)\b/i,
    // "prep the/a/my draft"
    /\bprep\s+(the\s+|a\s+|my\s+)?draft\b/i,
    // "make/create/write/generate me a draft"
    /\b(just\s+)?(make|create|write|generate|build|prep|prepare)\s+(me\s+)?(a\s+|the\s+|my\s+)?draft\b/i,
    // "draft it/me/now/please/already/quickly"
    /\bdraft\s+(it|me|now|please|already|quickly|fast)\b/i,
    // "get/start drafting/writing/creating"
    /\b(get|start)\s+(drafting|writing|creating|generating)\b/i,
    // "prepare a/the draft"
    /\bprepare\s+(a\s+|the\s+|my\s+)?draft\b/i,
    // "skip to draft"
    /\bskip\s+(to\s+)?(the\s+)?draft\b/i,
  ];
  if (PATTERNS.some((p) => p.test(t))) return true;

  // Catch-all 1: message starts with a clear forward-motion verb
  if (/^(proceed|go ahead|just|skip|move|let'?s|lets|give|prep|make|create|write|generate|build|draft)\b/i.test(t)) return true;

  // Catch-all 2: short message (under 60 chars) containing "draft" = almost always a proceed signal
  // (someone requesting an edit would write something longer and more specific)
  if (t.length < 60 && /\bdraft\b/i.test(t)) return true;

  return false;
}

/**
 * Detects angle intent from free text (covers chip clicks + typed input).
 */
function detectAngle(input: string): AngleOption | null {
  const t = input.toLowerCase();
  if (t.includes("contrarian") || t.includes("flip") || t.includes("wrong")) return "contrarian";
  if (t.includes("educational") || t.includes("data") || t.includes("framework") || t.includes("authority")) return "educational";
  if (t.includes("story") || t.includes("narrative") || t.includes("driven")) return "story-driven";
  return null;
}

// ============================================================
// POSITIONING QUESTIONS
// ============================================================

const ALL_POSITIONING_QUESTIONS: {
  key: keyof StrategicPosition;
  perspectiveKey?: string;
  question: string;
  options?: string[];
}[] = [
  {
    key: "desiredReaction",
    question:
      "**What should they *feel* when they read this?** 💡\n\nThis is the secret sauce — it shapes everything from the hook to the closing line. Pick the gut reaction you're going for:",
    options: [
      '"I\'ve been saying this for months"',
      '"Wait — am I doing this wrong?"',
      '"Finally, someone gets it"',
      '"I need to share this with my team"',
    ],
  },
  {
    key: "challengedBelief",
    perspectiveKey: "challengedBelief",
    question:
      "**Do you want to sound contrarian, analytical, or story-driven?** 🔥\n\nThe best LinkedIn content takes something people *think* is true and flips it. What's the conventional wisdom you want to challenge?",
    options: [
      '"More data = better decisions"',
      '"Best practices work for everyone"',
      '"Speed is the competitive advantage"',
      '"Technology solves the problem"',
    ],
  },
  {
    key: "objective",
    perspectiveKey: "goal",
    question:
      "**Are we optimizing for authority, engagement, or lead gen?** 🎯\n\nBeing clear about this helps me nail the right structure and CTA.",
    options: [
      "Authority — thought leadership",
      "Engagement — maximize reach & comments",
      "Lead gen — drive pipeline & conversions",
      "Talent recruitment through vision",
    ],
  },
  {
    key: "voice",
    perspectiveKey: "brandType",
    question:
      "**Should we prioritize founder brand or company brand?** 🗣️\n\nQuick tip: personal voice typically gets 3x more engagement on LinkedIn. But company voice works great for scaling a message across your team.",
    options: [
      "Founder brand — personal voice",
      "Company brand — editorial voice",
      "Practitioner — expert voice",
      "Team perspective",
    ],
  },
];

// ============================================================
// CLARITY SCORE
// ============================================================

function calculateClarityScore(session: SessionState): number {
  let score = 0;
  if (session.sourceAnalysis) score += 2;
  if (session.strategicPosition.audience) score += 2;
  if (session.strategicPosition.desiredReaction) score += 1;
  if (session.strategicPosition.challengedBelief) score += 2;
  if (session.strategicPosition.objective) score += 1;
  if (session.strategicPosition.voice) score += 1;
  if (session.selectedAngle) score += 1;
  return score; // max 10
}

// ============================================================
// INTAKE HELPERS
// ============================================================

function getIntakeTarget(input: string): IntakeRevisionTarget | null {
  const lower = input.toLowerCase();
  if (lower.includes("thesis") || lower.includes("core claim") || lower.includes("main claim")) return "thesis";
  if (lower.includes("insight") || lower.includes("missing insight")) return "insights";
  if (lower.includes("data") || lower.includes("stat") || lower.includes("number") || lower.includes("proof point")) return "data";
  if (lower.includes("contrarian") || lower.includes("controversial") || lower.includes("angle")) return "contrarian";
  if (lower.includes("audience")) return "audience";
  if (lower.includes("commercial") || lower.includes("business implication") || lower.includes("monetization")) return "commercial";
  return null;
}

function extractRevisionText(input: string): string | null {
  const trimmed = input.trim();
  const labelMatch = trimmed.match(
    /^(?:the\s+)?(?:core\s+)?(?:thesis|insight(?:s)?|data(?:\s*point)?(?:s)?|contrarian(?:\s+(?:angle|claim|idea))?|audience|commercial(?:\s+implication)?)\s*[:\-]\s*(.+)$/i
  );
  if (labelMatch?.[1]?.trim()) return labelMatch[1].trim();

  const cueMatch = trimmed.match(
    /\b(?:should be|change to|rewrite to|update to|replace with|instead)\b\s*[:\-]?\s*(.+)$/i
  );
  if (cueMatch?.[1]?.trim()) return cueMatch[1].trim();

  const quotedMatch = trimmed.match(/[""](.{10,})[""]/);
  if (quotedMatch?.[1]?.trim()) return quotedMatch[1].trim();

  return null;
}

function applyIntakeRevision(
  analysis: SourceAnalysis,
  target: IntakeRevisionTarget,
  revision: string,
  rawInput: string
): SourceAnalysis {
  const normalizedRevision = revision.trim();

  if (target === "thesis") return { ...analysis, coreThesis: normalizedRevision };

  if (target === "insights") {
    const splitInsights = normalizedRevision.split(/\n|;|•/).map((item) => item.trim()).filter(Boolean);
    if (splitInsights.length > 1) return { ...analysis, keyInsights: splitInsights };
    const isAdditive = /\badd|missing\b/i.test(rawInput.toLowerCase());
    if (isAdditive) return { ...analysis, keyInsights: [...analysis.keyInsights, normalizedRevision].slice(0, 6) };
    return { ...analysis, keyInsights: [normalizedRevision, ...analysis.keyInsights.slice(1)] };
  }

  if (target === "data") return { ...analysis, dataPoints: [normalizedRevision, ...analysis.dataPoints.slice(1)] };
  if (target === "contrarian") return { ...analysis, controversialClaim: normalizedRevision };
  if (target === "audience") return { ...analysis, likelyAudience: normalizedRevision };
  return { ...analysis, commercialImplication: normalizedRevision };
}

function getIntakePrompt(target: IntakeRevisionTarget): string {
  switch (target) {
    case "thesis": return "Sure thing! Go ahead and send the updated thesis — just write it like: **Thesis: ...**";
    case "insights": return "Absolutely! Share the updated insights using **Insights:** followed by a bullet list (or just one to add).";
    case "data": return "Great call! Share your strongest data point using **Data: ...**";
    case "contrarian": return "Love it — a sharper angle always helps. Send it as **Contrarian: ...**";
    case "audience": return "Makes total sense. Update it with **Audience: ...**";
    case "commercial": return "Good thinking. Share it as **Commercial implication: ...**";
    default: return "No problem — just tell me what to change and I'll update it right away!";
  }
}

function buildAnalysisSummary(analysis: SourceAnalysis): string {
  const audienceNote = analysis.likelyAudience ? `\n\n**Likely Audience:**\n> ${analysis.likelyAudience}` : "";
  const commercialNote = analysis.commercialImplication ? `\n\n**Commercial Implication:**\n> ${analysis.commercialImplication}` : "";

  return `Here's what I pulled from your material — take a look and let me know if it feels right! 👇\n\n**Core Thesis:**\n> ${analysis.coreThesis}\n\n**Key Insights (${analysis.keyInsights.length}):**\n${analysis.keyInsights.map((i, idx) => `${idx + 1}. ${i}`).join("\n")}\n\n**Strongest Data Points:**\n${analysis.dataPoints.map((d) => `• ${d}`).join("\n")}\n\n**Potential Controversial Claim:**\n> ${analysis.controversialClaim}${audienceNote}${commercialNote}\n\n---\n\nDoes this capture the right strategic core?\nAnything you'd like to sharpen or change?`;
}

// ============================================================
// TONE / SENIORITY / DEPTH MODIFIERS
// ============================================================

function getToneModifiers(settings: ContentSettings) {
  const toneMap = {
    authoritative: { opener: "The evidence is clear", qualifier: "", conviction: "unequivocally" },
    conversational: { opener: "Here's the thing", qualifier: "honestly, ", conviction: "genuinely" },
    provocative: { opener: "Let's be blunt", qualifier: "wake up — ", conviction: "undeniably" },
    visionary: { opener: "The future belongs to those who see it first", qualifier: "imagine this: ", conviction: "fundamentally" },
  };
  const seniorityMap = {
    executive: { address: "executive leaders", pain: "board-level pressure", lens: "strategic" },
    professional: { address: "professionals", pain: "operational complexity", lens: "practical" },
  };
  const depthMap = {
    "high-level": { detail: "brief", sections: 2, proofPoints: 1 },
    balanced: { detail: "moderate", sections: 3, proofPoints: 2 },
    "deep-dive": { detail: "extensive", sections: 4, proofPoints: 3 },
  };
  return {
    tone: toneMap[settings.tone],
    seniority: seniorityMap[settings.seniority],
    depth: depthMap[settings.depth],
  };
}

// ============================================================
// DRAFT FORMATTING
// ============================================================

function formatDraftContent(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = text.replace(/\n{4,}/g, "\n\n\n");
  text = text.replace(/^→\s*/gm, "• ");
  text = text.replace(/^[-\u2013\u2014]\s+/gm, "• ");
  text = text.replace(/([^\n])\n(\*\*\d+\.)/g, "$1\n\n$2");
  text = text.replace(/([^\n])\n(\*\*[A-Z])/g, "$1\n\n$2");
  text = text.replace(/---\n(?!\n)/g, "---\n\n");
  text = text.replace(/(?<!\n)\n---/g, "\n\n---");

  const blocks = text.split("\n\n");
  const formatted = blocks.map((block) => {
    if (block.startsWith("•") || block.startsWith("**") || block.startsWith("#") || block.startsWith("---") || block.startsWith(">")) return block;
    const sentences = block.match(/[^.!?]+[.!?]+/g);
    if (sentences && sentences.length > 3) {
      const groups: string[] = [];
      for (let i = 0; i < sentences.length; i += 2) {
        groups.push(sentences.slice(i, i + 2).join("").trim());
      }
      return groups.join("\n\n");
    }
    return block;
  });

  text = formatted.join("\n\n");
  text = text.replace(/(• .+)\n\n(• )/g, "$1\n$2");
  text = text.replace(/[ \t]+$/gm, "");
  text = text.trimEnd() + "\n";
  return text;
}

// ============================================================
// DRAFT GENERATION
// ============================================================

export function generateDrafts(
  _sourceText: string,
  analysis: SourceAnalysis,
  position: StrategicPosition,
  angle: AngleOption,
  formats: FormatOption[],
  settings: ContentSettings
): Partial<DraftContent> {
  const rawDrafts = generateRawDrafts(_sourceText, analysis, position, angle, formats, settings);
  const drafts: Partial<DraftContent> = {};
  for (const [key, value] of Object.entries(rawDrafts)) {
    if (value) drafts[key as keyof DraftContent] = formatDraftContent(value);
  }
  return drafts;
}

function generateRawDrafts(
  _sourceText: string,
  analysis: SourceAnalysis,
  position: StrategicPosition,
  angle: AngleOption,
  formats: FormatOption[],
  settings: ContentSettings
): Partial<DraftContent> {
  const drafts: Partial<DraftContent> = {};
  const mods = getToneModifiers(settings);

  const audienceLabel = mods.seniority.address;
  const belief = position.challengedBelief || "conventional wisdom";
  const voice = position.voice?.includes("Personal") ? "I" : "We";
  const thesis = analysis.coreThesis;
  const insight1 = analysis.keyInsights[0] || "";
  const insight2 = analysis.keyInsights[1] || "";
  const insight3 = analysis.keyInsights[2] || "";
  const dataPoint = analysis.dataPoints[0] || "";
  const controversial = analysis.controversialClaim;

  const hookMap = {
    contrarian: `${mods.tone.opener}. Before you read another "best practice" article, ask yourself:\n\nWhen was the last time a best practice actually gave you a ${mods.seniority.lens} advantage?\n\n${voice === "I" ? "I'll" : "We'll"} wait.`,
    educational: `After studying ${dataPoint.toLowerCase()}, ${voice === "I" ? "I've" : "we've"} found a pattern that ${mods.tone.conviction} changes how ${audienceLabel} should approach this.`,
    "story-driven": `Last quarter, ${voice === "I" ? "I watched" : "we watched"} a team throw out their entire playbook. Their CEO called it "terrifying." Their board called it "reckless."\n\nTheir results called it "the best decision they ever made."`,
  };

  const hook = hookMap[angle];

  if (formats.includes("linkedinLong")) {
    const deepDiveSections = mods.depth.sections >= 4 ? `\n\n**4. The Systemic Pattern**\n${insight3 || insight1}. This isn't an isolated case — it's a ${mods.seniority.lens} pattern that ${audienceLabel} encounter repeatedly when facing ${mods.seniority.pain}.` : "";
    const extraProof = mods.depth.proofPoints >= 3 ? `\n→ Question every "best practice" that's older than 18 months.` : "";

    drafts.linkedinLong = `${hook}

---

${mods.tone.qualifier}Here's what most ${audienceLabel} get wrong:

They believe ${belief.replace(/"/g, "")}. It feels true. It sounds logical. And it's the reason they're stuck.

${thesis}.

${voice === "I" ? "I've" : "We've"} seen this play out across dozens of organizations dealing with ${mods.seniority.pain}. The pattern is consistent:

**1. The Misdiagnosis**
${insight1}. Teams invest months optimizing a process that shouldn't exist in the first place.

**2. The Hidden Cost**
${dataPoint}. That's not a marginal improvement waiting to happen — it's a ${mods.tone.conviction} fundamental misalignment between effort and outcome.

**3. The Counterintuitive Fix**
${insight2}. The organizations that break through don't try harder. They reframe the problem entirely.${deepDiveSections}

**The uncomfortable truth?**
${controversial}.

---

Here's what ${voice === "I" ? "I" : "we"} recommend for ${audienceLabel}:

→ Stop measuring what's easy. Start measuring what matters.
→ Challenge one assumption this week. Just one.${extraProof}
→ Ask your team: "If we started from scratch today, would we build it this way?"

The answer will tell you everything you need to know.

${voice === "I" ? "I" : "We"} just published the full research behind this framework. Link in comments.

What's the one ${mods.seniority.lens} assumption you haven't questioned in over a year?

#ThoughtLeadership #Strategy #Leadership`;
  }

  if (formats.includes("linkedinShort")) {
    const shortExtra = mods.depth.detail !== "brief" ? `\n\n→ ${insight2}` : "";
    drafts.linkedinShort = `${angle === "contrarian" ? `${mods.tone.opener}` : angle === "story-driven" ? "A story most people won't tell you" : "The data doesn't lie"}:

${mods.tone.qualifier}${belief.replace(/"/g, "")} — this is the #1 thing holding ${audienceLabel} back.

${dataPoint}.

But here's what nobody's talking about:

${controversial.charAt(0).toLowerCase() + controversial.slice(1)}.

The fix isn't more effort. It's better ${mods.seniority.lens} framing.

→ ${insight1}${shortExtra}

${voice === "I" ? "I" : "We"} break down the full framework in our latest research.

What would change if you questioned your biggest ${mods.seniority.lens} assumption today?

#Strategy #Leadership #Innovation`;
  }

  if (formats.includes("sponsoredAds")) {
    const adHookMap = {
      contrarian: `${mods.tone.qualifier}${belief.replace(/"/g, "")}? Think again.`,
      educational: `${dataPoint}. Here's what ${audienceLabel} need to know.`,
      "story-driven": `One team threw out the playbook. The results speak for themselves.`,
    };
    const adProofPoints = [`→ ${insight1}`, `→ ${insight2}`];
    if (mods.depth.proofPoints >= 3) adProofPoints.push(`→ ${dataPoint}`);

    drafts.sponsoredAds = `**PRIMARY TEXT**

${adHookMap[angle]}

${thesis}.

${voice === "I" ? "I've" : "We've"} studied the pattern across dozens of organizations facing ${mods.seniority.pain}:
${adProofPoints.join("\n")}

${mods.tone.opener}: ${controversial.charAt(0).toLowerCase() + controversial.slice(1)}.

Get the full framework — link below.

---

**HEADLINE (max 150 chars)**
${thesis.slice(0, 140)}

**DESCRIPTION (max 70 chars)**
The ${mods.seniority.lens} playbook for ${audienceLabel} who act.

**CTA BUTTON:** Learn More

---

**AD VARIANT B — Single Image / Carousel Card**

${adHookMap[angle]}

Most ${audienceLabel} believe ${belief.replace(/"/g, "").toLowerCase()}.

The data says otherwise: ${dataPoint.toLowerCase()}.

${voice === "I" ? "I" : "We"} break down the counterintuitive fix →

**CTA BUTTON:** Download Now`;
  }

  return drafts;
}

// ============================================================
// CONTENT BRIEF CONSTRUCTION
// ============================================================

function buildContentBrief(
  analysis: SourceAnalysis,
  perspective: UserPerspective,
  settings: ContentSettings
): ContentBrief {
  const insightSnippet = analysis.keyInsights.slice(0, 2).join(". ");
  const reportSummary = `${analysis.coreThesis}. ${insightSnippet}`;

  const audience = analysis.likelyAudience || "your target audience";
  const topic = perspective.topic || "this space";
  let objective: string;
  if (perspective.goal === "lead-gen") objective = `Generate qualified leads among ${audience}`;
  else if (perspective.goal === "authority") objective = `Establish thought leadership and authority in ${topic}`;
  else if (perspective.goal === "engagement") objective = `Drive meaningful engagement and conversation around ${topic}`;
  else objective = `Build authority and drive engagement among ${audience}`;

  let userNarrative: string | null = null;
  if (perspective.challengedBelief) userNarrative = `Challenge the belief that ${perspective.challengedBelief}`;
  else if (perspective.role) userNarrative = `Positioning from the perspective of a ${perspective.role}${perspective.company ? ` in ${perspective.company}` : ""}`;

  const toneDescriptions: Record<ToneOption, string> = {
    authoritative: "Confident, direct, backed by evidence",
    conversational: "Approachable, relatable, first-person",
    provocative: "Contrarian, challenge-first, opinionated",
    visionary: "Forward-looking, big-picture, aspirational",
  };
  const tone = toneDescriptions[settings.tone];

  let voice: string;
  if (perspective.brandType === "founder") voice = "Personal brand — first-person, authentic, story-driven";
  else if (perspective.brandType === "company") voice = "Brand voice — authoritative, institutional, solutions-focused";
  else voice = "Professional individual — expert perspective, credibility-led";

  const narrativeAngle = analysis.recommendedNarrativeAngle || "a data-driven narrative";
  const controversial = analysis.controversialClaim
    ? (analysis.controversialClaim.length > 60 ? analysis.controversialClaim.slice(0, 60) + "…" : analysis.controversialClaim)
    : "conventional thinking";
  const goalLabel = perspective.goal || "authority";
  const proposedApproach = `Lead with ${narrativeAngle}. Challenge ${controversial}. Target ${audience} with a ${goalLabel}-focused narrative.`;

  return {
    reportSummary, objective, userNarrative, tone, voice, proposedApproach,
    brand: perspective.company || null,
    persona: "Performance Marketer",
    channel: "LinkedIn",
    confirmed: false,
  };
}

// ============================================================
// ENGINE ACTIONS TYPE
// ============================================================

interface EngineActions {
  addMessage: (msg: Omit<ChatMessage, "id" | "timestamp">) => void;
  updateDrafts: (drafts: Partial<DraftContent>) => void;
  setPhase: (phase: SessionState["phase"]) => void;
  setSourceText: (text: string) => void;
  setSourceAnalysis: (analysis: SourceAnalysis) => void;
  setIntakeRevisionTarget: (target: SessionState["intakeRevisionTarget"]) => void;
  updateStrategicPosition: (pos: Partial<StrategicPosition>) => void;
  setSelectedAngle: (angle: AngleOption) => void;
  setSelectedFormats: (formats: FormatOption[]) => void;
  setPositioningStep: (step: number) => void;
  setClarityScore: (score: number) => void;
  updatePerspective: (p: Partial<UserPerspective>) => void;
  setContentBrief: (brief: ContentBrief | null) => void;
  updateContentBrief: (updates: Partial<ContentBrief>) => void;
  updateSettings: (settings: Partial<ContentSettings>) => void;
  pushDraftHistory: (label: string) => void;
  popDraftHistory: () => import("@/types/content").DraftSnapshot | null;
}

// ============================================================
// GLOBAL COMMAND ROUTER
// Handles cross-phase commands that should work from ANY phase.
// ============================================================

const TONE_NAMES: Record<string, ToneOption> = {
  authoritative: "authoritative",
  conversational: "conversational",
  provocative: "provocative",
  visionary: "visionary",
};

function hasDraftContent(drafts: DraftContent): boolean {
  return Object.values(drafts).some((d) => d.trim().length > 0);
}

function handleGlobalCommand(
  input: string,
  session: SessionState,
  actions: EngineActions
): boolean {
  // Strip navigation chip prefix
  const cleaned = input.trim().replace(/^←\s*/, "");
  const lower = cleaned.toLowerCase();

  // ── Change angle from any phase ──
  if (
    /\b(change|switch|try|use|set)\s+(the\s+)?(angle\s+to\s+|to\s+)?(contrarian|educational|story[- ]?driven)\b/i.test(lower) ||
    /\b(different|another|new)\s+angle\b/i.test(lower) ||
    lower === "change angle" || lower === "try a different angle"
  ) {
    const newAngle = detectAngle(cleaned);
    if (newAngle && session.sourceAnalysis) {
      actions.setSelectedAngle(newAngle);
      if (hasDraftContent(session.drafts)) {
        actions.pushDraftHistory(`Angle changed to ${newAngle}`);
        runDraftGeneration(session, session.selectedFormats, newAngle, actions);
        return true;
      }
      actions.setPhase("format");
      actions.addMessage({
        role: "assistant",
        content: `Angle switched to **${newAngle}**. Ready to generate drafts with the new angle?`,
        options: ["All Three — let's go! 🚀", "Let me pick formats"],
      });
      return true;
    }
    // No specific angle mentioned — ask which one
    actions.addMessage({
      role: "assistant",
      content: `Current angle is **${session.selectedAngle || "not set"}**. Which angle would you like?\n\n**Contrarian** — Lead with what everyone's getting wrong.\n**Educational** — Lead with data and frameworks.\n**Story-Driven** — Lead with a narrative.`,
      options: ["Contrarian", "Educational Authority", "Story-Driven Insight"],
    });
    return true;
  }

  // ── Change tone from any phase ──
  if (/\b(change|switch|set|make)\s+(the\s+)?tone\b/i.test(lower) || /\btone\s+to\s+(\w+)/i.test(lower)) {
    const toneMatch = lower.match(/(?:tone\s+to\s+|try\s+|use\s+|switch\s+to\s+)(authoritative|conversational|provocative|visionary)/i);
    if (toneMatch) {
      const newTone = TONE_NAMES[toneMatch[1].toLowerCase()];
      if (newTone) {
        actions.updateSettings({ tone: newTone });
        if (hasDraftContent(session.drafts)) {
          actions.pushDraftHistory(`Tone changed to ${newTone}`);
        }
        actions.addMessage({
          role: "assistant",
          content: `Tone updated to **${newTone}**. ${hasDraftContent(session.drafts) ? "Drafts will regenerate with the new tone." : "This will apply when drafts are generated."}`,
        });
        return true;
      }
    }
    // No specific tone mentioned — ask which one
    actions.addMessage({
      role: "assistant",
      content: "Which tone would you like?",
      options: ["Authoritative", "Conversational", "Provocative", "Visionary"],
    });
    return true;
  }

  // ── Go back to brief / strategy ──
  if (
    /\b(go\s*back\s*(to)?\s*(the)?\s*(brief|strategy|analysis))\b/i.test(lower) ||
    /\b(edit|change|update|reopen)\s+(the\s+)?(brief|strategy)\b/i.test(lower) ||
    /\b(back\s+to\s+(brief|strategy))\b/i.test(lower) ||
    lower === "edit strategy brief"
  ) {
    if (session.contentBrief) {
      actions.updateContentBrief({ confirmed: false });
      actions.setPhase("positioning");
      actions.addMessage({
        role: "assistant",
        content: "No problem — the brief is unlocked for editing. Make your changes on the right panel, then confirm when ready.",
        options: ["Looks right — confirm ✓", "Change the objective", "Change the tone", "Update the narrative"],
      });
      return true;
    }
    if (session.sourceAnalysis) {
      actions.setPhase("intake");
      actions.addMessage({
        role: "assistant",
        content: "Back to strategy view. You can edit the analysis on the right panel, or tell me what to change.",
        options: ["Looks great — let's move on", "Adjust the thesis", "The contrarian angle needs work", "Add a missing insight"],
      });
      return true;
    }
  }

  // ── Change audience / go back to positioning questions ──
  if (
    /\b(change|switch|update|pick|choose|set)\s+(the\s+|a\s+|my\s+)?(audience|target\s+audience|reaction|desired\s+reaction|challenged?\s+belief|objective|voice|brand\s+type)\b/i.test(lower) ||
    /\b(go\s*back\s*(to)?\s*(the)?\s*(audience|positioning|questions?))\b/i.test(lower) ||
    /\b(different|another|new)\s+(audience|target)\b/i.test(lower) ||
    /\b(back\s+to\s+(audience|positioning))\b/i.test(lower)
  ) {
    // Detect which positioning field the user wants to change
    const fieldMatch = lower.match(/\b(audience|target\s+audience|reaction|desired\s+reaction|challenged?\s+belief|objective|voice|brand\s+type|positioning|questions?)\b/i);
    const field = fieldMatch ? fieldMatch[1].toLowerCase() : "audience";

    const questionIdx =
      field.includes("reaction") ? 0
      : field.includes("belief") ? 1
      : field.includes("objective") ? 2
      : field.includes("voice") || field.includes("brand") ? 3
      : -1; // audience or generic "positioning"

    if (questionIdx >= 0 && questionIdx < ALL_POSITIONING_QUESTIONS.length) {
      const q = ALL_POSITIONING_QUESTIONS[questionIdx];
      // Reset to positioning phase at the right step
      if (session.contentBrief?.confirmed) {
        actions.updateContentBrief({ confirmed: false });
      }
      actions.setPhase("positioning");
      actions.setPositioningStep(questionIdx);
      actions.addMessage({
        role: "assistant",
        content: `No problem — let's revisit this.\n\n${q.question}`,
        options: q.options,
      });
      return true;
    }

    // Generic "change audience" or "go back to positioning"
    actions.setPhase("positioning");
    if (session.contentBrief?.confirmed) {
      actions.updateContentBrief({ confirmed: false });
    }
    const audienceQ = ALL_POSITIONING_QUESTIONS[0];
    actions.setPositioningStep(0);
    actions.addMessage({
      role: "assistant",
      content: `Sure — let's revisit the positioning. Current audience: **${session.strategicPosition.audience || "not set"}**.\n\n${audienceQ.question}`,
      options: audienceQ.options,
    });
    return true;
  }

  // ── Undo last draft edit ──
  if (/\b(undo|revert|go\s*back|previous\s*version|roll\s*back)\b/i.test(lower) && session.phase === "refine") {
    const popped = actions.popDraftHistory();
    if (popped) {
      actions.addMessage({
        role: "assistant",
        content: `Reverted to before "${popped.label}". The previous version is back in the editor.`,
        options: REFINE_ENTRY_OPTIONS,
      });
    } else {
      actions.addMessage({
        role: "assistant",
        content: "No previous versions to revert to — this is the original draft.",
      });
    }
    return true;
  }

  // ── New source / start over with analysis ──
  if (/\b(new\s+source|different\s+source|start\s+over\s+with|re-?upload|upload\s+new)\b/i.test(lower)) {
    actions.setPhase("intake");
    actions.setSourceAnalysis(null as unknown as SourceAnalysis);
    actions.addMessage({
      role: "assistant",
      content: "Sure — paste or upload your new source material and I'll re-analyze from scratch.",
    });
    return true;
  }

  return false;
}

// ============================================================
// REFINE OPTIONS (used in multiple places)
// ============================================================

const REFINE_ENTRY_OPTIONS = [
  "The hook could be stronger 🪝",
  "It feels a bit generic",
  "Needs more authority / proof",
  "Could use more tension",
  "CTA feels weak",
  "Too long — tighten it up",
  "Too safe — make it bolder",
  "Make it more contrarian 🔥",
  "Not sure — diagnose it for me",
];

// ============================================================
// DRAFT GENERATION HELPER (used inside format phase)
// ============================================================

function runDraftGeneration(
  session: SessionState,
  formats: FormatOption[],
  selectedAngle: AngleOption | null,
  actions: EngineActions
) {
  const { sourceText, sourceAnalysis, strategicPosition, settings } = session;
  const { updateDrafts, setPhase, addMessage } = actions;

  if (!sourceAnalysis) return;

  const fullPosition: StrategicPosition = {
    audience: strategicPosition.audience || "Senior Leaders",
    desiredReaction: strategicPosition.desiredReaction || "Rethink their approach",
    challengedBelief: strategicPosition.challengedBelief || "Best practices work for everyone",
    objective: strategicPosition.objective || "Build awareness",
    voice: strategicPosition.voice || "Personal",
  };

  const drafts = generateDrafts(sourceText, sourceAnalysis, fullPosition, selectedAngle || "contrarian", formats, settings);
  updateDrafts(drafts);
  setPhase("refine");

  try {
    addTopicEntry({
      topic: sourceAnalysis.coreThesis.slice(0, 100),
      keywords: sourceAnalysis.keyInsights.slice(0, 5).map((i) => i.split(" ").slice(0, 3).join(" ")),
      angle: selectedAngle || "contrarian",
      audience: strategicPosition.audience || "General",
      formats,
    });
  } catch { /* localStorage may fail silently */ }

  addMessage({
    role: "assistant",
    content: `Your drafts are ready! 🎉 Check them out in the right panel.\n\nI'd love to help you make them even better. **What's your first impression — anything feel off or want some polish?**\n\nHere are some common starting points:`,
    options: [
      ...REFINE_ENTRY_OPTIONS,
      "← Change angle",
      "← Edit strategy brief",
    ],
  });
}

// ============================================================
// MAIN CONVERSATION ENGINE
// ============================================================

export function useConversationEngine() {
  const processUserInput = useCallback(
    async (
      input: string,
      session: SessionState,
      actions: EngineActions,
      pdfResult?: PDFParseResult
    ) => {
      const {
        phase, positioningStep, sourceText, sourceAnalysis,
        intakeRevisionTarget, strategicPosition, selectedAngle, settings,
      } = session;
      const {
        addMessage, setPhase, setSourceText, setSourceAnalysis, setIntakeRevisionTarget,
        updateStrategicPosition, setSelectedAngle, setSelectedFormats, setPositioningStep,
        updateDrafts, setClarityScore, updatePerspective, setContentBrief,
        updateContentBrief, updateSettings,
      } = actions;

      const proceed = isProceedIntent(input);

      // ======================================================
      // GLOBAL COMMANDS — work from any phase
      // ======================================================
      if (!pdfResult && handleGlobalCommand(input, session, actions)) {
        return;
      }

      // ======================================================
      // PHASE 1 — SOURCE INTAKE
      // ======================================================
      if (phase === "intake" || phase === "analyzing") {
        if (sourceAnalysis) {
          const trimmedInput = input.trim();
          const lowerInput = trimmedInput.toLowerCase();

          // ✅ ANY proceed signal → move to brief / positioning
          if (proceed) {
            setIntakeRevisionTarget(null);
            const perspective = session.perspective || {};
            const brief = buildContentBrief(sourceAnalysis, perspective, settings);
            setContentBrief(brief);
            const audienceFromSettings = settings.seniority === "executive"
              ? "Executive leaders (VP+, C-suite)"
              : "Professionals and practitioners";
            updateStrategicPosition({ audience: audienceFromSettings });
            setPhase("positioning");

            const hasStrongSignals = perspective.goal || perspective.brandType || perspective.challengedBelief;
            const briefMessage = hasStrongSignals
              ? "I pulled a lot of context from your document. This brief looks solid — does it match your intent?\n\nReview the **Content Brief** on the right — edit anything that's off, or tell me what to change here in chat.\n\nWhen it looks right, hit **Confirm Brief →** to start building your content strategy."
              : "I've set up a brief based on your topic. Fill in any missing details on the right — especially your objective and brand — then confirm when ready.\n\nReview the **Content Brief** on the right panel.";

            setTimeout(() => {
              addMessage({
                role: "assistant",
                content: `Here's what I understood from your document. 📋\n\n${briefMessage}`,
                options: [
                  "Looks right — confirm ✓",
                  "Change the objective",
                  "Change the tone",
                  "Add my brand name",
                  "Update the narrative",
                ],
              });
            }, 600);
            return;
          }

          const detectedTarget = getIntakeTarget(trimmedInput) || intakeRevisionTarget;
          const revisedText = extractRevisionText(trimmedInput);
          const wantsReextract =
            lowerInput.includes("re-extract") || lowerInput.includes("reanalyze") ||
            lowerInput.includes("re-analyze") || lowerInput.includes("updated material") ||
            lowerInput.includes("new source");

          const effectiveRevision = revisedText
            || (intakeRevisionTarget && detectedTarget === intakeRevisionTarget ? trimmedInput : null);

          if (detectedTarget && effectiveRevision) {
            const oldValue = detectedTarget === "thesis" ? sourceAnalysis.coreThesis
              : detectedTarget === "insights" ? sourceAnalysis.keyInsights.join("; ")
              : detectedTarget === "contrarian" ? sourceAnalysis.controversialClaim
              : detectedTarget === "audience" ? (sourceAnalysis.likelyAudience || "")
              : detectedTarget === "commercial" ? (sourceAnalysis.commercialImplication || "")
              : detectedTarget === "data" ? (sourceAnalysis.dataPoints[0] || "") : "";

            const revisedAnalysis = applyIntakeRevision(sourceAnalysis, detectedTarget, effectiveRevision, trimmedInput);
            setSourceAnalysis(revisedAnalysis);
            setIntakeRevisionTarget(null);
            const truncOld = oldValue.length > 80 ? oldValue.slice(0, 80) + "…" : oldValue;
            setTimeout(() => {
              addMessage({
                role: "assistant",
                content: `✅ **${detectedTarget.charAt(0).toUpperCase() + detectedTarget.slice(1)}** updated!\n\n**Before:** ${truncOld}\n**After:** ${effectiveRevision}\n\n${buildAnalysisSummary(revisedAnalysis)}`,
                options: ["Looks great — let's move on", "Adjust the thesis", "The contrarian angle needs work", "Add a missing insight"],
              });
            }, 400);
            return;
          }

          if (detectedTarget) {
            setIntakeRevisionTarget(detectedTarget);
            setTimeout(() => { addMessage({ role: "assistant", content: getIntakePrompt(detectedTarget) }); }, 350);
            return;
          }

          if (wantsReextract) {
            if (trimmedInput.length < 260) {
              setTimeout(() => {
                addMessage({ role: "assistant", content: "Of course! Just paste the updated source material (or upload a new file) and I'll re-extract everything fresh." });
              }, 300);
              return;
            }
            setSourceText(trimmedInput);
            setPhase("analyzing");
            addMessage({ role: "assistant", content: "Re-analyzing your updated material — give me a moment to pull out the strategic gems... ✨" });
            try {
              const result = await analyzeDocumentWithAI(trimmedInput, trimmedInput.length < 300 ? "topic" : "document");
              setSourceAnalysis(result.analysis);
              if (Object.keys(result.perspective).length > 0) updatePerspective(result.perspective);
              setIntakeRevisionTarget(null);
              setPhase("intake");
              addMessage({
                role: "assistant",
                content: buildAnalysisSummary(result.analysis),
                options: ["Looks great — let's move on", "Adjust the thesis", "The contrarian angle needs work", "Add a missing insight"],
              });
            } catch (err) {
              console.error("AI re-analysis failed:", err);
              setPhase("intake");
              addMessage({ role: "assistant", content: `Hmm, the re-analysis hit a snag: ${err instanceof Error ? err.message : "Unknown error"}. Could you try pasting a shorter excerpt?` });
            }
            return;
          }

          setTimeout(() => {
            addMessage({
              role: "assistant",
              content: "I can help with targeted edits! Try something like:\n• **Thesis: ...** to update the core claim\n• **Contrarian: ...** to sharpen the angle\n• **Insights:** for a bullet list\n\nOr just say **\"Looks great — let's move on\"** when you're happy with it! 😊",
            });
          }, 350);
          return;
        }

        // First time — send to AI for extraction
        const isTopicInput = !pdfResult && input.trim().length < 300;
        const inputType = pdfResult ? "document" : (isTopicInput ? "topic" : "document") as "topic" | "document";
        const isPDF = !!pdfResult;
        setSourceText(input);
        setPhase("analyzing");

        if (isPDF) {
          addMessage({ role: "assistant", content: "Got it! Analyzing your document — this may take a moment... 🧠" });
        } else {
          addMessage({
            role: "assistant",
            content: isTopicInput
              ? "Interesting topic! Let me think about the best strategic angles for this... 🧠"
              : "Great — let me dig into your material and pull out the strategic core. This usually takes just a moment... ✨",
          });
        }

        try {
          let analysis: SourceAnalysis;
          if (isPDF) {
            const multiResult = await analyzeMultimodalDocument(pdfResult!);
            analysis = {
              ...multiResult.sourceAnalysis,
              visualAnalysis: multiResult.visualAnalysis,
              recommendedNarrativeAngle: multiResult.recommendedNarrativeAngle,
              suggestedHook: multiResult.suggestedHook,
              primaryKeyword: multiResult.primaryKeyword,
              hashtags: multiResult.hashtags,
            };
            if (multiResult.meta?.truncated) {
              addMessage({ role: "assistant", content: "⚠️ **Note:** Your document was large — only a portion was analyzed due to the number of images. For best results, try uploading a shorter document or one with fewer visuals." });
            }
          } else {
            const result = await analyzeDocumentWithAI(input, inputType);
            analysis = result.analysis;
            if (Object.keys(result.perspective).length > 0) updatePerspective(result.perspective);
            if (result.meta?.truncated) {
              addMessage({ role: "assistant", content: "⚠️ **Note:** Your document was long — only the first ~15,000 characters were analyzed. Key conclusions may have been missed if they appeared later in the document." });
            }
          }

          setSourceAnalysis(analysis);
          setIntakeRevisionTarget(null);
          setPhase("intake");

          let summary = buildAnalysisSummary(analysis);

          if (analysis.visualAnalysis && analysis.visualAnalysis.length > 0) {
            const selectedVisuals = analysis.visualAnalysis.filter(v => v.selectedForPost);
            if (selectedVisuals.length > 0) {
              const visualSummary = selectedVisuals.map((v, i) => {
                const statusIcon = v.feedReadiness === "ready" ? "✅" : v.feedReadiness === "needs_simplification" ? "🔄" : "🔁";
                return `${i + 1}. **${v.type.charAt(0).toUpperCase() + v.type.slice(1)}** — ${v.strategicInsight.slice(0, 100)}\n   ${statusIcon} ${v.recommendation}${v.placementHint ? ` · *${v.placementHint}*` : ""}`;
              }).join("\n");
              summary += `\n\n---\n\n**📊 Selected Visuals for Post (${selectedVisuals.length}):**\n${visualSummary}`;
            }
          }
          if (analysis.suggestedHook) summary += `\n\n**🪝 Suggested Hook:**\n> ${analysis.suggestedHook}`;
          if (analysis.recommendedNarrativeAngle) summary += `\n\n**🎯 Narrative Angle:**\n> ${analysis.recommendedNarrativeAngle}`;
          if (analysis.hashtags && analysis.hashtags.length > 0) summary += `\n\n**#️⃣ Hashtags:** ${analysis.hashtags.join(" ")}`;

          addMessage({
            role: "assistant",
            content: summary,
            options: ["Looks great — let's move on", "Adjust the thesis", "The contrarian angle needs work", "Add a missing insight"],
          });
        } catch (err) {
          console.error("AI analysis failed:", err);
          setPhase("intake");
          addMessage({ role: "assistant", content: `Oops — the analysis didn't work: ${err instanceof Error ? err.message : "Unknown error"}. Could you try again or paste a shorter excerpt?` });
        }
        return;
      }

      // ======================================================
      // PHASE 2 — STRATEGIC POSITIONING
      // ======================================================
      if (phase === "positioning") {
        const lower = input.toLowerCase();
        const { contentBrief } = session;

        // --- Brief confirmation flow ---
        if (contentBrief && !contentBrief.confirmed) {

          // ✅ ANY proceed signal confirms the brief
          if (proceed) {
            updateContentBrief({ confirmed: true });

            const perspective = session.perspective || {};
            const autoFilled: Partial<StrategicPosition> = {};
            if (perspective.goal) {
              const goalMap: Record<string, string> = {
                authority: "Authority — thought leadership",
                engagement: "Engagement — maximize reach & comments",
                "lead-gen": "Lead gen — drive pipeline & conversions",
              };
              autoFilled.objective = goalMap[perspective.goal] || perspective.goal;
            }
            if (perspective.brandType) {
              autoFilled.voice = perspective.brandType === "founder"
                ? "Founder brand — personal voice"
                : "Company brand — editorial voice";
            }
            if (perspective.challengedBelief) autoFilled.challengedBelief = perspective.challengedBelief;
            if (Object.keys(autoFilled).length > 0) updateStrategicPosition(autoFilled);

            const remainingQuestions = ALL_POSITIONING_QUESTIONS.filter((q) => !autoFilled[q.key]);

            if (remainingQuestions.length === 0) {
              setPhase("angle");
              setPositioningStep(ALL_POSITIONING_QUESTIONS.length);
              const audienceFromSettings = settings.seniority === "executive" ? "Executive leaders (VP+, C-suite)" : "Professionals and practitioners";
              const score = calculateClarityScore({
                ...session,
                strategicPosition: { ...session.strategicPosition, audience: audienceFromSettings, ...autoFilled },
              });
              setClarityScore(score);
              setTimeout(() => {
                addMessage({
                  role: "assistant",
                  content: `Perfect. Building your content strategy now... 🎯\n\nNow for the fun part — **choosing your angle!**\n\n**🔥 Contrarian** — Lead with what everyone's getting wrong.\n**🎓 Educational Authority** — Lead with data and frameworks.\n**📖 Story-Driven Insight** — Lead with a narrative.\n\nWhich one feels most *you* for this piece?`,
                  options: ["Contrarian", "Educational Authority", "Story-Driven Insight", "← Change audience"],
                });
              }, 600);
              return;
            }

            setPositioningStep(0);
            const q = remainingQuestions[0];
            const questionCount = remainingQuestions.length;
            setTimeout(() => {
              addMessage({
                role: "assistant",
                content: `Perfect. Building your content strategy now... 🔒\n\nI've got ${questionCount === 1 ? "just 1 quick question" : `${questionCount} quick questions`} to sharpen the strategy.\n\n${q.question}`,
                options: q.options,
              });
            }, 600);
            return;
          }

          // Brief field update commands
          const briefFieldMap: Record<string, BriefField> = {
            "change the objective": "objective",
            "update objective": "objective",
            "change the tone": "tone",
            "update tone": "tone",
            "add my brand": "brand",
            "add brand": "brand",
            "brand name": "brand",
            "update the narrative": "userNarrative",
            "change narrative": "userNarrative",
            "update narrative": "userNarrative",
          };

          let matchedBriefField: BriefField | null = null;
          for (const [keyword, field] of Object.entries(briefFieldMap)) {
            if (lower.includes(keyword)) { matchedBriefField = field; break; }
          }

          const pendingBriefField = session.intakeRevisionTarget as string | null;
          const briefFields: BriefField[] = ["reportSummary", "objective", "userNarrative", "tone", "voice", "proposedApproach", "brand"];
          if (pendingBriefField && briefFields.includes(pendingBriefField as BriefField)) {
            if (pendingBriefField === "tone") {
              const toneMap: Record<string, ToneOption> = {
                authoritative: "authoritative", conversational: "conversational",
                provocative: "provocative", visionary: "visionary",
              };
              const matchedTone = toneMap[lower] || null;
              if (matchedTone) {
                updateSettings({ tone: matchedTone });
                const toneDescriptions: Record<ToneOption, string> = {
                  authoritative: "Confident, direct, backed by evidence",
                  conversational: "Approachable, relatable, first-person",
                  provocative: "Contrarian, challenge-first, opinionated",
                  visionary: "Forward-looking, big-picture, aspirational",
                };
                updateContentBrief({ tone: toneDescriptions[matchedTone] });
              }
            } else {
              updateContentBrief({ [pendingBriefField]: input.trim() || null });
            }
            setIntakeRevisionTarget(null);
            setTimeout(() => {
              addMessage({ role: "assistant", content: `Updated! Anything else to adjust, or are we good to go?`, options: ["Looks right — confirm ✓"] });
            }, 300);
            return;
          }

          if (matchedBriefField) {
            if (matchedBriefField === "tone") {
              setTimeout(() => {
                addMessage({ role: "assistant", content: "Which tone do you prefer?", options: ["Authoritative", "Conversational", "Provocative", "Visionary"] });
              }, 300);
              setIntakeRevisionTarget(matchedBriefField as any);
              return;
            }
            const prompts: Record<BriefField, string> = {
              objective: "What should the objective be?",
              brand: "What's your brand or company name?",
              userNarrative: "What's the core belief or narrative you want this content to challenge or reinforce?",
              reportSummary: "How would you describe what we should focus on?",
              voice: "What voice style should we use?",
              proposedApproach: "What approach would you prefer?",
              tone: "",
            };
            setIntakeRevisionTarget(matchedBriefField as any);
            setTimeout(() => { addMessage({ role: "assistant", content: prompts[matchedBriefField!] }); }, 300);
            return;
          }

          // Fallback
          setTimeout(() => {
            addMessage({
              role: "assistant",
              content: "Take a look at the Content Brief on the right — edit anything that's off, or use the quick options below.",
              options: ["Looks right — confirm ✓", "Change the objective", "Change the tone", "Add my brand name", "Update the narrative"],
            });
          }, 300);
          return;
        }

        // --- Standard positioning questions (brief confirmed) ---
        const perspective = session.perspective || {};
        const autoFilledKeys = new Set<string>();
        if (perspective.goal) autoFilledKeys.add("objective");
        if (perspective.brandType) autoFilledKeys.add("voice");
        if (perspective.challengedBelief) autoFilledKeys.add("challengedBelief");

        const remainingQuestions = ALL_POSITIONING_QUESTIONS.filter((q) => !autoFilledKeys.has(q.key));

        // ✅ Proceed during positioning questions → skip to angle with defaults
        if (proceed) {
          const score = calculateClarityScore(session);
          setClarityScore(Math.max(score, 7)); // treat as sufficient
          setPhase("angle");
          setTimeout(() => {
            addMessage({
              role: "assistant",
              content: `Got it — skipping ahead! 🎯\n\nNow let's pick your angle:\n\n**🔥 Contrarian** — Lead with what everyone's getting wrong.\n**🎓 Educational Authority** — Lead with data and frameworks.\n**📖 Story-Driven Insight** — Lead with a narrative.\n\nWhich one?`,
              options: ["Contrarian", "Educational Authority", "Story-Driven Insight", "← Change audience"],
            });
          }, 400);
          return;
        }

        const currentQ = remainingQuestions[positioningStep];
        if (currentQ) updateStrategicPosition({ [currentQ.key]: input });

        const nextStep = positioningStep + 1;
        if (nextStep < remainingQuestions.length) {
          setPositioningStep(nextStep);
          const nextQ = remainingQuestions[nextStep];
          const tempScore = 2 + nextStep * 1.2;
          const encouragement = nextStep === 2 ? "We're building something good here!" : nextStep === remainingQuestions.length - 1 ? "Almost there!" : "Nice!";
          setTimeout(() => {
            addMessage({
              role: "assistant",
              content: `${encouragement} Got it: **"${input}"** ✅\n\nClarity score: **${Math.min(Math.round(tempScore), 8)}/10** — looking solid!\n\n${nextQ.question}`,
              options: nextQ.options,
            });
          }, 500);
        } else {
          const score = calculateClarityScore({
            ...session,
            strategicPosition: { ...session.strategicPosition, ...(currentQ ? { [currentQ.key]: input } : {}) },
          });
          setClarityScore(score);

          if (score < 8) {
            setTimeout(() => {
              addMessage({
                role: "assistant",
                content: `Clarity score: **${score}/10** — we're close but not quite at the 8/10 sweet spot yet.\n\nNo worries! A little more clarity will make the drafts significantly better. Want to tighten anything up, or should I suggest what to revisit?`,
                options: ["Re-answer audience question", "Sharpen the challenged belief", "Proceed anyway"],
              });
            }, 500);
          } else {
            setPhase("angle");
            setTimeout(() => {
              addMessage({
                role: "assistant",
                content: `**Clarity score: ${score}/10 ✓** — Strategy is locked and loaded! 🎯\n\nNow for the fun part — **choosing your angle!**\n\n**🔥 Contrarian**\nLead with what everyone's getting wrong.\n\n**🎓 Educational Authority**\nLead with data and frameworks.\n\n**📖 Story-Driven Insight**\nLead with a narrative that pulls people in emotionally.\n\nWhich one feels most *you* for this piece?`,
                options: ["Contrarian", "Educational Authority", "Story-Driven Insight", "← Change audience"],
              });
            }, 600);
          }
        }
        return;
      }

      // ======================================================
      // PHASE 3 — ANGLE SELECTION
      // ======================================================
      if (phase === "angle") {
        // ✅ Detect angle from free text OR chips
        const detectedAngle = detectAngle(input);

        // ✅ Proceed without choosing → default to contrarian
        if (proceed && !detectedAngle) {
          const defaultAngle: AngleOption = "contrarian";
          setSelectedAngle(defaultAngle);
          setClarityScore(10);
          setPhase("format");
          setTimeout(() => {
            addMessage({
              role: "assistant",
              content: `Going with **Contrarian** angle — bold choice! 🔥\n\nWant to pick specific formats, or should I generate all three (Long-Form, Short Post, Sponsored Ad)?`,
              options: ["All Three — let's go! 🚀", "Let me pick formats"],
            });
          }, 400);
          return;
        }

        const angleMap: Record<string, AngleOption> = {
          contrarian: "contrarian",
          "educational authority": "educational",
          educational: "educational",
          "story-driven insight": "story-driven",
          "story-driven": "story-driven",
          story: "story-driven",
          "proceed anyway": "contrarian",
        };
        const angle = detectedAngle || angleMap[input.toLowerCase()] || "contrarian";
        setSelectedAngle(angle);
        setClarityScore(10);
        setPhase("format");

        setTimeout(() => {
          addMessage({
            role: "assistant",
            content: `Great choice — **${angle.charAt(0).toUpperCase() + angle.slice(1)}** angle locked! 🔥\n\nWant to pick specific formats, or should I generate all three (Long-Form, Short Post, Sponsored Ad)?`,
            options: ["All Three — let's go! 🚀", "Let me pick formats"],
          });
        }, 500);
        return;
      }

      // ======================================================
      // PHASE 4 — FORMAT SELECTION
      // ======================================================
      if (phase === "format") {
        const lower = input.toLowerCase();
        const formats: FormatOption[] = [];

        const wantsAll =
          proceed || // ✅ any proceed signal = generate all
          lower.includes("all") ||
          lower.includes("three") ||
          lower.includes("let's go");

        const wantsPick = !wantsAll && (lower.includes("let me pick") || lower.includes("pick format"));

        if (wantsPick) {
          setTimeout(() => {
            addMessage({
              role: "assistant",
              content: "No problem! Which formats do you want?",
              options: ["LinkedIn Long-Form Article", "Short Viral-Style Post", "LinkedIn Sponsored Ads", "All Three"],
            });
          }, 400);
          return;
        }

        if (wantsAll) {
          formats.push("linkedinLong", "linkedinShort", "sponsoredAds");
        } else {
          if (lower.includes("long") || lower.includes("article")) formats.push("linkedinLong");
          if (lower.includes("short") || lower.includes("viral")) formats.push("linkedinShort");
          if (lower.includes("ad") || lower.includes("sponsored")) formats.push("sponsoredAds");
        }

        if (formats.length === 0) formats.push("linkedinLong", "linkedinShort", "sponsoredAds");

        setSelectedFormats(formats);
        setPhase("drafting");

        const formatLabels: Record<FormatOption, string> = {
          linkedinLong: "LinkedIn Long-Form Article",
          linkedinShort: "Short Viral-Style Post",
          sponsoredAds: "LinkedIn Sponsored Ads",
        };

        setTimeout(() => {
          addMessage({
            role: "assistant",
            content: `Perfect! Generating ${formats.map((f) => formatLabels[f]).join(", ")}... ✍️\n\nUsing your **${selectedAngle || "contrarian"}** angle • **${settings.tone}** tone • **${settings.seniority}** audience • **${settings.depth}** depth.\n\nGive me just a moment — your drafts are coming right up! →`,
          });

          setTimeout(() => {
            runDraftGeneration(session, formats, selectedAngle, actions);
          }, 1500);
        }, 500);
        return;
      }

      // ======================================================
      // PHASE 5 — DRAFT & REFINE
      // ======================================================
      if (phase === "refine") {
        const lower = input.toLowerCase();

        const refContext: RefinementContext = {
          audience: strategicPosition.audience,
          angle: selectedAngle || undefined,
          tone: settings.tone,
          objective: strategicPosition.objective,
          voice: strategicPosition.voice,
        };

        const activeDraftKey = session.selectedFormats[0] || "linkedinLong";
        const activeDraft = session.drafts[activeDraftKey] || "";

        if (!activeDraft) {
          addMessage({ role: "assistant", content: "Hmm, there's no draft to refine yet. Try selecting a format tab that has content first!" });
          return;
        }

        // Done / ship (kept as-is — these are substantive signals not just "proceed")
        if (lower.includes("done") || lower.includes("looks good") || lower.includes("ship") || lower.includes("looks great")) {
          addMessage({ role: "assistant", content: "Let me run a quick readiness check to make sure everything's solid... 🔍" });
          try {
            const diagnosis = await diagnoseDraft(activeDraft, refContext);
            const checks = [
              { label: "Hook is strong", pass: diagnosis.hookStrength.score >= 7 },
              { label: "Audience is clear", pass: diagnosis.specificity.score >= 7 },
              { label: "Insight is differentiated", pass: diagnosis.authoritySignal.score >= 7 },
              { label: "No generic phrasing", pass: diagnosis.specificity.score >= 6 },
              { label: "CTA aligns with objective", pass: diagnosis.ctaStrength.score >= 6 },
              { label: "Brand tone preserved", pass: diagnosis.emotionalCharge.score >= 5 },
              { label: "Mobile readability optimized", pass: diagnosis.scrollPattern.score >= 6 },
            ];
            const allPass = checks.every((c) => c.pass);
            const checkList = checks.map((c) => `${c.pass ? "✔" : "✘"} ${c.label}`).join("\n");

            if (allPass) {
              addMessage({
                role: "assistant",
                content: `**Activation Readiness: ALL CLEAR ✓** 🚀\n\n${checkList}\n\n---\n\n**Before you publish, a few things to check:**\n\n💾 **Save your draft** — Click the save icon in the toolbar\n🖼️ **Add a visual** — Posts with images get 2x more engagement\n👁️ **Preview it** — See exactly how it'll look in the LinkedIn feed.\n\nWhen you're ready, just copy and publish! 💪`,
                options: ["Save my draft 💾", "Generate an image 🖼️", "Preview the post 👁️", "Just copy and go! 🚀", "← Try a different angle"],
              });
            } else {
              const failedItems = checks.filter((c) => !c.pass).map((c) => c.label);
              addMessage({
                role: "assistant",
                content: `**Activation Readiness: Almost there!** 🔧\n\n${checkList}\n\nA few things could use a quick tune-up: **${failedItems.join(", ")}**.\n\nWant me to help sharpen any of these? Or if you're happy with it as-is, just ship it!`,
                options: failedItems.slice(0, 4).concat(["Ship it anyway!"]),
              });
            }
          } catch (err) {
            addMessage({ role: "assistant", content: `Readiness check hit a snag: ${err instanceof Error ? err.message : "Unknown error"}. But don't worry — you can still copy and use the draft!` });
          }
          return;
        }

        if (lower.includes("diagnose") || lower.includes("not sure") || lower.includes("audit")) {
          addMessage({ role: "assistant", content: "Good idea! Let me run a full diagnostic across 8 dimensions — this'll show exactly where to focus... 🔬" });
          try {
            const diagnosis = await diagnoseDraft(activeDraft, refContext);
            const dims = [
              { label: "Hook Strength", data: diagnosis.hookStrength },
              { label: "Specificity", data: diagnosis.specificity },
              { label: "Authority Signal", data: diagnosis.authoritySignal },
              { label: "Emotional Charge", data: diagnosis.emotionalCharge },
              { label: "Scroll Pattern", data: diagnosis.scrollPattern },
              { label: "Clarity of Outcome", data: diagnosis.clarityOfOutcome },
              { label: "CTA Strength", data: diagnosis.ctaStrength },
              { label: "Ad Performance", data: diagnosis.adPerformance },
            ];
            const scoreBoard = dims.map((d) => `**${d.label}:** ${d.data.score}/10 — ${d.data.note}`).join("\n");
            addMessage({
              role: "assistant",
              content: `**Draft Diagnostic** 📊\n\n${scoreBoard}\n\n**Overall:** ${diagnosis.overallAssessment}\n**Biggest opportunity:** ${diagnosis.weakestDimension}\n\nI'd suggest tackling the weakest area first — want me to take a crack at it? Or pick any dimension below:`,
              options: ["Stronger hook", "More specificity", "Add authority", "More tension", "Strengthen CTA", "Make it shorter"],
            });
          } catch (err) {
            addMessage({ role: "assistant", content: `Diagnostic hit a snag: ${err instanceof Error ? err.message : "Unknown error"}. Try a specific refinement instead?`, options: REFINE_ENTRY_OPTIONS });
          }
          return;
        }

        if (lower.includes("override") || lower.includes("ship anyway") || lower.includes("ship it") || lower.includes("just copy")) {
          addMessage({ role: "assistant", content: "You got it! Content is cleared for launch. 🚀 Copy from the right panel and go live.\n\n💡 Pro tip: keep an eye on early engagement metrics and we can always iterate for the next post!" });
          return;
        }

        if (lower.includes("save my draft") || lower.includes("save draft") || lower.includes("save it")) {
          addMessage({
            role: "assistant",
            content: "Great idea! 💾 Click the **Save** button in the workflow bar above your draft, or open the **📁 Saved Drafts** panel from the toolbar to save with a custom title.\n\nOnce saved, want to add an image or preview the post?",
            options: ["Generate an image 🖼️", "Preview the post 👁️", "I'm good — let me copy and go!"],
          });
          return;
        }

        if (lower.includes("generate an image") || lower.includes("add image") || lower.includes("add a visual") || lower.includes("image")) {
          addMessage({
            role: "assistant",
            content: "Absolutely! 🖼️ Click the **image icon** (🖼) in the toolbar, or use the workflow bar prompt above your draft. You can type a custom prompt to get exactly the visual you want.\n\n**Pro tip:** Posts with images get **2x more engagement** on LinkedIn!",
            options: ["Preview the post 👁️", "I'm good — ship it! 🚀"],
          });
          return;
        }

        if (lower.includes("preview the post") || lower.includes("preview it") || lower.includes("preview")) {
          addMessage({
            role: "assistant",
            content: "Click the **👁 eye icon** in the toolbar to see a realistic LinkedIn feed preview of your post — with your image, engagement bar, and everything!\n\nLooks ready? Just copy and publish! 🚀",
            options: ["Looks great — we're done! 🎉", "One more tweak…"],
          });
          return;
        }

        // ── Question detection — don't accidentally rewrite the draft ──
        const isQuestion = /^(what|why|how|can you|could you|explain|tell me|show me|where|which|who)\b/i.test(input.trim());
        const isNotEditIntent = isQuestion && !/\b(make|change|fix|update|rewrite|add|remove|replace|shorten|tighten|strengthen)\b/i.test(lower);
        if (isNotEditIntent) {
          const topic = lower.includes("hook") ? "hook"
            : lower.includes("cta") || lower.includes("call to action") ? "CTA"
            : lower.includes("tone") ? "tone"
            : lower.includes("angle") ? "angle"
            : "draft";
          addMessage({
            role: "assistant",
            content: `Good question! Here's a quick look at the current ${topic}:\n\n${topic === "hook" ? `**Current hook:** "${activeDraft.split("\n")[0]?.slice(0, 150)}..."` : topic === "CTA" ? `The draft's call-to-action is in the closing section. Want me to strengthen it?` : topic === "tone" ? `Currently using **${settings.tone}** tone for **${strategicPosition.audience || "your audience"}**.` : topic === "angle" ? `Using the **${selectedAngle || "contrarian"}** angle.` : `The draft is ${activeDraft.length} characters across ${activeDraft.split("\n\n").length} sections.`}\n\nWant me to change anything?`,
            options: REFINE_ENTRY_OPTIONS,
          });
          return;
        }

        // Targeted refinement via AI
        const commandMap: Record<string, string> = {
          "bolder": "Make it bolder: Remove hedging language, increase conviction, strengthen declarative tone, sharpen claim clarity.",
          "generic": "Remove generic phrasing: Replace vague language with specific, data-backed claims. Make every sentence earn its place.",
          "authority": "Add authority: Integrate proof points, add insight framing, clarify implication. Avoid sounding salesy.",
          "tension": "Add more tension: Highlight risk of inaction, clarify cost of status quo, make pain sharper.",
          "cta": "Strengthen CTA: For organic, shift from passive reflection to clear engagement action. For ads, increase urgency, clarify outcome.",
          "shorter": "Make it shorter: Remove repetition, remove soft transitions, compress explanations, preserve hook + insight + CTA.",
          "safe": "Make it less safe: Take a stronger position, challenge assumptions more directly, be willing to polarize.",
          "contrarian": "Make it more contrarian: Introduce a challenged belief, add tension framing, clarify what the industry gets wrong. Maintain credibility.",
          "hook": "Strengthen the hook: Rewrite the first 2-3 lines only. Make it pattern-breaking, shorter, higher contrast.",
          "story": "Add more story: Weave in a specific narrative element that the audience will recognize and relate to.",
          "data": "Add more data: Weave in quantified claims, statistics, and evidence-backed assertions.",
          "thumb-stop": "Improve thumb-stop rate: Rewrite first 2 lines only. Make pattern-breaking. Shorten. Increase contrast.",
          "click-through": "Increase click-through likelihood: Clarify value proposition, create curiosity gap, strengthen CTA.",
          "conversion": "Improve conversion clarity: Make the offer unmistakable, reduce friction, align CTA with user intent.",
          "urgency": "Increase urgency: Add time pressure, clarify cost of delay, sharpen the consequence of inaction.",
          "audience specificity": "Improve audience specificity: Make the reader feel this was written for them specifically. Use their language and pain points.",
          "ads": "Optimize for ad performance: Tighten to ad-length constraints, lead with value, make CTA explicit and action-oriented.",
        };

        let command = "";
        for (const [key, cmd] of Object.entries(commandMap)) {
          if (lower.includes(key)) { command = cmd; break; }
        }
        if (!command) command = input;

        // Snapshot draft before AI refinement for undo
        const commandLabel = command === input ? input.slice(0, 60) : Object.keys(commandMap).find((k) => lower.includes(k)) || input.slice(0, 60);
        actions.pushDraftHistory(commandLabel);

        addMessage({ role: "assistant", content: "On it! Applying your refinement now... ✍️" });

        try {
          const result = await refineDraft(activeDraft, command, refContext);
          const formattedContent = formatDraftContent(result.refinedContent);
          updateDrafts({ [activeDraftKey]: formattedContent });

          const changeLog = result.changelog.map((c) => `• ${c}`).join("\n");
          const reduction = result.percentReduction && result.percentReduction > 0 ? `\n\n📉 ${result.percentReduction}% shorter.` : "";

          addMessage({
            role: "assistant",
            content: `**Here's what I changed:** ✨\n${changeLog}${reduction}\n\nHow does that feel? We can keep iterating or move on when you're happy!`,
            options: [
              "Better! What else can we improve?",
              "Undo this edit",
              "Run a full diagnostic",
              "Looks great — we're done! 🎉",
              "← Change angle",
              "← Edit strategy brief",
            ],
          });
        } catch (err) {
          // Refinement failed — pop the snapshot we just pushed
          actions.popDraftHistory();
          addMessage({
            role: "assistant",
            content: `Refinement hit a snag: ${err instanceof Error ? err.message : "Unknown error"}. Want to try a different approach?`,
            options: REFINE_ENTRY_OPTIONS,
          });
        }
        return;
      }
    },
    []
  );

  return { processUserInput };
}
