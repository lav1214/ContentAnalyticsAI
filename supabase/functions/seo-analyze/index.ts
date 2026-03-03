import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are an expert LinkedIn SEO, discoverability, and LLM optimization analyst. Analyze content for both traditional LinkedIn SEO AND LLM discoverability (how well AI models like ChatGPT, Perplexity, Gemini would surface, quote, or reference this content).

You will be given a LinkedIn post draft. Return your analysis by calling the provided tool.

Guidelines:
- Keywords should be terms that LinkedIn's algorithm and LLMs use for topic matching. Focus on industry terms, not generic words.
- Hashtags should be LinkedIn-trending, relevant to the content's niche. Max 5 hashtags. Always prefix with #.
- Semantic coverage measures how well the content covers the topic space (related concepts, synonyms, adjacent ideas).
- LinkedIn discoverability considers: hook strength, engagement triggers, share-worthiness, comment-bait.
- SEO score considers: keyword density, semantic richness, topic authority signals.
- LLM discoverability score considers: Does the content make clear, quotable claims? Does it define terms or frameworks? Does it contain structured assertions an LLM would extract as authoritative? Does it use entity-rich language (named concepts, specific data, named frameworks)?
- Improvements should be specific rewrites that maintain the original tone and voice. Each improvement targets a specific line or section.
- Keyword highlights should identify which important keywords ARE present and which are MISSING.

For LLM discoverability analysis:
- entityCoverage: Rate 0-100 how well the content uses named entities (people, companies, frameworks, methodologies, specific metrics).
- quotableStatements: Extract 1-3 sentences from the content that an LLM would most likely quote or paraphrase when answering a related question.
- missingEntities: List specific named entities, frameworks, or data points that would make this content more LLM-citable.
- llmSummary: A brief assessment of how an LLM would interpret and surface this content.
- structuredClaimsScore: Rate 0-100 how well the content makes clear, attributable claims vs vague assertions.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content, audience, angle, tone } = await req.json();

    if (!content || content.trim().length < 20) {
      return new Response(
        JSON.stringify({ error: "Content too short to analyze" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const contextNote = [
      audience ? `Target audience: ${audience}` : "",
      angle ? `Content angle: ${angle}` : "",
      tone ? `Tone: ${tone}` : "",
    ]
      .filter(Boolean)
      .join(". ");

    const userPrompt = `${contextNote ? contextNote + "\n\n" : ""}Analyze this LinkedIn post:\n\n${content}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "seo_analysis",
              description: "Return a comprehensive SEO and LinkedIn discoverability analysis",
              parameters: {
                type: "object",
                properties: {
                  seoScore: {
                    type: "number",
                    description: "Overall SEO score 0-100",
                  },
                  discoverabilityScore: {
                    type: "number",
                    description: "LinkedIn discoverability score 0-100",
                  },
                  semanticScore: {
                    type: "number",
                    description: "Semantic coverage score 0-100",
                  },
                  presentKeywords: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        term: { type: "string" },
                        relevance: { type: "string", enum: ["high", "medium", "low"] },
                      },
                      required: ["term", "relevance"],
                      additionalProperties: false,
                    },
                    description: "Keywords already present in the content",
                  },
                  missingKeywords: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        term: { type: "string" },
                        reason: { type: "string" },
                      },
                      required: ["term", "reason"],
                      additionalProperties: false,
                    },
                    description: "Important keywords missing from the content",
                  },
                  hashtags: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        tag: { type: "string" },
                        trendScore: { type: "string", enum: ["trending", "steady", "niche"] },
                      },
                      required: ["tag", "trendScore"],
                      additionalProperties: false,
                    },
                    description: "Recommended hashtags with trend status",
                  },
                  improvements: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        target: {
                          type: "string",
                          description: "Which section this targets: hook, body, proof, cta, hashtags",
                        },
                        original: {
                          type: "string",
                          description: "The original text snippet to replace (exact match)",
                        },
                        suggested: {
                          type: "string",
                          description: "The improved replacement text",
                        },
                        rationale: {
                          type: "string",
                          description: "Why this improvement helps SEO/discoverability",
                        },
                      },
                      required: ["target", "original", "suggested", "rationale"],
                      additionalProperties: false,
                    },
                    description: "Specific improvements that maintain tone",
                  },
                  summary: {
                    type: "string",
                    description: "Brief 1-2 sentence overall assessment",
                  },
                  llmDiscoverabilityScore: {
                    type: "number",
                    description: "LLM discoverability score 0-100 — how likely AI models would surface/quote this content",
                  },
                  entityCoverage: {
                    type: "number",
                    description: "Entity coverage score 0-100 — named people, companies, frameworks, methodologies, metrics",
                  },
                  structuredClaimsScore: {
                    type: "number",
                    description: "Structured claims score 0-100 — clear, attributable assertions vs vague statements",
                  },
                  quotableStatements: {
                    type: "array",
                    items: { type: "string" },
                    description: "1-3 sentences from the content most likely to be quoted by LLMs",
                  },
                  missingEntities: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        entity: { type: "string" },
                        reason: { type: "string" },
                      },
                      required: ["entity", "reason"],
                      additionalProperties: false,
                    },
                    description: "Named entities, frameworks, or data that would improve LLM citability",
                  },
                  llmSummary: {
                    type: "string",
                    description: "Brief assessment of how an LLM would interpret and surface this content",
                  },
                  llmImprovements: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        target: {
                          type: "string",
                          description: "Which section: hook, body, proof, cta, entity, claim",
                        },
                        original: {
                          type: "string",
                          description: "The original text snippet to replace (exact match from content)",
                        },
                        suggested: {
                          type: "string",
                          description: "The improved replacement — more entity-rich, structured, or quotable",
                        },
                        rationale: {
                          type: "string",
                          description: "Why this helps LLM discoverability (e.g. adds named framework, makes claim attributable, adds data)",
                        },
                      },
                      required: ["target", "original", "suggested", "rationale"],
                      additionalProperties: false,
                    },
                    description: "2-4 specific rewrites to improve LLM citability — turn vague assertions into entity-rich, structured, quotable statements",
                  },
                },
                required: [
                  "seoScore",
                  "discoverabilityScore",
                  "semanticScore",
                  "presentKeywords",
                  "missingKeywords",
                  "hashtags",
                  "improvements",
                  "summary",
                  "llmDiscoverabilityScore",
                  "entityCoverage",
                  "structuredClaimsScore",
                  "quotableStatements",
                  "missingEntities",
                  "llmSummary",
                  "llmImprovements",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "seo_analysis" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error("AI analysis failed");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      throw new Error("No structured response from AI");
    }

    const result =
      typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;

    return new Response(JSON.stringify({ result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("seo-analyze error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
