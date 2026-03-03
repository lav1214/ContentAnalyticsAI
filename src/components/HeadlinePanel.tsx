import { useState, useCallback } from "react";
import { Lightbulb, Loader2, Copy, Check, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { suggestHeadlines, type HeadlineSuggestion } from "@/services/contentIntelligence";

interface HeadlinePanelProps {
  content: string;
  audience?: string;
  angle?: string;
  tone?: string;
  onApplyHeadline: (headline: string) => void;
}

const TYPE_LABELS: Record<string, { label: string; emoji: string }> = {
  question: { label: "Question", emoji: "❓" },
  "bold-claim": { label: "Bold Claim", emoji: "🔥" },
  numbered: { label: "Numbered", emoji: "📊" },
  story: { label: "Story", emoji: "📖" },
  "data-driven": { label: "Data", emoji: "📈" },
};

export function HeadlinePanel({ content, audience, angle, tone, onApplyHeadline }: HeadlinePanelProps) {
  const [headlines, setHeadlines] = useState<HeadlineSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const generate = useCallback(async () => {
    if (!content || content.trim().length < 20) return;
    setLoading(true);
    setError(null);
    try {
      const result = await suggestHeadlines(content, { audience, angle, tone, count: 5 });
      setHeadlines(result.headlines);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate headlines");
    } finally {
      setLoading(false);
    }
  }, [content, audience, angle, tone]);

  const handleCopy = async (text: string, idx: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Headline Suggestions</span>
        </div>
        <Button size="sm" onClick={generate} disabled={loading} className="h-7 text-xs">
          {loading ? (
            <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Generating…</>
          ) : headlines.length > 0 ? (
            <><Lightbulb className="w-3 h-3 mr-1" /> Regenerate</>
          ) : (
            <><Lightbulb className="w-3 h-3 mr-1" /> Generate</>
          )}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
        {error && (
          <div className="p-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
            {error}
          </div>
        )}

        {!loading && headlines.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Lightbulb className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-xs max-w-[200px]">
              Click <strong>Generate</strong> to get AI-powered headline alternatives optimized for LinkedIn SEO.
            </p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-xs text-muted-foreground">Crafting headline alternatives…</p>
          </div>
        )}

        {headlines.map((h, i) => {
          const typeInfo = TYPE_LABELS[h.type] || { label: h.type, emoji: "💡" };
          return (
            <div key={i} className="border border-border rounded-md p-3 space-y-2 bg-muted/20 hover:bg-muted/40 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-foreground flex-1 leading-snug">{h.text}</p>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => handleCopy(h.text, i)}
                  >
                    {copiedIdx === i ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                  </Button>
                  <Button
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => onApplyHeadline(h.text)}
                  >
                    Use
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px]">
                  {typeInfo.emoji} {typeInfo.label}
                </Badge>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Star className="w-3 h-3 text-primary" />
                  SEO: {h.seoScore}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Star className="w-3 h-3 text-amber-glow" />
                  Engagement: {h.engagementScore}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground italic">{h.rationale}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
