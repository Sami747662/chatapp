
import React, { useState, useEffect, useRef } from 'react';
import { User, ChatRoom, Message } from '../types';
import { getSmartReply, summarizeConversation } from '../services/gemini';
import { api } from '../services/api';

interface ChatViewProps {
  roomId: number;
  room?: ChatRoom;
  currentUser: User;
  onSendMessage: (content: string) => void;
  lastIncomingMessage: Message | null;
}

const ChatView: React.FC<ChatViewProps> = ({ roomId, room, currentUser, onSendMessage, lastIncomingMessage }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isAILoading, setIsAILoading] = useState(false);
  const [smartReplies, setSmartReplies] = useState<string[]>([]);
  const [showAIBox, setShowAIBox] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMsgRef = useRef<number | null>(null);

  // Initial fetch for history
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const data = await api.get(`/chat/rooms/${roomId}/messages`);
        setMessages(data);
      } catch (err) { 
        console.error("Failed to fetch secure history", err); 
      }
    };
    fetchMessages();
    setSummary(null);
    setSmartReplies([]);
    setShowAIBox(false);
  }, [roomId]);

  // Handle live updates from App.tsx WebSocket
  useEffect(() => {
    if (lastIncomingMessage && lastIncomingMessage.room_id === roomId) {
        // Prevent duplicate processing of the same signal
        if (lastIncomingMessage.id === lastMsgRef.current) return;
        lastMsgRef.current = lastIncomingMessage.id;

        setMessages(prev => {
            // Find if we have an optimistic message with same content from us in the last few seconds
            // This is a simplified deduplication strategy
            const isFromMe = lastIncomingMessage.sender_id === currentUser.id;
            const alreadyExists = prev.some(m => m.id === lastIncomingMessage.id);
            
            if (alreadyExists) return prev;

            // If it's from me, we might already have the optimistic one. 
            // We should replace the optimistic one (which has a temporary large ID from Date.now()) 
            // with the real one from the server.
            if (isFromMe) {
               const optimisticIdx = prev.findIndex(m => m.content === lastIncomingMessage.content && m.id > 1000000000000);
               if (optimisticIdx !== -1) {
                  const newMsgs = [...prev];
                  newMsgs[optimisticIdx] = { ...lastIncomingMessage, is_me: true };
                  return newMsgs;
               }
            }

            return [...prev, { ...lastIncomingMessage, is_me: isFromMe }];
        });
    }
  }, [lastIncomingMessage, roomId, currentUser.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, summary, smartReplies]);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    const content = inputValue.trim();
    onSendMessage(content);
    
    // Optimistic Update
    const newMessage: Message = {
      id: Date.now(), 
      room_id: roomId,
      sender_id: currentUser.id,
      content: content,
      created_at: new Date().toISOString(),
      is_me: true,
      status: 'sent'
    };
    setMessages(prev => [...prev, newMessage]);
    setInputValue('');
  };

  const handleAISuggest = async () => {
    if (messages.length === 0) return;
    const context = messages.slice(-6).map(m => `${m.sender_id === currentUser.id ? 'Me' : 'Partner'}: ${m.content}`).join('\n');
    setShowAIBox(true);
    setIsAILoading(true);
    const replies = await getSmartReply(context);
    setSmartReplies(replies);
    setIsAILoading(false);
  };

  const handleSummarize = async () => {
    if (messages.length === 0) return;
    setIsAILoading(true);
    const context = messages.map(m => m.content);
    const res = await summarizeConversation(context);
    setSummary(res || 'Intelligence summary failed to generate.');
    setIsAILoading(false);
  };

  const roomName = room?.chat_type === 'group' ? room.group_name : room?.other_user.display_name || room?.other_user.username;

  return (
    <div className="flex flex-col h-full relative">
      {/* Chat Header */}
      <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-white/95 backdrop-blur-xl sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-slate-900 flex items-center justify-center font-black text-white text-sm shadow-lg shadow-slate-100">
             {room?.chat_type === 'group' ? 'G' : roomName?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="min-w-0">
            <h3 className="font-black text-slate-900 text-base leading-tight truncate max-w-[180px] md:max-w-none tracking-tight">
              {roomName}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${room?.other_user.is_online ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`}></span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {room?.other_user.is_online ? 'Secure Relay Active' : 'Relay Dormant'}
                </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
            <button 
              onClick={handleSummarize} 
              disabled={isAILoading || messages.length === 0} 
              className="p-3 hover:bg-slate-50 rounded-2xl text-slate-400 hover:text-slate-900 transition-all border border-transparent hover:border-slate-100 disabled:opacity-30"
              title="Generate Conversation Intel"
            >
                {isAILoading ? <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
            </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50 no-scrollbar pb-32">
        {summary && (
            <div className="max-w-lg mx-auto bg-white border border-slate-200 p-6 rounded-[2.5rem] shadow-2xl shadow-slate-200/50 text-xs text-slate-600 animate-fadeIn relative">
                <div className="flex items-center justify-between mb-4">
                    <span className="font-black text-[10px] uppercase tracking-[0.25em] text-slate-900 flex items-center gap-2">
                        <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
                        Intelligence Summary
                    </span>
                    <button onClick={() => setSummary(null)} className="text-slate-300 hover:text-slate-900 text-xl font-light">&times;</button>
                </div>
                <p className="leading-relaxed font-medium">{summary}</p>
            </div>
        )}

        {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full opacity-20 select-none grayscale">
                <div className="w-20 h-20 bg-white rounded-[2rem] mb-6 border-2 border-dashed border-slate-300"></div>
                <p className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-400">Synchronizing secure buffers...</p>
            </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.is_me ? 'justify-end' : 'justify-start'} animate-fadeIn`}>
            <div className={`max-w-[85%] md:max-w-[70%] p-5 rounded-[1.75rem] shadow-sm text-[13px] font-bold leading-relaxed border transition-all ${
              msg.is_me 
                ? 'bg-slate-900 text-white border-slate-900 rounded-tr-none' 
                : 'bg-white text-slate-800 border-slate-100 rounded-tl-none'
            }`}>
              {msg.content}
              <div className={`text-[9px] mt-2.5 font-black uppercase tracking-widest flex items-center justify-end gap-2 opacity-40 ${msg.is_me ? 'text-white' : 'text-slate-400'}`}>
                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {msg.is_me && (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* AI Suggestions Bar */}
      {showAIBox && (
          <div className="absolute bottom-[100px] left-0 right-0 px-6 py-5 flex gap-3 overflow-x-auto bg-white/80 backdrop-blur-lg border-y border-slate-100 no-scrollbar items-center animate-slideUp z-10 shadow-lg">
              {isAILoading ? (
                  <div className="flex items-center gap-4 px-3 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                      <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                      Processing AI Signals
                  </div>
              ) : (
                  <>
                      <div className="shrink-0 text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2">Suggestions</div>
                      {smartReplies.map((reply, i) => (
                          <button 
                            key={i} 
                            onClick={() => { setInputValue(reply); setShowAIBox(false); }} 
                            className="whitespace-nowrap bg-white text-slate-900 text-[11px] font-black px-6 py-3 rounded-2xl border border-slate-200 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all shadow-sm uppercase tracking-tight active:scale-95"
                          >
                            {reply}
                          </button>
                      ))}
                      <button onClick={() => setShowAIBox(false)} className="ml-auto text-slate-300 hover:text-slate-900 p-2 text-xl">&times;</button>
                  </>
              )}
          </div>
      )}

      {/* Input Section */}
      <div className="p-6 border-t border-slate-100 bg-white sticky bottom-0 z-20">
        <div className="flex items-center gap-3 max-w-5xl mx-auto bg-slate-50 p-2.5 rounded-[2rem] border border-slate-100 shadow-inner focus-within:bg-white focus-within:ring-2 focus-within:ring-slate-900/5 transition-all">
          <button 
            onClick={handleAISuggest} 
            disabled={messages.length === 0}
            className="p-3.5 text-slate-400 hover:text-indigo-600 transition-all shrink-0 hover:bg-indigo-50 rounded-2xl disabled:opacity-20" 
            title="AI Smart Reply"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
            </svg>
          </button>
          
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
            placeholder="Transmit secure signal..."
            className="flex-1 bg-transparent border-none py-4 px-2 text-sm focus:ring-0 outline-none font-bold text-slate-800 placeholder:text-slate-300"
          />

          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            className="p-4 rounded-[1.25rem] bg-slate-900 text-white disabled:opacity-10 transition-all shadow-xl shadow-slate-200 active:scale-90 flex items-center justify-center h-14 w-14"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </div>
        <div className="text-center mt-4">
            <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.3em]">End-to-End Encryption Sequence Active</p>
        </div>
      </div>
    </div>
  );
};

export default ChatView;
