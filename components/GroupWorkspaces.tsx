'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import WorkspacePlanning from './WorkspacePlanning';
import {
  Users, Plus, Search, RefreshCw, Check, X, Copy, ShieldCheck, Crown, UserPlus,
  MessageCircle, Megaphone, FolderOpen, Home, Download, Upload, Send, Reply,
  Heart, ThumbsUp, Laugh, CheckCircle2, Pin, Trash2, Pencil, CalendarDays,
  ClipboardList, FileText, Paperclip, ArrowLeft, Clock3, UserRound, AlertCircle,
} from 'lucide-react';

type Workspace = {
  id: string;
  name: string;
  category: string;
  description: string;
  visibility: 'listed' | 'unlisted';
  join_mode: 'invite_only' | 'approval' | 'open';
  is_official: boolean;
  member_count: number;
  my_role: string | null;
  request_status: string | null;
};
type Member = { id: string; user_id: string; student_id: string; display_name: string; user_class: string; member_role: string; joined_at: string };
type JoinRequest = { id: string; user_id: string; student_id: string; display_name: string; user_class: string; message: string; requested_at: string };
type Reaction = { reaction: string; count: number; mine: boolean };
type ChatMessage = { id:string; body:string; sender_user_id:string; sender_name:string; sender_class:string; reply_to_id:string|null; edited_at:string|null; created_at:string; is_mine:boolean; reactions:Reaction[] };
type WorkspacePost = { id:string; title:string; body:string; is_pinned:boolean; author_user_id:string; author_name:string; created_at:string; updated_at:string; is_mine?:boolean };
type WorkspaceFile = { id:string; file_name:string; mime_type:string; file_size:number; folder_path:string; description:string; uploaded_by:string; uploader_name:string; created_at:string; is_mine:boolean };
type Overview = {
  counts:{members:number;posts:number;messages:number;files:number;openTasks:number;upcomingEvents:number};
  recentPosts:WorkspacePost[];
  recentMessages:{id:string;body:string;sender_name:string;created_at:string}[];
  recentFiles:WorkspaceFile[];
  upcomingEvents:{id:string;title:string;starts_at:string;ends_at:string|null;location:string}[];
  openTasks:{id:string;title:string;status:string;priority:string;due_at:string|null}[];
};
type Panel = 'home'|'calendar'|'tasks'|'minutes'|'chat'|'posts'|'files'|'members';
const CATEGORY: Record<string,string> = {
  club:'部活動',committee:'委員会',event:'学校行事',project:'プロジェクト',
  study:'勉強会',research:'研究',volunteer:'自主活動',other:'その他',
};
const ROLE: Record<string,string> = { owner:'オーナー',admin:'管理者',editor:'編集者',member:'メンバー',adviser:'顧問・担当教員' };
const JOIN: Record<string,string> = { invite_only:'招待制',approval:'申請・承認制',open:'自由参加' };
const REACTION_LABEL:Record<string,{label:string;emoji:string}> = {
  like:{label:'いいね',emoji:'👍'},heart:{label:'ハート',emoji:'❤️'},laugh:{label:'笑',emoji:'😂'},
  surprised:{label:'びっくり',emoji:'😮'},check:{label:'確認',emoji:'✅'},
};

function formatDate(value:string) {
  return new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
}
function formatSize(bytes:number) {
  if(bytes<1024) return bytes+' B';
  if(bytes<1024*1024) return (bytes/1024).toFixed(0)+' KB';
  return (bytes/(1024*1024)).toFixed(1)+' MB';
}
function panelClass(dark:boolean) {
  return dark?'border-slate-700 bg-slate-800 text-white':'border-slate-200 bg-white text-slate-900';
}

async function uploadWorkspaceFileResumable(
  file: File,
  storagePath: string,
  signature: string,
  contentType: string,
  onProgress: (percent: number) => void,
) {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!projectUrl || !publishableKey) throw new Error('Supabaseの公開設定が不足しています。');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('学校アカウントでログインしてください。');

  const base = new URL(projectUrl);
  if (base.hostname.endsWith('.supabase.co')) {
    base.hostname = base.hostname.replace(/\.supabase\.co$/, '.storage.supabase.co');
  }
  const endpoint = new URL('/storage/v1/upload/resumable', base).toString();
  const encodeMetadata = (value: string) => btoa(unescape(encodeURIComponent(value)));
  const metadata = [
    ['bucketName', 'workspace-files'],
    ['objectName', storagePath],
    ['contentType', contentType],
    ['cacheControl', '60'],
  ].map(([key, value]) => key + ' ' + encodeMetadata(value)).join(',');

  const createResponse = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Tus-Resumable': '1.0.0',
      'Upload-Length': String(file.size),
      'Upload-Metadata': metadata,
      'x-signature': signature,
      apikey: publishableKey,
      Authorization: 'Bearer ' + accessToken,
    },
  });
  if (!createResponse.ok) {
    const detail = await createResponse.text().catch(() => '');
    throw new Error(detail || 'アップロードを開始できませんでした。');
  }
  const location = createResponse.headers.get('Location');
  if (!location) throw new Error('アップロード先URLを取得できませんでした。');
  const uploadUrl = new URL(location, endpoint).toString();

  const chunkSize = 6 * 1024 * 1024;
  let offset = 0;
  onProgress(0);
  while (offset < file.size) {
    const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
    const response = await fetch(uploadUrl, {
      method: 'PATCH',
      headers: {
        'Tus-Resumable': '1.0.0',
        'Upload-Offset': String(offset),
        'Content-Type': 'application/offset+octet-stream',
        apikey: publishableKey,
        Authorization: 'Bearer ' + accessToken,
      },
      body: chunk,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(detail || 'ファイルの転送中にエラーが発生しました。');
    }
    const nextOffset = Number(response.headers.get('Upload-Offset'));
    if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset || nextOffset > file.size) {
      throw new Error('アップロードの進捗を確認できませんでした。');
    }
    offset = nextOffset;
    onProgress(Math.min(100, Math.round((offset / file.size) * 100)));
  }
}

export default function GroupWorkspaces({ isDarkMode=false }: { isDarkMode?:boolean }) {
  const [workspaces,setWorkspaces]=useState<Workspace[]>([]);
  const [selected,setSelected]=useState<Workspace|null>(null);
  const [members,setMembers]=useState<Member[]>([]);
  const [requests,setRequests]=useState<JoinRequest[]>([]);
  const [role,setRole]=useState('');
  const [panel,setPanel]=useState<Panel>('home');
  const [overview,setOverview]=useState<Overview|null>(null);
  const [posts,setPosts]=useState<WorkspacePost[]>([]);
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [files,setFiles]=useState<WorkspaceFile[]>([]);
  const [loading,setLoading]=useState(true);
  const [panelLoading,setPanelLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  const [search,setSearch]=useState('');
  const [categoryFilter,setCategoryFilter]=useState('all');
  const [showCreate,setShowCreate]=useState(false);
  const [form,setForm]=useState({name:'',description:'',category:'club',visibility:'listed',join_mode:'approval'});
  const [inviteId,setInviteId]=useState('');
  const [inviteCode,setInviteCode]=useState('');
  const [cardCodes,setCardCodes]=useState<Record<string,string>>({});
  const [issuedCode,setIssuedCode]=useState<{id:string;code:string;expiresAt:string}|null>(null);
  const [chatText,setChatText]=useState('');
  const [replyTo,setReplyTo]=useState<ChatMessage|null>(null);
  const [editingMessage,setEditingMessage]=useState<{id:string;body:string}|null>(null);
  const [postForm,setPostForm]=useState({title:'',body:''});
  const [editingPost,setEditingPost]=useState<{id:string;title:string;body:string}|null>(null);
  const [uploadFile,setUploadFile]=useState<File|null>(null);
  const [folderPath,setFolderPath]=useState('');
  const [fileDescription,setFileDescription]=useState('');
  const [fileSearch,setFileSearch]=useState('');
  const [showUpload,setShowUpload]=useState(false);
  const [uploadProgress,setUploadProgress]=useState(0);

  const dark=isDarkMode;
  const panelStyle=panelClass(dark);
  const muted=dark?'text-slate-400':'text-slate-500';
  const field=dark?'border-slate-600 bg-slate-900 text-white placeholder:text-slate-500':'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400';
  const buttonOutline=dark?'border-slate-600 hover:bg-slate-700':'border-slate-300 hover:bg-slate-50';

  const api=useCallback(async(path:string,method='GET',body?:unknown)=>{
    const {data,error}=await supabase.auth.getSession();
    if(error) throw error;
    const token=data.session?.access_token;
    if(!token) throw new Error('学校アカウントでログインしてください。');
    const isForm=typeof FormData!=='undefined'&&body instanceof FormData;
    const response=await fetch(path,{
      method,
      headers:{Authorization:'Bearer '+token,...(body&&!isForm?{'Content-Type':'application/json'}:{})},
      body:body?(isForm?body:JSON.stringify(body)):undefined,
      cache:'no-store',
    });
    const result=await response.json().catch(()=>null);
    if(!response.ok||!result?.success) throw new Error(result?.message||'処理に失敗しました。');
    return result;
  },[]);

  const load=async()=>{
    setLoading(true);
    try{
      const result=await api('/api/workspaces');
      setWorkspaces(result.workspaces||[]);
      setMessage('');
    }catch(error){
      setMessage(error instanceof Error?error.message:'一覧を取得できませんでした。');
    }finally{setLoading(false);}
  };

  const loadOverview=async(id:string,quiet=false)=>{
    if(!quiet) setPanelLoading(true);
    try{
      const result=await api('/api/workspaces/'+id+'/overview');
      setOverview({...result,counts:result.counts});
    }catch(error){
      if(!quiet) setMessage(error instanceof Error?error.message:'ホーム情報を取得できませんでした。');
    }finally{if(!quiet)setPanelLoading(false);}
  };

  const loadMembers=async(workspace:Workspace)=>{
    const result=await api('/api/workspaces/'+workspace.id+'/members');
    setMembers(result.members||[]);
    setRequests(result.requests||[]);
    setRole(result.role||'');
  };

  const loadPosts=async(id:string)=>{
    const result=await api('/api/workspaces/'+id+'/posts');
    setPosts(result.posts||[]);
  };
  const loadChat=async(id:string,quiet=false)=>{
    try{
      const result=await api('/api/workspaces/'+id+'/chat');
      setMessages(result.messages||[]);
    }catch(error){
      if(!quiet)setMessage(error instanceof Error?error.message:'チャットを取得できませんでした。');
    }
  };
  const loadFiles=async(id:string)=>{
    const result=await api('/api/workspaces/'+id+'/files');
    setFiles(result.files||[]);
  };

  useEffect(()=>{void load();},[]);
  useEffect(()=>{
    if(!selected||panel!=='chat') return;
    let active=true;
    const refresh=async()=>{
      try{
        const result=await api('/api/workspaces/'+selected.id+'/chat');
        if(active)setMessages(result.messages||[]);
      }catch(error){
        if(active)setMessage(error instanceof Error?error.message:'チャットを更新できませんでした。');
      }
    };
    void refresh();
    const timer=window.setInterval(()=>void refresh(),5000);
    return()=>{active=false;window.clearInterval(timer);};
  },[selected?.id,panel]);

  useEffect(()=>{
    if(!selected||panel!=='posts') return;
    let active=true;
    setPanelLoading(true);
    void api('/api/workspaces/'+selected.id+'/posts')
      .then((result)=>{if(active)setPosts(result.posts||[]);})
      .catch((error)=>{if(active)setMessage(error instanceof Error?error.message:'投稿を取得できませんでした。');})
      .finally(()=>{if(active)setPanelLoading(false);});
    return()=>{active=false;};
  },[selected?.id,panel]);

  useEffect(()=>{
    if(!selected||panel!=='files') return;
    let active=true;
    setPanelLoading(true);
    void api('/api/workspaces/'+selected.id+'/files')
      .then((result)=>{if(active)setFiles(result.files||[]);})
      .catch((error)=>{if(active)setMessage(error instanceof Error?error.message:'ファイルを取得できませんでした。');})
      .finally(()=>{if(active)setPanelLoading(false);});
    return()=>{active=false;};
  },[selected?.id,panel]);

  const openWorkspace=async(workspace:Workspace)=>{
    setSelected(workspace);
    setPanel('home');
    setOverview(null);
    setIssuedCode(null);
    setMessage('');
    setPanelLoading(true);
    try{
      await Promise.all([loadMembers(workspace),loadOverview(workspace.id,true)]);
    }catch(error){
      setMessage(error instanceof Error?error.message:'ワークスペースを開けませんでした。');
    }finally{setPanelLoading(false);}
  };

  const createWorkspace=async(event:React.FormEvent)=>{
    event.preventDefault();setSaving(true);setMessage('');
    try{
      await api('/api/workspaces','POST',form);
      setForm({name:'',description:'',category:'club',visibility:'listed',join_mode:'approval'});
      setShowCreate(false);await load();
      setMessage('共有ワークスペースを作成しました。');
    }catch(error){setMessage(error instanceof Error?error.message:'作成できませんでした。');}
    finally{setSaving(false);}
  };

  const joinWorkspace=async(workspace:Workspace,code='')=>{
    setSaving(true);setMessage('');
    try{
      const result=await api('/api/workspaces/'+workspace.id+'/join','POST',{invite_code:code});
      setCardCodes((previous)=>({...previous,[workspace.id]:''}));
      await load();
      if(result.state==='joined'||result.state==='already_member') await openWorkspace(workspace);
      setMessage(result.message||'参加処理を完了しました。');
    }catch(error){setMessage(error instanceof Error?error.message:'参加できませんでした。');}
    finally{setSaving(false);}
  };

  const joinWithInvite=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(!/^[0-9a-f-]{36}$/i.test(inviteId.trim())){setMessage('グループIDは正しい形式で入力してください。');return;}
    setSaving(true);
    try{
      const result=await api('/api/workspaces/'+inviteId.trim()+'/join','POST',{invite_code:inviteCode});
      setInviteCode('');await load();setMessage(result.message||'招待コードを確認しました。');
    }catch(error){setMessage(error instanceof Error?error.message:'招待コードを利用できませんでした。');}
    finally{setSaving(false);}
  };

  const leaveWorkspace=async()=>{
    if(!selected||role==='owner')return;
    if(!window.confirm(selected.name+'から退出しますか？'))return;
    setSaving(true);
    try{
      await api('/api/workspaces/'+selected.id+'/members','PATCH',{action:'leave_workspace'});
      setSelected(null);setMembers([]);setRequests([]);setRole('');setOverview(null);
      await load();setMessage('グループから退出しました。');
    }catch(error){setMessage(error instanceof Error?error.message:'退出できませんでした。');}
    finally{setSaving(false);}
  };

  const createInvite=async()=>{
    if(!selected)return;setSaving(true);
    try{
      const result=await api('/api/workspaces/'+selected.id+'/members','POST',{expires_in_hours:168,max_uses:5});
      setIssuedCode({id:selected.id,code:result.invite.code,expiresAt:result.invite.expires_at});
      setMessage('招待コードを発行しました。コードはこの画面を閉じると再表示できません。');
    }catch(error){setMessage(error instanceof Error?error.message:'招待コードを発行できませんでした。');}
    finally{setSaving(false);}
  };

  const memberAction=async(body:Record<string,unknown>,successMessage:string)=>{
    if(!selected)return;setSaving(true);
    try{
      await api('/api/workspaces/'+selected.id+'/members','PATCH',body);
      await loadMembers(selected);await load();setMessage(successMessage);
    }catch(error){setMessage(error instanceof Error?error.message:'メンバー管理を更新できませんでした。');}
    finally{setSaving(false);}
  };

  const sendMessage=async(event:React.FormEvent)=>{
    event.preventDefault();if(!selected||!chatText.trim())return;
    setSaving(true);
    try{
      await api('/api/workspaces/'+selected.id+'/chat','POST',{body:chatText,reply_to_id:replyTo?.id||null});
      setChatText('');setReplyTo(null);await loadChat(selected.id,true);
    }catch(error){setMessage(error instanceof Error?error.message:'送信できませんでした。');}
    finally{setSaving(false);}
  };

  const reactToMessage=async(messageId:string,reaction:string)=>{
    if(!selected)return;
    try{
      await api('/api/workspaces/'+selected.id+'/chat','POST',{action:'react',message_id:messageId,reaction});
      await loadChat(selected.id,true);
    }catch(error){setMessage(error instanceof Error?error.message:'リアクションを登録できませんでした。');}
  };

  const saveMessageEdit=async(event:React.FormEvent)=>{
    event.preventDefault();if(!selected||!editingMessage)return;
    setSaving(true);
    try{
      await api('/api/workspaces/'+selected.id+'/chat','PATCH',editingMessage);
      setEditingMessage(null);await loadChat(selected.id,true);
    }catch(error){setMessage(error instanceof Error?error.message:'編集できませんでした。');}
    finally{setSaving(false);}
  };

  const deleteMessage=async(id:string)=>{
    if(!selected||!window.confirm('このメッセージを削除しますか？'))return;
    setSaving(true);
    try{await api('/api/workspaces/'+selected.id+'/chat','DELETE',{id});await loadChat(selected.id,true);}
    catch(error){setMessage(error instanceof Error?error.message:'削除できませんでした。');}
    finally{setSaving(false);}
  };

  const createPost=async(event:React.FormEvent)=>{
    event.preventDefault();if(!selected)return;setSaving(true);
    try{
      await api('/api/workspaces/'+selected.id+'/posts','POST',postForm);
      setPostForm({title:'',body:''});await loadPosts(selected.id);await loadOverview(selected.id,true);
      setMessage('お知らせを投稿しました。');
    }catch(error){setMessage(error instanceof Error?error.message:'投稿できませんでした。');}
    finally{setSaving(false);}
  };

  const savePostEdit=async(event:React.FormEvent)=>{
    event.preventDefault();if(!selected||!editingPost)return;setSaving(true);
    try{
      await api('/api/workspaces/'+selected.id+'/posts','PATCH',{...editingPost,action:'edit'});
      setEditingPost(null);await loadPosts(selected.id);await loadOverview(selected.id,true);
      setMessage('お知らせを更新しました。');
    }catch(error){setMessage(error instanceof Error?error.message:'更新できませんでした。');}
    finally{setSaving(false);}
  };

  const togglePin=async(post:WorkspacePost)=>{
    if(!selected)return;setSaving(true);
    try{
      await api('/api/workspaces/'+selected.id+'/posts','PATCH',{id:post.id,action:'pin',value:!post.is_pinned});
      await loadPosts(selected.id);await loadOverview(selected.id,true);
    }catch(error){setMessage(error instanceof Error?error.message:'ピン留めを変更できませんでした。');}
    finally{setSaving(false);}
  };

  const deletePost=async(post:WorkspacePost)=>{
    if(!selected||!window.confirm('「'+post.title+'」を削除しますか？'))return;setSaving(true);
    try{
      await api('/api/workspaces/'+selected.id+'/posts','DELETE',{id:post.id});
      await loadPosts(selected.id);await loadOverview(selected.id,true);
      setMessage('お知らせを削除しました。');
    }catch(error){setMessage(error instanceof Error?error.message:'削除できませんでした。');}
    finally{setSaving(false);}
  };

  const upload=async(event:React.FormEvent)=>{
    event.preventDefault();if(!selected||!uploadFile)return;setSaving(true);setUploadProgress(0);
    try{
      const prepared=await api('/api/workspaces/'+selected.id+'/files','POST',{
        action:'prepare_upload',file_name:uploadFile.name,file_size:uploadFile.size,mime_type:uploadFile.type,
        folder_path:folderPath,description:fileDescription,
      });
      await uploadWorkspaceFileResumable(uploadFile,prepared.path,prepared.token,prepared.mime_type,setUploadProgress);
      await api('/api/workspaces/'+selected.id+'/files','POST',{
        action:'complete_upload',storage_path:prepared.path,file_name:prepared.file_name,file_size:prepared.file_size,
        folder_path:prepared.folder_path,description:prepared.description,
      });
      setUploadFile(null);setFolderPath('');setFileDescription('');setShowUpload(false);setUploadProgress(0);
      await loadFiles(selected.id);await loadOverview(selected.id,true);setMessage('ファイルをアップロードしました。');
    }catch(error){setMessage(error instanceof Error?error.message:'アップロードできませんでした。');}
    finally{setSaving(false);}
  };

  const downloadFile=async(file:WorkspaceFile)=>{
    if(!selected)return;
    const popup=window.open('about:blank','_blank');
    if(popup)popup.opener=null;
    try{
      const result=await api('/api/workspaces/'+selected.id+'/files?download='+encodeURIComponent(file.id));
      if(popup) popup.location.href=result.url;
      else window.location.assign(result.url);
    }catch(error){
      popup?.close();
      setMessage(error instanceof Error?error.message:'ダウンロードできませんでした。');
    }
  };

  const deleteFile=async(file:WorkspaceFile)=>{
    if(!selected||!window.confirm('「'+file.file_name+'」を削除しますか？'))return;setSaving(true);
    try{
      await api('/api/workspaces/'+selected.id+'/files','DELETE',{id:file.id});
      await loadFiles(selected.id);await loadOverview(selected.id,true);setMessage('ファイルを削除しました。');
    }catch(error){setMessage(error instanceof Error?error.message:'削除できませんでした。');}
    finally{setSaving(false);}
  };

  const filtered=workspaces.filter((workspace)=>{
    const matchesSearch=!search||(workspace.name+' '+workspace.description).toLowerCase().includes(search.toLowerCase());
    const matchesCategory=categoryFilter==='all'||workspace.category===categoryFilter;
    return matchesSearch&&matchesCategory;
  });
  const myWorkspaces=filtered.filter((workspace)=>workspace.my_role);
  const discoverable=filtered.filter((workspace)=>!workspace.my_role&&workspace.visibility==='listed');
  const manager=['owner','admin','editor'].includes(role);
  const fileList=files.filter((file)=>!fileSearch||(file.file_name+' '+file.description+' '+file.folder_path).toLowerCase().includes(fileSearch.toLowerCase()));
  const tabs:{id:Panel;label:string;icon:React.ReactNode}[]=[
    {id:'home',label:'ホーム',icon:<Home size={16}/>},
    {id:'calendar',label:'カレンダー',icon:<CalendarDays size={16}/>},
    {id:'tasks',label:'タスク',icon:<ClipboardList size={16}/>},
    {id:'minutes',label:'議事録',icon:<FileText size={16}/>},
    {id:'chat',label:'チャット',icon:<MessageCircle size={16}/>},
    {id:'posts',label:'お知らせ',icon:<Megaphone size={16}/>},
    {id:'files',label:'ファイル',icon:<FolderOpen size={16}/>},
    {id:'members',label:'メンバー',icon:<Users size={16}/>},
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-8">
      {!selected&&<>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><Users className="text-cyan-500" size={24}/><h1 className="text-2xl font-black">共有ワークスペース</h1></div>
            <p className={'mt-1 text-sm '+muted}>部活・委員会・行事・プロジェクトなど、校内のあらゆるグループの活動拠点です。</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={()=>void load()} disabled={loading} className={'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold '+field}><RefreshCw size={15}/>更新</button>
            <button type="button" onClick={()=>setShowCreate((value)=>!value)} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-xs font-black text-white hover:bg-cyan-700"><Plus size={16}/>グループ作成</button>
          </div>
        </header>

        <section className={'rounded-2xl border p-4 '+panelStyle}>
          <div className="mb-3 flex items-center gap-2"><Search size={17} className="text-cyan-500"/><h2 className="font-black">グループを探す</h2></div>
          <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
            <input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="グループ名・説明で検索" className={'w-full rounded-xl border px-3 py-2.5 text-sm '+field}/>
            <select value={categoryFilter} onChange={(event)=>setCategoryFilter(event.target.value)} className={'rounded-xl border px-3 py-2.5 text-sm '+field}>
              <option value="all">すべての種類</option>{Object.entries(CATEGORY).map(([id,label])=><option key={id} value={id}>{label}</option>)}
            </select>
          </div>
          <form onSubmit={joinWithInvite} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input value={inviteId} onChange={(event)=>setInviteId(event.target.value)} placeholder="招待されたグループID" className={'min-w-0 rounded-xl border px-3 py-2.5 text-xs '+field}/>
            <input value={inviteCode} onChange={(event)=>setInviteCode(event.target.value.toUpperCase())} placeholder="招待コード" className={'min-w-0 rounded-xl border px-3 py-2.5 font-mono text-xs '+field}/>
            <button type="submit" disabled={saving} className="rounded-xl bg-slate-700 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">招待で参加</button>
          </form>
        </section>

        {showCreate&&<section className={'rounded-2xl border p-4 sm:p-5 '+panelStyle}>
          <h2 className="font-black">新しいグループを作成</h2>
          <form onSubmit={createWorkspace} className="mt-4 space-y-3">
            <label className="block text-xs font-bold">グループ名<input required minLength={2} maxLength={60} value={form.name} onChange={(event)=>setForm((current)=>({...current,name:event.target.value}))} placeholder="例：文化祭実行委員会" className={'mt-1.5 w-full rounded-xl border px-3 py-3 text-sm '+field}/></label>
            <label className="block text-xs font-bold">活動内容・説明<textarea maxLength={800} rows={3} value={form.description} onChange={(event)=>setForm((current)=>({...current,description:event.target.value}))} placeholder="目的や活動内容を入力" className={'mt-1.5 w-full rounded-xl border px-3 py-3 text-sm '+field}/></label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-bold">種類<select value={form.category} onChange={(event)=>setForm((current)=>({...current,category:event.target.value}))} className={'mt-1.5 w-full rounded-xl border px-3 py-3 text-sm '+field}>{Object.entries(CATEGORY).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
              <label className="text-xs font-bold">参加方法<select value={form.join_mode} onChange={(event)=>setForm((current)=>({...current,join_mode:event.target.value}))} className={'mt-1.5 w-full rounded-xl border px-3 py-3 text-sm '+field}><option value="approval">申請・承認制</option><option value="invite_only">招待制</option><option value="open">自由参加</option></select></label>
              <label className="text-xs font-bold">一覧への表示<select value={form.visibility} onChange={(event)=>setForm((current)=>({...current,visibility:event.target.value}))} className={'mt-1.5 w-full rounded-xl border px-3 py-3 text-sm '+field}><option value="listed">一覧に表示</option><option value="unlisted">非公開（招待制）</option></select></label>
            </div>
            <p className={'text-xs leading-5 '+muted}>最初に作成した人がオーナーになります。学校公認の表示は教職員用管理画面でのみ認定できます。</p>
            <div className="flex justify-end gap-2"><button type="button" onClick={()=>setShowCreate(false)} className={'rounded-xl border px-4 py-2 text-xs font-bold '+buttonOutline}>キャンセル</button><button type="submit" disabled={saving} className="rounded-xl bg-cyan-600 px-5 py-2 text-xs font-black text-white disabled:opacity-50">{saving?'作成中…':'作成する'}</button></div>
          </form>
        </section>}

        {message&&<p role="status" className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm">{message}</p>}
        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="font-black">参加中のグループ</h2><span className={'text-xs '+muted}>{myWorkspaces.length}件</span></div>
          {loading?<p className={'py-8 text-center text-sm '+muted}>読み込み中…</p>:myWorkspaces.length===0?<div className={'rounded-2xl border p-8 text-center '+panelStyle}><Users className="mx-auto text-slate-400" size={28}/><p className="mt-2 font-bold">まだ参加しているグループはありません。</p><p className={'mt-1 text-xs '+muted}>一覧から探すか、新しいグループを作成できます。</p></div>:<div className="grid gap-3 sm:grid-cols-2">{myWorkspaces.map((workspace)=><article key={workspace.id} className={'rounded-2xl border p-4 '+panelStyle}>
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words font-black">{workspace.name}</h3><p className={'mt-1 text-xs '+muted}>{CATEGORY[workspace.category]} ・ {JOIN[workspace.join_mode]} ・ {workspace.member_count}人</p></div>{workspace.is_official&&<ShieldCheck size={18} className="shrink-0 text-emerald-500"/>}</div>
            <p className={'mt-2 line-clamp-2 text-xs leading-5 '+muted}>{workspace.description||'説明はまだありません。'}</p>
            <button type="button" onClick={()=>void openWorkspace(workspace)} className="mt-4 w-full rounded-xl bg-cyan-600 px-3 py-2.5 text-xs font-black text-white">ワークスペースを開く</button>
          </article>)}</div>}
        </section>
        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="font-black">参加できるグループ</h2><span className={'text-xs '+muted}>{discoverable.length}件</span></div>
          {discoverable.length===0?<div className={'rounded-2xl border p-6 text-center text-xs '+panelStyle+' '+muted}>表示できるグループはありません。</div>:<div className="grid gap-3 sm:grid-cols-2">{discoverable.map((workspace)=><article key={workspace.id} className={'rounded-2xl border p-4 '+panelStyle}>
            <div className="flex items-center justify-between gap-2"><h3 className="font-black">{workspace.name}</h3>{workspace.is_official&&<span className="text-[10px] font-black text-emerald-500">学校公認</span>}</div>
            <p className={'mt-1 text-xs '+muted}>{CATEGORY[workspace.category]} ・ {JOIN[workspace.join_mode]} ・ {workspace.member_count}人</p>
            <p className={'mt-2 line-clamp-2 text-xs leading-5 '+muted}>{workspace.description||'説明はまだありません。'}</p>
            {workspace.request_status==='pending'?<p className="mt-3 rounded-lg bg-amber-500/10 p-2 text-center text-xs font-bold text-amber-600">参加申請中</p>:workspace.join_mode==='invite_only'?<div className="mt-3 flex gap-2"><input value={cardCodes[workspace.id]||''} onChange={(event)=>setCardCodes((current)=>({...current,[workspace.id]:event.target.value.toUpperCase()}))} placeholder="招待コード" className={'min-w-0 flex-1 rounded-lg border px-2 py-2 font-mono text-xs '+field}/><button type="button" onClick={()=>void joinWorkspace(workspace,cardCodes[workspace.id]||'')} disabled={saving||!(cardCodes[workspace.id]||'').trim()} className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">参加</button></div>:<button type="button" onClick={()=>void joinWorkspace(workspace)} disabled={saving} className="mt-3 w-full rounded-xl bg-cyan-600 px-3 py-2.5 text-xs font-black text-white disabled:opacity-50">{workspace.join_mode==='open'?'参加する':'参加を申請する'}</button>}
          </article>)}</div>}
        </section>
        <p className={'text-[10px] leading-5 '+muted}>グループの投稿・チャット・ファイルはメンバーだけが閲覧できます。LINEグループへの自動配信は行いません。</p>
      </>}

      {selected&&<section className={'overflow-hidden rounded-2xl border '+panelStyle}>
        <div className={dark?'border-b border-slate-700 bg-slate-900/60 p-4 sm:p-5':'border-b border-slate-200 bg-slate-50 p-4 sm:p-5'}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <button type="button" onClick={()=>{setSelected(null);setOverview(null);setMessages([]);setPosts([]);setFiles([]);setPanel('home');}} className={'mb-2 inline-flex items-center gap-1 text-xs font-bold '+muted}><ArrowLeft size={14}/>グループ一覧へ戻る</button>
              <div className="flex flex-wrap items-center gap-2"><h1 className="break-words text-xl font-black sm:text-2xl">{selected.name}</h1>{selected.is_official&&<span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black text-emerald-500"><ShieldCheck size={13}/>学校公認</span>}</div>
              <p className={'mt-1 text-xs '+muted}>{CATEGORY[selected.category]||'その他'} ・ {ROLE[role]||'メンバー'} ・ {members.length||selected.member_count}人</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {['owner','admin'].includes(role)&&<button type="button" onClick={()=>void createInvite()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-xs font-black text-white"><UserPlus size={15}/>招待</button>}
              {role&&role!=='owner'&&<button type="button" onClick={()=>void leaveWorkspace()} disabled={saving} className="rounded-xl border border-rose-500/40 px-3 py-2 text-xs font-bold text-rose-500">退出する</button>}
            </div>
          </div>
          {issuedCode?.id===selected.id&&<div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3"><p className="text-xs font-bold text-emerald-500">招待コード（この場で一度だけ表示）</p><div className="mt-2 flex flex-wrap items-center gap-2"><code className="break-all rounded-lg bg-black/10 px-3 py-2 font-mono text-sm">{issuedCode.code}</code><button type="button" onClick={()=>void navigator.clipboard.writeText(issuedCode.code)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold"><Copy size={14}/>コピー</button></div><p className={'mt-2 text-[10px] '+muted}>有効期限：{new Date(issuedCode.expiresAt).toLocaleString('ja-JP')} ・ 最大5回</p></div>}
        </div>
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-500/10 p-2" aria-label="ワークスペースメニュー">
          {tabs.map((item)=><button key={item.id} type="button" onClick={()=>{setPanel(item.id);setMessage('');}} className={'inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black transition-colors '+(panel===item.id?'bg-cyan-600 text-white':dark?'text-slate-300 hover:bg-slate-700':'text-slate-600 hover:bg-slate-100')}>{item.icon}{item.label}</button>)}
        </nav>

        <div className="p-4 sm:p-5">
          {message&&<p role="status" className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm">{message}</p>}
          {panelLoading&&<p className={'py-5 text-center text-xs '+muted}>読み込み中…</p>}

          {panel==='home'&&!panelLoading&&<div className="space-y-5">
            {overview&&<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[['メンバー',overview.counts.members,Users],['投稿',overview.counts.posts,Megaphone],['メッセージ',overview.counts.messages,MessageCircle],['ファイル',overview.counts.files,FolderOpen],['未完了タスク',overview.counts.openTasks,ClipboardList],['今後の予定',overview.counts.upcomingEvents,CalendarDays]].map(([label,value,Icon])=>{
                const IconComp=Icon as React.ComponentType<{size?:number;className?:string}>;
                return <div key={String(label)} className={'rounded-xl border p-3 '+(dark?'border-slate-700 bg-slate-900/50':'border-slate-200 bg-slate-50')}><IconComp size={16} className="text-cyan-500"/><p className={'mt-2 text-[10px] '+muted}>{String(label)}</p><p className="mt-0.5 text-xl font-black tabular-nums">{String(value)}</p></div>;
              })}
            </div>}
            <div className="grid gap-4 lg:grid-cols-2">
              <section className={'rounded-2xl border p-4 '+(dark?'border-slate-700':'border-slate-200')}>
                <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 font-black"><Megaphone size={17} className="text-cyan-500"/>重要・最近のお知らせ</h2><button type="button" onClick={()=>setPanel('posts')} className="text-xs font-bold text-cyan-500">すべて見る</button></div>
                {overview?.recentPosts.length?<div className="space-y-3">{overview.recentPosts.map((post)=><article key={post.id} className="border-b border-slate-500/10 pb-3 last:border-0 last:pb-0"><div className="flex items-center gap-2">{post.is_pinned&&<Pin size={13} className="text-amber-500"/>}<h3 className="text-sm font-bold">{post.title}</h3></div><p className={'mt-1 line-clamp-2 whitespace-pre-wrap text-xs leading-5 '+muted}>{post.body}</p><p className={'mt-1 text-[10px] '+muted}>{post.author_name} ・ {formatDate(post.created_at)}</p></article>)}</div>:<p className={'py-5 text-center text-xs '+muted}>まだお知らせはありません。</p>}
              </section>
              <section className={'rounded-2xl border p-4 '+(dark?'border-slate-700':'border-slate-200')}>
                <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 font-black"><MessageCircle size={17} className="text-cyan-500"/>最近のチャット</h2><button type="button" onClick={()=>setPanel('chat')} className="text-xs font-bold text-cyan-500">チャットを開く</button></div>
                {overview?.recentMessages.length?<div className="space-y-3">{overview.recentMessages.map((item)=><div key={item.id} className="border-b border-slate-500/10 pb-3 last:border-0 last:pb-0"><p className="text-sm"><span className="font-bold">{item.sender_name}</span><span className={'ml-2 text-[10px] '+muted}>{formatDate(item.created_at)}</span></p><p className={'mt-1 line-clamp-2 whitespace-pre-wrap text-xs '+muted}>{item.body}</p></div>)}</div>:<p className={'py-5 text-center text-xs '+muted}>まだメッセージはありません。</p>}
              </section>
              <section className={'rounded-2xl border p-4 '+(dark?'border-slate-700':'border-slate-200')}>
                <h2 className="mb-3 flex items-center gap-2 font-black"><CalendarDays size={17} className="text-cyan-500"/>今後の予定</h2>
                {overview?.upcomingEvents.length?<div className="space-y-3">{overview.upcomingEvents.map((event)=><div key={event.id} className="flex gap-3"><div className="min-w-12 rounded-xl bg-cyan-500/10 px-2 py-2 text-center"><p className="text-[10px] font-bold text-cyan-500">{new Date(event.starts_at).toLocaleDateString('ja-JP',{month:'numeric',day:'numeric'})}</p><p className="text-xs font-black text-cyan-500">{new Date(event.starts_at).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}</p></div><div><p className="text-sm font-bold">{event.title}</p>{event.location&&<p className={'mt-1 text-xs '+muted}>{event.location}</p>}</div></div>)}</div>:<p className={'py-4 text-xs '+muted}>予定はまだ登録されていません。</p>}
              </section>
              <section className={'rounded-2xl border p-4 '+(dark?'border-slate-700':'border-slate-200')}>
                <h2 className="mb-3 flex items-center gap-2 font-black"><FolderOpen size={17} className="text-cyan-500"/>新しいファイル</h2>
                {overview?.recentFiles.length?<div className="space-y-3">{overview.recentFiles.map((file)=><div key={file.id} className="flex items-center gap-3"><FileText size={18} className="shrink-0 text-cyan-500"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{file.file_name}</p><p className={'text-[10px] '+muted}>{file.uploader_name} ・ {formatSize(file.file_size)}</p></div></div>)}</div>:<p className={'py-4 text-xs '+muted}>ファイルはまだありません。</p>}<button type="button" onClick={()=>setPanel('files')} className="mt-3 text-xs font-bold text-cyan-500">ファイルを開く</button>
              </section>
            </div>
            {overview?.openTasks.length?<section className={'rounded-2xl border p-4 '+(dark?'border-slate-700':'border-slate-200')}><h2 className="mb-3 flex items-center gap-2 font-black"><ClipboardList size={17} className="text-cyan-500"/>進行中のタスク</h2><div className="grid gap-2 sm:grid-cols-2">{overview.openTasks.map((task)=><div key={task.id} className={'rounded-xl border p-3 '+(dark?'border-slate-700':'border-slate-200')}><p className="text-sm font-bold">{task.title}</p><p className={'mt-1 text-[10px] '+muted}>{task.status==='todo'?'未着手':task.status==='in_progress'?'進行中':'確認待ち'}{task.due_at?' ・ 期限 '+formatDate(task.due_at):''}</p></div>)}</div></section>:null}
          </div>}

          {(panel==='calendar'||panel==='tasks'||panel==='minutes')&&selected&&<WorkspacePlanning workspaceId={selected.id} role={role} members={members} activePanel={panel as 'calendar'|'tasks'|'minutes'} isDarkMode={dark} api={api}/>}

          {panel==='chat'&&<div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="flex items-center gap-2 font-black"><MessageCircle size={18} className="text-cyan-500"/>グループチャット</h2><p className={'mt-1 text-[10px] '+muted}>5秒ごとに新しいメッセージを確認します。</p></div><button type="button" onClick={()=>selected&&void loadChat(selected.id)} className={'rounded-lg border px-3 py-2 text-xs font-bold '+buttonOutline}><RefreshCw size={14} className="mr-1 inline"/>更新</button></div>
            <div className={'min-h-72 space-y-3 rounded-2xl border p-3 sm:p-4 '+(dark?'border-slate-700 bg-slate-900/40':'border-slate-200 bg-slate-50')}>
              {messages.length===0?<div className="grid min-h-64 place-items-center"><div className="text-center"><MessageCircle size={28} className="mx-auto text-slate-400"/><p className={'mt-2 text-sm font-bold '+muted}>まだメッセージはありません</p><p className={'mt-1 text-xs '+muted}>最初のメッセージを送ってみましょう。</p></div></div>:messages.map((item)=>(
                <article key={item.id} className={'max-w-[94%] rounded-2xl border p-3 sm:max-w-[82%] '+(item.is_mine?(dark?'ml-auto border-cyan-800 bg-cyan-950/50':'ml-auto border-cyan-200 bg-cyan-50'):(dark?'border-slate-700 bg-slate-800':'border-slate-200 bg-white'))}>
                  <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-black">{item.sender_name}</span>{item.sender_class&&<span className={'text-[10px] '+muted}>{item.sender_class}組</span>}<span className={'text-[10px] '+muted}>{formatDate(item.created_at)}{item.edited_at?' ・編集済み':''}</span></div>
                  {item.reply_to_id&&<p className={'mt-1 text-[10px] '+muted}>返信メッセージ</p>}
                  {editingMessage?.id===item.id?<form onSubmit={saveMessageEdit} className="mt-2 space-y-2"><textarea value={editingMessage.body} onChange={(event)=>setEditingMessage((current)=>current?{...current,body:event.target.value}:null)} rows={3} maxLength={5000} className={'w-full rounded-lg border p-2 text-sm '+field}/><div className="flex justify-end gap-2"><button type="button" onClick={()=>setEditingMessage(null)} className={'rounded-lg border px-3 py-1.5 text-xs '+buttonOutline}>取消</button><button type="submit" disabled={saving} className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-bold text-white">保存</button></div></form>:<p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{item.body}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {item.reactions.map((reaction)=><button key={reaction.reaction} type="button" onClick={()=>void reactToMessage(item.id,reaction.reaction)} className={'rounded-full border px-2 py-1 text-[10px] '+(reaction.mine?'border-cyan-500 bg-cyan-500/10':'border-slate-500/20')} title={REACTION_LABEL[reaction.reaction]?.label}>{REACTION_LABEL[reaction.reaction]?.emoji} {reaction.count}</button>)}
                    {(['like','heart','laugh','check'] as const).map((reaction)=>!item.reactions.some((itemReaction)=>itemReaction.reaction===reaction)?<button key={reaction} type="button" onClick={()=>void reactToMessage(item.id,reaction)} className={'rounded-full border px-2 py-1 text-[10px] '+buttonOutline} title={REACTION_LABEL[reaction].label}>{REACTION_LABEL[reaction].emoji}</button>:null)}
                    <button type="button" onClick={()=>setReplyTo(item)} className={'ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] '+muted}><Reply size={12}/>返信</button>
                    {item.is_mine&&editingMessage?.id!==item.id&&<button type="button" onClick={()=>setEditingMessage({id:item.id,body:item.body})} className={'rounded-lg px-2 py-1 text-[10px] '+muted}><Pencil size={12}/></button>}
                    {(item.is_mine||['owner','admin'].includes(role))&&<button type="button" onClick={()=>void deleteMessage(item.id)} disabled={saving} className="rounded-lg px-2 py-1 text-[10px] text-rose-500"><Trash2 size={12}/></button>}
                  </div>
                </article>
              ))}
            </div>
            <form onSubmit={sendMessage} className={'rounded-2xl border p-3 '+panelStyle}>
              {replyTo&&<div className="mb-2 flex items-start justify-between gap-2 rounded-lg bg-cyan-500/10 p-2"><div className="min-w-0"><p className="text-[10px] font-bold text-cyan-500">{replyTo.sender_name}への返信</p><p className={'truncate text-xs '+muted}>{replyTo.body}</p></div><button type="button" onClick={()=>setReplyTo(null)} aria-label="返信を解除"><X size={15}/></button></div>}
              <div className="flex items-end gap-2"><textarea value={chatText} onChange={(event)=>setChatText(event.target.value)} rows={2} maxLength={5000} placeholder="メッセージを入力…" className={'min-h-12 flex-1 resize-y rounded-xl border px-3 py-2.5 text-sm '+field}/><button type="submit" disabled={saving||!chatText.trim()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-cyan-600 px-4 text-xs font-black text-white disabled:opacity-50"><Send size={15}/>送信</button></div><p className={'mt-1 text-right text-[10px] '+muted}>{chatText.length}/5000</p>
            </form>
          </div>}

          {panel==='posts'&&<div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="flex items-center gap-2 font-black"><Megaphone size={18} className="text-cyan-500"/>お知らせ・投稿</h2><p className={'mt-1 text-[10px] '+muted}>グループ内の連絡事項や重要なお知らせを共有できます。</p></div><button type="button" onClick={()=>selected&&void loadPosts(selected.id)} className={'rounded-lg border px-3 py-2 text-xs font-bold '+buttonOutline}><RefreshCw size={14} className="mr-1 inline"/>更新</button></div>
            {manager&&<form onSubmit={createPost} className={'space-y-3 rounded-2xl border p-4 '+panelStyle}><h3 className="font-black">お知らせを投稿</h3><input required maxLength={160} value={postForm.title} onChange={(event)=>setPostForm((current)=>({...current,title:event.target.value}))} placeholder="タイトル" className={'w-full rounded-xl border px-3 py-2.5 text-sm '+field}/><textarea rows={4} maxLength={10000} value={postForm.body} onChange={(event)=>setPostForm((current)=>({...current,body:event.target.value}))} placeholder="本文を入力" className={'w-full rounded-xl border px-3 py-2.5 text-sm '+field}/><div className="flex justify-end"><button type="submit" disabled={saving||!postForm.title.trim()} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"><Megaphone size={15}/>投稿する</button></div></form>}
            {editingPost&&<form onSubmit={savePostEdit} className={'space-y-3 rounded-2xl border p-4 '+panelStyle}><h3 className="font-black">投稿を編集</h3><input required maxLength={160} value={editingPost.title} onChange={(event)=>setEditingPost((current)=>current?{...current,title:event.target.value}:null)} className={'w-full rounded-xl border px-3 py-2.5 text-sm '+field}/><textarea rows={4} maxLength={10000} value={editingPost.body} onChange={(event)=>setEditingPost((current)=>current?{...current,body:event.target.value}:null)} className={'w-full rounded-xl border px-3 py-2.5 text-sm '+field}/><div className="flex justify-end gap-2"><button type="button" onClick={()=>setEditingPost(null)} className={'rounded-xl border px-3 py-2 text-xs '+buttonOutline}>取消</button><button type="submit" disabled={saving} className="rounded-xl bg-cyan-600 px-4 py-2 text-xs font-bold text-white">保存</button></div></form>}
            {posts.length===0?<div className={'rounded-2xl border p-8 text-center '+panelStyle}><Megaphone size={26} className="mx-auto text-slate-400"/><p className={'mt-2 text-sm font-bold '+muted}>まだ投稿はありません。</p></div>:<div className="space-y-3">{posts.map((post)=><article key={post.id} className={'rounded-2xl border p-4 '+panelStyle}>
              <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2">{post.is_pinned&&<span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-black text-amber-500"><Pin size={11}/>重要</span>}<h3 className="break-words text-base font-black">{post.title}</h3></div><p className={'mt-1 text-[10px] '+muted}>{post.author_name} ・ {formatDate(post.created_at)}{post.updated_at!==post.created_at?' ・編集済み':''}</p></div>
                <div className="flex items-center gap-1">{['owner','admin'].includes(role)&&<button type="button" onClick={()=>void togglePin(post)} className={'rounded-lg border p-2 '+buttonOutline} title={post.is_pinned?'ピン留め解除':'ピン留め'}><Pin size={14} className={post.is_pinned?'text-amber-500':''}/></button>}{(post.is_mine||['owner','admin','editor'].includes(role))&&<button type="button" onClick={()=>setEditingPost({id:post.id,title:post.title,body:post.body})} className={'rounded-lg border p-2 '+buttonOutline} title="編集"><Pencil size={14}/></button>}{(post.is_mine||['owner','admin','editor'].includes(role))&&<button type="button" onClick={()=>void deletePost(post)} className="rounded-lg border border-rose-500/30 p-2 text-rose-500" title="削除"><Trash2 size={14}/></button>}</div>
              </div><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{post.body}</p>
            </article>)}</div>}
          </div>}

          {panel==='files'&&<div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="flex items-center gap-2 font-black"><FolderOpen size={18} className="text-cyan-500"/>ファイル共有</h2><p className={'mt-1 text-[10px] '+muted}>PDF・画像・Office文書などを共有できます。1ファイル20MBまで。</p></div><button type="button" onClick={()=>setShowUpload((value)=>!value)} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-xs font-black text-white"><Upload size={15}/>アップロード</button></div>
            {showUpload&&<form onSubmit={upload} className={'space-y-3 rounded-2xl border p-4 '+panelStyle}>
              <h3 className="font-black">ファイルを追加</h3>
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.pptx,.txt,.csv" onChange={(event)=>setUploadFile(event.target.files?.[0]||null)} className="block w-full text-xs"/>
              {uploadFile&&<p className={'text-xs '+muted}>{uploadFile.name} ・ {formatSize(uploadFile.size)}</p>}
              {saving&&showUpload&&<div className="space-y-1"><div className="h-2 overflow-hidden rounded-full bg-slate-500/20"><div className="h-full rounded-full bg-cyan-500 transition-all" style={{width:uploadProgress+'%'}}/></div><p className={'text-right text-[10px] '+muted}>{uploadProgress}%</p></div>}
              <label className="block text-xs font-bold">フォルダ（任意）<input value={folderPath} onChange={(event)=>setFolderPath(event.target.value)} placeholder="例：会議資料/11月" maxLength={500} className={'mt-1 w-full rounded-xl border px-3 py-2.5 text-sm '+field}/></label>
              <label className="block text-xs font-bold">説明（任意）<input value={fileDescription} onChange={(event)=>setFileDescription(event.target.value)} maxLength={1000} placeholder="ファイルの内容" className={'mt-1 w-full rounded-xl border px-3 py-2.5 text-sm '+field}/></label>
              <div className="flex justify-end gap-2"><button type="button" onClick={()=>{setShowUpload(false);setUploadFile(null);}} className={'rounded-xl border px-3 py-2 text-xs '+buttonOutline}>取消</button><button type="submit" disabled={saving||!uploadFile} className="rounded-xl bg-cyan-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{saving?'アップロード中…':'アップロード'}</button></div>
            </form>}
            <input value={fileSearch} onChange={(event)=>setFileSearch(event.target.value)} placeholder="ファイル名・フォルダ・説明を検索" className={'w-full rounded-xl border px-3 py-2.5 text-sm '+field}/>
            {fileList.length===0?<div className={'rounded-2xl border p-8 text-center '+panelStyle}><FolderOpen size={26} className="mx-auto text-slate-400"/><p className={'mt-2 text-sm font-bold '+muted}>{files.length?'検索結果がありません':'まだファイルはありません。'}</p></div>:<div className="space-y-2">{fileList.map((file)=><article key={file.id} className={'flex flex-wrap items-center gap-3 rounded-xl border p-3 '+(dark?'border-slate-700':'border-slate-200')}>
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-500/10 text-cyan-500"><FileText size={19}/></div><div className="min-w-0 flex-1"><p className="break-words text-sm font-bold">{file.file_name}</p><p className={'mt-0.5 text-[10px] '+muted}>{file.folder_path||'ルート'} ・ {formatSize(Number(file.file_size))} ・ {file.uploader_name} ・ {formatDate(file.created_at)}</p>{file.description&&<p className={'mt-1 text-xs '+muted}>{file.description}</p>}</div><div className="flex gap-2"><button type="button" onClick={()=>void downloadFile(file)} className={'inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold '+buttonOutline}><Download size={14}/>開く</button>{(file.is_mine||['owner','admin','editor'].includes(role))&&<button type="button" onClick={()=>void deleteFile(file)} disabled={saving} className="rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-bold text-rose-500"><Trash2 size={14}/></button>}</div>
            </article>)}</div>}
          </div>}

          {panel==='members'&&<div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="flex items-center gap-2 font-black"><Users size={18} className="text-cyan-500"/>メンバー管理</h2><p className={'mt-1 text-[10px] '+muted}>グループ内の役割・参加申請を管理できます。</p></div>{['owner','admin'].includes(role)&&<button type="button" onClick={()=>void createInvite()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-xs font-black text-white"><UserPlus size={15}/>招待コードを発行</button>}</div>
            {requests.length>0&&<section className={'rounded-2xl border p-4 '+panelStyle}><h3 className="font-black">参加申請 <span className="text-cyan-500">{requests.length}</span></h3><div className="mt-3 space-y-2">{requests.map((item)=><div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-500/10 p-3"><div><p className="text-sm font-bold">{item.display_name}（{item.user_class}組）</p>{item.message&&<p className={'mt-1 text-xs '+muted}>{item.message}</p>}</div><div className="flex gap-2"><button type="button" disabled={saving} onClick={()=>void memberAction({action:'approve_request',request_id:item.id},'参加申請を承認しました。')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><Check size={14} className="mr-1 inline"/>承認</button><button type="button" disabled={saving} onClick={()=>void memberAction({action:'reject_request',request_id:item.id},'参加申請を却下しました。')} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white"><X size={14} className="mr-1 inline"/>却下</button></div></div>)}</div></section>}
            <section className={'rounded-2xl border p-4 '+panelStyle}><h3 className="font-black">メンバー <span className={'text-xs '+muted}>{members.length}人</span></h3><div className="mt-2 divide-y divide-slate-500/10">{members.map((member)=><div key={member.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div className="flex min-w-0 items-center gap-2"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-xs font-black text-cyan-500">{member.display_name.slice(0,1)}</span><div className="min-w-0"><p className="truncate text-sm font-bold">{member.display_name}{member.member_role==='owner'?<Crown size={12} className="ml-1 inline"/>:null}</p><p className={'text-[10px] '+muted}>{member.user_class}組 ・ {ROLE[member.member_role]||member.member_role}</p></div></div><div className="flex items-center gap-2">{role==='owner'&&member.member_role!=='owner'&&<><select aria-label={member.display_name+'の権限'} value={member.member_role} onChange={(event)=>void memberAction({action:'change_role',user_id:member.user_id,member_role:event.target.value},'メンバー権限を変更しました。')} className={'rounded-lg border px-2 py-1.5 text-[10px] '+field}><option value="member">メンバー</option><option value="editor">編集者</option><option value="admin">管理者</option></select><button type="button" disabled={saving} onClick={()=>{if(window.confirm(member.display_name+'さんにオーナーを引き継ぎますか？'))void memberAction({action:'transfer_owner',user_id:member.user_id},'オーナーを引き継ぎました。');}} className={'rounded-lg border px-2 py-1.5 text-[10px] font-bold '+buttonOutline}>引き継ぐ</button></>}{['owner','admin'].includes(role)&&member.member_role!=='owner'&&<button type="button" disabled={saving} onClick={()=>{if(window.confirm(member.display_name+'さんを退出させますか？'))void memberAction({action:'remove_member',user_id:member.user_id},'メンバーを退出させました。');}} className="rounded-lg border border-rose-500/30 px-2 py-1.5 text-[10px] font-bold text-rose-500">退出</button>}</div></div>)}</div></section>
          </div>}
        </div>
      </section>}
      <p className={'text-[10px] leading-5 '+muted}>チャットは5秒ごとに更新されます。投稿・チャット・ファイルはグループメンバーだけが閲覧でき、LINEグループへの自動配信は行いません。</p>
    </div>
  );
}
