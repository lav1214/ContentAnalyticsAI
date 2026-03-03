import { supabase } from "@/integrations/supabase/client";

export interface DiagnosisScore {
  score: number;
  note: string;
}

export interface DraftDiagnosis {
  hookStrength: DiagnosisScore;
  specificity: DiagnosisScore;
  authoritySignal: DiagnosisScore;
  emotionalCharge: DiagnosisScore;
  scrollPattern: DiagnosisScore;
  clarityOfOutcome: DiagnosisScore;
  ctaStrength: DiagnosisScore;
  adPerformance: DiagnosisScore;
  overallAssessment: string;
  weakestDimension: string;
}

export interface RefinementResult {
  refinedContent: string;
  changelog: string[];
  percentReduction?: number;
}

export interface RefinementContext {
  audience?: string;
  angle?: string;
  tone?: string;
  objective?: string;
  voice?: string;
}

export async function diagnoseDraft(
  draft: string,
  context?: RefinementContext
): Promise<DraftDiagnosis> {
  const { data, error } = await supabase.functions.invoke("refine-content", {
    body: { draft, command: "diagnose", context },
  });

  if (error) throw new Error(error.message || "Diagnosis failed");
  if (data?.error) throw new Error(data.error);
  return data.result as DraftDiagnosis;
}

export async function refineDraft(
  draft: string,
  command: string,
  context?: RefinementContext,
  section?: string
): Promise<RefinementResult> {
  const { data, error } = await supabase.functions.invoke("refine-content", {
    body: { draft, command, context, section },
  });

  if (error) throw new Error(error.message || "Refinement failed");
  if (data?.error) throw new Error(data.error);
  return data.result as RefinementResult;
}
