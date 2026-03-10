import { useState, useRef, useEffect } from "react";
import { ArrowUp, Upload } from "lucide-react";
import type { ContentSettings, SeniorityOption, FormatOption } from "@/types/content";

interface WelcomePageProps {
  settings: ContentSettings;
  onUpdateSettings: (settings: Partial<ContentSettings>) => void;
  onStart: (formats: FormatOption[], initialText?: string) => void;
}

const FORMATS: { value: FormatOption; label: string; icon: string; desc: string }[] = [
  { value: "linkedinLong", label: "Long-Form Post", icon: "📝", desc: "In-depth article" },
  { value: "linkedinShort", label: "Short-Form Post", icon: "⚡", desc: "Quick viral hit" },
  { value: "sponsoredAds", label: "Sponsored Ad", icon: "📢", desc: "Paid promotion" },
];

const AUDIENCES: { value: SeniorityOption; label: string; icon: string }[] = [
  { value: "executive", label: "Executive", icon: "👔" },
  { value: "professional", label: "Professional", icon: "💼" },
];

export function WelcomePage({ settings, onUpdateSettings, onStart }: WelcomePageProps) {
  const [selectedFormats, setSelectedFormats] = useState<FormatOption[]>(["linkedinLong"]);
  const [selectedAudience, setSelectedAudience] = useState<SeniorityOption>(settings.seniority);
  const [inputValue, setInputValue] = useState("");
  const [uploadedText, setUploadedText] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleFormat = (fmt: FormatOption) => {
    setSelectedFormats((prev) =>
      prev.includes(fmt) ? (prev.length > 1 ? prev.filter((f) => f !== fmt) : prev) : [...prev, fmt]
    );
  };

  const handleSubmit = () => {
    if (selectedFormats.length > 0) {
      onUpdateSettings({ seniority: selectedAudience });
      const text = uploadedText || inputValue || undefined;
      onStart(selectedFormats, text);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "docx") {
      try {
        const mammoth = await import("mammoth");
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        if (result.value) {
          setUploadedText(result.value);
          setUploadedFileName(file.name);
          setInputValue(result.value.slice(0, 200) + "...");
        }
      } catch (err) {
        console.error("Failed to parse .docx:", err);
      }
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        if (text) {
          setUploadedText(text);
          setUploadedFileName(file.name);
          setInputValue(text.slice(0, 200) + (text.length > 200 ? "..." : ""));
        }
      };
      reader.readAsText(file);
    }
    e.target.value = "";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 160) + "px";
    }
  }, [inputValue]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="fixed top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-primary/4 rounded-full blur-[120px] pointer-events-none" />

      <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-serif font-bold text-foreground mb-3">What are you creating?</h1>
          <p className="text-muted-foreground text-sm max-w-md mx-auto leading-relaxed">
            Choose your format and audience, then share your source material.
          </p>
        </div>

        <div className="w-full max-w-2xl space-y-6">
          {/* Step A — Format selection */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Format</label>
            <div className="grid grid-cols-3 gap-2">
              {FORMATS.map((fmt) => {
                const isSelected = selectedFormats.includes(fmt.value);
                return (
                  <button
                    key={fmt.value}
                    onClick={() => toggleFormat(fmt.value)}
                    className={`flex flex-col items-center gap-1.5 p-4 rounded-xl border transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/30"
                        : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                    }`}
                  >
                    <span className="text-2xl">{fmt.icon}</span>
                    <span className="text-sm font-medium">{fmt.label}</span>
                    <span className="text-[10px] text-muted-foreground">{fmt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step B — Audience */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Audience</label>
            <div className="flex gap-2">
              {AUDIENCES.map((aud) => {
                const isSelected = selectedAudience === aud.value;
                return (
                  <button
                    key={aud.value}
                    onClick={() => setSelectedAudience(aud.value)}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl border transition-all flex-1 ${
                      isSelected
                        ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/30"
                        : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                    }`}
                  >
                    <span className="text-lg">{aud.icon}</span>
                    <span className="text-sm font-medium">{aud.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step C — Source input */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Source Material</label>
            <div className="bg-card border border-border rounded-2xl shadow-lg focus-within:border-primary/30 focus-within:shadow-[0_0_30px_-10px_hsl(var(--primary)/0.15)] transition-all">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Paste your source, article, or idea..."
                rows={4}
                className="w-full bg-transparent text-foreground text-sm placeholder:text-muted-foreground/60 px-5 pt-4 pb-4 resize-none focus:outline-none rounded-t-2xl"
              />
              <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">or</span>
                  <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer border border-border">
                    <Upload className="w-3.5 h-3.5" />
                    Upload PDF / Doc
                    <input ref={fileInputRef} type="file" accept=".txt,.md,.pdf,.docx,.doc" className="hidden" onChange={handleFileUpload} />
                  </label>
                  {uploadedFileName && (
                    <span className="text-[10px] text-primary font-medium">📎 {uploadedFileName}</span>
                  )}
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={selectedFormats.length === 0}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-30 transition-all shadow-[0_0_20px_-5px_hsl(var(--primary)/0.4)]"
                >
                  Get Started <ArrowUp className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <p className="text-center text-muted-foreground/40 text-[11px] mt-1">
              Press Enter to start · Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
