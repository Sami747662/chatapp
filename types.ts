
export interface User {
  id: number;
  username: string;
  display_name?: string;
  avatar_url?: string;
  is_online: boolean;
  about?: string;
}

export interface Message {
  id: number;
  room_id: number;
  sender_id: number;
  content: string;
  created_at: string;
  file_url?: string;
  file_name?: string;
  file_type?: string;
  is_me: boolean;
  status: 'sent' | 'delivered' | 'read';
  reply_to?: {
    id: number;
    content: string;
    sender_id: number;
  };
}

export interface ChatRoom {
  id: number;
  chat_type: 'direct' | 'group';
  group_name?: string;
  other_user: User;
  unread_count: number;
  last_message?: {
    content: string;
    created_at: string;
  };
}

export interface WebSocketMessage {
  type: 'new_message' | 'typing' | 'presence_update' | 'message_status' | 'system';
  data?: any;
  message?: string;
}
