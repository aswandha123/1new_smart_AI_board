from sqlalchemy import Column, Integer, String, JSON, Float, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    password = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Board(Base):
    __tablename__ = "boards"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String, index=True)
    board_data = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class AIRequest(Base):
    __tablename__ = "ai_requests"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, nullable=True)
    board_id = Column(String, nullable=True)
    selected_content = Column(JSON)
    recognized_content = Column(String)
    subject = Column(String)
    content_type = Column(String)
    action = Column(String)
    confidence = Column(Float)
    status = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    result = relationship("AIResult", back_populates="request", uselist=False)

class AIResult(Base):
    __tablename__ = "ai_results"
    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(Integer, ForeignKey("ai_requests.id"))
    module = Column(String)
    result_type = Column(String)
    result_data = Column(JSON)
    explanation = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    request = relationship("AIRequest", back_populates="result")
