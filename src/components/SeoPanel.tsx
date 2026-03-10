import { useState, useCallback } from "react";
import { Search, TrendingUp, Hash, Zap, Check, Loader2, ChevronDown, ChevronUp, AlertTriangle, Bot, Quote, Blocks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { analyzeSeo, type SeoAnalysisResult, type SeoImprovement } from "@/services/seoAnalysis";

interface SeoPanelProps {
  content: string;
  audience?: string;
  angle?: string;
  tone?: string;
  onApplyImprovement: (original: string, replacement: string) => void;
  onApplyKeywords?: (keywords: string[]) => void;
}

function ScoreRing({ score, label, size = 48 }: { score: number; label: string; size?: number }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 75 ? "hsl(var(--success))" : score >= 50 ? "hsl(var(--amber-glow))" : "hsl(var(--destructive))";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth={3} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="text-xs font-semibold text-foreground -mt-0.5">{score}</span>
    </div>
  );
}

function ImprovementCard({
  imp,
  onApply,
  applied,
}: {
  imp: SeoImprovement;
  onApply: () => void;
  applied: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border rounded-md p-3 space-y-2 bg-muted/20">
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs text-foreground font-medium text-left flex-1"
        >
          <Badge variant="outline" className="text-[10px] shrink-0">
            {imp.target}
          </Badge>
          <span className="truncate">{imp.rationale}</span>
          {expanded ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
        </button>
        <Button
          size="sm"
          variant={applied ? "outline" : "default"}
          className="h-6 text-[10px] px-2 shrink-0"
          onClick={onApply}
          disabled={applied}
        >
          {applied ? (
            <>
              <Check className="w-3 h-3 mr-1" /> Applied
            </>
          ) : (
            <>
              <Zap className="w-3 h-3 mr-1" /> Apply
            </>
          )}
        </Button>
      </div>
      {expanded && (
        <div className="space-y-1.5 animate-fade-in">
          <div className="text-[11px] text-destructive/80 line-through bg-destructive/5 rounded px-2 py-1 font-mono">
            {imp.original}
          </div>
          <div className="text-[11px] text-success bg-success/5 rounded px-2 py-1 font-mono">{imp.suggested}</div>
        </div>
      )}
    </div>
  );
}

const TREND_COLORS: Record<string, string> = {
  trending: "bg-success/20 text-success border-success/30",
  steady: "bg-primary/20 text-primary border-primary/30",
  niche: "bg-muted text-muted-foreground border-border",
};

export function SeoPanel({ content, audience, angle, tone, onApplyImprovement, onApplyKeywords }: SeoPanelProps) {
  const [analysis, setAnalysis] = useState<SeoAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<number>>(new Set());
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set());
  const [keywordsApplied, setKeywordsApplied] = useState(false);

  const toggleKeyword = (term: string) => {
    setSelectedKeywords((prev) => {
      const next = new Set(prev);
      if (next.has(term)) next.delete(term);
      else next.add(term);
      return next;
    });
    setKeywordsApplied(false);
  };

  const handleApplyKeywords = () => {
    if (onApplyKeywords && selectedKeywords.size > 0) {
      onApplyKeywords(Array.from(selectedKeywords));
      setKeywordsApplied(true);
      setTimeout(() => setKeywordsApplied(false), 2000);
    }
  };

  const runAnalysis = useCallback(async () => {
    if (!content || content.trim().length < 20) return;
    setLoading(true);
    setError(null);
    setAppliedIds(new Set());
    try {
      const result = await analyzeSeo(content, { audience, angle, tone });
      setAnalysis(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }, [content, audience, angle, tone]);

  const handleApply = (idx: number, imp: SeoImprovement) => {
    onApplyImprovement(imp.original, imp.suggested);
    setAppliedIds((prev) => new Set(prev).add(idx));
  };

  if (!content || content.trim().length < 20) {
    return (
      <div className="p-4 text-center text-muted-foreground text-xs">
        Draft content needed to run SEO analysis.
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">SEO & LLM Discoverability</span>
          </div>
          <Button
            size="sm"
            onClick={runAnalysis}
            disabled={loading}
            className="h-7 text-xs"
          >
            {loading ? (
              <>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Analyzing…
              </>
            ) : analysis ? (
              <>
                <Search className="w-3 h-3 mr-1" /> Re-analyze
              </>
            ) : (
              <>
                <Search className="w-3 h-3 mr-1" /> Analyze
              </>
            )}
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mt-3 p-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            {error}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-5">
          {!analysis && !loading && (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <TrendingUp className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-xs max-w-[200px]">
                Click <strong>Analyze</strong> to score your draft for LinkedIn SEO, keywords, and discoverability.
              </p>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-xs text-muted-foreground">Running AI-powered SEO analysis…</p>
            </div>
          )}

          {analysis && !loading && (
            <>
              {/* Scores row 1 - Traditional */}
              <div>
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Search className="w-3 h-3" /> LinkedIn SEO
                </h4>
                <div className="flex justify-around">
                  <ScoreRing score={analysis.seoScore} label="SEO" />
                  <ScoreRing score={analysis.discoverabilityScore} label="Discover" />
                  <ScoreRing score={analysis.semanticScore} label="Semantic" />
                </div>
              </div>

              <p className="text-xs text-muted-foreground italic text-center">{analysis.summary}</p>

              {/* Scores row 2 - LLM */}
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3">
                <h4 className="text-[10px] font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <Bot className="w-3 h-3" /> LLM Discoverability
                </h4>
                <div className="flex justify-around">
                  <ScoreRing score={analysis.llmDiscoverabilityScore} label="LLM Score" />
                  <ScoreRing score={analysis.entityCoverage} label="Entities" />
                  <ScoreRing score={analysis.structuredClaimsScore} label="Claims" />
                </div>
                <p className="text-[11px] text-muted-foreground italic">{analysis.llmSummary}</p>
              </div>

              {/* Quotable Statements */}
              {analysis.quotableStatements?.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Quote className="w-3 h-3 text-primary" /> LLM-Quotable Statements
                  </h4>
                  <div className="space-y-1.5">
                    {analysis.quotableStatements.map((stmt, i) => (
                      <div key={i} className="border-l-2 border-primary/40 pl-3 py-1">
                        <p className="text-[11px] text-foreground italic leading-relaxed">"{stmt}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing Entities */}
              {analysis.missingEntities?.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Blocks className="w-3 h-3 text-amber-glow" /> Missing Entities for LLM Citability
                  </h4>
                  <div className="space-y-1">
                    {analysis.missingEntities.map((ent, i) => (
                      <Tooltip key={i}>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className="text-[10px] border-amber-glow/30 text-amber-glow cursor-help mr-1.5 mb-1"
                          >
                            + {ent.entity}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[200px] text-xs">
                          {ent.reason}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              )}

              {/* Keywords Present */}
              {analysis.presentKeywords.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Check className="w-3 h-3 text-success" /> Keywords Found
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.presentKeywords.map((kw, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className={`text-[10px] ${
                          kw.relevance === "high"
                            ? "border-success/40 text-success"
                            : kw.relevance === "medium"
                            ? "border-primary/40 text-primary"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {kw.term}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing Keywords */}
              {analysis.missingKeywords.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3 text-amber-glow" /> Missing Keywords
                    </h4>
                    {selectedKeywords.size > 0 && (
                      <Button
                        size="sm"
                        className="h-6 text-[10px] px-2"
                        onClick={handleApplyKeywords}
                        disabled={keywordsApplied}
                      >
                        {keywordsApplied ? (
                          <><Check className="w-3 h-3 mr-1" /> Applied</>
                        ) : (
                          <>Apply {selectedKeywords.size} keyword{selectedKeywords.size > 1 ? "s" : ""}</>
                        )}
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {analysis.missingKeywords.map((kw, i) => (
                      <label
                        key={i}
                        className="flex items-center gap-2 cursor-pointer group"
                      >
                        <input
                          type="checkbox"
                          checked={selectedKeywords.has(kw.term)}
                          onChange={() => toggleKeyword(kw.term)}
                          className="w-3.5 h-3.5 rounded border-border accent-primary cursor-pointer"
                        />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="outline"
                              className={`text-[10px] cursor-help ${
                                selectedKeywords.has(kw.term)
                                  ? "border-primary/40 text-primary bg-primary/5"
                                  : "border-amber-glow/30 text-amber-glow"
                              }`}
                            >
                              + {kw.term}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[200px] text-xs">
                            {kw.reason}
                          </TooltipContent>
                        </Tooltip>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Hashtags */}
              {analysis.hashtags.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Hash className="w-3 h-3 text-primary" /> Suggested Hashtags
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.hashtags.map((ht, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className={`text-[10px] ${TREND_COLORS[ht.trendScore] || ""}`}
                      >
                        {ht.tag}
                        <span className="ml-1 opacity-60 text-[9px]">
                          {ht.trendScore === "trending" ? "🔥" : ht.trendScore === "steady" ? "📊" : "🎯"}
                        </span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Split improvements into SEO vs LLM */}
              {(() => {
                const llmKeywords = ["llm", "citab", "entity", "quotab", "ai model", "chatgpt", "perplexity", "citation", "named framework", "brand"];
                const isLlmFix = (imp: SeoImprovement) =>
                  llmKeywords.some((kw) => imp.rationale.toLowerCase().includes(kw)) ||
                  imp.target === "entity" || imp.target === "claim";

                const dedicatedLlm = analysis.llmImprovements || [];
                const seoFixes = dedicatedLlm.length > 0
                  ? analysis.improvements
                  : analysis.improvements.filter((imp) => !isLlmFix(imp));
                const llmFixes = dedicatedLlm.length > 0
                  ? dedicatedLlm
                  : analysis.improvements.filter((imp) => isLlmFix(imp));

                return (
                  <>
                    {seoFixes.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                          <Zap className="w-3 h-3 text-primary" /> SEO Quick Fixes
                        </h4>
                        <div className="space-y-2">
                          {seoFixes.map((imp, i) => (
                            <ImprovementCard
                              key={i}
                              imp={imp}
                              onApply={() => handleApply(i, imp)}
                              applied={appliedIds.has(i)}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {llmFixes.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                          <Bot className="w-3 h-3" /> LLM Citability Fixes
                        </h4>
                        <p className="text-[10px] text-muted-foreground">
                          Rewrites to make your content more quotable by AI models like ChatGPT and Perplexity.
                        </p>
                        <div className="space-y-2">
                          {llmFixes.map((imp, i) => {
                            const idx = 1000 + i;
                            return (
                              <ImprovementCard
                                key={idx}
                                imp={imp}
                                onApply={() => handleApply(idx, imp)}
                                applied={appliedIds.has(idx)}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
