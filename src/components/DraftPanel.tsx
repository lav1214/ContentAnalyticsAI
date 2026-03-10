import { useState, useCallback, useEffect, useRef } from "react";
import type { DraftContent, FormatOption } from "@/types/content";
import { Copy, Check, Download, Zap, ImageIcon, Save, Sparkles, History, RotateCcw, ChevronDown, ChevronUp, Lightbulb, Hash, Search } from "lucide-react";
import { ImageGeneratorModal } from "@/components/ImageGeneratorModal";
import { LinkedInPreview } from "@/components/LinkedInPreview";
import { SavedDraftsPanel } from "@/components/SavedDraftsPanel";
import { SeoPanel } from "@/components/SeoPanel";
import { HeadlinePanel } from "@/components/HeadlinePanel";
import { HashtagPanel } from "@/components/HashtagPanel";
import { TopicMemoryPanel } from "@/components/TopicMemoryPanel";
import { AuthorityDashboard } from "@/components/AuthorityDashboard";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import type { UIPhase } from "@/components/PhaseIndicator";

interface DraftPanelProps {
  drafts: DraftContent;
  selectedFormats: FormatOption[];
  onUpdateDraft: (key: keyof DraftContent, value: string) => void;
  onRefinementCommand?: (command: string) => void;
  audience?: string;
  angle?: string;
  tone?: string;
  objective?: string;
  selectedImages?: string[];
  uiPhase?: UIPhase;
}

type TabKey = "linkedinLong" | "linkedinShort" | "sponsoredAds";
type SidePanel = "seo" | "headlines" | "hashtags" | "memory" | "saved" | "preview" | "authority" | "history" | null;

export interface EditEntry {
  id: string;
  timestamp: Date;
  action: string;
  changelog: string[];
  snapshotBefore: string;
  snapshotAfter: string;
  format: TabKey;
}

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "linkedinLong", label: "LinkedIn Long", icon: "📝" },
  { key: "linkedinShort", label: "LinkedIn Short", icon: "⚡" },
  { key: "sponsoredAds", label: "Sponsored Ads", icon: "📢" },
];

const SLIDER_CONFIG = [
  { key: "tone", label: "Tone", left: "Conservative", right: "Challenger" },
  { key: "boldness", label: "Boldness", left: "Safe", right: "Provocative" },
  { key: "length", label: "Length", left: "Concise", right: "Detailed" },
  { key: "cta", label: "CTA", left: "Soft", right: "Direct" },
] as const;

const SECTIONS = ["Hook", "Body", "Proof", "CTA"] as const;

/** Split draft content into 4 sections by paragraph blocks */
function splitIntoSections(content: string): { section: string; text: string }[] {
  if (!content) return [];
  const lines = content.split("\n");
  const totalLines = lines.length;
  if (totalLines <= 4) {
    return lines.map((line, i) => {
      const sectionMap = ["Hook", "Body", "Proof", "CTA"];
      return { section: sectionMap[Math.min(i, 3)], text: line };
    });
  }

  // Group lines into paragraph blocks (split on empty lines)
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.trim() === "" && current.length > 0) {
      blocks.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);

  if (blocks.length === 0) return [{ section: "Hook", text: content }];

  // Map blocks to sections: first block = Hook, last block = CTA, second-to-last = Proof, rest = Body
  const results: { section: string; text: string }[] = [];
  blocks.forEach((block, i) => {
    let section: string;
    if (i === 0) section = "Hook";
    else if (i === blocks.length - 1) section = "CTA";
    else if (i === blocks.length - 2 && blocks.length > 2) section = "Proof";
    else section = "Body";
    results.push({ section, text: block.join("\n") });
    // Add empty line separator between blocks
    if (i < blocks.length - 1) {
      results.push({ section, text: "" });
    }
  });
  return results;
}

export function DraftPanel({ drafts, selectedFormats, onUpdateDraft, onRefinementCommand, audience, angle, tone, objective, uiPhase }: DraftPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("linkedinLong");
  const [copied, setCopied] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [refiningSection, setRefiningSection] = useState<string | null>(null);
  const [sliders, setSliders] = useState({ tone: 50, boldness: 50, length: 50, cta: 50 });
  const [showSliders, setShowSliders] = useState(true);
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);
  const [showImageGen, setShowImageGen] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const prevDraftsRef = useRef(drafts);

  // Edit history tracking
  const [editHistory, setEditHistory] = useState<EditEntry[]>([]);
  const [isSaved, setIsSaved] = useState(false);

  // Workflow prompts
  const [showWorkflowBar, setShowWorkflowBar] = useState(false);
  const [workflowStep, setWorkflowStep] = useState<"save" | "image" | "preview" | "done" | null>(null);
  const [workflowDismissed, setWorkflowDismissed] = useState(false);

  // Guided workflow checklist
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [activeGuideStep, setActiveGuideStep] = useState<string | null>(null);

  useEffect(() => {
    const prev = prevDraftsRef.current;
    for (const fmt of selectedFormats) {
      if (drafts[fmt] && !prev[fmt]) {
        setActiveTab(fmt);
        break;
      }
    }
    if (!drafts[activeTab]) {
      const firstWithContent = selectedFormats.find((f) => drafts[f]);
      if (firstWithContent) setActiveTab(firstWithContent);
    }

    // Track edits (only AI refinements, not initial generation)
    for (const fmt of selectedFormats) {
      if (prev[fmt] && drafts[fmt] && prev[fmt] !== drafts[fmt] && prev[fmt].length > 0) {
        const isInitialGen = !prev[fmt] || prev[fmt].length < 10;
        if (!isInitialGen) {
          setIsSaved(false);
          setRefiningSection(null);
        }
      }
    }

    prevDraftsRef.current = drafts;
  }, [drafts, selectedFormats]);

  // Show workflow bar after 3+ edits and not dismissed
  useEffect(() => {
    if (editHistory.length >= 2 && !workflowDismissed && !isSaved) {
      setShowWorkflowBar(true);
      if (!workflowStep) setWorkflowStep("save");
    }
  }, [editHistory.length, workflowDismissed, isSaved]);

  const currentContent = drafts[activeTab];
  const isEmpty = !currentContent;

  // Public method to add edit entries (called from parent via ref or prop)
  const addEditEntry = useCallback(
    (action: string, changelog: string[], before: string, after: string) => {
      const entry: EditEntry = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        action,
        changelog,
        snapshotBefore: before,
        snapshotAfter: after,
        format: activeTab,
      };
      setEditHistory((prev) => [entry, ...prev]);
      setIsSaved(false);
      // Trigger workflow after edits
      if (!workflowDismissed) {
        setShowWorkflowBar(true);
        setWorkflowStep("save");
      }
    },
    [activeTab, workflowDismissed]
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(currentContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([currentContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeTab}-draft.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSliderChange = useCallback(
    (key: string, value: number[]) => {
      const newVal = value[0];
      setSliders((prev) => ({ ...prev, [key]: newVal }));
    },
    []
  );

  const handleSliderCommit = useCallback(
    (key: string, value: number[]) => {
      const newVal = value[0];
      if (!onRefinementCommand) return;
      const config = SLIDER_CONFIG.find((s) => s.key === key);
      if (!config) return;
      if (newVal > 70) {
        onRefinementCommand(`Adjust ${config.label.toLowerCase()} toward ${config.right.toLowerCase()}`);
        setCompletedSteps(prev => new Set(prev).add("refine"));
      } else if (newVal < 30) {
        onRefinementCommand(`Adjust ${config.label.toLowerCase()} toward ${config.left.toLowerCase()}`);
        setCompletedSteps(prev => new Set(prev).add("refine"));
      }
    },
    [onRefinementCommand]
  );

  const handleSectionClick = (section: string) => {
    setActiveSection(activeSection === section ? null : section);
  };

  const handleApplyImprovement = useCallback(
    (original: string, replacement: string) => {
      if (!currentContent) return;
      const updated = currentContent.replace(original, replacement);
      if (updated !== currentContent) {
        addEditEntry("Applied fix", [`Replaced: "${original.slice(0, 40)}…" → "${replacement.slice(0, 40)}…"`], currentContent, updated);
        onUpdateDraft(activeTab, updated);
      }
    },
    [currentContent, activeTab, onUpdateDraft, addEditEntry]
  );

  const handleApplyHeadline = useCallback(
    (headline: string) => {
      if (!currentContent) return;
      const lines = currentContent.split("\n");
      const oldHeadline = lines[0];
      lines[0] = headline;
      const updated = lines.join("\n");
      addEditEntry("Changed headline", [`"${oldHeadline.slice(0, 50)}…" → "${headline.slice(0, 50)}…"`], currentContent, updated);
      onUpdateDraft(activeTab, updated);
    },
    [currentContent, activeTab, onUpdateDraft, addEditEntry]
  );

  const handleApplyHashtags = useCallback(
    (hashtags: string[]) => {
      if (!currentContent) return;
      const hashtagLine = "\n\n" + hashtags.join(" ");
      const cleaned = currentContent.replace(/\n\n(#\S+\s*)+$/m, "");
      const updated = cleaned + hashtagLine;
      addEditEntry("Applied hashtags", hashtags.map((h) => `Added ${h}`), currentContent, updated);
      onUpdateDraft(activeTab, updated);
    },
    [currentContent, activeTab, onUpdateDraft, addEditEntry]
  );

  const handleApplyKeywords = useCallback(
    (keywords: string[]) => {
      if (!currentContent || !onRefinementCommand) return;
      onRefinementCommand(`Naturally weave these keywords into the existing draft without changing the structure or tone: ${keywords.join(", ")}`);
    },
    [currentContent, onRefinementCommand]
  );

  const toggleSidePanel = (panel: SidePanel) => {
    setSidePanel((prev) => (prev === panel ? null : panel));
    // Mark authority/optimize as completed when opened
    if (panel === "authority") setCompletedSteps(prev => new Set(prev).add("authority"));
    if (panel === "seo") setCompletedSteps(prev => new Set(prev).add("optimize"));
  };

  // Quick save from workflow
  const handleQuickSave = async () => {
    if (!currentContent?.trim()) return;
    const title = `Draft — ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    const { error } = await supabase.from("saved_drafts").insert({
      title,
      format: activeTab,
      content: currentContent,
      image_url: generatedImage || null,
    });
    if (error) {
      toast.error("Failed to save draft");
    } else {
      toast.success("Draft saved!");
      setIsSaved(true);
      setCompletedSteps(prev => new Set(prev).add("save"));
      setWorkflowStep(generatedImage ? "preview" : "image");
    }
  };

  const handleWorkflowImageStep = () => {
    setShowImageGen(true);
    setWorkflowStep("preview");
  };

  const handleWorkflowPreviewStep = () => {
    setSidePanel("preview");
    setWorkflowStep("done");
  };

  const handleRevert = (entry: EditEntry) => {
    onUpdateDraft(entry.format, entry.snapshotBefore);
    addEditEntry("Reverted edit", [`Reverted: "${entry.action}"`], entry.snapshotAfter, entry.snapshotBefore);
    toast.success("Reverted to previous version");
  };

  // Extract topic from content for hashtag panel
  const contentTopic = currentContent?.split("\n").find((l) => l.trim().length > 10)?.slice(0, 100) || "";

  const formatTimeAgo = (d: Date) => {
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex items-center border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}

        {/* Phase-aware Actions */}
        {!isEmpty && (
          <div className="ml-auto flex items-center gap-1 pr-4">
            {/* Phase 3: Draft actions */}
            {(uiPhase === "draft" || !uiPhase) && (
              <>
                <button
                  onClick={() => toggleSidePanel("headlines")}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    sidePanel === "headlines"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  Headlines
                </button>
                <button
                  onClick={() => toggleSidePanel("hashtags")}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    sidePanel === "hashtags"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Hash className="w-3.5 h-3.5" />
                  Hashtags
                </button>
                <button
                  onClick={() => toggleSidePanel("seo")}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    sidePanel === "seo"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Search className="w-3.5 h-3.5" />
                  Check SEO
                </button>
                {(activeTab === "linkedinLong" || activeTab === "linkedinShort") && (
                  <button
                    onClick={() => setShowImageGen(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="Generate image from content"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    Add Image
                  </button>
                )}
                <button
                  onClick={() => toggleSidePanel("history")}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs transition-colors relative ${
                    sidePanel === "history"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  History
                  {editHistory.length > 0 && (
                    <span className="ml-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[8px] flex items-center justify-center font-bold">
                      {editHistory.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export
                </button>
              </>
            )}
            {/* Phase 4: Polish actions */}
            {uiPhase === "polish" && (
              <>
                <button
                  onClick={() => toggleSidePanel("seo")}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    sidePanel === "seo"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Search className="w-3.5 h-3.5" />
                  Check SEO
                </button>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export
                </button>
                <button
                  onClick={handleQuickSave}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Draft editor */}
        <div className={`${sidePanel && !isEmpty ? "w-[60%] border-r border-border" : "w-full"} relative flex flex-col overflow-hidden`}>
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <span className="text-2xl">✍️</span>
              </div>
              <p className="text-muted-foreground text-sm max-w-xs">
                Your drafts will appear here once we've established strategic clarity through the conversation.
              </p>
            </div>
          ) : (
            <>
              {/* Full post view with section highlighting */}
              <div className="flex-1 overflow-y-auto scrollbar-thin">
                {(() => {
                  const sections = splitIntoSections(currentContent);
                  const merged: Record<string, string[]> = {};
                  for (const block of sections) {
                    if (block.text.trim()) {
                      if (!merged[block.section]) merged[block.section] = [];
                      merged[block.section].push(block.text);
                    }
                  }

                  const sectionKeys = Object.keys(merged);
                  if (sectionKeys.length === 0) {
                    return (
                      <div className="p-6">
                        <textarea
                          value={currentContent}
                          onChange={(e) => onUpdateDraft(activeTab, e.target.value)}
                          className="w-full h-full min-h-[400px] bg-transparent text-foreground text-sm leading-relaxed resize-none focus:outline-none font-mono"
                          spellCheck={false}
                        />
                      </div>
                    );
                  }

                  return (
                    <div className="p-6">
                      {/* Section label chips */}
                      <div className="flex items-center gap-2 mb-4">
                        {SECTIONS.map((sec) => {
                          if (!merged[sec]) return null;
                          const isRefining = refiningSection === sec;
                          const isActive = activeSection === sec;
                          return (
                            <button
                              key={sec}
                              onClick={() => handleSectionClick(sec)}
                              className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md transition-all ${
                                isRefining
                                  ? "bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/30"
                                  : isActive
                                  ? "bg-primary/10 text-primary"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
                              }`}
                            >
                              {sec}
                              {isRefining && <span className="ml-1 animate-pulse">⟳</span>}
                            </button>
                          );
                        })}
                      </div>

                      {/* Live Refinement Sliders */}
                      {showSliders && (
                        <div className="mb-4 p-3 rounded-lg border border-border/50 bg-muted/20 space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Live Refinement</p>
                            <button
                              onClick={() => setShowSliders(false)}
                              className="text-[10px] text-muted-foreground hover:text-foreground"
                            >
                              Hide
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                            {SLIDER_CONFIG.map((s) => (
                              <div key={s.key} className="space-y-1">
                                <div className="flex justify-between text-[10px] text-muted-foreground">
                                  <span>{s.left}</span>
                                  <span className="font-medium text-foreground">{s.label}</span>
                                  <span>{s.right}</span>
                                </div>
                                <Slider
                                  value={[sliders[s.key as keyof typeof sliders]]}
                                  onValueChange={(v) => handleSliderChange(s.key, v)}
                                  onValueCommit={(v) => handleSliderCommit(s.key, v)}
                                  max={100}
                                  step={5}
                                  className="w-full cursor-pointer"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Full continuous post with highlighted sections */}
                      <div className="space-y-0">
                        {SECTIONS.map((sec) => {
                          const texts = merged[sec];
                          if (!texts) return null;
                          const sectionText = texts.join("\n\n");
                          const isRefining = refiningSection === sec;
                          const isActive = activeSection === sec;

                          return (
                            <div
                              key={sec}
                              onClick={() => handleSectionClick(sec)}
                              className={`relative cursor-pointer transition-all duration-300 group ${
                                isRefining
                                  ? "bg-amber-500/8 border-l-2 border-amber-500/50 pl-4 py-2 -ml-4 rounded-r-md"
                                  : isActive
                                  ? "bg-primary/5 border-l-2 border-primary/30 pl-4 py-2 -ml-4 rounded-r-md"
                                  : "pl-0 py-2"
                              }`}
                            >
                              {/* Inline label + refine on hover */}
                              <div className={`flex items-center justify-between mb-1 transition-opacity ${
                                isRefining || isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                              }`}>
                                <span className={`text-[9px] font-semibold uppercase tracking-widest ${
                                  isRefining ? "text-amber-500" : "text-primary/60"
                                }`}>
                                  {sec} {isRefining && "— refining..."}
                                </span>
                                {onRefinementCommand && !isRefining && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRefiningSection(sec);
                                      setActiveSection(sec);
                                      onRefinementCommand(`Refine the ${sec}: `);
                                    }}
                                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                  >
                                    <Zap className="w-3 h-3" />
                                    Refine
                                  </button>
                                )}
                              </div>
                              <pre className="text-sm leading-relaxed font-mono whitespace-pre-wrap text-foreground">{sectionText}</pre>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>

        {/* Side Panel */}
        {sidePanel && !isEmpty && (
          <div className="w-[40%] animate-slide-in-right">
            {sidePanel === "seo" && (
              <SeoPanel
                content={currentContent}
                audience={audience}
                angle={angle}
                tone={tone}
                onApplyImprovement={handleApplyImprovement}
                onApplyKeywords={handleApplyKeywords}
              />
            )}
            {sidePanel === "headlines" && (
              <HeadlinePanel
                content={currentContent}
                audience={audience}
                angle={angle}
                tone={tone}
                onApplyHeadline={handleApplyHeadline}
              />
            )}
            {sidePanel === "hashtags" && (
              <HashtagPanel
                topic={contentTopic}
                audience={audience}
                onApplyHashtags={handleApplyHashtags}
              />
            )}
            {sidePanel === "memory" && (
              <TopicMemoryPanel />
            )}
            {sidePanel === "saved" && (
              <SavedDraftsPanel
                currentContent={currentContent}
                currentFormat={activeTab}
                currentImage={generatedImage}
                onLoadDraft={(content, format, imageUrl) => {
                  onUpdateDraft(format as keyof DraftContent, content);
                  setActiveTab(format as TabKey);
                  if (imageUrl) setGeneratedImage(imageUrl);
                  setSidePanel(null);
                }}
                onClose={() => setSidePanel(null)}
              />
            )}
            {sidePanel === "preview" && currentContent && (
              <LinkedInPreview
                content={currentContent}
                format={activeTab as "linkedinLong" | "linkedinShort" | "sponsoredAds"}
                imageUrl={generatedImage}
                onClose={() => setSidePanel(null)}
              />
            )}
            {sidePanel === "authority" && (
              <AuthorityDashboard
                content={currentContent}
                audience={audience}
                angle={angle}
                tone={tone}
                objective={objective}
                onApplyFix={handleApplyImprovement}
                onClose={() => setSidePanel(null)}
              />
            )}
            {sidePanel === "history" && (
              <div className="flex flex-col h-full overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Edit History</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isSaved && editHistory.length > 0 && (
                      <Badge variant="outline" className="text-[9px] border-amber-glow/40 text-amber-glow">
                        Unsaved
                      </Badge>
                    )}
                    {isSaved && (
                      <Badge variant="outline" className="text-[9px] border-success/40 text-success">
                        Saved ✓
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-thin">
                  {editHistory.length === 0 ? (
                    <div className="p-6 text-center">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3 mx-auto">
                        <History className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <p className="text-xs text-muted-foreground max-w-[200px] mx-auto">
                        Your edit history will appear here as you refine your draft. Every change is tracked.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {editHistory.map((entry, i) => (
                        <EditHistoryEntry
                          key={entry.id}
                          entry={entry}
                          isLatest={i === 0}
                          onRevert={() => handleRevert(entry)}
                          formatTimeAgo={formatTimeAgo}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Generated image preview */}
      {generatedImage && !isEmpty && (
        <div className="px-6 py-3 border-t border-border bg-muted/30 flex items-center gap-3">
          <img src={generatedImage} alt="Generated post image" className="w-16 h-16 rounded-md object-cover border border-border" />
          <div className="flex-1">
            <p className="text-xs font-medium text-foreground">Post Image</p>
            <p className="text-xs text-muted-foreground">Click the image icon to regenerate</p>
          </div>
          <button onClick={() => setGeneratedImage(null)} className="text-xs text-muted-foreground hover:text-foreground">Remove</button>
        </div>
      )}

      {/* Image generator modal */}
      {showImageGen && (
        <ImageGeneratorModal
          content={currentContent || ""}
          format={activeTab}
          onClose={() => setShowImageGen(false)}
          onSelect={(url) => {
            setGeneratedImage(url);
            // Advance workflow if on image step
            if (workflowStep === "image") setWorkflowStep("preview");
          }}
        />
      )}
    </div>
  );
}

// Edit history entry component
function EditHistoryEntry({
  entry,
  isLatest,
  onRevert,
  formatTimeAgo,
}: {
  entry: EditEntry;
  isLatest: boolean;
  onRevert: () => void;
  formatTimeAgo: (d: Date) => string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`px-4 py-3 ${isLatest ? "bg-primary/5" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-start gap-2 text-left flex-1 min-w-0"
        >
          <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">{entry.action}</p>
            <p className="text-[10px] text-muted-foreground">{formatTimeAgo(entry.timestamp)}</p>
          </div>
          {expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground shrink-0 mt-1" /> : <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0 mt-1" />}
        </button>
        {!isLatest && (
          <button
            onClick={onRevert}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            title="Revert to this version"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        )}
      </div>
      {expanded && (
        <div className="mt-2 ml-4 space-y-1.5 animate-fade-in">
          {entry.changelog.map((c, j) => (
            <div key={j} className="flex items-start gap-1.5">
              <span className="text-[10px] text-primary mt-0.5">•</span>
              <span className="text-[11px] text-muted-foreground">{c}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
