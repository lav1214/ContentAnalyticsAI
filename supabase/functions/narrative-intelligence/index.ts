import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a senior LinkedIn strategist, narrative architect, and brand positioning advisor.

Analyze the provided LinkedIn content holistically across these dimensions:

1. NARRATIVE STRENGTH — Does the content have a clear, compelling narrative arc? Is the thesis sharp?
2. POSITIONING — Does it establish a differentiated point of view? Is there a "challenged belief"?
3. BRAND VOICE — Is the tone consistent, credible, and free of generic marketing speak?
4. FEED PERFORMANCE — Will it stop the scroll? Is it mobile-optimized? Does it reward reading?
5. AUTHORITY SIGNAL — Does it demonstrate expertise through specifics, not just claims?
6. THUMB-STOP PROBABILITY — Would someone pause scrolling in a busy feed? Score 0-100.

For Brand Voice violations, flag:
- Generic phrasing ("leverage", "synergy", "thought leader")
- Keyword stuffing
- Emoji overuse
- Hype language without substance
- Inconsistent tone shifts
- Cliché hooks

For Competitive Whitespace, identify:
- What angle is NOT being taken
- What audience is underserved
- What framing is fresh vs overdone

Be surgical. Be specific. No filler.`;

const modeInstructions: Record<string, string> = {
  quick: "Focus only on hook strength and top 3 improvements. Skip deep dimension scoring.",
  deep: "Full analysis across all 6 dimensions with specific line-level rewrites.",
  competitive: "Emphasize whitespace, positioning gaps, and what competitors are doing wrong.",
  voice: "Focus exclusively on brand voice violations. Provide a line-by-line audit.",
};

const NarrativeResultSchema = z.object({
  narrativeStrength: z.object({
    score: z.number(),
    thesis: z.string(),
    arc: z.string(),
    gaps: z.array(z.string()),
  }),
  positioning: z.object({
    score: z.number(),
    differentiator: z.string(),
    challengedBelief: z.string(),
    whitespace: z.array(z.string()),
  }),
  brandVoice: z.object({
    score: z.number(),
    toneLabel: z.string(),
    violations: z.array(z.object({
      text: z.string(),
      issue: z.string(),
      fix: z.string(),
    })),
    consistency: z.string(),
  }),
  feedPerformance: z.object({
    thumbStopProbability: z.number(),
    hookGrade: z.string(),
    mobileReadability: z.number(),
    scrollDepthEstimate: z.string(),
    visualNecessity: z.string(),
    improvements: z.array(z.string()),
  }),
  authoritySignal: z.object({
    score: z.number(),
    proofPoints: z.number(),
    credibilityMarkers: z.array(z.string()),
    missingEvidence: z.array(z.string()),
  }),
  topicAuthority: z.object({
    primaryCluster: z.string(),
    reinforces: z.boolean(),
    diversifies: z.boolean(),
    recommendation: z.string(),
  }),
  overallScore: z.number(),
  topRecommendation: z.string(),
  followUpQuestions: z.array(z.string()).min(2).max(3),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    const { content, context, mode, revisionFocus, userResponses } = await req.json();

    if (!content || typeof content !== "string") {
      return new Response(
        JSON.stringify({ error: "Content is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Mode-aware prompt
    const activeMode = modeInstructions[mode] || modeInstructions["deep"];
    const systemWithMode = SYSTEM_PROMPT + `\n\nAnalysis mode: ${activeMode}`;

    const contextStr = context
      ? `\nContext:\n- Audience: ${context.audience || "Not specified"}\n- Angle: ${context.angle || "Not specified"}\n- Tone: ${context.tone || "Not specified"}\n- Objective: ${context.objective || "Not specified"}`
      : "";

    const topicHistoryStr = context?.topicHistory
      ? `\nPrevious topics covered: ${context.topicHistory.join(", ")}`
      : "";

    const revisionStr = revisionFocus
      ? `\n\nRe-analysis focus: ${revisionFocus}\nUser clarifications: ${JSON.stringify(userResponses || {})}`
      : "";

    const tools = [
      {
        type: "function",
        function: {
          name: "narrative_analysis",
          description: "Full narrative intelligence analysis of LinkedIn content.",
          parameters: {
            type: "object",
            properties: {
              narrativeStrength: {
                type: "object",
                properties: {
                  score: { type: "number", description: "1-100" },
                  thesis: { type: "string", description: "The core thesis identified" },
                  arc: { type: "string", description: "Brief description of the narrative arc" },
                  gaps: { type: "array", items: { type: "string" }, description: "Narrative weaknesses" },
                },
                required: ["score", "thesis", "arc", "gaps"],
              },
              positioning: {
                type: "object",
                properties: {
                  score: { type: "number", description: "1-100" },
                  differentiator: { type: "string", description: "What makes this POV unique" },
                  challengedBelief: { type: "string", description: "The assumption being challenged" },
                  whitespace: { type: "array", items: { type: "string" }, description: "Untaken angles or underserved framing" },
                },
                required: ["score", "differentiator", "challengedBelief", "whitespace"],
              },
              brandVoice: {
                type: "object",
                properties: {
                  score: { type: "number", description: "1-100" },
                  toneLabel: { type: "string", description: "e.g. authoritative, conversational" },
                  violations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        text: { type: "string", description: "The offending text" },
                        issue: { type: "string", description: "What's wrong" },
                        fix: { type: "string", description: "Suggested replacement" },
                      },
                      required: ["text", "issue", "fix"],
                    },
                  },
                  consistency: { type: "string", description: "Assessment of tone consistency" },
                },
                required: ["score", "toneLabel", "violations", "consistency"],
              },
              feedPerformance: {
                type: "object",
                properties: {
                  thumbStopProbability: { type: "number", description: "0-100 percentage" },
                  hookGrade: { type: "string", description: "A/B/C/D/F grade" },
                  mobileReadability: { type: "number", description: "1-100" },
                  scrollDepthEstimate: { type: "string", description: "e.g. '70% will read past fold'" },
                  visualNecessity: { type: "string", description: "Does this need an image to perform? Why?" },
                  improvements: { type: "array", items: { type: "string" }, description: "Feed-specific improvements" },
                },
                required: ["thumbStopProbability", "hookGrade", "mobileReadability", "scrollDepthEstimate", "visualNecessity", "improvements"],
              },
              authoritySignal: {
                type: "object",
                properties: {
                  score: { type: "number", description: "1-100" },
                  proofPoints: { type: "number", description: "Count of specific evidence/data" },
                  credibilityMarkers: { type: "array", items: { type: "string" } },
                  missingEvidence: { type: "array", items: { type: "string" }, description: "Where claims need backing" },
                },
                required: ["score", "proofPoints", "credibilityMarkers", "missingEvidence"],
              },
              topicAuthority: {
                type: "object",
                properties: {
                  primaryCluster: { type: "string", description: "Main topic cluster this strengthens" },
                  reinforces: { type: "boolean", description: "Does this reinforce existing authority?" },
                  diversifies: { type: "boolean", description: "Does this open new territory?" },
                  recommendation: { type: "string", description: "Strategic advice on topic authority" },
                },
                required: ["primaryCluster", "reinforces", "diversifies", "recommendation"],
              },
              overallScore: { type: "number", description: "Composite 1-100 score" },
              topRecommendation: { type: "string", description: "Single most impactful improvement" },
              followUpQuestions: {
                type: "array",
                items: { type: "string" },
                description: "2-3 targeted questions to ask the user that would enable deeper or more focused re-analysis. Make them specific to the weaknesses found — not generic. Frame them as choices where possible.",
                minItems: 2,
                maxItems: 3,
              },
            },
            required: ["narrativeStrength", "positioning", "brandVoice", "feedPerformance", "authoritySignal", "topicAuthority", "overallScore", "topRecommendation", "followUpQuestions"],
            additionalProperties: false,
          },
        },
      },
    ];

    const userMessage = `${revisionStr}Analyze this LinkedIn content for narrative intelligence, strategic positioning, brand voice consistency, feed performance, and authority signals.${contextStr}${topicHistoryStr}\n\nContent:\n${content}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemWithMode },
          { role: "user", content: userMessage },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "narrative_analysis" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(JSON.stringify({
        requestId,
        status: "error",
        error: `AI gateway error: ${response.status} ${errText}`,
        durationMs: Date.now() - startTime,
      }));
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Usage limit reached. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "Analysis failed. Please try again." }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error(JSON.stringify({
        requestId,
        status: "error",
        error: "No tool call in response",
        rawResponse: JSON.stringify(data).slice(0, 500),
        durationMs: Date.now() - startTime,
      }));
      return new Response(
        JSON.stringify({ error: "AI did not return structured result." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result;
    try {
      const raw = JSON.parse(toolCall.function.arguments);
      result = NarrativeResultSchema.parse(raw);
    } catch (validationError) {
      console.error(JSON.stringify({
        requestId,
        status: "validation_error",
        error: String(validationError),
        durationMs: Date.now() - startTime,
      }));
      return new Response(
        JSON.stringify({ error: "AI returned malformed analysis. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(JSON.stringify({
      requestId,
      status: "success",
      mode: mode || "deep",
      contentLength: content.length,
      hasRevisionFocus: !!revisionFocus,
      overallScore: result.overallScore,
      durationMs: Date.now() - startTime,
    }));

    return new Response(
      JSON.stringify({ result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(JSON.stringify({
      requestId,
      status: "error",
      error: e instanceof Error ? e.message : "Unknown error",
      durationMs: Date.now() - startTime,
    }));
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
