import { useState, useCallback, useEffect, useRef } from "react";
import { useSession } from "@/hooks/useSession";
import { useConversationEngine, generateDrafts } from "@/hooks/useConversationEngine";
import { usePDFPipeline } from "@/hooks/usePDFPipeline";
import { ConversationPanel } from "@/components/ConversationPanel";
import { DraftPanel } from "@/components/DraftPanel";
import { StrategyPanel } from "@/components/StrategyPanel";
import { ContentBriefPanel } from "@/components/ContentBriefPanel";
import { LinkedInPreview } from "@/components/LinkedInPreview";
import { SettingsBar } from "@/components/SettingsBar";
import { WelcomePage } from "@/components/WelcomePage";
import { DocumentVisualsGallery } from "@/components/DocumentVisualsGallery";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { FilePlus, ImageIcon, ClipboardList, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { ContentBriefViewer } from "@/components/ContentBriefPanel";
import type { UIPhase } from "@/components/PhaseIndicator";
import type { ContentSettings, DraftContent, FormatOption, StrategicPosition, ToneOption } from "@/types/content";
import type { PDFParseResult, ExtractedImage } from "@/services/pdfParser";

function getUIPhase(phase: string, hasDrafts: boolean): UIPhase {
  if (phase === "intake" || phase === "analyzing") return "strategy";
  if (phase === "positioning" || phase === "angle" || phase === "format") return "strategy";
  if (phase === "drafting") return "draft";
  if (phase === "refine" && hasDrafts) return "draft";
  return "strategy";
}

function getCompletedPhases(uiPhase: UIPhase, hasAnalysis: boolean): Set<UIPhase> {
  const completed = new Set<UIPhase>();
  completed.add("setup");
  if (hasAnalysis && (uiPhase === "draft" || uiPhase === "polish")) completed.add("strategy");
  if (uiPhase === "polish" || uiPhase === "preview") completed.add("draft");
  if (uiPhase === "preview") completed.add("polish");
  return completed;
}

const Index = () => {
  const sessionHook = useSession();
  const { session, extractedPageImages, setExtractedPageImages, addMessage, updateDrafts, updateSettings, setPhase, setSourceText, setSourceAnalysis, setIntakeRevisionTarget, updateStrategicPosition, setSelectedAngle, setSelectedFormats, setPositioningStep, setClarityScore, updatePerspective, setContentBrief, updateContentBrief, resetSession } = sessionHook;
  const { processUserInput } = useConversationEngine();
  const { processWithChunking } = usePDFPipeline();
  const { theme, setTheme } = useTheme();

  const [showNewPostDialog, setShowNewPostDialog] = useState(false);
  const [showVisualsGallery, setShowVisualsGallery] = useState(false);
  const [selectedVisualImages, setSelectedVisualImages] = useState<string[]>([]);
  const [embeddedImages, setEmbeddedImages] = useState<ExtractedImage[]>([]);
  const [showWelcome, setShowWelcome] = useState(() => localStorage.getItem("ls-onboarded") !== "true");
  const [preSelectedFormats, setPreSelectedFormats] = useState<FormatOption[]>([]);
  const [uiPhaseOverride, setUIPhaseOverride] = useState<UIPhase | null>(null);
  const [showCompletion, setShowCompletion] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const hasDrafts = Object.values(session.drafts).some((d) => d.trim().length > 0);
  const computedUIPhase = uiPhaseOverride || getUIPhase(session.phase, hasDrafts);
  const completedPhases = getCompletedPhases(computedUIPhase, !!session.sourceAnalysis);

  const actions = {
    addMessage, updateDrafts, setPhase, setSourceText, setSourceAnalysis,
    setIntakeRevisionTarget, updateStrategicPosition, setSelectedAngle,
    setSelectedFormats, setPositioningStep, setClarityScore, updatePerspective,
    setContentBrief, updateContentBrief, updateSettings,
  };

  const handleWelcomeStart = useCallback((formats: FormatOption[], initialText?: string) => {
    setPreSelectedFormats(formats);
    setSelectedFormats(formats);
    localStorage.setItem("ls-onboarded", "true");
    setShowWelcome(false);
    setUIPhaseOverride(null);
    if (initialText) {
      setTimeout(() => {
        addMessage({ role: "user", content: initialText });
        processUserInput(initialText, session, actions);
      }, 100);
    }
  }, [setSelectedFormats, addMessage, processUserInput, session, actions]);

  const handleSendMessage = useCallback(async (message: string) => {
    addMessage({ role: "user", content: message });
    await processUserInput(message, session, actions);
  }, [session, actions, addMessage, processUserInput]);

  const handleFileUpload = useCallback(async (text: string) => {
    addMessage({ role: "user", content: `📄 Document uploaded` });
    await processUserInput(text, session, actions);
  }, [session, actions, addMessage, processUserInput]);

  const handlePDFUpload = useCallback(async (pdfResult: PDFParseResult) => {
    const { fullText, pages, extractedImages } = pdfResult;
    const pagesWithImages = pages.filter(p => p.imageBase64);
    setExtractedPageImages(pagesWithImages);
    setEmbeddedImages(extractedImages || []);
    addMessage({ role: "user", content: `📄 PDF uploaded` });
    if (pdfResult.totalPages > 15) {
      addMessage({ role: "assistant", content: `Got it — this is a ${pdfResult.totalPages}-page document. I'll analyze it in sections for full coverage.` });
      await processWithChunking(fullText, pdfResult, session, actions, processUserInput);
    } else {
      await processUserInput(fullText, session, actions, pdfResult);
    }
  }, [session, actions, addMessage, processUserInput, processWithChunking, setExtractedPageImages]);

  const handleToggleVisualImage = useCallback((imageBase64: string) => {
    setSelectedVisualImages((prev) => prev.includes(imageBase64) ? prev.filter((i) => i !== imageBase64) : [...prev, imageBase64]);
  }, []);

  const handleDeleteVisualImage = useCallback((imageBase64: string) => {
    setSelectedVisualImages((prev) => prev.filter((i) => i !== imageBase64));
    setExtractedPageImages((prev: any[]) => prev.filter((p: any) => p.imageBase64 !== imageBase64));
    setEmbeddedImages((prev) => prev.filter((img) => img.imageBase64 !== imageBase64));
  }, [setExtractedPageImages]);

  const handleUpdateDraft = useCallback((key: keyof DraftContent, value: string) => {
    updateDrafts({ [key]: value });
  }, [updateDrafts]);

  const handleRefinementCommand = useCallback((command: string) => {
    handleSendMessage(command);
  }, [handleSendMessage]);

  const handleRunDiagnostic = useCallback(() => {
    setUIPhaseOverride("polish");
  }, []);

  // Draft generation is now fully handled by the conversation engine

  const handleComplete = useCallback(() => {
    setShowCompletion(true);
    setShowPreview(true);
    setUIPhaseOverride("preview");
  }, []);

  // Regenerate drafts when settings change
  const prevSettingsRef = useRef<ContentSettings>(session.settings);
  useEffect(() => {
    const prev = prevSettingsRef.current;
    prevSettingsRef.current = session.settings;
    if (prev === session.settings || (prev.tone === session.settings.tone && prev.seniority === session.settings.seniority && prev.depth === session.settings.depth)) return;
    const { sourceAnalysis, strategicPosition, selectedAngle, selectedFormats, sourceText } = session;
    if (!sourceAnalysis || !selectedAngle || selectedFormats.length === 0) return;
    const newDrafts = generateDrafts(sourceText, sourceAnalysis, strategicPosition as StrategicPosition, selectedAngle, selectedFormats, session.settings);
    updateDrafts(newDrafts);
  }, [session.settings]);

  if (showWelcome) {
    return <WelcomePage settings={session.settings} onUpdateSettings={updateSettings} onStart={handleWelcomeStart} />;
  }

  // Determine right panel content based on phase
  const showBriefPanel = computedUIPhase === "strategy" && session.contentBrief && !session.contentBrief.confirmed && session.sourceAnalysis;
  const showStrategyPanel = computedUIPhase === "strategy" && session.sourceAnalysis && !hasDrafts && !showBriefPanel && (session.contentBrief?.confirmed || !session.contentBrief);
  const showDraftPanel = (hasDrafts || computedUIPhase === "draft" || computedUIPhase === "polish") && !showPreview;
  const showLinkedInPreview = showPreview && computedUIPhase === "preview";

  const activeDraftKey = session.selectedFormats[0] || "linkedinLong";

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* New Post dialog */}
      <Dialog open={showNewPostDialog} onOpenChange={setShowNewPostDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start a new post?</DialogTitle>
            <DialogDescription>Your current drafts and conversation will be cleared.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowNewPostDialog(false)}>Cancel</Button>
            <Button variant="default" onClick={() => {
              resetSession();
              setPreSelectedFormats([]);
              setShowNewPostDialog(false);
              setShowWelcome(true);
              setUIPhaseOverride(null);
              setShowCompletion(false);
              setShowPreview(false);
            }}>
              Start fresh
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-ink-deep">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-serif font-bold text-sm">LS</span>
          </div>
          <h1 className="text-sm font-semibold text-foreground font-sans">Content Catalyst AI</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          {(extractedPageImages.length > 0 || embeddedImages.length > 0) && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setShowVisualsGallery(true)}>
              <ImageIcon className="h-3.5 w-3.5" /> Visuals ({extractedPageImages.length + embeddedImages.length})
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => {
            if (hasDrafts || session.messages.length > 1) {
              setShowNewPostDialog(true);
            } else {
              resetSession();
              setPreSelectedFormats([]);
              setShowWelcome(true);
              setUIPhaseOverride(null);
              setShowCompletion(false);
              setShowPreview(false);
            }
          }}>
            <FilePlus className="h-3.5 w-3.5" /> New Post
          </Button>
        </div>
      </header>

      {/* Settings bar */}
      <SettingsBar settings={session.settings} selectedFormats={session.selectedFormats} onUpdate={updateSettings} onToggleFormat={(fmt) => {
        const current = session.selectedFormats;
        const updated = current.includes(fmt) ? (current.length > 1 ? current.filter(f => f !== fmt) : current) : [...current, fmt];
        setSelectedFormats(updated);
      }} />

      {/* Main panels */}
      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
        <ResizablePanel defaultSize={45} minSize={30} maxSize={60}>
          <div className="flex flex-col h-full min-h-0">
            <ConversationPanel
              messages={session.messages}
              phase={session.phase}
              uiPhase={computedUIPhase}
              completedPhases={completedPhases}
              onSendMessage={handleSendMessage}
              onFileUpload={handleFileUpload}
              onPDFUpload={handlePDFUpload}
              onRunDiagnostic={handleRunDiagnostic}
              onRefinementCommand={handleRefinementCommand}
              draftContent={session.drafts[activeDraftKey]}
              draftFormat={activeDraftKey}
              draftImageUrl={null}
              audience={session.strategicPosition.audience}
              angle={session.selectedAngle || undefined}
              tone={session.settings.tone}
              objective={session.strategicPosition.objective}
              showCompletion={showCompletion}
              onComplete={handleComplete}
            />
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={55} minSize={35} maxSize={70}>
          <div className="flex flex-col h-full min-h-0 bg-card">
            {/* Brief button for later phases */}
            {session.contentBrief?.confirmed && (computedUIPhase === "draft" || computedUIPhase === "polish") && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="sm" className="absolute top-2 right-2 z-10 gap-1 text-xs">
                    <ClipboardList className="h-3.5 w-3.5" /> Brief
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[380px] overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>Content Brief</SheetTitle>
                  </SheetHeader>
                  <ContentBriefViewer brief={session.contentBrief} />
                </SheetContent>
              </Sheet>
            )}
            {showLinkedInPreview ? (
              <LinkedInPreview
                content={session.drafts[activeDraftKey]}
                format={activeDraftKey}
                imageUrl={null}
                onClose={() => {
                  setShowPreview(false);
                  setUIPhaseOverride("polish");
                }}
              />
            ) : showBriefPanel && session.sourceAnalysis && session.contentBrief ? (
              <ContentBriefPanel
                brief={session.contentBrief}
                sourceAnalysis={session.sourceAnalysis}
                onUpdateBrief={(updates) => {
                  updateContentBrief(updates);
                }}
                onUpdateTone={(tone: ToneOption) => {
                  updateSettings({ tone });
                  const toneDescriptions: Record<ToneOption, string> = {
                    authoritative: "Confident, direct, backed by evidence",
                    conversational: "Approachable, relatable, first-person",
                    provocative: "Contrarian, challenge-first, opinionated",
                    visionary: "Forward-looking, big-picture, aspirational",
                  };
                  updateContentBrief({ tone: toneDescriptions[tone] });
                  addMessage({ role: "assistant", content: `Tone updated to **${tone}** — ${toneDescriptions[tone]}. Anything else to adjust?`, options: ["Looks right — confirm ✓"] });
                }}
                onConfirm={() => {
                  updateContentBrief({ confirmed: true });
                  handleSendMessage("Looks right — confirm ✓");
                }}
                onUpdateAnalysis={(updated) => setSourceAnalysis(updated)}
                onInlineEdit={(field, oldValue, newValue) => {
                  const truncOld = oldValue.length > 80 ? oldValue.slice(0, 80) + "…" : oldValue;
                  addMessage({ role: "assistant", content: `Updated **${field}**: ${truncOld} → ${newValue}` });
                }}
              />
            ) : showStrategyPanel && session.sourceAnalysis ? (
              <StrategyPanel
                sourceAnalysis={session.sourceAnalysis}
                onUpdateAnalysis={(updated) => setSourceAnalysis(updated)}
                onInlineEdit={(field, oldValue, newValue) => {
                  const truncOld = oldValue.length > 80 ? oldValue.slice(0, 80) + "…" : oldValue;
                  if (newValue === "(deleted)") {
                    addMessage({ role: "assistant", content: `I see you removed an insight: "${truncOld}". Panel updated! Ready to move on whenever you are.` });
                  } else if (!oldValue) {
                    addMessage({ role: "assistant", content: `New insight added: "${newValue}". Looking sharp! 👍` });
                  } else {
                    addMessage({ role: "assistant", content: `I see you updated **${field}** directly — looks sharp! 👍\n\n**Before:** ${truncOld}\n**After:** ${newValue}\n\nReady to pick your angle whenever you are.` });
                  }
                }}
              />
            ) : (
              <DraftPanel
                drafts={session.drafts}
                selectedFormats={session.selectedFormats}
                onUpdateDraft={handleUpdateDraft}
                onRefinementCommand={handleRefinementCommand}
                audience={session.strategicPosition.audience}
                angle={session.selectedAngle || undefined}
                tone={session.settings.tone}
                objective={session.strategicPosition.objective}
                selectedImages={selectedVisualImages}
                uiPhase={computedUIPhase}
              />
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Document Visuals Gallery */}
      <DocumentVisualsGallery
        open={showVisualsGallery}
        onOpenChange={setShowVisualsGallery}
        pageImages={extractedPageImages.map((p) => ({ pageNumber: p.pageNumber, imageBase64: p.imageBase64, text: p.text }))}
        embeddedImages={embeddedImages}
        visualAnalysis={session.sourceAnalysis?.visualAnalysis}
        selectedImages={selectedVisualImages}
        onToggleImage={handleToggleVisualImage}
        onDeleteImage={handleDeleteVisualImage}
      />
    </div>
  );
};

export default Index;
