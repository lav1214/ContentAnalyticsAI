const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content, audience, angle, tone, count } = await req.json();

    if (!content || content.trim().length < 20) {
      return new Response(
        JSON.stringify({ error: "Content is too short for headline generation" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are an expert LinkedIn content strategist and SEO specialist. Your job is to suggest highly engaging, SEO-optimized headlines for LinkedIn posts and articles.

Guidelines:
- Headlines should be optimized for LinkedIn's algorithm and search
- Include power words that drive engagement (e.g., "surprising", "counterintuitive", "unpopular opinion")
- Vary between formats: questions, statements, numbered lists, bold claims
- Consider the target audience and tone when crafting headlines
- Each headline should be under 150 characters
- Include a brief rationale for why each headline works`;

    const userPrompt = `Generate ${count || 5} headline alternatives for this LinkedIn content.

Content: ${content.slice(0, 2000)}
${audience ? `Target Audience: ${audience}` : ""}
${angle ? `Angle: ${angle}` : ""}
${tone ? `Tone: ${tone}` : ""}

Return structured suggestions.`;

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
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_headlines",
              description: "Return headline suggestions with rationale and SEO score",
              parameters: {
                type: "object",
                properties: {
                  headlines: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        text: { type: "string", description: "The headline text" },
                        type: { type: "string", enum: ["question", "bold-claim", "numbered", "story", "data-driven"], description: "Headline format type" },
                        seoScore: { type: "number", description: "Estimated SEO effectiveness 1-100" },
                        engagementScore: { type: "number", description: "Estimated engagement potential 1-100" },
                        rationale: { type: "string", description: "Why this headline works" },
                      },
                      required: ["text", "type", "seoScore", "engagementScore", "rationale"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["headlines"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_headlines" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "No structured response from AI" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify({ result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Headline suggestion error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
