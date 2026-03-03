import PDFImageExtractor from "@/components/PDFImageExtractor";

export default function PDFExtractorPage() {
  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-2 mb-8">
        <h1 className="text-2xl font-bold tracking-tight">PDF Image Extractor</h1>
        <p className="text-muted-foreground text-sm">Upload a PDF to extract all embedded images with full fidelity.</p>
      </div>
      <PDFImageExtractor />
    </div>
  );
}
