'use client';

import React, { useState } from 'react';
import { 
  Home, Utensils, BookOpen, Settings, Bell, CheckCircle, 
  Clock, FileText, Monitor, Wind, ThermometerSun, 
  ThermometerSnowflake, Search, Info, Users, Check
} from 'lucide-react';

// --- モックデータ ---

const MOCK_TODOS = [
  { id: 1, title: '数学演習プリント P20-21', source: '紙プリント', type: 'paper', due: '本日中', color: 'bg-red-100 text-red-700', icon: FileText },
  { id: 2, title: '英語エッセイ ドラフト提出', source: 'Classroom', type: 'classroom', due: '明日まで', color: 'bg-orange-100 text-orange-700', icon: Monitor },
  { id: 3, title: '文化祭 参加希望アンケート', source: '生徒会', type: 'other', due: '金曜まで', color: 'bg-blue-100 text-blue-700', icon: Info },
];

const MOCK_COMFORTS = [
  { id: 1, room: '3F 2-A教室', status: '快適', temp: '25℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 2, room: '図書室', status: 'やや寒い', temp: '23℃', icon: Wind, color: 'text-cyan-500', bg: 'bg-cyan-50' },
  { id: 3, room: '体育館', status: '激暑', temp: '32℃', icon: ThermometerSun, color: 'text-red-500', bg: 'bg-red-50' },
  { id: 4, room: '食堂', status: '快適', temp: '26℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
];

const MOCK_MENUS = [
  { id: 1, name: '定番カツカレー', price: 450, votes: 42, percent: 35 },
  { id: 2, name: '日替わりA (唐揚げ定食)', price: 500, votes: 30, percent: 25 },
  { id: 3, name: '醤油ラーメン', price: 350, votes: 20, percent: 17 },
  { id: 4, name: 'きつねうどん', price: 300, votes: 15, percent: 13 },
  { id: 5, name: '温玉サラダボウル', price: 250, votes: 12, percent: 10 },
];

// --- メインコンポーネント ---

export default function CampusSyncApp() {
  const [activeTab, setActiveTab] = useState('home');
  const [votedMenuId, setVotedMenuId] = useState<number | null>(null);
  const [crowdStatus, setCrowdStatus] = useState('normal');

  // タブごとのコンテンツを描画する関数
  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* ゲーミフィケーション要素 */}
            <div className="bg-gradient-to-br from-blue-500 to-teal-400 rounded-2xl p-5 shadow-md text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white opacity-10 rounded-full blur-2xl"></div>
              <div className="flex justify-between items-end mb-2 relative z-10">
                <div>
                  <h2 className="text-sm font-medium text-white/90 mb-1">今日の学校貢献度</h2>
                  <p className="text-3xl font-bold tracking-tight">42 <span className="text-base font-normal text-white/80">/ 100 pt</span></p>
                </div>
                <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">
                  <CheckCircle size={24} className="text-white" />
                </div>
              </div>
              <div className="h-2 bg-black/10 rounded-full overflow-hidden mt-4 relative z-10">
                <div className="h-full bg-white rounded-full transition-all duration-1000 ease-out" style={{ width: '42%' }}></div>
              </div>
            </div>

            {/* TODOセクション */}
            <section>
              <h3 className="text-[17px] font-bold text-gray-800 mb-3 flex items-center">
                <Clock size={20} className="mr-2 text-blue-600"/> 提出物・連絡
              </h3>
              <div className="space-y-3">
                {MOCK_TODOS.map(todo => (
                  <div key={todo.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-start gap-3">
                    <div className={`p-2 rounded-xl bg-gray-50 text-gray-500`}>
                      <todo.icon size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${todo.color}`}>
                          {todo.due}
                        </span>
                        <span className="text-[11px] text-gray-400 font-medium">{todo.source}</span>
                      </div>
                      <h4 className="text-sm font-bold text-gray-800 truncate">{todo.title}</h4>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 快適度セクション */}
            <section>
              <h3 className="text-[17px] font-bold text-gray-800 mb-3 flex items-center">
                <Wind size={20} className="mr-2 text-teal-500"/> 校内の快適度
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {MOCK_COMFORTS.map(comfort => (
                  <div key={comfort.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start mb-2">
                      <comfort.icon size={20} className={comfort.color} />
                      <span className="text-xs font-bold text-gray-400">{comfort.temp}</span>
                    </div>
                    <h4 className="text-xs text-gray-500 mb-0.5">{comfort.room}</h4>
                    <p className={`text-sm font-bold ${comfort.color}`}>{comfort.status}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        );

      case 'cafeteria':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* 混雑度セクション */}
            <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-[17px] font-bold text-gray-800 flex items-center">
                  <Users size={20} className="mr-2 text-orange-500"/> 現在の混雑度
                </h3>
                <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                  10分前のデータ
                </span>
              </div>
              
              <div className="flex items-end gap-5 mb-6">
                <div>
                  <div className="text-xs font-medium text-gray-400 mb-1">ステータス</div>
                  <div className="text-3xl font-black text-orange-500 tracking-tight">普通 <span className="text-lg font-bold text-orange-400">60%</span></div>
                </div>
                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden mb-1.5">
                  <div className="h-full bg-gradient-to-r from-green-400 via-orange-400 to-red-500" style={{ width: '60%' }}></div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button 
                  onClick={() => setCrowdStatus('empty')}
                  className={`py-2.5 text-sm font-bold rounded-xl border transition-all ${crowdStatus === 'empty' ? 'border-green-500 bg-green-50 text-green-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                >
                  空き
                </button>
                <button 
                  onClick={() => setCrowdStatus('normal')}
                  className={`py-2.5 text-sm font-bold rounded-xl border transition-all ${crowdStatus === 'normal' ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                >
                  普通
                </button>
                <button 
                  onClick={() => setCrowdStatus('crowded')}
                  className={`py-2.5 text-sm font-bold rounded-xl border transition-all ${crowdStatus === 'crowded' ? 'border-red-500 bg-red-50 text-red-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                >
                  激混み
                </button>
              </div>
            </section>

            {/* メニューセクション */}
            <section>
              <h3 className="text-[17px] font-bold text-gray-800 mb-3 flex items-center">
                <Utensils size={20} className="mr-2 text-blue-600"/> 今日のメニュー＆投票
              </h3>
              <div className="space-y-3">
                {MOCK_MENUS.map(menu => (
                  <div key={menu.id} className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex gap-3.5 relative overflow-hidden">
                    {/* ダミー画像エリア */}
                    <div className="w-24 h-24 bg-gray-100 rounded-xl flex-shrink-0 flex items-center justify-center border border-gray-200">
                      <Utensils size={24} className="text-gray-300" />
                    </div>
                    
                    <div className="flex-1 flex flex-col justify-between py-0.5 pr-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-gray-800 text-sm leading-tight mb-1">{menu.name}</h4>
                          <p className="text-blue-600 font-bold text-sm">¥{menu.price}</p>
                        </div>
                        <button 
                          onClick={() => setVotedMenuId(menu.id)}
                          className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${votedMenuId === menu.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400 hover:bg-blue-50 hover:text-blue-600'}`}
                        >
                          <Check size={16} strokeWidth={votedMenuId === menu.id ? 3 : 2} />
                        </button>
                      </div>
                      
                      <div className="mt-2">
                        <div className="flex justify-between text-[11px] font-medium text-gray-500 mb-1.5">
                          <span>{menu.votes + (votedMenuId === menu.id ? 1 : 0)}人が投票</span>
                          <span className="text-blue-600">{menu.percent}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-blue-500 rounded-full transition-all duration-500" 
                            style={{ width: `${menu.percent + (votedMenuId === menu.id ? 2 : 0)}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        );

      case 'facilities':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* 図書館セクション */}
            <section>
              <h3 className="text-[17px] font-bold text-gray-800 mb-3 flex items-center">
                <BookOpen size={20} className="mr-2 text-indigo-600"/> 図書館
              </h3>
              
              <div className="relative mb-6">
                <input 
                  type="text" 
                  placeholder="本の発行元やタイトルを入力..." 
                  className="w-full bg-white border border-gray-200 rounded-2xl py-3.5 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-sm transition-all placeholder:text-gray-400"
                />
                <Search size={18} className="absolute left-4 top-4 text-gray-400" />
              </div>

              <h4 className="text-sm font-bold text-gray-700 mb-3">新着・おすすめ図書</h4>
              {/* カスタムスクロールバー非表示クラス適用 */}
              <div className="flex gap-4 overflow-x-auto pb-4 snap-x [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="min-w-[130px] snap-start cursor-pointer group">
                    <div className="h-40 bg-gray-100 border border-gray-200 rounded-xl mb-2.5 flex items-center justify-center text-gray-300 text-xs shadow-sm group-hover:shadow-md transition-shadow">
                      Cover
                    </div>
                    <h5 className="text-xs font-bold text-gray-800 line-clamp-2 leading-snug group-hover:text-indigo-600 transition-colors">
                      デザイン思考が世界を変える {i}
                    </h5>
                    <p className="text-[10px] font-medium text-gray-400 mt-1">日経BP</p>
                  </div>
                ))}
              </div>
            </section>

            {/* 自習室セクション */}
            <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-[17px] font-bold text-gray-800 flex items-center">
                  <Monitor size={20} className="mr-2 text-teal-600"/> 自習室 (キャリアセンター)
                </h3>
                <button className="text-gray-400 hover:text-teal-600 transition-colors">
                  <Info size={18} />
                </button>
              </div>
              
              <div className="flex items-end justify-between mb-2">
                <span className="text-sm font-bold text-gray-500">現在の利用状況</span>
                <span className="text-2xl font-black text-gray-800">18 <span className="text-sm font-bold text-gray-400">/ 30席</span></span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-4">
                <div className="h-full bg-teal-500 rounded-full" style={{ width: `${(18 / 30) * 100}%` }}></div>
              </div>
              
              <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 flex items-start gap-2.5">
                <Info size={16} className="text-gray-400 mt-0.5 flex-shrink-0"/>
                <p className="text-xs font-medium text-gray-500 leading-relaxed">
                  利用前にカウンターでの受付が必要です。<br/>室内での私語・飲食はご遠慮ください。
                </p>
              </div>
            </section>
          </div>
        );

      case 'settings':
        return (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 animate-in fade-in">
            <Settings size={48} className="mb-4 opacity-50" />
            <p className="font-medium">設定画面のモックアップ</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    // モバイル端末サイズを想定したコンテナ（PCブラウザで見てもスマホサイズで中央寄せになる設定）
    <div className="flex flex-col h-screen bg-gray-50 max-w-md mx-auto shadow-2xl relative overflow-hidden font-sans">
      
      {/* ヘッダー */}
      <header className="flex justify-between items-center px-5 py-3.5 bg-white/80 backdrop-blur-md sticky top-0 z-20 border-b border-gray-100">
        <h1 className="text-xl font-black text-gray-800 tracking-tight">
          Campus<span className="text-blue-600">Sync</span>
        </h1>
        <button className="relative p-2 bg-gray-50 rounded-full text-gray-600 hover:bg-gray-100 transition-colors">
          <Bell size={20} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white box-content"></span>
        </button>
      </header>

      {/* メインコンテンツ（スクロール領域） */}
      <main className="flex-1 overflow-y-auto pb-28 px-5 pt-5">
        {renderContent()}
      </main>

      {/* ボトムナビゲーション */}
      <nav className="absolute bottom-0 w-full bg-white border-t border-gray-100 flex justify-around items-center h-20 pb-4 px-2 z-20">
        <NavItem 
          icon={<Home size={24} />} 
          label="ホーム" 
          isActive={activeTab === 'home'} 
          onClick={() => setActiveTab('home')} 
        />
        <NavItem 
          icon={<Utensils size={24} />} 
          label="学食" 
          isActive={activeTab === 'cafeteria'} 
          onClick={() => setActiveTab('cafeteria')} 
        />
        <NavItem 
          icon={<BookOpen size={24} />} 
          label="施設" 
          isActive={activeTab === 'facilities'} 
          onClick={() => setActiveTab('facilities')} 
        />
        <NavItem 
          icon={<Settings size={24} />} 
          label="設定" 
          isActive={activeTab === 'settings'} 
          onClick={() => setActiveTab('settings')} 
        />
      </nav>

    </div>
  );
}

// ボトムナビゲーション用のアイテムコンポーネント
function NavItem({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick} 
      className="flex flex-col items-center justify-center w-16 pt-2 gap-1"
    >
      <div className={`transition-all duration-200 ${isActive ? 'text-blue-600 transform -translate-y-1' : 'text-gray-400'}`}>
        {icon}
      </div>
      <span className={`text-[10px] font-bold transition-colors ${isActive ? 'text-blue-600' : 'text-gray-400'}`}>
        {label}
      </span>
    </button>
  );
}