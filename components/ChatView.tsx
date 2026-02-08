
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
  const lastProcessedId = useRef<number | null>(null);

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const data = await api.get(`/chat/rooms/${roomId}/messages`);
        setMessages(data);
      } catch (err) { console.error(err); }
    };
    fetchMessages();
    setSummary(null);
    setSmartReplies([]);
  }, [roomId]);

  useEffect(() => {
    if (lastIncomingMessage && lastIncomingMessage.room_id === roomId) {
        if (lastIncomingMessage.id === lastProcessedId.current) return;
        lastProcessedId.current = lastIncomingMessage.id;

        setMessages(prev => {
            const isFromMe = lastIncomingMessage.sender_id === currentUser.id;
            
            // Deduplicate: If it's from me, we likely have an optimistic message
            if (isFromMe) {
               const optimisticIdx = prev.findIndex(m => m.content === lastIncomingMessage.content && m.id > 2000000000000);
               if (optimisticIdx !== -1) {
                  const newMsgs = [...prev];
                  newMsgs[optimisticIdx] = { ...lastIncomingMessage, is_me: true };
                  return newMsgs;
               }
            }
            
            if (prev.some(m => m.id === lastIncomingMessage.id)) return prev;
            return [...prev, { ...lastIncomingMessage, is_me: isFromMe }];
        });
    }
  }, [lastIncomingMessage, roomId, currentUser.id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, summary]);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    const content = inputValue.trim();
    onSendMessage(content);
    
    // Optimistic ID (High number to distinguish from server IDs)
    const newMessage: Message = {
      id: Date.now() + 2000000000000, 
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
    const context = messages.slice(-5).map(m => `${m.is_me ? 'Me' : 'Them'}: ${m.content}`).join('\n');
    setShowAIBox(true);
    setIsAILoading(true);
    const res = await getSmartReply(context);
    setSmartReplies(res);
    setIsAILoading(false);
  };

  const handleSummarize = async () => {
    if (messages.length === 0) return;
    setIsAILoading(true);
    const res = await summarizeConversation(messages.map(m => m.content));
    setSummary(res);
    setIsAILoading(false);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <header className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black">
            {room?.chat_type === 'group' ? 'G' : (room?.other_user.display_name?.[0] || 'U')}
          </div>
          <div>
            <h3 className="font-black text-slate-900 text-sm">{room?.chat_type === 'group' ? room.group_name : (room?.other_user.display_name || room?.other_user.username)}</h3>
            <p className="text-[10px] text-green-500 font-bold uppercase tracking-widest">{room?.other_user.is_online ? 'Signal Active' : 'Relay Idle'}</p>
          </div>
        </div>
        <button onClick={handleSummarize} disabled={isAILoading} className="p-2.5 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-slate-900 transition-all border border-transparent hover:border-slate-200">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        </button>
      </header>

      <main ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar pb-32">
        {summary && (
          <div className="max-w-md mx-auto bg-white border border-slate-200 p-5 rounded-[2rem] shadow-xl text-xs text-slate-600 animate-fadeIn relative">
            <button onClick={() => setSummary(null)} className="absolute top-4 right-4 text-slate-300 hover:text-slate-900 font-bold">&times;</button>
            <span className="block font-black text-slate-900 uppercase tracking-widest mb-2 text-[10px]">Intel Briefing</span>
            {summary}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.is_me ? 'justify-end' : 'justify-start'} animate-fadeIn`}>
            <div className={`max-w-[80%] p-4 rounded-3xl shadow-sm text-sm font-semibold border ${m.is_me ? 'bg-slate-900 text-white border-slate-900 rounded-tr-none' : 'bg-white text-slate-800 border-slate-200 rounded-tl-none'}`}>
              {m.content}
              <div className={`text-[9px] mt-2 font-black uppercase opacity-40 text-right ${m.is_me ? 'text-white' : 'text-slate-400'}`}>
                {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
      </main>

      {showAIBox && (
        <div className="px-6 py-4 bg-white/80 backdrop-blur-md border-y border-slate-200 flex gap-3 overflow-x-auto no-scrollbar items-center animate-slideUp">
          {isAILoading ? (
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              Synthesizing Smart Signal
            </div>
          ) : (
            <>
              {smartReplies.map((r, i) => (
                <button key={i} onClick={() => { setInputValue(r); setShowAIBox(false); }} className="whitespace-nowrap bg-white border border-slate-200 px-5 py-2.5 rounded-2xl text-[11px] font-black uppercase hover:bg-slate-900 hover:text-white transition-all active:scale-95">{r}</button>
              ))}
              <button onClick={() => setShowAIBox(false)} className="text-slate-300 p-2">&times;</button>
            </>
          )}
        </div>
      )}

      <footer className="p-6 bg-white border-t border-slate-200 sticky bottom-0">
        <div className="flex items-center gap-3 bg-slate-100 p-2 rounded-[2rem] border border-slate-200 focus-within:bg-white focus-within:ring-2 focus-within:ring-slate-900/5 transition-all">
          <button onClick={handleAISuggest} className="p-3 text-slate-400 hover:text-indigo-600"><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" /></svg></button>
          <input value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder="Transmit signal..." className="flex-1 bg-transparent py-3 px-2 outline-none text-sm font-bold text-slate-900" />
          <button onClick={handleSend} disabled={!inputValue.trim()} className="p-4 bg-slate-900 text-white rounded-2xl shadow-lg active:scale-90 disabled:opacity-10 transition-all"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></button>
        </div>
      </header>
    </div>
  );
};

export default ChatView;
