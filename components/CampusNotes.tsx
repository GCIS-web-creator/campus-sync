'use client';

import React, { FormEvent, PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive, ArrowLeft, ArrowRight, Bold, BookOpen, CheckSquare, ChevronDown, Clock3, Code2, Download,
  FileImage, FilePlus2, FileText, Folder, FolderPlus, Highlighter, ImagePlus,
  Italic, Link2, List, ListOrdered, Loader2, MessageCircle, Paperclip, PenLine,
  Plus, Printer, Quote, Redo2, Search, Send, Share2, ShieldCheck, Sigma, Star,
  Strikethrough, Table2, Tag, Trash2, Underline, Undo2, Upload, Users,
  WandSparkles, X, Eye, Lock, Copy, MoreHorizontal, Palette
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type NoteFolder = { id:string; owner_id:string; name:string; parent_id:string|null; color:string };
type CampusNote = {
  id:string; owner_id:string; folder_id:string|null; title:string; content_html:string; content_text:string;
  tags:string[]; color:string; icon:string; template_key:string; is_pinned:boolean; is_favorite:boolean;
  is_archived:boolean; deleted_at:string|null; linked_todo_id:string|null; linked_assignment_id:string|null;
  visibility:'private'|'shared'; created_at:string; updated_at:string;
};
type NoteAttachment = { id:string; note_id:string; file_name:string; file_path:string; mime_type:string; file_size:number; created_at:string; signedUrl?:string };
type NoteComment = { id:string; note_id:string; user_id:string; body:string; created_at:string };
type NoteVersion = { id:string; note_id:string; editor_id:string; title:string; content_html:string; content_text:string; created_at:string };
type NoteAssignment = { id:string; title:string; due?:string|null; due_at?:string|null };
type ShareEntry = { user_id:string; student_id:string; student_name:string; role:'viewer'|'editor' };
type NoteTab = 'all'|'recent'|'pinned'|'favorites'|'shared'|'archived'|'trash';
type AiAction = 'summary'|'keywords'|'flashcards'|'organize'|'todos';
type AiCard = { question:string; answer:string };

const COLORS = [
  {id:'slate',name:'グレー',hex:'#64748b'},{id:'blue',name:'ブルー',hex:'#3b82f6'},
  {id:'cyan',name:'シアン',hex:'#0891b2'},{id:'green',name:'グリーン',hex:'#16a34a'},
  {id:'amber',name:'アンバー',hex:'#d97706'},{id:'rose',name:'ローズ',hex:'#e11d48'},
  {id:'violet',name:'バイオレット',hex:'#7c3aed'}
];
const TEMPLATES:Record<string,{label:string;title:string;html:string}> = {
  blank:{label:'空白のメモ',title:'無題のメモ',html:'<p><br></p>'},
  lesson:{label:'授業ノート',title:'授業ノート',html:'<h1>授業名</h1><p>日付：</p><h2>今日のテーマ</h2><p><br></p><h2>重要事項・板書</h2><ul><li><br></li></ul><h2>重要公式・語句</h2><p><br></p><h2>質問・復習ポイント</h2><ul><li><br></li></ul><h2>宿題・次回まで</h2><ul><li><br></li></ul>'},
  meeting:{label:'会議・議事録',title:'会議メモ',html:'<h1>会議名</h1><p>日時：</p><p>参加者：</p><h2>議題</h2><ol><li><br></li></ol><h2>決定事項</h2><ul><li><br></li></ul><h2>担当・期限</h2><table><tbody><tr><th>担当</th><th>内容</th><th>期限</th></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table><h2>次回予定</h2><p><br></p>'},
  idea:{label:'アイデア',title:'アイデアメモ',html:'<h1>アイデア</h1><p>ひとことで：</p><h2>背景・課題</h2><p><br></p><h2>解決方法</h2><p><br></p><h2>必要なこと</h2><ul><li><br></li></ul><h2>次のアクション</h2><ul><li><br></li></ul>'},
  project:{label:'プロジェクト計画',title:'プロジェクト計画',html:'<h1>プロジェクト名</h1><p>目的：</p><p>目標日：</p><h2>概要</h2><p><br></p><h2>タスク</h2><ul><li><br></li></ul><h2>役割分担</h2><table><tbody><tr><th>担当</th><th>役割</th></tr><tr><td><br></td><td><br></td></tr></tbody></table><h2>進捗・課題</h2><p><br></p>'},
  summary:{label:'テスト前まとめ',title:'学習まとめ',html:'<h1>単元・テーマ</h1><h2>重要ポイント</h2><ul><li><br></li></ul><h2>公式・重要語句</h2><p><br></p><h2>例題・解き方</h2><p><br></p><h2>間違えやすい点</h2><p><br></p><h2>確認問題</h2><ol><li><br></li></ol>'}
};
const SAFE_TAGS = new Set(['P','BR','H1','H2','H3','H4','STRONG','B','EM','I','U','S','DEL','UL','OL','LI','BLOCKQUOTE','PRE','CODE','HR','TABLE','THEAD','TBODY','TR','TH','TD','A','IMG','SPAN','DIV','MARK','INPUT','DETAILS','SUMMARY']);
const SAFE_STYLES = new Set(['color','background-color','text-align','font-weight','font-style','text-decoration']);
const esc = (s:string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

function sanitizeHtml(input:string):string {
  if(typeof document==='undefined') return '';
  const doc=new DOMParser().parseFromString(input||'','text/html');
  const visit=(parent:ParentNode) => Array.from(parent.childNodes).forEach(node=>{
    if(node.nodeType!==Node.ELEMENT_NODE) return;
    const el=node as HTMLElement;
    if(!SAFE_TAGS.has(el.tagName)){el.replaceWith(document.createTextNode(el.textContent||''));return;}
    Array.from(el.attributes).forEach(attr=>{
      const key=attr.name.toLowerCase();
      if((key==='data-file-path'&&(el.tagName==='IMG'||el.tagName==='A'))||
         (key==='alt'&&el.tagName==='IMG')||
         (key==='colspan'&&['TD','TH'].includes(el.tagName)&&/^[1-8]$/.test(attr.value))||
         (key==='rowspan'&&['TD','TH'].includes(el.tagName)&&/^[1-8]$/.test(attr.value))||
         (key==='type'&&el.tagName==='INPUT'&&attr.value==='checkbox')||
         (key==='checked'&&el.tagName==='INPUT'&&el.getAttribute('type')==='checkbox')) return;
      if(key==='href'&&el.tagName==='A'&&/^(https?:|mailto:)/i.test(attr.value.trim())) return;
      if(key==='style'){
        const safe=attr.value.split(';').map(x=>x.trim()).filter(Boolean).map(rule=>{
          const i=rule.indexOf(':'); if(i<0)return '';
          const prop=rule.slice(0,i).trim().toLowerCase(),value=rule.slice(i+1).trim();
          if(!SAFE_STYLES.has(prop)||/url\s*\(|expression|javascript/i.test(value))return '';
          if(['color','background-color'].includes(prop))return /^#[0-9a-f]{3,8}$/i.test(value)||/^[a-z]{3,20}$/i.test(value)?prop+':'+value:'';
          if(prop==='text-align')return ['left','center','right','justify'].includes(value)?prop+':'+value:'';
          if(prop==='font-weight')return ['bold','normal','600','700','800'].includes(value)?prop+':'+value:'';
          if(prop==='font-style')return ['italic','normal'].includes(value)?prop+':'+value:'';
          if(prop==='text-decoration')return ['underline','line-through','none'].includes(value)?prop+':'+value:'';
          return '';
        }).filter(Boolean).join(';');
        if(safe)el.setAttribute('style',safe);else el.removeAttribute('style');
        return;
      }
      el.removeAttribute(attr.name);
    });
    if(el.tagName==='IMG'&&!el.getAttribute('data-file-path')){el.remove();return;}
    if(el.tagName==='INPUT'&&el.getAttribute('type')!=='checkbox'){el.remove();return;}
    visit(el);
  });
  visit(doc.body);
  return doc.body.innerHTML;
}
function htmlText(html:string):string {
  if(typeof document==='undefined')return '';
  const node=document.createElement('div');node.innerHTML=sanitizeHtml(html);
  return (node.innerText||node.textContent||'').replace(/\u00a0/g,' ').replace(/\n{3,}/g,'\n\n').trim();
}
function markdownHtml(value:string):string {
  const lines=value.replace(/\r/g,'').split('\n'),out:string[]=[];let list:''|'ul'|'ol'='';
  const close=()=>{if(list){out.push('</'+list+'>');list='';}};
  lines.forEach(line=>{
    const h=line.match(/^(#{1,3})\s+(.*)$/),b=line.match(/^\s*[-*]\s+(.*)$/),n=line.match(/^\s*\d+[.)]\s+(.*)$/);
    if(h){close();out.push('<h'+h[1].length+'>'+esc(h[2])+'</h'+h[1].length+'>');}
    else if(b||n){const type=b?'ul':'ol';if(list!==type){close();list=type;out.push('<'+type+'>');}out.push('<li>'+esc((b||n)![1])+'</li>');}
    else{close();out.push(line.trim()?'<p>'+esc(line)+'</p>':'<p><br></p>');}
  });
  close();return out.join('');
}
function htmlMarkdown(html:string):string {
  if(typeof document==='undefined')return htmlText(html);
  const root=document.createElement('div');root.innerHTML=sanitizeHtml(html);
  const render=(node:Node):string=>{
    if(node.nodeType===Node.TEXT_NODE)return node.textContent||'';
    if(node.nodeType!==Node.ELEMENT_NODE)return '';
    const el=node as HTMLElement,children=Array.from(el.childNodes).map(render).join('');
    switch(el.tagName){
      case 'H1':return '# '+children+'\n\n';case 'H2':return '## '+children+'\n\n';case 'H3':return '### '+children+'\n\n';
      case 'LI':return '- '+children+'\n';case 'UL':case 'OL':return children+'\n';
      case 'BLOCKQUOTE':return children.split('\n').filter(Boolean).map(x=>'> '+x).join('\n')+'\n\n';
      case 'PRE':return String.fromCharCode(96,96,96)+'\n'+children+'\n'+String.fromCharCode(96,96,96)+'\n\n';
      case 'CODE':return String.fromCharCode(96)+children+String.fromCharCode(96);
      case 'STRONG':case 'B':return '**'+children+'**';case 'EM':case 'I':return '*'+children+'*';
      case 'BR':return '\n';case 'HR':return '\n---\n\n';case 'P':case 'DIV':return children+'\n\n';
      case 'IMG':return '[画像添付]';default:return children;
    }
  };
  return Array.from(root.childNodes).map(render).join('').replace(/\n{3,}/g,'\n\n').trim();
}
function highlightText(text:string,query:string):React.ReactNode{
  const term=query.trim();if(!term)return text;
  const lower=text.toLocaleLowerCase(),needle=term.toLocaleLowerCase(),parts:React.ReactNode[]=[];
  let cursor=0,index=lower.indexOf(needle);
  while(index>=0){
    if(index>cursor)parts.push(text.slice(cursor,index));
    parts.push(<mark key={index} className="rounded bg-amber-200 px-0.5 text-slate-900">{text.slice(index,index+term.length)}</mark>);
    cursor=index+term.length;index=lower.indexOf(needle,cursor);
  }
  if(cursor<text.length)parts.push(text.slice(cursor));
  return parts.length?parts:text;
}
function formatBytes(value:number):string{return value<1024?value+' B':value<1048576?(value/1024).toFixed(1)+' KB':(value/1048576).toFixed(1)+' MB';}
function dateText(value:string):string{const date=new Date(value);return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(date);}
function loadScript(src:string,id:string):Promise<void>{
  return new Promise((resolve,reject)=>{
    const found=document.getElementById(id) as HTMLScriptElement|null;
    if(found?.dataset.loaded==='true'){resolve();return;}
    const script=found||document.createElement('script');
    script.addEventListener('load',()=>{script.dataset.loaded='true';resolve();},{once:true});
    script.addEventListener('error',()=>reject(new Error('読み取りライブラリを読み込めませんでした。')),{once:true});
    if(!found){script.id=id;script.src=src;script.async=true;document.head.appendChild(script);}
  });
}
async function openDraftDb():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('campus-sync-notes-offline',1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('drafts'))request.result.createObjectStore('drafts');};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
async function draftPut(key:string,value:unknown):Promise<void>{
  const db=await openDraftDb();await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(value,key);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });db.close();
}
async function draftGet<T>(key:string):Promise<T|null>{
  const db=await openDraftDb();const value=await new Promise<T|null>((resolve,reject)=>{
    const req=db.transaction('drafts','readonly').objectStore('drafts').get(key);
    req.onsuccess=()=>resolve((req.result as T)||null);req.onerror=()=>reject(req.error);
  });db.close();return value;
}
async function draftDelete(key:string):Promise<void>{
  const db=await openDraftDb();await new Promise<void>((resolve,reject)=>{
    const req=db.transaction('drafts','readwrite').objectStore('drafts').delete(key);
    req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error);
  });db.close();
}

export default function CampusNotes({userId,studentId,studentName}:{userId:string;studentId:string;studentName:string}){
  const [notes,setNotes]=useState<CampusNote[]>([]);
  const [attachmentNames,setAttachmentNames]=useState<Record<string,string[]>>({});
  const searchInput=useRef<HTMLInputElement>(null);
  const [folders,setFolders]=useState<NoteFolder[]>([]);
  const [assignments,setAssignments]=useState<NoteAssignment[]>([]);
  const [attachments,setAttachments]=useState<NoteAttachment[]>([]);
  const [comments,setComments]=useState<NoteComment[]>([]);
  const [versions,setVersions]=useState<NoteVersion[]>([]);
  const [shares,setShares]=useState<ShareEntry[]>([]);
  const [myRole,setMyRole]=useState<'viewer'|'editor'|null>(null);
  const [selectedId,setSelectedId]=useState('');
  const [tab,setTab]=useState<NoteTab>('all');
  const [folderId,setFolderId]=useState('');
  const [tagFilter,setTagFilter]=useState('');
  const [recentIds,setRecentIds]=useState<string[]>([]);
  const [search,setSearch]=useState('');
  const [sort,setSort]=useState<'updated'|'created'|'title'>('updated');
  const [fromDate,setFromDate]=useState('');const [toDate,setToDate]=useState('');
  const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);
  const [saveStatus,setSaveStatus]=useState('保存済み');const [error,setError]=useState('');
  const [title,setTitle]=useState('');const [tags,setTags]=useState<string[]>([]);const [tagText,setTagText]=useState('');
  const [currentFolder,setCurrentFolder]=useState('');const [assignmentId,setAssignmentId]=useState('');
  const [template,setTemplate]=useState('blank');const [shareId,setShareId]=useState('');
  const [shareRole,setShareRole]=useState<'viewer'|'editor'>('editor');
  const [commentText,setCommentText]=useState('');
  const [showShare,setShowShare]=useState(false);const [showComments,setShowComments]=useState(false);
  const [showVersions,setShowVersions]=useState(false);const [showAi,setShowAi]=useState(false);
  const [aiAction,setAiAction]=useState<AiAction>('summary');const [aiOutput,setAiOutput]=useState('');
  const [aiCards,setAiCards]=useState<AiCard[]>([]);const [aiBusy,setAiBusy]=useState(false);
  const [handwriting,setHandwriting]=useState(false);const [penColor,setPenColor]=useState('#172554');
  const [ocrBusy,setOcrBusy]=useState(false);const [ocrStatus,setOcrStatus]=useState('');const [ocrOutput,setOcrOutput]=useState('');
  const [online,setOnline]=useState(true);const [remoteChanged,setRemoteChanged]=useState(false);const [present,setPresent]=useState<string[]>([]);
  const editor=useRef<HTMLDivElement>(null);const canvas=useRef<HTMLCanvasElement>(null);
  const selectedRef=useRef<CampusNote|null>(null);const titleRef=useRef('');const tagsRef=useRef<string[]>([]);
  const folderRef=useRef('');const assignmentRef=useRef('');const dirty=useRef(false);
  const snapshot=useRef<{title:string;html:string;text:string}|null>(null);
  const lastVersionAt=useRef(0);
  const timer=useRef<number|null>(null);const channelRef=useRef<any>(null);

  const selected=useMemo(()=>notes.find(note=>note.id===selectedId)||null,[notes,selectedId]);
  const owner=Boolean(selected&&selected.owner_id===userId);
  const canEdit=Boolean(selected&&(owner||myRole==='editor'));
  const visible=useMemo(()=>{
    let rows=notes.filter(note=>{
      if(tab==='trash')return Boolean(note.deleted_at);
      if(note.deleted_at)return false;
      if(tab==='recent'&&!recentIds.includes(note.id))return false;
      if(tab==='pinned'&&!note.is_pinned)return false;
      if(tab==='favorites'&&!note.is_favorite)return false;
      if(tab==='shared'&&note.owner_id===userId)return false;
      if(tab==='archived'&&!note.is_archived)return false;
      if(tab!=='archived'&&note.is_archived&&tab!=='trash')return false;
      if(tab==='all'&&folderId&&note.folder_id!==folderId)return false;
      if(tagFilter&&!(note.tags||[]).includes(tagFilter))return false;
      if(fromDate&&note.created_at.slice(0,10)<fromDate)return false;
      if(toDate&&note.created_at.slice(0,10)>toDate)return false;
      const term=search.trim().toLowerCase();
      if(term&&![note.title,note.content_text,(note.tags||[]).join(' '),(attachmentNames[note.id]||[]).join(' ')].join(' ').toLowerCase().includes(term))return false;
      return true;
    });
    rows=rows.sort((a,b)=>sort==='title'?a.title.localeCompare(b.title,'ja'):sort==='created'?b.created_at.localeCompare(a.created_at):b.updated_at.localeCompare(a.updated_at));
    return rows;
  },[notes,tab,folderId,tagFilter,recentIds,fromDate,toDate,search,sort,userId,attachmentNames]);

  const loadNotes=useCallback(async()=>{
    setLoading(true);setError('');
    const [n,f,a,att]=await Promise.all([
      supabase.from('campus_notes').select('*').order('updated_at',{ascending:false}).limit(500),
      supabase.from('campus_note_folders').select('*').eq('owner_id',userId).order('created_at'),
      supabase.from('assignments').select('id,title,due,due_at').eq('is_active',true).order('created_at',{ascending:false}).limit(200),
      supabase.from('campus_note_attachments').select('note_id,file_name').limit(2000)
    ]);
    if(n.error){setError(n.error.message);setNotes([]);}else setNotes((n.data||[]) as CampusNote[]);
    if(!f.error)setFolders((f.data||[]) as NoteFolder[]);
    if(!a.error)setAssignments((a.data||[]) as NoteAssignment[]);
    if(!att.error){
      const byNote:Record<string,string[]>={};
      ((att.data||[]) as Array<{note_id:string;file_name:string}>).forEach(file=>{
        byNote[file.note_id]=byNote[file.note_id]||[];byNote[file.note_id].push(file.file_name);
      });
      setAttachmentNames(byNote);
    }
    setLoading(false);
  },[userId]);
  useEffect(()=>{void loadNotes();},[loadNotes]);
  useEffect(()=>{
    try{
      const saved=JSON.parse(localStorage.getItem('campus-sync-notes-recent:'+userId)||'[]');
      if(Array.isArray(saved))setRecentIds(saved.filter((id):id is string=>typeof id==='string').slice(0,30));
    }catch{setRecentIds([]);}
  },[userId]);
  useEffect(()=>{setOnline(navigator.onLine);const on=()=>setOnline(true),off=()=>setOnline(false);window.addEventListener('online',on);window.addEventListener('offline',off);return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off);};},[]);
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
        event.preventDefault();searchInput.current?.focus();searchInput.current?.select();
      }
    };
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[]);

  const restoreFileLinks=useCallback(async(root:HTMLElement)=>{
    const nodes=Array.from(root.querySelectorAll('[data-file-path]')) as HTMLElement[];
    for(const node of nodes){
      const path=node.dataset.filePath;if(!path)continue;
      const {data}=await supabase.storage.from('campus-notes').createSignedUrl(path,3600);
      if(!data?.signedUrl)continue;
      if(node.tagName==='IMG')(node as HTMLImageElement).src=data.signedUrl;
      if(node.tagName==='A')(node as HTMLAnchorElement).href=data.signedUrl;
    }
  },[]);

  useEffect(()=>{
    selectedRef.current=selected;
    if(!selected){setAttachments([]);setComments([]);setVersions([]);setShares([]);setMyRole(null);setTitle('');setTags([]);setCurrentFolder('');setAssignmentId('');return;}
    setTitle(selected.title||'');setTags(selected.tags||[]);setCurrentFolder(selected.folder_id||'');setAssignmentId(selected.linked_assignment_id||'');
    dirty.current=false;setRemoteChanged(false);
    snapshot.current={title:selected.title,html:selected.content_html||'',text:selected.content_text||''};
    lastVersionAt.current=new Date(selected.updated_at).getTime()||0;
    if(editor.current){editor.current.innerHTML=sanitizeHtml(selected.content_html||'<p><br></p>');void restoreFileLinks(editor.current);}
    void (async()=>{
      const [ar,cr,vr,sr]=await Promise.all([
        supabase.from('campus_note_attachments').select('*').eq('note_id',selected.id).order('created_at',{ascending:false}),
        supabase.from('campus_note_comments').select('*').eq('note_id',selected.id).order('created_at'),
        supabase.from('campus_note_versions').select('*').eq('note_id',selected.id).order('created_at',{ascending:false}).limit(30),
        supabase.from('campus_note_collaborators').select('user_id,role').eq('note_id',selected.id)
      ]);
      if(selectedRef.current?.id!==selected.id)return;
      if(!ar.error){
        const items=await Promise.all(((ar.data||[]) as NoteAttachment[]).map(async file=>{
          const {data}=await supabase.storage.from('campus-notes').createSignedUrl(file.file_path,3600);
          return {...file,signedUrl:data?.signedUrl};
        }));
        setAttachments(items);
      }
      if(!cr.error)setComments((cr.data||[]) as NoteComment[]);
      if(!vr.error)setVersions((vr.data||[]) as NoteVersion[]);
      if(!sr.error){
        const rows=(sr.data||[]) as Array<{user_id:string;role:'viewer'|'editor'}>;
        setMyRole(rows.find(row=>row.user_id===userId)?.role||null);
      }
      if(selected.owner_id===userId){
        const {data:session}=await supabase.auth.getSession();
        const response=await fetch('/api/notes/share',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+(session.session?.access_token||'')},body:JSON.stringify({action:'list',noteId:selected.id})});
        const data=await response.json().catch(()=>null);
        if(response.ok&&Array.isArray(data?.shares))setShares(data.shares as ShareEntry[]);
      }else setShares([]);
      const local=await draftGet<{title:string;html:string;text:string;tags:string[];folderId:string;assignmentId:string;savedAt:number}>(userId+':'+selected.id).catch(()=>null);
      if(local&&local.savedAt>new Date(selected.updated_at).getTime()&&selectedRef.current?.id===selected.id){
        setTitle(local.title);titleRef.current=local.title;setTags(local.tags||[]);tagsRef.current=local.tags||[];
        setCurrentFolder(local.folderId||'');folderRef.current=local.folderId||'';
        setAssignmentId(local.assignmentId||'');assignmentRef.current=local.assignmentId||'';
        if(editor.current){editor.current.innerHTML=sanitizeHtml(local.html);void restoreFileLinks(editor.current);}
        dirty.current=true;setSaveStatus('端末内に未同期の編集あり');
      }
    })().catch(caught=>console.error('メモの詳細読み込みに失敗:',caught));
  },[selectedId,selected?.id,selected?.content_html,selected?.owner_id,selected?.updated_at,userId,restoreFileLinks]);

  const saveNow=useCallback(async()=>{
    const note=selectedRef.current;
    if(!note||note.deleted_at||!(note.owner_id===userId||myRole==='editor')||!dirty.current)return;
    const nextTitle=titleRef.current.trim().slice(0,240)||'無題のメモ';
    const html=sanitizeHtml(editor.current?.innerHTML||'');
    const text=htmlText(html),nextTags=tagsRef.current,nextFolder=folderRef.current||null,nextAssignment=assignmentRef.current||null;
    setSaving(true);setSaveStatus(online?'クラウドへ保存中…':'オフライン・端末に保存中');
    try{
      const prev=snapshot.current;
      if(prev&&(prev.title!==nextTitle||prev.html!==html)&&Date.now()-lastVersionAt.current>=60000){
        const {error:versionError}=await supabase.from('campus_note_versions').insert({note_id:note.id,editor_id:userId,title:prev.title,content_html:prev.html,content_text:prev.text});
        if(versionError)console.warn('メモ履歴の保存に失敗:',versionError.message);
        else lastVersionAt.current=Date.now();
      }
      const {data,error:saveError}=await supabase.from('campus_notes').update({
        title:nextTitle,content_html:html,content_text:text,tags:nextTags,folder_id:nextFolder,linked_assignment_id:nextAssignment
      }).eq('id',note.id).select('*').maybeSingle();
      if(saveError||!data)throw new Error(saveError?.message||'保存できませんでした。');
      const saved=data as CampusNote;snapshot.current={title:nextTitle,html,text};selectedRef.current=saved;
      dirty.current=false;setNotes(rows=>rows.map(row=>row.id===note.id?saved:row));
      setSaving(false);setSaveStatus('保存済み');setRemoteChanged(false);setError('');
      await draftDelete(userId+':'+note.id).catch(()=>undefined);
    }catch(caught){
      setSaving(false);setSaveStatus('端末に保存・同期待ち');
      await draftPut(userId+':'+note.id,{title:nextTitle,html,text,tags:nextTags,folderId:nextFolder||'',assignmentId:nextAssignment||'',savedAt:Date.now()}).catch(()=>undefined);
      setError(caught instanceof Error?caught.message:'メモを保存できませんでした。');
    }
  },[userId,myRole,online]);

  const markDirty=useCallback(()=>{
    dirty.current=true;setSaveStatus('端末に保存中…');
    const note=selectedRef.current;
    const html=sanitizeHtml(editor.current?.innerHTML||'');
    if(note)void draftPut(userId+':'+note.id,{
      title:titleRef.current,html,text:htmlText(html),tags:tagsRef.current,
      folderId:folderRef.current,assignmentId:assignmentRef.current,savedAt:Date.now()
    }).catch(()=>undefined);
    if(timer.current!==null)window.clearTimeout(timer.current);
    timer.current=window.setTimeout(()=>{void saveNow();},900);
  },[saveNow,userId]);
  useEffect(()=>{
    const onOnline=()=>{setOnline(true);if(dirty.current)void saveNow();};
    const onOffline=()=>setOnline(false);
    window.addEventListener('online',onOnline);window.addEventListener('offline',onOffline);
    return()=>{window.removeEventListener('online',onOnline);window.removeEventListener('offline',onOffline);};
  },[saveNow]);
  useEffect(()=>{titleRef.current=title;tagsRef.current=tags;folderRef.current=currentFolder;assignmentRef.current=assignmentId;},[title,tags,currentFolder,assignmentId]);
  useEffect(()=>()=>{if(timer.current!==null)window.clearTimeout(timer.current);},[]);

  useEffect(()=>{
    if(!selected)return;
    const channel=supabase.channel('campus-note-'+selected.id,{config:{presence:{key:userId}}});
    channel.on('postgres_changes',{event:'UPDATE',schema:'public',table:'campus_notes',filter:'id=eq.'+selected.id},(payload:any)=>{
      const next=payload.new as CampusNote;
      if(!next||next.id!==selected.id||next.updated_at===selectedRef.current?.updated_at)return;
      if(dirty.current){setRemoteChanged(true);return;}
      setNotes(rows=>rows.map(row=>row.id===next.id?next:row));
    });
    channel.on('postgres_changes',{event:'INSERT',schema:'public',table:'campus_note_comments',filter:'note_id=eq.'+selected.id},(payload:any)=>{
      const next=payload.new as NoteComment;
      if(next?.note_id===selected.id)setComments(rows=>rows.some(row=>row.id===next.id)?rows:[...rows,next]);
    });
    channel.on('presence',{event:'sync'},()=>{
      const state=channel.presenceState() as Record<string,Array<{name?:string}>>;
      setPresent(Object.entries(state).flatMap(([key,items])=>key!==userId?items.map(item=>item.name||'共同編集者'):[]));
    });
    channel.subscribe((status:string)=>{if(status==='SUBSCRIBED')void channel.track({name:studentName||'生徒',editing:true});});
    channelRef.current=channel;
    return()=>{void supabase.removeChannel(channel);channelRef.current=null;setPresent([]);};
  },[selected?.id,userId,studentName]);

  const chooseNote=(id:string)=>{if(dirty.current)void saveNow();setSelectedId(id);};
  const recordRecent=(id:string)=>{
    setRecentIds(current=>{
      const next=[id,...current.filter(item=>item!==id)].slice(0,30);
      try{localStorage.setItem('campus-sync-notes-recent:'+userId,JSON.stringify(next));}catch{}
      return next;
    });
  };
  const openNote=(id:string)=>{
    if(dirty.current)void saveNow();
    recordRecent(id);setSelectedId(id);
  };
  const createNote=async()=>{
    const item=TEMPLATES[template]||TEMPLATES.blank;
    const {data,error:createError}=await supabase.from('campus_notes').insert({
      owner_id:userId,folder_id:folderId||null,title:item.title,content_html:item.html,content_text:htmlText(item.html),template_key:template
    }).select('*').single();
    if(createError||!data){setError(createError?.message||'メモを作成できませんでした。');return;}
    setNotes(rows=>[data as CampusNote,...rows]);setTab('all');recordRecent(data.id);setSelectedId(data.id);
  };
  const createFolder=async()=>{
    const name=window.prompt('フォルダ名を入力してください。','新しいフォルダ');
    if(!name?.trim())return;
    const parent=folderId||null;
    const {data,error:createError}=await supabase.from('campus_note_folders').insert({owner_id:userId,name:name.trim().slice(0,80),parent_id:parent}).select('*').single();
    if(createError||!data){setError(createError?.message||'フォルダを作成できませんでした。');return;}
    setFolders(rows=>[...rows,data as NoteFolder]);setFolderId(data.id);setTab('all');
  };
  const updateNote=async(note:CampusNote,patch:Partial<CampusNote>)=>{
    if(note.owner_id!==userId)return;
    const {data,error:updateError}=await supabase.from('campus_notes').update(patch).eq('id',note.id).select('*').maybeSingle();
    if(updateError||!data){setError(updateError?.message||'設定を更新できませんでした。');return;}
    setNotes(rows=>rows.map(row=>row.id===note.id?data as CampusNote:row));
  };

  const command=(name:string,value?:string)=>{
    editor.current?.focus();document.execCommand(name,false,value);markDirty();
  };
  const insertHtml=(html:string)=>{
    editor.current?.focus();document.execCommand('insertHTML',false,sanitizeHtml(html));markDirty();
  };
  const insertText=(text:string)=>{editor.current?.focus();document.execCommand('insertText',false,text);markDirty();};
  const onPaste=(event:React.ClipboardEvent<HTMLDivElement>)=>{
    event.preventDefault();const html=event.clipboardData.getData('text/html'),plain=event.clipboardData.getData('text/plain');
    if(html)insertHtml(html);else insertText(plain);
  };
  const moveCurrentBlock=(direction:'up'|'down')=>{
    const selection=window.getSelection(),node=selection?.anchorNode;
    if(!node||!editor.current)return;
    let block:HTMLElement|null=node.nodeType===Node.ELEMENT_NODE?node as HTMLElement:node.parentElement;
    while(block&&block.parentElement!==editor.current&&!['P','H1','H2','H3','H4','UL','OL','BLOCKQUOTE','PRE','TABLE','DETAILS'].includes(block.tagName))block=block.parentElement;
    if(!block||block.parentElement!==editor.current)return;
    const sibling=direction==='up'?block.previousElementSibling:block.nextElementSibling;
    if(!sibling)return;
    if(direction==='up')editor.current.insertBefore(block,sibling);else editor.current.insertBefore(sibling,block);
    markDirty();
  };
  const insertCollapsible=()=>insertHtml('<details open><summary>クリックして開閉</summary><p>折りたたみたい内容</p></details><p><br></p>');

  const uploadFile=async(file:File,insertIntoBody=true)=>{
    const note=selectedRef.current;
    if(!note||!canEdit)return;
    if(file.size>25*1024*1024){setError('添付ファイルは25MB以内にしてください。');return;}
    const safe=file.name.replace(/[^\w.\-ぁ-んァ-ヶ一-龠]/g,'_').slice(0,90)||'attachment';
    const path=userId+'/'+note.id+'/'+Date.now()+'_'+safe;
    setSaveStatus('添付ファイルをアップロード中…');
    const {data,error:uploadError}=await supabase.storage.from('campus-notes').upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});
    if(uploadError||!data){setError(uploadError?.message||'添付ファイルを保存できませんでした。');setSaveStatus('保存済み');return;}
    const {data:row,error:rowError}=await supabase.from('campus_note_attachments').insert({
      note_id:note.id,uploader_id:userId,file_name:file.name,file_path:data.path,mime_type:file.type||'application/octet-stream',file_size:file.size
    }).select('*').single();
    if(rowError||!row){await supabase.storage.from('campus-notes').remove([data.path]);setError(rowError?.message||'添付情報を保存できませんでした。');return;}
    const {data:signed}=await supabase.storage.from('campus-notes').createSignedUrl(data.path,3600);
    setAttachments(rows=>[{...(row as NoteAttachment),signedUrl:signed?.signedUrl},...rows]);
    if(insertIntoBody&&file.type.startsWith('image/'))insertHtml('<p><img data-file-path="'+esc(data.path)+'" alt="'+esc(file.name)+'"></p>');
    else if(insertIntoBody)insertHtml('<p><a data-file-path="'+esc(data.path)+'">'+esc(file.name)+'</a></p>');
    if(insertIntoBody&&editor.current)void restoreFileLinks(editor.current);
    setSaveStatus('保存済み');
  };
  const deleteAttachment=async(file:NoteAttachment)=>{
    if(!selected||!owner||!window.confirm('「'+file.file_name+'」を削除しますか？'))return;
    const {error:removeError}=await supabase.storage.from('campus-notes').remove([file.file_path]);
    if(removeError){setError(removeError.message);return;}
    const {error:rowError}=await supabase.from('campus_note_attachments').delete().eq('id',file.id);
    if(rowError){setError(rowError.message);return;}
    setAttachments(rows=>rows.filter(row=>row.id!==file.id));
  };

  const doOcr=async(file:File)=>{
    setOcrBusy(true);setOcrStatus('OCRを準備しています…');setOcrOutput('');setError('');
    let worker:any=null;
    try{
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js','campus-note-pdfjs');
      await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js','campus-note-tesseract');
      if(!window.Tesseract)throw new Error('OCRを初期化できませんでした。');
      const canvases:HTMLCanvasElement[]=[];
      if(file.type==='application/pdf'){
        const pdf=await window.pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
        if(pdf.numPages>8)throw new Error('OCR対象PDFは8ページ以内にしてください。');
        for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
          setOcrStatus('PDFページを変換中 '+pageNo+'/'+pdf.numPages);
          const page=await pdf.getPage(pageNo),viewport=page.getViewport({scale:1.5}),canvas=document.createElement('canvas');
          canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
          const ctx=canvas.getContext('2d');if(!ctx)throw new Error('PDFを画像にできません。');
          await page.render({canvasContext:ctx,viewport}).promise;canvases.push(canvas);
        }
      }else{
        const url=URL.createObjectURL(file);
        try{
          const img=new Image();img.src=url;
          await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error('画像を開けませんでした。'));});
          const scale=Math.min(1.8,2400/Math.max(img.width,img.height)),c=document.createElement('canvas');
          c.width=Math.ceil(img.width*scale);c.height=Math.ceil(img.height*scale);
          const ctx=c.getContext('2d');if(!ctx)throw new Error('画像を変換できません。');ctx.drawImage(img,0,0,c.width,c.height);canvases.push(c);
        }finally{URL.revokeObjectURL(url);}
      }
      setOcrStatus('日本語OCRを初期化しています…');
      worker=await window.Tesseract.createWorker('jpn',1,{
        workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
        corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js',
        langPath:'https://tessdata.projectnaptha.com/4.0.0/',
        logger:(msg:any)=>{if(msg.status==='recognizing text')setOcrStatus('文字を読み取り中… '+Math.round((msg.progress||0)*100)+'%');}
      });
      const texts:string[]=[];
      for(let i=0;i<canvases.length;i++){const result=await worker.recognize(canvases[i]);texts.push(String(result.data.text||''));}
      setOcrOutput(texts.filter(Boolean).join('\n\n--- ページ区切り ---\n\n'));setOcrStatus('読み取り完了。内容を確認して本文へ挿入できます。');
    }catch(caught){setError(caught instanceof Error?caught.message:'OCRに失敗しました。');setOcrStatus('');}
    finally{if(worker)await worker.terminate().catch(()=>undefined);setOcrBusy(false);}
  };
  const importFile=async(file:File)=>{
    const name=file.name.toLowerCase();
    if(name.endsWith('.txt')){if(editor.current)editor.current.innerHTML='<p>'+esc(await file.text()).replace(/\n/g,'<br>')+'</p>';markDirty();return;}
    if(name.endsWith('.md')||name.endsWith('.markdown')){if(editor.current)editor.current.innerHTML=sanitizeHtml(markdownHtml(await file.text()));markDirty();return;}
    if(name.endsWith('.html')||name.endsWith('.htm')){if(editor.current)editor.current.innerHTML=sanitizeHtml(await file.text());markDirty();return;}
    if(file.type==='application/pdf'||file.type.startsWith('image/')){await doOcr(file);return;}
    setError('TXT・Markdown・HTML・PDF・画像を読み込めます。');
  };

  const startDrawing=(_event:PointerEvent<HTMLCanvasElement>)=>{
    const c=canvas.current;if(!c)return;
    const rect=c.getBoundingClientRect(),ctx=c.getContext('2d');if(!ctx)return;
    c.setPointerCapture(_event.pointerId);ctx.beginPath();ctx.moveTo((_event.clientX-rect.left)*c.width/rect.width,(_event.clientY-rect.top)*c.height/rect.height);
  };
  const moveDrawing=(event:PointerEvent<HTMLCanvasElement>)=>{
    if(!event.buttons)return;const c=canvas.current;if(!c)return;
    const rect=c.getBoundingClientRect(),ctx=c.getContext('2d');if(!ctx)return;
    ctx.strokeStyle=penColor;ctx.lineWidth=5;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.lineTo((event.clientX-rect.left)*c.width/rect.width,(event.clientY-rect.top)*c.height/rect.height);ctx.stroke();
  };
  const openDrawing=()=>{
    setHandwriting(true);window.setTimeout(()=>{
      const c=canvas.current,ctx=c?.getContext('2d');if(c&&ctx){ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);}
    },60);
  };
  const saveDrawing=async()=>{
    const c=canvas.current;if(!c)return;
    const blob=await new Promise<Blob|null>(resolve=>c.toBlob(resolve,'image/png'));
    if(!blob){setError('手書き画像を作成できませんでした。');return;}
    await uploadFile(new File([blob],'手書きノート.png',{type:'image/png'}),true);setHandwriting(false);
  };

  const localAi=(action:AiAction,text:string)=>{
    const lines=text.split('\n').map(x=>x.trim()).filter(Boolean);
    const sentences=text.split(/(?<=[。！？.!?])\s*/).map(x=>x.trim()).filter(x=>x.length>8);
    if(action==='summary')return sentences.slice(0,5).join('\n')||text.slice(0,500);
    if(action==='keywords'){
      const words=text.match(/[一-龠々ぁ-んァ-ヶ]{2,10}|[A-Za-z][A-Za-z0-9_-]{2,}/g)||[];
      const stop=new Set(['これ','それ','ため','こと','もの','よう','ところ','について','そして','また','です','ます','する','いる','ある','など','から','まで','ので']);
      const counts=new Map<string,number>();words.forEach(w=>{if(!stop.has(w))counts.set(w,(counts.get(w)||0)+1);});
      return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12).map(x=>x[0]).join('、')||'キーワードを抽出できませんでした。';
    }
    if(action==='flashcards'){
      const cards:AiCard[]=[];
      lines.forEach(line=>{const m=line.match(/^(.{2,40}?)[：:＝=]\s*(.{3,180})$/);if(m)cards.push({question:m[1]+'とは？',answer:m[2]});});
      setAiCards(cards.slice(0,12));return cards.length+'件のカード候補を作成しました。';
    }
    if(action==='organize')return lines.map(x=>/^(#{1,3}|[-・＊*]|[0-9]+[.)])/.test(x)?x:'・ '+x).join('\n');
    const tasks=lines.filter(x=>/(する|提出|確認|復習|調べ|作成|準備|読む|解く|送る)/.test(x));
    return tasks.length?tasks.map(x=>'□ '+x.replace(/^[-・□☐]\s*/, '')).join('\n'):'ToDo候補が見つかりませんでした。';
  };
  const runAi=async(action:AiAction)=>{
    if(!selected)return;setAiAction(action);setAiBusy(true);setAiOutput('');setAiCards([]);
    if(dirty.current)await saveNow();
    const text=editor.current?.innerText||selected.content_text||'';
    if(dirty.current){
      const local=localAi(action,text);
      setAiOutput(local+'\n\n（保存できなかったため、外部AIには送信せず端末内で処理しました。）');
      setAiBusy(false);
      return;
    }
    try{
      const {data:session}=await supabase.auth.getSession();
      const response=await fetch('/api/notes/assist',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+(session.session?.access_token||'')},
        body:JSON.stringify({noteId:selected.id,action})
      });
      if(!response.ok)throw new Error('AI API unavailable');
      const result=await response.json();
      setAiOutput(String(result.result||''));
      if(Array.isArray(result.cards))setAiCards(result.cards as AiCard[]);
    }catch{
      setAiOutput(localAi(action,text)+'\n\n（外部AIを利用できないため、端末内の文章整理に切り替えました。AI APIが設定されている場合は、操作時にメモ本文がAIサービスへ送信されます。）');
    }finally{setAiBusy(false);}
  };
  const addTodos=async(value:string)=>{
    const items=value.split('\n').map(x=>x.replace(/^\s*(?:[-*]|\d+[.)]|□|☐|☑)\s*/, '').trim()).filter(x=>x.length>1&&x.length<240);
    if(!items.length){setError('ToDo候補がありません。');return;}
    const {error:todoError}=await supabase.from('todos').insert(items.slice(0,20).map(text=>({
      student_id:studentId,title:text,source:'メモ',type:'other',details:'メモから作成',completed:false
    })));
    if(todoError){setError('Todoへの追加に失敗しました: '+todoError.message);return;}
    setAiOutput(items.length+'件をCampusSyncのToDoに追加しました。');
  };
  const addCheckedTodos=async()=>{
    if(!editor.current)return;
    const items=Array.from(editor.current.querySelectorAll('li')).filter(li=>{
      const box=li.querySelector('input[type="checkbox"]') as HTMLInputElement|null;
      return Boolean(box&&!box.checked);
    }).map(li=>li.innerText.replace(/\s+/g,' ').trim()).filter(text=>text.length>1&&text.length<=240);
    if(!items.length){setError('未完了のチェック項目がありません。');return;}
    const {error:todoError}=await supabase.from('todos').insert(items.slice(0,30).map(text=>({
      student_id:studentId,title:text,source:'メモ',type:'other',details:'メモのチェックリストから作成',completed:false
    })));
    if(todoError){setError('ToDoへの変換に失敗しました: '+todoError.message);return;}
    setSaveStatus(items.length+'件をToDoに追加しました。');
  };
  const addComment=async(event:FormEvent)=>{
    event.preventDefault();if(!selected||!commentText.trim())return;
    const {data,error:commentError}=await supabase.from('campus_note_comments').insert({note_id:selected.id,user_id:userId,body:commentText.trim().slice(0,4000)}).select('*').single();
    if(commentError||!data){setError(commentError?.message||'コメントを保存できませんでした。');return;}
    setComments(rows=>[...rows,data as NoteComment]);setCommentText('');
  };
  const shareAction=async(action:'list'|'invite'|'remove',extra:Record<string,unknown>={})=>{
    const {data:session}=await supabase.auth.getSession();
    const response=await fetch('/api/notes/share',{
      method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+(session.session?.access_token||'')},
      body:JSON.stringify({action,noteId:selected?.id,...extra})
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(data?.message||'共有操作に失敗しました。');
    return data;
  };
  const invite=async()=>{
    if(!selected||!owner||!/^[0-9]{6}$/.test(shareId)){setError('共有相手の6桁の学籍番号を入力してください。');return;}
    try{const data=await shareAction('invite',{studentId:shareId,role:shareRole});setShares(rows=>[...rows.filter(x=>x.user_id!==data.share.user_id),data.share]);setNotes(rows=>rows.map(row=>row.id===selected.id?{...row,visibility:'shared'}:row));setShareId('');}
    catch(caught){setError(caught instanceof Error?caught.message:'共有に失敗しました。');}
  };
  const removeShare=async(id:string)=>{
    try{await shareAction('remove',{userId:id});const next=shares.filter(x=>x.user_id!==id);setShares(next);if(next.length===0)setNotes(rows=>rows.map(row=>row.id===selected?.id?{...row,visibility:'private'}:row));}
    catch(caught){setError(caught instanceof Error?caught.message:'共有解除に失敗しました。');}
  };
  const restoreVersion=async(version:NoteVersion)=>{
    if(!selected||!canEdit||!window.confirm('このバージョンに戻しますか？現在の内容も履歴に残します。'))return;
    if(editor.current)editor.current.innerHTML=sanitizeHtml(version.content_html);
    setTitle(version.title);titleRef.current=version.title;markDirty();setShowVersions(false);
  };
  const trashNote=async(note:CampusNote)=>{
    if(note.owner_id!==userId)return;
    if(note.deleted_at){
      if(!window.confirm('このメモを完全に削除しますか？'))return;
      const {data:files}=await supabase.from('campus_note_attachments').select('file_path').eq('note_id',note.id);
      if(files?.length)await supabase.storage.from('campus-notes').remove(files.map((x:any)=>x.file_path));
      const {error:deleteError}=await supabase.from('campus_notes').delete().eq('id',note.id);
      if(deleteError){setError(deleteError.message);return;}
      setNotes(rows=>rows.filter(x=>x.id!==note.id));if(selectedId===note.id)setSelectedId('');
    }else{
      const deletedAt=new Date().toISOString();
      const {error:updateError}=await supabase.from('campus_notes').update({deleted_at:deletedAt}).eq('id',note.id);
      if(updateError){setError(updateError.message);return;}
      setNotes(rows=>rows.map(x=>x.id===note.id?{...x,deleted_at:deletedAt}:x));if(selectedId===note.id)setSelectedId('');
    }
  };
  const exportNote=async(format:'txt'|'md'|'pdf')=>{
    if(!selected)return;
    const html=sanitizeHtml(editor.current?.innerHTML||selected.content_html);
    if(format==='pdf'){
      const win=window.open('','_blank');
      if(!win){setError('ポップアップを許可してから再実行してください。');return;}
      win.opener=null;
      const exportDoc=new DOMParser().parseFromString(html,'text/html');
      const embedded=Array.from(exportDoc.body.querySelectorAll('[data-file-path]')) as HTMLElement[];
      for(const node of embedded){
        const path=node.dataset.filePath;
        if(!path)continue;
        const {data}=await supabase.storage.from('campus-notes').createSignedUrl(path,300);
        if(!data?.signedUrl)continue;
        if(node.tagName==='IMG')(node as HTMLImageElement).src=data.signedUrl;
        if(node.tagName==='A')(node as HTMLAnchorElement).href=data.signedUrl;
        node.removeAttribute('data-file-path');
      }
      const printable=exportDoc.body.innerHTML;
      win.document.write('<!doctype html><html lang="ja"><meta charset="utf-8"><title>'+esc(title||selected.title)+'</title><style>body{font-family:system-ui,sans-serif;max-width:850px;margin:32px auto;padding:0 24px;line-height:1.8;color:#111}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:8px}img{max-width:100%;max-height:240mm;object-fit:contain}blockquote{border-left:4px solid #94a3b8;padding-left:1rem;color:#475569}@media print{body{margin:12mm auto}}</style><body><h1>'+esc(title||selected.title)+'</h1>'+printable+'</body></html>');
      win.document.close();win.focus();win.print();return;
    }
    const value=format==='md'?htmlMarkdown(html):htmlText(html),blob=new Blob([value],{type:format==='md'?'text/markdown;charset=utf-8':'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(title||selected.title||'メモ')+'.'+format;a.click();URL.revokeObjectURL(url);
  };
  const selectCount=(key:NoteTab)=>notes.filter(note=>{
    if(key==='trash')return Boolean(note.deleted_at);
    if(note.deleted_at)return false;
    if(key==='recent')return recentIds.includes(note.id);
    if(key==='pinned')return note.is_pinned;
    if(key==='favorites')return note.is_favorite;
    if(key==='shared')return note.owner_id!==userId;
    if(key==='archived')return note.is_archived;
    return !note.is_archived;
  }).length;
  const toolbar=(label:string,icon:React.ReactNode,fn:()=>void)=>(
    <button type="button" title={label} aria-label={label} onMouseDown={event=>event.preventDefault()} onClick={fn} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-800">{icon}</button>
  );
  const tabButton=(key:NoteTab,label:string,icon:React.ReactNode)=>(
    <button type="button" onClick={()=>{setTab(key);setFolderId('');}} className={'flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-bold '+(tab===key?'bg-cyan-50 text-cyan-800':'text-slate-600 hover:bg-slate-50')}>
      {icon}<span className="flex-1">{label}</span><span className="text-[10px] text-slate-400">{selectCount(key)}</span>
    </button>
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50 text-slate-800">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white"><BookOpen size={21}/></div>
          <div><p className="text-[10px] font-black tracking-[0.2em] text-cyan-700">CAMPUSSYNC NOTES</p><h1 className="text-lg font-black">高機能メモ</h1></div>
          <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 md:inline-flex"><ShieldCheck size={12} className="mr-1"/>自動保存・非公開</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-slate-500">{online?'オンライン':'オフライン'} ・ {saveStatus}</span>
          <select value={template} onChange={event=>setTemplate(event.target.value)} className="max-w-[150px] rounded-lg border border-slate-200 px-2 py-2 text-xs">{Object.entries(TEMPLATES).map(([key,item])=><option key={key} value={key}>{item.label}</option>)}</select>
          <button type="button" onClick={()=>void createNote()} className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-700 px-3 py-2.5 text-xs font-black text-white hover:bg-cyan-600"><Plus size={15}/>新規メモ</button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[190px_260px_minmax(0,1fr)]">
        <aside className={'min-h-0 flex-col border-r border-slate-200 bg-white p-3 '+(selected?'hidden lg:flex':'hidden lg:flex')}>
          <button type="button" onClick={()=>void createFolder()} className="mb-3 flex items-center justify-between rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-xs font-bold text-slate-600 hover:border-cyan-400 hover:text-cyan-800"><span className="flex items-center gap-2"><FolderPlus size={15}/>フォルダ作成</span><Plus size={14}/></button>
          <nav className="space-y-1">
            {tabButton('all','すべて',<FileText size={15}/>)}{tabButton('recent','最近開いたメモ',<Clock3 size={15}/>)}{tabButton('pinned','ピン留め',<Star size={15}/>)}{tabButton('favorites','お気に入り',<Star size={15}/>)}{tabButton('shared','共有されたメモ',<Users size={15}/>)}{tabButton('archived','アーカイブ',<Archive size={15}/>)}{tabButton('trash','ゴミ箱',<Trash2 size={15}/>)}
          </nav>
          <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
            <div className="mb-2 flex items-center justify-between px-2"><p className="text-[10px] font-black tracking-wider text-slate-400">フォルダ</p><button type="button" onClick={()=>void createFolder()} className="text-slate-400 hover:text-cyan-700"><Plus size={15}/></button></div>
            <button type="button" onClick={()=>{setTab('all');setFolderId('');}} className={'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs '+(!folderId?'bg-cyan-50 font-bold text-cyan-800':'text-slate-600 hover:bg-slate-50')}><Folder size={14}/>すべてのフォルダ</button>
            {folders.map(item=><div key={item.id} className="flex items-center gap-1"><button type="button" onClick={()=>{setTab('all');setFolderId(item.id);}} className={'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-left text-xs '+(folderId===item.id?'bg-cyan-50 font-bold text-cyan-800':'text-slate-600 hover:bg-slate-50')} style={{paddingLeft:item.parent_id?24:12}}><Folder size={14} className="shrink-0"/><span className="truncate">{item.parent_id?'↳ ':''}{item.name}</span></button><button type="button" onClick={async()=>{const name=window.prompt('フォルダ名を変更',item.name);if(!name?.trim())return;const {error:e}=await supabase.from('campus_note_folders').update({name:name.trim().slice(0,80)}).eq('id',item.id);if(e)setError(e.message);else setFolders(rows=>rows.map(x=>x.id===item.id?{...x,name:name.trim()}:x));}} className="p-1 text-slate-300 hover:text-slate-600"><MoreHorizontal size={13}/></button></div>)}
          </div>
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-[10px] leading-5 text-slate-500"><Lock size={13} className="mb-1 inline"/>自分のメモは本人だけ、共有ノートは招待した人だけが閲覧できます。</div>
        </aside>

        <section className={'min-h-0 flex-col border-r border-slate-200 bg-slate-50 '+(selected?'hidden lg:flex':'flex')}>
          <div className="space-y-2 border-b border-slate-200 bg-white p-3">
            <div className="flex gap-1 overflow-x-auto pb-1 lg:hidden">
              {(['all','recent','pinned','favorites','shared','archived','trash'] as NoteTab[]).map(key=><button key={key} type="button" onClick={()=>{setTab(key);setFolderId('');}} className={'shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-bold '+(tab===key?'border-cyan-700 bg-cyan-700 text-white':'border-slate-200 text-slate-500')}>{key==='all'?'すべて':key==='recent'?'最近':key==='pinned'?'ピン留め':key==='favorites'?'お気に入り':key==='shared'?'共有':key==='archived'?'保管':'ゴミ箱'}</button>)}
            </div>
            <div className="flex items-center gap-2 lg:hidden">
              <select value={folderId} onChange={event=>{setFolderId(event.target.value);setTab('all');}} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs"><option value="">すべてのフォルダ</option>{folders.map(folder=><option key={folder.id} value={folder.id}>{folder.name}</option>)}</select>
              <button type="button" onClick={()=>void createFolder()} className="rounded-lg border border-slate-200 p-2 text-slate-500"><FolderPlus size={15}/></button>
            </div>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input ref={searchInput} value={search} onChange={event=>setSearch(event.target.value)} placeholder="タイトル・本文・タグ・添付を検索（Ctrl+K）" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs outline-none focus:border-cyan-400"/></div>
            <div className="grid grid-cols-2 gap-2"><input type="date" value={fromDate} onChange={event=>setFromDate(event.target.value)} className="min-w-0 rounded-lg border border-slate-200 px-2 py-2 text-[10px]" aria-label="作成日開始"/><input type="date" value={toDate} onChange={event=>setToDate(event.target.value)} className="min-w-0 rounded-lg border border-slate-200 px-2 py-2 text-[10px]" aria-label="作成日終了"/></div>
            <div className="grid grid-cols-2 gap-2">
              <select value={sort} onChange={event=>setSort(event.target.value as typeof sort)} className="min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs"><option value="updated">最終編集順</option><option value="created">作成日順</option><option value="title">タイトル順</option></select>
              <select value={tagFilter} onChange={event=>setTagFilter(event.target.value)} className="min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs"><option value="">すべてのタグ</option>{[...new Set(notes.flatMap(note=>note.tags||[]))].sort((a,b)=>a.localeCompare(b,'ja')).map(tag=><option key={tag} value={tag}>#{tag}</option>)}</select>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading?<div className="flex h-40 items-center justify-center text-slate-400"><Loader2 size={20} className="animate-spin"/></div>:visible.length===0?<div className="px-4 py-12 text-center"><FileText size={28} className="mx-auto text-slate-300"/><p className="mt-3 text-xs font-bold text-slate-500">メモがありません</p><p className="mt-1 text-[10px] text-slate-400">新規メモを作成するか、検索条件を変更してください。</p></div>:visible.map(note=><div key={note.id} className="mb-2 flex items-stretch gap-1">
              <button type="button" onClick={()=>openNote(note.id)} className={'min-w-0 flex-1 rounded-xl border p-3 text-left transition '+(selectedId===note.id?'border-cyan-300 bg-cyan-50 shadow-sm':'border-slate-200 bg-white hover:border-slate-300')} style={{borderLeftWidth:3,borderLeftColor:COLORS.find(c=>c.id===note.color)?.hex||'#64748b'}}>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400"><span>{note.icon||'📝'}</span><span className="flex-1 truncate">{note.owner_id===userId?'自分のメモ':'共有メモ'}</span>{note.is_pinned&&<Star size={12} className="fill-amber-400 text-amber-500"/>}</div>
                <p className="mt-1 truncate text-sm font-black text-slate-800">{highlightText(note.title||'無題のメモ',search)}</p>
                <p className="mt-1 line-clamp-2 min-h-8 text-[11px] leading-4 text-slate-500">{highlightText(note.content_text||'本文はまだありません。',search)}</p>
                <div className="mt-2 flex items-center justify-between gap-1"><span className="text-[9px] text-slate-400">{dateText(note.updated_at)}</span><span className="truncate text-[9px] text-slate-400">{(note.tags||[]).slice(0,2).map(t=>'#'+t).join(' ')}</span></div>
              </button>
              {ownerOrTrash(note)&&<button type="button" onClick={()=>void trashNote(note)} title={note.deleted_at?'ゴミ箱から復元':'ゴミ箱へ'} className="rounded-lg px-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">{note.deleted_at?<Undo2 size={15}/>:<Trash2 size={15}/>}</button>}
            </div>)}
          </div>
        </section>

        <section className="flex min-h-0 flex-col bg-white">
          {selected?(
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2.5 sm:px-5">
                <div className="flex items-center gap-2 text-[10px] text-slate-400"><button type="button" onClick={()=>{if(dirty.current)void saveNow();setSelectedId('');}} className="rounded-lg p-1.5 hover:bg-slate-100 lg:hidden"><ArrowLeft size={16}/></button><span>{owner?'自分のメモ':'共有メモ'}</span>{present.length>0&&<span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700"><Users size={11} className="mr-1 inline"/>{present.join('、')} が閲覧中</span>}</div>
                <div className="flex flex-wrap items-center gap-1">
                  <button type="button" disabled={!owner} onClick={()=>void updateNote(selected,{is_pinned:!selected.is_pinned})} title="ピン留め" className={'rounded-lg p-2 '+(selected.is_pinned?'text-amber-600':'text-slate-400 hover:bg-slate-100')}><Star size={16}/></button>
                  <button type="button" disabled={!owner} onClick={()=>void updateNote(selected,{is_favorite:!selected.is_favorite})} title="お気に入り" className={'rounded-lg p-2 '+(selected.is_favorite?'text-rose-500':'text-slate-400 hover:bg-slate-100')}><Star size={16}/></button>
                  {owner&&<button type="button" onClick={()=>setShowShare(v=>!v)} title="共有" className="rounded-lg p-2 text-slate-500 hover:bg-cyan-50"><Share2 size={16}/></button>}
                  <button type="button" onClick={()=>setShowComments(v=>!v)} title="コメント" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><MessageCircle size={16}/></button>
                  <button type="button" onClick={()=>setShowVersions(v=>!v)} title="編集履歴" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Clock3 size={16}/></button>
                  <button type="button" onClick={()=>setShowAi(v=>!v)} title="AI文章アシスタント" className="rounded-lg p-2 text-violet-600 hover:bg-violet-50"><WandSparkles size={16}/></button>
                  <button type="button" onClick={()=>exportNote('pdf')} title="PDF出力" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Printer size={16}/></button>
                </div>
              </div>
              {remoteChanged&&<div className="flex items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-800"><span>別の編集者が更新しました。自分の入力があるため自動上書きしていません。</span><button type="button" onClick={()=>{dirty.current=false;setRemoteChanged(false);void loadNotes();}} className="font-bold underline">最新内容を読み直す</button></div>}

              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-5xl space-y-3 px-4 py-4 sm:px-8 sm:py-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={currentFolder} disabled={!owner} onChange={event=>{setCurrentFolder(event.target.value);folderRef.current=event.target.value;markDirty();}} className="max-w-[190px] rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] text-slate-600"><option value="">フォルダなし</option>{folders.map(folder=><option key={folder.id} value={folder.id}>{folder.name}</option>)}</select>
                    <select value={assignmentId} disabled={!canEdit} onChange={event=>{setAssignmentId(event.target.value);assignmentRef.current=event.target.value;markDirty();}} className="max-w-[220px] rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] text-slate-600"><option value="">課題とリンク（任意）</option>{assignments.map(a=><option key={a.id} value={a.id}>{a.title}</option>)}</select>
                    <span className="flex items-center gap-1 text-[10px] text-slate-400"><Lock size={11}/>{selected.visibility==='shared'?'共有ノート':'非公開'}</span>
                  </div>
                  <input value={title} readOnly={!canEdit} onChange={event=>{setTitle(event.target.value);titleRef.current=event.target.value;markDirty();}} placeholder="メモのタイトル" className="w-full border-0 bg-transparent px-0 py-1 text-2xl font-black tracking-tight text-slate-900 outline-none placeholder:text-slate-300 sm:text-3xl"/>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] font-bold text-slate-500"><Tag size={12}/><span>{tags.map(t=>'#'+t).join('、')||'タグ'}</span><input value={tagText} disabled={!canEdit} onChange={event=>setTagText(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&tagText.trim()){event.preventDefault();const next=[...new Set([...tags,tagText.trim().replace(/^#/,'').slice(0,24)])];setTags(next);tagsRef.current=next;setTagText('');markDirty();}}} placeholder="追加してEnter" className="w-24 border-0 bg-transparent outline-none"/></label>
                    <div className="flex items-center gap-1">{COLORS.map(color=><button type="button" key={color.id} disabled={!owner} onClick={()=>void updateNote(selected,{color:color.id})} title={color.name} className={'h-5 w-5 rounded-full border-2 '+(selected.color===color.id?'border-slate-700':'border-white')} style={{backgroundColor:color.hex}}/>)}</div>
                    <select aria-label="ノートアイコン" disabled={!owner} value={selected.icon||'📝'} onChange={event=>void updateNote(selected,{icon:event.target.value})} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"><option>📝</option><option>📚</option><option>💡</option><option>📌</option><option>🎓</option><option>📅</option><option>⭐</option><option>🧪</option><option>✏️</option></select>
                  </div>

                  {canEdit&&<div className="sticky top-0 z-10 space-y-2 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur">
                    <div className="flex flex-wrap items-center gap-1">
                      {toolbar('太字',<Bold size={15}/>,()=>command('bold'))}{toolbar('斜体',<Italic size={15}/>,()=>command('italic'))}
                      {toolbar('下線',<Underline size={15}/>,()=>command('underline'))}{toolbar('取り消し線',<Strikethrough size={15}/>,()=>command('strikeThrough'))}
                      <select aria-label="見出し" defaultValue="p" onChange={event=>command('formatBlock',event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[11px]"><option value="p">本文</option><option value="h1">見出し1</option><option value="h2">見出し2</option><option value="h3">見出し3</option><option value="h4">見出し4</option></select>
                      {toolbar('箇条書き',<List size={15}/>,()=>command('insertUnorderedList'))}{toolbar('番号リスト',<ListOrdered size={15}/>,()=>command('insertOrderedList'))}
                      {toolbar('チェックリスト',<CheckSquare size={15}/>,()=>insertHtml('<ul><li><input type="checkbox"> チェック項目</li></ul>'))}
                      {toolbar('引用',<Quote size={15}/>,()=>command('formatBlock','blockquote'))}{toolbar('コード',<Code2 size={15}/>,()=>insertHtml('<pre><code>コードを入力</code></pre>'))}
                      {toolbar('表を挿入',<Table2 size={15}/>,()=>insertHtml('<table><tbody><tr><th>項目</th><th>内容</th></tr><tr><td><br></td><td><br></td></tr></tbody></table><p><br></p>'))}
                      {toolbar('区切り線',<MoreHorizontal size={15}/>,()=>insertHtml('<hr><p><br></p>'))}
                      {toolbar('折りたたみ',<ChevronDown size={15}/>,insertCollapsible)}
                      {toolbar('ブロックを上へ',<ArrowLeft size={15}/>,()=>moveCurrentBlock('up'))}
                      {toolbar('ブロックを下へ',<ArrowRight size={15}/>,()=>moveCurrentBlock('down'))}
                      {toolbar('数式記号',<Sigma size={15}/>,()=>insertText('∫ₐᵇ　∑ₖ₌₁ⁿ　limₓ→ₐ　√　π　∂　Δ　∞　×　÷'))}
                      {toolbar('元に戻す',<Undo2 size={15}/>,()=>command('undo'))}{toolbar('やり直す',<Redo2 size={15}/>,()=>command('redo'))}
                      <label className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[10px] text-slate-500">文字色<input type="color" defaultValue="#1d4ed8" onChange={event=>command('foreColor',event.target.value)} className="h-5 w-5 border-0 bg-transparent"/></label>
                      <label className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[10px] text-slate-500"><Highlighter size={13}/><input type="color" defaultValue="#fef08a" onChange={event=>command('hiliteColor',event.target.value)} className="h-5 w-5 border-0 bg-transparent"/></label>
                      {toolbar('中央揃え',<MoreHorizontal size={15}/>,()=>command('justifyCenter'))}
                      <button type="button" onClick={()=>{const url=window.prompt('リンク先URLを入力してください。','https://');if(url&&/^https?:\/\//i.test(url))command('createLink',url);}} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[10px] text-slate-500"><Link2 size={14}/>リンク</button>
                      <label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-2 text-[10px] text-slate-500"><ImagePlus size={14}/>画像<input type="file" accept="image/*" className="hidden" onChange={event=>{const file=event.target.files?.[0];if(file)void uploadFile(file,true);event.currentTarget.value='';}}/></label>
                      <label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-2 text-[10px] text-slate-500"><Paperclip size={14}/>添付<input type="file" className="hidden" onChange={event=>{const file=event.target.files?.[0];if(file)void uploadFile(file,false);event.currentTarget.value='';}}/></label>
                      <button type="button" onClick={openDrawing} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[10px] text-slate-500"><PenLine size={14}/>手書き</button>
                      <label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-2 text-[10px] text-slate-500"><FilePlus2 size={14}/>取り込み<input type="file" accept=".txt,.md,.markdown,.html,.htm,.pdf,image/*" className="hidden" onChange={event=>{const file=event.target.files?.[0];if(file)void importFile(file);event.currentTarget.value='';}}/></label>
                    </div>
                  </div>}

                  <div ref={editor} contentEditable={canEdit} suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="メモ本文" onInput={markDirty} onPaste={onPaste} onClick={event=>{const box=(event.target as HTMLElement).closest('input[type="checkbox"]') as HTMLInputElement|null;if(box){if(box.checked)box.setAttribute('checked','');else box.removeAttribute('checked');markDirty();}}} className={'campus-note-editor min-h-[48vh] rounded-xl px-1 py-4 text-[15px] leading-8 text-slate-800 outline-none '+(canEdit?'':'cursor-default')} data-placeholder="ここにメモを入力…"/>
                  {ocrOutput&&<div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><div className="flex items-center justify-between"><p className="text-xs font-black text-amber-900">OCR読み取り結果</p><button type="button" onClick={()=>setOcrOutput('')}><X size={14}/></button></div><textarea value={ocrOutput} onChange={event=>setOcrOutput(event.target.value)} rows={6} className="mt-2 w-full rounded-lg border border-amber-200 bg-white p-2 text-xs leading-5"/><button type="button" onClick={()=>{insertText(ocrOutput);setOcrOutput('');}} className="mt-2 rounded-lg bg-amber-700 px-3 py-2 text-[11px] font-bold text-white">本文に挿入</button></div>}
                  {ocrBusy&&<div className="flex items-center gap-2 rounded-xl bg-cyan-50 p-3 text-xs text-cyan-800"><Loader2 size={15} className="animate-spin"/>{ocrStatus}</div>}
                  {attachments.length>0&&<section className="rounded-xl border border-slate-200 p-3"><div className="mb-2 flex items-center justify-between"><h3 className="flex items-center gap-2 text-xs font-black"><Paperclip size={14}/>添付ファイル</h3><span className="text-[10px] text-slate-400">{attachments.length}件</span></div><div className="space-y-2">{attachments.map(file=><div key={file.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"><FileText size={15} className="shrink-0 text-slate-400"/><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{file.file_name}</p><p className="text-[10px] text-slate-400">{formatBytes(Number(file.file_size))} ・ {dateText(file.created_at)}</p></div>{file.signedUrl&&<a href={file.signedUrl} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-cyan-700">開く</a>}{owner&&<button type="button" onClick={()=>void deleteAttachment(file)} className="rounded p-1 text-slate-400 hover:text-rose-600"><Trash2 size={14}/></button>}</div>)}</div></section>}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={()=>exportNote('md')} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600">Markdown出力</button>
                      <button type="button" onClick={()=>exportNote('txt')} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600">TXT出力</button>
                      {owner&&<button type="button" onClick={()=>void updateNote(selected,{is_archived:!selected.is_archived})} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600">{selected.is_archived?'アーカイブ解除':'アーカイブ'}</button>}
                      {canEdit&&<button type="button" onClick={()=>void addCheckedTodos()} className="rounded-lg border border-cyan-200 px-3 py-2 text-[10px] font-bold text-cyan-700">チェック項目をToDoへ</button>}
                      {owner&&<button type="button" onClick={()=>void trashNote(selected)} className="rounded-lg border border-rose-200 px-3 py-2 text-[10px] font-bold text-rose-600">{selected.deleted_at?'完全に削除':'ゴミ箱へ'}</button>}
                    </div>
                    {canEdit&&<button type="button" onClick={()=>void saveNow()} disabled={saving} className="rounded-lg bg-cyan-700 px-4 py-2 text-[11px] font-black text-white disabled:opacity-50">{saving?'保存中…':'今すぐ保存'}</button>}
                  </div>
                </div>
              </div>
            </>
          ):<div className="flex min-h-[55vh] flex-col items-center justify-center px-6 text-center"><div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700"><BookOpen size={30}/></div><h2 className="mt-4 text-lg font-black">CampusSync メモ</h2><p className="mt-2 max-w-sm text-xs leading-6 text-slate-500">授業ノート、アイデア、議事録、テスト対策をひとつに。左の一覧からメモを選ぶか、新しいメモを作成してください。</p><button type="button" onClick={()=>void createNote()} className="mt-4 rounded-xl bg-cyan-700 px-4 py-3 text-xs font-black text-white"><Plus size={14} className="mr-1 inline"/>メモを作成</button></div>}
        </section>
      </div>

      {error&&<div role="alert" className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-start gap-2 rounded-xl border border-rose-200 bg-white px-4 py-3 text-xs font-semibold text-rose-700 shadow-xl"><X size={15}/><span>{error}</span><button type="button" onClick={()=>setError('')} className="ml-2"><X size={14}/></button></div>}
      {showShare&&selected&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-base font-black">メモを共有</h2><button type="button" onClick={()=>setShowShare(false)}><X size={18}/></button></div><p className="mt-2 text-xs leading-5 text-slate-500">共有相手の学校アカウントの6桁の学籍番号を入力します。閲覧のみ、または編集可能を選べます。</p><div className="mt-4 grid grid-cols-[1fr_120px] gap-2"><input inputMode="numeric" maxLength={6} value={shareId} onChange={event=>setShareId(event.target.value.replace(/\D/g,''))} placeholder="6桁の学籍番号" className="min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/><select value={shareRole} onChange={event=>setShareRole(event.target.value as 'viewer'|'editor')} className="rounded-xl border border-slate-200 px-2 text-xs"><option value="viewer">閲覧のみ</option><option value="editor">編集可能</option></select></div><button type="button" onClick={()=>void invite()} className="mt-2 rounded-xl bg-cyan-700 px-4 py-2.5 text-xs font-black text-white"><Users size={14} className="mr-1 inline"/>共有相手を追加</button><div className="mt-4 space-y-2"><h3 className="text-xs font-black">共有メンバー</h3>{shares.length===0?<p className="text-xs text-slate-400">まだ共有していません。</p>:shares.map(share=><div key={share.user_id} className="flex items-center gap-2 rounded-lg bg-slate-50 p-2"><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{share.student_name}</p><p className="text-[10px] text-slate-400">{share.student_id} ・ {share.role==='editor'?'編集可能':'閲覧のみ'}</p></div><button type="button" onClick={()=>void removeShare(share.user_id)} className="text-[10px] font-bold text-rose-600">解除</button></div>)}</div></div></div>}
      {showComments&&selected&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="font-black">コメント・共同メモ</h2><button type="button" onClick={()=>setShowComments(false)}><X size={18}/></button></div><div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">{comments.map(comment=><div key={comment.id} className="rounded-xl bg-slate-50 p-3"><p className="whitespace-pre-wrap text-xs leading-5 text-slate-700">{comment.body}</p><p className="mt-1 text-[10px] text-slate-400">{comment.user_id===userId?'自分':'共同編集者'} ・ {dateText(comment.created_at)}</p></div>)}{comments.length===0&&<p className="py-8 text-center text-xs text-slate-400">まだコメントはありません。</p>}</div><form onSubmit={addComment} className="mt-3 flex gap-2"><input value={commentText} onChange={event=>setCommentText(event.target.value)} placeholder="コメントを書く" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-xs"/><button type="submit" className="rounded-xl bg-cyan-700 px-3 text-white"><Send size={15}/></button></form></div></div>}
      {showVersions&&selected&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="font-black">編集履歴</h2><button type="button" onClick={()=>setShowVersions(false)}><X size={18}/></button></div><div className="mt-4 space-y-2">{versions.map(version=><div key={version.id} className="rounded-xl border border-slate-200 p-3"><p className="text-xs font-bold">{version.title}</p><p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[11px] text-slate-500">{version.content_text}</p><div className="mt-2 flex items-center justify-between"><span className="text-[10px] text-slate-400">{dateText(version.created_at)}</span><button type="button" disabled={!canEdit} onClick={()=>void restoreVersion(version)} className="text-[10px] font-bold text-cyan-700 disabled:opacity-40">この版に戻す</button></div></div>)}{versions.length===0&&<p className="py-8 text-center text-xs text-slate-400">編集・保存すると履歴が作られます。</p>}</div></div></div>}
      {showAi&&selected&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-black"><WandSparkles size={17} className="text-violet-600"/>メモ文章アシスタント</h2><button type="button" onClick={()=>setShowAi(false)}><X size={18}/></button></div><p className="mt-2 text-xs leading-5 text-slate-500">要約・語句抽出・暗記カード・見出し整理・ToDo候補を作成します。AI APIが設定されている場合は、操作したときだけ本文をAIサービスへ送信します。未設定なら端末内の文章整理を使います。</p><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{([['summary','要約'],['keywords','重要語句'],['flashcards','暗記カード'],['organize','見出し整理'],['todos','ToDo候補']] as Array<[AiAction,string]>).map(([action,label])=><button type="button" key={action} onClick={()=>void runAi(action)} disabled={aiBusy} className={'rounded-xl border px-3 py-2.5 text-xs font-bold '+(aiAction===action?'border-violet-300 bg-violet-50 text-violet-800':'border-slate-200 text-slate-600 hover:bg-slate-50')}>{label}</button>)}</div>{aiBusy&&<div className="mt-4 flex items-center gap-2 text-xs text-violet-700"><Loader2 size={15} className="animate-spin"/>文章を整理しています…</div>}{aiOutput&&<div className="mt-4 rounded-xl border border-violet-100 bg-violet-50 p-3"><pre className="whitespace-pre-wrap break-words text-xs leading-6 text-slate-700">{aiOutput}</pre>{aiAction==='todos'&&<button type="button" onClick={()=>void addTodos(aiOutput)} className="mt-3 rounded-lg bg-violet-700 px-3 py-2 text-[11px] font-bold text-white">CampusSync ToDoに追加</button>}</div>}{aiCards.length>0&&<div className="mt-3 grid gap-2 sm:grid-cols-2">{aiCards.map((card,index)=><div key={index} className="rounded-xl border border-slate-200 p-3"><p className="text-xs font-black text-violet-800">Q. {card.question}</p><p className="mt-2 text-xs leading-5 text-slate-600">A. {card.answer}</p></div>)}</div>}</div></div>}
      {handwriting&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3"><div className="w-full max-w-5xl rounded-2xl bg-white p-4 shadow-2xl"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-black">手書きノート</h2><div className="flex items-center gap-2"><label className="text-xs text-slate-500">ペン色 <input type="color" value={penColor} onChange={event=>setPenColor(event.target.value)}/></label><button type="button" onClick={()=>{const ctx=canvas.current?.getContext('2d');if(canvas.current&&ctx){ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.current.width,canvas.current.height);}}} className="rounded-lg border px-3 py-2 text-xs">消去</button><button type="button" onClick={()=>setHandwriting(false)}><X size={18}/></button></div></div><p className="mt-1 text-[11px] text-slate-500">マウス・タッチ・ペンで書けます。保存するとノートの添付画像になります。</p><canvas ref={canvas} width={1400} height={650} onPointerDown={startDrawing} onPointerMove={moveDrawing} className="mt-3 h-[55vh] w-full touch-none rounded-xl border border-slate-200 bg-white"/><button type="button" onClick={()=>void saveDrawing()} className="mt-3 rounded-xl bg-cyan-700 px-4 py-2.5 text-xs font-black text-white">手書き画像を保存</button></div></div>}
      {loading===false&&notes.length===0&&null}
    </div>
  );
  
  function ownerOrTrash(note:CampusNote){return note.owner_id===userId;}
}
