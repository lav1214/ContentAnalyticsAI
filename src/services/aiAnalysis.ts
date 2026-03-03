import { supabase } from "@/integrations/supabase/client";
import type { SourceAnalysis, UserPerspective } from "@/types/content";

interface AIExtractionResult {
  coreThesis: string;
  keyInsights: string[];
  mostSurprisingStatistic: string;
  mostDefensibleClaim: string;
  controversialIdea: string;
  likelyAudience: string;
  commercialImplication: string;
  inferredPerspective?: {
    role?: string;
    company?: string;
    topic?: string;
    icp?: string;
    goal?: "authority" | "engagement" | "lead-gen";
    brandType?: "founder" | "company";
    challengedBelief?: string;
  };
}

export interface AnalysisMeta {
  truncated: boolean;
  originalLength: number;
  analyzedLength: number;
}

export interface AnalysisResult {
  analysis: SourceAnalysis;
  perspective: UserPerspective;
  meta?: AnalysisMeta;
}

export async function analyzeDocumentWithAI(
  text: string,
  inputType: "topic" | "document" | "auto" = "auto"
): Promise<AnalysisResult> {
  const { data, error } = await supabase.functions.invoke("analyze-document", {
    body: { text, inputType },
  });

  if (error) {
    console.error("AI analysis error:", error);
    throw new Error(error.message || "Failed to analyze document");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  const result = data.analysis as AIExtractionResult;
  const meta = data.meta as AnalysisMeta | undefined;

  const analysis: SourceAnalysis = {
    coreThesis: result.coreThesis,
    keyInsights: result.keyInsights,
    dataPoints: [result.mostSurprisingStatistic, result.mostDefensibleClaim],
    controversialClaim: result.controversialIdea,
    likelyAudience: result.likelyAudience,
    commercialImplication: result.commercialImplication,
  };

  const perspective: UserPerspective = result.inferredPerspective
    ? {
        role: result.inferredPerspective.role,
        company: result.inferredPerspective.company,
        topic: result.inferredPerspective.topic,
        icp: result.inferredPerspective.icp,
        goal: result.inferredPerspective.goal,
        brandType: result.inferredPerspective.brandType,
        challengedBelief: result.inferredPerspective.challengedBelief,
      }
    : {};

  return { analysis, perspective, meta };
}
