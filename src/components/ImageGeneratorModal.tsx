import { useState } from "react";
import { X, Download, Check, Loader2, ImageIcon, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ImageGeneratorModalProps {
  content: string;
  format: string;
  onClose: () => void;
  onSelect: (imageUrl: string) => void;
}

export function ImageGeneratorModal({ content, format, onClose, onSelect }: ImageGeneratorModalProps) {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [generated, setGenerated] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");

  const generateImages = async () => {
    setLoading(true);
    setImages([]);
    setSelected(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-image", {
        body: { content, format, customPrompt: customPrompt.trim() || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.images?.length) {
        setImages(data.images);
        setGenerated(true);
      } else {
        toast.error("No images were generated. Try again.");
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to generate images");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (selected !== null && images[selected]) {
      onSelect(images[selected]);
      toast.success("Image selected!");
      onClose();
    }
  };

  const handleDownload = (url: string, index: number) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${format}-image-variant-${index + 1}.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Generate Post Image</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {!generated && !loading && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <ImageIcon className="w-8 h-8 text-muted-foreground" />
              </div>

              {/* Custom prompt input */}
              <div className="w-full max-w-md space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Describe the image you want
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="e.g. A futuristic cityscape with glowing data streams, dark blue tones, professional and clean..."
                  className="w-full bg-muted border border-border rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  rows={3}
                />
                <p className="text-[11px] text-muted-foreground">
                  Leave blank to auto-generate from your draft content
                </p>
              </div>

              <button
                onClick={generateImages}
                className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Generate Images
              </button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center gap-4 py-12">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Generating 2 image variants…</p>
            </div>
          )}

          {generated && images.length > 0 && (
            <div className="space-y-4">
              {/* Show current prompt */}
              {customPrompt && (
                <div className="bg-muted/50 rounded-lg px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Prompt:</span> {customPrompt}
                </div>
              )}

              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                Select a variant
              </p>
              <div className="grid grid-cols-2 gap-4">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setSelected(i)}
                    className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                      selected === i
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-border hover:border-muted-foreground/50"
                    }`}
                  >
                    <img src={img} alt={`Variant ${i + 1}`} className="w-full aspect-square object-cover" />
                    {selected === i && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-4 h-4 text-primary-foreground" />
                      </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-background/80 to-transparent p-3 flex items-end justify-between">
                      <span className="text-xs font-medium text-foreground">Variant {i + 1}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDownload(img, i); }}
                        className="p-1 rounded bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                        title="Download"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => { setGenerated(false); setImages([]); setSelected(null); }}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  New Prompt
                </button>
                <button
                  onClick={generateImages}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  Regenerate
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={selected === null}
                  className="ml-auto px-5 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Use Selected Image
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
