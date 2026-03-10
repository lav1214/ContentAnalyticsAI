import type { ExtractedImage } from "@/services/pdfParser";

const API_URL = "https://contentanalyticsai-production.up.railway.app";

interface RailwayImage {
  index: number;
  page: number;
  ext: string;
  width: number;
  height: number;
  data: string;
}

/**
 * Extract images from a PDF using the external Railway FastAPI service (PyMuPDF).
 * Returns images in the same ExtractedImage format used by the rest of the app.
 */
export async function extractImagesViaAPI(file: File): Promise<ExtractedImage[]> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_URL}/extract-images`, { method: "POST", body: form });
  if (!res.ok) {
    console.error("Railway image extraction failed:", res.status);
    return [];
  }

  const json = await res.json();
  const images: RailwayImage[] = json.images ?? [];

  return images.map((img) => ({
    pageNumber: img.page,
    imageBase64: img.data,
    width: img.width,
    height: img.height,
    index: img.index,
  }));
}
