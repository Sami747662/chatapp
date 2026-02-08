
import React, { useState, useEffect } from 'react';
import { User, ChatRoom } from '../types';
import { api } from '../services/api';

interface SidebarProps {
  rooms: ChatRoom[];
  activeRoomId: number | null;
  onSelectRoom: (id: number) => void;
  currentUser: User;
  onLogout: () => void;
  onRoomCreated: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ rooms, activeRoomId, onSelectRoom, currentUser, onLogout, onRoomCreated }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);

  useEffect(() => {
    const fetchPending = async () => {
      try {
        const data = await api.get('/requests/pending');
        setPendingRequests(data);
      } catch (e) { console.error("Pending fetch error", e); }
    };
    if (currentUser) fetchPending();
  }, [currentUser]);

  const handleSearch = async (query: string) => {
    setSearchTerm(query);
    if (query.length > 2) {
      setIsSearchingUsers(true);
      try {
        const results = await api.get(`/users/search?query=${query}`);
        setSearchResults(results);
      } catch (e) { console.error(e); }
    } else {
      setSearchResults([]);
      setIsSearchingUsers(false);
    }
  };

  const sendRequest = async (username: string) => {
    try {
      await api.post('/requests/send', { receiver_username: username });
      alert("System Signal: Request transmitted.");
      setSearchTerm('');
      setSearchResults([]);
      setIsSearchingUsers(false);
    } catch (e: any) {
      alert(e.message || "Transfer failed.");
    }
  };

  const respondRequest = async (requestId: number, accept: boolean) => {
    try {
      await api.post(`/requests/${requestId}/respond?accept=${accept}`, {});
      setPendingRequests(prev => prev.filter(r => r.id !== requestId));
      onRoomCreated();
    } catch (e) { console.error(e); }
  };

  const filteredRooms = rooms.filter(room => {
    const name = room.chat_type === 'group' ? room.group_name : room.other_user.display_name || room.other_user.username;
    return name?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="w-80 md:w-96 flex flex-col h-full bg-white border-r border-slate-100">
      {/* Header / Profile */}
      <div className="p-5 border-b border-slate-50 flex items-center justify-between bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white font-black text-sm shadow-xl shadow-slate-100">
            {currentUser.display_name?.[0] || currentUser.username[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 leading-tight truncate w-32 text-sm">
              {currentUser.display_name || currentUser.username}
            </h3>
            <span className="text-[10px] text-green-500 font-black uppercase tracking-widest flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
              Live
            </span>
          </div>
        </div>
        <button 
          onClick={onLogout}
          className="p-2 hover:bg-red-50 rounded-xl transition-all text-slate-300 hover:text-red-500 group"
          title="Sever Link (Logout)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="p-4">
        <div className="relative group">
          <input
            type="text"
            placeholder="Search or start new link..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full bg-slate-100 border-transparent rounded-2xl py-3 pl-11 pr-4 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all outline-none placeholder:text-slate-400"
          />
          <svg className="w-4 h-4 text-slate-400 absolute left-4 top-3.5 group-focus-within:text-slate-900 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Main List */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 no-scrollbar">
        {/* User Search Results */}
        {isSearchingUsers && searchResults.length > 0 && (
            <div className="mb-6 animate-fadeIn">
                <div className="px-3 mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">Global Search</span>
                    <button onClick={() => { setSearchResults([]); setSearchTerm(''); setIsSearchingUsers(false); }} className="text-[10px] font-bold text-slate-300 hover:text-slate-900 uppercase">Clear</button>
                </div>
                {searchResults.map(user => (
                    <button
                        key={user.id}
                        onClick={() => sendRequest(user.username)}
                        className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100 group"
                    >
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-slate-500 group-hover:bg-slate-900 group-hover:text-white transition-all">
                            {user.username[0].toUpperCase()}
                        </div>
                        <div className="text-left">
                            <h4 className="font-bold text-sm text-slate-900">{user.display_name || user.username}</h4>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Tap to request link</p>
                        </div>
                    </button>
                ))}
            </div>
        )}

        {/* Pending Requests */}
        {pendingRequests.length > 0 && (
             <div className="mb-6 animate-fadeIn">
                <div className="px-3 mb-2">
                    <span className="text-[10px] font-black text-amber-500 uppercase tracking-[0.15em]">Pending Links</span>
                </div>
                {pendingRequests.map(req => (
                    <div key={req.id} className="p-3 bg-amber-50 rounded-2xl border border-amber-100 mb-2">
                        <p className="text-xs font-bold text-amber-900 mb-2">Identity <span className="underline">{req.sender.username}</span> requests link.</p>
                        <div className="flex gap-2">
                            <button onClick={() => respondRequest(req.id, true)} className="flex-1 py-2 bg-slate-900 text-white text-[10px] font-black rounded-lg hover:bg-slate-800 transition shadow-sm uppercase">Accept</button>
                            <button onClick={() => respondRequest(req.id, false)} className="flex-1 py-2 bg-white text-slate-400 text-[10px] font-black rounded-lg hover:bg-slate-50 transition border border-amber-100 uppercase">Ignore</button>
                        </div>
                    </div>
                ))}
             </div>
        )}

        <div className="px-3 mb-3 flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Active Tunnels</span>
        </div>
        
        {filteredRooms.length === 0 && !isSearchingUsers ? (
            <div className="p-8 text-center">
                <p className="text-xs font-bold text-slate-300 uppercase tracking-widest leading-loose">No active links found. Search for an identity to begin.</p>
            </div>
        ) : (
            filteredRooms.map((room) => {
              const isActive = activeRoomId === room.id;
              const name = room.chat_type === 'group' ? room.group_name : room.other_user.display_name || room.other_user.username;
              const avatar = room.chat_type === 'group' ? 'G' : name?.[0] || '?';
              
              return (
                <button
                  key={room.id}
                  onClick={() => onSelectRoom(room.id)}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all mb-2 group relative border ${
                    isActive ? 'bg-white border-slate-200 shadow-xl shadow-slate-100 scale-[1.02]' : 'bg-white border-transparent hover:bg-slate-50'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg shrink-0 shadow-sm transition-transform group-hover:scale-105 ${
                    room.chat_type === 'group' ? 'bg-slate-100 text-slate-600' : 'bg-slate-900 text-white'
                  }`}>
                    {avatar}
                    {room.chat_type !== 'group' && room.other_user.is_online && (
                       <span className="absolute bottom-3 right-4 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full"></span>
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <h4 className={`font-black truncate text-sm tracking-tight ${isActive ? 'text-slate-900' : 'text-slate-700'}`}>
                        {name}
                      </h4>
                      {room.last_message && (
                        <span className="text-[9px] font-bold text-slate-400 whitespace-nowrap ml-2">
                          {new Date(room.last_message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <p className={`text-xs truncate pr-4 ${isActive ? 'text-slate-500' : 'text-slate-400'} font-medium`}>
                        {room.last_message?.content || 'Awaiting initial signal...'}
                      </p>
                      {room.unread_count > 0 && (
                        <span className="bg-slate-900 text-white text-[9px] font-black px-1.5 py-0.5 rounded-lg min-w-[18px] text-center shadow-lg shadow-slate-100">
                          {room.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
        )}
      </div>
    </div>
  );
};

export default Sidebar;
