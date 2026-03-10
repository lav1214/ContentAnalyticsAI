import { useState, useCallback } from "react";
import { Hash, Loader2, Copy, Check, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchTrendingHashtags, type TrendingHashtag } from "@/services/contentIntelligence";

interface HashtagPanelProps {
  topic: string;
  audience?: string;
  onApplyHashtags?: (hashtags: string[]) => void;
}

const TREND_STYLES: Record<string, string> = {
  trending: "bg-success/20 text-success border-success/30",
  steady: "bg-primary/20 text-primary border-primary/30",
  niche: "bg-muted text-muted-foreground border-border",
  "long-tail": "bg-accent/20 text-accent-foreground border-accent/30",
};

const TREND_ICONS: Record<string, string> = {
  trending: "🔥",
  steady: "📊",
  niche: "🎯",
  "long-tail": "🎣",
};

const COMPETITION_STYLES: Record<string, string> = {
  high: "text-destructive",
  medium: "text-amber-glow",
  low: "text-success",
};

export function HashtagPanel({ topic, audience, onApplyHashtags }: HashtagPanelProps) {
  const [hashtags, setHashtags] = useState<TrendingHashtag[]>([]);
  const [recommendedSet, setRecommendedSet] = useState<string[]>([]);
  const [strategy, setStrategy] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    if (!topic) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchTrendingHashtags(topic, { audience });
      setHashtags(result.hashtags);
      setRecommendedSet(result.recommendedSet);
      setStrategy(result.strategy);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch hashtags");
    } finally {
      setLoading(false);
    }
  }, [topic, audience]);

  const copyRecommended = async () => {
    await navigator.clipboard.writeText(recommendedSet.join(" "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const [applied, setApplied] = useState(false);
  const applyToPost = () => {
    if (onApplyHashtags && recommendedSet.length > 0) {
      onApplyHashtags(recommendedSet);
      setApplied(true);
      setTimeout(() => setApplied(false), 2000);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Trending Hashtags</span>
        </div>
        <Button size="sm" onClick={generate} disabled={loading} className="h-7 text-xs">
          {loading ? (
            <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Fetching…</>
          ) : hashtags.length > 0 ? (
            <><TrendingUp className="w-3 h-3 mr-1" /> Refresh</>
          ) : (
            <><TrendingUp className="w-3 h-3 mr-1" /> Discover</>
          )}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        {error && (
          <div className="p-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
            {error}
          </div>
        )}

        {!loading && hashtags.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Hash className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-xs max-w-[200px]">
              Click <strong>Discover</strong> to get trending LinkedIn hashtags aligned with your content topic.
            </p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-xs text-muted-foreground">Finding trending hashtags…</p>
          </div>
        )}

        {hashtags.length > 0 && (
          <>
            {/* Recommended set */}
            {recommendedSet.length > 0 && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
                    ⭐ Recommended Set ({recommendedSet.length})
                  </span>
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={copyRecommended}>
                    {copied ? <><Check className="w-3 h-3 mr-1" /> Copied</> : <><Copy className="w-3 h-3 mr-1" /> Copy All</>}
                  </Button>
                  <Button size="sm" className="h-6 text-[10px] px-2" onClick={applyToPost}>
                    {applied ? <><Check className="w-3 h-3 mr-1" /> Applied</> : "Apply to Post"}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {recommendedSet.map((tag, i) => (
                    <Badge key={i} className="text-xs bg-primary/20 text-primary border-primary/30">
                      {tag}
                    </Badge>
                  ))}
                </div>
                {strategy && <p className="text-[11px] text-muted-foreground italic">{strategy}</p>}
              </div>
            )}

            {/* Long-tail section */}
            {hashtags.some((ht) => ht.isLongTail) && (
              <div className="space-y-2">
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  🎣 Long-Tail Hashtags <Badge variant="outline" className="text-[9px] text-success border-success/30">Low Competition</Badge>
                </h4>
                <p className="text-[10px] text-muted-foreground italic">
                  Higher engagement rates, less competition — great for building niche authority.
                </p>
                {hashtags.filter((ht) => ht.isLongTail).map((ht, i) => (
                  <div key={`lt-${i}`} className="border border-border/50 rounded-md p-2 space-y-1 bg-muted/10">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={`text-[10px] ${TREND_STYLES["long-tail"]}`}>
                        {ht.tag}
                      </Badge>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-muted-foreground">{ht.followers}</span>
                        <span className={`text-[9px] font-medium ${COMPETITION_STYLES[ht.competition] || ""}`}>
                          {ht.competition} comp.
                        </span>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{ht.reason}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Broad & mid-tier */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Broad & Mid-Tier
              </h4>
              {hashtags.filter((ht) => !ht.isLongTail).map((ht, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-[10px] ${TREND_STYLES[ht.trend] || ""}`}>
                      {TREND_ICONS[ht.trend]} {ht.tag}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{ht.followers}</span>
                    <span className={`text-[9px] ${COMPETITION_STYLES[ht.competition] || ""}`}>
                      {ht.competition}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${ht.relevance}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-6 text-right">{ht.relevance}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
