import { supabase } from "@/integrations/supabase/client";

export interface BrandViolation {
  text: string;
  issue: string;
  fix: string;
}

export interface NarrativeAnalysis {
  narrativeStrength: {
    score: number;
    thesis: string;
    arc: string;
    gaps: string[];
  };
  positioning: {
    score: number;
    differentiator: string;
    challengedBelief: string;
    whitespace: string[];
  };
  brandVoice: {
    score: number;
    toneLabel: string;
    violations: BrandViolation[];
    consistency: string;
  };
  feedPerformance: {
    thumbStopProbability: number;
    hookGrade: string;
    mobileReadability: number;
    scrollDepthEstimate: string;
    visualNecessity: string;
    improvements: string[];
  };
  authoritySignal: {
    score: number;
    proofPoints: number;
    credibilityMarkers: string[];
    missingEvidence: string[];
  };
  topicAuthority: {
    primaryCluster: string;
    reinforces: boolean;
    diversifies: boolean;
    recommendation: string;
  };
  overallScore: number;
  topRecommendation: string;
  followUpQuestions: string[];
}

export type AnalysisMode = "quick" | "deep" | "competitive" | "voice";

export async function analyzeNarrative(
  content: string,
  context?: {
    audience?: string;
    angle?: string;
    tone?: string;
    objective?: string;
    topicHistory?: string[];
  },
  options?: {
    mode?: AnalysisMode;
    revisionFocus?: string;
    userResponses?: Record<string, string>;
  }
): Promise<NarrativeAnalysis> {
  const { data, error } = await supabase.functions.invoke("narrative-intelligence", {
    body: {
      content,
      context,
      mode: options?.mode || "deep",
      revisionFocus: options?.revisionFocus,
      userResponses: options?.userResponses,
    },
  });

  if (error) throw new Error(error.message || "Narrative analysis failed");
  if (data?.error) throw new Error(data.error);
  return data.result as NarrativeAnalysis;
}
