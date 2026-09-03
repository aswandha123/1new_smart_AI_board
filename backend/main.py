from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession

from schemas import AIAnalyzeRequest, AIAnalyzeResponse, AIDetection, AIResultData
from database import engine, Base, get_db
from models import AIRequest, AIResult

from services.modules.math import process_math
from services.modules.text import process_text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables verified/created successfully.")
    except Exception as e:
        logger.error(f"Error creating tables: {e}")
    yield

app = FastAPI(title="Smart Board AI Backend MVP", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/v1/health")
def health_check():
    return {"status": "ok"}

@app.post("/api/v1/analyze", response_model=AIAnalyzeResponse)
async def analyze(request: AIAnalyzeRequest, db: AsyncSession = Depends(get_db)):
    
    # Direct routing based on mode instead of Gemini classification
    mode = request.mode
    
    try:
        if mode == "math":
            result_dict = process_math(request.image)
        else:
            result_dict = process_text(request.image)
            
        result_data = AIResultData(
            module=result_dict.get("module", mode),
            result_type=result_dict.get("result_type", "analysis"),
            recognized_content=result_dict.get("recognized_content", ""),
            explanation=result_dict.get("explanation", ""),
            data=result_dict.get("data", {})
        )
        
        # Mock detection object to satisfy old DB schema constraints if needed
        detection = AIDetection(
            recognized_content=result_dict.get("recognized_content", ""),
            subject=mode,
            content_type=mode,
            action="analyze",
            confidence=result_dict.get("confidence", None),
            visual_data=None
        )
    except Exception as e:
        logger.error(f"Module processing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
    # Save to DB
    print("[DB] Saving AI request audit...")
    try:
        db_request = AIRequest(
            user_id=request.user_id,
            board_id=request.board_id,
            selected_content=request.selected_content,
            recognized_content=detection.recognized_content,
            subject=detection.subject,
            content_type=detection.content_type,
            action=detection.action,
            confidence=detection.confidence,
            status="completed"
        )
        db.add(db_request)
        await db.flush() # flush to get the id
        
        db_result = AIResult(
            request_id=db_request.id,
            module=result_data.module,
            result_type=result_data.result_type,
            result_data=result_data.data,
            explanation=result_data.explanation
        )
        db.add(db_result)
        await db.commit()
        print("[DB] AI request audit saved successfully")
    except Exception as e:
        await db.rollback()
        logger.warning(f"[DB] Warning: failed to save AI request audit: {e}")

    return AIAnalyzeResponse(
        success=True,
        detection=detection,
        result=result_data,
        error=None
    )
