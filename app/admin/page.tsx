'use client';

import React, { useState } from 'react';
import { 
  LayoutDashboard, Megaphone, FilePlus, Package, 
  Thermometer, Check, ClipboardList, Plus, Trash2, 
  UserCheck, AlertCircle, Send, Search, Utensils,
  BookOpen, Clock, Ban, CheckCircle2, ShieldAlert,
  BellRing
} from 'lucide-react';

// === モックデータ（学生側のアプリデータと対になるもの） ===

// 1. 学生から報告されたエアコンの苦情リスト
const INITIAL_AC_REPORTS = [
  { id: 1, room: '3-C教室', issue: '激暑', count: 12, temp: '30℃', status: 'pending' },
  { id: 2, room: '2-A教室', issue: 'やや寒い', count: 4, temp: '23℃', status: 'pending' },
  { id: 3, room: '図書室', issue: '寒い', count: 1, temp: '21℃', status: 'resolved' },
];

// 2. 学食のメニュー状況（売切・混雑管理）
const INITIAL_CAFETERIA_MENU = [
  { id: 'soka', name: '創価ランチ', price: '420円', isSoldOut: false, userReports: 3 },
  { id: 'noodles', name: '特製ラーメン', price: '380円', isSoldOut: true, userReports: 0 },
  { id: 'curry', name: 'カツカレー', price: '450円', isSoldOut: false, userReports: 8 }, // 報告多数！
  { id: 'healthy', name: 'ヘルシー丼', price: '400円', isSoldOut: false, userReports: 0 },
];

// 3. 落とし物（生徒の自己報告 ➡️ 先生の承認待ちフロー）
const INITIAL_LOST_REPORTS = [
  { id: 1, title: '青いシャープペンシル', location: '図書室', finder: '1年A組 山田', status: 'pending', date: '今日 12:30' },
  { id: 2, title: '黒い折りたたみ傘', location: '食堂入口', finder: '2年B組 佐藤', status: 'approved', date: '昨日' }, // 承認され全体に公開中
  { id: 3, title: '赤い筆箱', location: '3F廊下', finder: '事務室で直接回収', status: 'returned', date: '3日前' }, // 返却完了
];

// 4. 図書室の管理（貸出遅れ・蔵書登録）
const INITIAL_LIBRARY_OVERDUES = [
  { id: 1, title: 'ハリー・ポッターと賢者の石', borrower: '2年C組 鈴木一郎', overDays: 5, notified: false },
  { id: 2, title: 'よくわかるTypeScript入門', borrower: '3年A組 高橋二郎', overDays: 12, notified: false },
];

export default function CampusSyncAdmin() {
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // 各種ステート管理
  const [acReports, setAcReports] = useState(INITIAL_AC_REPORTS);
  const [menuItems, setMenuItems] = useState(INITIAL_CAFETERIA_MENU);
  const [lostItems, setLostItems] = useState(INITIAL_LOST_REPORTS);
  const [overdues, setOverdues] = useState(INITIAL_LIBRARY_OVERDUES);

  // 蔵書管理用
  const [books, setBooks] = useState([
    { id: 1, title: '沈黙の春', author: 'レイチェル・カーソン', code: '978-4102176016', status: '貸出可能' }
  ]);
  const [newBookTitle, setNewBookTitle] = useState('');
  const [newBookAuthor, setNewBookAuthor] = useState('');

  // --- 介入アクション1: エアコンの設定温度変更（解決処理） ---
  const handleResolveAC = (id: number) => {
    setAcReports(prev => prev.map(item => 
      item.id === id ? { ...item, status: 'resolved' } : item
    ));
    alert('事務室へ温度変更リクエストを送信しました。生徒の画面に「調整完了」が反映されます！');
  };

  // --- 介入アクション2: 学食メニューの売り切れ確定 ---
  const toggleSoldOut = (id: string) => {
    setMenuItems(prev => prev.map(item => {
      if (item.id === id) {
        const nextSoldOut = !item.isSoldOut;
        return { 
          ...item, 
          isSoldOut: nextSoldOut,
          userReports: nextSoldOut ? 0 : item.userReports // 売り切れ確定したら報告数をリセット
        };
      }
      return item;
    }));
  };

  // --- 介入アクション3: 落とし物報告の承認（承認すると初めて生徒用アプリに掲載される） ---
  const handleApproveLostItem = (id: number) => {
    setLostItems(prev => prev.map(item => 
      item.id === id ? { ...item, status: 'approved' } : item
    ));
    alert('落とし物報告を承認しました。生徒用アプリの「落とし物一覧」に掲載されました！');
  };

  const handleReturnLostItem = (id: number) => {
    setLostItems(prev => prev.map(item => 
      item.id === id ? { ...item, status: 'returned' } : item
    ));
    alert('返却完了ステータスに変更しました。');
  };

  // --- 介入アクション4: 図書返却の個別催促 ---
  const handleNotifyOverdue = (id: number) => {
    setOverdues(prev => prev.map(item => 
      item.id === id ? { ...item, notified: true } : item
    ));
    alert('対象の生徒のスマートフォンへ、プッシュ催促通知を送信しました！');
  };

  // 新規書籍の追加
  const handleAddBook = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBookTitle || !newBookAuthor) return;
    const newBook = {
      id: Date.now(),
      title: newBookTitle,
      author: newBookAuthor,
      code: `978-${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      status: '貸出可能'
    };
    setBooks([newBook, ...books]);
    setNewBookTitle('');
    setNewBookAuthor('');
    alert('新しい本を蔵書データベースに登録しました！生徒アプリから検索可能になります。');
  };

  return (
    <div className="flex h-screen bg-slate-900 font-sans text-slate-100 overflow-hidden">
      
      {/* 🚀 サイドバーナビゲーション */}
      <aside className="w-64 bg-slate-950 border-r border-slate-800 p-6 flex flex-col justify-between">
        <div>
          <div className="mb-8">
            <h1 className="text-xl font-black tracking-wider text-blue-400">CampusSync <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">教職員用</span></h1>
            <p className="text-[10px] text-slate-500 font-mono mt-1">Soka High School Admin</p>
          </div>
          
          <nav className="space-y-1">
            <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}>
              <LayoutDashboard size={18} /> ダッシュボード概要
            </button>
            <button onClick={() => setActiveTab('cafeteria')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'cafeteria' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}>
              <Utensils size={18} /> 学食・売切情報の操作
            </button>
            <button onClick={() => setActiveTab('lost')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'lost' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}>
              <Package size={18} /> 落とし物「承認」管理
            </button>
            <button onClick={() => setActiveTab('library')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'library' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}>
              <BookOpen size={18} /> 図書貸出＆書籍登録
            </button>
          </nav>
        </div>
        
        <div className="border-t border-slate-800 pt-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-slate-800 rounded-full flex items-center justify-center font-bold text-sm text-blue-400">校</div>
          <div>
            <p className="text-xs font-bold">校務部 事務室窓口</p>
            <p className="text-[10px] text-slate-500">ログイン中</p>
          </div>
        </div>
      </aside>

      {/* 🚀 メインコンテンツ */}
      <main className="flex-1 bg-slate-900 p-8 overflow-y-auto">
        
        {/* ================= タブ1: ダッシュボード（リアルタイム不満・アラート） ================= */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black">校内環境リアルタイム状況</h2>
                <p className="text-sm text-slate-400">生徒用アプリから届いた報告に対して、ワンタップでエアコン調整や解決状況の更新ができます。</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* エアコン不満リアルタイムアラート */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800">
                <h3 className="text-base font-bold text-slate-300 mb-4 flex items-center gap-2">
                  <Thermometer className="text-red-400 animate-pulse" size={20} /> 生徒からのエアコン苦情一覧
                </h3>
                <div className="space-y-3">
                  {acReports.map(report => (
                    <div key={report.id} className="flex justify-between items-center p-4 bg-slate-900 border border-slate-800 rounded-xl">
                      <div>
                        <span className="text-xs font-mono text-slate-400 font-bold">{report.room}（現在目安: {report.temp}）</span>
                        <p className="text-sm font-black text-red-400 flex items-center gap-1.5 mt-0.5">
                          <AlertCircle size={14} /> 【{report.issue}】の報告多数！
                        </p>
                      </div>
                      <div className="text-right">
                        {report.status === 'pending' ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs bg-red-500/10 text-red-400 px-2.5 py-1 rounded-full font-bold">報告 {report.count}件</span>
                            <button onClick={() => handleResolveAC(report.id)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-all flex items-center gap-1">
                              <Check size={12} /> 解決済みにする
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs bg-green-500/10 text-green-400 px-2.5 py-1 rounded-full font-bold flex items-center gap-1">
                            <CheckCircle2 size={12} /> 調整指示 完了
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 混雑状況モニター */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800">
                <h3 className="text-base font-bold text-slate-300 mb-4 flex items-center gap-2">
                  <ShieldAlert className="text-yellow-400" size={20} /> クイックお知らせ・パトロール
                </h3>
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                  <p className="text-xs text-slate-400 font-bold">現在の混雑ピーク時間です。学食・売店に注意喚起の全体チャイムを鳴らしたり、お知らせを送ることができます。</p>
                  <button className="w-full py-2.5 bg-yellow-600 hover:bg-yellow-700 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-yellow-600/10">
                    <BellRing size={14} /> 「学食が混んでいます」お知らせ通知を配信
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= タブ2: 学食・売切情報の操作 ================= */}
        {activeTab === 'cafeteria' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-black">学食売切の強制管理＆承認</h2>
              <p className="text-sm text-slate-400">生徒からの「これ売り切れてる！」というアラートをチェックして、正式な売り切れマークに反映します。</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* メニューリスト */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-4">
                <h3 className="text-sm font-bold text-slate-400">本日のメニュー一覧（売切操作スイッチ）</h3>
                <div className="space-y-2">
                  {menuItems.map(item => (
                    <div key={item.id} className={`p-4 bg-slate-900 border rounded-xl flex justify-between items-center transition-all ${item.isSoldOut ? 'border-red-500/30 opacity-70' : 'border-slate-800'}`}>
                      <div>
                        <h4 className="text-sm font-bold text-white">{item.name}</h4>
                        <p className="text-xs text-slate-500 mt-0.5">価格: {item.price}</p>
                        {item.userReports > 0 && !item.isSoldOut && (
                          <span className="text-[10px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full font-bold inline-block mt-1 animate-pulse">
                            ⚠️ 生徒から {item.userReports} 件の売切報告あり！
                          </span>
                        )}
                      </div>
                      
                      <button 
                        onClick={() => toggleSoldOut(item.id)}
                        className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all ${item.isSoldOut ? 'bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}`}
                      >
                        {item.isSoldOut ? '【売切中】販売再開' : '手動で売切にする'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 生徒向け「今週のおすすめ」変更 */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-4">
                <h3 className="text-sm font-bold text-slate-400">学食からのお知らせ配信</h3>
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 font-bold block mb-1">今日・明日のおすすめポップアップ</label>
                    <input type="text" placeholder="例: 明日は大人気の『創価カツカレー』が100円引き！" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-bold text-white outline-none" />
                  </div>
                  <button className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all">
                    学食タブにバナー掲載
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= タブ3: 落とし物「承認」フロー ================= */}
        {activeTab === 'lost' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-black">落とし物・忘れ物のモデレーション（承認・返却）</h2>
              <p className="text-sm text-slate-400">いたずら投稿を防ぐため、生徒がスマホから「これ拾いました」と投稿したものは、事務室で実物確認後に承認ボタンを押して初めて全体公開されます。</p>
            </div>

            <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800">
              <div className="space-y-3">
                {lostItems.map(item => (
                  <div key={item.id} className={`p-4 bg-slate-900 border rounded-xl flex justify-between items-center transition-all ${item.status === 'returned' ? 'border-slate-800/40 opacity-40' : 'border-slate-800'}`}>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-slate-400">【発見場所】{item.location}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400 animate-pulse' : item.status === 'approved' ? 'bg-blue-500/10 text-blue-400' : 'bg-green-500/10 text-green-400'}`}>
                          {item.status === 'pending' ? '⚠️ 事務室未確認（未公開）' : item.status === 'approved' ? '✅ 全体公開中（お預かり中）' : '🎉 本人返却済'}
                        </span>
                      </div>
                      <h4 className="text-base font-bold text-white">{item.title}</h4>
                      <p className="text-xs text-slate-500 mt-1">報告者: {item.finder} | 発見日時: {item.date}</p>
                    </div>

                    <div className="flex gap-2">
                      {item.status === 'pending' && (
                        <button onClick={() => handleApproveLostItem(item.id)} className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1">
                          実物確認して全体公開する
                        </button>
                      )}
                      {item.status === 'approved' && (
                        <button onClick={() => handleReturnLostItem(item.id)} className="px-3.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1">
                          本人に返却したので完了にする
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= タブ4: 図書貸出＆書籍登録 ================= */}
        {activeTab === 'library' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-black">図書管理システム（蔵書＆催促）</h2>
              <p className="text-sm text-slate-400">図書室の蔵書データへの追加、および返却期限が切れた生徒へダイレクトに「通知」を飛ばせます。</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 返却期限遅れ（生徒への自動・手動プッシュ督促） */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-4">
                <h3 className="text-base font-bold text-slate-300 flex items-center gap-1.5">
                  <Clock className="text-red-400" size={18} /> 返却遅れ生徒一覧
                </h3>
                <div className="space-y-3">
                  {overdues.map(item => (
                    <div key={item.id} className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex justify-between items-center">
                      <div>
                        <h4 className="text-xs font-mono text-slate-400 font-bold">{item.borrower}</h4>
                        <p className="text-sm font-bold text-white mt-0.5">『{item.title}』</p>
                        <p className="text-xs text-red-400 font-bold mt-1">超過日数: {item.overDays}日</p>
                      </div>
                      
                      <button 
                        onClick={() => handleNotifyOverdue(item.id)}
                        disabled={item.notified}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${item.notified ? 'bg-slate-800 text-slate-500' : 'bg-red-600 hover:bg-red-700 text-white'}`}
                      >
                        <Megaphone size={12} /> {item.notified ? '催促通知 済' : 'スマホへ催促'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 図書室 新しい本の登録 */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-4">
                <h3 className="text-base font-bold text-slate-300 flex items-center gap-1.5">
                  <BookOpen className="text-blue-400" size={18} /> 新規蔵書の追加登録
                </h3>
                
                <form onSubmit={handleAddBook} className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 font-bold block mb-1">本・資料のタイトル</label>
                    <input type="text" required value={newBookTitle} onChange={e => setNewBookTitle(e.target.value)} placeholder="例: 学力の経済学" className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 font-bold block mb-1">著者 / 発行所</label>
                    <input type="text" required value={newBookAuthor} onChange={e => setNewBookAuthor(e.target.value)} placeholder="例: 中室牧子" className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-blue-500" />
                  </div>
                  <button type="submit" className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5">
                    <Plus size={14} /> 図書室の蔵書としてデータベースに登録
                  </button>
                </form>

                <div className="border-t border-slate-800 pt-4">
                  <h4 className="text-xs font-bold text-slate-400 mb-2">最近登録された本</h4>
                  <div className="space-y-1.5">
                    {books.map(b => (
                      <div key={b.id} className="p-2 bg-slate-900 rounded-lg text-xs flex justify-between">
                        <span>『{b.title}』({b.author})</span>
                        <span className="text-[10px] text-blue-400">{b.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}