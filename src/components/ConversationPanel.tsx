import { useRef, useEffect, useState } from "react";
import type { ChatMessage, Phase } from "@/types/content";
import { Send, Upload, FileText, FileImage } from "lucide-react";
import { PhaseIndicator, type UIPhase } from "@/components/PhaseIndicator";

import { DiagnosticScoreCard } from "@/components/DiagnosticScoreCard";
import { CompletionPanel } from "@/components/CompletionPanel";
import type { PDFParseResult } from "@/services/pdfParser";

interface ConversationPanelProps {
  messages: ChatMessage[];
  phase: Phase;
  uiPhase: UIPhase;
  completedPhases: Set<UIPhase>;
  onSendMessage: (message: string) => void;
  onFileUpload: (text: string) => void;
  onPDFUpload?: (result: PDFParseResult) => void;
  onRunDiagnostic?: () => void;
  onRefinementCommand?: (command: string) => void;
  // Polish phase props
  draftContent?: string;
  draftFormat?: string;
  draftImageUrl?: string | null;
  audience?: string;
  angle?: string;
  tone?: string;
  objective?: string;
  showCompletion?: boolean;
  onComplete?: () => void;
}


export function ConversationPanel({
  messages,
  phase,
  uiPhase,
  completedPhases,
  onSendMessage,
  onFileUpload,
  onPDFUpload,
  onRunDiagnostic,
  onRefinementCommand,
  draftContent,
  draftFormat,
  draftImageUrl,
  audience,
  angle,
  tone,
  objective,
  showCompletion,
  onComplete,
}: ConversationPanelProps) {
  const [isParsing, setIsParsing] = useState(false);
  const [input, setInput] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePasteSubmit = () => {
    if (!pasteText.trim()) return;
    onFileUpload(pasteText.trim());
    setPasteText("");
    setShowPaste(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf' && onPDFUpload) {
      setIsParsing(true);
      try {
        const [{ parsePDF }, { extractImagesViaAPI }] = await Promise.all([
          import('@/services/pdfParser'),
          import('@/services/railwayImageExtractor'),
        ]);
        // Run pdf.js (text + page screenshots) and Railway (embedded images) in parallel
        const [result, railwayImages] = await Promise.all([
          parsePDF(file),
          extractImagesViaAPI(file).catch((err) => {
            console.warn('Railway image extraction failed, using client-side fallback:', err);
            return null;
          }),
        ]);
        // If Railway succeeded, use its images; otherwise keep pdf.js client-side ones
        if (railwayImages && railwayImages.length > 0) {
          result.extractedImages = railwayImages;
        }
        onPDFUpload(result);
      } catch (err) {
        console.error('Failed to parse PDF:', err);
        onFileUpload(`[PDF parsing failed for: ${file.name}]`);
      } finally {
        setIsParsing(false);
      }
    } else if (ext === 'docx') {
      try {
        const mammoth = await import('mammoth');
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        if (result.value) onFileUpload(result.value);
      } catch (err) {
        console.error('Failed to parse .docx:', err);
      }
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        if (text) onFileUpload(text);
      };
      reader.readAsText(file);
    }
    e.target.value = "";
  };


  const isIntake = phase === "intake";
  const showPhaseIndicator = uiPhase !== "setup";
  const showDiagnosticButton = uiPhase === "draft" && draftContent && draftContent.length > 20;

  return (
    <div className="flex flex-col h-full">
      {/* Phase indicator */}
      {showPhaseIndicator && (
        <PhaseIndicator currentPhase={uiPhase} completedPhases={completedPhases} />
      )}

      {/* Header */}
      <div className="px-6 py-3 border-b border-border">
        <h2 className="font-serif text-base font-semibold text-foreground">Content Catalyst AI</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 scrollbar-thin">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`animate-fade-in ${msg.role === "assistant" ? "" : "flex justify-end"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                msg.role === "assistant"
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-primary text-primary-foreground"
              }`}
            >
              {msg.content.split("\n").map((line, i) => (
                <p key={i} className={`${line === "" ? "h-2" : ""} ${line.startsWith(">") ? "border-l-2 border-amber-glow pl-3 italic text-muted-foreground" : ""} ${line.startsWith("**") ? "font-semibold" : ""}`}>
                  {line.startsWith("> ") ? line.slice(2) : line.replace(/\*\*/g, "")}
                </p>
              ))}
            </div>

            {msg.options && (
              <div className="flex flex-wrap gap-2 mt-2">
                {msg.options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => onSendMessage(opt)}
                    className="text-xs px-3 py-1.5 rounded-md border border-border bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>


      {/* Diagnostic button (Phase 3 → triggers Phase 4) */}
      {showDiagnosticButton && onRunDiagnostic && (
        <div className="px-6 py-2 border-t border-border/50">
          <button
            onClick={onRunDiagnostic}
            className="w-full py-2.5 rounded-lg border border-primary/30 bg-primary/5 text-primary text-xs font-medium hover:bg-primary/10 transition-colors"
          >
            ✨ Run Full Diagnostic → Enter Polish Mode
          </button>
        </div>
      )}

      {/* Polish phase: Diagnostic Score Card */}
      {uiPhase === "polish" && draftContent && !showCompletion && (
        <div className="border-t border-border overflow-y-auto max-h-[50%] scrollbar-thin">
          <DiagnosticScoreCard
            content={draftContent}
            audience={audience}
            angle={angle}
            tone={tone}
            objective={objective}
            onFixRequest={(cmd) => onRefinementCommand?.(cmd)}
            onComplete={() => onComplete?.()}
          />
        </div>
      )}

      {/* Completion panel */}
      {showCompletion && draftContent && (
        <div className="border-t border-border overflow-y-auto max-h-[50%] scrollbar-thin">
          <CompletionPanel
            content={draftContent}
            format={draftFormat || "linkedinLong"}
            imageUrl={draftImageUrl}
          />
        </div>
      )}

      {/* Input area */}
      <div className="px-6 py-4 border-t border-border">
        {isIntake && !showPaste && (
          <div className="flex flex-col gap-2 mb-3">
            {isParsing && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary/10 text-primary text-sm animate-pulse">
                <FileImage className="w-4 h-4" />
                Parsing PDF — extracting text &amp; visuals...
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowPaste(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-muted transition-colors"
              >
                <FileText className="w-4 h-4" />
                Paste text
              </button>
              <label className="flex items-center gap-2 px-4 py-2 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-muted transition-colors cursor-pointer">
                <Upload className="w-4 h-4" />
                Upload file
                <input type="file" accept=".txt,.md,.pdf,.docx,.doc" className="hidden" onChange={handleFileChange} disabled={isParsing} />
              </label>
            </div>
          </div>
        )}

        {showPaste && isIntake && (
          <div className="mb-3">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste your whitepaper, brief, or key ideas here..."
              className="w-full h-32 rounded-md bg-muted border border-border px-3 py-2 text-sm text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground scrollbar-thin"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handlePasteSubmit}
                disabled={!pasteText.trim()}
                className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                Submit
              </button>
              <button
                onClick={() => { setShowPaste(false); setPasteText(""); }}
                className="px-4 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isIntake ? "Or just type your ideas here..." : "Type your thoughts..."}
            rows={1}
            className="flex-1 rounded-md bg-muted border border-border px-3 py-2.5 text-sm text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-2.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-30 transition-opacity"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
