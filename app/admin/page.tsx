'use client';

import React, { useState } from 'react';
import { 
  LayoutDashboard, Megaphone, FilePlus, Package, 
  Thermometer, Check, ClipboardList, Plus, Trash2, 
  UserCheck, AlertCircle, Send, Search
} from 'lucide-react';

// モックデータ（本来はデータベース/APIから取得）
const INITIAL_TODOS = [
  { id: 1, title: '数学演習プリント P20-21', target: '1年生全体', due: '本日中', active: true },
  { id: 2, title: '英語エッセイ ドラフト提出', target: '2年A組・B組', due: '明日まで', active: true },
];

const INITIAL_LOST_ITEMS = [
  { id: 1, title: '青いシャープペンシル', location: '図書室', status: '事務室保管中', finder: '図書室カウンター' },
  { id: 2, title: '黒い折りたたみ傘', location: '食堂入口', status: '未回収(現場)', finder: '生徒報告' },
];

// 学生からのエアコン苦情の集計シミュレーション
const AC_COMPLAINTS = [
  { id: 1, room: '3-C教室', issue: '激暑', count: 12, temp: '30℃' },
  { id: 2, room: '2-A教室', issue: 'やや寒い', count: 4, temp: '23℃' },
];

export default function CampusSyncAdmin() {
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // 状態管理
  const [todos, setTodos] = useState(INITIAL_TODOS);
  const [lostItems, setLostItems] = useState(INITIAL_LOST_ITEMS);
  const [announcements, setAnnouncements] = useState([
    { id: 1, title: '明日の体育はグラウンドです', date: '2026/07/15', target: '全校生徒' }
  ]);

  // 新規投稿用フォームのステート
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newTodoTarget, setNewTodoTarget] = useState('全校生徒');
  const [newTodoDue, setNewTodoDue] = useState('');
  
  const [newNoticeTitle, setNewNoticeTitle] = useState('');
  const [newNoticeTarget, setNewNoticeTarget] = useState('全校生徒');

  // 提出物の追加処理
  const handleAddTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoTitle || !newTodoDue) return;
    const newTodo = {
      id: Date.now(),
      title: newTodoTitle,
      target: newTodoTarget,
      due: newTodoDue,
      active: true
    };
    setTodos([newTodo, ...todos]);
    setNewTodoTitle('');
    alert('提出物リクエストを配信しました！学生のアプリに同期されます。');
  };

  // お知らせの配信処理
  const handleAddNotice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoticeTitle) return;
    const newNotice = {
      id: Date.now(),
      title: newNoticeTitle,
      date: new Date().toLocaleDateString(),
      target: newNoticeTarget
    };
    setAnnouncements([newNotice, ...announcements]);
    setNewNoticeTitle('');
    alert('重要なお知らせを全画面プッシュ配信しました！');
  };

  // 落とし物ステータスの変更
  const toggleLostStatus = (id: number) => {
    setLostItems(prev => prev.map(item => {
      if (item.id === id) {
        return { 
          ...item, 
          status: item.status === '返却済み ✅' ? '事務室保管中' : '返却済み ✅' 
        };
      }
      return item;
    }));
  };

  return (
    <div className="flex h-screen bg-slate-900 font-sans text-slate-100 overflow-hidden">
      
      {/* 管理者用サイドバー（黒・ダーク基調で学生用と差別化） */}
      <aside className="w-64 bg-slate-950 border-r border-slate-800 p-6 flex flex-col justify-between">
        <div>
          <div className="mb-8">
            <h1 className="text-xl font-black tracking-wider text-blue-400">CampusSync <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">教職員用</span></h1>
            <p className="text-[10px] text-slate-500 font-mono mt-1">Soka High School Admin Panel</p>
          </div>
          
          <nav className="space-y-1">
            <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}>
              <LayoutDashboard size={18} /> ダッシュボード概要
            </button>
            <button onClick={() => setActiveTab('todos')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'todos' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}>
              <FilePlus size={18} /> 提出物・連絡の配信
            </button>
            <button onClick={() => setActiveTab('notices')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'notices' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}>
              <Megaphone size={18} /> お知らせ一斉通知
            </button>
            <button onClick={() => setActiveTab('lost')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'lost' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}>
              <Package size={18} /> 落とし物管理
            </button>
          </nav>
        </div>
        
        <div className="border-t border-slate-800 pt-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-slate-800 rounded-full flex items-center justify-center font-bold text-sm text-blue-400">教</div>
          <div>
            <p className="text-xs font-bold">山田 太郎 先生</p>
            <p className="text-[10px] text-slate-500">1年学年主任</p>
          </div>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <main className="flex-1 bg-slate-900 p-8 overflow-y-auto">
        
        {/* タブ1: ダッシュボード概要（リアルタイムアラート） */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-black">リアルタイム校内状況</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* エアコンアラート (学生からの報告を集計表示) */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-sm">
                <h3 className="text-base font-bold text-slate-300 mb-4 flex items-center gap-2">
                  <Thermometer className="text-red-400" size={20} /> エアコン要調整の教室（学生報告）
                </h3>
                <div className="space-y-3">
                  {AC_COMPLAINTS.map(ac => (
                    <div key={ac.id} className="flex justify-between items-center p-3.5 bg-slate-900 border border-slate-800 rounded-xl">
                      <div>
                        <span className="text-xs font-bold text-slate-400">{ac.room}</span>
                        <p className="text-sm font-black text-red-400 flex items-center gap-1.5 mt-0.5">
                          <AlertCircle size={14} /> 【{ac.issue}】現在の目安: {ac.temp}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs bg-red-500/10 text-red-400 px-2.5 py-1 rounded-full font-bold">
                          報告 {ac.count} 件
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* クイック統計 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 text-center">
                  <p className="text-xs text-slate-400 font-bold mb-1">本日の学食最大混雑率</p>
                  <p className="text-3xl font-black text-orange-400">85%</p>
                  <span className="text-[10px] text-slate-500">創価ランチ大行列</span>
                </div>
                <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 text-center">
                  <p className="text-xs text-slate-400 font-bold mb-1">未返却の落とし物</p>
                  <p className="text-3xl font-black text-yellow-400">{lostItems.filter(i => !i.status.includes('✅')).length} 件</p>
                  <span className="text-[10px] text-slate-500">事務室でお預かり中</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* タブ2: 提出物の配信 */}
        {activeTab === 'todos' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-black">提出物・連絡リクエストの新規作成</h2>
            
            <form onSubmit={handleAddTodo} className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-4 max-w-xl">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-400 block mb-1">課題・連絡名</label>
                  <input type="text" required value={newTodoTitle} onChange={e => setNewTodoTitle(e.target.value)} placeholder="例: 数学演習プリント P20-21" className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-sm font-bold text-white outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 block mb-1">対象クラス</label>
                  <select value={newTodoTarget} onChange={e => setNewTodoTarget(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-sm font-bold text-white outline-none focus:border-blue-500">
                    <option value="全校生徒">全校生徒</option>
                    <option value="1年生全体">1年生全体</option>
                    <option value="2年生全体">2年生全体</option>
                    <option value="3年生全体">3年生全体</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 block mb-1">提出期限</label>
                  <input type="text" required value={newTodoDue} onChange={e => setNewTodoDue(e.target.value)} placeholder="例: 明日の朝SHRまで" className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-sm font-bold text-white outline-none focus:border-blue-500" />
                </div>
              </div>
              <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-blue-600/10 flex items-center justify-center gap-1.5">
                <Send size={16} /> 対象クラスへ一斉配信
              </button>
            </form>

            {/* 現在配信中のリスト */}
            <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800">
              <h3 className="text-sm font-bold text-slate-400 mb-4">現在学生アプリに表示中の提出物</h3>
              <div className="space-y-2">
                {todos.map(todo => (
                  <div key={todo.id} className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex justify-between items-center">
                    <div>
                      <h4 className="text-sm font-bold text-white">{todo.title}</h4>
                      <p className="text-xs text-slate-500 mt-1">対象: {todo.target} | 期限: {todo.due}</p>
                    </div>
                    <span className="text-xs bg-green-500/10 text-green-400 px-3 py-1 rounded-full font-bold">配信中</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* タブ3: お知らせ一斉通知 */}
        {activeTab === 'notices' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-black">重要なお知らせの全体配信</h2>
            <form onSubmit={handleAddNotice} className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-4 max-w-xl">
              <div>
                <label className="text-xs font-bold text-slate-400 block mb-1">通知タイトル</label>
                <input type="text" required value={newNoticeTitle} onChange={e => setNewNoticeTitle(e.target.value)} placeholder="例: 本日の部活動は雨天のため全面中止です" className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-sm font-bold text-white outline-none focus:border-blue-500" />
              </div>
              <button type="submit" className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5">
                <Megaphone size={16} /> 緊急・重要通知として即時プッシュ配信
              </button>
            </form>
          </div>
        )}

        {/* タブ4: 落とし物管理 */}
        {activeTab === 'lost' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-black">落とし物・忘れ物のステータス管理</h2>
              <span className="text-xs bg-slate-800 text-slate-400 px-3 py-1.5 rounded-lg">生徒による発見報告の承認・編集</span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {lostItems.map(item => {
                const isReturned = item.status.includes('✅');
                return (
                  <div key={item.id} className={`p-4 bg-slate-950 border rounded-2xl flex justify-between items-center transition-all ${isReturned ? 'border-slate-800/50 opacity-50' : 'border-slate-800'}`}>
                    <div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full mb-1 inline-block ${isReturned ? 'bg-slate-800 text-slate-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                        {item.status}
                      </span>
                      <h4 className="text-sm font-bold text-white">{item.title}</h4>
                      <p className="text-xs text-slate-500 mt-1">発見場所: {item.location} | 報告ソース: {item.finder}</p>
                    </div>
                    
                    <button 
                      onClick={() => toggleLostStatus(item.id)}
                      className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all ${isReturned ? 'border-slate-700 text-slate-400 hover:bg-slate-900' : 'bg-blue-600 border-transparent text-white hover:bg-blue-700'}`}
                    >
                      {isReturned ? '保管中に戻す' : '本人へ返却完了にする'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}