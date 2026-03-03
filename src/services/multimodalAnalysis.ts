import { supabase } from "@/integrations/supabase/client";
import type { SourceAnalysis, VisualAnalysisItem } from "@/types/content";
import type { PDFParseResult } from "./pdfParser";

export interface MultimodalMeta {
  truncated: boolean;
  originalLength: number;
  analyzedLength: number;
  imagesAnalyzed: number;
}

export interface MultimodalAnalysisResult {
  sourceAnalysis: SourceAnalysis;
  visualAnalysis: VisualAnalysisItem[];
  recommendedNarrativeAngle: string;
  suggestedHook: string;
  primaryKeyword: string;
  hashtags: string[];
  meta?: MultimodalMeta;
}

/**
 * Send parsed PDF content (text + page images) to the multimodal analysis edge function.
 */
export async function analyzeMultimodalDocument(
  pdfResult: PDFParseResult
): Promise<MultimodalAnalysisResult> {
  const { data, error } = await supabase.functions.invoke("analyze-multimodal", {
    body: {
      text: pdfResult.fullText,
      pageImages: pdfResult.pages.map((p) => ({
        pageNumber: p.pageNumber,
        imageBase64: p.imageBase64,
      })),
      detectedVisuals: pdfResult.detectedVisuals,
    },
  });

  if (error) {
    console.error("Multimodal analysis error:", error);
    throw new Error(error.message || "Failed to analyze document");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  const result = data.analysis;
  const meta = data.meta as MultimodalMeta | undefined;

  return {
    sourceAnalysis: {
      coreThesis: result.coreThesis,
      keyInsights: result.keyInsights,
      dataPoints: [result.mostSurprisingStatistic, result.mostDefensibleClaim],
      controversialClaim: result.controversialIdea,
      likelyAudience: result.likelyAudience,
      commercialImplication: result.commercialImplication,
      suggestedHook: result.suggestedHook,
      primaryKeyword: result.primaryKeyword,
      hashtags: result.hashtags,
    },
    visualAnalysis: result.visualAnalysis || [],
    recommendedNarrativeAngle: result.recommendedNarrativeAngle || "",
    suggestedHook: result.suggestedHook || "",
    primaryKeyword: result.primaryKeyword || "",
    hashtags: result.hashtags || [],
    meta,
  };
}
