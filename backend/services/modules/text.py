import base64
from io import BytesIO
from PIL import Image
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
        img = Image.open(BytesIO(img_data))
    except Exception as e:
        logger.error(f"Failed to decode image: {e}")
        raise ValueError("Invalid image data format.")

    try:
        import pytesseract
    except ImportError:
        logger.error("pytesseract is not installed.")
        raise RuntimeError("PyTesseract is unavailable or could not process the selected image.")

    try:
        text = pytesseract.image_to_string(img)
    except Exception as e:
        logger.error(f"Pytesseract processing error: {e}")
        raise RuntimeError(f"PyTesseract processing failed: {str(e)}")

    return {
        "module": "text",
        "result_type": "text",
        "recognized_content": text.strip(),
        "explanation": "Text recognized using local Tesseract OCR.",
        "data": {}
    }
