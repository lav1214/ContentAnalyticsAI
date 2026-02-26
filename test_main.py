"""
Basic tests for the ContentAnalyticsAI FastAPI application.
Run with: pytest test_main.py -v
"""
import io
import struct
import zlib

import pytest
from fastapi.testclient import TestClient

from main import app, MAX_UPLOAD_BYTES

client = TestClient(app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _minimal_pdf() -> bytes:
    """Return a minimal, valid single-page PDF (no embedded images)."""
    return (
        b"%PDF-1.4\n"
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n"
        b"xref\n0 4\n"
        b"0000000000 65535 f \n"
        b"0000000009 00000 n \n"
        b"0000000058 00000 n \n"
        b"0000000115 00000 n \n"
        b"trailer\n<< /Size 4 /Root 1 0 R >>\n"
        b"startxref\n190\n%%EOF\n"
    )


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# /extract-images — happy path
# ---------------------------------------------------------------------------
def test_extract_images_pages_mode():
    pdf = _minimal_pdf()
    response = client.post(
        "/extract-images?mode=pages",
        files={"file": ("test.pdf", io.BytesIO(pdf), "application/pdf")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "pages"
    assert body["total_pages"] == 1
    assert body["total"] >= 1  # one page rendered
    assert body["images"][0]["type"] == "page_render"
    assert body["images"][0]["ext"] == "png"


def test_extract_images_embedded_mode():
    pdf = _minimal_pdf()
    response = client.post(
        "/extract-images?mode=embedded",
        files={"file": ("test.pdf", io.BytesIO(pdf), "application/pdf")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "embedded"
    assert body["total_pages"] == 1
    # Minimal PDF has no embedded images
    assert body["total"] == 0


def test_extract_images_both_mode():
    pdf = _minimal_pdf()
    response = client.post(
        "/extract-images?mode=both",
        files={"file": ("test.pdf", io.BytesIO(pdf), "application/pdf")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "both"
    assert body["total"] >= 1


# ---------------------------------------------------------------------------
# /extract-images — validation errors
# ---------------------------------------------------------------------------
def test_invalid_mode_rejected():
    pdf = _minimal_pdf()
    response = client.post(
        "/extract-images?mode=invalid_mode",
        files={"file": ("test.pdf", io.BytesIO(pdf), "application/pdf")},
    )
    assert response.status_code == 422  # FastAPI validation error


def test_non_pdf_content_type_rejected():
    response = client.post(
        "/extract-images?mode=pages",
        files={"file": ("test.txt", io.BytesIO(b"not a pdf"), "text/plain")},
    )
    assert response.status_code == 415


def test_invalid_pdf_content_rejected():
    response = client.post(
        "/extract-images?mode=pages",
        files={"file": ("bad.pdf", io.BytesIO(b"this is not a pdf"), "application/pdf")},
    )
    assert response.status_code == 400


def test_oversized_file_rejected():
    # Create a payload just over the limit
    oversized = b"0" * (MAX_UPLOAD_BYTES + 1)
    response = client.post(
        "/extract-images?mode=pages",
        files={"file": ("big.pdf", io.BytesIO(oversized), "application/pdf")},
    )
    assert response.status_code == 413
