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

    try:
        import pytesseract
    except ImportError:
        logger.error("pytesseract is not installed.")
        raise RuntimeError("PyTesseract is unavailable on the server.")

    recognized_content = ""

    # Preprocessing Pipeline 1: Grayscale + Crop + White Padding + Contrast Enhancement
    try:
        img_gray = ImageOps.grayscale(img)
        inverted = ImageOps.invert(img_gray)
        bbox = inverted.getbbox()
        if bbox:
            img_cropped = img_gray.crop(bbox)
        else:
            img_cropped = img_gray

        # Expand with 40px white border padding
        img_padded = ImageOps.expand(img_cropped, border=40, fill=255)

        # Enhance contrast
        enhancer = ImageEnhance.Contrast(img_padded)
        img_enhanced = enhancer.enhance(2.0)

        # Scale up if small
        w, h = img_enhanced.size
        if w < 350 or h < 350:
            scale = max(350 / max(w, 1), 350 / max(h, 1))
            img_enhanced = img_enhanced.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)

        # Try multiple Page Segmentation Modes for handwriting
        psm_configs = ['--psm 6', '--psm 7', '--psm 11', '']
        for config in psm_configs:
            try:
                res = pytesseract.image_to_string(img_enhanced, config=config).strip()
                if res:
                    recognized_content = res
                    logger.info(f"Tesseract recognized text with config '{config}': {recognized_content}")
                    break
            except Exception:
                continue

    except Exception as err1:
        logger.warning(f"Pipeline 1 error: {err1}")

    # Preprocessing Pipeline 2 (Fallback): Pure Black & White Binarization
    if not recognized_content:
        try:
            img_bw = img_gray.point(lambda p: 0 if p < 210 else 255)
            img_bw_cropped = img_bw.crop(bbox) if bbox else img_bw
            img_bw_padded = ImageOps.expand(img_bw_cropped, border=50, fill=255)

            w, h = img_bw_padded.size
            if w < 400 or h < 400:
                scale = max(400 / max(w, 1), 400 / max(h, 1))
                img_bw_padded = img_bw_padded.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)

            for config in ['--psm 6', '--psm 11', '']:
                try:
                    res = pytesseract.image_to_string(img_bw_padded, config=config).strip()
                    if res:
                        recognized_content = res
                        logger.info(f"Tesseract recognized text via binarization: {recognized_content}")
                        break
                except Exception:
                    continue

        except Exception as err2:
            logger.warning(f"Pipeline 2 error: {err2}")

    if not recognized_content:
        recognized_content = "No text could be recognized. Please draw or write more clearly."

    return {
        "module": "text",
        "result_type": "text",
        "recognized_content": recognized_content,
        "explanation": "Text recognized using Tesseract OCR engine.",
        "data": {}
    }
