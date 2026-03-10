import { useState, useCallback } from "react";
import type { AnalysisMode } from "@/services/narrativeIntelligence";
import {
  Shield, Target, Eye, Smartphone, AlertTriangle, TrendingUp,
  Loader2, Zap, CheckCircle, XCircle, BarChart3, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { analyzeNarrative, type NarrativeAnalysis, type BrandViolation } from "@/services/narrativeIntelligence";
import { getAuthorityClusters } from "@/services/topicMemory";

interface AuthorityDashboardProps {
  content: string;
  audience?: string;
  angle?: string;
  tone?: string;
  objective?: string;
  onApplyFix?: (original: string, replacement: string) => void;
  onClose?: () => void;
}

function ScoreBar({ score, label, icon: Icon }: { score: number; label: string; icon: React.ElementType }) {
  const color =
    score >= 75 ? "bg-success" : score >= 50 ? "bg-amber-glow" : "bg-destructive";
  const textColor =
    score >= 75 ? "text-success" : score >= 50 ? "text-amber-glow" : "text-destructive";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className="w-3 h-3 text-muted-foreground" />
          <span className="text-[11px] font-medium text-foreground">{label}</span>
        </div>
        <span className={`text-[11px] font-semibold ${textColor}`}>{score}</span>
      </div>
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function ViolationCard({ violation, onFix, fixed }: { violation: BrandViolation; onFix: () => void; fixed: boolean }) {
  return (
    <div className="border border-border rounded-md p-2.5 space-y-1.5 bg-muted/20">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-destructive/80 line-through font-mono truncate">"{violation.text}"</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{violation.issue}</p>
        </div>
        <Button
          size="sm"
          variant={fixed ? "outline" : "default"}
          className="h-5 text-[9px] px-1.5 shrink-0"
          onClick={onFix}
          disabled={fixed}
        >
          {fixed ? <CheckCircle className="w-2.5 h-2.5" /> : "Fix"}
        </Button>
      </div>
      <p className="text-[10px] text-success font-mono">→ {violation.fix}</p>
    </div>
  );
}

export function AuthorityDashboard({
  content,
  audience,
  angle,
  tone,
  objective,
  onApplyFix,
  onClose,
}: AuthorityDashboardProps) {
  const [analysis, setAnalysis] = useState<NarrativeAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fixedViolations, setFixedViolations] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<"overview" | "voice" | "feed" | "authority">("overview");

  const clusters = getAuthorityClusters();
  const topicHistory = clusters.map((c) => c.name);

  const runAnalysis = useCallback(async (revisionFocus?: string) => {
    if (!content || content.trim().length < 20) return;
    setLoading(true);
    setError(null);
    setFixedViolations(new Set());
    try {
      const result = await analyzeNarrative(content, {
        audience,
        angle,
        tone,
        objective,
        topicHistory,
      }, {
        mode: "deep" as AnalysisMode,
        revisionFocus,
      });
      setAnalysis(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }, [content, audience, angle, tone, objective]);

  const handleFix = (idx: number, v: BrandViolation) => {
    if (onApplyFix) {
      onApplyFix(v.text, v.fix);
    }
    setFixedViolations((prev) => new Set(prev).add(idx));
  };

  const tabs = [
    { key: "overview" as const, label: "Overview", icon: BarChart3 },
    { key: "voice" as const, label: "Voice", icon: Shield },
    { key: "feed" as const, label: "Feed", icon: Smartphone },
    { key: "authority" as const, label: "Authority", icon: TrendingUp },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Authority Engine
          </span>
        </div>
        <Button size="sm" onClick={() => runAnalysis()} disabled={loading} className="h-7 text-xs">
          {loading ? (
            <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Analyzing…</>
          ) : analysis ? (
            <><Sparkles className="w-3 h-3 mr-1" /> Re-analyze</>
          ) : (
            <><Sparkles className="w-3 h-3 mr-1" /> Analyze</>
          )}
        </Button>
      </div>

      {/* Tabs */}
      {analysis && (
        <div className="flex border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1 flex-1 px-2 py-2 text-[10px] font-medium transition-colors border-b-2 ${
                activeTab === t.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="w-3 h-3" />
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 p-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        {!analysis && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-3">
              <Sparkles className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-xs max-w-[220px]">
              Run a full <strong>Narrative Intelligence</strong> scan to evaluate positioning, brand voice, feed performance, and authority signals.
            </p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-xs text-muted-foreground">Running narrative intelligence scan…</p>
          </div>
        )}

        {analysis && !loading && (
          <>
            {/* OVERVIEW TAB */}
            {activeTab === "overview" && (
              <div className="space-y-4">
                {/* Overall Score */}
                <div className="flex items-center justify-center gap-4 py-3">
                  <div className="relative w-20 h-20">
                    <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 80 80">
                      <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
                      <circle
                        cx="40" cy="40" r="34" fill="none"
                        stroke={analysis.overallScore >= 75 ? "hsl(var(--success))" : analysis.overallScore >= 50 ? "hsl(var(--amber-glow))" : "hsl(var(--destructive))"}
                        strokeWidth="4"
                        strokeDasharray={`${2 * Math.PI * 34}`}
                        strokeDashoffset={`${2 * Math.PI * 34 * (1 - analysis.overallScore / 100)}`}
                        strokeLinecap="round"
                        className="transition-all duration-1000 ease-out"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-lg font-bold text-foreground">{analysis.overallScore}</span>
                      <span className="text-[8px] text-muted-foreground uppercase">Overall</span>
                    </div>
                  </div>
                </div>

                {/* Score Bars */}
                <div className="space-y-3">
                  <ScoreBar score={analysis.narrativeStrength.score} label="Narrative Strength" icon={Target} />
                  <ScoreBar score={analysis.positioning.score} label="Positioning" icon={Zap} />
                  <ScoreBar score={analysis.brandVoice.score} label="Brand Voice" icon={Shield} />
                  <ScoreBar score={analysis.feedPerformance.thumbStopProbability} label="Thumb-Stop" icon={Eye} />
                  <ScoreBar score={analysis.feedPerformance.mobileReadability} label="Mobile Readability" icon={Smartphone} />
                  <ScoreBar score={analysis.authoritySignal.score} label="Authority Signal" icon={TrendingUp} />
                </div>

                {/* Top Recommendation */}
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1.5">
                    🎯 Top Recommendation
                  </p>
                  <p className="text-xs text-foreground leading-relaxed">{analysis.topRecommendation}</p>
                </div>

                {/* Follow-up Questions */}
                {analysis.followUpQuestions && analysis.followUpQuestions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      💬 Dig Deeper
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.followUpQuestions.map((q, i) => (
                        <button
                          key={i}
                          onClick={() => runAnalysis(q)}
                          disabled={loading}
                          className="text-left text-[11px] px-2.5 py-1.5 rounded-md border border-primary/30 bg-primary/5 text-foreground hover:bg-primary/10 hover:border-primary/50 transition-colors disabled:opacity-50"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Narrative */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Narrative Arc</h4>
                  <p className="text-xs text-foreground">{analysis.narrativeStrength.arc}</p>
                  <p className="text-[11px] text-muted-foreground italic">Thesis: "{analysis.narrativeStrength.thesis}"</p>
                  {analysis.narrativeStrength.gaps.length > 0 && (
                    <div className="space-y-1">
                      {analysis.narrativeStrength.gaps.map((gap, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <XCircle className="w-3 h-3 text-destructive shrink-0 mt-0.5" />
                          <span className="text-[11px] text-muted-foreground">{gap}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Competitive Whitespace */}
                {analysis.positioning.whitespace.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Competitive Whitespace
                    </h4>
                    <div className="space-y-1.5">
                      {analysis.positioning.whitespace.map((ws, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <Target className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                          <span className="text-[11px] text-foreground">{ws}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* VOICE TAB */}
            {activeTab === "voice" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-foreground">Brand Voice: {analysis.brandVoice.toneLabel}</p>
                    <p className="text-[11px] text-muted-foreground">{analysis.brandVoice.consistency}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      analysis.brandVoice.score >= 75
                        ? "border-success/40 text-success"
                        : analysis.brandVoice.score >= 50
                        ? "border-amber-glow/40 text-amber-glow"
                        : "border-destructive/40 text-destructive"
                    }`}
                  >
                    {analysis.brandVoice.score}/100
                  </Badge>
                </div>

                {analysis.brandVoice.violations.length === 0 ? (
                  <div className="flex items-center gap-2 p-3 rounded-md bg-success/10 border border-success/20">
                    <CheckCircle className="w-4 h-4 text-success" />
                    <p className="text-xs text-success">No voice violations detected. Brand consistency is strong.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Violations ({analysis.brandVoice.violations.length})
                    </p>
                    {analysis.brandVoice.violations.map((v, i) => (
                      <ViolationCard
                        key={i}
                        violation={v}
                        onFix={() => handleFix(i, v)}
                        fixed={fixedViolations.has(i)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* FEED TAB */}
            {activeTab === "feed" && (
              <div className="space-y-4">
                {/* Thumb-Stop */}
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-foreground">Thumb-Stop Probability</p>
                    <span className={`text-lg font-bold ${
                      analysis.feedPerformance.thumbStopProbability >= 70
                        ? "text-success"
                        : analysis.feedPerformance.thumbStopProbability >= 40
                        ? "text-amber-glow"
                        : "text-destructive"
                    }`}>
                      {analysis.feedPerformance.thumbStopProbability}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        analysis.feedPerformance.thumbStopProbability >= 70
                          ? "bg-success"
                          : analysis.feedPerformance.thumbStopProbability >= 40
                          ? "bg-amber-glow"
                          : "bg-destructive"
                      }`}
                      style={{ width: `${analysis.feedPerformance.thumbStopProbability}%` }}
                    />
                  </div>
                </div>

                {/* Feed metrics */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="border border-border rounded-md p-2.5 text-center">
                    <p className="text-lg font-bold text-foreground">{analysis.feedPerformance.hookGrade}</p>
                    <p className="text-[9px] text-muted-foreground uppercase">Hook Grade</p>
                  </div>
                  <div className="border border-border rounded-md p-2.5 text-center">
                    <p className="text-lg font-bold text-foreground">{analysis.feedPerformance.mobileReadability}</p>
                    <p className="text-[9px] text-muted-foreground uppercase">Mobile Score</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Scroll Depth</p>
                  <p className="text-xs text-foreground">{analysis.feedPerformance.scrollDepthEstimate}</p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Visual Necessity</p>
                  <p className="text-xs text-foreground">{analysis.feedPerformance.visualNecessity}</p>
                </div>

                {analysis.feedPerformance.improvements.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Improvements</p>
                    {analysis.feedPerformance.improvements.map((imp, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <Zap className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                        <span className="text-[11px] text-foreground">{imp}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* AUTHORITY TAB */}
            {activeTab === "authority" && (
              <div className="space-y-4">
                {/* Authority Signal */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-foreground">Authority Signal</p>
                    <Badge variant="outline" className="text-[10px]">
                      {analysis.authoritySignal.proofPoints} proof points
                    </Badge>
                  </div>
                  <ScoreBar score={analysis.authoritySignal.score} label="Authority Score" icon={TrendingUp} />
                </div>

                {analysis.authoritySignal.credibilityMarkers.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Credibility Markers</p>
                    {analysis.authoritySignal.credibilityMarkers.map((m, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <CheckCircle className="w-3 h-3 text-success shrink-0 mt-0.5" />
                        <span className="text-[11px] text-foreground">{m}</span>
                      </div>
                    ))}
                  </div>
                )}

                {analysis.authoritySignal.missingEvidence.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Missing Evidence</p>
                    {analysis.authoritySignal.missingEvidence.map((m, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <AlertTriangle className="w-3 h-3 text-amber-glow shrink-0 mt-0.5" />
                        <span className="text-[11px] text-foreground">{m}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Topic Authority */}
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                  <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">Topic Authority</p>
                  <p className="text-xs text-foreground">
                    Primary cluster: <strong>{analysis.topicAuthority.primaryCluster}</strong>
                  </p>
                  <div className="flex gap-2">
                    {analysis.topicAuthority.reinforces && (
                      <Badge variant="outline" className="text-[9px] border-success/40 text-success">
                        ✓ Reinforces
                      </Badge>
                    )}
                    {analysis.topicAuthority.diversifies && (
                      <Badge variant="outline" className="text-[9px] border-primary/40 text-primary">
                        ↗ Diversifies
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{analysis.topicAuthority.recommendation}</p>
                </div>

                {/* Existing clusters */}
                {clusters.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Your Authority Clusters</p>
                    <div className="flex flex-wrap gap-1.5">
                      {clusters.slice(0, 6).map((c, i) => (
                        <Badge
                          key={i}
                          variant="outline"
                          className={`text-[9px] ${
                            c.name.toLowerCase() === analysis.topicAuthority.primaryCluster.toLowerCase()
                              ? "border-primary text-primary bg-primary/10"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          {c.name} ({c.count})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
