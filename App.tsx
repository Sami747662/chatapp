
import React, { useState, useEffect, useCallback } from 'react';
import { User, ChatRoom, WebSocketMessage, Message } from './types';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import { api } from './services/api';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [lastIncomingMessage, setLastIncomingMessage] = useState<Message | null>(null);
  
  // Auth Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRooms = useCallback(async () => {
    try {
      const data = await api.get('/chat/rooms');
      setRooms(data);
    } catch (err) { 
      console.error("Relay fetch failure", err); 
    }
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setCurrentUser(null);
    if (ws) {
        ws.close();
        setWs(null);
    }
  }, [ws]);

  const connectWebSocket = useCallback((authToken: string) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Use window.location.hostname for robustness, defaulting to localhost:8000 for standard FastAPI dev
    const wsUrl = `${protocol}//${window.location.hostname}:8000/ws/${authToken}`;
    const socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
        console.log("Echo Protocol: Secure link established.");
        setWs(socket);
    };
    
    socket.onmessage = (event) => {
      try {
        const msg: WebSocketMessage = JSON.parse(event.data);
        if (msg.type === 'new_message') {
          setLastIncomingMessage(msg.data);
          fetchRooms();
        }
      } catch (e) { 
        console.error("Signal parsing error", e); 
      }
    };
    
    socket.onclose = () => {
        console.log("Echo Protocol: Link severed.");
        setWs(null);
    };
    
    return socket;
  }, [fetchRooms]);

  useEffect(() => {
    if (token && !ws) {
      const socket = connectWebSocket(token);
      return () => {
          if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
      };
    }
  }, [token, ws, connectWebSocket]);

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    
    const bootstrap = async () => {
      try {
        const user = await api.get('/me');
        setCurrentUser(user);
        await fetchRooms();
      } catch (err) {
        console.error("Bootstrap failure", err);
        handleLogout();
      } finally {
        setIsLoading(false);
      }
    };
    bootstrap();
  }, [token, fetchRooms, handleLogout]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsAuthLoading(true);
    try {
      if (isRegistering) {
        await api.post('/register', { username, password });
        setIsRegistering(false);
        setUsername('');
        setPassword('');
        setError("Identity created. Please establish link.");
      } else {
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);
        
        const data = await api.login(formData);
        localStorage.setItem('token', data.access_token);
        setToken(data.access_token);
      }
    } catch (err: any) {
      setError(err.message || "Authorization failed");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSendMessage = (content: string) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'new_message',
        data: { room_id: activeRoomId, content: content }
      }));
    } else {
        console.error("System Error: Terminal is offline.");
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-white">
        <div className="w-12 h-12 border-4 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-6 text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Synchronizing Echo Core...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white rounded-[3rem] shadow-2xl p-12 border border-slate-100 animate-fadeIn">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-slate-900 rounded-[2rem] mx-auto flex items-center justify-center mb-8 shadow-2xl shadow-slate-200">
              <span className="text-white text-4xl font-black italic">E</span>
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter">Echo Protocol</h1>
            <p className="text-slate-500 mt-2 text-sm font-medium">Privacy-first secure communication.</p>
          </div>
          
          <form onSubmit={handleAuth} className="space-y-5">
            <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">Public Identity</label>
                <input 
                  type="text" 
                  placeholder="Username" 
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none transition-all text-sm font-bold text-slate-900 placeholder:text-slate-300"
                  required
                />
            </div>
            <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">Access Key</label>
                <input 
                  type="password" 
                  placeholder="Password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none transition-all text-sm font-bold text-slate-900 placeholder:text-slate-300"
                  required
                />
            </div>
            
            {error && (
                <div className={`p-4 rounded-xl text-xs font-bold text-center animate-pulse ${error.includes('successfully') || error.includes('created') ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                    {error}
                </div>
            )}
            
            <button 
              type="submit"
              disabled={isAuthLoading}
              className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-black hover:bg-slate-800 transition-all active:scale-[0.96] shadow-2xl shadow-slate-200 disabled:opacity-50 mt-6 h-16 flex items-center justify-center uppercase tracking-[0.2em]"
            >
              {isAuthLoading ? (
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                  isRegistering ? "Register Identity" : "Establish Link"
              )}
            </button>
          </form>

          <button 
            onClick={() => {
                setIsRegistering(!isRegistering);
                setError(null);
            }}
            className="w-full mt-10 text-[10px] text-slate-400 font-black hover:text-slate-900 transition-colors uppercase tracking-[0.2em]"
          >
            {isRegistering ? "Return to Login Portal" : "Generate New Identity"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-white overflow-hidden antialiased">
      <Sidebar 
        rooms={rooms} 
        activeRoomId={activeRoomId} 
        onSelectRoom={setActiveRoomId}
        currentUser={currentUser}
        onLogout={handleLogout}
        onRoomCreated={fetchRooms}
      />
      <div className="flex-1 flex flex-col h-full bg-slate-50">
        {activeRoomId ? (
          <ChatView 
            roomId={activeRoomId} 
            room={rooms.find(r => r.id === activeRoomId)}
            currentUser={currentUser}
            onSendMessage={handleSendMessage}
            lastIncomingMessage={lastIncomingMessage}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-28 h-28 bg-white rounded-[3rem] flex items-center justify-center mb-10 shadow-xl shadow-slate-100 border border-slate-50">
              <svg className="w-12 h-12 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Terminal Operational</h2>
            <p className="text-slate-400 mt-3 text-sm max-w-sm mx-auto font-medium leading-relaxed">Secure data relay established. Select an active tunnel to commence real-time transmission.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
