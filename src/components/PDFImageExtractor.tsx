import React, { useState, useCallback, useRef } from "react";
import { Upload, X, Download, Copy, FileImage, AlertCircle, Loader2, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import JSZip from "jszip";
import { saveAs } from "file-saver";

interface ExtractedImage {
  index: number;
  page: number;
  ext: string;
  width: number;
  height: number;
  data: string;
}

const API_URL = "https://contentanalyticsai-production.up.railway.app";

export default function PDFImageExtractor() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<ExtractedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (f.type !== "application/pdf") {
      toast({ title: "Invalid file", description: "Please upload a PDF file.", variant: "destructive" });
      return;
    }
    setFile(f);
    setError(null);
    setImages([]);
    setExtracted(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const reset = () => {
    setFile(null);
    setImages([]);
    setError(null);
    setExtracted(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const extract = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_URL}/extract-images`, { method: "POST", body: form });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const json = await res.json();
      setImages(json.images ?? []);
      setExtracted(true);
      if (!json.images?.length) setError("No images found in this PDF.");
    } catch (err: any) {
      setError(err.message || "Failed to extract images. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const downloadImage = (img: ExtractedImage) => {
    const a = document.createElement("a");
    a.href = img.data;
    a.download = `page${img.page}_img${img.index}.${img.ext}`;
    a.click();
  };

  const copyImage = async (img: ExtractedImage) => {
    try {
      const res = await fetch(img.data);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      toast({ title: "Copied!", description: "Image copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Could not copy image.", variant: "destructive" });
    }
  };

  const downloadAll = async () => {
    const zip = new JSZip();
    for (const img of images) {
      const res = await fetch(img.data);
      const blob = await res.blob();
      zip.file(`page${img.page}_img${img.index}.${img.ext}`, blob);
    }
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${file?.name.replace(".pdf", "")}_images.zip`);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const uniquePages = new Set(images.map((i) => i.page)).size;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Upload zone */}
      {!loading && !extracted && (
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/60 transition-colors bg-card/50"
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          {file ? (
            <div className="flex items-center justify-center gap-4">
              <FileImage className="h-8 w-8 text-primary" />
              <div className="text-left">
                <p className="font-medium text-foreground">{file.name}</p>
                <p className="text-sm text-muted-foreground">{formatSize(file.size)}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); reset(); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-foreground font-medium">Drop a PDF here or click to browse</p>
              <p className="text-sm text-muted-foreground">PDF files only</p>
            </div>
          )}
        </div>
      )}

      {/* Extract button */}
      {file && !loading && !extracted && (
        <div className="flex justify-center">
          <Button onClick={extract} size="lg" className="gap-2">
            <ImageIcon className="h-4 w-4" /> Extract Images
          </Button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center gap-3 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground font-medium">Extracting images…</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-3 p-6">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="font-medium text-foreground">{error}</p>
              <Button variant="link" className="p-0 h-auto text-sm" onClick={reset}>Try another file</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk actions */}
      {images.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border rounded-lg px-5 py-3">
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground font-semibold">{images.length}</span> image{images.length !== 1 ? "s" : ""} extracted from{" "}
              <span className="text-foreground font-semibold">{uniquePages}</span> page{uniquePages !== 1 ? "s" : ""}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={downloadAll} className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> Download All as ZIP
              </Button>
              <Button variant="ghost" size="sm" onClick={reset}>New File</Button>
            </div>
          </div>

          {/* Gallery */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {images.map((img) => (
              <Card key={`${img.page}-${img.index}`} className="overflow-hidden group">
                <div className="relative bg-muted/30 flex items-center justify-center p-3 min-h-[180px]">
                  <img
                    src={img.data}
                    alt={`Page ${img.page} image ${img.index}`}
                    className="max-h-52 w-auto object-contain rounded"
                    loading="lazy"
                  />
                  <div className="absolute top-2 right-2 flex gap-1.5">
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      {img.ext}
                    </Badge>
                  </div>
                </div>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{img.width}×{img.height}</span>
                    <span>Page {img.page}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 gap-1 text-xs" onClick={() => downloadImage(img)}>
                      <Download className="h-3 w-3" /> Download
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 gap-1 text-xs" onClick={() => copyImage(img)}>
                      <Copy className="h-3 w-3" /> Copy
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
