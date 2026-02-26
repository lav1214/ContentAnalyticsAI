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
async def extract_images(file: UploadFile = File(...)):
    contents = await file.read()
    doc = fitz.open(stream=contents, filetype="pdf")

    images = []
    for page_num in range(len(doc)):
        page = doc[page_num]
        for img_index, img in enumerate(page.get_images(full=True)):
            xref = img[0]
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
                "data": f"data:image/{ext};base64,{b64}"
            })

    doc.close()
    return JSONResponse({"images": images, "total": len(images)})

@app.get("/health")
def health():
    return {"status": "ok"}
