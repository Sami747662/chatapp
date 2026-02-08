
from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, Optional, List
from jose import jwt, JWTError
from .auth import SECRET_KEY, ALGORITHM
from .database import SessionLocal
from .models import User, Message, ChatRoom, GroupParticipant
from datetime import datetime
import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        await self._update_status(user_id, True)

    async def disconnect(self, user_id: int):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
            await self._update_status(user_id, False)

    async def _update_status(self, user_id: int, online: bool):
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if user:
                user.is_online = online
                user.last_seen = datetime.utcnow()
                db.commit()
        except Exception as e:
            logger.error(f"Presence update failed: {e}")
        finally:
            db.close()

    async def send_to_user(self, user_id: int, data: dict):
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_json(data)
            except Exception as e:
                logger.error(f"Failed to send message to user {user_id}: {e}")

manager = ConnectionManager()

async def websocket_endpoint(websocket: WebSocket, token: str):
    user_id: Optional[int] = None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
    except (JWTError, ValueError, TypeError):
        await websocket.close(code=4001)
        return

    await manager.connect(websocket, user_id)
    
    try:
        while True:
            data_raw = await websocket.receive_text()
            data = json.loads(data_raw)
            
            if data['type'] == 'new_message':
                room_id = data['data']['room_id']
                content = data['data']['content']
                
                db = SessionLocal()
                try:
                    msg = Message(room_id=room_id, sender_id=user_id, content=content)
                    db.add(msg)
                    db.commit()
                    db.refresh(msg)
                    
                    room = db.query(ChatRoom).filter_by(id=room_id).first()
                    recipient_ids = []
                    
                    if room:
                        if room.chat_type == 'direct':
                            recipient_ids = [room.user1_id, room.user2_id]
                        else:
                            participants = db.query(GroupParticipant).filter_by(group_id=room_id).all()
                            recipient_ids = [p.user_id for p in participants]
                    
                    payload = {
                        "type": "new_message",
                        "data": {
                            "id": msg.id,
                            "room_id": room_id,
                            "sender_id": user_id,
                            "content": content,
                            "created_at": msg.created_at.isoformat()
                        }
                    }
                    
                    for rid in recipient_ids:
                        if rid:
                            await manager.send_to_user(rid, payload)
                            
                finally:
                    db.close()
    except WebSocketDisconnect:
        await manager.disconnect(user_id)
    except Exception as e:
        logger.error(f"WS Exception: {e}")
        await manager.disconnect(user_id)
