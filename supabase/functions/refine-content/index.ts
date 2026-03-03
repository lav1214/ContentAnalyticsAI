import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a senior LinkedIn content strategist and performance marketer. You refine content with surgical precision.

Rules:
- Be concise. Be analytical. Be decisive. No filler.
- Never randomly rewrite. Improve only the dimension requested.
- Explain what changed in bullet points.
- Maintain brand tone, strategic angle, audience focus, and objective alignment.
- Speak like a strategist, not a copywriter.

When diagnosing, evaluate against these 8 dimensions (score each 1-10):
1. Hook Strength - Does it stop the scroll in 3 seconds?
2. Specificity - Are claims sharp or generic?
3. Authority Signal - Does it establish credibility?
4. Emotional Charge - Does it provoke a reaction?
5. Scroll Pattern - Will people keep reading?
6. Clarity of Outcome - Is the takeaway obvious?
7. CTA Strength - Does it drive action?
8. Ad Performance Potential - Would this work as a paid unit?

When refining, return ONLY the improved content plus a brief changelog.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { draft, command, context, section } = await req.json();

    if (!draft || typeof draft !== "string") {
      return new Response(
        JSON.stringify({ error: "Draft content is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const isDiagnose = command === "diagnose";

    const tools = isDiagnose
      ? [
          {
            type: "function",
            function: {
              name: "diagnose_draft",
              description: "Evaluate a LinkedIn draft across 8 performance dimensions.",
              parameters: {
                type: "object",
                properties: {
                  hookStrength: { type: "object", properties: { score: { type: "number" }, note: { type: "string" } }, required: ["score", "note"] },
                  specificity: { type: "object", properties: { score: { type: "number" }, note: { type: "string" } }, required: ["score", "note"] },
                  authoritySignal: { type: "object", properties: { score: { type: "number" }, note: { type: "string" } }, required: ["score", "note"] },
                  emotionalCharge: { type: "object", properties: { score: { type: "number" }, note: { type: "string" } }, required: ["score", "note"] },
                  scrollPattern: { type: "object", properties: { score: { type: "number" }, note: { type: "string" } }, required: ["score", "note"] },
                  clarityOfOutcome: { type: "object", properties: { score: { type: "number" }, note: { type: "string" } }, required: ["score", "note"] },
                  ctaStrength: { type: "object", properties: { score: { type: "number" }, note: { type: "string" } }, required: ["score", "note"] },
                  adPerformance: { type: "object", properties: { score: { type: "number" }, note: { type: "string" } }, required: ["score", "note"] },
                  overallAssessment: { type: "string" },
                  weakestDimension: { type: "string" },
                },
                required: ["hookStrength", "specificity", "authoritySignal", "emotionalCharge", "scrollPattern", "clarityOfOutcome", "ctaStrength", "adPerformance", "overallAssessment", "weakestDimension"],
                additionalProperties: false,
              },
            },
          },
        ]
      : [
          {
            type: "function",
            function: {
              name: "refine_content",
              description: "Return the refined content and changelog.",
              parameters: {
                type: "object",
                properties: {
                  refinedContent: { type: "string", description: "The improved draft content." },
                  changelog: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of specific changes made.",
                  },
                  percentReduction: { type: "number", description: "Percentage reduction in length if applicable, otherwise 0." },
                },
                required: ["refinedContent", "changelog"],
                additionalProperties: false,
              },
            },
          },
        ];

    const contextStr = context
      ? `\nStrategic Context:\n- Audience: ${context.audience || "Not specified"}\n- Angle: ${context.angle || "Not specified"}\n- Tone: ${context.tone || "Not specified"}\n- Objective: ${context.objective || "Not specified"}\n- Voice: ${context.voice || "Not specified"}`
      : "";

    const sectionNote = section ? `\nIMPORTANT: Only modify the "${section}" section of the content. Leave all other sections unchanged.` : "";

    const userMessage = isDiagnose
      ? `Diagnose this LinkedIn draft. Score each dimension 1-10 with a brief note.${contextStr}\n\nDraft:\n${draft}`
      : `Command: "${command}"${sectionNote}${contextStr}\n\nDraft:\n${draft}`;

    const toolChoice = isDiagnose
      ? { type: "function", function: { name: "diagnose_draft" } }
      : { type: "function", function: { name: "refine_content" } };

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
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
        tools,
        tool_choice: toolChoice,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: "Refinement failed. Please try again." }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response:", JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: "AI did not return structured result." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(
      JSON.stringify({ result, type: isDiagnose ? "diagnosis" : "refinement" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("refine-content error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
