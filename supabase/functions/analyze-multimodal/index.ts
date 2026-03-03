import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a multimodal strategic content analyst operating in background mode.

You will receive a PDF document containing text, diagrams, charts, and tables.

Your job:
1. Parse the document silently — do NOT expose raw parsing steps
2. Extract structured insights from BOTH text and visuals
3. Identify the strongest LinkedIn-worthy narrative angle
4. Select only the most strategically relevant visuals
5. Synthesize everything into executive-grade LinkedIn content intelligence

## Text Analysis

From the full document, extract:
- Core thesis: exactly ONE sentence — the document's central argument
- Supporting arguments and differentiating claims
- Key data points with actual numbers
- Strategic implications
- Strong contrarian or provocative angle (if present)

Flag and discard: generic language, overly technical explanations, redundant content.
Condense into executive-level insight with LinkedIn-ready framing.

## Diagram & Visual Analysis

For each image/diagram detected:
- Extract entities (nodes, components), relationships (flows, arrows, hierarchy), inputs/outputs
- Extract implied system logic and strategic insight
- Rate LinkedIn feed-readiness (clean, clear, right aspect ratio)

For each chart:
- Extract main trend, most significant delta, outlier insight, business implication

Do NOT reproduce diagrams unless relevant.

## Visual Relevance Filter

Select visuals ONLY if they:
- Reinforce the primary narrative angle
- Are understandable in LinkedIn feed context (not overly technical or cluttered)
- Strengthen authority or clarity

If a visual is too complex: recommend simplified regeneration and provide a structured image prompt.

## Narrative Synthesis Guidelines

Construct your recommended narrative with:
- Scroll-stopping hook potential (first 2 lines)
- Clear articulation of the core insight
- Simplified explanation of relevant diagram logic (if used)
- Data-backed credibility (if charts present)
- Strategic implication for target audience
- Strong close or call-to-thought

Tone: Executive, authoritative, clear, differentiated. Avoid generic summary tone.

## Discoverability

Identify:
- Primary keyword for LinkedIn search visibility
- 3-5 semantically aligned hashtags
- Semantic variations for LLM discoverability

## Guardrails

- Do NOT reveal full document content
- Do NOT summarize page-by-page
- Do NOT expose raw extraction steps
- Prioritize strategic synthesis over completeness
- Only surface visuals that add narrative value

Be opinionated. Be specific. Do not hedge. Do not summarize — INTERPRET.

You MUST respond by calling the extract_multimodal_insights function with your analysis.`;

const VisualAnalysisItemSchema = z.object({
  pageNumber: z.number().optional(),
  type: z.enum(["diagram", "chart", "table", "image", "process_model"]),
  description: z.string(),
  strategicInsight: z.string(),
  feedReadiness: z.enum(["ready", "needs_simplification", "replace"]),
  recommendation: z.string(),
  selectedForPost: z.boolean(),
  placementHint: z.string().optional(),
  regenerationPrompt: z.string().optional(),
});

const MultimodalAnalysisSchema = z.object({
  coreThesis: z.string(),
  keyInsights: z.array(z.string()).min(3).max(5),
  mostSurprisingStatistic: z.string(),
  mostDefensibleClaim: z.string(),
  controversialIdea: z.string(),
  likelyAudience: z.string(),
  commercialImplication: z.string(),
  visualAnalysis: z.array(VisualAnalysisItemSchema),
  recommendedNarrativeAngle: z.string(),
  suggestedHook: z.string(),
  primaryKeyword: z.string(),
  hashtags: z.array(z.string()).min(3).max(5),
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
    const { text, pageImages, detectedVisuals } = await req.json();

    if (!text || typeof text !== "string" || text.trim().length < 10) {
      return new Response(
        JSON.stringify({ error: "Please provide at least 10 characters of source material." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Check if visuals were detected
    const hasVisuals = detectedVisuals && (
      detectedVisuals.diagrams > 0 ||
      detectedVisuals.charts > 0 ||
      detectedVisuals.images > 0
    );

    // Validate and prioritize images by visual density
    let validImages: any[] = [];
    if (hasVisuals) {
      validImages = (pageImages || [])
        .filter((img: any) =>
          img.imageBase64 &&
          typeof img.imageBase64 === "string" &&
          img.imageBase64.startsWith("data:image/")
        )
        .sort((a: any, b: any) => {
          const aHasVisual = a.hasChart || a.hasDiagram || a.hasTable ? 1 : 0;
          const bHasVisual = b.hasChart || b.hasDiagram || b.hasTable ? 1 : 0;
          return bHasVisual - aHasVisual;
        })
        .slice(0, 8);
    }

    // Dynamic text budget based on image count
    const imageCount = hasVisuals ? validImages.length : 0;
    const TEXT_BUDGET = imageCount === 0 ? 15000
      : imageCount <= 2 ? 12000
      : imageCount <= 5 ? 9000
      : 6000;

    const truncated = text.length > TEXT_BUDGET;
    const processedText = text.slice(0, TEXT_BUDGET);

    // Build multimodal message content
    const userContent: any[] = [];

    const visualSummary = detectedVisuals
      ? `\n\nDetected visuals: ${detectedVisuals.diagrams} diagrams, ${detectedVisuals.charts} charts, ${detectedVisuals.tables} tables, ${detectedVisuals.images} images.`
      : "";

    userContent.push({
      type: "text",
      text: `Analyze this document for LinkedIn strategic synthesis. Extract insights from BOTH text and visuals. Select only strategically relevant visuals. Do NOT expose raw content.\n\nDOCUMENT TEXT:\n${processedText}${visualSummary}\n\nAnalyze the text AND page images below. For each visual, assess feed-readiness and recommend reuse, simplification, or replacement.`,
    });

    // Add validated page images for vision analysis
    if (hasVisuals) {
      for (const img of validImages) {
        userContent.push({
          type: "image_url",
          image_url: { url: img.imageBase64 },
        });
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_multimodal_insights",
              description: "Extract structured strategic insights from document text and visuals for LinkedIn content creation.",
              parameters: {
                type: "object",
                properties: {
                  coreThesis: {
                    type: "string",
                    description: "The document's central argument in exactly one sentence.",
                  },
                  keyInsights: {
                    type: "array",
                    items: { type: "string" },
                    description: "3-5 sharp, non-obvious takeaways synthesized from text AND visuals.",
                  },
                  mostSurprisingStatistic: {
                    type: "string",
                    description: "The most surprising data point from text or charts, with actual numbers.",
                  },
                  mostDefensibleClaim: {
                    type: "string",
                    description: "The strongest evidence-backed claim.",
                  },
                  controversialIdea: {
                    type: "string",
                    description: "The most contrarian or debate-sparking idea for LinkedIn.",
                  },
                  likelyAudience: {
                    type: "string",
                    description: "The specific professional role this document targets.",
                  },
                  commercialImplication: {
                    type: "string",
                    description: "What happens if the audience acts or fails to act.",
                  },
                  visualAnalysis: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        pageNumber: { type: "number", description: "Page number where the visual appears." },
                        type: { type: "string", enum: ["diagram", "chart", "table", "image", "process_model"], description: "Type of visual element." },
                        description: { type: "string", description: "What the visual shows — entities, relationships, data trends." },
                        strategicInsight: { type: "string", description: "The insight this visual implies for the LinkedIn narrative." },
                        feedReadiness: { type: "string", enum: ["ready", "needs_simplification", "replace"], description: "Whether the visual is suitable for LinkedIn feed as-is." },
                        recommendation: { type: "string", description: "Specific recommendation: reuse as-is, simplify and regenerate, or replace with insight graphic." },
                        selectedForPost: { type: "boolean", description: "Whether this visual should be included in the LinkedIn post." },
                        placementHint: { type: "string", description: "Where in the post this visual should appear (e.g., 'after paragraph 2', 'as hero image')." },
                        regenerationPrompt: { type: "string", description: "If needs regeneration, a structured prompt for LinkedIn-optimized 4:5 ratio executive-style image." },
                      },
                      required: ["type", "description", "strategicInsight", "feedReadiness", "recommendation", "selectedForPost"],
                    },
                    description: "Analysis of each visual — only strategically relevant visuals should have selectedForPost=true.",
                  },
                  recommendedNarrativeAngle: {
                    type: "string",
                    description: "The single strongest LinkedIn narrative angle with scroll-stopping potential.",
                  },
                  suggestedHook: {
                    type: "string",
                    description: "A ready-to-use scroll-stopping opening line (max 2 sentences) for the LinkedIn post.",
                  },
                  primaryKeyword: {
                    type: "string",
                    description: "The primary keyword for LinkedIn search visibility.",
                  },
                  hashtags: {
                    type: "array",
                    items: { type: "string" },
                    description: "3-5 strategically aligned hashtags.",
                  },
                },
                required: [
                  "coreThesis",
                  "keyInsights",
                  "mostSurprisingStatistic",
                  "mostDefensibleClaim",
                  "controversialIdea",
                  "likelyAudience",
                  "commercialImplication",
                  "visualAnalysis",
                  "recommendedNarrativeAngle",
                  "suggestedHook",
                  "primaryKeyword",
                  "hashtags",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: "extract_multimodal_insights" },
        },
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please wait a moment and try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits in your workspace settings." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error(JSON.stringify({
        requestId,
        status: "error",
        error: `AI gateway error: ${response.status} ${errText}`,
        durationMs: Date.now() - startTime,
      }));
      return new Response(
        JSON.stringify({ error: "AI analysis failed. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        JSON.stringify({ error: "AI did not return structured analysis. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let analysis;
    try {
      const raw = JSON.parse(toolCall.function.arguments);
      analysis = MultimodalAnalysisSchema.parse(raw);
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
      imageCount,
      textLength: text.length,
      processedTextLength: processedText.length,
      truncated,
      visualsSelected: analysis.visualAnalysis.filter((v: any) => v.selectedForPost).length,
      durationMs: Date.now() - startTime,
    }));

    return new Response(
      JSON.stringify({
        analysis,
        meta: {
          truncated,
          originalLength: text.length,
          analyzedLength: processedText.length,
          imagesAnalyzed: imageCount,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return new Response(
        JSON.stringify({ error: "Analysis timed out. Try a shorter document or fewer pages." }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
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
