from pydantic import BaseModel
from typing import Optional, Dict, Any, List

class AIAnalyzeRequest(BaseModel):
    user_id: Optional[str] = None
    board_id: Optional[str] = None
    mode: str = "text"
    selected_content: List[Dict[str, Any]]
    image: Optional[str] = None
    user_request: Optional[str] = None

class AIDetection(BaseModel):
    recognized_content: str
    subject: str
    content_type: str
    action: str
    confidence: Optional[float] = None
    visual_data: Optional[Dict[str, Any]] = None

class AIResultData(BaseModel):
    module: str
    result_type: str
    recognized_content: str
    explanation: str
    data: Dict[str, Any]

class AIAnalyzeResponse(BaseModel):
    success: bool
    detection: Optional[AIDetection] = None
    result: Optional[AIResultData] = None
    error: Optional[str] = None
