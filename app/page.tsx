'use client';

import React, { useState } from 'react';
import { 
  Home, Utensils, BookOpen, Settings, Bell, CheckCircle, 
  Clock, FileText, Monitor, Wind, ThermometerSun, 
  ThermometerSnowflake, Search, Info, Users, Check, X, Plus, 
  ChevronRight, AlertTriangle, Sparkles, Star, MapPin, 
  QrCode, User, Palette, BellRing, Lock, Sparkle
} from 'lucide-react';

// --- テーマカラー別の Tailwind クラス定義 ---
const THEMES = {
  blue: {
    bg: 'bg-blue-500',
    bgHover: 'hover:bg-blue-600',
    text: 'text-blue-600',
    textLight: 'text-blue-500',
    border: 'border-blue-500',
    lightBg: 'bg-blue-50',
    lightBgHover: 'hover:bg-blue-100',
    shadow: 'shadow-blue-200',
    gradient: 'from-blue-500 to-cyan-400',
    borderLight: 'border-blue-100',
    ring: 'focus:ring-blue-500/20',
  },
  pink: {
    bg: 'bg-pink-500',
    bgHover: 'hover:bg-pink-600',
    text: 'text-pink-600',
    textLight: 'text-pink-500',
    border: 'border-pink-500',
    lightBg: 'bg-pink-50',
    lightBgHover: 'hover:bg-pink-100',
    shadow: 'shadow-pink-200',
    gradient: 'from-pink-500 to-rose-400',
    borderLight: 'border-pink-100',
    ring: 'focus:ring-pink-500/20',
  },
  purple: {
    bg: 'bg-purple-500',
    bgHover: 'hover:bg-purple-600',
    text: 'text-purple-600',
    textLight: 'text-purple-500',
    border: 'border-purple-500',
    lightBg: 'bg-purple-50',
    lightBgHover: 'hover:bg-purple-100',
    shadow: 'shadow-purple-200',
    gradient: 'from-purple-500 to-indigo-400',
    borderLight: 'border-purple-100',
    ring: 'focus:ring-purple-500/20',
  },
  emerald: {
    bg: 'bg-emerald-500',
    bgHover: 'hover:bg-emerald-600',
    text: 'text-emerald-600',
    textLight: 'text-emerald-500',
    border: 'border-emerald-500',
    lightBg: 'bg-emerald-50',
    lightBgHover: 'hover:bg-emerald-100',
    shadow: 'shadow-emerald-200',
    gradient: 'from-emerald-500 to-teal-400',
    borderLight: 'border-emerald-100',
    ring: 'focus:ring-emerald-500/20',
  },
  orange: {
    bg: 'bg-orange-500',
    bgHover: 'hover:bg-orange-600',
    text: 'text-orange-600',
    textLight: 'text-orange-500',
    border: 'border-orange-500',
    lightBg: 'bg-orange-50',
    lightBgHover: 'hover:bg-orange-100',
    shadow: 'shadow-orange-200',
    gradient: 'from-orange-500 to-amber-400',
    borderLight: 'border-orange-100',
    ring: 'focus:ring-orange-500/20',
  }
};

type ThemeKey = keyof typeof THEMES;

// --- 初期モックデータ ---

const INITIAL_TODOS = [
  { id: 1, title: '数学演習プリント P20-21', source: '紙プリント', type: 'paper', due: '本日中', color: 'bg-red-100 text-red-700', icon: FileText, details: '授業で配布されたプリントのP20〜21です。途中式も必ず書くこと。明日の朝のSHRで回収します。', completed: false },
  { id: 2, title: '英語エッセイ ドラフト提出', source: 'Classroom', type: 'classroom', due: '明日まで', color: 'bg-orange-100 text-orange-700', icon: Monitor, details: 'テーマ「My Future Goal」についてのドラフト（下書き）をGoogle Docsで作成し、Classroomの課題から提出してください。最低300語。', completed: false },
  { id: 3, title: '文化祭 参加希望アンケート', source: '生徒会', type: 'other', due: '金曜まで', color: 'bg-blue-100 text-blue-700', icon: Info, details: '文化祭の有志発表（バンド、ダンス等）に参加を希望する団体は、代表者がこのアンケートに回答してください。', completed: false },
];

const INITIAL_ROOMS = [
  { id: 1, name: '1-A教室', status: '快適', temp: '25℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 2, name: '1-B教室', status: '快適', temp: '26℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 3, name: '2-A教室', status: 'やや寒い', temp: '23℃', icon: Wind, color: 'text-cyan-500', bg: 'bg-cyan-50' },
  { id: 4, name: '3-C教室', status: '激暑', temp: '30℃', icon: ThermometerSun, color: 'text-red-500', bg: 'bg-red-50' },
  { id: 5, name: '図書室', status: 'やや寒い', temp: '24℃', icon: Wind, color: 'text-cyan-500', bg: 'bg-cyan-50' },
  { id: 6, name: '食堂', status: '快適', temp: '26℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
];

const MOCK_NOTIFICATIONS = [
  { id: 1, title: '明日の体育はグラウンドです', time: '10分前', isRead: false },
  { id: 2, title: '図書室の新着本が入荷しました', time: '1時間前', isRead: false },
  { id: 3, title: '【重要】週末の部活動について', time: '昨日', isRead: true },
  { id: 4, title: '食堂の期間限定メニュー開始', time: '昨日', isRead: true },
];

const MENU_ITEMS = [
  { id: 'snack', name: 'スナック' },
  { id: 'soka', name: '創価ランチ' },
  { id: 'noodles', name: '麺類' },
  { id: 'curry', name: 'カレー' },
  { id: 'healthy', name: 'ヘルシーランチ' },
];

// 落とし物データの初期値
const INITIAL_LOST_AND_FOUND = [
  { id: 1, title: '青いシャープペンシル', location: '図書室', date: '今日 12:30頃', description: 'パイロット製のドクターグリップ（青）です。消しゴムのキャップがありません。', finder: '図書室カウンターに預けました' },
  { id: 2, title: '黒い折りたたみ傘', location: '食堂入口の傘立て', date: '昨日', description: '無印良品の黒い傘。持ち手に星型のシールが貼ってあります。', finder: 'まだその場に置いてあります' },
];

export default function CampusSyncApp() {
  const [activeTab, setActiveTab] = useState('home');
  const [selectedTodo, setSelectedTodo] = useState<any>(null);
  const [showTempModal, setShowTempModal] = useState(false);
  
  // 🌟 学校貢献度ポイント
  const [score, setScore] = useState(42);

  // --- 🎨 3. テーマカラー状態管理 (初期値は blue) ---
  const [theme, setTheme] = useState<ThemeKey>('blue');
  const themeCls = THEMES[theme]; // 現在のテーマに対応するクラス群

  // --- 🪪 1. プロフィール＆学籍番号 状態管理 ---
  const [studentId, setStudentId] = useState('581234'); // デフォルトは58期生
  const [studentName, setStudentName] = useState('創価 太郎');
  const [showIdCardModal, setShowIdCardModal] = useState(false); // デジタル学生証表示

  // --- ⏰ 5. おせっかい通知リマインダー 状態管理 ---
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [reminderTimes, setReminderTimes] = useState<string[]>(['dayBefore', 'morningOf']); // 既定のアラームタイミング

  // 学籍番号の頭2桁から「期生」を自動判別する関数
  const getCohortName = (id: string) => {
    const cleanId = id.trim();
    if (cleanId.length >= 2) {
      const cohortDigits = cleanId.substring(0, 2);
      if (/^\d+$/.test(cohortDigits)) {
        return `第 ${cohortDigits} 期生`;
      }
    }
    return '未設定期生';
  };

  // --- 各種動的ステート ---
  const [todos, setTodos] = useState(INITIAL_TODOS);
  const [rooms, setRooms] = useState(INITIAL_ROOMS);
  
  // エアコン報告用お気に入り
  const [favoriteRoomId, setFavoriteRoomId] = useState<number>(1);
  const [selectedRoomId, setSelectedRoomId] = useState<number>(1);
  const [selectedStatus, setSelectedStatus] = useState<string>('快適');

  // サブタブ
  const [cafeteriaSubTab, setCafeteriaSubTab] = useState<'overall' | 'menu'>('overall');
  const [facilitiesSubTab, setFacilitiesSubTab] = useState<'status' | 'lost'>('status');

  // 学食（全体）の混雑度投票
  const [crowdVotes, setCrowdVotes] = useState({ empty: 15, normal: 60, crowded: 25 });
  const [userVote, setUserVote] = useState<'empty' | 'normal' | 'crowded' | null>(null);

  // メニュー別の投票
  const [menuVotes, setMenuVotes] = useState<Record<string, { empty: number, normal: number, crowded: number }>>({
    snack: { empty: 8, normal: 14, crowded: 3 },
    soka: { empty: 2, normal: 8, crowded: 25 },
    noodles: { empty: 5, normal: 12, crowded: 4 },
    curry: { empty: 4, normal: 10, crowded: 9 },
    healthy: { empty: 10, normal: 5, crowded: 1 },
  });
  
  const [userMenuVotes, setUserMenuVotes] = useState<Record<string, 'empty' | 'normal' | 'crowded' | null>>({
    snack: null, soka: null, noodles: null, curry: null, healthy: null,
  });

  // 学食「売り切れ」
  const [soldOutItems, setSoldOutItems] = useState<Record<string, boolean>>({
    snack: false, soka: false, noodles: false, curry: false, healthy: false,
  });

  // 落とし物
  const [lostAndFoundList, setLostAndFoundList] = useState(INITIAL_LOST_AND_FOUND);
  const [newLostTitle, setNewLostTitle] = useState('');
  const [newLostLocation, setNewLostLocation] = useState('');
  const [newLostDescription, setNewLostDescription] = useState('');
  const [newLostFinder, setNewLostFinder] = useState('');

  // 混雑パーセント計算
  const totalVotes = crowdVotes.empty + crowdVotes.normal + crowdVotes.crowded + (userVote ? 1 : 0);
  const getPercent = (val: number, key: string) => {
    const adjustedVal = val + (userVote === key ? 1 : 0);
    return Math.round((adjustedVal / totalVotes) * 100) || 0;
  };

  // 全体混雑度の投票
  const handleVote = (type: 'empty' | 'normal' | 'crowded') => {
    if (userVote !== type) {
      setUserVote(type);
      setScore(prev => Math.min(prev + 5, 100));
    } else {
      setUserVote(null);
      setScore(prev => Math.max(prev - 5, 0));
    }
  };

  // メニュー別の混雑投票
  const handleMenuVote = (menuId: string, type: 'empty' | 'normal' | 'crowded') => {
    if (soldOutItems[menuId]) return;
    const currentVote = userMenuVotes[menuId];
    setUserMenuVotes(prev => ({
      ...prev,
      [menuId]: currentVote === type ? null : type
    }));

    if (currentVote !== type && !currentVote) {
      setScore(prev => Math.min(prev + 5, 100));
    } else if (currentVote === type) {
      setScore(prev => Math.max(prev - 5, 0));
    }
  };

  // 売り切れ報告
  const toggleSoldOut = (menuId: string) => {
    const wasSoldOut = soldOutItems[menuId];
    setSoldOutItems(prev => ({
      ...prev,
      [menuId]: !wasSoldOut
    }));

    if (!wasSoldOut) {
      setScore(prev => Math.min(prev + 10, 100));
      alert(`「${MENU_ITEMS.find(i => i.id === menuId)?.name}」の売り切れを報告しました！学校貢献度+10pt！🎉`);
    } else {
      setScore(prev => Math.max(prev - 10, 0));
    }
  };

  // TODO完了トグル
  const toggleTodoComplete = (todoId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setTodos(prev => prev.map(todo => {
      if (todo.id === todoId) {
        const nextState = !todo.completed;
        if (nextState) {
          setScore(p => Math.min(p + 10, 100));
        } else {
          setScore(p => Math.max(p - 10, 0));
        }
        return { ...todo, completed: nextState };
      }
      return todo;
    }));
  };

  // 落とし物投稿
  const handleAddLostItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLostTitle || !newLostLocation) {
      alert("「品名」と「見つけた場所」は必須です！");
      return;
    }

    const newItem = {
      id: Date.now(),
      title: newLostTitle,
      location: newLostLocation,
      date: '今日 ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      description: newLostDescription || '詳細説明はありません。',
      finder: newLostFinder || 'その場にあります。'
    };

    setLostAndFoundList([newItem, ...lostAndFoundList]);
    setScore(prev => Math.min(prev + 10, 100));

    setNewLostTitle('');
    setNewLostLocation('');
    setNewLostDescription('');
    setNewLostFinder('');

    alert("落とし物情報を登録しました！落とし主が見つかりますように。学校貢献度+10pt！🎁");
  };

  // エアコン状況報告
  const submitAcReport = () => {
    setRooms(prev => prev.map(room => {
      if (room.id === selectedRoomId) {
        let nextTemp = room.temp;
        let color = room.color;
        let bg = room.bg;
        let icon = room.icon;

        if (selectedStatus === '寒い') {
          nextTemp = (parseInt(room.temp) - 1) + '℃';
          color = 'text-cyan-500';
          bg = 'bg-cyan-50';
          icon = Wind;
        } else if (selectedStatus === '暑い') {
          nextTemp = (parseInt(room.temp) + 1) + '℃';
          color = 'text-red-500';
          bg = 'bg-red-50';
          icon = ThermometerSun;
        } else {
          nextTemp = '25℃';
          color = 'text-green-500';
          bg = 'bg-green-50';
          icon = ThermometerSnowflake;
        }

        return { ...room, status: selectedStatus, temp: nextTemp, icon, color, bg };
      }
      return room;
    }));

    setShowTempModal(false);
    setScore(prev => Math.min(prev + 10, 100));
    alert("報告ありがとうございます！お部屋のステータスに反映しました。学校貢献度 +10pt！🎉"); 
  };

  // おせっかい通知リマインダー選択のトグル
  const toggleReminderTime = (timeKey: string) => {
    if (reminderTimes.includes(timeKey)) {
      setReminderTimes(prev => prev.filter(t => t !== timeKey));
    } else {
      setReminderTimes(prev => [...prev, timeKey]);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* ゲーミフィケーション要素 (テーマカラー対応) */}
            <div className={`bg-gradient-to-br ${themeCls.gradient} rounded-2xl p-5 shadow-md text-white relative overflow-hidden transition-all duration-300`}>
              <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white opacity-10 rounded-full blur-2xl"></div>
              <div className="flex justify-between items-end mb-2 relative z-10">
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                      {getCohortName(studentId)}
                    </span>
                    <span className="text-xs font-semibold text-white/80">{studentName} さん</span>
                  </div>
                  <h2 className="text-sm font-medium text-white/90 mb-1">今日の学校貢献度</h2>
                  <p className="text-3xl font-bold tracking-tight">{score} <span className="text-base font-normal text-white/80">/ 100 pt</span></p>
                </div>
                <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm flex items-center gap-1">
                  <Sparkles size={20} className="text-yellow-200 animate-pulse" />
                  <span className="text-xs font-bold">貢献中</span>
                </div>
              </div>
              <div className="h-2 bg-black/10 rounded-full overflow-hidden mt-4 relative z-10">
                <div className="h-full bg-white rounded-full transition-all duration-1000 ease-out" style={{ width: `${score}%` }}></div>
              </div>
            </div>

            {/* TODOセクション (テーマカラー対応) */}
            <section>
              <h3 className="text-[17px] font-bold text-gray-800 mb-3 flex items-center">
                <Clock size={20} className={`mr-2 ${themeCls.text}`}/> 提出物・連絡
              </h3>
              <div className="space-y-3">
                {todos.map(todo => (
                  <div 
                    key={todo.id} 
                    onClick={() => setSelectedTodo(todo)}
                    className={`w-full p-4 rounded-2xl shadow-sm border flex items-center gap-3 text-left hover:shadow-md transition-all cursor-pointer ${
                      todo.completed ? 'bg-green-50/40 border-green-200/50 opacity-70' : 'bg-white border-gray-100'
                    }`}
                  >
                    <button
                      onClick={(e) => toggleTodoComplete(todo.id, e)}
                      className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all flex-shrink-0 ${
                        todo.completed 
                          ? 'bg-green-500 border-green-500 text-white' 
                          : `border-gray-300 hover:${themeCls.border} bg-white`
                      }`}
                    >
                      {todo.completed && <Check size={16} strokeWidth={3} />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          todo.completed ? 'bg-green-100 text-green-700' : todo.color
                        }`}>
                          {todo.completed ? '提出完了' : todo.due}
                        </span>
                        <span className="text-[11px] text-gray-400 font-medium">{todo.source}</span>
                      </div>
                      <h4 className={`text-sm font-bold text-gray-800 truncate ${todo.completed ? 'line-through text-gray-400' : ''}`}>
                        {todo.title}
                      </h4>
                    </div>
                    <ChevronRight size={16} className="text-gray-300" />
                  </div>
                ))}
              </div>
            </section>

            {/* 快適度セクション */}
            <section>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-[17px] font-bold text-gray-800 flex items-center">
                  <Wind size={20} className="mr-2 text-teal-500"/> 校内のエアコン状況
                </h3>
                <button 
                  onClick={() => setShowTempModal(true)}
                  className="text-xs font-bold bg-teal-50 text-teal-600 px-3 py-1.5 rounded-full hover:bg-teal-100 transition-colors flex items-center"
                >
                  <Plus size={14} className="mr-1" /> 報告する
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {rooms.map(room => (
                  <div key={room.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 relative">
                    {favoriteRoomId === room.id && (
                      <span className="absolute top-2 right-2 text-yellow-400">
                        <Star size={14} fill="currentColor" />
                      </span>
                    )}
                    <div className="flex justify-between items-start mb-2">
                      <room.icon size={20} className={room.color} />
                      <span className="text-xs font-bold text-gray-400 mr-4">{room.temp}</span>
                    </div>
                    <h4 className="text-xs text-gray-500 mb-0.5">{room.name}</h4>
                    <p className={`text-sm font-bold ${room.color}`}>{room.status}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        );

      case 'cafeteria':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-orange-50 border border-orange-100 p-4 rounded-2xl text-orange-800 text-sm flex items-start gap-3">
              <Info size={20} className="text-orange-500 flex-shrink-0 mt-0.5" />
              <p>学食の決済は学生証のタッチで完了します。食券の購入は不要です。</p>
            </div>

            {/* サブタブ切り替え */}
            <div className="flex bg-gray-100 p-1 rounded-2xl">
              <button 
                onClick={() => setCafeteriaSubTab('overall')}
                className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all ${cafeteriaSubTab === 'overall' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
              >
                全体の混雑度
              </button>
              <button 
                onClick={() => setCafeteriaSubTab('menu')}
                className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all ${cafeteriaSubTab === 'menu' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
              >
                メニュー別の並び具合
              </button>
            </div>

            {cafeteriaSubTab === 'overall' ? (
              <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-5">
                  <h3 className="text-lg font-bold text-gray-800 flex items-center">
                    <Users size={22} className="mr-2 text-orange-500"/> 今の食堂、混んでる？
                  </h3>
                  <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                    リアルタイム投票
                  </span>
                </div>
                
                <div className="space-y-4 mb-8">
                  <VoteBar label="空いてる" count={crowdVotes.empty} type="empty" userVote={userVote} percent={getPercent(crowdVotes.empty, 'empty')} color="bg-green-500" />
                  <VoteBar label="普通" count={crowdVotes.normal} type="normal" userVote={userVote} percent={getPercent(crowdVotes.normal, 'normal')} color="bg-orange-400" />
                  <VoteBar label="激混み" count={crowdVotes.crowded} type="crowded" userVote={userVote} percent={getPercent(crowdVotes.crowded, 'crowded')} color="bg-red-500" />
                </div>

                <h4 className="text-center text-sm font-bold text-gray-500 mb-3">あなたも今の状況を投票しよう！</h4>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => handleVote('empty')} className={`py-3 text-sm font-bold rounded-xl border transition-all ${userVote === 'empty' ? 'border-green-500 bg-green-50 text-green-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>空き</button>
                  <button onClick={() => handleVote('normal')} className={`py-3 text-sm font-bold rounded-xl border transition-all ${userVote === 'normal' ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>普通</button>
                  <button onClick={() => handleVote('crowded')} className={`py-3 text-sm font-bold rounded-xl border transition-all ${userVote === 'crowded' ? 'border-red-500 bg-red-50 text-red-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>激混み</button>
                </div>
              </section>
            ) : (
              /* メニュー別 */
              <div className="space-y-4">
                {MENU_ITEMS.map(item => {
                  const isSoldOut = soldOutItems[item.id];
                  const votes = menuVotes[item.id];
                  const userVoteItem = userMenuVotes[item.id];
                  const total = votes.empty + votes.normal + votes.crowded + (userVoteItem ? 1 : 0);
                  
                  const getMenuPercent = (val: number, key: string) => {
                    if (isSoldOut) return 0;
                    const adjusted = val + (userVoteItem === key ? 1 : 0);
                    return Math.round((adjusted / total) * 100) || 0;
                  };

                  return (
                    <div 
                      key={item.id} 
                      className={`bg-white rounded-2xl p-5 shadow-sm border transition-all duration-300 relative overflow-hidden ${
                        isSoldOut ? 'border-red-200 bg-gray-50/50 opacity-80' : 'border-gray-100'
                      }`}
                    >
                      {isSoldOut && (
                        <div className="absolute inset-0 bg-red-500/5 backdrop-blur-[1px] flex items-center justify-center pointer-events-none z-10">
                          <div className="bg-red-600 text-white font-black text-sm px-4 py-2 rounded-full shadow-lg flex items-center gap-1.5 transform -rotate-3">
                            <AlertTriangle size={16} /> SOLD OUT / 売り切れ
                          </div>
                        </div>
                      )}

                      <div className="flex justify-between items-center mb-3">
                        <div>
                          <h4 className="text-base font-bold text-gray-800">{item.name}</h4>
                          <span className="text-[10px] font-bold text-gray-400">
                            {isSoldOut ? '本日は終了しました' : '並び列の目安'}
                          </span>
                        </div>
                        
                        <button
                          onClick={() => toggleSoldOut(item.id)}
                          className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all z-20 ${
                            isSoldOut 
                              ? 'bg-red-100 border-red-200 text-red-700 hover:bg-red-200' 
                              : 'bg-white border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                          }`}
                        >
                          {isSoldOut ? '販売再開にする' : '売り切れを報告'}
                        </button>
                      </div>

                      {/* グラフ */}
                      <div className={`grid grid-cols-3 gap-2 text-[11px] font-bold mb-3 ${isSoldOut ? 'opacity-30' : ''}`}>
                        <div className="bg-green-50/70 p-2 rounded-xl border border-green-100/50 text-center">
                          <p className="text-green-700 mb-0.5">スイスイ</p>
                          <p className="text-green-600 text-sm font-black">{getMenuPercent(votes.empty, 'empty')}%</p>
                        </div>
                        <div className="bg-orange-50/70 p-2 rounded-xl border border-orange-100/50 text-center">
                          <p className="text-orange-700 mb-0.5">普通</p>
                          <p className="text-orange-600 text-sm font-black">{getMenuPercent(votes.normal, 'normal')}%</p>
                        </div>
                        <div className="bg-red-50/70 p-2 rounded-xl border border-red-100/50 text-center">
                          <p className="text-red-700 mb-0.5">大行列</p>
                          <p className="text-red-600 text-sm font-black">{getMenuPercent(votes.crowded, 'crowded')}%</p>
                        </div>
                      </div>

                      {/* 投票 */}
                      <div className={`flex gap-2 pt-1 border-t border-gray-50 ${isSoldOut ? 'opacity-20 pointer-events-none' : ''}`}>
                        <button 
                          disabled={isSoldOut}
                          onClick={() => handleMenuVote(item.id, 'empty')} 
                          className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${userVoteItem === 'empty' ? 'border-green-500 bg-green-50 text-green-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                        >
                          スイスイ
                        </button>
                        <button 
                          disabled={isSoldOut}
                          onClick={() => handleMenuVote(item.id, 'normal')} 
                          className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${userVoteItem === 'normal' ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                        >
                          普通
                        </button>
                        <button 
                          disabled={isSoldOut}
                          onClick={() => handleMenuVote(item.id, 'crowded')} 
                          className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${userVoteItem === 'crowded' ? 'border-red-500 bg-red-50 text-red-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                        >
                          大行列
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );

      case 'facilities':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex bg-gray-100 p-1 rounded-2xl">
              <button 
                onClick={() => setFacilitiesSubTab('status')}
                className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all ${facilitiesSubTab === 'status' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
              >
                図書室・自習室
              </button>
              <button 
                onClick={() => setFacilitiesSubTab('lost')}
                className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all ${facilitiesSubTab === 'lost' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
              >
                落とし物掲示板 🔍
              </button>
            </div>

            {facilitiesSubTab === 'status' ? (
              <div className="space-y-6">
                <section>
                  <h3 className="text-[17px] font-bold text-gray-800 mb-3 flex items-center">
                    <BookOpen size={20} className="mr-2 text-indigo-600"/> 図書館
                  </h3>
                  <div className="relative mb-6">
                    <input type="text" placeholder="本の発行元やタイトルを入力..." className="w-full bg-white border border-gray-200 rounded-2xl py-3.5 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm" />
                    <Search size={18} className="absolute left-4 top-4 text-gray-400" />
                  </div>
                  <h4 className="text-sm font-bold text-gray-700 mb-3">新着・おすすめ図書</h4>
                  <div className="flex gap-4 overflow-x-auto pb-4 snap-x [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="min-w-[130px] snap-start cursor-pointer group">
                        <div className="h-40 bg-gray-100 border border-gray-200 rounded-xl mb-2.5 flex items-center justify-center text-gray-300 text-xs shadow-sm group-hover:shadow-md transition-shadow">Cover</div>
                        <h5 className="text-xs font-bold text-gray-800 line-clamp-2 leading-snug group-hover:text-indigo-600 transition-colors">デザイン思考が世界を変える {i}</h5>
                      </div>
                    ))}
                  </div>
                </section>
                
                <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <div className="flex justify-between items-center mb-5">
                    <h3 className="text-[17px] font-bold text-gray-800 flex items-center"><Monitor size={20} className="mr-2 text-teal-600"/> 自習室</h3>
                  </div>
                  <div className="flex items-end justify-between mb-2">
                    <span className="text-sm font-bold text-gray-500">現在の利用状況</span>
                    <span className="text-2xl font-black text-gray-800">18 <span className="text-sm font-bold text-gray-400">/ 30席</span></span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-4">
                    <div className="h-full bg-teal-500 rounded-full" style={{ width: `${(18 / 30) * 100}%` }}></div>
                  </div>
                </section>
              </div>
            ) : (
              /* 落とし物・忘れ物 */
              <div className="space-y-6 animate-in fade-in duration-200">
                <form onSubmit={handleAddLostItem} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-4">
                  <h4 className="text-sm font-black text-gray-800 flex items-center gap-1.5">
                    <Plus size={18} className={`text-[var(--primary)] ${themeCls.text}`} /> 落とし物を新しく投稿する
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <input 
                      type="text" 
                      placeholder="落とし物の名前 (例: 白いワイヤレスイヤホン)" 
                      value={newLostTitle}
                      onChange={e => setNewLostTitle(e.target.value)}
                      className="col-span-2 bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                    <input 
                      type="text" 
                      placeholder="見つけた場所 (例: 食堂の窓際)" 
                      value={newLostLocation}
                      onChange={e => setNewLostLocation(e.target.value)}
                      className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                    <input 
                      type="text" 
                      placeholder="今の保管場所 (例: 事務室に預けた)" 
                      value={newLostFinder}
                      onChange={e => setNewLostFinder(e.target.value)}
                      className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                    <textarea 
                      placeholder="特徴・詳細 (例: ケースの背面にシールの跡があります)" 
                      value={newLostDescription}
                      onChange={e => setNewLostDescription(e.target.value)}
                      className="col-span-2 bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500/20 h-16 resize-none"
                    />
                  </div>
                  <button 
                    type="submit"
                    className={`w-full py-3 text-white font-bold text-xs rounded-xl shadow-md transition-all ${themeCls.bg} ${themeCls.bgHover}`}
                  >
                    投稿して学校貢献度 +10pt 獲得
                  </button>
                </form>

                {/* リスト表示 */}
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-gray-500 px-1">最近投稿された落とし物</h4>
                  {lostAndFoundList.map(item => (
                    <div key={item.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-2.5">
                      <div className="flex justify-between items-start">
                        <h5 className="font-bold text-gray-800 text-sm">{item.title}</h5>
                        <span className="text-[10px] text-gray-400 font-medium">{item.date}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                        <div className="flex items-center gap-1 bg-gray-50 p-1.5 rounded-lg">
                          <MapPin size={14} className="text-red-400" />
                          <span className="font-bold text-[11px] truncate">場所: {item.location}</span>
                        </div>
                        <div className="flex items-center gap-1 bg-blue-50/50 p-1.5 rounded-lg text-blue-700">
                          <CheckCircle size={14} />
                          <span className="font-bold text-[11px] truncate">保管: {item.finder}</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed border-t border-gray-50 pt-2.5">
                        {item.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'notifications':
        return (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h2 className="text-xl font-bold text-gray-800 mb-4 px-1">通知</h2>
            {MOCK_NOTIFICATIONS.map(note => (
              <div key={note.id} className={`p-4 rounded-2xl border ${note.isRead ? 'bg-transparent border-gray-100' : 'bg-white border-blue-100 shadow-sm'} flex gap-4 items-start`}>
                <div className="mt-1">
                  {note.isRead ? <Bell size={20} className="text-gray-300"/> : <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shadow-sm ${themeCls.bg} ${themeCls.shadow}`}></div>}
                </div>
                <div>
                  <h4 className={`text-sm mb-1 ${note.isRead ? 'text-gray-500 font-medium' : 'text-gray-800 font-bold'}`}>{note.title}</h4>
                  <p className="text-[11px] text-gray-400">{note.time}</p>
                </div>
              </div>
            ))}
          </div>
        );

      case 'settings':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h2 className="text-xl font-bold text-gray-800 mb-2 px-1">マイ設定</h2>
            
            {/* 🪪 1. プロフィール＆ログイン連携（学籍番号） */}
            <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-4">
              <div className="flex items-center gap-3 border-b border-gray-50 pb-3.5">
                <div className={`p-2.5 ${themeCls.lightBg} rounded-2xl text-gray-700`}>
                  <User size={22} className={themeCls.text} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-gray-800">ログイン情報（プロフィール）</h3>
                  <p className="text-[11px] text-gray-400 font-medium">学籍番号の最初の2桁から所属期生を自動判別します</p>
                </div>
              </div>

              <div className="space-y-3.5">
                <div>
                  <label className="text-[11px] font-bold text-gray-400 block mb-1">氏名</label>
                  <input 
                    type="text" 
                    value={studentName}
                    onChange={e => setStudentName(e.target.value)}
                    className={`w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 ${themeCls.ring}`}
                  />
                </div>
                
                <div>
                  <label className="text-[11px] font-bold text-gray-400 block mb-1">学籍番号 (6桁)</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      maxLength={6}
                      value={studentId}
                      onChange={e => setStudentId(e.target.value)}
                      className={`w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 ${themeCls.ring}`}
                    />
                    <Lock size={14} className="absolute left-3 top-3.5 text-gray-400" />
                  </div>
                  {studentId.trim().length === 6 ? (
                    <span className="text-[10px] font-bold text-green-600 mt-1 block flex items-center gap-1">
                      <Check size={12} strokeWidth={3} /> 学籍番号ログイン有効化中 ({getCohortName(studentId)})
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-amber-500 mt-1 block">
                      ⚠️ 正しい学籍番号(6桁)を入力してください
                    </span>
                  )}
                </div>

                {/* デジタル学生証の呼び出しボタン */}
                <button
                  onClick={() => setShowIdCardModal(true)}
                  disabled={studentId.trim().length !== 6}
                  className={`w-full py-3.5 mt-2 rounded-xl text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 transition-all ${
                    studentId.trim().length === 6 
                      ? `${themeCls.bg} ${themeCls.bgHover} active:scale-95` 
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <QrCode size={16} /> デジタル学生証を表示する 🪪
                </button>
              </div>
            </div>

            {/* 🎨 3. アプリ全体のテーマカラー設定 */}
            <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-3.5">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 ${themeCls.lightBg} rounded-2xl text-gray-700`}>
                  <Palette size={22} className={themeCls.text} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-gray-800">推し色カスタム（テーマカラー）</h3>
                  <p className="text-[11px] text-gray-400 font-medium">アプリ全体のアイコンやボタン、カードの背景色を切り替えます</p>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-2 pt-1.5">
                {(Object.keys(THEMES) as ThemeKey[]).map(key => {
                  const item = THEMES[key];
                  const isActive = theme === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setTheme(key)}
                      className={`flex flex-col items-center justify-center py-2.5 rounded-2xl border transition-all ${
                        isActive 
                          ? `border-gray-800 bg-gray-50 scale-105 shadow-sm` 
                          : 'border-gray-100 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <span className={`w-6 h-6 rounded-full block mb-1 flex items-center justify-center ${item.bg} text-white`}>
                        {isActive && <Check size={12} strokeWidth={3} />}
                      </span>
                      <span className="text-[9px] font-bold text-gray-600 uppercase">{key}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ⏰ 5. 提出物の「おせっかい通知リマインダー」 */}
            <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-gray-50 pb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 ${themeCls.lightBg} rounded-2xl text-gray-700`}>
                    <BellRing size={22} className={themeCls.text} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-gray-800">おせっかいリマインダー</h3>
                    <p className="text-[11px] text-gray-400 font-medium">出し忘れを絶対に防ぐ、うるさい自動警告設定</p>
                  </div>
                </div>
                
                {/* トグルスイッチ */}
                <button
                  onClick={() => setRemindersEnabled(!remindersEnabled)}
                  className={`w-12 h-7 rounded-full p-1 transition-colors duration-300 ${remindersEnabled ? themeCls.bg : 'bg-gray-200'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform duration-300 shadow-sm ${remindersEnabled ? 'translate-x-5' : 'translate-x-0'}`}></div>
                </button>
              </div>

              {remindersEnabled ? (
                <div className="space-y-3 pt-1 animate-in fade-in duration-200">
                  <span className="text-[10px] font-bold text-gray-400 block mb-1">通知タイミング（複数選択可）</span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'twoDaysBefore', label: '2日前の 20:00', desc: '早めの着手用' },
                      { key: 'dayBefore', label: '前日の 20:00', desc: '明日は提出日！' },
                      { key: 'morningOf', label: '当日の朝 07:00', desc: '今日忘れずに！' },
                      { key: 'threeHoursBefore', label: '期限の3時間前', desc: '最後の死守用' },
                    ].map(item => {
                      const isSelected = reminderTimes.includes(item.key);
                      return (
                        <button
                          key={item.key}
                          onClick={() => toggleReminderTime(item.key)}
                          className={`p-3 rounded-2xl text-left border transition-all flex items-start gap-2.5 ${
                            isSelected 
                              ? `border-${theme}-300 ${themeCls.lightBg} ${themeCls.text}` 
                              : 'border-gray-100 bg-gray-50/50 hover:bg-gray-50'
                          }`}
                        >
                          <span className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center border text-white ${
                            isSelected ? `${themeCls.bg} border-transparent` : 'border-gray-300 bg-white'
                          }`}>
                            {isSelected && <Check size={10} strokeWidth={3} />}
                          </span>
                          <div>
                            <p className="text-xs font-black text-gray-800 leading-none mb-1">{item.label}</p>
                            <p className="text-[9px] text-gray-400 font-medium">{item.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="py-2 text-center bg-gray-50 rounded-2xl">
                  <p className="text-xs text-gray-400 font-bold">おせっかいリマインダーは現在オフです</p>
                </div>
              )}
            </div>

            {/* お気に入り教室の設定 */}
            <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-3">
              <span className="text-sm font-bold text-gray-700 block">よく行く教室（お気に入り）</span>
              <div className="flex gap-2">
                {rooms.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setFavoriteRoomId(r.id)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border font-bold flex items-center gap-1 transition-all ${
                      favoriteRoomId === r.id 
                        ? 'bg-yellow-500 text-white border-yellow-500 shadow-sm shadow-yellow-100' 
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <Star size={12} fill={favoriteRoomId === r.id ? 'currentColor' : 'none'} />
                    {r.name.replace('教室', '')}
                  </button>
                ))}
              </div>
            </div>

            <button className="w-full py-4 text-sm font-bold text-red-500 bg-red-50 rounded-2xl hover:bg-red-100 transition-colors">
              ログアウト
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">
      
      {/* PC用サイドバー */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-100 shadow-sm z-30 relative">
        <div className="p-6">
          <h1 className="text-2xl font-black text-gray-800 tracking-tight mb-8">
            Campus<span className={themeCls.text}>Sync</span>
          </h1>
          <nav className="space-y-2">
            <SidebarItem icon={<Home size={20} />} label="ホーム" isActive={activeTab === 'home'} onClick={() => setActiveTab('home')} themeCls={themeCls} />
            <SidebarItem icon={<Utensils size={20} />} label="学食・混雑度" isActive={activeTab === 'cafeteria'} onClick={() => setActiveTab('cafeteria')} themeCls={themeCls} />
            <SidebarItem icon={<BookOpen size={20} />} label="施設情報" isActive={activeTab === 'facilities'} onClick={() => setActiveTab('facilities')} themeCls={themeCls} />
            <SidebarItem icon={<Bell size={20} />} label="通知" isActive={activeTab === 'notifications'} onClick={() => setActiveTab('notifications')} badge={2} themeCls={themeCls} />
            <SidebarItem icon={<Settings size={20} />} label="マイ設定" isActive={activeTab === 'settings'} onClick={() => setActiveTab('settings')} themeCls={themeCls} />
          </nav>
        </div>
      </aside>

      {/* メインコンテンツエリア */}
      <div className="flex-1 flex flex-col relative w-full max-w-2xl mx-auto shadow-2xl md:shadow-none bg-gray-50 md:bg-transparent">
        
        {/* スマホ用ヘッダー */}
        <header className="md:hidden flex justify-between items-center px-5 py-3.5 bg-white/80 backdrop-blur-md sticky top-0 z-20 border-b border-gray-100">
          <h1 className="text-xl font-black text-gray-800 tracking-tight">
            Campus<span className={themeCls.text}>Sync</span>
          </h1>
        </header>

        {/* スクロール領域 */}
        <main className="flex-1 overflow-y-scroll pb-24 md:pb-10 px-5 pt-5 md:pt-10">
          {renderContent()}
        </main>

        {/* スマホ用ボトムナビゲーション */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 w-full bg-white/95 backdrop-blur-md border-t border-gray-100 flex justify-around items-center h-20 pb-4 px-2 z-20">
          <NavItem icon={<Home size={24} />} label="ホーム" isActive={activeTab === 'home'} onClick={() => setActiveTab('home')} themeCls={themeCls} />
          <NavItem icon={<Utensils size={24} />} label="学食" isActive={activeTab === 'cafeteria'} onClick={() => setActiveTab('cafeteria')} themeCls={themeCls} />
          <NavItem icon={<BookOpen size={24} />} label="施設" isActive={activeTab === 'facilities'} onClick={() => setActiveTab('facilities')} themeCls={themeCls} />
          <NavItem icon={<Bell size={24} />} label="通知" isActive={activeTab === 'notifications'} onClick={() => setActiveTab('notifications')} themeCls={themeCls} />
          <NavItem icon={<Settings size={24} />} label="設定" isActive={activeTab === 'settings'} onClick={() => setActiveTab('settings')} themeCls={themeCls} />
        </nav>
      </div>

      {/* --- モーダル群 --- */}

      {/* 🪪 1. デジタル学生証 モーダル */}
      {showIdCardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/50 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-gradient-to-tr from-gray-900 via-slate-800 to-gray-900 rounded-[32px] p-6 w-full max-w-sm border border-white/10 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
            {/* ホログラム風エフェクト */}
            <div className="absolute -top-32 -left-32 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>

            {/* ヘッダー */}
            <div className="flex justify-between items-start mb-6 pb-4 border-b border-white/5">
              <div>
                <h3 className="text-white font-black text-lg tracking-wider flex items-center gap-1.5">
                  <Sparkle size={18} className="text-yellow-400 animate-spin" style={{ animationDuration: '6s' }} /> 創価高等学校
                </h3>
                <p className="text-[9px] text-white/40 tracking-widest font-semibold uppercase">Student Identity Card</p>
              </div>
              <button 
                onClick={() => setShowIdCardModal(false)} 
                className="p-1.5 bg-white/5 text-white/60 rounded-full hover:bg-white/10 hover:text-white transition-colors"
              >
                <X size={16}/>
              </button>
            </div>

            {/* カード中身 */}
            <div className="space-y-5 relative z-10">
              <div className="flex gap-4">
                {/* 顔写真（ダミーアバター） */}
                <div className="w-24 h-32 bg-slate-700 rounded-2xl flex flex-col items-center justify-center border border-white/10 text-white/30 text-xs font-bold gap-1 relative overflow-hidden shadow-inner">
                  <User size={36} className="text-white/20" />
                  <span className="text-[10px] tracking-widest">PHOTO</span>
                  {/* スキャンエフェクト */}
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-cyan-400/30 animate-pulse"></div>
                </div>

                {/* 個人情報 */}
                <div className="flex-1 flex flex-col justify-between py-1">
                  <div>
                    <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider mb-0.5">所属期生</p>
                    <p className="text-sm font-black text-white tracking-wide">{getCohortName(studentId)}</p>
                  </div>

                  <div>
                    <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider mb-0.5">氏名</p>
                    <p className="text-base font-black text-white tracking-wide">{studentName}</p>
                  </div>

                  <div>
                    <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider mb-0.5">学籍番号</p>
                    <p className="text-sm font-mono font-bold text-white tracking-widest">{studentId}</p>
                  </div>
                </div>
              </div>

              {/* バーコード部分 (模擬デザイン) */}
              <div className="bg-white rounded-2xl p-4 flex flex-col items-center gap-2 border border-white/5">
                <div className="w-full h-11 flex justify-between items-center px-1">
                  {/* CSSでバーコードをシミュレーション */}
                  {[2, 4, 1, 3, 2, 1, 4, 2, 3, 1, 2, 4, 1, 2, 3, 2, 1, 4, 2, 3, 1].map((w, index) => (
                    <div 
                      key={index} 
                      className="bg-black h-full" 
                      style={{ width: `${w * 1.5}px` }}
                    />
                  ))}
                </div>
                <p className="text-[10px] font-mono font-bold text-gray-500 tracking-[0.25em]">*{studentId}*</p>
              </div>

              <div className="text-center pt-1.5">
                <p className="text-[8px] text-white/30 font-medium">※ 本証は創価高校デジタルアプリの模擬認証システムです</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TODO詳細モーダル */}
      {selectedTodo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className={`p-6 ${selectedTodo.color.split(' ')[0]} bg-opacity-50 flex items-start gap-4`}>
              <div className="p-3 bg-white/50 rounded-2xl"><selectedTodo.icon size={28} className={selectedTodo.color.split(' ')[1]} /></div>
              <div className="flex-1 mt-1">
                <span className="text-xs font-bold bg-white/60 px-2 py-1 rounded-md mb-2 inline-block">{selectedTodo.due}</span>
                <h3 className="text-lg font-bold text-gray-900 leading-tight">{selectedTodo.title}</h3>
              </div>
            </div>
            <div className="p-6">
              <h4 className="text-xs font-bold text-gray-400 mb-2">詳細情報</h4>
              <p className="text-sm text-gray-700 leading-relaxed mb-6">{selectedTodo.details}</p>
              <button 
                onClick={() => setSelectedTodo(null)}
                className="w-full py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 改良版：エアコン報告モーダル */}
      {showTempModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-3xl w-full max-w-sm shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">エアコン状況の報告</h3>
              <button onClick={() => setShowTempModal(false)} className="p-2 bg-gray-50 rounded-full text-gray-400 hover:bg-gray-200"><X size={20}/></button>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1.5">
                  <Star size={14} className="text-yellow-500" fill="currentColor" /> よく行く場所からワンタップ選択
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {rooms.map(r => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedRoomId(r.id)}
                      className={`py-2 text-[11px] font-bold border rounded-xl transition-all truncate px-1 flex items-center justify-center gap-1 ${
                        selectedRoomId === r.id 
                          ? 'border-blue-500 bg-blue-50 text-blue-600' 
                          : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'
                      }`}
                    >
                      {favoriteRoomId === r.id && <Star size={10} fill="currentColor" className="text-yellow-400 flex-shrink-0" />}
                      {r.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 mb-1">場所 (個別指定)</label>
                <select 
                  value={selectedRoomId}
                  onChange={e => setSelectedRoomId(Number(e.target.value))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 mb-1.5 block">現在の体感</label>
                <div className="grid grid-cols-3 gap-2">
                  {['寒い', '快適', '暑い'].map(s => (
                    <button 
                      key={s} 
                      type="button"
                      onClick={() => setSelectedStatus(s)}
                      className={`py-2.5 text-sm font-bold border rounded-xl transition-all ${
                        selectedStatus === s 
                          ? 'border-teal-500 bg-teal-50 text-teal-600' 
                          : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button onClick={submitAcReport} className="w-full py-3.5 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-xl shadow-md shadow-teal-200 transition-colors">
              この状況で送信する (獲得 +10pt)
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

// --- サブコンポーネント ---

function VoteBar({ label, count, type, userVote, percent, color }: { label: string, count: number, type: string, userVote: string | null, percent: number, color: string }) {
  const isVoted = userVote === type;
  return (
    <div>
      <div className="flex justify-between text-sm font-bold mb-1.5">
        <span className="text-gray-700 flex items-center gap-1">
          {label} {isVoted && <Check size={14} className="text-blue-500"/>}
        </span>
        <span className="text-gray-500">{count + (isVoted ? 1 : 0)}人 <span className="text-gray-300 ml-1">({percent}%)</span></span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${percent}%` }}></div>
      </div>
    </div>
  )
}

function NavItem({ icon, label, isActive, onClick, themeCls }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void, themeCls: any }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center justify-center w-16 pt-2 gap-1 relative">
      <div className={`transition-all duration-200 ${isActive ? `${themeCls.text} transform -translate-y-1` : 'text-gray-400'}`}>
        {icon}
      </div>
      <span className={`text-[10px] font-bold transition-colors ${isActive ? themeCls.text : 'text-gray-400'}`}>
        {label}
      </span>
    </button>
  );
}

function SidebarItem({ icon, label, isActive, onClick, badge, themeCls }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void, badge?: number, themeCls: any }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive ? `${themeCls.lightBg} ${themeCls.text} font-bold` : 'text-gray-500 hover:bg-gray-50 font-medium'}`}>
      {icon}
      <span>{label}</span>
      {badge && <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{badge}</span>}
    </button>
  )
}