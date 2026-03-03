import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DOCUMENT_PROMPT = `You are a senior content strategist. Analyze the uploaded document and extract strategic elements for LinkedIn content creation.

You MUST respond by calling the extract_document_insights function with your analysis. Do not respond with plain text.

Guidelines:
- The core thesis must be exactly ONE sentence that captures the document's central argument.
- Key insights should be 3-5 sharp, non-obvious takeaways — not summaries.
- The most surprising statistic must include the actual number/percentage.
- The most defensible claim should be backed by evidence from the document.
- The controversial idea should challenge conventional wisdom — something that would spark debate on LinkedIn.
- Audience should describe the specific professional role, not generic terms like "business leaders."
- Commercial implication should describe what happens if the audience acts (or fails to act) on this insight.
- For inferredPerspective: silently detect any signals about the author's identity, goals, or positioning intent from the text. If the text mentions "I'm a founder" or "my company" or "we want to generate leads," capture those signals. Only include fields you're confident about. This is critical for personalizing the content strategy.

Be opinionated. Be specific. Do not hedge.`;

const TOPIC_PROMPT = `You are a senior LinkedIn content strategist. The user has given you a TOPIC or brief idea — not a full document. Your job is to generate strategic content angles based on your expertise and knowledge of this subject.

You MUST respond by calling the extract_document_insights function with your analysis. Do not respond with plain text.

Guidelines:
- The core thesis must be a bold, opinionated ONE-sentence take on this topic — not a generic statement. Make it provocative enough to stop someone mid-scroll.
- Key insights should be 3-5 sharp, non-obvious angles or perspectives on this topic that would resonate on LinkedIn. Draw from industry trends, counterintuitive truths, and real-world patterns.
- The most surprising statistic should be a real, credible data point related to this topic. If you're unsure, provide a directionally accurate insight with a qualifier.
- The most defensible claim should be an evidence-based assertion about this topic.
- The controversial idea should challenge the mainstream narrative around this topic — something that would spark genuine debate.
- Audience should identify the specific professional role that would care most about this topic.
- Commercial implication should describe the business impact of this topic.
- For inferredPerspective: carefully analyze the user's input for any signals about who they are, what they want, and how they want to sound. If they say "I'm a CTO" → role: "CTO". If they mention "thought leadership" → goal: "authority". If they say "my personal brand" → brandType: "founder". If they say "challenge the idea that X" → challengedBelief: "X". Only include fields you can confidently infer.

Think like a strategist who reads 50 industry reports a week. Be bold. Be specific. Do not be generic.`;

const InferredPerspectiveSchema = z.object({
  role: z.string().optional(),
  company: z.string().optional(),
  topic: z.string().optional(),
  icp: z.string().optional(),
  goal: z.enum(["authority", "engagement", "lead-gen"]).optional(),
  brandType: z.enum(["founder", "company"]).optional(),
  challengedBelief: z.string().optional(),
}).optional();

const AnalysisSchema = z.object({
  coreThesis: z.string(),
  keyInsights: z.array(z.string()).min(3).max(5),
  mostSurprisingStatistic: z.string(),
  mostDefensibleClaim: z.string(),
  controversialIdea: z.string(),
  likelyAudience: z.string(),
  commercialImplication: z.string(),
  inferredPerspective: InferredPerspectiveSchema,
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    // Auth check
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { text, inputType, chunkLabel, chunkIndex, totalChunks } = await req.json();

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

    const isTopicInput = inputType === "topic" || 
      (inputType === "auto" && text.trim().length < 300) ||
      (!inputType && text.trim().length < 300);

    const MAX_CHARS = 15000;
    const truncated = text.length > MAX_CHARS;
    const processedText = text.slice(0, MAX_CHARS);

    const chunkContext = chunkLabel
      ? `\n\nYou are analyzing the "${chunkLabel}" section (part ${chunkIndex} of ${totalChunks} in a larger document). Extract insights specific to this section's role and content. Do not summarize — interpret what this section uniquely contributes.`
      : "";

    const systemPrompt = (isTopicInput ? TOPIC_PROMPT : DOCUMENT_PROMPT) + chunkContext;
    const userMessage = isTopicInput
      ? `Generate strategic LinkedIn content angles for this topic:\n\n"${text.trim()}"\n\nBring your own expertise — be bold and specific.`
      : `Analyze this document and extract the strategic elements:\n\n${processedText}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_document_insights",
              description: "Extract structured strategic insights from a document for LinkedIn content creation.",
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
                    description: "3-5 sharp, non-obvious takeaways from the document.",
                  },
                  mostSurprisingStatistic: {
                    type: "string",
                    description: "The most surprising data point or statistic from the document.",
                  },
                  mostDefensibleClaim: {
                    type: "string",
                    description: "The strongest evidence-backed claim from the document.",
                  },
                  controversialIdea: {
                    type: "string",
                    description: "The most contrarian or debate-sparking idea from the document.",
                  },
                  likelyAudience: {
                    type: "string",
                    description: "The specific professional role this document was likely written for.",
                  },
                  commercialImplication: {
                    type: "string",
                    description: "What happens if the audience acts or fails to act on this insight.",
                  },
                  inferredPerspective: {
                    type: "object",
                    description: "Signals about the author's identity and goals inferred from the input. Only include fields you can confidently infer. Leave out anything uncertain.",
                    properties: {
                      role: { type: "string", description: "Author's professional role if mentioned or strongly implied (e.g. 'founder', 'CTO', 'VP Marketing')." },
                      company: { type: "string", description: "Company name or industry if mentioned (e.g. 'fintech startup', 'Acme Corp')." },
                      topic: { type: "string", description: "The core topic or domain (e.g. 'AI governance', 'cybersecurity')." },
                      icp: { type: "string", description: "Ideal customer profile or target audience if mentioned (e.g. 'enterprise buyers', 'Series A founders')." },
                      goal: { type: "string", enum: ["authority", "engagement", "lead-gen"], description: "Content goal if inferable: 'authority' for thought leadership, 'engagement' for viral reach, 'lead-gen' for pipeline." },
                      brandType: { type: "string", enum: ["founder", "company"], description: "'founder' if personal brand signals detected, 'company' if company/team brand." },
                      challengedBelief: { type: "string", description: "A specific conventional belief the author wants to challenge, if stated or strongly implied." },
                    },
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
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: "extract_document_insights" },
        },
      }),
    });

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
      analysis = AnalysisSchema.parse(raw);
    } catch (validationError) {
      console.error(JSON.stringify({
        requestId,
        status: "error",
        error: `Schema validation failed: ${validationError instanceof Error ? validationError.message : "Unknown"}`,
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
      inputType: isTopicInput ? "topic" : "document",
      inputLength: text.length,
      truncated,
      durationMs: Date.now() - startTime,
    }));

    return new Response(
      JSON.stringify({
        analysis,
        meta: {
          truncated,
          originalLength: text.length,
          analyzedLength: processedText.length,
        },
      }),
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
