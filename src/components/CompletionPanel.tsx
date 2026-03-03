import { useState } from "react";
import { Copy, Check, Download, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CompletionPanelProps {
  content: string;
  format: string;
  imageUrl?: string | null;
}

export function CompletionPanel({ content, format, imageUrl }: CompletionPanelProps) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${format}-draft.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    const title = `Draft — ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    const { error } = await supabase.from("saved_drafts").insert({
      title,
      format,
      content,
      image_url: imageUrl || null,
    });
    if (error) {
      toast.error("Failed to save draft");
    } else {
      toast.success("Draft saved!");
      setSaved(true);
    }
  };

  return (
    <div className="space-y-4 p-6 text-center">
      <div className="text-4xl mb-2">🎉</div>
      <h3 className="font-serif text-lg font-semibold text-foreground">Your content is ready!</h3>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto">
        Copy it, download it, or save it to your drafts.
      </p>
      <div className="flex flex-col gap-2 max-w-xs mx-auto pt-2">
        <Button onClick={handleCopy} className="gap-2 w-full">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? "Copied!" : "Copy to Clipboard"}
        </Button>
        <Button onClick={handleDownload} variant="outline" className="gap-2 w-full">
          <Download className="w-4 h-4" /> Export as .txt
        </Button>
        <Button onClick={handleSave} variant="outline" disabled={saved} className="gap-2 w-full">
          <Save className="w-4 h-4" /> {saved ? "Saved ✓" : "Save Draft"}
        </Button>
      </div>
    </div>
  );
}
