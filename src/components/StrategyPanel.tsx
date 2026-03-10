import { useState, useCallback } from "react";
import type { SourceAnalysis } from "@/types/content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Target, Lightbulb, Zap, Pencil, Check, X, Plus } from "lucide-react";

interface StrategyPanelProps {
  sourceAnalysis: SourceAnalysis;
  onUpdateAnalysis?: (updated: SourceAnalysis) => void;
  onInlineEdit?: (field: string, oldValue: string, newValue: string) => void;
}

function InlineEditText({
  value,
  onSave,
  multiline = false,
}: {
  value: string;
  onSave: (newValue: string) => void;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const handleSave = () => {
    if (draft.trim() && draft.trim() !== value) {
      onSave(draft.trim());
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="space-y-1.5">
        {multiline ? (
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="text-sm min-h-[60px] bg-background"
            autoFocus
          />
        ) : (
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="text-sm bg-background"
            autoFocus
          />
        )}
        <div className="flex gap-1">
          <Button size="sm" variant="default" className="h-6 text-[10px] px-2 gap-1" onClick={handleSave}>
            <Check className="w-3 h-3" /> Save
          </Button>
          <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 gap-1" onClick={handleCancel}>
            <X className="w-3 h-3" /> Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative cursor-pointer" onClick={() => { setDraft(value); setEditing(true); }}>
      <p className="text-sm text-foreground leading-relaxed pr-6">
        {multiline && value.startsWith('"') ? <span className="italic">{value}</span> : value}
      </p>
      <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity absolute top-0.5 right-0" />
    </div>
  );
}

export function StrategyPanel({ sourceAnalysis, onUpdateAnalysis, onInlineEdit }: StrategyPanelProps) {
  const handleFieldUpdate = useCallback(
    (field: string, oldValue: string, newValue: string, updater: (analysis: SourceAnalysis) => SourceAnalysis) => {
      if (!onUpdateAnalysis) return;
      const updated = updater(sourceAnalysis);
      onUpdateAnalysis(updated);
      onInlineEdit?.(field, oldValue, newValue);
    },
    [sourceAnalysis, onUpdateAnalysis, onInlineEdit]
  );

  const [newInsight, setNewInsight] = useState("");
  const [addingInsight, setAddingInsight] = useState(false);

  const handleAddInsight = () => {
    if (!newInsight.trim() || !onUpdateAnalysis) return;
    const updated = { ...sourceAnalysis, keyInsights: [...sourceAnalysis.keyInsights, newInsight.trim()] };
    onUpdateAnalysis(updated);
    onInlineEdit?.("keyInsights", "", newInsight.trim());
    setNewInsight("");
    setAddingInsight(false);
  };

  const handleDeleteInsight = (index: number) => {
    if (!onUpdateAnalysis) return;
    const old = sourceAnalysis.keyInsights[index];
    const updated = { ...sourceAnalysis, keyInsights: sourceAnalysis.keyInsights.filter((_, i) => i !== index) };
    onUpdateAnalysis(updated);
    onInlineEdit?.("keyInsights", old, "(deleted)");
  };

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="font-serif text-lg font-semibold text-foreground">Source Analysis</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Click any field to edit inline, or answer questions in chat</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 scrollbar-thin">
        {/* Core Thesis */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-primary" />
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Core Thesis</h3>
          </div>
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <InlineEditText
              value={sourceAnalysis.coreThesis}
              multiline
              onSave={(val) =>
                handleFieldUpdate("coreThesis", sourceAnalysis.coreThesis, val, (a) => ({ ...a, coreThesis: val }))
              }
            />
          </div>
        </div>

        {/* Key Insights */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5 text-primary" />
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Key Insights ({sourceAnalysis.keyInsights.length})
            </h3>
          </div>
          <div className="space-y-1.5">
            {sourceAnalysis.keyInsights.map((insight, i) => (
              <div key={i} className="group flex items-start gap-1.5">
                <div className="flex-1">
                  <InlineEditText
                    value={insight}
                    onSave={(val) =>
                      handleFieldUpdate("keyInsights", insight, val, (a) => ({
                        ...a,
                        keyInsights: a.keyInsights.map((ins, idx) => (idx === i ? val : ins)),
                      }))
                    }
                  />
                </div>
                {onUpdateAnalysis && (
                  <button
                    onClick={() => handleDeleteInsight(i)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 text-muted-foreground hover:text-destructive"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
            {onUpdateAnalysis && (
              addingInsight ? (
                <div className="flex gap-1.5 items-center">
                  <Input
                    value={newInsight}
                    onChange={(e) => setNewInsight(e.target.value)}
                    placeholder="New insight…"
                    className="text-sm h-7 bg-background"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleAddInsight()}
                  />
                  <Button size="sm" variant="default" className="h-7 text-[10px] px-2" onClick={handleAddInsight}>
                    <Check className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2" onClick={() => { setAddingInsight(false); setNewInsight(""); }}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingInsight(true)}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors mt-1"
                >
                  <Plus className="w-3 h-3" /> Add insight
                </button>
              )
            )}
          </div>
        </div>

        {/* Suggested Hook */}
        {sourceAnalysis.suggestedHook && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Suggested Hook</h3>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <InlineEditText
                value={`"${sourceAnalysis.suggestedHook}"`}
                multiline
                onSave={(val) => {
                  const clean = val.replace(/^[""]|[""]$/g, "").trim();
                  handleFieldUpdate("suggestedHook", sourceAnalysis.suggestedHook!, clean, (a) => ({ ...a, suggestedHook: clean }));
                }}
              />
            </div>
          </div>
        )}

        {/* Audience */}
        {sourceAnalysis.likelyAudience && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Likely Audience</h3>
            <InlineEditText
              value={sourceAnalysis.likelyAudience}
              onSave={(val) =>
                handleFieldUpdate("likelyAudience", sourceAnalysis.likelyAudience!, val, (a) => ({ ...a, likelyAudience: val }))
              }
            />
          </div>
        )}

        {/* Controversial Claim */}
        {sourceAnalysis.controversialClaim && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contrarian Angle</h3>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
              <InlineEditText
                value={sourceAnalysis.controversialClaim}
                multiline
                onSave={(val) =>
                  handleFieldUpdate("controversialClaim", sourceAnalysis.controversialClaim, val, (a) => ({ ...a, controversialClaim: val }))
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
