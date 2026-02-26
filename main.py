import logging
import os
from enum import Enum

import fitz  # PyMuPDF
import base64
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration (override via env vars)
# ---------------------------------------------------------------------------
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(50 * 1024 * 1024)))  # 50 MB
MAX_PAGES = int(os.getenv("MAX_PAGES", "200"))
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "").split(",") if os.getenv("ALLOWED_ORIGINS") else []

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="ContentAnalyticsAI", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS or ["*"],  # Restrict in production via ALLOWED_ORIGINS env var
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------
class ExtractionMode(str, Enum):
    embedded = "embedded"
    pages = "pages"
    both = "both"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _encode_image(img_bytes: bytes, ext: str, idx: int, page: int, image_type: str,
                  width: int, height: int) -> dict:
    b64 = base64.b64encode(img_bytes).decode("utf-8")
    return {
        "index": idx,
        "page": page,
        "ext": ext,
        "width": width,
        "height": height,
        "type": image_type,
        "data": f"data:image/{ext};base64,{b64}",
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.post("/extract-images")
async def extract_images(
    file: UploadFile = File(...),
    mode: ExtractionMode = Query(ExtractionMode.pages),
):
    """
    Extract images from an uploaded PDF file.

    - **mode=embedded** — extracts only raw embedded images (photos, logos)
    - **mode=pages**    — renders every page as a high-res PNG (captures charts, tables, vectors)
    - **mode=both**     — does both (may return duplicates for image-heavy PDFs)
    """
    # Validate content type
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=415, detail="Only PDF files are accepted.")

    # Read with size limit
    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit.",
        )

    logger.info("Processing PDF '%s' mode=%s size=%d bytes", file.filename, mode, len(contents))

    # Open PDF
    try:
        doc = fitz.open(stream=contents, filetype="pdf")
    except Exception as exc:
        logger.warning("Failed to open PDF '%s': %s", file.filename, exc)
        raise HTTPException(status_code=400, detail="Could not open file as a valid PDF.") from exc

    total_pages = len(doc)

    if total_pages > MAX_PAGES:
        doc.close()
        raise HTTPException(
            status_code=422,
            detail=f"PDF has {total_pages} pages; maximum allowed is {MAX_PAGES}.",
        )

    images: list[dict] = []

    try:
        # MODE: Render every page as a high-res image
        if mode in (ExtractionMode.pages, ExtractionMode.both):
            for page_num in range(total_pages):
                try:
                    page = doc[page_num]
                    mat = fitz.Matrix(2, 2)  # 144 DPI
                    pix = page.get_pixmap(matrix=mat)
                    img_bytes = pix.tobytes("png")
                    images.append(
                        _encode_image(img_bytes, "png", len(images) + 1, page_num + 1,
                                      "page_render", pix.width, pix.height)
                    )
                except Exception as exc:
                    logger.error("Error rendering page %d of '%s': %s", page_num + 1, file.filename, exc)

        # MODE: Extract raw embedded images
        if mode in (ExtractionMode.embedded, ExtractionMode.both):
            seen_xrefs: set[int] = set()
            for page_num in range(total_pages):
                try:
                    page = doc[page_num]
                    for img in page.get_images(full=True):
                        xref = img[0]
                        if xref in seen_xrefs:
                            continue
                        seen_xrefs.add(xref)

                        base_image = doc.extract_image(xref)
                        img_bytes = base_image.get("image")
                        ext = base_image.get("ext", "png")
                        width = base_image.get("width", 0)
                        height = base_image.get("height", 0)

                        if not img_bytes:
                            logger.warning("Empty image data for xref %d on page %d", xref, page_num + 1)
                            continue

                        images.append(
                            _encode_image(img_bytes, ext, len(images) + 1, page_num + 1,
                                          "embedded", width, height)
                        )
                except Exception as exc:
                    logger.error("Error extracting images from page %d of '%s': %s",
                                 page_num + 1, file.filename, exc)

    finally:
        doc.close()

    logger.info("Extracted %d image(s) from '%s'", len(images), file.filename)

    return JSONResponse({
        "images": images,
        "total": len(images),
        "mode": mode,
        "total_pages": total_pages,
    })


@app.get("/health")
def health():
    return {"status": "ok"}
