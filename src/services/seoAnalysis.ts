import { supabase } from "@/integrations/supabase/client";

export interface KeywordInfo {
  term: string;
  relevance: "high" | "medium" | "low";
}

export interface MissingKeyword {
  term: string;
  reason: string;
}

export interface HashtagSuggestion {
  tag: string;
  trendScore: "trending" | "steady" | "niche";
}

export interface SeoImprovement {
  target: string;
  original: string;
  suggested: string;
  rationale: string;
}

export interface MissingEntity {
  entity: string;
  reason: string;
}

export interface SeoAnalysisResult {
  seoScore: number;
  discoverabilityScore: number;
  semanticScore: number;
  presentKeywords: KeywordInfo[];
  missingKeywords: MissingKeyword[];
  hashtags: HashtagSuggestion[];
  improvements: SeoImprovement[];
  summary: string;
  llmDiscoverabilityScore: number;
  entityCoverage: number;
  structuredClaimsScore: number;
  quotableStatements: string[];
  missingEntities: MissingEntity[];
  llmSummary: string;
  llmImprovements: SeoImprovement[];
}

export async function analyzeSeo(
  content: string,
  context?: { audience?: string; angle?: string; tone?: string }
): Promise<SeoAnalysisResult> {
  const { data, error } = await supabase.functions.invoke("seo-analyze", {
    body: { content, ...context },
  });

  if (error) throw new Error(error.message || "SEO analysis failed");
  if (data?.error) throw new Error(data.error);
  return data.result as SeoAnalysisResult;
}
