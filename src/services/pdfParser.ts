import * as pdfjsLib from "pdfjs-dist";

// Use CDN worker for pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

export interface ParsedPDFPage {
  pageNumber: number;
  text: string;
  imageBase64: string; // data:image/jpeg;base64,... (page screenshot)
}

export interface ExtractedImage {
  pageNumber: number;
  imageBase64: string;
  width: number;
  height: number;
  index: number; // image index within the page
}

export interface PDFParseResult {
  totalPages: number;
  pages: ParsedPDFPage[];
  fullText: string;
  extractedImages: ExtractedImage[];
  detectedVisuals: {
    diagrams: number;
    charts: number;
    tables: number;
    images: number;
  };
}

/**
 * Extract actual embedded images from a single PDF page using the operator list.
 * PDF.js exposes image paint operators (OPS.paintImageXObject / paintJpegXObject).
 */
async function extractPageImages(
  page: any,
  pageNumber: number
): Promise<ExtractedImage[]> {
  const images: ExtractedImage[] = [];

  try {
    const operatorList = await page.getOperatorList();
    const { OPS } = pdfjsLib;
    const seenObjIds = new Set<string>();
    let imgIndex = 0;

    for (let i = 0; i < operatorList.fnArray.length; i++) {
      const fn = operatorList.fnArray[i];

      if (
        fn === OPS.paintImageXObject ||
        fn === OPS.paintXObject ||
        fn === OPS.paintImageXObjectRepeat
      ) {
        const objId = operatorList.argsArray[i]?.[0];
        if (!objId || seenObjIds.has(objId)) continue;
        seenObjIds.add(objId);

        try {
          const imgData = await new Promise<any>((resolve, reject) => {
            page.objs.get(objId, (data: any) => {
              if (data) resolve(data);
              else reject(new Error("No image data"));
            });
          });

          // Skip tiny images (icons, bullets, decorations)
          const w = imgData.width;
          const h = imgData.height;
          if (w < 50 || h < 50) continue;

          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d")!;

          // Handle different image data formats from PDF.js
          if (imgData instanceof ImageBitmap) {
            ctx.drawImage(imgData, 0, 0);
          } else if (imgData.data && imgData.width && imgData.height) {
            // Raw pixel data (Uint8ClampedArray)
            let pixelData: Uint8ClampedArray;
            if (imgData.data instanceof Uint8ClampedArray) {
              pixelData = imgData.data;
            } else {
              pixelData = new Uint8ClampedArray(imgData.data);
            }

            // PDF.js may return RGB (3 channels) or RGBA (4 channels)
            if (pixelData.length === w * h * 3) {
              // Convert RGB → RGBA
              const rgba = new Uint8ClampedArray(w * h * 4);
              for (let p = 0; p < w * h; p++) {
                rgba[p * 4] = pixelData[p * 3];
                rgba[p * 4 + 1] = pixelData[p * 3 + 1];
                rgba[p * 4 + 2] = pixelData[p * 3 + 2];
                rgba[p * 4 + 3] = 255;
              }
              pixelData = rgba;
            }

            const imageData = new ImageData(new Uint8ClampedArray(pixelData.buffer as ArrayBuffer), w, h);
            ctx.putImageData(imageData, 0, 0);
          } else {
            continue; // Unknown format, skip
          }

          // Use JPEG for photos, reasonable quality
          const quality = w * h > 500000 ? 0.6 : 0.8;
          const base64 = canvas.toDataURL("image/jpeg", quality);

          images.push({
            pageNumber,
            imageBase64: base64,
            width: w,
            height: h,
            index: imgIndex++,
          });
        } catch {
          // Individual image extraction failed, continue
        }
      }
    }
  } catch {
    // Operator list extraction failed for this page
  }

  return images;
}

/**
 * Parse a PDF file client-side using pdf.js.
 * Extracts text, renders page screenshots, and extracts embedded images.
 * Limits to first 20 pages for performance.
 */
export async function parsePDF(file: File): Promise<PDFParseResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const maxPages = Math.min(pdf.numPages, 20);
  const pages: ParsedPDFPage[] = [];
  const allText: string[] = [];
  const allExtractedImages: ExtractedImage[] = [];

  // For large PDFs, render fewer pages as screenshots
  const maxImagePages = Math.min(maxPages, 8);

  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);

    // Extract text from ALL pages
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    allText.push(pageText);

    // Render page screenshot for first N pages
    let imageBase64 = "";
    if (i <= maxImagePages) {
      const viewport = page.getViewport({ scale: 1.0 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport }).promise;
      imageBase64 = canvas.toDataURL("image/jpeg", 0.5);
    }

    // Extract embedded images from all pages (up to maxPages)
    const pageImages = await extractPageImages(page, i);
    allExtractedImages.push(...pageImages);

    pages.push({
      pageNumber: i,
      text: pageText,
      imageBase64,
    });
  }

  const fullText = allText.join("\n\n");
  const detectedVisuals = detectVisualTypes(pages, allExtractedImages);

  return {
    totalPages: pdf.numPages,
    pages,
    fullText,
    extractedImages: allExtractedImages,
    detectedVisuals,
  };
}

/**
 * Heuristic detection of visual content by analyzing text-to-image ratio per page
 * and counting actual extracted images.
 */
function detectVisualTypes(pages: ParsedPDFPage[], extractedImages: ExtractedImage[]) {
  let diagrams = 0;
  let charts = 0;
  let tables = 0;
  let images = extractedImages.length;

  for (const page of pages) {
    const wordCount = page.text.split(/\s+/).length;
    const textLower = page.text.toLowerCase();

    if (wordCount < 30) {
      if (textLower.includes("figure") || textLower.includes("diagram") || textLower.includes("architecture")) {
        diagrams++;
      } else if (textLower.includes("chart") || textLower.includes("graph") || textLower.includes("%")) {
        charts++;
      }
    }

    if (textLower.includes("table") || (page.text.match(/\|/g)?.length || 0) > 5) {
      tables++;
    }

    if (textLower.match(/\b(growth|decline|increase|decrease|trend|yoy|qoq|cagr)\b/)) {
      charts = Math.max(charts, 1);
    }
  }

  return { diagrams, charts, tables, images };
}
