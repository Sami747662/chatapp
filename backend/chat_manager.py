
from sqlalchemy.orm import Session
from .models import User, ChatRequest, ChatRoom
from fastapi import HTTPException

class ChatManager:
    @staticmethod
    def send_request(db: Session, sender_id: int, receiver_username: str):
        receiver = db.query(User).filter(User.username == receiver_username).first()
        if not receiver:
            raise HTTPException(404, "User not found")
        if sender_id == receiver.id:
            raise HTTPException(400, "Cannot add yourself")
        
        existing = db.query(ChatRequest).filter_by(sender_id=sender_id, receiver_id=receiver.id).first()
        if existing:
            return existing
            
        new_req = ChatRequest(sender_id=sender_id, receiver_id=receiver.id)
        db.add(new_req)
        db.commit()
        db.refresh(new_req)
        return new_req

    @staticmethod
    def get_pending_requests(db: Session, user_id: int):
        return db.query(ChatRequest).filter_by(receiver_id=user_id, status="pending").all()

    @staticmethod
    def respond_request(db: Session, request_id: int, user_id: int, accept: bool):
        req = db.query(ChatRequest).filter_by(id=request_id, receiver_id=user_id).first()
        if not req:
            raise HTTPException(404, "Request not found")
        
        if accept:
            req.status = "accepted"
            # Create a direct chat room
            new_room = ChatRoom(
                chat_type="direct",
                user1_id=req.sender_id,
                user2_id=req.receiver_id
            )
            db.add(new_room)
        else:
            req.status = "rejected"
        
        db.commit()
        return {"status": "success"}
