from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import fitz  # PyMuPDF
import base64

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/extract-images")
async def extract_images(
    file: UploadFile = File(...),
    mode: str = "pages"  # "embedded", "pages", or "both"
):
    """
    mode="embedded" — extracts only raw embedded images (photos, logos)
    mode="pages"    — renders every page as a high-res PNG (captures charts, tables, vectors)
    mode="both"     — does both (may return duplicates for image-heavy PDFs)
    """
    contents = await file.read()
    doc = fitz.open(stream=contents, filetype="pdf")
    total_pages = len(doc)
    images = []

    # MODE 1: Render every page as a high-res image
    # This captures EVERYTHING: charts, tables, vectors, text, embedded images
    if mode in ("pages", "both"):
        for page_num in range(total_pages):
            page = doc[page_num]
            # 2x zoom = 144 DPI, good balance of quality vs file size
            mat = fitz.Matrix(2, 2)
            pix = page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("png")
            b64 = base64.b64encode(img_bytes).decode("utf-8")
            images.append({
                "index": len(images) + 1,
                "page": page_num + 1,
                "ext": "png",
                "width": pix.width,
                "height": pix.height,
                "type": "page_render",
                "data": f"data:image/png;base64,{b64}"
            })

    # MODE 2: Extract only raw embedded images (photos, logos stored as raster)
    if mode in ("embedded", "both"):
        seen_xrefs = set()
        for page_num in range(total_pages):
            page = doc[page_num]
            for img in page.get_images(full=True):
                xref = img[0]
                if xref in seen_xrefs:
                    continue
                seen_xrefs.add(xref)

                base_image = doc.extract_image(xref)
                img_bytes = base_image["image"]
                ext = base_image["ext"]
                b64 = base64.b64encode(img_bytes).decode("utf-8")
                images.append({
                    "index": len(images) + 1,
                    "page": page_num + 1,
                    "ext": ext,
                    "width": base_image["width"],
                    "height": base_image["height"],
                    "type": "embedded",
                    "data": f"data:image/{ext};base64,{b64}"
                })

    doc.close()
    return JSONResponse({
        "images": images,
        "total": len(images),
        "mode": mode,
        "total_pages": total_pages
    })


@app.get("/health")
def health():
    return {"status": "ok"}
