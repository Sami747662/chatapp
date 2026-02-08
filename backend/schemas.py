
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime

# ================= USER SCHEMAS =================
class UserCreate(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    display_name: Optional[str] = None
    about: Optional[str] = None
    is_online: bool = False
    last_seen: Optional[datetime] = None
    avatar_url: Optional[str] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    about: Optional[str] = None
    avatar_url: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str

# ================= CHAT REQUEST SCHEMAS =================
class ChatRequestCreate(BaseModel):
    receiver_username: str

class ChatRequestResponse(BaseModel):
    id: int
    sender: UserResponse
    receiver_id: int
    status: str
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

# ================= FILE UPLOAD SCHEMA =================
class FileUploadResponse(BaseModel):
    file_url: str
    file_name: str
    file_type: str

# ================= GROUP SCHEMAS =================
class GroupCreateRequest(BaseModel):
    name: str
    participant_ids: List[int]

# ================= MESSAGE SCHEMAS =================
class MessageCreate(BaseModel):
    room_id: int
    content: str
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_type: Optional[str] = None
    reply_to_id: Optional[int] = None

class MessageResponse(BaseModel):
    id: int
    room_id: int
    sender_id: int
    content: str
    created_at: datetime
    status: str = "sent"
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_type: Optional[str] = None
    is_me: Optional[bool] = None
    is_edited: bool = False
    is_deleted: bool = False
    reply_to: Optional['MessageResponse'] = None
    
    model_config = ConfigDict(from_attributes=True)

# Forward declaration for recursive type
MessageResponse.model_rebuild()

# ================= CHAT ROOM SCHEMAS =================
class OtherUserInfo(BaseModel):
    id: int
    username: str
    display_name: Optional[str] = None
    is_online: bool = False
    last_seen: Optional[datetime] = None
    avatar_url: Optional[str] = None

class LastMessagePreview(BaseModel):
    content: Optional[str] = None
    created_at: Optional[datetime] = None
    has_file: bool = False
    file_type: Optional[str] = None

class EnhancedChatRoomResponse(BaseModel):
    id: int
    user1_id: Optional[int] = None
    user2_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    chat_type: str = "direct"
    group_name: Optional[str] = None
    other_user: Optional[OtherUserInfo] = None
    unread_count: int = 0
    last_message: Optional[LastMessagePreview] = None
    participant_count: Optional[int] = None
    
    model_config = ConfigDict(from_attributes=True)
