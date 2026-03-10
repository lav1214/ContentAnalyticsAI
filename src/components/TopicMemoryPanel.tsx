import { useState, useEffect } from "react";
import { Brain, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getTopicHistory, getAuthorityClusters, clearTopicHistory, type TopicEntry, type AuthorityCluster } from "@/services/topicMemory";

export function TopicMemoryPanel() {
  const [history, setHistory] = useState<TopicEntry[]>([]);
  const [clusters, setClusters] = useState<AuthorityCluster[]>([]);
  const [view, setView] = useState<"clusters" | "history">("clusters");

  useEffect(() => {
    setHistory(getTopicHistory());
    setClusters(getAuthorityClusters());
  }, []);

  const handleClear = () => {
    clearTopicHistory();
    setHistory([]);
    setClusters([]);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Topic Memory</span>
        </div>
        {history.length > 0 && (
          <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-muted-foreground" onClick={handleClear}>
            <Trash2 className="w-3 h-3 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* View toggle */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setView("clusters")}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
            view === "clusters" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"
          }`}
        >
          Authority Clusters
        </button>
        <button
          onClick={() => setView("history")}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
            view === "history" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"
          }`}
        >
          Post History ({history.length})
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
        {history.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Brain className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-xs max-w-[200px]">
              As you create content, I'll track your topics to help you build focused authority clusters on LinkedIn.
            </p>
          </div>
        )}

        {view === "clusters" && clusters.length > 0 && (
          <>
            <p className="text-[11px] text-muted-foreground italic">
              Your emerging authority areas based on past content. Consistent posting in these clusters builds stronger LinkedIn presence.
            </p>
            {clusters.map((cluster, i) => (
              <div key={i} className="border border-border rounded-md p-3 space-y-2 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground capitalize">{cluster.name}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {cluster.count} post{cluster.count > 1 ? "s" : ""}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  {cluster.keywords.map((kw, j) => (
                    <Badge key={j} variant="outline" className="text-[9px] text-muted-foreground">
                      {kw}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  Last: {formatDate(cluster.lastUsed)}
                </div>
                {/* Authority strength bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] text-muted-foreground">
                    <span>Authority Strength</span>
                    <span>{Math.min(cluster.count * 20, 100)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${Math.min(cluster.count * 20, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {view === "history" && history.length > 0 && history.map((entry, i) => (
          <div key={i} className="border border-border rounded-md p-3 space-y-1.5 bg-muted/20">
            <div className="flex items-start justify-between">
              <span className="text-xs font-medium text-foreground">{entry.topic}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{formatDate(entry.createdAt)}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className="text-[9px]">{entry.angle}</Badge>
              <Badge variant="outline" className="text-[9px]">{entry.audience}</Badge>
              {entry.formats.map((f, j) => (
                <Badge key={j} variant="outline" className="text-[9px] text-muted-foreground">{f}</Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {entry.keywords.slice(0, 5).map((kw, j) => (
                <span key={j} className="text-[9px] text-primary">#{kw}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
