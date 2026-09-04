import base64
from io import BytesIO
from PIL import Image, ImageOps, ImageEnhance
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)

def process_text(image_b64: str) -> Dict[str, Any]:
    if not image_b64:
        raise ValueError("No image data provided for OCR.")

    try:
        if "," in image_b64:
            image_b64 = image_b64.split(",")[1]
        img_data = base64.b64decode(image_b64)
        img = Image.open(BytesIO(img_data)).convert('RGB')
    except Exception as e:
        logger.error(f"Failed to decode image: {e}")
        raise ValueError("Invalid image data format.")

    # Image Preprocessing for Tesseract OCR Handwriting
    try:
        # Convert to Grayscale
        img_gray = ImageOps.grayscale(img)

        # Crop to content bounding box
        inverted = ImageOps.invert(img_gray)
        bbox = inverted.getbbox()
        if bbox:
            img_cropped = img_gray.crop(bbox)
        else:
            img_cropped = img_gray

        # Expand with white border padding (crucial for Tesseract stroke detection)
        padding = 40
        img_padded = ImageOps.expand(img_cropped, border=padding, fill=255)

        # Contrast enhancement
        enhancer = ImageEnhance.Contrast(img_padded)
        img_enhanced = enhancer.enhance(2.0)

        # Scale up if small
        w, h = img_enhanced.size
        if w < 300 or h < 300:
            scale = max(300 / max(w, 1), 300 / max(h, 1))
            img_enhanced = img_enhanced.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)

    except Exception as preprocess_err:
        logger.warning(f"Preprocessing failed, using raw image: {preprocess_err}")
        img_enhanced = img

    try:
        import pytesseract
    except ImportError:
        logger.error("pytesseract is not installed.")
        raise RuntimeError("PyTesseract is unavailable on the server.")

    try:
        # Try Page Segmentation Mode 6 (single uniform block of text) first
        text = pytesseract.image_to_string(img_enhanced, config='--psm 6')
        if not text.strip():
            # Fallback to default PSM mode
            text = pytesseract.image_to_string(img_enhanced)
    except Exception as e:
        logger.error(f"Pytesseract processing error: {e}")
        raise RuntimeError(f"PyTesseract processing failed: {str(e)}")

    recognized_content = text.strip()
    if not recognized_content:
        recognized_content = "No text could be recognized. Please draw/write more clearly."

    return {
        "module": "text",
        "result_type": "text",
        "recognized_content": recognized_content,
        "explanation": "Text recognized using Tesseract OCR.",
        "data": {}
    }
