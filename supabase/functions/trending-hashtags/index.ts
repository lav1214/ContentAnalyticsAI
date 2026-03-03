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
    const { topic, industry, audience } = await req.json();

    if (!topic) {
      return new Response(
        JSON.stringify({ error: "Topic is required" }),
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

    const systemPrompt = `You are a LinkedIn hashtag strategist specializing in long-tail hashtag discovery. Your goal is to maximize discoverability by combining broad-reach hashtags with highly specific long-tail ones.

Long-tail hashtag strategy:
- Long-tail hashtags are multi-word, specific phrases (e.g. #DataDrivenLeadership, #B2BSaaSGrowthStrategy, #RemoteTeamProductivity)
- They have lower follower counts but MUCH higher engagement rates and lower competition
- They signal niche expertise and attract a more qualified, engaged audience
- LinkedIn's algorithm rewards specificity — posts with long-tail hashtags often outperform generic ones
- Combine 1-2 broad hashtags (100K+ followers) with 2-3 long-tail hashtags (<50K followers) for optimal reach

Rules:
- ALWAYS include at least 4-5 long-tail hashtags (2-4 word compound phrases)
- Create custom long-tail hashtags by combining the topic's core concept with the audience's industry or role
- Identify "blue ocean" hashtags — relevant but underused combinations where the content can dominate
- Estimate competition level: high (saturated, hard to rank), medium, low (easy to get featured)
- For each long-tail hashtag, explain the strategic advantage of using it
- The recommended set MUST include at least 2 long-tail hashtags`;

    const userPrompt = `Suggest 12-18 LinkedIn hashtags for content about: "${topic}"
${industry ? `Industry: ${industry}` : ""}
${audience ? `Target audience: ${audience}` : ""}

Strategy: Include a pyramid of hashtags:
- 2-3 broad/high-volume hashtags (100K+ followers) for reach
- 3-4 mid-tier hashtags (10K-100K followers) for relevance
- 5-7 long-tail/niche hashtags (<10K followers) for authority positioning and low competition

For long-tail hashtags, create compound phrases that combine the topic with specific roles, industries, or outcomes (e.g., instead of #Leadership → #LeadershipInTech, #FirstTimeFounderLeadership, #ScalingTeamCulture).`;

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
              name: "suggest_hashtags",
              description: "Return trending and relevant LinkedIn hashtags",
              parameters: {
                type: "object",
                properties: {
                  hashtags: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        tag: { type: "string", description: "The hashtag including #" },
                        followers: { type: "string", description: "Estimated follower count e.g. '2.1M' or '800'" },
                        trend: { type: "string", enum: ["trending", "steady", "niche", "long-tail"], description: "Current trend status. Use long-tail for specific multi-word compound hashtags" },
                        competition: { type: "string", enum: ["high", "medium", "low"], description: "How saturated this hashtag is" },
                        relevance: { type: "number", description: "Relevance score 1-100" },
                        reason: { type: "string", description: "Strategic advantage of using this hashtag" },
                        isLongTail: { type: "boolean", description: "True if this is a long-tail compound hashtag" },
                      },
                      required: ["tag", "followers", "trend", "competition", "relevance", "reason", "isLongTail"],
                      additionalProperties: false,
                    },
                  },
                  recommendedSet: {
                    type: "array",
                    items: { type: "string" },
                    description: "The optimal 3-5 hashtags to use together",
                  },
                  strategy: {
                    type: "string",
                    description: "Brief explanation of the hashtag strategy",
                  },
                },
                required: ["hashtags", "recommendedSet", "strategy"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_hashtags" } },
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
    console.error("Trending hashtags error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
