import base64
from io import BytesIO
from PIL import Image, ImageOps, ImageEnhance
from typing import Dict, Any
import logging
import re
import sympy
from sympy import sympify, solve, Eq

logger = logging.getLogger(__name__)

def normalize_math(equation: str) -> str:
    # Remove harmless LaTeX spacing
    eq = equation.replace(r"\,", "").replace(r"\;", "").replace(r"\:", "").replace(r"\!", "")
    # Remove extra spaces
    eq = eq.replace(" ", "")
    # Replace multiplication symbols
    eq = eq.replace("×", "*").replace("·", "*")
    # Replace superscripts
    eq = eq.replace("²", "**2").replace("³", "**3")
    # Replace √x with sqrt(x)
    eq = re.sub(r'√([a-zA-Z0-9]+)', r'sqrt(\1)', eq)
    # Insert * between digits and letters/parenthesis (e.g. 2x -> 2*x)
    eq = re.sub(r'(\d)([a-zA-Z\(])', r'\1*\2', eq)
    # Insert * between letter and parenthesis (e.g. x( -> x*()
    eq = re.sub(r'([a-zA-Z])(\()', r'\1*\2', eq)
    # Insert * between parenthesis and letter/parenthesis
    eq = re.sub(r'(\))([a-zA-Z\(])', r'\1*\2', eq)
    return eq

def solve_math(eq_norm: str) -> str:
    try:
        if "=" in eq_norm:
            left, right = eq_norm.split("=", 1)
            lhs = sympify(left)
            rhs = sympify(right)
            symbols = list(lhs.free_symbols | rhs.free_symbols)
            if not symbols:
                return str(lhs == rhs)
            
            # Sort symbols alphabetically to get a deterministic target, usually x or y
            symbols.sort(key=lambda s: s.name)
            solution = solve(Eq(lhs, rhs), symbols[0])
            
            if isinstance(solution, list):
                if len(solution) == 0:
                    return "No solution"
                sol_strs = [str(s) for s in solution]
                return f"{symbols[0]} = {', '.join(sol_strs)}"
            elif isinstance(solution, dict):
                return ", ".join([f"{k} = {v}" for k, v in solution.items()])
            else:
                return f"{symbols[0]} = {str(solution)}"
        else:
            expr = sympify(eq_norm)
            res = sympy.simplify(expr)
            return str(res)
    except Exception as e:
        logger.error(f"SymPy solving error: {e}")
        return "Could not solve the recognized expression."

def process_math(image_b64: str) -> Dict[str, Any]:
    print("[AI] Received analysis request")
    print("[AI] Mode: math")
    
    if not image_b64:
        print("[AI] Image received: NO")
        raise ValueError("No image data provided for math recognition.")
        
    print("[AI] Image received: YES")

    try:
        if "," in image_b64:
            image_b64 = image_b64.split(",")[1]
        img_data = base64.b64decode(image_b64)
        img = Image.open(BytesIO(img_data)).convert('RGB')
        
        # Preprocessing Pipeline
        img_gray = ImageOps.grayscale(img)
        
        enhancer = ImageEnhance.Contrast(img_gray)
        img_contrast = enhancer.enhance(2.0)
        
        inverted = ImageOps.invert(img_contrast)
        bbox = inverted.getbbox()
        if bbox:
            img_cropped = img_contrast.crop(bbox)
        else:
            img_cropped = img_contrast
            
        padding = 40
        img_padded = ImageOps.expand(img_cropped, border=padding, fill='white')
        
        w, h = img_padded.size
        scale = 2.0
        if w * scale < 2000 and h * scale < 2000:
            img_final = img_padded.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
        else:
            img_final = img_padded
            
        debug_path = "debug_math_preprocessed.png"
        img_final.save(debug_path)
        print(f"[AI] Preprocessed image saved to {debug_path}")
        
    except Exception as e:
        logger.error(f"Failed to decode or preprocess image: {e}")
        raise ValueError("Invalid image data format.")

    try:
        from pix2text import Pix2Text
    except ImportError:
        logger.error("pix2text is not installed.")
        raise RuntimeError("Pix2Text is unavailable or could not process the selected image.")

    print("[AI] Calling Pix2Text...")
    try:
        # Initialize lazily to avoid heavy startup if not used
        p2t = Pix2Text.from_config()
        res = p2t.recognize_formula(img_final, return_text=False)
        print(f"[AI] Pix2Text structured result: {res}")
        
        if isinstance(res, dict):
            equation = res.get('text', '')
            score = res.get('score', None)
        elif isinstance(res, str):
            equation = res
            score = None
        else:
            equation = str(res)
            score = None
            
        print(f"[AI] Pix2Text raw result: {equation}")
    except Exception as e:
        logger.error(f"Pix2Text processing error: {e}")
        raise RuntimeError(f"Pix2Text processing failed: {str(e)}")

    print("[AI] Solving math with SymPy...")
    eq_norm = normalize_math(equation)
    print(f"[AI] Normalized math: {eq_norm}")
    
    solution_str = solve_math(eq_norm)
    print(f"[AI] SymPy solution: {solution_str}")

    print("[AI] Returning Math Result")
    return {
        "module": "math",
        "result_type": "solution",
        "recognized_content": equation,
        "explanation": "Math recognized using local Pix2Text model.",
        "confidence": score,
        "data": {
            "solution": solution_str
        }
    }

