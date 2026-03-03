import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are reconciling multiple section-level analyses of a single document into one unified strategic synthesis for LinkedIn content creation.

Rules:
- Pick the SINGLE strongest thesis that holds across all sections
- Surface only non-redundant, cross-sectional insights
- Later sections take precedence in contradictions
- The controversialIdea should be the sharpest angle found anywhere — not a compromise
- suggestedHook should reflect the most surprising finding regardless of section
- Return up to 8 keyInsights to reflect document depth
- Do not average — synthesize. Always pick the sharpest version of each element.
- For visualAnalysis, only include visuals that reinforce the primary narrative angle

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

const SynthesisSchema = z.object({
  coreThesis: z.string(),
  keyInsights: z.array(z.string()).min(3).max(8),
  mostSurprisingStatistic: z.string(),
  mostDefensibleClaim: z.string(),
  controversialIdea: z.string(),
  likelyAudience: z.string(),
  commercialImplication: z.string(),
  visualAnalysis: z.array(VisualAnalysisItemSchema),
  recommendedNarrativeAngle: z.string(),
  suggestedHook: z.string(),
  primaryKeyword: z.string(),
  hashtags: z.array(z.string()).min(3).max(10),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
    const { chunkAnalyses, chunkLabels, pageImages, totalPages } = await req.json();

    if (!chunkAnalyses || !Array.isArray(chunkAnalyses) || chunkAnalyses.length === 0) {
      return new Response(
        JSON.stringify({ error: "No chunk analyses provided." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const userMessage = `Synthesize these ${chunkAnalyses.length} section analyses from a ${totalPages || "multi"}-page document into unified LinkedIn content strategy.

Section analyses:
${JSON.stringify(chunkAnalyses, null, 1)}

Section labels: ${(chunkLabels || []).join(", ")}

${pageImages && pageImages.length > 0 ? `The document contains ${pageImages.length} page images with potential visuals. Include relevant visual analysis.` : "No page images available — set visualAnalysis to an empty array."}`;

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
          { role: "user", content: userMessage },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_multimodal_insights",
              description: "Extract structured strategic insights synthesized from multiple document sections.",
              parameters: {
                type: "object",
                properties: {
                  coreThesis: { type: "string", description: "The unified central argument across all sections." },
                  keyInsights: { type: "array", items: { type: "string" }, description: "Up to 8 sharp, non-redundant insights from across the full document." },
                  mostSurprisingStatistic: { type: "string", description: "The most surprising data point found anywhere." },
                  mostDefensibleClaim: { type: "string", description: "The strongest evidence-backed claim." },
                  controversialIdea: { type: "string", description: "The sharpest contrarian angle found anywhere." },
                  likelyAudience: { type: "string", description: "Specific professional role." },
                  commercialImplication: { type: "string", description: "Business impact." },
                  visualAnalysis: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        pageNumber: { type: "number" },
                        type: { type: "string", enum: ["diagram", "chart", "table", "image", "process_model"] },
                        description: { type: "string" },
                        strategicInsight: { type: "string" },
                        feedReadiness: { type: "string", enum: ["ready", "needs_simplification", "replace"] },
                        recommendation: { type: "string" },
                        selectedForPost: { type: "boolean" },
                        placementHint: { type: "string" },
                        regenerationPrompt: { type: "string" },
                      },
                      required: ["type", "description", "strategicInsight", "feedReadiness", "recommendation", "selectedForPost"],
                    },
                  },
                  recommendedNarrativeAngle: { type: "string" },
                  suggestedHook: { type: "string" },
                  primaryKeyword: { type: "string" },
                  hashtags: { type: "array", items: { type: "string" } },
                },
                required: [
                  "coreThesis", "keyInsights", "mostSurprisingStatistic",
                  "mostDefensibleClaim", "controversialIdea", "likelyAudience",
                  "commercialImplication", "visualAnalysis", "recommendedNarrativeAngle",
                  "suggestedHook", "primaryKeyword", "hashtags",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_multimodal_insights" } },
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
          JSON.stringify({ error: "AI credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error(JSON.stringify({ requestId, status: "error", error: `AI gateway: ${response.status} ${errText}`, durationMs: Date.now() - startTime }));
      return new Response(
        JSON.stringify({ error: "Synthesis failed. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error(JSON.stringify({ requestId, status: "error", error: "No tool call in synthesis response", durationMs: Date.now() - startTime }));
      return new Response(
        JSON.stringify({ error: "AI did not return structured synthesis." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let analysis;
    try {
      const raw = JSON.parse(toolCall.function.arguments);
      analysis = SynthesisSchema.parse(raw);
    } catch (validationError) {
      console.error(JSON.stringify({ requestId, status: "validation_error", error: String(validationError), durationMs: Date.now() - startTime }));
      return new Response(
        JSON.stringify({ error: "AI returned malformed synthesis. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(JSON.stringify({
      requestId,
      status: "success",
      chunksProcessed: chunkAnalyses.length,
      totalPages,
      insightsCount: analysis.keyInsights.length,
      durationMs: Date.now() - startTime,
    }));

    return new Response(
      JSON.stringify({ analysis }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return new Response(
        JSON.stringify({ error: "Synthesis timed out. Try with fewer sections." }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.error(JSON.stringify({ requestId, status: "error", error: e instanceof Error ? e.message : "Unknown", durationMs: Date.now() - startTime }));
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
