import { supabase } from "@/integrations/supabase/client";

export interface HeadlineSuggestion {
  text: string;
  type: "question" | "bold-claim" | "numbered" | "story" | "data-driven";
  seoScore: number;
  engagementScore: number;
  rationale: string;
}

export interface HeadlineResult {
  headlines: HeadlineSuggestion[];
}

export async function suggestHeadlines(
  content: string,
  context?: { audience?: string; angle?: string; tone?: string; count?: number }
): Promise<HeadlineResult> {
  const { data, error } = await supabase.functions.invoke("suggest-headlines", {
    body: { content, ...context },
  });

  if (error) throw new Error(error.message || "Headline suggestion failed");
  if (data?.error) throw new Error(data.error);
  return data.result as HeadlineResult;
}

export interface TrendingHashtag {
  tag: string;
  followers: string;
  trend: "trending" | "steady" | "niche" | "long-tail";
  competition: "high" | "medium" | "low";
  relevance: number;
  reason: string;
  isLongTail: boolean;
}

export interface TrendingHashtagResult {
  hashtags: TrendingHashtag[];
  recommendedSet: string[];
  strategy: string;
}

export async function fetchTrendingHashtags(
  topic: string,
  context?: { industry?: string; audience?: string }
): Promise<TrendingHashtagResult> {
  const { data, error } = await supabase.functions.invoke("trending-hashtags", {
    body: { topic, ...context },
  });

  if (error) throw new Error(error.message || "Hashtag fetch failed");
  if (data?.error) throw new Error(data.error);
  return data.result as TrendingHashtagResult;
}
