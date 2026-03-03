import { useState, useCallback } from "react";
import { Loader2, Sparkles, AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { analyzeNarrative, type NarrativeAnalysis } from "@/services/narrativeIntelligence";
import type { AnalysisMode } from "@/services/narrativeIntelligence";

interface DiagnosticScoreCardProps {
  content: string;
  audience?: string;
  angle?: string;
  tone?: string;
  objective?: string;
  onFixRequest: (command: string) => void;
  onComplete: () => void;
}

interface ScoreRowProps {
  label: string;
  score: number | string;
  flagged: boolean;
  onFix: () => void;
}

function ScoreRow({ label, score, flagged, onFix }: ScoreRowProps) {
  const numScore = typeof score === "number" ? score : 0;
  const displayScore = typeof score === "string" ? score : `${score} / 100`;
  const color = flagged ? "text-destructive" : numScore >= 75 ? "text-success" : "text-amber-glow";

  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-semibold ${color}`}>{displayScore}</span>
        {flagged && (
          <button
            onClick={onFix}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
          >
            Fix this <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

export function DiagnosticScoreCard({
  content,
  audience,
  angle,
  tone,
  objective,
  onFixRequest,
  onComplete,
}: DiagnosticScoreCardProps) {
  const [analysis, setAnalysis] = useState<NarrativeAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runDiagnostic = useCallback(async () => {
    if (!content || content.trim().length < 20) return;
    setLoading(true);
    setError(null);
    try {
      const result = await analyzeNarrative(content, { audience, angle, tone, objective }, {
        mode: "deep" as AnalysisMode,
      });
      setAnalysis(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }, [content, audience, angle, tone, objective]);

  if (!analysis && !loading) {
    return (
      <div className="space-y-4 p-4">
        <div className="text-center space-y-3 py-6">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground max-w-[240px] mx-auto">
            Run a full diagnostic to check hook strength, brand voice, authority signals, and feed performance.
          </p>
          <Button onClick={runDiagnostic} className="gap-1.5">
            <Sparkles className="w-4 h-4" /> Run Full Diagnostic
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-xs text-muted-foreground">Running narrative intelligence scan…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
        <Button onClick={runDiagnostic} variant="outline" size="sm">Retry</Button>
      </div>
    );
  }

  if (!analysis) return null;

  const scores = [
    { label: "Overall Score", score: analysis.overallScore, threshold: 75 },
    { label: "Hook Strength", score: analysis.feedPerformance.hookGrade, threshold: 0 },
    { label: "Brand Voice", score: analysis.brandVoice.score, threshold: 75 },
    { label: "Authority", score: analysis.authoritySignal.score, threshold: 75 },
    { label: "Feed Performance", score: analysis.feedPerformance.thumbStopProbability, threshold: 75 },
  ];

  return (
    <div className="space-y-4 p-4">
      {/* Score rows */}
      <div className="divide-y divide-border">
        {scores.map((s) => {
          const numScore = typeof s.score === "number" ? s.score : 0;
          const flagged = typeof s.score === "number" && numScore < s.threshold;
          return (
            <ScoreRow
              key={s.label}
              label={s.label}
              score={s.score}
              flagged={flagged}
              onFix={() => onFixRequest(`Improve ${s.label.toLowerCase()}: strengthen this dimension of the draft`)}
            />
          );
        })}
      </div>

      {/* Top recommendation */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
        <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1">
          🎯 Top Recommendation
        </p>
        <p className="text-xs text-foreground leading-relaxed">{analysis.topRecommendation}</p>
      </div>

      {/* Follow-up questions as chips */}
      {analysis.followUpQuestions && analysis.followUpQuestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            💬 Suggested Next Steps
          </p>
          <div className="flex flex-col gap-1.5">
            {analysis.followUpQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => onFixRequest(q)}
                className="text-left text-[11px] px-3 py-2 rounded-md border border-primary/30 bg-primary/5 text-foreground hover:bg-primary/10 hover:border-primary/50 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Re-run + Done */}
      <div className="flex items-center gap-2 pt-2">
        <Button onClick={runDiagnostic} variant="outline" size="sm" className="text-xs gap-1">
          <Sparkles className="w-3 h-3" /> Re-run
        </Button>
        <Button onClick={onComplete} size="sm" className="text-xs gap-1 flex-1">
          Looks great — I'm done! 🚀
        </Button>
      </div>
    </div>
  );
}
