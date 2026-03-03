import { useState, useCallback } from "react";
import type { ContentBrief, SourceAnalysis, ToneOption } from "@/types/content";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { StrategyPanel } from "@/components/StrategyPanel";
import {
  FileText, Target, MessageSquare, Volume2, Mic, Compass,
  Building2, User, Linkedin, Pencil, Check, X, ChevronDown
} from "lucide-react";

interface ContentBriefPanelProps {
  brief: ContentBrief;
  sourceAnalysis: SourceAnalysis;
  onUpdateBrief: (updates: Partial<ContentBrief>) => void;
  onUpdateTone: (tone: ToneOption) => void;
  onConfirm: () => void;
  onUpdateAnalysis?: (updated: SourceAnalysis) => void;
  onInlineEdit?: (field: string, oldValue: string, newValue: string) => void;
}

const TONE_OPTIONS: { value: ToneOption; label: string }[] = [
  { value: "authoritative", label: "Authoritative" },
  { value: "conversational", label: "Conversational" },
  { value: "provocative", label: "Provocative" },
  { value: "visionary", label: "Visionary" },
];

function InlineField({
  label,
  value,
  icon: Icon,
  onSave,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string | null;
  icon: React.ElementType;
  onSave: (val: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");

  const handleSave = () => {
    onSave(draft.trim());
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(value || "");
    setEditing(false);
  };

  if (value === null && !editing) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
        </div>
        <button
          onClick={() => { setDraft(""); setEditing(true); }}
          className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
        >
          + Add {label.toLowerCase()}
        </button>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">{label}</span>
        </div>
        {multiline ? (
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="text-sm min-h-[60px] bg-background"
            placeholder={placeholder}
            autoFocus
          />
        ) : (
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="text-sm bg-background"
            placeholder={placeholder}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
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
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">{label}</span>
      </div>
      <div
        className="group relative cursor-pointer rounded-lg border border-border bg-muted/30 p-3"
        onClick={() => { setDraft(value || ""); setEditing(true); }}
      >
        <p className="text-sm text-foreground leading-relaxed pr-6">{value}</p>
        <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity absolute top-3 right-3" />
      </div>
    </div>
  );
}

export function ContentBriefPanel({
  brief,
  sourceAnalysis,
  onUpdateBrief,
  onUpdateTone,
  onConfirm,
  onUpdateAnalysis,
  onInlineEdit,
}: ContentBriefPanelProps) {
  const [showToneSelector, setShowToneSelector] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <h2 className="font-serif text-lg font-semibold text-foreground">Content Brief</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Review what I understood — confirm or edit before we build your content strategy
        </p>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 scrollbar-thin">
        {/* Report Summary */}
        <InlineField
          label="What I Found in Your Document"
          value={brief.reportSummary}
          icon={FileText}
          multiline
          onSave={(val) => onUpdateBrief({ reportSummary: val })}
        />

        {/* Objective */}
        <InlineField
          label="Objective"
          value={brief.objective}
          icon={Target}
          multiline
          onSave={(val) => onUpdateBrief({ objective: val })}
        />

        {/* User Narrative */}
        <InlineField
          label="Your Narrative"
          value={brief.userNarrative}
          icon={MessageSquare}
          multiline
          placeholder="What belief or narrative should this content challenge or reinforce?"
          onSave={(val) => onUpdateBrief({ userNarrative: val || null })}
        />

        {/* Tone & Voice */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Tone & Voice</span>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            {/* Tone */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-muted-foreground">Tone: </span>
                <span className="text-sm text-foreground">{brief.tone}</span>
              </div>
              <button
                onClick={() => setShowToneSelector(!showToneSelector)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
            {showToneSelector && (
              <div className="flex flex-wrap gap-1.5">
                {TONE_OPTIONS.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => {
                      onUpdateTone(t.value);
                      setShowToneSelector(false);
                    }}
                    className="text-xs px-2.5 py-1 rounded-full border border-border hover:border-primary hover:text-primary transition-colors"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            {/* Voice */}
            <div>
              <span className="text-xs text-muted-foreground">Voice: </span>
              <span className="text-sm text-foreground">{brief.voice}</span>
            </div>
          </div>
        </div>

        {/* Proposed Approach */}
        <InlineField
          label="Proposed Approach"
          value={brief.proposedApproach}
          icon={Compass}
          multiline
          onSave={(val) => onUpdateBrief({ proposedApproach: val })}
        />

        {/* Brand · Persona · Channel */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Brand · Persona · Channel</span>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <InlineField
              label="Brand"
              value={brief.brand}
              icon={Building2}
              placeholder="Enter your brand or company name"
              onSave={(val) => onUpdateBrief({ brand: val || null })}
            />
            <div className="flex items-center gap-1.5 text-sm">
              <User className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">Persona:</span>
              <span className="text-foreground">{brief.persona}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <Linkedin className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">Channel:</span>
              <span className="text-foreground">{brief.channel}</span>
            </div>
          </div>
        </div>

        {/* Collapsible Source Analysis */}
        <Collapsible open={analysisOpen} onOpenChange={setAnalysisOpen}>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${analysisOpen ? "" : "-rotate-90"}`} />
            View full source analysis
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <StrategyPanel
              sourceAnalysis={sourceAnalysis}
              onUpdateAnalysis={onUpdateAnalysis}
              onInlineEdit={onInlineEdit}
            />
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Confirm button */}
      {!brief.confirmed && (
        <div className="px-6 py-4 border-t border-border">
          <Button className="w-full" onClick={onConfirm}>
            Confirm Brief →
          </Button>
        </div>
      )}
    </div>
  );
}

// Read-only brief viewer for later phases
export function ContentBriefViewer({ brief }: { brief: ContentBrief }) {
  return (
    <div className="p-4 space-y-3 text-sm">
      <h3 className="font-serif font-semibold text-foreground">Content Brief</h3>
      {brief.reportSummary && (
        <div><span className="text-xs text-muted-foreground uppercase">Summary</span><p className="text-foreground">{brief.reportSummary}</p></div>
      )}
      {brief.objective && (
        <div><span className="text-xs text-muted-foreground uppercase">Objective</span><p className="text-foreground">{brief.objective}</p></div>
      )}
      {brief.userNarrative && (
        <div><span className="text-xs text-muted-foreground uppercase">Narrative</span><p className="text-foreground">{brief.userNarrative}</p></div>
      )}
      <div><span className="text-xs text-muted-foreground uppercase">Tone</span><p className="text-foreground">{brief.tone}</p></div>
      <div><span className="text-xs text-muted-foreground uppercase">Voice</span><p className="text-foreground">{brief.voice}</p></div>
      {brief.proposedApproach && (
        <div><span className="text-xs text-muted-foreground uppercase">Approach</span><p className="text-foreground">{brief.proposedApproach}</p></div>
      )}
      {brief.brand && (
        <div><span className="text-xs text-muted-foreground uppercase">Brand</span><p className="text-foreground">{brief.brand}</p></div>
      )}
    </div>
  );
}
