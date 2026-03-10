import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, ImageIcon, Sparkles, FileImage, Trash2 } from "lucide-react";
import type { VisualAnalysisItem } from "@/types/content";
import type { ExtractedImage } from "@/services/pdfParser";

export interface ExtractedPageImage {
  pageNumber: number;
  imageBase64: string;
  text?: string;
}

interface DocumentVisualsGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageImages: ExtractedPageImage[];
  embeddedImages?: ExtractedImage[];
  visualAnalysis?: VisualAnalysisItem[];
  selectedImages: string[];
  onToggleImage: (imageBase64: string) => void;
  onDeleteImage?: (imageBase64: string) => void;
}

type ViewTab = "embedded" | "recommended";

function DeleteButton({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <div
      className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center bg-destructive/80 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-all hover:bg-destructive cursor-pointer z-10"
      onClick={onClick}
    >
      <Trash2 className="w-3 h-3" />
    </div>
  );
}

export function DocumentVisualsGallery({
  open,
  onOpenChange,
  pageImages,
  embeddedImages = [],
  visualAnalysis,
  selectedImages,
  onToggleImage,
  onDeleteImage,
}: DocumentVisualsGalleryProps) {
  const [tab, setTab] = useState<ViewTab>("embedded");

  const getVisualForPage = (pageNumber: number) =>
    visualAnalysis?.find((v) => v.pageNumber === pageNumber);

  const recommendedPageNumbers = new Set(
    visualAnalysis?.filter((v) => v.selectedForPost).map((v) => v.pageNumber) ?? []
  );

  const recommendedItems = embeddedImages.length > 0
    ? (recommendedPageNumbers.size > 0
        ? embeddedImages.filter((img) => recommendedPageNumbers.has(img.pageNumber))
        : embeddedImages
      ).map((img) => ({
        key: `emb-${img.pageNumber}-${img.index}`,
        imageBase64: img.imageBase64,
        pageNumber: img.pageNumber,
        isEmbedded: true,
        width: img.width,
        height: img.height,
      }))
    : [];

  const handleDelete = (e: React.MouseEvent, imageBase64: string) => {
    e.stopPropagation();
    onDeleteImage?.(imageBase64);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-primary" />
            Extracted Document Visuals
          </DialogTitle>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <Button variant={tab === "embedded" ? "default" : "outline"} size="sm" onClick={() => setTab("embedded")} className="text-xs gap-1">
            <FileImage className="w-3 h-3" />
            Images ({embeddedImages.length})
          </Button>
          <Button variant={tab === "recommended" ? "default" : "outline"} size="sm" onClick={() => setTab("recommended")} className="text-xs gap-1">
            <Sparkles className="w-3 h-3" />
            AI Recommended ({recommendedItems.length})
          </Button>
          <div className="ml-auto text-xs text-muted-foreground">
            {selectedImages.length} selected
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto pr-1">
          {tab === "embedded" ? (
            embeddedImages.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                No embedded images found in this PDF.
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 py-2">
                {embeddedImages.map((img, idx) => {
                  const isSelected = selectedImages.includes(img.imageBase64);
                  return (
                    <button
                      key={`emb-${img.pageNumber}-${img.index}`}
                      onClick={() => onToggleImage(img.imageBase64)}
                      className={`relative group rounded-xl overflow-hidden border-2 transition-all hover:shadow-lg ${
                        isSelected
                          ? "border-primary shadow-[0_0_12px_-4px_hsl(var(--primary)/0.4)]"
                          : "border-border hover:border-muted-foreground/40"
                      }`}
                    >
                      <div className="aspect-[4/3] bg-muted">
                        <img src={img.imageBase64} alt={`Embedded image ${idx + 1} from page ${img.pageNumber}`} className="w-full h-full object-contain bg-white" loading="lazy" />
                      </div>
                      <div className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                        isSelected ? "bg-primary text-primary-foreground" : "bg-background/80 border border-border text-muted-foreground opacity-0 group-hover:opacity-100"
                      }`}>
                        {isSelected ? <Check className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5" />}
                      </div>
                      {onDeleteImage && <DeleteButton onClick={(e) => handleDelete(e, img.imageBase64)} />}
                      <div className="px-2.5 py-2 bg-card border-t border-border">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-muted-foreground">Page {img.pageNumber} · {img.width}×{img.height}</span>
                          <Badge variant="outline" className="text-[9px] text-primary border-primary/30">Embedded</Badge>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          ) : tab === "recommended" ? (
            recommendedItems.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                No AI-recommended visuals found. Try 'Embedded Images'.
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 py-2">
                {recommendedItems.map((item) => {
                  const va = getVisualForPage(item.pageNumber);
                  const isSelected = selectedImages.includes(item.imageBase64);
                  return (
                    <button
                      key={item.key}
                      onClick={() => onToggleImage(item.imageBase64)}
                      className={`relative group rounded-xl overflow-hidden border-2 transition-all hover:shadow-lg ${
                        isSelected
                          ? "border-primary shadow-[0_0_12px_-4px_hsl(var(--primary)/0.4)]"
                          : "border-border hover:border-muted-foreground/40"
                      }`}
                    >
                      <div className="aspect-[4/3] bg-muted">
                        <img src={item.imageBase64} alt={`Recommended from page ${item.pageNumber}`} className="w-full h-full object-contain bg-white" loading="lazy" />
                      </div>
                      <div className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                        isSelected ? "bg-primary text-primary-foreground" : "bg-background/80 border border-border text-muted-foreground opacity-0 group-hover:opacity-100"
                      }`}>
                        {isSelected ? <Check className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5" />}
                      </div>
                      {onDeleteImage && <DeleteButton onClick={(e) => handleDelete(e, item.imageBase64)} />}
                      <div className="absolute top-2 left-8">
                        <Badge variant="secondary" className="text-[10px] gap-0.5 bg-primary/90 text-primary-foreground border-0">
                          <Sparkles className="w-2.5 h-2.5" /> AI Pick
                        </Badge>
                      </div>
                      <div className="px-2.5 py-2 bg-card border-t border-border">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-muted-foreground">
                            Page {item.pageNumber}{item.isEmbedded ? ` · ${item.width}×${item.height}` : ""}
                          </span>
                          {va && (
                            <Badge variant="outline" className={`text-[9px] ${
                              va.feedReadiness === "ready" ? "text-green-600 border-green-300"
                                : va.feedReadiness === "needs_simplification" ? "text-amber-600 border-amber-300"
                                : "text-red-500 border-red-300"
                            }`}>
                              {va.feedReadiness === "ready" ? "✅ Ready" : va.feedReadiness === "needs_simplification" ? "🔄 Simplify" : "🔁 Replace"}
                            </Badge>
                          )}
                        </div>
                        {va?.strategicInsight && (
                          <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2 leading-tight">{va.strategicInsight}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
