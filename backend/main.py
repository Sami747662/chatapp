
from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session, joinedload
from .database import engine, get_db
from .models import Base, User, Message, MessageStatus, ChatRoom, GroupParticipant
from .schemas import (
    UserCreate, UserResponse, Token, 
    ChatRequestCreate, ChatRequestResponse, 
    MessageCreate, MessageResponse, FileUploadResponse,
    GroupCreateRequest
)
from .auth import get_password_hash, verify_password, create_access_token, get_current_user
from .chat_manager import ChatManager
from .websocket_handler import websocket_endpoint
import os
import shutil
from datetime import datetime
from typing import Optional, List

# Initialize database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="FastAPI Chat Pro", version="3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.staticfiles import StaticFiles

UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

# Static files mount
if os.path.exists("static"):
    app.mount("/static", StaticFiles(directory="static"), name="static")

if os.path.exists(UPLOAD_DIR):
    app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# ================= API ENDPOINTS =================

@app.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@app.post("/groups/create")
def create_group(
    data: GroupCreateRequest, 
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    new_room = ChatRoom(
        chat_type="group",
        group_name=data.name,
        created_by=current_user.id
    )
    db.add(new_room)
    db.flush() 
    
    db.add(GroupParticipant(group_id=new_room.id, user_id=current_user.id, role="admin"))
    
    for uid in data.participant_ids:
        if uid != current_user.id:
            if db.query(User).filter_by(id=uid).first():
                db.add(GroupParticipant(group_id=new_room.id, user_id=uid, role="member"))
            
    db.commit()
    return {"message": "Group created", "room_id": new_room.id, "name": data.name}

@app.put("/profile")
def update_profile(display_name: Optional[str] = None, about: Optional[str] = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if display_name: current_user.display_name = display_name
    if about: current_user.about = about
    current_user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(current_user)
    return {"message": "Profile updated"}

@app.post("/register", response_model=UserResponse)
def register(user: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == user.username).first():
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed = get_password_hash(user.password)
    db_user = User(username=user.username, hashed_password=hashed, display_name=user.username)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    access_token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/search")
def search_users(query: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    users = db.query(User).filter(User.username.ilike(f"{query}%"), User.id != current_user.id).limit(20).all()
    return [
        {
            "id": u.id, "username": u.username,
            "display_name": u.display_name if u.display_name else u.username,
            "is_online": u.is_online
        }
        for u in users
    ]

@app.post("/requests/send", response_model=ChatRequestResponse)
def send_request(req: ChatRequestCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ChatManager.send_request(db, current_user.id, req.receiver_username)

@app.get("/requests/pending", response_model=List[ChatRequestResponse])
def get_pending_requests(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ChatManager.get_pending_requests(db, current_user.id)

@app.post("/requests/{request_id}/respond")
def respond_request(request_id: int, accept: bool, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ChatManager.respond_request(db, request_id, current_user.id, accept)

@app.get("/chat/rooms")
def get_rooms(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        direct_rooms = db.query(ChatRoom).filter(
            (ChatRoom.user1_id == current_user.id) | (ChatRoom.user2_id == current_user.id)
        ).all()
        
        group_participations = db.query(GroupParticipant).filter_by(user_id=current_user.id).all()
        group_ids = [gp.group_id for gp in group_participations]
        group_rooms = db.query(ChatRoom).filter(ChatRoom.id.in_(group_ids)).all()
        
        all_rooms = list(set(direct_rooms + group_rooms))
        enhanced_rooms = []
        
        for room in all_rooms:
            is_group = room.chat_type == "group"
            if is_group:
                name = room.group_name or "Group"
                last_msg = db.query(Message).filter_by(room_id=room.id).order_by(Message.created_at.desc()).first()
                room_data = {
                    "id": room.id,
                    "chat_type": "group",
                    "group_name": name,
                    "other_user": {"username": name, "avatar_url": None, "id": 0},
                    "unread_count": 0,
                    "last_message": {
                        "content": last_msg.content[:50] if last_msg else None,
                        "created_at": last_msg.created_at.isoformat() if last_msg else None
                    } if last_msg else None
                }
            else:
                other_id = room.user1_id if room.user2_id == current_user.id else room.user2_id
                other_user = db.query(User).filter_by(id=other_id).first()
                if not other_user: continue
                last_message = db.query(Message).filter_by(room_id=room.id).order_by(Message.created_at.desc()).first()
                unread_count = 0
                if last_message and last_message.sender_id != current_user.id:
                    status = db.query(MessageStatus).filter_by(message_id=last_message.id, user_id=current_user.id).first()
                    if not status or status.status != 'read':
                        unread_count += 1
                room_data = {
                    "id": room.id,
                    "chat_type": "direct",
                    "group_name": None,
                    "other_user": {
                        "id": other_user.id,
                        "username": other_user.username,
                        "display_name": other_user.display_name,
                        "is_online": other_user.is_online
                    },
                    "unread_count": unread_count,
                    "last_message": {
                        "content": last_message.content[:50] + "..." if last_message and len(last_message.content) > 50 else (last_message.content if last_message else ""),
                        "created_at": last_message.created_at.isoformat() if last_message else None
                    } if last_message else None
                }
            enhanced_rooms.append(room_data)
        enhanced_rooms.sort(key=lambda x: x.get('last_message', {}).get('created_at') or "1970-01-01", reverse=True)
        return enhanced_rooms
    except Exception as e:
        return []

@app.get("/chat/rooms/{room_id}/messages")
def get_messages(room_id: int, limit: int = 50, before_id: Optional[int] = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    room = db.query(ChatRoom).filter_by(id=room_id).first()
    if not room: raise HTTPException(404, detail="Room not found")
    if room.chat_type == "direct":
        if room.user1_id != current_user.id and room.user2_id != current_user.id:
            raise HTTPException(403, detail="Not authorized")
    else:
        if not db.query(GroupParticipant).filter_by(group_id=room.id, user_id=current_user.id).first():
            raise HTTPException(403, detail="Not in group")

    query = db.query(Message).options(joinedload(Message.reply_to)).filter_by(room_id=room_id)
    if before_id:
        before_msg = db.query(Message).get(before_id)
        if before_msg:
            query = query.filter(Message.created_at < before_msg.created_at)
    messages = query.order_by(Message.created_at.desc()).limit(limit).all()
    
    for message in messages:
        if message.sender_id != current_user.id:
            status = db.query(MessageStatus).filter_by(message_id=message.id, user_id=current_user.id).first()
            if status and status.status != "read":
                status.status = "read"
                status.timestamp = datetime.utcnow()
    db.commit()
    
    result = []
    for message in reversed(messages):
        reply_data = None
        if message.reply_to:
            reply_data = {"id": message.reply_to.id, "content": message.reply_to.content, "sender_id": message.reply_to.sender_id}
        result.append({
            "id": message.id, "room_id": message.room_id, "sender_id": message.sender_id, "content": message.content,
            "created_at": message.created_at.isoformat(), "file_url": message.file_url, "file_name": message.file_name,
            "file_type": message.file_type, "is_me": message.sender_id == current_user.id, "reply_to": reply_data
        })
    return result

@app.post("/upload")
async def upload_file(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    try:
        contents = await file.read()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_filename = f"{timestamp}_{file.filename}"
        file_path = os.path.join(UPLOAD_DIR, safe_filename)
        with open(file_path, "wb") as f: f.write(contents)
        file_type = "document"
        if file.content_type:
            if "image" in file.content_type: file_type = "image"
            elif "video" in file.content_type: file_type = "video"
            elif "audio" in file.content_type: file_type = "audio"
        return {"file_url": f"/uploads/{safe_filename}", "file_name": file.filename, "file_type": file_type}
    except Exception as e:
        raise HTTPException(500, detail=str(e))

@app.websocket("/ws/{token}")
async def websocket(websocket: WebSocket, token: str):
    await websocket_endpoint(websocket, token)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
