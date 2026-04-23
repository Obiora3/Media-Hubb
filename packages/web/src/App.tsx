// @ts-nocheck
import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react"
import { useAuth } from "@/hooks/useAuth"
import { useSupabaseTable } from "@/hooks/useSupabaseTable"
import { AuthScreen } from "@/components/auth/AuthScreen"
import { supabase } from "@/lib/supabase"

/* ═══ HELPERS ═══ */
const todayStr = new Date().toISOString().slice(0,10);
const fmt  = (n, sym="₦") => sym + Number(n).toLocaleString("en-NG");
const fmtK = (n, sym="₦") => n>=1e6?sym+(n/1e6).toFixed(1)+"M":n>=1e3?sym+(n/1e3).toFixed(0)+"K":fmt(n,sym);
const daysUntil = d => Math.ceil((new Date(d)-new Date(todayStr))/864e5);
const computeStatus = r => r.paid>=r.amount?"paid":r.paid>0?"partial":r.due<todayStr?"overdue":"pending";
const nextId = (list,pfx) => { const ns=list.map(x=>parseInt(x.id.replace(pfx+"-",""),10)).filter(n=>!isNaN(n)); return pfx+"-"+String((ns.length?Math.max(...ns):0)+1).padStart(3,"0"); };
const shortId = (id="") => {
  if(!id) return "—";
  if(id.startsWith("MPO-")) return id.replace(/^MPO-/,"#");
  // UUID from Supabase — show first 8 chars
  return "#"+id.slice(0,8).toUpperCase();
};
const campaignMonth = (dateStr="") => {
  if(!dateStr) return "—";
  try{ return new Date(dateStr.length===7?dateStr+"-01T12:00:00":dateStr+"T12:00:00").toLocaleDateString("en-NG",{month:"short",year:"numeric"});}
  catch{return "—";}
};
const tsNow = () => new Date().toLocaleString("en-NG",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});

// usePersisted removed — data layer replaced by Supabase hooks in function App()

const TAG_COLORS={create:"#EAF3DE",workflow:"#E6F1FB",payment:"#FAEEDA",reminder:"#EEEDFE",delete:"#FCEBEB",update:"#F1EFE8"};
const TAG_TEXT={create:"#3B6D11",workflow:"#185FA5",payment:"#854F0B",reminder:"#3C3489",delete:"#A32D2D",update:"#5F5E5A"};
const WF_STEPS=["draft","review","approved","sent"];
const WF_COLORS={draft:"badge-gray",review:"badge-amber",approved:"badge-blue",sent:"badge-green"};
const WF_NEXT={draft:"review",review:"approved",approved:"sent"};
const WF_LABELS={draft:"Draft",review:"In Review",approved:"Approved",sent:"Sent"};
const CH_COLORS={TV:"#534AB7",Print:"#185FA5",Radio:"#854F0B",Digital:"#3B6D11"};

/* ═══ S5-2: CURRENCIES ═══ */
const CURRENCIES={
  NGN:{symbol:"₦",name:"Nigerian Naira",  flag:"🇳🇬",rate:1},
  USD:{symbol:"$",name:"US Dollar",        flag:"🇺🇸",rate:0.00063},
  GBP:{symbol:"£",name:"British Pound",    flag:"🇬🇧",rate:0.00050},
  EUR:{symbol:"€",name:"Euro",             flag:"🇪🇺",rate:0.00058},
  GHS:{symbol:"₵",name:"Ghanaian Cedi",   flag:"🇬🇭",rate:0.0095},
  KES:{symbol:"Ksh",name:"Kenyan Shilling",flag:"🇰🇪",rate:0.083},
};
// Convert amount from source currency to display currency
const convertAmt = (amount, fromCcy, toCcy) => {
  if(fromCcy===toCcy) return amount;
  const ngnAmt = fromCcy==="NGN" ? amount : amount / CURRENCIES[fromCcy].rate;
  return toCcy==="NGN" ? ngnAmt : ngnAmt * CURRENCIES[toCcy].rate;
};
const fmtCcy = (amount, fromCcy="NGN", toCcy="NGN") => {
  const converted = convertAmt(amount, fromCcy, toCcy);
  const sym = CURRENCIES[toCcy]?.symbol || "₦";
  if(converted>=1e6) return sym+(converted/1e6).toFixed(2)+"M";
  if(converted>=1e3) return sym+(converted/1e3).toFixed(1)+"K";
  return sym+converted.toLocaleString("en",{maximumFractionDigits:2});
};

/* ═══ SHARED COMPONENTS ═══ */
const BMAP={active:"badge-green",pending:"badge-amber",completed:"badge-blue",delayed:"badge-red",overdue:"badge-red",paid:"badge-green",partial:"badge-amber","on-track":"badge-green"};
function SBadge({s}){return <span className={`badge ${BMAP[s]||"badge-gray"}`}>{s}</span>;}
function WFBadge({s}){return <span className={`badge ${WF_COLORS[s]||"badge-gray"}`}>{WF_LABELS[s]||s}</span>;}

function useToast(){
  const [ts,setTs]=useState([]);
  const show=useCallback((msg,type="success")=>{
    const id=Date.now();
    setTs(t=>[...t,{id,msg,type}]);
    setTimeout(()=>setTs(t=>t.map(x=>x.id===id?{...x,v:true}:x)),10);
    setTimeout(()=>setTs(t=>t.filter(x=>x.id!==id)),3400);
  },[]);
  return{ts,show};
}
function Toasts({ts}){return <div className="toast-wrap" aria-live="polite">{ts.map(t=><div key={t.id} className={`toast toast-${t.type} ${t.v?"show":""}`}>{t.msg}</div>)}</div>;}

function Modal({title,onClose,children,wide}){
  useEffect(()=>{const h=e=>e.key==="Escape"&&onClose();document.addEventListener("keydown",h);return()=>document.removeEventListener("keydown",h);},[onClose]);
  return(
    <div className="modal-bg" role="dialog" aria-modal="true" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={wide?{maxWidth:680}:{}}>
        <div className="modal-header"><span className="modal-title">{title}</span><button className="close-btn" onClick={onClose}>✕</button></div>
        {children}
      </div>
    </div>
  );
}
function FF({id,label,error,err,required,children,style}){const msg=error||err;return <div className="form-row" style={style}><label className="form-label" htmlFor={id}>{label}{required&&<span style={{color:"#e53e3e",marginLeft:2,fontWeight:700}}>*</span>}</label>{children}{msg&&<div className="form-error">{msg}</div>}</div>;}
function RoleGuard({user,require,children}){
  if(!user.permissions.includes(require)) return <div className="role-lock">🔒 Your role ({user.role}) does not have access to this section.</div>;
  return children;
}
function Toggle({on,onToggle,label}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      {label&&<span style={{fontSize:13,color:"var(--text)"}}>{label}</span>}
      <div className="toggle-pill" style={{background:on?"var(--brand)":"var(--bg3)"}} onClick={onToggle}>
        <div className="toggle-thumb" style={{left:on?20:3}}/>
      </div>
    </div>
  );
}

/* ═══ SVG CHARTS ═══ */
function DonutChart({data,size=160}){
  const [hov,setHov]=useState(null);
  const [mounted,setMounted]=useState(false);
  useEffect(()=>{setTimeout(()=>setMounted(true),60);},[]);
  const total=data.reduce((a,d)=>a+d.value,0);
  const cx=size/2,cy=size/2,r=size*.35,sw=size*.14;
  let cum=-Math.PI/2;
  const slices=data.map((d)=>{
    const ang=total>0?(d.value/total)*2*Math.PI:.001;
    const sa=cum;cum+=ang;const ea=cum;
    const ir=r-sw/2,or=r+sw/2;
    const rp=`M ${cx+ir*Math.cos(sa)} ${cy+ir*Math.sin(sa)} A ${ir} ${ir} 0 ${ang>Math.PI?1:0} 1 ${cx+ir*Math.cos(ea)} ${cy+ir*Math.sin(ea)} L ${cx+or*Math.cos(ea)} ${cy+or*Math.sin(ea)} A ${or} ${or} 0 ${ang>Math.PI?1:0} 0 ${cx+or*Math.cos(sa)} ${cy+or*Math.sin(sa)} Z`;
    return{...d,rp,pct:total>0?Math.round(d.value/total*100):0};
  });
  const h=hov!==null?slices[hov]:null;
  return(
    <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
      <svg width={size} height={size} style={{flexShrink:0}}>
        {slices.map((s,i)=><path key={i} d={s.rp} fill={s.color} opacity={hov===null||hov===i?1:.35} style={{cursor:"pointer",transition:"opacity .15s"}} onMouseEnter={()=>setHov(i)} onMouseLeave={()=>setHov(null)}/>)}
        <text x={cx} y={cy-7} textAnchor="middle" fontSize={10} fill="var(--text3)">{h?h.label:"Total"}</text>
        <text x={cx} y={cy+8} textAnchor="middle" fontSize={14} fontWeight="700" fill="var(--text)">{h?`${h.pct}%`:data.length}</text>
        <text x={cx} y={cy+20} textAnchor="middle" fontSize={9} fill="var(--text3)">{h?fmtK(h.value):"segments"}</text>
      </svg>
      <div style={{flex:1,minWidth:80}}>
        {slices.map((s,i)=>(
          <div key={i} className="legend-item" style={{opacity:hov===null||hov===i?1:.4,transition:"opacity .15s"}} onMouseEnter={()=>setHov(i)} onMouseLeave={()=>setHov(null)}>
            <div className="legend-dot" style={{background:s.color}}/><span style={{flex:1}}>{s.label}</span><strong style={{fontSize:11}}>{s.pct}%</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
function BarChart({data,height=170,colors=["#534AB7","#D85A30"]}){
  const [mounted,setMounted]=useState(false);const [tip,setTip]=useState(null);
  useEffect(()=>{setTimeout(()=>setMounted(true),80);},[]);
  const isG=Array.isArray(data[0]?.values);
  const allV=isG?data.flatMap(d=>d.values):data.map(d=>d.value);
  const maxV=Math.max(...allV,1);
  const W=500,H=height,pL=52,pB=26,pT=14,pR=4,pw=W-pL-pR,ph=H-pB-pT,gw=pw/data.length;
  const bc=isG?data[0].values.length:1,bw=Math.min((gw-6)/bc,44);
  const tks=Array.from({length:5},(_,i)=>({v:Math.round(maxV*i/4),y:pT+ph*(1-i/4)}));
  return(
    <div style={{position:"relative"}}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height,overflow:"visible"}}>
        {tks.map((t,i)=><g key={i}><line x1={pL} y1={t.y} x2={W-pR} y2={t.y} stroke="var(--border-c)" strokeWidth=".5"/><text x={pL-6} y={t.y+3} textAnchor="end" fontSize={9} fill="var(--text3)">{fmtK(t.v)}</text></g>)}
        {data.map((d,gi)=>{
          const cx2=pL+gi*gw+gw/2,vals=isG?d.values:[d.value];
          return <g key={gi}>{vals.map((v,bi)=>{const bh=mounted?(v/maxV)*ph:0,bx=cx2-(bc*bw+(bc-1)*2)/2+bi*(bw+2),by=pT+ph-bh;return <rect key={bi} x={bx} y={by} width={bw} height={bh} rx={3} fill={colors[bi%colors.length]} style={{transition:"height .5s,y .5s",cursor:"pointer"}} onMouseEnter={()=>setTip({gx:(bx+bw/2)/W,gy:by/H,txt:`${d.label}: ${fmtK(v)}`,col:colors[bi%colors.length]})} onMouseLeave={()=>setTip(null)}/>;})}<text x={cx2} y={H-6} textAnchor="middle" fontSize={9} fill="var(--text3)">{d.label}</text></g>;
        })}
      </svg>
      {tip&&<div className="viz-tooltip" style={{left:tip.gx*100+"%",top:tip.gy*100+"%",borderLeft:`3px solid ${tip.col}`}}>{tip.txt}</div>}
    </div>
  );
}

/* ═══ S5-5: ADVANCED VISUALISATIONS ═══ */

/* Activity Heatmap – shows MPO count per weekday×month */
function ActivityHeatmap({mpos}){
  const DAYS=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const [tip,setTip]=useState(null);
  // build counts grid [month][dow]
  const grid=Array.from({length:12},()=>Array(7).fill(0));
  mpos.forEach(m=>{
    const d=new Date(m.start);
    const mo=d.getMonth(),dow=(d.getDay()+6)%7; // 0=Mon
    grid[mo][dow]++;
  });
  const maxVal=Math.max(...grid.flat(),1);
  const cellW=34,cellH=20,padL=36,padT=20;
  const W=padL+7*cellW+10,H=padT+12*cellH+20;
  return(
    <div style={{position:"relative",overflowX:"auto"}}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",minWidth:300,height:H}}>
        {DAYS.map((d,i)=><text key={d} x={padL+i*cellW+cellW/2} y={14} textAnchor="middle" fontSize={9} fill="var(--text3)">{d}</text>)}
        {MONTHS.map((mo,mi)=>(
          <g key={mo}>
            <text x={padL-4} y={padT+mi*cellH+14} textAnchor="end" fontSize={9} fill="var(--text3)">{mo}</text>
            {DAYS.map((_,di)=>{
              const v=grid[mi][di],alpha=v>0?0.15+0.85*(v/maxVal):0.04;
              return <rect key={di} className="heatmap-cell" x={padL+di*cellW+2} y={padT+mi*cellH+2} width={cellW-4} height={cellH-4} rx={3}
                fill={v>0?`rgba(83,74,183,${alpha.toFixed(2)})`:"var(--bg3)"}
                onMouseEnter={e=>setTip({x:padL+di*cellW+cellW/2,y:padT+mi*cellH,txt:`${MONTHS[mi]} ${DAYS[di]}: ${v} MPO${v!==1?"s":""}`,W})}
                onMouseLeave={()=>setTip(null)}/>;
            })}
          </g>
        ))}
        {tip&&<text x={Math.min(tip.x,tip.W-80)} y={tip.y-4} fontSize={9} fill="var(--text)" fontWeight="600">{tip.txt}</text>}
      </svg>
      <div style={{display:"flex",alignItems:"center",gap:6,marginTop:8,fontSize:10,color:"var(--text3)"}}>
        <span>Less</span>
        {[.1,.3,.5,.75,1].map((a,i)=><div key={i} style={{width:12,height:12,borderRadius:2,background:`rgba(83,74,183,${a})`}}/>)}
        <span>More</span>
      </div>
    </div>
  );
}

/* Revenue Scatter — amount vs duration */
function RevenueScatter({mpos}){
  const [tip,setTip]=useState(null);
  const data=mpos.map(m=>{
    const days=(new Date(m.end)-new Date(m.start))/864e5;
    return{...m,days,x:days,y:m.amount};
  });
  const maxX=Math.max(...data.map(d=>d.x),1);
  const maxY=Math.max(...data.map(d=>d.y),1);
  const W=500,H=220,pL=48,pB=28,pT=16,pR=16;
  const pw=W-pL-pR,ph=H-pB-pT;
  const toSvgX=x=>pL+x/maxX*pw;
  const toSvgY=y=>pT+ph-(y/maxY*ph);
  return(
    <div style={{position:"relative"}}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:H,overflow:"visible"}}>
        {[0,.25,.5,.75,1].map((t,i)=>(
          <g key={i}>
            <line x1={pL} y1={pT+ph*(1-t)} x2={W-pR} y2={pT+ph*(1-t)} stroke="var(--border-c)" strokeWidth=".5"/>
            <text x={pL-4} y={pT+ph*(1-t)+4} textAnchor="end" fontSize={8} fill="var(--text3)">{fmtK(maxY*t)}</text>
          </g>
        ))}
        {[0,.25,.5,.75,1].map((t,i)=>(
          <text key={i} x={pL+pw*t} y={H-8} textAnchor="middle" fontSize={8} fill="var(--text3)">{Math.round(maxX*t)}d</text>
        ))}
        {data.map((d,i)=>(
          <circle key={d.id} className="scatter-dot" cx={toSvgX(d.x)} cy={toSvgY(d.y)} r={8}
            fill={CH_COLORS[d.channel]||"#534AB7"} opacity={.75}
            onMouseEnter={()=>setTip({cx:toSvgX(d.x),cy:toSvgY(d.y),txt:`${d.campaign} · ${fmtK(d.amount)} · ${Math.round(d.days)}d`})}
            onMouseLeave={()=>setTip(null)}/>
        ))}
      </svg>
      {tip&&<div className="viz-tooltip" style={{left:tip.cx/W*100+"%",top:tip.cy/H*100+"%"}}>{tip.txt}</div>}
      <div style={{display:"flex",gap:12,marginTop:6,flexWrap:"wrap"}}>
        {Object.entries(CH_COLORS).map(([ch,c])=><div key={ch} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"var(--text2)"}}><div style={{width:8,height:8,borderRadius:"50%",background:c}}/>{ch}</div>)}
      </div>
    </div>
  );
}

/* Cash flow area chart */
function AreaChart({data,height=160,color="#534AB7"}){
  const [mounted,setMounted]=useState(false);
  useEffect(()=>{setTimeout(()=>setMounted(true),80);},[]);
  const [tip,setTip]=useState(null);
  const maxV=Math.max(...data.map(d=>d.value),1);
  const W=500,H=height,pL=8,pB=24,pT=12,pR=8,pw=W-pL-pR,ph=H-pB-pT;
  const pts=data.map((d,i)=>({x:pL+(data.length>1?i/(data.length-1):0.5)*pw,y:pT+ph*(1-d.value/maxV),...d}));
  const linePts=pts.map(p=>`${p.x},${mounted?p.y:pT+ph}`).join(" ");
  const areaPts=`${pL},${pT+ph} ${linePts} ${pL+pw},${pT+ph}`;
  return(
    <div style={{position:"relative"}}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height,overflow:"visible"}}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25"/>
            <stop offset="100%" stopColor={color} stopOpacity="0.02"/>
          </linearGradient>
        </defs>
        <polygon points={areaPts} fill="url(#areaGrad)" style={{transition:"all .6s ease"}}/>
        <polyline points={linePts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" style={{transition:"all .6s ease"}}/>
        {pts.map((p,i)=>(
          <g key={i}>
            <circle cx={p.x} cy={mounted?p.y:pT+ph} r={4} fill={color} style={{transition:"cy .6s ease"}}
              onMouseEnter={()=>setTip({x:p.x/W*100,y:(mounted?p.y:pT+ph)/H*100,txt:`${p.label}: ${fmtK(p.value)}`})}
              onMouseLeave={()=>setTip(null)}/>
            <text x={p.x} y={H-6} textAnchor="middle" fontSize={9} fill="var(--text3)">{p.label}</text>
          </g>
        ))}
      </svg>
      {tip&&<div className="viz-tooltip" style={{left:tip.x+"%",top:tip.y+"%"}}>{tip.txt}</div>}
    </div>
  );
}

/* ═══ S5-3: DOCUMENT ATTACHMENT ═══ */
const DOC_ICONS={"pdf":"📄","doc":"📝","docx":"📝","xls":"📊","xlsx":"📊","png":"🖼","jpg":"🖼","default":"📎"};
function docIcon(name){const ext=name.split(".").pop().toLowerCase();return DOC_ICONS[ext]||DOC_ICONS.default;}

function DocPanel({entityId,entityDocs,onSave,canEdit,workspaceId,currentUser}){
  const [drag,setDrag]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [uploadErr,setUploadErr]=useState(null);
  const inputRef=useRef(null);

  const uploadFiles=async(files)=>{
    if(!files.length) return;
    setUploading(true);setUploadErr(null);
    const newDocs=[...entityDocs];
    for(const file of Array.from(files)){
      const docId=`doc-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
      const path=`${workspaceId||"shared"}/${entityId}/${docId}-${file.name}`;
      const {error}=await supabase.storage.from("documents").upload(path,file,{upsert:false});
      if(error){setUploadErr(`Upload failed: ${error.message}`);continue;}
      newDocs.push({id:docId,name:file.name,size:file.size,type:file.type,ts:tsNow(),uploadedBy:currentUser?.name||"You",path});
    }
    onSave(newDocs);
    setUploading(false);
  };

  const openDoc=async(doc)=>{
    if(!doc.path){
      // Legacy doc with no storage path — nothing to open
      return;
    }
    const {data,error}=await supabase.storage.from("documents").createSignedUrl(doc.path,3600);
    if(error||!data?.signedUrl){alert("Could not load file. It may have been deleted.");return;}
    window.open(data.signedUrl,"_blank");
  };

  const removeDoc=async(doc)=>{
    if(doc.path){
      await supabase.storage.from("documents").remove([doc.path]);
    }
    onSave(entityDocs.filter(d=>d.id!==doc.id));
  };

  const handleDrop=e=>{e.preventDefault();setDrag(false);uploadFiles(e.dataTransfer.files);};
  const handleInput=e=>uploadFiles(e.target.files);

  return(
    <div>
      <div style={{fontWeight:500,fontSize:13,marginBottom:12,color:"var(--text)"}}>Attachments ({entityDocs.length})</div>
      {canEdit&&(
        <>
          <div className={`doc-drop-zone ${drag?"drag":""}`}
            onDragOver={e=>{e.preventDefault();setDrag(true);}}
            onDragLeave={()=>setDrag(false)}
            onDrop={handleDrop}
            onClick={()=>!uploading&&inputRef.current?.click()}
            style={{opacity:uploading?0.6:1,cursor:uploading?"not-allowed":"pointer"}}>
            {uploading
              ? <><div style={{fontSize:20,marginBottom:6}}>⏳</div><div style={{fontSize:13}}>Uploading…</div></>
              : <><div style={{fontSize:24,marginBottom:6}}>📎</div><div style={{fontSize:13,fontWeight:500}}>Drop files here or click to browse</div><div style={{fontSize:11,marginTop:4,color:"var(--text3)"}}>PDF, Word, Excel, Images · max 50 MB</div></>
            }
          </div>
          <input ref={inputRef} type="file" multiple style={{display:"none"}} onChange={handleInput}/>
          {uploadErr&&<div style={{fontSize:11,color:"#A32D2D",marginTop:6}}>{uploadErr}</div>}
        </>
      )}
      {entityDocs.length===0&&<div style={{fontSize:12,color:"var(--text3)",textAlign:"center",padding:"16px 0"}}>No attachments yet</div>}
      {entityDocs.map(d=>(
        <div key={d.id} className="doc-item" style={{marginTop:8}}>
          <div className="doc-icon" style={{background:"var(--bg3)",cursor:d.path?"pointer":"default"}} onClick={()=>openDoc(d)}>{docIcon(d.name)}</div>
          <div style={{flex:1,minWidth:0,cursor:d.path?"pointer":"default"}} onClick={()=>openDoc(d)}>
            <div style={{fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:d.path?"var(--brand)":"var(--text)"}}>{d.name}</div>
            <div style={{fontSize:11,color:"var(--text3)"}}>{d.ts} · {d.uploadedBy} · {d.size?Math.round(d.size/1024)+"KB":""}</div>
          </div>
          {canEdit&&<button className="btn btn-sm btn-ghost" style={{color:"#A32D2D"}} onClick={()=>removeDoc(d)} title="Remove">✕</button>}
        </div>
      ))}
    </div>
  );
}

/* ═══ S5-4: NOTIFICATION SYSTEM ═══ */
const NOTIF_ICONS={payment:"💰",overdue:"🔴",workflow:"📋",reminder:"🔔",create:"✨",system:"⚙️"};
const NOTIF_BG={payment:"#EAF3DE",overdue:"#FCEBEB",workflow:"#E6F1FB",reminder:"#EEEDFE",create:"#EAF3DE",system:"var(--bg3)"};

function buildNotifications(receivables,payables,mpos){
  const lR=receivables.map(r=>({...r,status:computeStatus(r)}));
  const lP=payables.map(p=>({...p,status:computeStatus(p)}));
  const notifs=[];
  lR.filter(r=>r.status==="overdue").forEach(r=>notifs.push({id:`n-ro-${r.id}`,type:"overdue",title:`Invoice Overdue`,body:`${r.id} · ${r.client} — balance ${fmt(r.amount-r.paid)}`,ts:"Just now",read:false}));
  lP.filter(p=>p.status==="overdue").forEach(p=>notifs.push({id:`n-po-${p.id}`,type:"overdue",title:`Payable Overdue`,body:`${p.id} · ${p.vendor} — ${fmt(p.amount-p.paid)} outstanding`,ts:"Just now",read:false}));
  mpos.filter(m=>m.exec==="delayed").forEach(m=>notifs.push({id:`n-md-${m.id}`,type:"workflow",title:`Campaign Delayed`,body:`${m.id} · ${m.campaign} execution is behind schedule`,ts:"1h ago",read:false}));
  notifs.push({id:"n-sys-1",type:"system",title:"MediaHub Stage 5 loaded",body:"All new features are active. Explore AI, multi-currency, and more.",ts:"Today",read:true});
  return notifs;
}

function NotificationPanel({notifications,onRead,onReadAll,onClose}){
  const unread=notifications.filter(n=>!n.read).length;
  return(
    <div className="notif-panel">
      <div className="notif-header">
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontWeight:600,fontSize:14}}>Notifications</span>
          {unread>0&&<span className="notif-badge">{unread}</span>}
        </div>
        <div style={{display:"flex",gap:8}}>
          {unread>0&&<button className="btn btn-sm btn-ghost" style={{fontSize:11}} onClick={onReadAll}>Mark all read</button>}
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
      </div>
      <div className="notif-list">
        {notifications.length===0&&<div style={{padding:"24px",textAlign:"center",fontSize:12,color:"var(--text3)"}}>No notifications</div>}
        {notifications.map(n=>(
          <div key={n.id} className={`notif-item ${n.read?"":"unread"}`} onClick={()=>onRead(n.id)}>
            <div className="notif-icon-wrap" style={{background:NOTIF_BG[n.type]||"var(--bg3)"}}>{NOTIF_ICONS[n.type]||"📌"}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:n.read?400:600,fontSize:13,color:"var(--text)"}}>{n.title}</div>
              <div style={{fontSize:11,color:"var(--text3)",marginTop:2,lineHeight:1.4}}>{n.body}</div>
              <div style={{fontSize:10,color:"var(--text3)",marginTop:4}}>{n.ts}</div>
            </div>
            {!n.read&&<div className="notif-unread-dot"/>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══ S5-1: AI ASSISTANT ═══ */
function AIPanel(){
  return(
    <div className="ai-panel">
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <span style={{fontSize:13,fontWeight:600,color:"var(--brand)"}}>✦ AI Assistant</span>
        <span className="badge badge-ai" style={{fontSize:10}}>Coming soon</span>
      </div>
      <div style={{fontSize:12,color:"var(--text3)"}}>AI-powered insights will be available in a future update.</div>
    </div>
  );
}

/* ═══ S5-6: SETTINGS PAGE ═══ */
/* ═══ USER PROFILE MODAL ═══ */
const AVATAR_COLORS=["#534AB7","#185FA5","#3B6D11","#A32D2D","#854F0B","#D85A30","#0E7C7B","#1a1a1a","#7B2D8B","#C0392B"];
function ProfileModal({user,onClose,toast}){
  const isAdmin=user?.role==="admin";
  const isManager=user?.role==="manager";
  const canEditRole=isAdmin||isManager;
  const [name,setName]=useState(user?.name||"");
  const [email,setEmail]=useState(user?.email||"");
  const [color,setColor]=useState(user?.color||"#534AB7");
  const [saving,setSaving]=useState(false);
  const initials=name.split(" ").filter(Boolean).map(w=>w[0].toUpperCase()).slice(0,2).join("")||"?";

  const save=async()=>{
    if(!user?.id){toast("No user session","error");return;}
    setSaving(true);
    const {error}=await supabase.from("profiles").update({name,color,initials}).eq("id",user.id);
    if(error) toast("Save failed: "+error.message,"error");
    else{ toast("Profile updated — refresh to see changes","success"); onClose(); }
    setSaving(false);
  };

  return(
    <Modal title="My Profile" onClose={onClose}>
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {/* Avatar preview */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,paddingBottom:16,borderBottom:"1px solid var(--border-c)"}}>
          <div style={{width:64,height:64,borderRadius:"50%",background:color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:22,boxShadow:"0 4px 14px rgba(0,0,0,.18)"}}>{initials}</div>
          <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{name||"Your Name"}</div>
          <span className="badge" style={{textTransform:"capitalize",fontSize:10}}>{user?.role}</span>
        </div>

        {/* Fields */}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <FF id="pf-name" label="Full Name">
            <input id="pf-name" className="form-input" value={name} onChange={e=>setName(e.target.value)} placeholder="Your full name"/>
          </FF>
          <FF id="pf-email" label="Email Address">
            <input id="pf-email" className="form-input" value={email} disabled style={{opacity:.6,cursor:"not-allowed"}} title="Email is managed through your login"/>
            <div style={{fontSize:10,color:"var(--text3)",marginTop:3}}>Email changes require signing in again — contact your admin.</div>
          </FF>
        </div>

        {/* Avatar colour */}
        <div>
          <div style={{fontSize:11,fontWeight:600,color:"var(--text2)",marginBottom:8}}>Avatar Colour</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {AVATAR_COLORS.map(c=>(
              <div key={c} onClick={()=>setColor(c)} style={{
                width:28,height:28,borderRadius:"50%",background:c,cursor:"pointer",
                border:color===c?"3px solid var(--text)":"3px solid transparent",
                boxSizing:"border-box",transition:"border-color .15s",flexShrink:0,
              }}/>
            ))}
          </div>
        </div>

        {canEditRole?(
          <FF id="pf-role" label="Role">
            <select id="pf-role" className="form-input" value={user?.role||"viewer"} onChange={async e=>{
              const newRole=e.target.value;
              const {error}=await supabase.from("profiles").update({role:newRole,permissions:ROLE_PERMISSIONS[newRole]||[]}).eq("id",user.id);
              if(error) toast("Role update failed: "+error.message,"error");
              else toast("Role updated — refresh to apply","success");
            }}>
              {(isAdmin?["admin","manager","viewer","client"]:["manager","viewer","client"]).map(r=><option key={r} value={r} style={{textTransform:"capitalize"}}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
            </select>
          </FF>
        ):(
          <div style={{fontSize:11,color:"var(--text3)",padding:"8px 10px",background:"var(--bg3)",borderRadius:8}}>
            Role changes must be made by an Admin or Manager from the Users page.
          </div>
        )}

        <div style={{display:"flex",gap:8,justifyContent:"flex-end",paddingTop:8,borderTop:"1px solid var(--border-c)"}}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?"Saving…":"Save Profile"}</button>
        </div>
      </div>
    </Modal>
  );
}

function SettingsPage({settings,setSettings,user,toast}){
  return <RoleGuard user={user} require="settings"><SettingsContent settings={settings} setSettings={setSettings} toast={toast} user={user}/></RoleGuard>;
}
function SettingsContent({settings,setSettings,toast,user}){
  const set=(k,v)=>setSettings(s=>({...s,[k]:v}));
  const [saving,setSaving]=useState(false);
  const [inviteCode,setInviteCode]=useState<string|null>(null);
  const [regenLoading,setRegenLoading]=useState(false);

  useEffect(()=>{
    if(!user?.workspace_id) return;
    supabase.from("workspaces").select("invite_code").eq("id",user.workspace_id).single()
      .then(({data})=>{ if(data?.invite_code) setInviteCode(data.invite_code); });
  },[user?.workspace_id]);

  const regenCode=async()=>{
    if(!confirm("Regenerate invite code? The old code will stop working immediately.")) return;
    setRegenLoading(true);
    const {data,error}=await supabase.rpc("regenerate_workspace_invite_code",{ws_id:user?.workspace_id});
    if(error) toast("Failed: "+error.message,"error");
    else { setInviteCode(data); toast("New invite code generated","success"); }
    setRegenLoading(false);
  };

  const saveToSupabase=async()=>{
    if(!user?.workspace_id){toast("No workspace linked","error");return;}
    setSaving(true);
    const {error}=await supabase.from("workspaces").update({
      name: settings.companyName||undefined,
      brand_color: settings.brandColor,
    }).eq("id",user.workspace_id);
    if(error) toast("Save failed: "+error.message,"error");
    else toast("Settings saved","success");
    setSaving(false);
  };
  const BRAND_COLORS=["#534AB7","#185FA5","#3B6D11","#A32D2D","#854F0B","#1a1a1a","#D85A30","#0E7C7B"];
  const FISCAL_MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
  return(
    <div style={{maxWidth:680}}>
      <div className="settings-section">
        <div className="settings-section-title">Company Profile</div>
        <div className="form-grid">
          <FF id="cname" label="Company Name"><input id="cname" className="form-input" value={settings.companyName||""} onChange={e=>set("companyName",e.target.value)}/></FF>
          <FF id="cemail" label="Contact Email"><input id="cemail" type="email" className="form-input" value={settings.companyEmail||""} onChange={e=>set("companyEmail",e.target.value)}/></FF>
        </div>
        <FF id="caddr" label="Address"><input id="caddr" className="form-input" value={settings.address||""} onChange={e=>set("address",e.target.value)}/></FF>
        <div className="form-grid">
          <FF id="cphone" label="Phone"><input id="cphone" className="form-input" value={settings.phone||""} onChange={e=>set("phone",e.target.value)}/></FF>
          <FF id="creg" label="Registration Number"><input id="creg" className="form-input" value={settings.regNumber||""} onChange={e=>set("regNumber",e.target.value)}/></FF>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Branding</div>
        <div className="settings-row">
          <div><div className="settings-label">Brand Colour</div><div className="settings-desc">Used in buttons, active states, and charts</div></div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {BRAND_COLORS.map(c=>(
              <div key={c} className="color-swatch" style={{background:c,borderColor:settings.brandColor===c?c:"transparent"}} onClick={()=>{set("brandColor",c);document.documentElement.style.setProperty("--brand",c);document.documentElement.style.setProperty("--brand-dark",c+"cc");toast("Brand colour updated");}}/>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <div><div className="settings-label">Preview</div></div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <div className="brand-preview" style={{background:settings.brandColor||"var(--brand)",width:100}}>MediaHub</div>
            <span className="badge" style={{background:settings.brandColor+"22",color:settings.brandColor}}>active</span>
          </div>
        </div>
        <FF id="ctag" label="Agency Tagline (shown on invoices)"><input id="ctag" className="form-input" value={settings.tagline||""} onChange={e=>set("tagline",e.target.value)} placeholder="Media Agency Platform · Lagos, Nigeria"/></FF>
        <div className="settings-row">
          <div>
            <div className="settings-label">Company Logo</div>
            <div className="settings-desc">Embedded in all PDF and Excel report exports</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            {settings.logoDataUrl&&(
              <img src={settings.logoDataUrl} alt="Logo" style={{height:40,maxWidth:120,objectFit:"contain",borderRadius:4,border:"1px solid var(--border-c)",padding:4,background:"#fff"}}/>
            )}
            <label style={{cursor:"pointer"}}>
              <span className="btn btn-sm btn-ghost">{settings.logoDataUrl?"Change Logo":"Upload Logo"}</span>
              <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{
                const file=e.target.files?.[0];if(!file)return;
                const reader=new FileReader();
                reader.onload=ev=>{ set("logoDataUrl",ev.target?.result as string); };
                reader.readAsDataURL(file);
              }}/>
            </label>
            {settings.logoDataUrl&&<button className="btn btn-sm btn-ghost" style={{color:"#A32D2D"}} onClick={()=>set("logoDataUrl","")}>Remove</button>}
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Financial Settings</div>
        <div className="settings-row">
          <div><div className="settings-label">Default Currency</div><div className="settings-desc">Primary currency for new transactions</div></div>
          <select className="form-input" style={{width:"auto"}} value={settings.defaultCurrency||"NGN"} onChange={e=>set("defaultCurrency",e.target.value)}>
            {Object.entries(CURRENCIES).map(([k,v])=><option key={k} value={k}>{v.flag} {k} — {v.name}</option>)}
          </select>
        </div>
        <div className="settings-row">
          <div><div className="settings-label">Fiscal Year Start</div><div className="settings-desc">First month of your financial year</div></div>
          <select className="form-input" style={{width:"auto"}} value={settings.fiscalYearStart||"January"} onChange={e=>set("fiscalYearStart",e.target.value)}>
            {FISCAL_MONTHS.map(m=><option key={m}>{m}</option>)}
          </select>
        </div>
        <div className="settings-row">
          <div><div className="settings-label">Tax Rate (%)</div><div className="settings-desc">Default VAT/tax applied on invoices</div></div>
          <input type="number" className="form-input" style={{width:80}} min="0" max="50" value={settings.taxRate||7.5} onChange={e=>set("taxRate",Number(e.target.value))}/>
        </div>
        <div className="settings-row">
          <div><div className="settings-label">WHT Rate (%)</div><div className="settings-desc">Withholding tax auto-deducted from RO net total before payment</div></div>
          <input type="number" className="form-input" style={{width:80}} min="0" max="30" value={settings.whtRate??5} onChange={e=>set("whtRate",Number(e.target.value))}/>
        </div>
        <div className="settings-row">
          <div><div className="settings-label">Payment Terms (days)</div><div className="settings-desc">Default net days on new invoices</div></div>
          <select className="form-input" style={{width:"auto"}} value={settings.paymentTerms||30} onChange={e=>set("paymentTerms",Number(e.target.value))}>
            {[7,14,21,30,45,60,90].map(d=><option key={d} value={d}>Net {d}</option>)}
          </select>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Notifications & Reminders</div>
        {[
          {k:"notifOverdue",label:"Overdue alerts",desc:"Notify when invoices/payables pass due date"},
          {k:"notifUpcoming",label:"7-day warnings",desc:"Alert 7 days before due date"},
          {k:"notifWorkflow",label:"Workflow updates",desc:"Notify when invoice status advances"},
          {k:"notifAI",label:"AI insights",desc:"Weekly AI-generated financial summary"},
        ].map(opt=>(
          <div key={opt.k} className="settings-row">
            <div><div className="settings-label">{opt.label}</div><div className="settings-desc">{opt.desc}</div></div>
            <Toggle on={settings[opt.k]!==false} onToggle={()=>set(opt.k,settings[opt.k]===false?true:false)}/>
          </div>
        ))}
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Analytics KPI Targets</div>
        <div style={{fontSize:11,color:"var(--text3)",marginBottom:12}}>These targets appear on the Analytics page as progress indicators.</div>
        <div className="form-grid">
          <FF id="kpi-rev" label="Revenue Target (NGN)"><input id="kpi-rev" type="number" className="form-input" min="0" value={settings.revenueTarget||25000000} onChange={e=>set("revenueTarget",Number(e.target.value))}/></FF>
          <FF id="kpi-col" label="Collection Rate Target (%)"><input id="kpi-col" type="number" className="form-input" min="0" max="100" value={settings.collectionTarget||90} onChange={e=>set("collectionTarget",Number(e.target.value))}/></FF>
          <FF id="kpi-cam" label="Active Campaigns Target"><input id="kpi-cam" type="number" className="form-input" min="0" value={settings.campaignTarget||8} onChange={e=>set("campaignTarget",Number(e.target.value))}/></FF>
          <FF id="kpi-cli" label="New Clients Target"><input id="kpi-cli" type="number" className="form-input" min="0" value={settings.newClientsTarget||4} onChange={e=>set("newClientsTarget",Number(e.target.value))}/></FF>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Access &amp; Invites</div>
        <div className="settings-row">
          <div>
            <div className="settings-label">Workspace Invite Code</div>
            <div className="settings-desc">Share this code with new team members so they can register and join your workspace</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            {inviteCode?(
              <>
                <span style={{fontFamily:"monospace",fontSize:18,fontWeight:700,letterSpacing:"0.15em",background:"var(--bg3)",padding:"6px 14px",borderRadius:8,border:"1px solid var(--border-c)",userSelect:"all"}}>{inviteCode}</span>
                <button className="btn btn-sm btn-ghost" onClick={()=>{navigator.clipboard.writeText(inviteCode);toast("Invite code copied","success");}}>Copy</button>
                {user?.role==="admin"&&<button className="btn btn-sm btn-ghost" style={{color:"#A32D2D"}} onClick={regenCode} disabled={regenLoading}>{regenLoading?"…":"Regenerate"}</button>}
              </>
            ):(
              <span style={{fontSize:12,color:"var(--text3)"}}>Loading…</span>
            )}
          </div>
        </div>
      </div>

      <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
        <button className="btn btn-primary" onClick={saveToSupabase} disabled={saving}>
          {saving?"Saving…":"Save Changes"}
        </button>
        <button className="btn btn-ghost" onClick={()=>{if(confirm("Reset all settings to defaults?")){setSettings(DEFAULT_SETTINGS);toast("Settings reset — click Save to persist","info");}}}>Reset Defaults</button>
      </div>
      <div style={{fontSize:11,color:"var(--text3)",marginTop:8}}>Settings are saved to your workspace and shared with all team members.</div>
    </div>
  );
}

const DEFAULT_SETTINGS={
  companyName:"MediaHub Nigeria",companyEmail:"hello@mediahub.ng",
  address:"14 Adeyemi Bero Crescent, Wuse 2, Abuja",phone:"+234 812 000 0000",
  regNumber:"RC 1234567",tagline:"Media Agency Platform · Lagos, Nigeria",
  brandColor:"#534AB7",fiscalYearStart:"January",
  taxRate:7.5,whtRate:5,paymentTerms:30,defaultCurrency:"NGN",
  notifOverdue:true,notifUpcoming:true,notifWorkflow:true,notifAI:false,
  revenueTarget:25000000,collectionTarget:90,campaignTarget:8,newClientsTarget:4,
};

/* ═══ DATA VIZ PAGE ═══ */
function DataVizPage({mpos,receivables,payables,user}){
  return <RoleGuard user={user} require="dataviz"><DataVizContent mpos={mpos} receivables={receivables} payables={payables}/></RoleGuard>;
}
function DataVizContent({mpos,receivables,payables}){
  const [tab,setTab]=useState("overview");
  const lR=receivables.map(r=>({...r,status:computeStatus(r)}));
  const monthly=useMemo(()=>{const map={};(mpos||[]).forEach(m=>{if(!m.start)return;const k=m.start.slice(0,7);const lbl=new Date(k+"-01T12:00:00").toLocaleDateString("en-NG",{month:"short",year:"2-digit"});if(!map[k])map[k]={label:lbl,value:0};map[k].value+=Number(m.amount)||0;});return Object.entries(map).sort(([a],[b])=>a.localeCompare(b)).map(([,v])=>v);},[mpos]);
  const recByStatus=[
    {label:"Collected",value:lR.reduce((a,r)=>a+r.paid,0),color:"#3B6D11"},
    {label:"Outstanding",value:lR.reduce((a,r)=>a+(r.amount-r.paid),0),color:"#A32D2D"},
  ].filter(d=>d.value>0);
  const clientSpend=Object.values(mpos.reduce((acc,m)=>{acc[m.client]=acc[m.client]||{name:m.client,amount:0};acc[m.client].amount+=m.amount;return acc;},{})).sort((a,b)=>b.amount-a.amount);
  return(
    <div>
      <div className="tabs">
        {["overview","heatmap","scatter","cashflow"].map(t=><button key={t} className={`tab ${tab===t?"active":""}`} onClick={()=>setTab(t)}>{t}</button>)}
      </div>
      {tab==="overview"&&(
        <div>
          <div className="grid2">
            <div className="card"><div className="card-header"><span className="card-title">Campaign Distribution</span></div><DonutChart data={[{label:"Active",value:mpos.filter(m=>m.status==="active").length,color:"#3B6D11"},{label:"Pending",value:mpos.filter(m=>m.status==="pending").length,color:"#854F0B"},{label:"Completed",value:mpos.filter(m=>m.status==="completed").length,color:"#185FA5"}].filter(d=>d.value>0)} size={148}/></div>
            <div className="card"><div className="card-header"><span className="card-title">Receivables Status</span></div><DonutChart data={recByStatus} size={148}/></div>
          </div>
          <div className="card"><div className="card-header"><span className="card-title">Client Revenue Ranking</span></div><BarChart data={clientSpend.map(c=>({label:c.name.split(" ")[0],value:c.amount}))} height={160} colors={["#534AB7"]}/></div>
        </div>
      )}
      {tab==="heatmap"&&(
        <div className="card">
          <div className="card-header"><span className="card-title">MPO Campaign Start Activity Heatmap</span><span style={{fontSize:11,color:"var(--text3)"}}>Campaigns started per weekday × month</span></div>
          <ActivityHeatmap mpos={mpos}/>
        </div>
      )}
      {tab==="scatter"&&(
        <div className="card">
          <div className="card-header"><span className="card-title">Campaign Value vs Duration</span><span style={{fontSize:11,color:"var(--text3)"}}>Each dot = one MPO</span></div>
          <RevenueScatter mpos={mpos}/>
          <div style={{marginTop:12,fontSize:11,color:"var(--text3)"}}>Axis: X = campaign duration (days) · Y = campaign value (₦)</div>
        </div>
      )}
      {tab==="cashflow"&&(
        <div>
          <div className="card"><div className="card-header"><span className="card-title">Monthly Revenue Trend</span></div><AreaChart data={monthly} height={160} color="#534AB7"/></div>
          <div className="grid2">
            <div className="card"><div className="card-header"><span className="card-title">Spend by Channel</span></div><BarChart data={Object.values((mpos||[]).reduce((acc,m)=>{const ch=m.channel||"Other";if(!acc[ch])acc[ch]={label:ch,value:0};acc[ch].value+=Number(m.amount)||0;return acc;},{})).sort((a,b)=>b.value-a.value)} height={155} colors={["#534AB7","#3B6D11","#185FA5","#854F0B","#D85A30"]}/></div>
            <div className="card"><div className="card-header"><span className="card-title">Receivables vs Payables</span></div><BarChart data={[{label:"Billed",values:[lR.reduce((a,r)=>a+r.amount,0),0]},{label:"Collected",values:[lR.reduce((a,r)=>a+r.paid,0),0]},{label:"Payable",values:[0,payables.reduce((a,p)=>a+p.amount,0)]},{label:"Settled",values:[0,payables.reduce((a,p)=>a+p.paid,0)]}]} height={155} colors={["#534AB7","#D85A30"]}/></div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ DASHBOARD ═══ */
function Dashboard({mpos,receivables,payables,setPage,settings,toast,onOnboard,budgets,payables2}){
  const lR=receivables.map(r=>({...r,status:computeStatus(r)}));
  const lP=payables.map(p=>({...p,status:computeStatus(p)}));
  const dCcy=settings.defaultCurrency||"NGN";
  const totalSpend=mpos.reduce((a,m)=>a+convertAmt(m.amount,m.currency||"NGN",dCcy),0);
  const outstanding=lR.reduce((a,r)=>a+convertAmt(r.amount-r.paid,r.currency||"NGN",dCcy),0);
  const payDue=lP.reduce((a,p)=>a+convertAmt(p.amount-p.paid,p.currency||"NGN",dCcy),0);
  const sym=CURRENCIES[dCcy]?.symbol||"₦";
  const overBudgetCount=(budgets||[]).filter(b=>{
    const spent=(payables2||[]).filter(p=>p.mpo===b.mpoId).reduce((a,p)=>a+p.paid,0);
    return spent>b.budget;
  }).length;
  const donutData=[{label:"Active",value:mpos.filter(m=>m.status==="active").length,color:"#3B6D11"},{label:"Pending",value:mpos.filter(m=>m.status==="pending").length,color:"#854F0B"},{label:"Completed",value:mpos.filter(m=>m.status==="completed").length,color:"#185FA5"}].filter(d=>d.value>0);
  const monthly=useMemo(()=>{const map={};(mpos||[]).forEach(m=>{if(!m.start)return;const k=m.start.slice(0,7);const lbl=new Date(k+"-01T12:00:00").toLocaleDateString("en-NG",{month:"short",year:"2-digit"});if(!map[k])map[k]={label:lbl,value:0};map[k].value+=Number(m.amount)||0;});return Object.entries(map).sort(([a],[b])=>a.localeCompare(b)).map(([,v])=>v);},[mpos]);
  return(
    <div>
      {dCcy!=="NGN"&&<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,fontSize:12,color:"var(--text3)"}}>
        <span>Displaying in</span><span className="rate-tag">{CURRENCIES[dCcy]?.flag} {dCcy}</span>
        <span>· 1 NGN = {CURRENCIES[dCcy]?.rate?.toFixed(5)} {dCcy}</span>
      </div>}
      {onOnboard&&(
        <div style={{background:"linear-gradient(135deg,var(--brand-light),rgba(83,74,183,.03))",border:"0.5px solid rgba(83,74,183,.2)",borderRadius:"var(--radius-lg)",padding:"14px 20px",marginBottom:16,display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
          <div style={{flex:1}}><div style={{fontWeight:600,fontSize:13,color:"var(--brand)"}}>✦ Onboard a new client</div><div style={{fontSize:11,color:"var(--text3)",marginTop:1}}>Guided wizard — client, campaign & invoice in 4 steps</div></div>
          <button className="btn btn-primary btn-sm" onClick={onOnboard}>Start →</button>
        </div>
      )}
      <div className="stat-grid">
        <div className="stat-card"><div className="stat-label">Total MPO Value</div><div className="stat-value">{fmtK(totalSpend,sym)}</div><div className="stat-sub">{mpos.length} orders</div></div>
        <div className="stat-card"><div className="stat-label">Active Campaigns</div><div className="stat-value">{mpos.filter(m=>m.status==="active").length}</div><div className="stat-sub">{mpos.filter(m=>m.status==="pending").length} pending</div></div>
        <div className="stat-card"><div className="stat-label">Receivables Due</div><div className="stat-value">{fmtK(outstanding,sym)}</div><div className="stat-sub">{lR.filter(r=>r.status==="overdue").length} overdue</div><div className="trend trend-down">↓ action needed</div></div>
        <div className="stat-card" style={{borderLeft:overBudgetCount>0?"3px solid #A32D2D":"3px solid #F5C97A"}}>
          <div className="stat-label">Budget Health</div>
          <div className="stat-value" style={{color:overBudgetCount>0?"#A32D2D":"#3B6D11"}}>{overBudgetCount>0?`${overBudgetCount} over`:"On track"}</div>
          <div className="stat-sub">{(budgets||[]).length} budgets tracked</div>
        </div>
      </div>
      <div className="grid2">
        <div className="card"><div className="card-header"><span className="card-title">Campaign Status</span></div><DonutChart data={donutData} size={148}/></div>
        <div className="card"><div className="card-header"><span className="card-title">Monthly Revenue Trend</span></div><AreaChart data={monthly} height={148} color="#534AB7"/></div>
      </div>
      <div className="card">
        <div className="card-header"><span className="card-title">Active MPOs</span><button className="btn btn-sm btn-primary" onClick={()=>setPage("mpo")}>View all</button></div>
        <div style={{overflow:"auto"}}><table><thead><tr><th>ID</th><th>Agency</th><th>Brand</th><th>Campaign</th><th>Spots</th><th>Dur.</th><th>Value</th><th>Month</th><th>Status</th><th>Exec</th></tr></thead>
          <tbody>{mpos.filter(m=>m.status!=="completed").slice(0,5).map(m=>(
            <tr key={m.id}>
              <td style={{fontFamily:"monospace",fontSize:11}}>{shortId(m.id)}</td>
              <td style={{fontSize:12,color:"var(--text2)"}}>{m.agency||"—"}</td>
              <td style={{fontSize:12}}>{m.client}</td>
              <td style={{fontSize:12,color:"var(--text2)"}}>{m.campaign}</td>
              <td style={{fontSize:12,textAlign:"center"}}>{m.spots||"—"}</td>
              <td style={{fontSize:11,textAlign:"center",color:"var(--text3)"}}>{m.materialDuration||30}s</td>
              <td style={{fontWeight:500,fontSize:12}}>{fmtCcy(m.amount,m.currency||"NGN",dCcy)}</td>
              <td style={{fontSize:11,color:"var(--text3)"}}>{campaignMonth(m.start)}</td>
              <td><SBadge s={m.status}/></td>
              <td><SBadge s={m.exec}/></td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>
    </div>
  );
}

/* ═══ SCHEDULING PAGE (MPO + RO) ═══ */
const RO_DRAFTS_KEY="mh_drafts_ro";
const MPO_DRAFTS_KEY="mh_drafts_mpo";
const getDrafts=(key:string):any[]=>{try{const s=localStorage.getItem(key);return s?JSON.parse(s):[];}catch{return[];}};
const upsertDraft=(key:string,draft:any)=>{try{const arr=getDrafts(key);const i=arr.findIndex((d:any)=>d.id===draft.id);if(i>=0)arr[i]=draft;else arr.push(draft);localStorage.setItem(key,JSON.stringify(arr));}catch{}};
const removeDraft=(key:string,id:string)=>{try{localStorage.setItem(key,JSON.stringify(getDrafts(key).filter((d:any)=>d.id!==id)));}catch{}};
const draftLabel=(form:any)=>{const p=[form?.client,form?.campaign].filter(Boolean);return p.length?p.join(" — "):"Untitled draft";};
const timeAgo=(iso:string)=>{const ms=Date.now()-new Date(iso).getTime();const mn=Math.floor(ms/60000);if(mn<1)return"just now";if(mn<60)return`${mn}m ago`;const hr=Math.floor(mn/60);if(hr<24)return`${hr}h ago`;return`${Math.floor(hr/24)}d ago`;};

function printMPO(m:any,settings:any){
  const sym=CURRENCIES[m.currency||"NGN"]?.symbol||"₦";
  const fa=(n:number)=>sym+Number(n).toLocaleString("en",{minimumFractionDigits:2,maximumFractionDigits:2});
  const logoHtml=settings.logoDataUrl?`<img src="${settings.logoDataUrl}" alt="Logo" style="height:48px;max-width:140px;object-fit:contain;margin-bottom:4px;display:block"/>`:"";
  const dateStr=new Date().toLocaleDateString("en-NG",{day:"2-digit",month:"short",year:"numeric"});
  const statusColor=m.status==="active"?"#3B6D11":m.status==="completed"?"#185FA5":"#854F0B";
  const gross=m.gross||0,disc=m.discount||0,ac=m.agencyCommission||0,net=m.net||0,vat=m.vat||0,total=m.total||0;
  const discAmt=gross*(disc/100),acAmt=gross*(ac/100),vatRate=m.vatRate||7.5;
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>MPO ${m.id}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#222;background:#fff;padding:32px}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}
  .brand{font-size:20px;font-weight:800;color:#1a2d5a;letter-spacing:-.5px}
  h1{font-size:22px;font-weight:800;color:#534AB7;text-align:right}
  .sub{font-size:10px;color:#aaa;margin-top:2px}
  .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;background:${statusColor}22;color:${statusColor};letter-spacing:.5px}
  hr{border:none;border-top:2px solid #534AB7;margin:14px 0}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 32px;margin-bottom:18px}
  .meta-row{display:flex;flex-direction:column;gap:2px}
  .meta-label{font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#999;font-weight:600}
  .meta-val{font-size:13px;font-weight:600;color:#222}
  table{width:100%;border-collapse:collapse;margin-bottom:16px}
  th{background:#534AB7;color:#fff;padding:8px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px}
  td{padding:8px 10px;border-bottom:1px solid #eee;font-size:12px}
  .total-section{margin-top:8px;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden}
  .total-row{display:flex;justify-content:space-between;padding:7px 14px;font-size:12px;border-bottom:1px solid #f0f0f0}
  .total-row:last-child{border-bottom:none}
  .total-payable{background:#534AB722;font-weight:800;font-size:14px;color:#534AB7}
  .neg{color:#A32D2D}
  .footer{margin-top:24px;font-size:9px;color:#bbb;text-align:center;border-top:1px solid #eee;padding-top:10px}
  @media print{body{padding:16px}}
</style></head><body>
<div class="hdr">
  <div>${logoHtml}<div class="brand">${settings.companyName||"MediaHub"}</div><div class="sub">${settings.tagline||"Media Agency · Lagos, Nigeria"}</div></div>
  <div style="text-align:right"><h1>MEDIA PLACEMENT ORDER</h1><p class="sub"><b>${m.id}</b> &nbsp;·&nbsp; ${dateStr}</p><div class="badge" style="margin-top:6px">${m.status||"pending"}</div></div>
</div>
<hr/>
<div class="meta">
  <div class="meta-row"><span class="meta-label">Agency</span><span class="meta-val">${m.agency||"—"}</span></div>
  <div class="meta-row"><span class="meta-label">Brand / Client</span><span class="meta-val">${m.client||"—"}</span></div>
  <div class="meta-row"><span class="meta-label">Vendor / Station</span><span class="meta-val">${m.vendor||"—"}</span></div>
  <div class="meta-row"><span class="meta-label">Campaign</span><span class="meta-val">${m.campaign||"—"}</span></div>
  <div class="meta-row"><span class="meta-label">Period</span><span class="meta-val">${m.start||"—"} → ${m.end||"—"}</span></div>
  <div class="meta-row"><span class="meta-label">Material Duration</span><span class="meta-val">${m.materialDuration||30} seconds</span></div>
  <div class="meta-row"><span class="meta-label">No. of Spots</span><span class="meta-val">${m.spots||0}</span></div>
  <div class="meta-row"><span class="meta-label">Rate per Spot</span><span class="meta-val">${fa(m.rate||0)}</span></div>
</div>
<hr/>
<div class="total-section">
  <div class="total-row"><span>Gross (${m.spots||0} spots × ${fa(m.rate||0)})</span><span>${fa(gross)}</span></div>
  ${disc>0?`<div class="total-row"><span class="neg">Volume Discount (${disc}%)</span><span class="neg">− ${fa(discAmt)}</span></div>`:""}
  ${ac>0?`<div class="total-row"><span class="neg">Agency Commission (${ac}%)</span><span class="neg">− ${fa(acAmt)}</span></div>`:""}
  <div class="total-row" style="font-weight:700;border-top:1px solid #ddd"><span>Net</span><span>${fa(net)}</span></div>
  <div class="total-row"><span>VAT (${vatRate}%)</span><span>+ ${fa(vat)}</span></div>
  <div class="total-row total-payable"><span>TOTAL PAYABLE</span><span>${fa(total)}</span></div>
</div>
<div class="footer">Generated by ${settings.companyName||"MediaHub"} · ${dateStr} · ${settings.companyEmail||""}</div>
</body></html>`;
  const w=window.open("","_blank","width=780,height=900");w.document.write(html);w.document.close();w.onload=()=>w.print();
}

const EMPO={agency:"",client:"",vendor:"",campaign:"",start:"",end:"",status:"pending",currency:"NGN",docs:[],spots:"",rate:"",discount:"",agencyCommission:"",materialDuration:"30"};
function MPOPage({mpos,setMpos,ros,setRos,clients,toast,user,addAudit,settings,comments,onAddComment}){
  const [docType,setDocType]=useState("ro"); // "ro" | "mpo"
  const [createMenu,setCreateMenu]=useState(false);
  const menuRef=useRef(null);
  const canEdit=user.permissions.includes("mpo");
  const dCcy=settings.defaultCurrency||"NGN";

  const draftsMenuRef=useRef(null);
  const [draftsMenuOpen,setDraftsMenuOpen]=useState(false);
  // Close dropdowns when clicking outside
  useEffect(()=>{
    const h=e=>{
      if(menuRef.current&&!(menuRef.current as any).contains(e.target))setCreateMenu(false);
      if(draftsMenuRef.current&&!(draftsMenuRef.current as any).contains(e.target))setDraftsMenuOpen(false);
    };
    document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);
  },[]);

  // ── MPO state ──────────────────────────────────────────────────────────────
  const [tab,setTab]=useState("all");const [search,setSearch]=useState("");
  const [mpoAgencyFilter,setMpoAgencyFilter]=useState("");
  const [showF,setShowF]=useState(false);const [eid,setEid]=useState(null);
  const [form,setForm]=useState(EMPO);const [errs,setErrs]=useState({});
  const [selected,setSelected]=useState(new Set());const [bulkStatus,setBulkStatus]=useState("");
  const [docsFor,setDocsFor]=useState(null);
  const [commentsFor,setCommentsFor]=useState(null);
  // ── Draft queues ──────────────────────────────────────────────────────────
  const [roDrafts,setRoDrafts]=useState<any[]>(()=>getDrafts(RO_DRAFTS_KEY));
  const [mpoDrafts,setMpoDrafts]=useState<any[]>(()=>getDrafts(MPO_DRAFTS_KEY));
  const currentMpoDraftId=useRef<string|null>(null);
  const [mpoDraftSavedAt,setMpoDraftSavedAt]=useState<Date|null>(null);
  const [roDraftToLoad,setRoDraftToLoad]=useState<any>(null);
  // Refresh MPO draft list when MPO modal closes
  useEffect(()=>{if(!showF)setMpoDrafts(getDrafts(MPO_DRAFTS_KEY));},[showF]);
  // MPO auto-save
  useEffect(()=>{
    if(!showF||eid)return;
    if(!form.client&&!form.vendor&&!form.campaign&&!form.amount)return;
    if(!currentMpoDraftId.current)currentMpoDraftId.current=`mpod_${Date.now()}`;
    upsertDraft(MPO_DRAFTS_KEY,{id:currentMpoDraftId.current,form,savedAt:new Date().toISOString(),label:draftLabel(form)});
    setMpoDraftSavedAt(new Date());
  },[form,showF,eid]);
  const mpoAgencies=[...new Set((mpos||[]).map(m=>m.agency).filter(Boolean))].sort();
  const filtered=mpos.filter(m=>{
    if(tab==="active"&&m.status!=="active")return false;
    if(tab==="pending"&&m.status!=="pending")return false;
    if(tab==="completed"&&m.status!=="completed")return false;
    if(mpoAgencyFilter&&m.agency!==mpoAgencyFilter)return false;
    if(search&&!`${m.client}${m.campaign}${m.vendor}${m.agency}`.toLowerCase().includes(search.toLowerCase()))return false;
    return true;
  });
  const val=()=>{const e={};if(!form.client.trim())e.client="Required";if(!form.vendor.trim())e.vendor="Required";if(!form.campaign.trim())e.campaign="Required";if(!form.spots||Number(form.spots)<=0)e.spots="Required";if(!form.rate||Number(form.rate)<=0)e.rate="Required";if(!form.start)e.start="Required";if(!form.end)e.end="Required";else if(form.start&&form.start>form.end)e.end="Must be after start";setErrs(e);return!Object.keys(e).length;};
  const openNew=()=>{
    if(!canEdit)return;
    currentMpoDraftId.current=null;setMpoDraftSavedAt(null);
    setForm({...EMPO,currency:dCcy});setEid(null);setErrs({});setShowF(true);
  };
  const openEdit=m=>{if(!canEdit)return;setForm({agency:m.agency||"",client:m.client,vendor:m.vendor,campaign:m.campaign,start:m.start,end:m.end,status:m.status,currency:m.currency||"NGN",docs:m.docs||[],spots:String(m.spots||""),rate:String(m.rate||""),discount:String(m.discount||""),agencyCommission:String(m.agencyCommission||""),materialDuration:String(m.materialDuration||"30")});setEid(m.id);setErrs({});setShowF(true);};
  const save=()=>{
    if(!val())return;
    if(currentMpoDraftId.current){removeDraft(MPO_DRAFTS_KEY,currentMpoDraftId.current);currentMpoDraftId.current=null;}
    setMpoDraftSavedAt(null);
    const sp=Number(form.spots)||0,rt=Number(form.rate)||0,disc=Number(form.discount)||0,ac=Number(form.agencyCommission)||0,vr=Number(settings?.taxRate||7.5);
    const gross=sp*rt,discAmt=gross*(disc/100),agencyComAmt=gross*(ac/100),net=gross-discAmt-agencyComAmt,vat=net*(vr/100),total=net+vat;
    const md=Number(form.materialDuration)||30;
    const extra={spots:sp,rate:rt,discount:disc,agencyCommission:ac,gross,net,vat,total,amount:net,vatRate:vr,materialDuration:md};
    if(eid){setMpos(p=>p.map(m=>m.id===eid?{...m,...form,...extra}:m));toast("MPO updated");addAudit("updated","MPO",eid,`Updated ${eid}`,"update");}
    else{const newId=nextId(mpos,"MPO");setMpos(p=>[...p,{id:newId,...form,...extra,exec:"pending",channel:"TV",docs:[]}]);toast("MPO created");addAudit("created","MPO",newId,`Created ${newId} for ${form.client}`,"create");}
    setShowF(false);
  };
  const del=id=>{if(!canEdit||!confirm("Delete?"))return;setMpos(p=>p.filter(m=>m.id!==id));addAudit("deleted","MPO",id,`Deleted ${id}`,"delete");toast("Deleted","error");};
  const toggleSel=id=>setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleAll=()=>setSelected(s=>s.size===filtered.length?new Set():new Set(filtered.map(m=>m.id)));
  const applyBulk=()=>{if(!bulkStatus||!selected.size)return;setMpos(p=>p.map(m=>selected.has(m.id)?{...m,status:bulkStatus}:m));toast(`${selected.size} MPOs → ${bulkStatus}`);setSelected(new Set());setBulkStatus("");};
  const bulkExport=()=>{const rows=[["ID","Client","Vendor","Campaign","Amount","Currency","Status"],...mpos.filter(m=>selected.has(m.id)).map(m=>[m.id,m.client,m.vendor,m.campaign,m.amount,m.currency||"NGN",m.status])];const csv=rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");const a=document.createElement("a");a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);a.download="mpo_export.csv";a.click();toast(`Exported ${selected.size}`,"info");};
  const updateMpoDocs=(id,docs)=>setMpos(p=>p.map(m=>m.id===id?{...m,docs}:m));
  const mpoForDocs=docsFor?mpos.find(m=>m.id===docsFor):null;

  // ── RO state ───────────────────────────────────────────────────────────────
  const [roSearch,setRoSearch]=useState("");
  const [roStatusTab,setRoStatusTab]=useState("all");
  const [roClientFilter,setRoClientFilter]=useState("");
  const [roChannelFilter,setRoChannelFilter]=useState("");
  const [showRoForm,setShowRoForm]=useState(false);
  const [editRoId,setEditRoId]=useState(null);
  const [selRo,setSelRo]=useState(null);
  // Refresh RO draft list when RO modal closes (declared after showRoForm to avoid TDZ)
  useEffect(()=>{if(!showRoForm)setRoDrafts(getDrafts(RO_DRAFTS_KEY));},[showRoForm]);
  const roClients=[...new Set((ros||[]).map(r=>r.client).filter(Boolean))].sort();
  const roChannels=[...new Set((ros||[]).map(r=>r.channel).filter(Boolean))].sort();
  const filteredRos=(ros||[]).filter(r=>{
    if(roStatusTab!=="all"&&r.status!==roStatusTab)return false;
    if(roClientFilter&&r.client!==roClientFilter)return false;
    if(roChannelFilter&&r.channel!==roChannelFilter)return false;
    if(roSearch&&!`${r.client}${r.campaign}${r.vendor}`.toLowerCase().includes(roSearch.toLowerCase()))return false;
    return true;
  });
  const saveRo=form=>{
    if(editRoId){
      setRos(p=>p.map(r=>r.id===editRoId?{...r,...form}:r));
      addAudit("updated","RO",editRoId,`Updated ${editRoId}`,"update");
      toast("RO updated");
    }else{
      const prefix="RO-"+(form.client||"GEN").replace(/\s+/g,"").slice(0,3).toUpperCase();
      const existing=(ros||[]).filter(r=>r.id.startsWith(prefix));
      const seq=Math.max(0,...existing.map(r=>parseInt(r.id.split("-").pop()||"0")||0))+1;
      const newId=`${prefix}-${String(seq).padStart(3,"0")}`;
      setRos(p=>[...p,{id:newId,...form,docs:[]}]);
      addAudit("created","RO",newId,`Created ${newId} for ${form.client}`,"create");
      toast("RO created");
    }
    setShowRoForm(false);setEditRoId(null);setRoDraftToLoad(null);
  };
  const deleteRo=id=>{
    if(!confirm("Delete this RO?"))return;
    setRos(p=>p.filter(r=>r.id!==id));
    addAudit("deleted","RO",id,`Deleted ${id}`,"delete");
    toast("RO deleted","error");setSelRo(null);
  };
  // ── Draft resume / delete (declared here so all state is already initialized) ──
  const resumeRoDraft=(draft:any)=>{setRoDraftToLoad(draft);setEditRoId(null);setShowRoForm(true);setDocType("ro");setDraftsMenuOpen(false);};
  const resumeMpoDraft=(draft:any)=>{currentMpoDraftId.current=draft.id;setForm({...EMPO,...draft.form});setEid(null);setErrs({});setShowF(true);setDraftsMenuOpen(false);};
  const deleteRoDraft=(id:string)=>{removeDraft(RO_DRAFTS_KEY,id);setRoDrafts(getDrafts(RO_DRAFTS_KEY));};
  const deleteMpoDraft=(id:string)=>{removeDraft(MPO_DRAFTS_KEY,id);setMpoDrafts(getDrafts(MPO_DRAFTS_KEY));};

  return(
    <div>
      {/* ── MPO modals ── */}
      {showF&&(()=>{
        const agencyList=(clients||[]).filter(c=>c.type==="Agency");
        const selAgency=agencyList.find(a=>a.name===form.agency);
        const brandList=selAgency?(selAgency.brands||[]).map((b:any)=>b.name):[...new Set((clients||[]).filter(c=>c.type==="Agency").flatMap(c=>(c.brands||[]).map((b:any)=>b.name)))].sort();
        const vendorList=(clients||[]).filter(c=>c.type==="Vendor").map(c=>c.name).sort();
        const sp=Number(form.spots)||0,rt=Number(form.rate)||0,disc=Number(form.discount)||0,ac=Number(form.agencyCommission)||0,vr=Number(settings?.taxRate||7.5);
        const gross=sp*rt,discAmt=gross*(disc/100),agencyComAmt=gross*(ac/100),net=gross-discAmt-agencyComAmt,vat=net*(vr/100),total=net+vat;
        return(
        <Modal title={eid?"Edit MPO":"New MPO"} onClose={()=>setShowF(false)}>
          <div className="form-grid">
            <FF id="mpo-agency" label="Agency"><select id="mpo-agency" className="form-input" value={form.agency} onChange={e=>setForm(f=>({...f,agency:e.target.value,client:""}))}>
              <option value="">— Select Agency —</option>
              {agencyList.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}
            </select></FF>
            <FF id="cl" label="Brand" required error={errs.client}>
              <input id="cl" className={`form-input ${errs.client?"error":""}`} value={form.client} onChange={e=>setForm(f=>({...f,client:e.target.value}))} list="cl-l" placeholder="Select or type brand"/>
              <datalist id="cl-l">{brandList.map((b:any)=><option key={b} value={b}/>)}</datalist>
            </FF>
          </div>
          <div className="form-grid">
            <FF id="vn" label="Vendor" required error={errs.vendor}><input id="vn" className={`form-input ${errs.vendor?"error":""}`} value={form.vendor} onChange={e=>setForm(f=>({...f,vendor:e.target.value}))} list="vn-l"/><datalist id="vn-l">{vendorList.map(v=><option key={v} value={v}/>)}</datalist></FF>
            <FF id="cp" label="Campaign" required error={errs.campaign}><input id="cp" className={`form-input ${errs.campaign?"error":""}`} value={form.campaign} onChange={e=>setForm(f=>({...f,campaign:e.target.value}))}/></FF>
          </div>
          <div className="form-grid">
            <FF id="mpo-spots" label="No. of Spots" required error={errs.spots}><input id="mpo-spots" className={`form-input ${errs.spots?"error":""}`} type="number" min="0" placeholder="0" value={form.spots} onChange={e=>setForm(f=>({...f,spots:e.target.value}))}/></FF>
            <FF id="mpo-rate" label={`Rate per spot (${form.currency||dCcy})`} required error={errs.rate}><input id="mpo-rate" className={`form-input ${errs.rate?"error":""}`} type="number" min="0" placeholder="0.00" value={form.rate} onChange={e=>setForm(f=>({...f,rate:e.target.value}))}/></FF>
          </div>
          <div className="form-grid">
            <FF id="mpo-disc" label="Volume Discount (%)"><input id="mpo-disc" className="form-input" type="number" min="0" max="100" placeholder="0" value={form.discount} onChange={e=>setForm(f=>({...f,discount:e.target.value}))}/></FF>
            <FF id="mpo-ac" label="Agency Commission (%)"><input id="mpo-ac" className="form-input" type="number" min="0" max="100" placeholder="0" value={form.agencyCommission} onChange={e=>setForm(f=>({...f,agencyCommission:e.target.value}))}/></FF>
          </div>
          <div className="form-grid">
            <FF id="mpo-dur" label="Material Duration (secs)">
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <input id="mpo-dur" className="form-input" type="number" min="1" placeholder="30" value={form.materialDuration} onChange={e=>setForm(f=>({...f,materialDuration:e.target.value}))} style={{flex:1}}/>
                <span style={{fontSize:12,color:"var(--text3)",whiteSpace:"nowrap"}}>secs</span>
              </div>
            </FF>
            <FF id="st" label="Status"><select id="st" className="form-input" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}><option value="pending">Pending</option><option value="active">Active</option><option value="completed">Completed</option></select></FF>
          </div>
          <div className="form-grid">
            <FF id="sd" label="Start" required error={errs.start}><input id="sd" className={`form-input ${errs.start?"error":""}`} type="date" value={form.start} onChange={e=>setForm(f=>({...f,start:e.target.value}))}/></FF>
            <FF id="ed" label="End" required error={errs.end}><input id="ed" className={`form-input ${errs.end?"error":""}`} type="date" value={form.end} onChange={e=>setForm(f=>({...f,end:e.target.value}))}/></FF>
          </div>
          {gross>0&&(
            <div style={{background:"var(--bg3)",border:"1px solid var(--border-c)",borderRadius:10,padding:"12px 16px",marginBottom:12,display:"flex",flexDirection:"column",gap:6}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:"var(--text2)"}}>Gross</span><span>{fmt(gross)}</span></div>
              {discAmt>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#A32D2D"}}><span>Volume Discount ({disc}%)</span><span>−{fmt(discAmt)}</span></div>}
              {agencyComAmt>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#854F0B"}}><span>Agency Commission ({ac}%)</span><span>−{fmt(agencyComAmt)}</span></div>}
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,borderTop:"1px solid var(--border-c)",paddingTop:6}}><span style={{color:"var(--text2)"}}>Net</span><span style={{fontWeight:600}}>{fmt(net)}</span></div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"var(--text2)"}}><span>VAT ({vr}%)</span><span>+{fmt(vat)}</span></div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:700,borderTop:"1px solid var(--border-c)",paddingTop:6}}><span>Total</span><span style={{color:"var(--brand)"}}>{fmtCcy(total,form.currency||dCcy,dCcy)}</span></div>
            </div>
          )}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginTop:8}}>
            <div>{!eid&&mpoDraftSavedAt&&<span style={{fontSize:10,color:"var(--text3)"}}>Draft saved {mpoDraftSavedAt.toLocaleTimeString("en-NG",{hour:"2-digit",minute:"2-digit"})}</span>}</div>
            <div style={{display:"flex",gap:8}}><button className="btn" onClick={()=>setShowF(false)}>Cancel</button><button className="btn btn-primary" onClick={save}>{eid?"Save":"Create"}</button></div>
          </div>
        </Modal>
        );
      })()}
      {commentsFor&&(<Modal title="Discussion" onClose={()=>setCommentsFor(null)} wide>
        <CommentsPanel entityId={commentsFor} entityLabel={`MPO ${commentsFor} — ${mpos.find(m=>m.id===commentsFor)?.campaign||""}`} comments={comments} currentUser={user} onAddComment={onAddComment}/>
      </Modal>)}
      {docsFor&&mpoForDocs&&(<Modal title={`Documents — ${mpoForDocs.id}`} onClose={()=>setDocsFor(null)}>
        <DocPanel entityId={docsFor} entityDocs={mpoForDocs.docs||[]} onSave={docs=>updateMpoDocs(docsFor,docs)} canEdit={canEdit} workspaceId={user?.workspace_id} currentUser={user}/>
      </Modal>)}

      {/* ── RO modals ── */}
      {showRoForm&&(
        <Modal title={editRoId?"Edit RO":"New Release Order"} onClose={()=>{setShowRoForm(false);setEditRoId(null);}}>
          <ROForm
            initial={editRoId?(ros||[]).find(r=>r.id===editRoId):null}
            draftInitial={!editRoId?roDraftToLoad:null}
            mpos={mpos||[]} clients={clients||[]} user={user} settings={settings}
            onSave={saveRo}
            onClose={()=>{setShowRoForm(false);setEditRoId(null);setRoDraftToLoad(null);}}
          />
        </Modal>
      )}
      {selRo&&(
        <Modal title={`${selRo.id} — Release Order`} onClose={()=>setSelRo(null)}>
          <div style={{marginBottom:12,display:"flex",gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,fontWeight:700,background:RO_STATUS_BG[selRo.status]||"#f0f0f0",color:RO_STATUS_COLOR[selRo.status]||"#888",textTransform:"uppercase"}}>{selRo.status}</span>
            <span style={{fontSize:11,color:"var(--text3)"}}>{selRo.channel}</span>
          </div>
          {[["Client",selRo.client],["Vendor",selRo.vendor],["Campaign",selRo.campaign],["Programme",selRo.programme||"—"],["Material Title",selRo.materialTitle||"—"],["MPO Ref",selRo.mpoId||"—"],["Period",`${selRo.start} → ${selRo.end}`],["Schedule Days",selRo.schedule?.length||0],["Grand Total",fmt(selRo.schedule?.reduce((a,s)=>a+(s.spots*s.rate),0)||0)+" "+(selRo.currency||"NGN")]].map(([k,v])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--border-c)",fontSize:13}}><span style={{color:"var(--text2)"}}>{k}</span><span style={{fontWeight:500}}>{v}</span></div>
          ))}
          <div style={{display:"flex",gap:8,marginTop:16,flexWrap:"wrap"}}>
            <button className="btn btn-primary btn-sm" onClick={()=>printROCalendarLegacy(selRo,settings||{})}>↓ PDF</button>
            <button className="btn btn-sm btn-ghost" onClick={()=>exportROExcel(selRo,settings||{})}>↓ Excel</button>
            {canEdit&&<button className="btn btn-sm btn-ghost" onClick={()=>{setSelRo(null);setEditRoId(selRo.id);setShowRoForm(true);}}>Edit</button>}
            {canEdit&&<button className="btn btn-sm" style={{color:"#A32D2D",background:"transparent",border:"1px solid #A32D2D"}} onClick={()=>deleteRo(selRo.id)}>Delete</button>}
          </div>
        </Modal>
      )}

      {/* ── Page header: file-type selector + Create dropdown ── */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",gap:2,background:"var(--bg3)",borderRadius:8,padding:3}}>
          <button onClick={()=>setDocType("ro")} style={{padding:"6px 18px",borderRadius:6,border:"none",cursor:"pointer",fontWeight:600,fontSize:13,background:docType==="ro"?"var(--bg2)":"transparent",color:docType==="ro"?"#3B6D11":"var(--text3)",boxShadow:docType==="ro"?"0 1px 4px rgba(0,0,0,.08)":"none"}}>◉ RO</button>
          <button onClick={()=>setDocType("mpo")} style={{padding:"6px 18px",borderRadius:6,border:"none",cursor:"pointer",fontWeight:600,fontSize:13,background:docType==="mpo"?"var(--bg2)":"transparent",color:docType==="mpo"?"var(--brand)":"var(--text3)",boxShadow:docType==="mpo"?"0 1px 4px rgba(0,0,0,.08)":"none"}}>◈ MPO</button>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          {/* ── Drafts queue button ── */}
          {canEdit&&(roDrafts.length>0||mpoDrafts.length>0)&&(
            <div ref={draftsMenuRef} style={{position:"relative"}}>
              <button onClick={()=>setDraftsMenuOpen(v=>!v)} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 12px",borderRadius:8,border:"1px solid #f59e0b",background:draftsMenuOpen?"#fef3c7":"#fffbeb",color:"#92400e",fontSize:12,fontWeight:600,cursor:"pointer",transition:"background .15s"}}>
                📝 Drafts <span style={{background:"#f59e0b",color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:11,fontWeight:700}}>{roDrafts.length+mpoDrafts.length}</span>
              </button>
              {draftsMenuOpen&&(
                <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,background:"var(--bg2)",border:"1px solid var(--border-c)",borderRadius:10,zIndex:300,minWidth:300,maxHeight:420,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,.16)"}}>
                  {roDrafts.length>0&&(
                    <>
                      <div style={{padding:"8px 14px 4px",fontSize:10,fontWeight:800,color:"#3B6D11",textTransform:"uppercase",letterSpacing:".5px",borderBottom:"1px solid var(--border-c)"}}>◉ Release Orders</div>
                      {roDrafts.map(d=>(
                        <div key={d.id} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 14px",borderBottom:"1px solid var(--border-c)"}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:600,fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{d.label||"Untitled"}</div>
                            <div style={{fontSize:11,color:"var(--text3)"}}>Step {d.step||1}/3 · {timeAgo(d.savedAt)}</div>
                          </div>
                          <button className="btn btn-sm btn-primary" style={{flexShrink:0}} onClick={()=>resumeRoDraft(d)}>Resume</button>
                          <button style={{flexShrink:0,background:"transparent",border:"none",cursor:"pointer",color:"var(--text3)",fontSize:18,lineHeight:1,padding:"0 2px"}} title="Delete draft" onClick={()=>deleteRoDraft(d.id)}>×</button>
                        </div>
                      ))}
                    </>
                  )}
                  {mpoDrafts.length>0&&(
                    <>
                      <div style={{padding:"8px 14px 4px",fontSize:10,fontWeight:800,color:"var(--brand)",textTransform:"uppercase",letterSpacing:".5px",borderBottom:"1px solid var(--border-c)"}}>◈ MPOs</div>
                      {mpoDrafts.map(d=>(
                        <div key={d.id} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 14px",borderBottom:"1px solid var(--border-c)"}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:600,fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{d.label||"Untitled"}</div>
                            <div style={{fontSize:11,color:"var(--text3)"}}>{timeAgo(d.savedAt)}</div>
                          </div>
                          <button className="btn btn-sm btn-primary" style={{flexShrink:0}} onClick={()=>resumeMpoDraft(d)}>Resume</button>
                          <button style={{flexShrink:0,background:"transparent",border:"none",cursor:"pointer",color:"var(--text3)",fontSize:18,lineHeight:1,padding:"0 2px"}} title="Delete draft" onClick={()=>deleteMpoDraft(d.id)}>×</button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          {/* ── Create dropdown ── */}
          {canEdit&&(
            <div ref={menuRef} style={{position:"relative"}}>
              <button className="btn btn-primary" style={{display:"flex",alignItems:"center",gap:6}} onClick={()=>setCreateMenu(v=>!v)}>
                + Create <span style={{fontSize:10,opacity:.8}}>▾</span>
              </button>
              {createMenu&&(
                <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,background:"var(--bg2)",border:"1px solid var(--border-c)",borderRadius:10,overflow:"hidden",zIndex:300,minWidth:200,boxShadow:"0 8px 24px rgba(0,0,0,.14)"}}>
                  <button onClick={()=>{setCreateMenu(false);setRoDraftToLoad(null);setEditRoId(null);setShowRoForm(true);setDocType("ro");}} style={{display:"block",width:"100%",padding:"12px 16px",textAlign:"left",background:"transparent",border:"none",cursor:"pointer",fontSize:13,color:"var(--text)"}}>
                    <div style={{fontWeight:600}}><span style={{color:"#3B6D11",marginRight:8}}>◉</span>New RO</div>
                    <div style={{fontSize:11,color:"var(--text3)",marginTop:2,paddingLeft:22}}>Release Order to vendor</div>
                  </button>
                  <div style={{height:1,background:"var(--border-c)"}}/>
                  <button onClick={()=>{setCreateMenu(false);openNew();setDocType("mpo");}} style={{display:"block",width:"100%",padding:"12px 16px",textAlign:"left",background:"transparent",border:"none",cursor:"pointer",fontSize:13,color:"var(--text)"}}>
                    <div style={{fontWeight:600}}><span style={{color:"var(--brand)",marginRight:8}}>◈</span>New MPO</div>
                    <div style={{fontSize:11,color:"var(--text3)",marginTop:2,paddingLeft:22}}>Media Purchase Order</div>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>{/* end right-side flex */}
      </div>

      {/* ══ MPO section ══ */}
      {docType==="mpo"&&(
        <>
          <div className="stat-grid" style={{gridTemplateColumns:"repeat(4,1fr)"}}>
            {[{l:"Total",v:mpos.length},{l:"Active",v:mpos.filter(m=>m.status==="active").length},{l:"Pending",v:mpos.filter(m=>m.status==="pending").length},{l:"Value",v:fmtK(mpos.reduce((a,m)=>a+convertAmt(m.amount,m.currency||"NGN",dCcy),0),CURRENCIES[dCcy]?.symbol||"₦")}].map(s=><div key={s.l} className="stat-card"><div className="stat-label">{s.l}</div><div className="stat-value">{s.v}</div></div>)}
          </div>
          <div className="card">
            <div className="card-header">
              <div className="tabs" style={{marginBottom:0}}>{["all","active","pending","completed"].map(t=><button key={t} className={`tab ${tab===t?"active":""}`} onClick={()=>setTab(t)}>{t}</button>)}</div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <select className="form-input" style={{width:"auto",fontSize:12,padding:"4px 8px"}} value={mpoAgencyFilter} onChange={e=>setMpoAgencyFilter(e.target.value)}>
                  <option value="">All Agencies</option>
                  {mpoAgencies.map(a=><option key={a} value={a}>{a}</option>)}
                </select>
                {mpoAgencyFilter&&<button className="btn btn-sm btn-ghost" style={{fontSize:11}} onClick={()=>setMpoAgencyFilter("")}>✕ Clear</button>}
                <div className="search-bar"><span style={{color:"var(--text3)"}}>⌕</span><input placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
              </div>
            </div>
            <div className="table-wrap"><table>
              <thead><tr><th><input type="checkbox" checked={selected.size===filtered.length&&filtered.length>0} onChange={toggleAll}/></th><th>ID</th><th>Agency</th><th>Brand</th><th>Campaign</th><th>Spots</th><th>Dur.</th><th>Value</th><th>Month</th><th>Status</th><th>Exec</th><th></th></tr></thead>
              <tbody>{filtered.length===0?<tr className="empty-row"><td colSpan={12}>No MPOs found</td></tr>
              :filtered.map(m=>(
                <tr key={m.id} style={{background:selected.has(m.id)?"var(--brand-light)":""}}>
                  <td><input type="checkbox" checked={selected.has(m.id)} onChange={()=>toggleSel(m.id)}/></td>
                  <td style={{fontFamily:"monospace",fontSize:12,fontWeight:500}}>{shortId(m.id)}</td>
                  <td style={{fontSize:12,color:"var(--text2)"}}>{m.agency||"—"}</td>
                  <td>{m.client}</td><td>{m.campaign}</td>
                  <td style={{fontWeight:500,textAlign:"center"}}>{m.spots||"—"}</td>
                  <td style={{textAlign:"center",color:"var(--text3)",fontSize:11}}>{m.materialDuration||30}s</td>
                  <td style={{fontWeight:500}}>{fmtCcy(m.amount,m.currency||"NGN",dCcy)}</td>
                  <td style={{fontSize:11,color:"var(--text3)"}}>{campaignMonth(m.start)}</td>
                  <td><SBadge s={m.status}/></td><td><SBadge s={m.exec}/></td>
                  <td><div className="action-row">
                    <button className="btn btn-sm" style={{padding:"2px 8px",fontSize:11}} onClick={()=>printMPO(m,settings||{})}>PDF</button>
                    <button className="btn btn-sm btn-ghost" title={`Comments (${(comments[m.id]||[]).length})`} onClick={()=>setCommentsFor(m.id)}>💬{(comments[m.id]||[]).length>0&&<span className="collab-badge">{(comments[m.id]||[]).length}</span>}</button>
                    <button className="btn btn-sm btn-ghost" title={`Docs (${(m.docs||[]).length})`} onClick={()=>setDocsFor(m.id)}>📎{(m.docs||[]).length>0&&<span style={{fontSize:9,marginLeft:1}}>{(m.docs||[]).length}</span>}</button>
                    {canEdit&&<><button className="btn btn-sm btn-ghost" onClick={()=>openEdit(m)}>✏</button><button className="btn btn-sm btn-ghost" style={{color:"#A32D2D"}} onClick={()=>del(m.id)}>✕</button></>}
                  </div></td>
                </tr>
              ))}</tbody>
            </table></div>
          </div>
          {selected.size>0&&(<div className="bulk-bar"><span className="bulk-count">{selected.size}</span><span>selected</span><select className="form-input" style={{width:"auto",padding:"3px 8px",fontSize:12,background:"#333",color:"#fff",border:"0.5px solid #555"}} value={bulkStatus} onChange={e=>setBulkStatus(e.target.value)}><option value="">Set status…</option><option value="active">Active</option><option value="pending">Pending</option><option value="completed">Completed</option></select><button className="btn btn-sm btn-primary" onClick={applyBulk} disabled={!bulkStatus}>Apply</button><button className="btn btn-sm" style={{background:"#333",color:"#aaa",border:"0.5px solid #555"}} onClick={bulkExport}>Export</button><button className="btn btn-sm btn-ghost" style={{color:"#aaa",marginLeft:"auto"}} onClick={()=>setSelected(new Set())}>✕</button></div>)}
        </>
      )}

      {/* ══ RO section ══ */}
      {docType==="ro"&&(
        <>
          <div className="stat-grid" style={{gridTemplateColumns:"repeat(4,1fr)"}}>
            {[
              {l:"Total ROs",v:(ros||[]).length},
              {l:"Confirmed",v:(ros||[]).filter(r=>r.status==="confirmed").length},
              {l:"Sent",v:(ros||[]).filter(r=>r.status==="sent").length},
              {l:"Total Value",v:fmtK((ros||[]).reduce((a,r)=>a+(r.schedule||[]).reduce((b,s)=>b+(s.spots*s.rate),0),0),CURRENCIES[dCcy]?.symbol||"₦")},
            ].map(s=><div key={s.l} className="stat-card"><div className="stat-label">{s.l}</div><div className="stat-value">{s.v}</div></div>)}
          </div>
          <div className="card">
            <div className="card-header" style={{flexWrap:"wrap",gap:8}}>
              <div className="tabs" style={{marginBottom:0}}>{["all","draft","sent","confirmed","executed"].map(t=><button key={t} className={`tab ${roStatusTab===t?"active":""}`} onClick={()=>setRoStatusTab(t)}>{t}</button>)}</div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <select className="form-input" style={{width:"auto",fontSize:12,padding:"4px 8px"}} value={roClientFilter} onChange={e=>setRoClientFilter(e.target.value)}>
                  <option value="">All Clients</option>
                  {roClients.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
                <select className="form-input" style={{width:"auto",fontSize:12,padding:"4px 8px"}} value={roChannelFilter} onChange={e=>setRoChannelFilter(e.target.value)}>
                  <option value="">All Channels</option>
                  {roChannels.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
                {(roClientFilter||roChannelFilter)&&<button className="btn btn-sm btn-ghost" style={{fontSize:11}} onClick={()=>{setRoClientFilter("");setRoChannelFilter("");}}>✕ Clear</button>}
                <div className="search-bar"><span style={{color:"var(--text3)"}}>⌕</span><input placeholder="Search…" value={roSearch} onChange={e=>setRoSearch(e.target.value)}/></div>
              </div>
            </div>
            {filteredRos.length===0
              ?<div style={{textAlign:"center",padding:48,color:"var(--text3)"}}>No Release Orders yet — use + Create → RO to get started.</div>
              :<div className="table-wrap"><table>
                <thead><tr><th>ID</th><th>Client</th><th>Vendor</th><th>Campaign</th><th>Channel</th><th>Month</th><th>Spots</th><th>Amt Payable</th><th>Status</th><th></th></tr></thead>
                <tbody>{filteredRos.map(r=>{
                  const roTotals=calcRoTotals(r,settings?.whtRate||0);
                  const sym=CURRENCIES[r.currency||"NGN"]?.symbol||"₦";
                  return(
                    <tr key={r.id} style={{cursor:"pointer"}} onClick={()=>setSelRo(r)}>
                      <td style={{fontFamily:"monospace",fontSize:12,fontWeight:600,color:"var(--brand)"}}>{r.id}</td>
                      <td>{r.client}</td>
                      <td style={{color:"var(--text2)"}}>{r.vendor}</td>
                      <td>{r.campaign}</td>
                      <td><span className="rate-tag">{r.channel}</span></td>
                      <td style={{fontSize:11,color:"var(--text3)"}}>{campaignMonth(r.campaignMonth||r.start)}</td>
                      <td style={{textAlign:"center",color:"var(--text3)"}}>{(r.schedule||[]).reduce((a,s)=>a+Number(s.spots||0),0)}</td>
                      <td style={{fontWeight:600}}>{sym}{roTotals.amountPayable.toLocaleString("en",{maximumFractionDigits:2})}</td>
                      <td><span style={{fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:700,background:RO_STATUS_BG[r.status]||"#f0f0f0",color:RO_STATUS_COLOR[r.status]||"#888"}}>{r.status}</span></td>
                      <td><div className="action-row" onClick={e=>e.stopPropagation()}>
                        <button className="btn btn-sm" style={{padding:"2px 8px",fontSize:11}} onClick={()=>printROCalendarLegacy(r,settings||{})}>PDF</button>
                        <button className="btn btn-sm btn-ghost" style={{padding:"2px 8px",fontSize:11}} onClick={()=>exportROExcel(r,settings||{})}>XLS</button>
                        {canEdit&&<><button className="btn btn-sm btn-ghost" onClick={()=>{setEditRoId(r.id);setShowRoForm(true);}}>✏</button><button className="btn btn-sm btn-ghost" style={{color:"#A32D2D"}} onClick={()=>deleteRo(r.id)}>✕</button></>}
                      </div></td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            }
          </div>
        </>
      )}
    </div>
  );
}

/* ═══ AGENCY REGISTRATION FORM ═══ */
const EMPTY_BRAND={name:"",industry:"",contact:"",email:""};
const EMPTY_AGENCY={name:"",phone:"",email:"",address:"",regNumber:"",contactPerson:"",contactRole:"",website:"",industry:"Media",status:"active",brands:[]};

function AgencyForm({initial,onSave,onClose}){
  const [step,setStep]=useState(1);
  const [form,setForm]=useState(initial?{...EMPTY_AGENCY,...initial,brands:initial.brands||[]}:{...EMPTY_AGENCY});
  const [errs,setErrs]=useState({});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));

  const addBrand=()=>setForm(f=>({...f,brands:[...f.brands,{...EMPTY_BRAND,id:`b${Date.now()}`}]}));
  const setBrand=(i,k,v)=>setForm(f=>{const b=[...f.brands];b[i]={...b[i],[k]:v};return{...f,brands:b};});
  const removeBrand=(i)=>setForm(f=>({...f,brands:f.brands.filter((_,j)=>j!==i)}));

  const validate=(s)=>{
    const e={};
    if(s===1){
      if(!form.name.trim())e.name="Required";
      if(form.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))e.email="Invalid email";
      if(!form.contactPerson.trim())e.contactPerson="Required";
    }
    if(s===2){
      form.brands.forEach((b,i)=>{if(!b.name.trim())e[`brand_${i}`]="Brand name required";});
    }
    setErrs(e);return Object.keys(e).length===0;
  };

  const handleNext=()=>{if(validate(step))setStep(s=>s+1);};
  const handleSave=()=>{if(validate(2))onSave(form);};

  const STEPS=[{n:1,label:"Agency Info"},{n:2,label:"Brands"}];

  return(
    <div style={{display:"flex",flexDirection:"column",gap:0}}>
      {/* Step indicator */}
      <div style={{display:"flex",alignItems:"flex-start",marginBottom:20}}>
        {STEPS.map((s,i)=>{
          const done=step>s.n,active=step===s.n;
          return(
            <Fragment key={s.n}>
              {i>0&&<div style={{flex:1,height:2,marginTop:13,background:done?"var(--brand)":"var(--border-c)",transition:"background .3s"}}/>}
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,cursor:done?"pointer":"default",minWidth:0}}
                onClick={done?()=>{setErrs({});setStep(s.n);}:undefined}>
                <div style={{width:26,height:26,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,flexShrink:0,background:done||active?"var(--brand)":"var(--bg3)",color:done||active?"#fff":"var(--text3)",boxShadow:active?"0 0 0 3px var(--brand)22":undefined,transition:"all .2s"}}>
                  {done?"✓":s.n}
                </div>
                <span style={{fontSize:10,fontWeight:active?700:500,color:active?"var(--brand)":done?"var(--text2)":"var(--text3)",whiteSpace:"nowrap"}}>{s.label}</span>
              </div>
            </Fragment>
          );
        })}
      </div>

      {/* Step 1: Agency Info */}
      {step===1&&(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 16px"}}>
            <FF id="ag-name" label="Agency Name" required err={errs.name} style={{gridColumn:"1/-1"}}>
              <input id="ag-name" className={`form-input ${errs.name?"error":""}`} value={form.name} onChange={e=>set("name",e.target.value)} placeholder="e.g. QVT Media Nigeria"/>
            </FF>
            <FF id="ag-industry" label="Industry">
              <select id="ag-industry" className="form-input" value={form.industry} onChange={e=>set("industry",e.target.value)}>
                {["Media","Advertising","PR & Communications","Digital","OOH","Production","Other"].map(o=><option key={o}>{o}</option>)}
              </select>
            </FF>
            <FF id="ag-reg" label="RC / Registration Number">
              <input id="ag-reg" className="form-input" value={form.regNumber} onChange={e=>set("regNumber",e.target.value)} placeholder="RC 123456"/>
            </FF>
            <FF id="ag-contact" label="Primary Contact Person" required err={errs.contactPerson}>
              <input id="ag-contact" className={`form-input ${errs.contactPerson?"error":""}`} value={form.contactPerson} onChange={e=>set("contactPerson",e.target.value)} placeholder="Full name"/>
            </FF>
            <FF id="ag-role" label="Contact Role / Title">
              <input id="ag-role" className="form-input" value={form.contactRole} onChange={e=>set("contactRole",e.target.value)} placeholder="e.g. Managing Director"/>
            </FF>
            <FF id="ag-email" label="Email Address" required err={errs.email}>
              <input id="ag-email" type="email" className={`form-input ${errs.email?"error":""}`} value={form.email} onChange={e=>set("email",e.target.value)} placeholder="agency@example.com"/>
            </FF>
            <FF id="ag-phone" label="Phone Number">
              <input id="ag-phone" className="form-input" value={form.phone} onChange={e=>set("phone",e.target.value)} placeholder="+234 800 000 0000"/>
            </FF>
            <FF id="ag-website" label="Website (optional)">
              <input id="ag-website" className="form-input" value={form.website} onChange={e=>set("website",e.target.value)} placeholder="www.agency.com"/>
            </FF>
            <FF id="ag-address" label="Office Address" style={{gridColumn:"1/-1"}}>
              <input id="ag-address" className="form-input" value={form.address} onChange={e=>set("address",e.target.value)} placeholder="Street, City, State"/>
            </FF>
            <FF id="ag-status" label="Status">
              <select id="ag-status" className="form-input" value={form.status} onChange={e=>set("status",e.target.value)}>
                {["active","inactive","prospect"].map(s=><option key={s}>{s}</option>)}
              </select>
            </FF>
          </div>
        </div>
      )}

      {/* Step 2: Brands */}
      {step===2&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>Brands Under {form.name||"this Agency"}</div>
              <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>Add all brands this agency manages. You can add more later.</div>
            </div>
            <button type="button" className="btn btn-sm btn-primary" onClick={addBrand}>+ Add Brand</button>
          </div>

          {form.brands.length===0?(
            <div style={{padding:"32px 16px",background:"var(--bg3)",borderRadius:10,textAlign:"center",border:"2px dashed var(--border-c)"}}>
              <div style={{fontSize:24,marginBottom:8}}>🏷</div>
              <div style={{fontSize:13,fontWeight:600,color:"var(--text2)",marginBottom:4}}>No brands added yet</div>
              <div style={{fontSize:11,color:"var(--text3)",marginBottom:12}}>Click "+ Add Brand" to register brands managed by this agency</div>
              <button type="button" className="btn btn-primary btn-sm" onClick={addBrand}>+ Add First Brand</button>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {form.brands.map((b,i)=>(
                <div key={i} style={{background:"var(--bg2)",border:"1px solid var(--border-c)",borderRadius:10,padding:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:"var(--brand)"}}>Brand {i+1}</div>
                    <button type="button" className="btn btn-sm btn-ghost" style={{color:"#A32D2D",padding:"2px 6px"}} onClick={()=>removeBrand(i)}>✕ Remove</button>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 12px"}}>
                    <FF id={`bn-${i}`} label="Brand Name" err={errs[`brand_${i}`]} style={{gridColumn:"1/-1"}}>
                      <input className="form-input" value={b.name} onChange={e=>setBrand(i,"name",e.target.value)} placeholder="e.g. Nivea, MTN, Peak Milk"/>
                    </FF>
                    <FF id={`bi-${i}`} label="Industry / Category">
                      <input className="form-input" value={b.industry} onChange={e=>setBrand(i,"industry",e.target.value)} placeholder="e.g. FMCG, Telecom"/>
                    </FF>
                    <FF id={`bc-${i}`} label="Brand Contact Person">
                      <input className="form-input" value={b.contact} onChange={e=>setBrand(i,"contact",e.target.value)} placeholder="Marketing manager"/>
                    </FF>
                    <FF id={`be-${i}`} label="Brand Email">
                      <input className="form-input" type="email" value={b.email} onChange={e=>setBrand(i,"email",e.target.value)} placeholder="brand@client.com"/>
                    </FF>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div style={{display:"flex",justifyContent:"space-between",paddingTop:14,borderTop:"1px solid var(--border-c)",marginTop:16}}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <div style={{display:"flex",gap:8}}>
          {step>1&&<button className="btn btn-ghost" onClick={()=>{setErrs({});setStep(s=>s-1);}}>← Back</button>}
          {step<2&&<button className="btn btn-primary" onClick={handleNext}>Continue →</button>}
          {step===2&&<button className="btn btn-primary" onClick={handleSave}>Save Agency</button>}
        </div>
      </div>
    </div>
  );
}

/* ═══ CLIENTS ═══ */
const ECLI={name:"",type:"Client",industry:"",contact:"",email:""};
function ClientsPage({clients,setClients,toast,user,addAudit,onOnboard}){
  const [tab,setTab]=useState("all");const [search,setSearch]=useState("");
  const [showF,setShowF]=useState(false);const [eid,setEid]=useState(null);
  const [form,setForm]=useState(ECLI);const [errs,setErrs]=useState({});
  const [selected,setSelected]=useState(new Set());
  const [showAgencyForm,setShowAgencyForm]=useState(false);
  const [editAgencyId,setEditAgencyId]=useState(null);
  const [viewAgency,setViewAgency]=useState(null);
  const canEdit=user.permissions.includes("clients");

  const agencies=clients.filter(r=>r.type==="Agency");

  const filtered=clients.filter(r=>{
    if(tab==="clients"&&r.type!=="Client")return false;
    if(tab==="vendors"&&r.type!=="Vendor")return false;
    if(tab==="agencies"&&r.type!=="Agency")return false;
    if(search&&!`${r.name}${r.contact||""}${r.contactPerson||""}${r.industry}`.toLowerCase().includes(search.toLowerCase()))return false;
    return true;
  });
  const val=()=>{const e={};if(!form.name.trim())e.name="Required";if(form.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))e.email="Invalid email";setErrs(e);return!Object.keys(e).length;};
  const openNew=()=>{if(!canEdit)return;setForm(ECLI);setEid(null);setErrs({});setShowF(true);};
  const openEdit=r=>{if(!canEdit)return;setForm({name:r.name,type:r.type,industry:r.industry,contact:r.contact,email:r.email});setEid(r.id);setErrs({});setShowF(true);};
  const save=()=>{if(!val())return;if(eid){setClients(p=>p.map(r=>r.id===eid?{...r,...form}:r));toast("Updated");addAudit("updated","Client",eid,`Updated ${form.name}`,"update");}else{const px=form.type==="Client"?"C":"V";const n=Math.max(0,...clients.filter(c=>c.id.startsWith(px)).map(c=>parseInt(c.id.slice(1))||0))+1;const newId=`${px}${String(n).padStart(3,"0")}`;setClients(p=>[...p,{id:newId,...form,spend:0,status:"active"}]);toast(`${form.type} added`);addAudit("created","Client",newId,`Added ${form.name}`,"create");}setShowF(false);};
  const del=id=>{if(!canEdit||!confirm("Delete?"))return;const r=clients.find(c=>c.id===id);setClients(p=>p.filter(c=>c.id!==id));addAudit("deleted","Client",id,`Deleted ${r?.name}`,"delete");toast("Deleted","error");};

  const saveAgency=(data)=>{
    if(editAgencyId){
      setClients(p=>p.map(r=>r.id===editAgencyId?{...r,...data,type:"Agency"}:r));
      toast("Agency updated","success");addAudit("updated","Agency",editAgencyId,`Updated ${data.name}`,"update");
    }else{
      const n=Math.max(0,...clients.filter(c=>c.id.startsWith("AG")).map(c=>parseInt(c.id.slice(2))||0))+1;
      const newId=`AG${String(n).padStart(3,"0")}`;
      setClients(p=>[...p,{id:newId,...data,type:"Agency",spend:0}]);
      toast("Agency registered","success");addAudit("created","Agency",newId,`Registered agency ${data.name}`,"create");
    }
    setShowAgencyForm(false);setEditAgencyId(null);
  };

  const delAgency=id=>{if(!canEdit||!confirm("Delete this agency and all its brands?"))return;const r=clients.find(c=>c.id===id);setClients(p=>p.filter(c=>c.id!==id));addAudit("deleted","Agency",id,`Deleted ${r?.name}`,"delete");toast("Agency deleted","error");};

  const toggleSel=id=>setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleAll=()=>setSelected(s=>s.size===filtered.length?new Set():new Set(filtered.map(r=>r.id)));
  const bulkExport=()=>{const rows=[["ID","Name","Type","Industry","Contact","Email"],...clients.filter(c=>selected.has(c.id)).map(c=>[c.id,c.name,c.type,c.industry,c.contact||c.contactPerson||"",c.email])];const csv=rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");const a=document.createElement("a");a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);a.download="clients.csv";a.click();toast(`Exported`,"info");};

  return(
    <div>
      {showF&&(<Modal title={eid?"Edit":"Add Client / Vendor"} onClose={()=>setShowF(false)}>
        <FF id="tp" label="Type"><select id="tp" className="form-input" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}><option>Client</option><option>Vendor</option></select></FF>
        <FF id="nm" label="Name" required err={errs.name}><input id="nm" className={`form-input ${errs.name?"error":""}`} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></FF>
        <div className="form-grid"><FF id="in" label="Industry"><input id="in" className="form-input" value={form.industry} onChange={e=>setForm(f=>({...f,industry:e.target.value}))}/></FF><FF id="co" label="Contact"><input id="co" className="form-input" value={form.contact} onChange={e=>setForm(f=>({...f,contact:e.target.value}))}/></FF></div>
        <FF id="em" label="Email" err={errs.email}><input id="em" type="email" className={`form-input ${errs.email?"error":""}`} value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></FF>
        <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:8}}><button className="btn" onClick={()=>setShowF(false)}>Cancel</button><button className="btn btn-primary" onClick={save}>{eid?"Save":"Add"}</button></div>
      </Modal>)}

      {showAgencyForm&&(
        <Modal title={editAgencyId?"Edit Agency":"Register Agency"} onClose={()=>{setShowAgencyForm(false);setEditAgencyId(null);}}>
          <AgencyForm
            initial={editAgencyId?clients.find(c=>c.id===editAgencyId):null}
            onSave={saveAgency}
            onClose={()=>{setShowAgencyForm(false);setEditAgencyId(null);}}
          />
        </Modal>
      )}

      {viewAgency&&(
        <Modal title="Agency Profile" onClose={()=>setViewAgency(null)}>
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{display:"flex",alignItems:"center",gap:12,paddingBottom:14,borderBottom:"1px solid var(--border-c)"}}>
              <div style={{width:52,height:52,borderRadius:12,background:"var(--brand)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:18,flexShrink:0}}>{viewAgency.name.slice(0,2).toUpperCase()}</div>
              <div>
                <div style={{fontWeight:700,fontSize:15,color:"var(--text)"}}>{viewAgency.name}</div>
                <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{viewAgency.industry} · {viewAgency.regNumber||"No RC"}</div>
                <SBadge s={viewAgency.status}/>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 20px",fontSize:12}}>
              {[["Contact",viewAgency.contactPerson],["Role",viewAgency.contactRole],["Email",viewAgency.email],["Phone",viewAgency.phone],["Website",viewAgency.website],["Address",viewAgency.address]].map(([l,v])=>v?(
                <div key={l}><div style={{fontSize:10,fontWeight:600,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:2}}>{l}</div><div style={{color:"var(--text)"}}>{v}</div></div>
              ):null)}
            </div>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Brands ({(viewAgency.brands||[]).length})</div>
              {(viewAgency.brands||[]).length===0?(
                <div style={{fontSize:12,color:"var(--text3)",fontStyle:"italic"}}>No brands registered</div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {(viewAgency.brands||[]).map((b,i)=>(
                    <div key={i} style={{background:"var(--bg3)",borderRadius:8,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontWeight:600,fontSize:13,color:"var(--text)"}}>{b.name}</div>
                        <div style={{fontSize:11,color:"var(--text3)",marginTop:1}}>{b.industry||""}{b.contact?` · ${b.contact}`:""}</div>
                      </div>
                      {b.email&&<a href={`mailto:${b.email}`} style={{fontSize:11,color:"var(--brand)"}}>{b.email}</a>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {canEdit&&(
              <div style={{display:"flex",gap:8,paddingTop:8,borderTop:"1px solid var(--border-c)"}}>
                <button className="btn btn-primary btn-sm" onClick={()=>{setEditAgencyId(viewAgency.id);setShowAgencyForm(true);setViewAgency(null);}}>✏ Edit Agency</button>
                <button className="btn btn-sm btn-ghost" style={{color:"#A32D2D"}} onClick={()=>{delAgency(viewAgency.id);setViewAgency(null);}}>Delete</button>
              </div>
            )}
          </div>
        </Modal>
      )}

      <div className="stat-grid" style={{gridTemplateColumns:"repeat(5,1fr)"}}>
        {[{l:"Agencies",v:agencies.length},{l:"Clients",v:clients.filter(r=>r.type==="Client").length},{l:"Vendors",v:clients.filter(r=>r.type==="Vendor").length},{l:"Active",v:clients.filter(r=>r.status==="active").length},{l:"Total Brands",v:agencies.reduce((a,ag)=>a+(ag.brands||[]).length,0)}].map(s=><div key={s.l} className="stat-card"><div className="stat-label">{s.l}</div><div className="stat-value">{s.v}</div></div>)}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="tabs" style={{marginBottom:0}}>{["all","agencies","clients","vendors"].map(t=><button key={t} className={`tab ${tab===t?"active":""}`} onClick={()=>setTab(t)}>{t}</button>)}</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <div className="search-bar"><span style={{color:"var(--text3)"}}>⌕</span><input placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
            {onOnboard&&canEdit&&<button className="btn btn-sm" style={{background:"#EAF3DE",color:"#3B6D11",borderColor:"rgba(59,109,17,.2)"}} onClick={onOnboard}>✦ Onboard</button>}
            {canEdit&&<button className="btn btn-sm" style={{background:"#E6F1FB",color:"#185FA5",borderColor:"rgba(24,95,165,.2)"}} onClick={()=>{setEditAgencyId(null);setShowAgencyForm(true);}}>+ Register Agency</button>}
            {canEdit&&tab!=="agencies"&&<button className="btn btn-primary" onClick={openNew}>+ Add</button>}
          </div>
        </div>

        {tab==="agencies"?(
          agencies.length===0?(
            <div style={{padding:"48px 24px",textAlign:"center",color:"var(--text3)"}}>
              <div style={{fontSize:32,marginBottom:8}}>🏢</div>
              <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>No agencies registered</div>
              <div style={{fontSize:12,marginBottom:16}}>Register agencies and the brands they manage</div>
              {canEdit&&<button className="btn btn-primary" onClick={()=>{setEditAgencyId(null);setShowAgencyForm(true);}}>+ Register First Agency</button>}
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:10,padding:"4px 0"}}>
              {agencies.filter(a=>!search||a.name.toLowerCase().includes(search.toLowerCase())||a.contactPerson?.toLowerCase().includes(search.toLowerCase())).map(ag=>(
                <div key={ag.id} style={{border:"1px solid var(--border-c)",borderRadius:10,padding:"14px 16px",background:"var(--bg1)",cursor:"pointer",transition:"box-shadow .15s"}}
                  onClick={()=>setViewAgency(ag)}
                  onMouseEnter={e=>(e.currentTarget.style.boxShadow="0 2px 12px rgba(0,0,0,.08)")}
                  onMouseLeave={e=>(e.currentTarget.style.boxShadow="none")}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:40,height:40,borderRadius:10,background:"var(--brand)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:14,flexShrink:0}}>{ag.name.slice(0,2).toUpperCase()}</div>
                      <div>
                        <div style={{fontWeight:700,fontSize:14,color:"var(--text)"}}>{ag.name}</div>
                        <div style={{fontSize:11,color:"var(--text3)",marginTop:1}}>{ag.industry} · {ag.contactPerson||"—"}{ag.contactRole?` (${ag.contactRole})`:""}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <SBadge s={ag.status}/>
                      {canEdit&&<div className="action-row" onClick={e=>e.stopPropagation()}>
                        <button className="btn btn-sm btn-ghost" onClick={()=>{setEditAgencyId(ag.id);setShowAgencyForm(true);}}>✏</button>
                        <button className="btn btn-sm btn-ghost" style={{color:"#A32D2D"}} onClick={()=>delAgency(ag.id)}>✕</button>
                      </div>}
                    </div>
                  </div>
                  {(ag.brands||[]).length>0&&(
                    <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid var(--border-c)",display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                      <span style={{fontSize:10,fontWeight:600,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".05em",marginRight:2}}>Brands:</span>
                      {(ag.brands||[]).map((b,i)=>(
                        <span key={i} style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"var(--bg3)",border:"1px solid var(--border-c)",color:"var(--text2)",fontWeight:500}}>{b.name}</span>
                      ))}
                    </div>
                  )}
                  <div style={{marginTop:8,display:"flex",gap:16,fontSize:11,color:"var(--text3)"}}>
                    {ag.email&&<span>✉ {ag.email}</span>}
                    {ag.phone&&<span>📞 {ag.phone}</span>}
                    {ag.address&&<span>📍 {ag.address}</span>}
                  </div>
                </div>
              ))}
            </div>
          )
        ):(
          <>
            <div className="table-wrap"><table>
              <thead><tr><th><input type="checkbox" checked={selected.size===filtered.length&&filtered.length>0} onChange={toggleAll}/></th><th>Name</th><th>Type</th><th>Industry</th><th>Contact</th><th>Email</th><th>Status</th><th></th></tr></thead>
              <tbody>{filtered.length===0?<tr className="empty-row"><td colSpan={8}>No records</td></tr>
              :filtered.map(r=>(
                <tr key={r.id} style={{background:selected.has(r.id)?"var(--brand-light)":""}}>
                  <td><input type="checkbox" checked={selected.has(r.id)} onChange={()=>toggleSel(r.id)}/></td>
                  <td><div style={{display:"flex",alignItems:"center",gap:8}}><div className="avatar">{r.name.slice(0,2).toUpperCase()}</div><span style={{fontWeight:500}}>{r.name}</span></div></td>
                  <td><span className={`badge ${r.type==="Client"?"badge-purple":r.type==="Vendor"?"badge-blue":"badge-green"}`}>{r.type}</span></td>
                  <td style={{color:"var(--text2)"}}>{r.industry}</td>
                  <td>{r.contact||r.contactPerson||"—"}</td>
                  <td style={{color:"var(--text2)",fontSize:12}}><a href={`mailto:${r.email}`} style={{color:"inherit"}}>{r.email}</a></td>
                  <td><SBadge s={r.status}/></td>
                  <td><div className="action-row">{canEdit&&<><button className="btn btn-sm btn-ghost" onClick={()=>openEdit(r)}>✏</button><button className="btn btn-sm btn-ghost" style={{color:"#A32D2D"}} onClick={()=>del(r.id)}>✕</button></>}</div></td>
                </tr>
              ))}</tbody>
            </table></div>
            {selected.size>0&&(<div className="bulk-bar"><span className="bulk-count">{selected.size}</span><span>selected</span><button className="btn btn-sm" style={{background:"#333",color:"#aaa",border:"0.5px solid #555"}} onClick={bulkExport}>Export CSV</button><button className="btn btn-sm btn-ghost" style={{color:"#aaa",marginLeft:"auto"}} onClick={()=>setSelected(new Set())}>✕</button></div>)}
          </>
        )}
      </div>
    </div>
  );
}

/* ═══ CALENDAR ═══ */

// ── RO PDF export ────────────────────────────────────────────────────────────
function printRO(ro, settings={}){
  const DNAMES=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const sym=CURRENCIES[ro.currency||"NGN"]?.symbol||"₦";
  const fa=n=>sym+Number(n).toLocaleString("en",{maximumFractionDigits:2});
  const totals=calcRoTotals(ro);
  const rows=ro.schedule.map(s=>{
    const dn=DNAMES[new Date(s.date+"T12:00:00").getDay()];
    const st=s.spots*s.rate;
    return `<tr><td>${s.date}</td><td>${dn}</td><td>${s.timeSlot||"—"}</td><td style="text-align:center">${s.spots}</td><td style="text-align:right">${fa(s.rate)}</td><td style="text-align:right;font-weight:600">${fa(st)}</td></tr>`;
  }).join("");
  const statusColor=ro.status==="confirmed"?"#3B6D11":ro.status==="executed"?"#185FA5":ro.status==="sent"?"#854F0B":"#888";
  const logoHtml=settings.logoDataUrl?`<img src="${settings.logoDataUrl}" alt="Logo" style="height:48px;max-width:140px;object-fit:contain;margin-bottom:4px;display:block"/>`:""
  const html=`<!DOCTYPE html><html><head><title>Release Order ${ro.id}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui;color:#1a1a1a;padding:40px;max-width:760px;margin:auto;font-size:13px}.hdr{display:flex;justify-content:space-between;margin-bottom:32px}.brand{font-size:20px;font-weight:800;color:#534AB7}.badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;background:#f0f0f0;color:${statusColor};border:1px solid ${statusColor}}hr{border:none;border-top:1px solid #eee;margin:20px 0}.meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:24px}.meta-block label{font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:3px}.meta-block span{font-size:13px;font-weight:600;color:#222}table{width:100%;border-collapse:collapse;margin-bottom:20px}th{text-align:left;font-size:11px;color:#999;padding:8px 10px;background:#f8f8f6;border-bottom:1px solid #eee}td{padding:9px 10px;border-bottom:1px solid #f4f4f4;font-size:12px}.total-row{display:flex;justify-content:flex-end;gap:32px;padding:12px 16px;background:#f8f8f6;border-radius:8px;font-weight:700;font-size:14px;margin-top:4px}.footer{margin-top:40px;font-size:11px;color:#bbb;text-align:center;border-top:1px solid #eee;padding-top:14px}</style></head><body>
  <div class="hdr"><div>${logoHtml}<div class="brand">${settings.companyName||"MediaHub"}</div><div style="font-size:11px;color:#aaa;margin-top:2px">${settings.tagline||"Media Agency · Lagos, Nigeria"}</div></div><div style="text-align:right"><h1 style="font-size:24px;font-weight:800;color:#534AB7">RELEASE ORDER</h1><p style="font-size:12px;color:#666;margin-top:2px"><b>${ro.id}</b></p><div class="badge" style="margin-top:6px">${ro.status}</div></div></div>
  <hr/>
  <div class="meta"><div class="meta-block"><label>Client</label><span>${ro.client}</span></div><div class="meta-block"><label>Vendor / Station</label><span>${ro.vendor}</span></div><div class="meta-block"><label>Campaign</label><span>${ro.campaign}</span></div><div class="meta-block"><label>Channel</label><span>${ro.channel||"—"}</span></div><div class="meta-block"><label>Period</label><span>${ro.start} → ${ro.end}</span></div><div class="meta-block"><label>MPO Ref</label><span>${ro.mpoId||"—"}</span></div></div>
  <hr/>
  <table><thead><tr><th>Date</th><th>Day</th><th>Time Slot</th><th style="text-align:center">Spots</th><th style="text-align:right">Rate</th><th style="text-align:right">Total</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="total-row"><span>Gross Total</span><span>${fa(totals.gross)}</span></div>
  <div class="total-row"><span>Net Total</span><span style="color:#534AB7">${fa(totals.netTotal)}</span></div>
  <div class="footer">Generated by ${settings.companyName||"MediaHub"} · ${new Date().toLocaleDateString("en-NG",{day:"2-digit",month:"short",year:"numeric"})}</div>
  </body></html>`;
  const w=window.open("","_blank","width=820,height=960");w.document.write(html);w.document.close();w.onload=()=>w.print();
}

function printROCalendarLegacy(ro, settings={}){
  const DOW_SHORT=["SU","M","T","W","TH","FR","SA"];
  const MONTH_ABBR=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const sym=CURRENCIES[ro.currency||"NGN"]?.symbol||"₦";
  const fa=(n:number)=>sym+Number(n).toLocaleString("en",{maximumFractionDigits:2});
  const whtRate=Number(settings.whtRate??5);
  const totals=calcRoTotals(ro,whtRate);
  const statusColor=ro.status==="confirmed"?"#3B6D11":ro.status==="executed"?"#185FA5":ro.status==="sent"?"#854F0B":"#888";

  // ── Month / days setup ────────────────────────────────────────────────────
  const monthKey=ro.campaignMonth||ro.start?.slice(0,7)||"";
  const [yr,mo]=(monthKey?monthKey.split("-").map(Number):[null,null]) as [number|null,number|null];
  const daysInMonth=yr&&mo?new Date(yr,mo,0).getDate():31;
  const titleLabel=yr&&mo?`${MONTH_ABBR[mo-1]}-${String(yr).slice(2)} SCHEDULE`:"SCHEDULE";

  // ── Build per-day DOW row ─────────────────────────────────────────────────
  const dayDOW:string[]=Array.from({length:daysInMonth},(_,i)=>{
    if(!yr||!mo) return "";
    const date=`${yr}-${String(mo).padStart(2,"0")}-${String(i+1).padStart(2,"0")}`;
    return DOW_SHORT[new Date(`${date}T12:00:00`).getDay()];
  });

  // ── Group schedule entries by timeSlot ────────────────────────────────────
  const slotMap=new Map<string,Map<number,number>>();
  (ro.schedule||[]).forEach((s:any)=>{
    const slot=s.timeSlot||ro.timeSlot||"—";
    if(!slotMap.has(slot)) slotMap.set(slot,new Map());
    const d=parseInt(s.date?.slice(8,10)||"0",10);
    if(d>0) slotMap.get(slot)!.set(d,(slotMap.get(slot)!.get(d)||0)+Number(s.spots||0));
  });
  if(slotMap.size===0) slotMap.set(ro.timeSlot||"—",new Map());

  // ── Build HTML rows ───────────────────────────────────────────────────────
  const rows=([...slotMap.entries()] as [string,Map<number,number>][]).map(([slot,daySpots])=>{
    const cells:Array<number|string>=Array.from({length:daysInMonth},(_,i)=>{
      const v=daySpots.get(i+1)||0;
      return v>0?v:"";
    });
    const rowTotal=[...daySpots.values()].reduce((a,v)=>a+v,0);
    const dayCells=cells.map(c=>`<td class="dc">${c}</td>`).join("");
    return {cells,rowTotal,html:`<tr><td class="tb">${slot}</td><td class="pg">${ro.programme||""}</td>${dayCells}<td class="st">${rowTotal}</td><td class="mc">${ro.materialTitle||""}</td></tr>`};
  });

  const grandSpots=rows.reduce((a,r)=>a+r.rowTotal,0);

  // ── Totals row ────────────────────────────────────────────────────────────
  const totalDayCells=Array.from({length:daysInMonth},(_,i)=>{
    const v=rows.reduce((a,r)=>a+(Number(r.cells[i])||0),0);
    return `<td class="dc" style="font-weight:700">${v>0?v:""}</td>`;
  }).join("");

  // ── Column header cells ───────────────────────────────────────────────────
  const dayNumCells=Array.from({length:daysInMonth},(_,i)=>`<th class="dc">${i+1}</th>`).join("");
  const dayDOWCells=dayDOW.map(d=>`<td class="dc dow">${d}</td>`).join("");

  const css=`*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;padding:20px 18px;font-size:11px}
@page{size:landscape;margin:12mm}
@media print{body{padding:0}}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px}
.brand{font-size:17px;font-weight:800;color:#1a2d5a}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:700;text-transform:uppercase;color:${statusColor};border:1px solid ${statusColor}}
hr{border:none;border-top:1px solid #ddd;margin:10px 0}
.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:8px 18px;margin-bottom:12px}
.meta label{font-size:8.5px;color:#999;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:1px}
.meta span{font-size:10.5px;font-weight:600;color:#222}
.sched-title{text-align:center;font-weight:800;font-size:12px;letter-spacing:.18em;color:#1a2d5a;padding:8px 0 5px;text-transform:uppercase}
table{width:100%;border-collapse:collapse;table-layout:auto}
th,td{border:1px solid #9aabcc;text-align:center;padding:2px 2px;font-size:8.5px;white-space:nowrap}
.th-hdr{background:#1a2d5a;color:#fff;font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:.06em;padding:5px 3px}
.th-side{background:#1a2d5a;color:#fff;font-weight:700;font-size:8.5px;text-align:left;padding:4px 5px}
.dc{width:18px;min-width:16px;font-size:8px;padding:2px 1px;background:#dde6f7}
.dow{background:#c8d5ee;font-weight:700;color:#1a2d5a;font-size:7.5px}
.tb{text-align:left;padding:3px 5px;font-weight:700;font-size:9px;min-width:72px;background:#fff}
.pg{text-align:left;padding:3px 5px;font-size:9px;min-width:80px;background:#fff}
.dc.spot{font-weight:800;color:#1a2d5a}
.st{font-weight:800;font-size:10px;color:#1a2d5a;background:#dde6f7;min-width:34px}
.mc{text-align:left;padding:3px 5px;font-size:8.5px;min-width:90px;background:#fff}
.tr-tot td{background:#eef3ff;font-weight:700}
.cst{width:300px;border-collapse:collapse;font-size:10px}
.cst thead th{background:#1a2d5a;color:#fff;font-weight:700;font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:5px 10px;text-align:left}
.cst tbody td{padding:4px 10px;border-bottom:1px solid #e8ecf4;color:#222}
.cst tbody td:last-child{text-align:right;font-weight:600;min-width:90px}
.cst .neg td:last-child{color:#a32d2d}
.cst .subtotal td{font-weight:700;border-top:1.5px solid #9aabcc;border-bottom:1.5px solid #9aabcc;background:#f4f7fc}
.cst .payable td{font-weight:800;font-size:11px;color:#1a2d5a;background:#e6eef9;border-top:2px solid #1a2d5a}
.footer{margin-top:14px;font-size:8.5px;color:#bbb;text-align:center;border-top:1px solid #eee;padding-top:8px}`;

  const logoHtml=settings.logoDataUrl?`<img src="${settings.logoDataUrl}" alt="Logo" style="height:36px;max-width:110px;object-fit:contain;margin-bottom:3px;display:block"/>`:"";
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Release Order ${ro.id}</title><style>${css}</style></head><body>
<div class="hdr">
  <div>${logoHtml}<div class="brand">${settings.companyName||"MediaHub"}</div><div style="font-size:9px;color:#aaa;margin-top:2px">${settings.tagline||"Media Agency · Lagos, Nigeria"}</div></div>
  <div style="text-align:right"><div style="font-size:15px;font-weight:800;color:#1a2d5a">RELEASE ORDER</div><div style="font-size:9.5px;color:#666;margin-top:2px"><b>${ro.id}</b></div><div class="badge" style="margin-top:4px">${ro.status}</div></div>
</div>
<hr/>
<div class="meta">
  <div><label>Client</label><span>${ro.client}</span></div>
  <div><label>Vendor / Station</label><span>${ro.vendor}</span></div>
  <div><label>Campaign</label><span>${ro.campaign}</span></div>
  <div><label>Channel</label><span>${ro.channel||"—"}</span></div>
  <div><label>Period</label><span>${yr&&mo?new Date(yr,mo-1,1).toLocaleDateString("en-NG",{month:"long",year:"numeric"}):(ro.start||"—")}</span></div>
  <div><label>MPO Ref</label><span>${ro.mpoId||"—"}</span></div>
  <div><label>Status</label><span>${ro.status}</span></div>
  <div><label>Currency</label><span>${ro.currency||"NGN"}</span></div>
</div>
<hr/>
<div class="sched-title">${titleLabel}</div>
<table>
  <thead>
    <tr>
      <th class="th-side" rowspan="3" style="vertical-align:middle">Time Belt</th>
      <th class="th-side" rowspan="3" style="vertical-align:middle">Programme</th>
      <th class="th-hdr" colspan="${daysInMonth}">S C H E D U L E</th>
      <th class="th-hdr" rowspan="3" style="vertical-align:middle;min-width:34px">NO OF<br/>SPOTS</th>
      <th class="th-hdr" rowspan="3" style="vertical-align:middle;text-align:left;padding-left:5px;min-width:90px">MATERIAL TITLE/<br/>SPECIFICATION</th>
    </tr>
    <tr>${dayNumCells}</tr>
    <tr>${dayDOWCells}</tr>
  </thead>
  <tbody>
    ${rows.map(r=>r.html).join("")}
    <tr class="tr-tot">
      <td colspan="2" style="text-align:right;padding-right:6px;font-size:9px;font-weight:700">TOTAL</td>
      ${totalDayCells}
      <td class="st">${grandSpots}</td>
      <td class="mc"></td>
    </tr>
  </tbody>
</table>
<div style="display:flex;justify-content:flex-end;margin-top:12px">
<table class="cst">
  <thead><tr><th colspan="2">COSTING SUMMARY</th></tr></thead>
  <tbody>
    <tr><td>Rate per Spot</td><td>${fa(ro.rate||0)}</td></tr>
    <tr><td>Gross Total</td><td>${fa(totals.gross)}</td></tr>
    <tr><td>Volume Discount (${totals.volumeDiscountPct}%)</td><td class="neg">- ${fa(totals.volumeDiscountAmount)}</td></tr>
    <tr><td>Agency Commission (${totals.agencyCommissionPct}%)</td><td class="neg">- ${fa(totals.agencyCommissionAmount)}</td></tr>
    <tr class="subtotal"><td>Net Total</td><td>${fa(totals.netTotal)}</td></tr>
    <tr><td>WHT (${totals.whtPct}%)</td><td class="neg">- ${fa(totals.whtAmount)}</td></tr>
    <tr class="payable"><td>Amount Payable</td><td>${fa(totals.amountPayable)}</td></tr>
  </tbody>
</table>
</div>
<div class="footer">Generated by ${settings.companyName||"MediaHub"} · ${new Date().toLocaleDateString("en-NG",{day:"2-digit",month:"short",year:"numeric"})}</div>
</body></html>`;
  const w=window.open("","_blank","width=1400,height=960");w.document.write(html);w.document.close();w.onload=()=>w.print();
}

// ── RO Excel/CSV export ───────────────────────────────────────────────────────
async function exportROExcel(ro, settings={}){
  const whtRate=Number((settings as any).whtRate??5);
  const XLS=await import("xlsx-js-style");
  const DOW=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const totals=calcRoTotals(ro,whtRate);
  const sym=CURRENCIES[ro.currency||"NGN"]?.symbol||"₦";
  const numFmt="#,##0.00";
  const intFmt="#,##0";
  const border={top:{style:"thin",color:{rgb:"AAAAAA"}},bottom:{style:"thin",color:{rgb:"AAAAAA"}},left:{style:"thin",color:{rgb:"AAAAAA"}},right:{style:"thin",color:{rgb:"AAAAAA"}}};
  const hdrS={font:{bold:true,sz:10},fill:{fgColor:{rgb:"DCE6F1"}},border,alignment:{horizontal:"center",wrapText:true}};
  const metaLabel={font:{bold:true,sz:10},fill:{fgColor:{rgb:"F2F2F2"}},border};
  const metaVal={font:{sz:10},border};
  const numCell=(v,extra={})=>({v,t:"n",z:numFmt,s:{border,alignment:{horizontal:"center"},...extra}});
  const spotCell=(v,extra={})=>({v,t:"n",z:intFmt,s:{border,alignment:{horizontal:"center"},...extra}});
  const txtCell=(v,s={})=>({v:v||"",t:"s",s:{border,alignment:{horizontal:"center"},...s}});

  // ── Campaign month label ──────────────────────────────────────────────────
  const monthKey=ro.campaignMonth||ro.start?.slice(0,7)||"";
  const campaignMonthLabel=monthKey
    ?new Date(monthKey+"-01T12:00:00").toLocaleDateString("en-NG",{month:"long",year:"numeric"})
    :"—";
  const campaignMonthUpper=campaignMonthLabel.toUpperCase();

  // ── Section 1: RO header info (2-col label-value pairs) ───────────────────
  const companyName=(settings as any).companyName||"MediaHub";
  const tagline=(settings as any).tagline||"Media Agency · Lagos, Nigeria";
  const metaRows=[
    [{v:companyName,t:"s",s:{font:{bold:true,sz:15,color:{rgb:"1A2D5A"}},alignment:{horizontal:"left"}}},{v:tagline,t:"s",s:{font:{sz:9,italic:true,color:{rgb:"999999"}},alignment:{horizontal:"right"}}}],
    [{v:"",t:"s",s:{}},{v:"",t:"s",s:{}}], // spacer
    [{v:"RELEASE ORDER",t:"s",s:{font:{bold:true,sz:14},alignment:{horizontal:"center"}}},{v:"",t:"s",s:{}}],
    [{v:"RO Number:",t:"s",s:metaLabel},{v:ro.id,t:"s",s:{...metaVal,font:{bold:true,color:{rgb:"534AB7"}}}}],
    [{v:"Client:",t:"s",s:metaLabel},{v:ro.client||"",t:"s",s:metaVal}],
    [{v:"Vendor / Station:",t:"s",s:metaLabel},{v:ro.vendor||"",t:"s",s:metaVal}],
    [{v:"Campaign:",t:"s",s:metaLabel},{v:ro.campaign||"",t:"s",s:metaVal}],
    [{v:"Material Title:",t:"s",s:metaLabel},{v:ro.materialTitle||"",t:"s",s:metaVal}],
    [{v:"Channel:",t:"s",s:metaLabel},{v:ro.channel||"",t:"s",s:metaVal}],
    [{v:"Period:",t:"s",s:metaLabel},{v:campaignMonthLabel,t:"s",s:metaVal}],
    [{v:"Currency:",t:"s",s:metaLabel},{v:ro.currency||"NGN",t:"s",s:metaVal}],
    [{v:"",t:"s",s:{}},{v:"",t:"s",s:{}}], // spacer
  ];

  // ── Section 2: Horizontal calendar ─────────────────────────────────────
  const activeDays=(ro.schedule||[]).filter(s=>Number(s.spots)>0);
  const dayNumbers=activeDays.map(s=>new Date(s.date+"T12:00:00").getDate());
  const dayNames=activeDays.map(s=>DOW[new Date(s.date+"T12:00:00").getDay()]);
  const matDur=ro.materialDuration||"—";

  const calTitle=[{v:campaignMonthUpper,t:"s",s:{font:{bold:true,color:{rgb:"FFFFFF"},sz:11},fill:{fgColor:{rgb:"1F3864"}},border,alignment:{horizontal:"center"}}},...Array(activeDays.length+3).fill({v:"",t:"s",s:{}})];
  const calHdr1=[{v:"TIME BELT",t:"s",s:hdrS},{v:"PROGRAMME",t:"s",s:hdrS},...dayNumbers.map(d=>({v:d,t:"n",s:{...hdrS,alignment:{horizontal:"center"}}})),{v:"NO OF SPOTS",t:"s",s:hdrS},{v:"MATERIAL DURATION",t:"s",s:hdrS},{v:"MATERIAL TITLE",t:"s",s:hdrS}];
  const calHdr2=[{v:"",t:"s",s:hdrS},{v:"",t:"s",s:hdrS},...dayNames.map(d=>({v:d,t:"s",s:{...hdrS}})),{v:"",t:"s",s:hdrS},{v:"",t:"s",s:hdrS},{v:"",t:"s",s:hdrS}];

  // Group by time slot
  const slotMap=new Map();
  (ro.schedule||[]).forEach(s=>{
    if(Number(s.spots)>0){const slot=s.timeSlot||ro.timeSlot||"—";if(!slotMap.has(slot))slotMap.set(slot,new Map());slotMap.get(slot).set(new Date(s.date+"T12:00:00").getDate(),Number(s.spots));}
  });
  const calDataRows=[...slotMap.entries()].map(([slot,dayMap])=>{
    const rowTotal=[...dayMap.values()].reduce((a,v)=>a+v,0);
    return [
      txtCell(slot,{alignment:{horizontal:"left"}}),
      txtCell(ro.programme||"",{alignment:{horizontal:"left"}}),
      ...dayNumbers.map(d=>dayMap.has(d)?spotCell(dayMap.get(d),{s:{border,alignment:{horizontal:"center"},font:{bold:true}}}):txtCell("",{fill:{fgColor:{rgb:"F9F9F9"}}})),
      spotCell(rowTotal,{s:{border,font:{bold:true},fill:{fgColor:{rgb:"EAF3DE"}},alignment:{horizontal:"center"}}}),
      txtCell(matDur,{alignment:{horizontal:"center"}}),
      txtCell(ro.materialTitle||"",{alignment:{horizontal:"left"}}),
    ];
  });
  if(calDataRows.length===0) calDataRows.push([txtCell("No spots selected",{alignment:{horizontal:"left"}}),...Array(activeDays.length+4).fill(txtCell(""))]);

  // ── Section 3: Costing summary ───────────────────────────────────────────
  const spacer=[{v:"",t:"s",s:{}}];
  const costHdr=[{v:"COSTING SUMMARY",t:"s",s:{font:{bold:true,sz:11,color:{rgb:"FFFFFF"}},fill:{fgColor:{rgb:"1F3864"}},border,alignment:{horizontal:"center"}}},{v:"",t:"s",s:{}}];
  const costRows=[
    [{v:"Rate per Spot",t:"s",s:metaLabel},{v:totals.gross>0&&activeDays.length>0?totals.gross/activeDays.reduce((a,s)=>a+Number(s.spots),0):Number(ro.rate)||0,t:"n",z:numFmt,s:{border,alignment:{horizontal:"right"}}}],
    [{v:`Gross Total (${activeDays.reduce((a,s)=>a+Number(s.spots),0)} spots)`,t:"s",s:metaLabel},{v:totals.gross,t:"n",z:numFmt,s:{border,alignment:{horizontal:"right"}}}],
    [{v:`Volume Discount (${totals.volumeDiscountPct}%)`,t:"s",s:metaLabel},{v:-totals.volumeDiscountAmount,t:"n",z:numFmt,s:{border,alignment:{horizontal:"right"},font:{color:{rgb:"A32D2D"}}}}],
    [{v:`Agency Commission (${totals.agencyCommissionPct}%)`,t:"s",s:metaLabel},{v:-totals.agencyCommissionAmount,t:"n",z:numFmt,s:{border,alignment:{horizontal:"right"},font:{color:{rgb:"A32D2D"}}}}],
    [{v:"Net Total",t:"s",s:{...metaLabel,font:{bold:true}}},{v:totals.netTotal,t:"n",z:numFmt,s:{border,alignment:{horizontal:"right"},font:{bold:true}}}],
    [{v:`WHT (${totals.whtPct}%)`,t:"s",s:metaLabel},{v:-totals.whtAmount,t:"n",z:numFmt,s:{border,alignment:{horizontal:"right"},font:{color:{rgb:"A32D2D"}}}}],
    [{v:"AMOUNT PAYABLE",t:"s",s:{...metaLabel,font:{bold:true,sz:11}}},{v:totals.amountPayable,t:"n",z:numFmt,s:{border,alignment:{horizontal:"right"},font:{bold:true,sz:12,color:{rgb:"1F5C1F"}},fill:{fgColor:{rgb:"EAF3DE"}}}}],
  ];

  // ── Assemble sheet ────────────────────────────────────────────────────────
  const sheetData=[...metaRows,calTitle,calHdr1,calHdr2,...calDataRows,spacer,costHdr,...costRows];
  const ws=XLS.utils.aoa_to_sheet(sheetData);

  // Merges: company header, RO title, broadcast title, costing title
  const mergeWidth=activeDays.length+4; // timebelt + programme + days + no.spots + mat.dur + mat.title
  ws["!merges"]=[
    {s:{r:0,c:0},e:{r:0,c:mergeWidth}}, // company name row
    {s:{r:2,c:0},e:{r:2,c:1}}, // RELEASE ORDER title
    {s:{r:metaRows.length,c:0},e:{r:metaRows.length,c:mergeWidth}}, // campaign month title
    {s:{r:metaRows.length+calDataRows.length+3,c:0},e:{r:metaRows.length+calDataRows.length+3,c:1}}, // COSTING SUMMARY
  ];

  ws["!cols"]=[{wch:18},{wch:20},...Array(activeDays.length).fill({wch:5}),{wch:12},{wch:18},{wch:22}];
  const wb=XLS.utils.book_new();
  XLS.utils.book_append_sheet(wb,ws,"Release Order");
  XLS.writeFile(wb,`${ro.id}_release_order.xlsx`);
}

// ── Schedule helper ───────────────────────────────────────────────────────────
function buildScheduleDays(start,end,existing=[],defaultRate=0){
  if(!start||!end||start>end) return [];
  const days=[];const cur=new Date(start+"T12:00:00");const last=new Date(end+"T12:00:00");
  while(cur<=last){
    // Use local getters to avoid UTC-offset date shifting (e.g. WAT UTC+1)
    const ds=`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,"0")}-${String(cur.getDate()).padStart(2,"0")}`;
    const ex=existing.find(e=>e.date===ds);
    days.push(ex||{date:ds,timeSlot:"",spots:0,rate:defaultRate});
    cur.setDate(cur.getDate()+1);
  }
  return days;
}

function getMonthBounds(monthKey){
  if(!monthKey) return {start:"",end:""};
  const [year,month]=monthKey.split("-").map(Number);
  if(!year||!month) return {start:"",end:""};
  const start=`${year}-${String(month).padStart(2,"0")}-01`;
  // Use getDate() instead of toISOString() to avoid UTC offset shifting
  const lastDay=new Date(year,month,0).getDate();
  const end=`${year}-${String(month).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;
  return {start,end};
}

function calcRoTotals(ro, whtRate=0){
  const gross=(ro.schedule||[]).reduce((a,s)=>a+(Number(s.spots)||0)*(Number(s.rate)||0),0);
  const volumeDiscountPct=Number(ro.volumeDiscount)||0;
  const agencyCommissionPct=Number(ro.agencyCommission)||0;
  const volumeDiscountAmount=gross*(volumeDiscountPct/100);
  const agencyCommissionAmount=gross*(agencyCommissionPct/100);
  const netTotal=gross-volumeDiscountAmount-agencyCommissionAmount;
  const whtPct=Number(whtRate)||0;
  const whtAmount=netTotal*(whtPct/100);
  const amountPayable=netTotal-whtAmount;
  return {gross,volumeDiscountPct,agencyCommissionPct,volumeDiscountAmount,agencyCommissionAmount,netTotal,whtPct,whtAmount,amountPayable};
}

function getRoCalendarCells(ro){
  const monthKey=ro.campaignMonth || ro.start?.slice(0,7) || "";
  if(!monthKey) return null;
  const [year,month]=monthKey.split("-").map(Number);
  if(!year||!month) return null;
  const firstDay=new Date(year,month-1,1).getDay();
  const daysInMonth=new Date(year,month,0).getDate();
  const scheduleByDate=new Map((ro.schedule||[]).map(s=>[s.date,s]));
  const leading=Array.from({length:firstDay},(_,i)=>({key:`blank-start-${i}`,empty:true}));
  const dates=Array.from({length:daysInMonth},(_,i)=>{
    const day=i+1;
    const date=`${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    return {key:date,date,day,entry:scheduleByDate.get(date)||null};
  });
  const trailingCount=(7-((leading.length+dates.length)%7))%7;
  const trailing=Array.from({length:trailingCount},(_,i)=>({key:`blank-end-${i}`,empty:true}));
  return {
    label:new Date(`${monthKey}-01T12:00:00`).toLocaleDateString("en-NG",{month:"long",year:"numeric"}),
    cells:[...leading,...dates,...trailing]
  };
}

// ── RO form (create / edit) ───────────────────────────────────────────────────
const EMPTY_RO={mpoId:"",client:"",vendor:"",campaign:"",programme:"",materialTitle:"",materialDuration:"",campaignMonth:"",channel:"TV",start:"",end:"",status:"draft",currency:"NGN",rate:0,timeSlot:"",volumeDiscount:0,agencyCommission:0,schedule:[],docs:[]};
function ROForm({initial,draftInitial,mpos,clients,user,settings,onSave,onClose}){
  const initialRate=initial?.rate ?? initial?.schedule?.find(s=>Number(s.rate)>0)?.rate ?? 0;
  const initialMonth=initial?.campaignMonth || initial?.start?.slice(0,7) || "";
  const initialTimeSlot=initial?.timeSlot ?? initial?.schedule?.find(s=>s.timeSlot)?.timeSlot ?? "";
  // Seed from: editing existing → initial, resuming draft chip → draftInitial, else blank
  const seed=initial?{...initial,campaignMonth:initialMonth,rate:initialRate,timeSlot:initialTimeSlot,volumeDiscount:initial.volumeDiscount||0,agencyCommission:initial.agencyCommission||0,programme:initial.programme||"",materialTitle:initial.materialTitle||"",materialDuration:initial.materialDuration||""}
    :draftInitial?.form?{...EMPTY_RO,...draftInitial.form}:{...EMPTY_RO};
  const [form,setForm]=useState(seed);
  const [errs,setErrs]=useState({});
  const [step,setStep]=useState(draftInitial?.step||1);
  // ── RO Draft persistence (queue) ─────────────────────────────────────────
  const roDraftIdRef=useRef<string|null>(draftInitial?.id||null);
  const [draftSavedAt,setDraftSavedAt]=useState<Date|null>(null);
  useEffect(()=>{
    if(initial)return; // don't draft-save edit mode
    if(!form.client&&!form.vendor&&!form.campaign&&step===1)return; // too empty
    if(!roDraftIdRef.current)roDraftIdRef.current=`rod_${Date.now()}`;
    upsertDraft(RO_DRAFTS_KEY,{id:roDraftIdRef.current,form,step,savedAt:new Date().toISOString(),label:draftLabel(form)});
    setDraftSavedAt(new Date());
  },[form,step]);
  const DNAMES=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const sym=CURRENCIES[form.currency||"NGN"]?.symbol||"₦";
  const fa=(n:number)=>sym+Number(n).toLocaleString("en",{maximumFractionDigits:2});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));

  const applyRateToSchedule=rate=>setForm(f=>({
    ...f,
    rate,
    schedule:f.schedule.map(s=>({...s,rate:Number(rate)||0}))
  }));

  const applyTimeSlotToSchedule=timeSlot=>setForm(f=>({
    ...f,
    timeSlot,
    schedule:f.schedule.map(s=>({...s,timeSlot}))
  }));

  const applyQuickScheduleAction=mode=>setForm(f=>({
    ...f,
    schedule:f.schedule.map(s=>({
      ...s,
      spots:mode==="clear"?0:1,
      timeSlot:f.timeSlot||s.timeSlot||""
    }))
  }));

  const toggleScheduleDay=(date)=>setForm(f=>({
    ...f,
    schedule:f.schedule.map(s=>s.date!==date?s:{...s,spots:Number(s.spots)>0?0:Math.max(1,Number(s.spots)||1),timeSlot:f.timeSlot||s.timeSlot||""})
  }));

  const onCampaignMonthChange=monthKey=>{
    const {start,end}=getMonthBounds(monthKey);
    setForm(f=>({
      ...f,
      campaignMonth:monthKey,
      start,
      end,
      schedule:buildScheduleDays(start,end,f.schedule,f.rate)
    }));
  };

  const setScheduleRow=(i,k,v)=>setForm(f=>{
    const s=[...f.schedule];s[i]={...s[i],[k]:k==="spots"?Number(v)||0:v};return{...f,schedule:s};
  });

  const totals=calcRoTotals(form,settings?.whtRate??5);
  const monthInfo=useMemo(()=>{
    if(!form.campaignMonth) return null;
    const [year,month]=form.campaignMonth.split("-").map(Number);
    if(!year||!month) return null;
    const firstDay=new Date(year,month-1,1).getDay();
    const daysInMonth=new Date(year,month,0).getDate();
    const leading=Array.from({length:firstDay},(_,i)=>({key:`blank-start-${i}`,empty:true}));
    const dates=Array.from({length:daysInMonth},(_,i)=>{
      const day=i+1;
      const date=`${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
      return {key:date,date,day,entry:form.schedule.find(s=>s.date===date)};
    });
    const trailingCount=(7-((leading.length+dates.length)%7))%7;
    const trailing=Array.from({length:trailingCount},(_,i)=>({key:`blank-end-${i}`,empty:true}));
    return {label:new Date(`${form.campaignMonth}-01T12:00:00`).toLocaleDateString("en-NG",{month:"long",year:"numeric"}),cells:[...leading,...dates,...trailing]};
  },[form.campaignMonth,form.schedule]);

  const validateStep=(s:number)=>{
    const e:Record<string,string>={};
    if(s===1){
      if(!form.client.trim())e.client="Required";
      if(!form.vendor.trim())e.vendor="Required";
      if(!form.campaign.trim())e.campaign="Required";
    }
    if(s===2){
      if(!form.campaignMonth)e.campaignMonth="Required";
    }
    if(s===3){
      if(!form.rate&&form.rate!==0)e.rate="Required";
      else if(Number(form.rate)<0)e.rate="Must be 0 or more";
      if(Number(form.volumeDiscount)<0)e.volumeDiscount="Must be 0 or more";
      if(Number(form.agencyCommission)<0)e.agencyCommission="Must be 0 or more";
    }
    setErrs(e);return Object.keys(e).length===0;
  };

  const handleNext=()=>{if(validateStep(step))setStep(s=>s+1);};

  const handleSave=()=>{
    if(!validateStep(3))return;
    if(roDraftIdRef.current)removeDraft(RO_DRAFTS_KEY,roDraftIdRef.current);
    onSave({...form,schedule:form.schedule.map(s=>({...s,rate:Number(form.rate)||0,timeSlot:form.timeSlot||""}))});
  };

  const vendorList=(clients||[]).filter(c=>c.type==="Vendor").map(c=>c.name).sort();
  const brandList=[...new Set((clients||[]).filter(c=>c.type==="Agency").flatMap(c=>(c.brands||[]).map((b:any)=>b.name)))].sort();

  const totalSpots=form.schedule.reduce((a,s)=>a+Number(s.spots||0),0);
  const activeDays=form.schedule.filter(s=>Number(s.spots)>0).length;

  const STEPS=[{n:1,label:"Order Details"},{n:2,label:"Schedule"},{n:3,label:"Rates & Review"}];

  return(
    <div style={{display:"flex",flexDirection:"column",gap:0}}>

      {/* ── Step indicator ── */}
      <div style={{display:"flex",alignItems:"flex-start",marginBottom:20}}>
        {STEPS.map((s,i)=>{
          const done=step>s.n;
          const active=step===s.n;
          return(
            <Fragment key={s.n}>
              {i>0&&<div style={{flex:1,height:2,marginTop:13,background:done?"var(--brand)":"var(--border-c)",transition:"background .3s"}}/>}
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,cursor:done?"pointer":"default",minWidth:0}}
                onClick={done?()=>{setErrs({});setStep(s.n);}:undefined}>
                <div style={{width:26,height:26,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:11,fontWeight:800,flexShrink:0,
                  background:done||active?"var(--brand)":"var(--bg3)",
                  color:done||active?"#fff":"var(--text3)",
                  boxShadow:active?"0 0 0 3px var(--brand)22":undefined,
                  transition:"all .2s"}}>
                  {done?"✓":s.n}
                </div>
                <span style={{fontSize:10,fontWeight:active?700:500,color:active?"var(--brand)":done?"var(--text2)":"var(--text3)",whiteSpace:"nowrap"}}>{s.label}</span>
              </div>
            </Fragment>
          );
        })}
      </div>

      {/* ── Step 1: Order Details ── */}
      {step===1&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px 16px",marginBottom:8}}>
          <FF id="ro-client" label="Brand" required err={errs.client}>
            <input id="ro-client" className={`form-input ${errs.client?"error":""}`} list="ro-client-list" value={form.client} onChange={e=>set("client",e.target.value)} placeholder="Select or type brand"/>
            <datalist id="ro-client-list">{brandList.map(c=><option key={c} value={c}/>)}</datalist>
          </FF>
          <FF id="ro-vendor" label="Vendor / Station" required err={errs.vendor}>
            <input id="ro-vendor" className={`form-input ${errs.vendor?"error":""}`} list="ro-vendor-list" value={form.vendor} onChange={e=>set("vendor",e.target.value)} placeholder="Select or type vendor"/>
            <datalist id="ro-vendor-list">{vendorList.map(v=><option key={v} value={v}/>)}</datalist>
          </FF>
          <FF id="ro-campaign" label="Campaign" required err={errs.campaign} style={{gridColumn:"1/-1"}}>
            <input id="ro-campaign" className={`form-input ${errs.campaign?"error":""}`} value={form.campaign} onChange={e=>set("campaign",e.target.value)} placeholder="Campaign name"/>
          </FF>
          <FF id="ro-mpo" label="MPO Ref (optional)">
            <select id="ro-mpo" className="form-input" value={form.mpoId} onChange={e=>set("mpoId",e.target.value)}>
              <option value="">None</option>
              {mpos.map(m=><option key={m.id} value={m.id}>{shortId(m.id)} — {m.campaign} — {campaignMonth(m.start)}</option>)}
            </select>
          </FF>
          <FF id="ro-channel" label="Channel">
            <select id="ro-channel" className="form-input" value={form.channel} onChange={e=>set("channel",e.target.value)}>
              {["TV","Radio","Print","Digital","OOH","Cinema"].map(c=><option key={c}>{c}</option>)}
            </select>
          </FF>
          <FF id="ro-status" label="Status">
            <select id="ro-status" className="form-input" value={form.status} onChange={e=>set("status",e.target.value)}>
              {["draft","sent","confirmed","executed"].map(s=><option key={s}>{s}</option>)}
            </select>
          </FF>
          <FF id="ro-currency" label="Currency">
            <select id="ro-currency" className="form-input" value={form.currency} onChange={e=>set("currency",e.target.value)}>
              {Object.keys(CURRENCIES).map(c=><option key={c}>{c}</option>)}
            </select>
          </FF>
        </div>
      )}

      {/* ── Step 2: Schedule ── */}
      {step===2&&(
        <div style={{marginBottom:8}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px 16px",marginBottom:12}}>
            <FF id="ro-month" label="Campaign Month" required err={errs.campaignMonth}>
              <input id="ro-month" className={`form-input ${errs.campaignMonth?"error":""}`} type="month" value={form.campaignMonth} onChange={e=>onCampaignMonthChange(e.target.value)}/>
            </FF>
            <FF id="ro-timeslot" label="Time Slot">
              <input id="ro-timeslot" className="form-input" placeholder="e.g. 07:00–08:00" value={form.timeSlot} onChange={e=>applyTimeSlotToSchedule(e.target.value)}/>
            </FF>
            <FF id="ro-programme" label="Programme">
              <input id="ro-programme" className="form-input" placeholder="e.g. Good Morning Nigeria" value={form.programme} onChange={e=>set("programme",e.target.value)}/>
            </FF>
            <FF id="ro-material" label="Material Title / Specification">
              <input id="ro-material" className="form-input" placeholder="e.g. Thematic, Product Launch" value={form.materialTitle} onChange={e=>set("materialTitle",e.target.value)}/>
            </FF>
            <FF id="ro-duration" label="Material Duration" style={{gridColumn:"1/-1"}}>
              <select id="ro-duration" className="form-input" value={form.materialDuration||""} onChange={e=>set("materialDuration",e.target.value)}>
                <option value="">Select duration…</option>
                {['5" Secs','10" Secs','15" Secs Prime Time','20" Secs','30" Secs Prime Time','30" Secs Off Peak','45" Secs','60" Secs Prime Time','60" Secs Off Peak','90" Secs','120" Secs / 2 Mins','Sponsored Mention','Live Mention','Product Placement','Other'].map(d=><option key={d}>{d}</option>)}
              </select>
            </FF>
          </div>

          {!form.campaignMonth&&(
            <div style={{padding:"20px 16px",background:"var(--bg3)",borderRadius:10,fontSize:12,color:"var(--text3)",textAlign:"center"}}>
              Select a campaign month above to load the scheduling calendar.
            </div>
          )}

          {monthInfo&&form.schedule.length>0&&(
            <div>
              {/* Calendar header */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text)"}}>{monthInfo.label}</div>
                  <div style={{fontSize:11,color:"var(--text3)",marginTop:1}}>
                    {activeDays} day{activeDays!==1?"s":""} selected · {totalSpots} total spot{totalSpots!==1?"s":""}
                  </div>
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button type="button" className="btn btn-sm" onClick={()=>applyQuickScheduleAction("all")}>Select All</button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={()=>applyQuickScheduleAction("clear")}>Clear</button>
                </div>
              </div>

              {/* Calendar grid — overflow:hidden keeps cells inside the container */}
              <div style={{background:"var(--bg2)",border:"1px solid var(--border-c)",borderRadius:12,padding:10,overflow:"hidden"}}>
                {/* DOW headers */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",marginBottom:4}}>
                  {["SUN","MON","TUE","WED","THU","FRI","SAT"].map(d=>(
                    <div key={d} style={{textAlign:"center",fontSize:8,fontWeight:700,letterSpacing:".05em",color:"var(--text3)",paddingBottom:5,textTransform:"uppercase"}}>{d}</div>
                  ))}
                </div>
                {/* Day cells */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",gap:3}}>
                  {monthInfo.cells.map((cell)=>{
                    if(cell.empty) return <div key={cell.key}/>;
                    const rowIndex=form.schedule.findIndex(s=>s.date===cell.date);
                    const spots=Number(cell.entry?.spots)||0;
                    const isActive=spots>0;
                    return(
                      <div key={cell.key}
                        onClick={()=>setScheduleRow(rowIndex,"spots",spots+1)}
                        style={{
                          display:"flex",flexDirection:"column",alignItems:"center",
                          padding:"5px 2px 4px",borderRadius:7,cursor:"pointer",
                          border:isActive?"2px solid var(--brand)":"1px solid var(--border-c)",
                          background:isActive?"#eef3ff":"var(--bg1)",
                          boxShadow:isActive?"0 2px 8px rgba(var(--brand-rgb,83,74,183),.18)":undefined,
                          gap:2,overflow:"hidden",minWidth:0,
                          transform:isActive?"scale(1.04)":"scale(1)",
                          transition:"border-color .15s,background .15s,box-shadow .15s,transform .15s",
                        }}>
                        <span style={{fontSize:13,fontWeight:800,lineHeight:1,color:isActive?"var(--brand)":"var(--text)"}}>{cell.day}</span>
                        <span style={{fontSize:7,fontWeight:600,letterSpacing:".03em",color:"var(--text3)",textTransform:"uppercase"}}>
                          {["SU","M","T","W","TH","FR","SA"][new Date(`${cell.date}T12:00:00`).getDay()]}
                        </span>
                        {/* Stepper */}
                        <div style={{display:"flex",alignItems:"center",gap:2,marginTop:2,width:"100%",justifyContent:"center"}}>
                          <button type="button" disabled={spots===0}
                            onClick={e=>{e.stopPropagation();setScheduleRow(rowIndex,"spots",Math.max(0,spots-1));}}
                            style={{width:16,height:16,borderRadius:4,border:"none",cursor:spots===0?"default":"pointer",
                              background:spots>0?"var(--brand)":"var(--border-c)",color:"#fff",
                              fontWeight:900,fontSize:12,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",
                              flexShrink:0,opacity:spots===0?.3:1,transition:"background .12s,opacity .12s",padding:0}}>−</button>
                          <span style={{fontSize:11,fontWeight:800,minWidth:12,textAlign:"center",color:isActive?"var(--brand)":"var(--text3)",lineHeight:1}}>{spots}</span>
                          <button type="button"
                            onClick={e=>{e.stopPropagation();setScheduleRow(rowIndex,"spots",spots+1);}}
                            style={{width:16,height:16,borderRadius:4,border:"none",cursor:"pointer",
                              background:"var(--brand)",color:"#fff",
                              fontWeight:900,fontSize:12,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",
                              flexShrink:0,transition:"background .12s",padding:0}}>+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{marginTop:7,fontSize:11,color:"var(--text3)"}}>Click a day to add a spot · use <b>+</b> / <b>−</b> for finer control · days at 0 are excluded from the RO.</div>
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: Rates & Review ── */}
      {step===3&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:8,alignItems:"start"}}>
          {/* Left: fields */}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <FF id="ro-rate" label={`Rate per Spot (${sym})`} required err={errs.rate}>
              <input id="ro-rate" className={`form-input ${errs.rate?"error":""}`} type="number" min="0" value={form.rate||""} onChange={e=>applyRateToSchedule(Number(e.target.value)||0)} placeholder="Enter rate"/>
            </FF>
            <FF id="ro-volume-discount" label="Volume Discount (%)" err={errs.volumeDiscount}>
              <input id="ro-volume-discount" className="form-input" type="number" min="0" value={form.volumeDiscount||""} onChange={e=>set("volumeDiscount",Number(e.target.value)||0)} placeholder="0"/>
            </FF>
            <FF id="ro-agency-commission" label="Agency Commission (%)" err={errs.agencyCommission}>
              <input id="ro-agency-commission" className="form-input" type="number" min="0" value={form.agencyCommission||""} onChange={e=>set("agencyCommission",Number(e.target.value)||0)} placeholder="0"/>
            </FF>
            <FF id="ro-programme" label="Programme">
              <input id="ro-programme" className="form-input" placeholder="e.g. Good Morning" value={form.programme} onChange={e=>set("programme",e.target.value)}/>
            </FF>
            <FF id="ro-material" label="Material Title / Specification">
              <input id="ro-material" className="form-input" placeholder="e.g. Thematic, Product Launch" value={form.materialTitle} onChange={e=>set("materialTitle",e.target.value)}/>
            </FF>
          </div>

          {/* Right: live costing summary */}
          <div style={{background:"var(--bg3)",borderRadius:12,padding:16,border:"1px solid var(--border-c)",position:"sticky",top:0}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:"var(--text3)",marginBottom:12}}>Costing Summary</div>
            {([
              {label:"Rate per Spot",val:fa(form.rate||0)},
              {label:`Gross Total (${totalSpots} spot${totalSpots!==1?"s":""})`,val:fa(totals.gross),sep:false},
              {label:`Volume Discount (${totals.volumeDiscountPct}%)`,val:`− ${fa(totals.volumeDiscountAmount)}`,red:true},
              {label:`Agency Commission (${totals.agencyCommissionPct}%)`,val:`− ${fa(totals.agencyCommissionAmount)}`,red:true},
              {label:"Net Total",val:fa(totals.netTotal),bold:true,sep:true},
              ...(totals.whtPct>0?[{label:`WHT (${totals.whtPct}%)`,val:`− ${fa(totals.whtAmount)}`,red:true}]:[]),
              {label:"Amount Payable",val:fa(totals.amountPayable),payable:true,sep:true},
            ] as any[]).map((row,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderTop:i>0?"1px solid var(--border-c)":undefined,marginTop:row.sep?4:0,paddingTop:row.sep?8:6}}>
                <span style={{fontSize:11,color:row.payable?"var(--text)":"var(--text2)",fontWeight:row.bold||row.payable?700:400}}>{row.label}</span>
                <span style={{fontSize:row.payable?14:11,fontWeight:row.bold||row.payable?800:600,color:row.red?"#A32D2D":row.payable?"var(--brand)":"var(--text)"}}>{row.val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Navigation ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:14,borderTop:"1px solid var(--border-c)",marginTop:8}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:2}}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          {!initial&&draftSavedAt&&<span style={{fontSize:10,color:"var(--text3)"}}>Draft saved {draftSavedAt.toLocaleTimeString("en-NG",{hour:"2-digit",minute:"2-digit"})}</span>}
        </div>
        <div style={{display:"flex",gap:8}}>
          {step>1&&<button className="btn btn-ghost" onClick={()=>{setErrs({});setStep(s=>s-1);}}>← Back</button>}
          {step<3&&<button className="btn btn-primary" onClick={handleNext}>Continue →</button>}
          {step===3&&<button className="btn btn-primary" onClick={handleSave}>Save RO</button>}
        </div>
      </div>
    </div>
  );
}

// ── RO status badge ───────────────────────────────────────────────────────────
const RO_STATUS_COLOR={draft:"#888",sent:"#854F0B",confirmed:"#3B6D11",executed:"#185FA5"};
const RO_STATUS_BG={draft:"#f0f0f0",sent:"#FAEEDA",confirmed:"#EAF3DE",executed:"#E6F1FB"};

function CalendarPage({mpos,ros,settings}){
  const now=new Date();
  const [vy,setVy]=useState(now.getFullYear());const [vm,setVm]=useState(now.getMonth());
  const [mode,setMode]=useState("month");
  const [sel,setSel]=useState(null);
  const [selRo,setSelRo]=useState(null);
  const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  const fd=new Date(vy,vm,1).getDay(),dim=new Date(vy,vm+1,0).getDate(),pmd=new Date(vy,vm,0).getDate();
  const cells=[];
  for(let i=fd-1;i>=0;i--) cells.push({day:pmd-i,other:true,date:null});
  for(let d=1;d<=dim;d++){const ds=`${vy}-${String(vm+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;cells.push({day:d,other:false,date:ds,isToday:ds===todayStr});}
  while(cells.length%7!==0) cells.push({day:cells.length-dim-fd+1,other:true,date:null});

  const evtsFor=date=>[
    ...((mpos||[]).filter(m=>m.start<=date&&m.end>=date).map(m=>({...m,_type:"mpo"}))),
    ...((ros||[]).filter(r=>r.start&&r.end&&r.start<=date&&r.end>=date).map(r=>({...r,_type:"ro"}))),
  ];

  const ts2=`${vy}-${String(vm+1).padStart(2,"0")}-01`,te2=new Date(vy,vm+1,0).toISOString().slice(0,10);
  const tmItems=[
    ...(mpos||[]).filter(m=>m.end>=ts2&&m.start<=te2).map(m=>({...m,_type:"mpo"})),
    ...(ros||[]).filter(r=>r.start&&r.end&&r.end>=ts2&&r.start<=te2).map(r=>({...r,_type:"ro"})),
  ];
  const dayPct=d=>Math.max(0,Math.min(100,(new Date(d)-new Date(ts2))/864e5/dim*100));
  const bLeft=m=>dayPct(m.start>ts2?m.start:ts2)+"%";
  const bWidth=m=>{const s=m.start<ts2?ts2:m.start,e=m.end>te2?te2:m.end,days=(new Date(e)-new Date(s))/864e5+1;return Math.max(1,days/dim*100)+"%";};
  const prev=()=>{if(vm===0){setVm(11);setVy(y=>y-1);}else setVm(m=>m-1);};
  const next=()=>{if(vm===11){setVm(0);setVy(y=>y+1);}else setVm(m=>m+1);};

  return(
    <div>
      {sel&&(
        <Modal title="Details" onClose={()=>setSel(null)}>
          {[["ID",sel.id],["Client",sel.client],["Campaign",sel.campaign],["Vendor",sel.vendor],["Amount",sel._type==="mpo"?fmt(sel.amount)+" "+(sel.currency||"NGN"):"—"],["Period",`${sel.start} → ${sel.end}`],["Status",sel.status],["Channel",sel.channel||"—"]].map(([k,v])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--border-c)",fontSize:13}}><span style={{color:"var(--text2)"}}>{k}</span><span style={{fontWeight:500}}>{v}</span></div>
          ))}
          {sel._type==="ro"&&(
            <div style={{display:"flex",gap:8,marginTop:14}}>
              <button className="btn btn-primary btn-sm" onClick={()=>printROCalendarLegacy(sel,settings||{})}>↓ PDF</button>
              <button className="btn btn-sm btn-ghost" onClick={()=>exportROExcel(sel,settings||{})}>↓ Excel</button>
            </div>
          )}
        </Modal>
      )}

      {/* ── Main Calendar Card ── */}
      <div className="card">
        <div className="card-header">
          <div style={{display:"flex",alignItems:"center",gap:12,flex:1}}>
            <button className="btn btn-sm" onClick={prev}>‹</button>
            <span style={{fontWeight:600,fontSize:15,flex:1,textAlign:"center"}}>{MONTHS[vm]} {vy}</span>
            <button className="btn btn-sm" onClick={next}>›</button>
            <button className="btn btn-sm btn-ghost" onClick={()=>{setVy(now.getFullYear());setVm(now.getMonth());}}>Today</button>
          </div>
          <div className="tabs" style={{marginBottom:0}}>
            <button className={`tab ${mode==="month"?"active":""}`} onClick={()=>setMode("month")}>Month</button>
            <button className={`tab ${mode==="timeline"?"active":""}`} onClick={()=>setMode("timeline")}>Timeline</button>
          </div>
        </div>

        {/* ── Month view ── */}
        {mode==="month"&&(
          <>
            <div className="cal-grid">{DAYS.map(d=><div key={d} className="cal-header-cell">{d}</div>)}</div>
            <div className="cal-grid" style={{marginTop:4}}>
              {cells.map((c,i)=>{
                const evts=c.date?evtsFor(c.date):[];
                return(
                  <div key={i} className={`cal-cell ${c.other?"other-month":""} ${c.isToday?"today":""}`}>
                    <div className="cal-day-num"><span className={c.isToday?"today-num":""}>{c.day}</span></div>
                    {evts.slice(0,2).map(ev=>{
                      const bg=ev._type==="ro"?(RO_STATUS_COLOR[ev.status]||"#3B6D11"):(CH_COLORS[ev.channel]||"#534AB7");
                      const label=ev._type==="ro"?`[RO] ${ev.campaign.substring(0,10)}`:ev.campaign.substring(0,12);
                      return(
                        <div key={ev.id} className="cal-event" style={{background:bg,color:"#fff",opacity:ev._type==="ro"?0.92:1}}
                          onClick={()=>setSel(ev)}>{label}</div>
                      );
                    })}
                    {evts.length>2&&<div style={{fontSize:9,color:"var(--text3)"}}>+{evts.length-2}</div>}
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div style={{display:"flex",gap:12,marginTop:10,padding:"0 4px",flexWrap:"wrap"}}>
              {Object.entries(CH_COLORS).map(([ch,c])=><div key={ch} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"var(--text2)"}}><div style={{width:8,height:8,borderRadius:2,background:c}}/>{ch}</div>)}
              <div style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"var(--text2)"}}><div style={{width:8,height:8,borderRadius:2,background:"#3B6D11"}}/>[RO]</div>
            </div>
          </>
        )}

        {/* ── Timeline view ── */}
        {mode==="timeline"&&(
          <div>
            <div style={{display:"flex",marginBottom:8,paddingLeft:132}}>{[1,8,15,22,29].filter(d=>d<=dim).map(d=><div key={d} style={{flex:1,fontSize:9,color:"var(--text3)",borderLeft:"0.5px solid var(--border-c)",paddingLeft:3}}>{d}</div>)}</div>
            {tmItems.length===0
              ?<div style={{textAlign:"center",padding:32,color:"var(--text3)"}}>No campaigns or ROs this month</div>
              :tmItems.map(m=>{
                const bg=m._type==="ro"?(RO_STATUS_COLOR[m.status]||"#3B6D11"):(CH_COLORS[m.channel]||"#534AB7");
                const label=m._type==="ro"?`[RO] ${m.campaign.substring(0,16)}`:m.campaign.substring(0,18);
                return(
                  <div key={m.id} style={{display:"flex",alignItems:"center",marginBottom:6}}>
                    <div className="timeline-label" title={m.client}>{m.client}</div>
                    <div className="timeline-track">
                      <div className="timeline-bar" style={{left:bLeft(m),width:bWidth(m),background:bg}}
                        onClick={()=>setSel(m)}>{label}</div>
                    </div>
                  </div>
                );
              })
            }
            <div style={{display:"flex",gap:12,marginTop:12,flexWrap:"wrap"}}>
              {Object.entries(CH_COLORS).map(([ch,c])=><div key={ch} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"var(--text2)"}}><div style={{width:10,height:10,borderRadius:2,background:c}}/>{ch}</div>)}
              <div style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"var(--text2)"}}><div style={{width:10,height:10,borderRadius:2,background:"#3B6D11"}}/>[RO]</div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

/* ═══ FINANCE ═══ */
function printInvoice(inv,settings={}){
  const bal=inv.amount-inv.paid;const sl=bal<=0?"PAID":bal<inv.amount?"PARTIAL":"UNPAID";
  const sc=bal<=0?"#3B6D11":bal<inv.amount?"#854F0B":"#A32D2D";const sb=bal<=0?"#EAF3DE":bal<inv.amount?"#FAEEDA":"#FCEBEB";
  const sym=CURRENCIES[inv.currency||"NGN"]?.symbol||"₦";
  const fmtAmt=n=>sym+Number(n).toLocaleString("en",{maximumFractionDigits:2});
  const taxAmt=bal*(settings.taxRate||7.5)/100;
  const html=`<!DOCTYPE html><html><head><title>Invoice ${inv.id}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui;color:#1a1a1a;padding:48px;max-width:700px;margin:auto;font-size:13px}.hdr{display:flex;justify-content:space-between;margin-bottom:40px}.brand{font-size:22px;font-weight:800;color:#534AB7}.badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${sb};color:${sc};margin-top:6px}hr{border:none;border-top:1px solid #eee;margin:24px 0}.parties{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:32px}table{width:100%;border-collapse:collapse;margin-bottom:28px}th{text-align:left;font-size:11px;color:#999;padding:8px 12px;background:#f8f8f6;border-bottom:1px solid #eee}td{padding:11px 12px;border-bottom:1px solid #f4f4f4}.totals{margin-left:auto;width:280px;border:1px solid #eee;border-radius:8px;overflow:hidden}.trow{display:flex;justify-content:space-between;padding:9px 16px;border-bottom:1px solid #f4f4f4}.trow:last-child{background:#f8f8f6;font-weight:700;font-size:14px;color:${sc}}.footer{margin-top:48px;font-size:11px;color:#bbb;text-align:center;border-top:1px solid #f0f0f0;padding-top:16px}</style></head><body><div class="hdr"><div><div class="brand">${settings.companyName||"MediaHub"}</div><div style="font-size:11px;color:#aaa;margin-top:3px">${settings.tagline||"Media Agency Platform · Lagos, Nigeria"}</div></div><div style="text-align:right"><h1 style="font-size:26px;color:#534AB7;font-weight:800">INVOICE</h1><p style="font-size:12px;color:#666;margin-top:3px"><b>${inv.id}</b></p><p style="font-size:12px;color:#666;margin-top:3px">Due: ${inv.due}</p><div class="badge">${sl}</div></div></div><hr/><div class="parties"><div><div style="font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">Bill To</div><div style="font-size:15px;font-weight:700">${inv.client}</div></div><div><div style="font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">Issued By</div><div style="font-size:15px;font-weight:700">${settings.companyName||"MediaHub"}</div><div style="font-size:12px;color:#777">${settings.address||"Lagos, Nigeria"}</div></div></div><table><thead><tr><th>Description</th><th>MPO Ref</th><th style="text-align:right">Amount</th></tr></thead><tbody><tr><td>Media placement services</td><td style="font-family:monospace">${inv.mpo}</td><td style="text-align:right;font-weight:600">${fmtAmt(inv.amount)}</td></tr></tbody></table><div class="totals"><div class="trow"><span>Subtotal</span><span>${fmtAmt(inv.amount)}</span></div><div class="trow"><span>VAT (${settings.taxRate||7.5}%)</span><span>${fmtAmt(taxAmt)}</span></div><div class="trow"><span>Received</span><span style="color:#3B6D11">${fmtAmt(inv.paid)}</span></div><div class="trow"><span>${bal>0?"Balance Due":"Fully Paid"}</span><span>${fmtAmt(Math.abs(bal)+taxAmt)}</span></div></div><div class="footer">Payment Terms: Net ${settings.paymentTerms||30} · ${settings.companyEmail||""} · Generated by ${settings.companyName||"MediaHub"}</div></body></html>`;
  const w=window.open("","_blank","width=780,height=920");w.document.write(html);w.document.close();w.onload=()=>w.print();
}

const EINV={client:"",mpo:"",amount:"",due:"",currency:"NGN",docs:[]};
const EPAY={vendor:"",mpo:"",amount:"",due:"",description:"",currency:"NGN"};
function FinancePage({receivables,setReceivables,payables,setPayables,mpos,clients,toast,user,addAudit,settings,comments,onAddComment}){
  const [mainTab,setMainTab]=useState("receivables");
  const [recTab,setRecTab]=useState("all");const [payTab,setPayTab]=useState("all");
  const [logId,setLogId]=useState(null);const [logMode,setLogMode]=useState("rec");const [logAmt,setLogAmt]=useState("");
  const [showInv,setShowInv]=useState(false);const [invF,setInvF]=useState({...EINV,currency:settings.defaultCurrency||"NGN"});const [invE,setInvE]=useState({});
  const [showPay,setShowPay]=useState(false);const [payF,setPayF]=useState({...EPAY,currency:settings.defaultCurrency||"NGN"});const [payE,setPayE]=useState({});
  const [selected,setSelected]=useState(new Set());
  const [docsFor,setDocsFor]=useState(null);
  const [commentsFor,setCommentsFor]=useState(null);
  const canEdit=user.permissions.includes("finance");
  const dCcy=settings.defaultCurrency||"NGN";
  const lR=receivables.map(r=>({...r,status:computeStatus(r)}));
  const lP=payables.map(p=>({...p,status:computeStatus(p)}));
  const fR=recTab==="all"?lR:lR.filter(r=>r.status===recTab);
  const fP=payTab==="all"?lP:lP.filter(p=>p.status===payTab);
  const rOut=lR.reduce((a,r)=>a+convertAmt(r.amount-r.paid,r.currency||"NGN",dCcy),0);
  const rCol=lR.reduce((a,r)=>a+convertAmt(r.paid,r.currency||"NGN",dCcy),0);
  const rRate=rCol+rOut>0?Math.round(rCol/(rCol+rOut)*100):0;
  const pOwed=lP.reduce((a,p)=>a+convertAmt(p.amount-p.paid,p.currency||"NGN",dCcy),0);
  const pSet=lP.reduce((a,p)=>a+convertAmt(p.paid,p.currency||"NGN",dCcy),0);
  const sym=CURRENCIES[dCcy]?.symbol||"₦";
  const openLog=(id,mode)=>{setLogId(id);setLogMode(mode);setLogAmt("");};
  const doLog=()=>{const amt=Number(logAmt);if(!amt||amt<=0)return;if(logMode==="rec"){setReceivables(p=>p.map(r=>r.id===logId?{...r,paid:Math.min(r.paid+amt,r.amount)}:r));addAudit("logged payment","Invoice",logId,`Logged ${fmt(amt)} on ${logId}`,"payment");toast("Payment logged");}else{setPayables(p=>p.map(r=>r.id===logId?{...r,paid:Math.min(r.paid+amt,r.amount)}:r));toast("Vendor payment logged");}setLogId(null);};
  const advanceWf=inv=>{const next=WF_NEXT[inv.wfStatus];if(!next)return;setReceivables(p=>p.map(r=>r.id===inv.id?{...r,wfStatus:next}:r));addAudit("advanced workflow","Invoice",inv.id,`${inv.id}: ${WF_LABELS[inv.wfStatus]} → ${WF_LABELS[next]}`,"workflow");toast(`${inv.id} → ${WF_LABELS[next]}`);};
  const valInv=()=>{const e={};if(!invF.client.trim())e.client="Required";if(!invF.mpo.trim())e.mpo="Required";if(!invF.amount||isNaN(invF.amount)||Number(invF.amount)<=0)e.amount="Required";if(!invF.due)e.due="Required";setInvE(e);return!Object.keys(e).length;};
  const createInv=()=>{if(!valInv())return;const newId=nextId(receivables,"INV");setReceivables(p=>[...p,{id:newId,...invF,amount:Number(invF.amount),paid:0,wfStatus:"draft",docs:[]}]);addAudit("created","Invoice",newId,`Created ${newId} for ${invF.client}`,"create");toast("Invoice created");setInvF({...EINV,currency:dCcy});setShowInv(false);};
  const valPay=()=>{const e={};if(!payF.vendor.trim())e.vendor="Required";if(!payF.mpo.trim())e.mpo="Required";if(!payF.amount||isNaN(payF.amount)||Number(payF.amount)<=0)e.amount="Required";if(!payF.due)e.due="Required";setPayE(e);return!Object.keys(e).length;};
  const createPay=()=>{if(!valPay())return;setPayables(p=>[...p,{id:nextId(payables,"PAY"),...payF,amount:Number(payF.amount),paid:0,docs:[]}]);toast("Payable recorded");setPayF({...EPAY,currency:dCcy});setShowPay(false);};
  const updateRecDocs=(id,docs)=>setReceivables(p=>p.map(r=>r.id===id?{...r,docs}:r));
  const logItem=logId?(logMode==="rec"?lR.find(r=>r.id===logId):lP.find(r=>r.id===logId)):null;
  const cur=mainTab==="receivables"?fR:fP;
  const toggleSel=id=>setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleAll=()=>setSelected(s=>s.size===cur.length?new Set():new Set(cur.map(r=>r.id)));
  const docInv=docsFor?lR.find(r=>r.id===docsFor):null;
  return(
    <div>
      {logId&&(<Modal title="Log Payment" onClose={()=>setLogId(null)}>
        {logItem&&<div style={{marginBottom:14,padding:"10px 12px",background:"var(--bg3)",borderRadius:8,fontSize:12}}><strong>{logItem.client||logItem.vendor}</strong> · {logItem.id} · Balance: <strong style={{color:"#A32D2D"}}>{fmtCcy(logItem.amount-logItem.paid,logItem.currency||"NGN",dCcy)}</strong></div>}
        <FF id="la" label="Amount"><input id="la" className="form-input" type="number" min="0" value={logAmt} onChange={e=>setLogAmt(e.target.value)}/></FF>
        <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:12}}><button className="btn" onClick={()=>setLogId(null)}>Cancel</button><button className="btn btn-primary" onClick={doLog}>Confirm</button></div>
      </Modal>)}
      {showInv&&(<Modal title="Create Invoice" onClose={()=>setShowInv(false)}>
        <FF id="ic" label="Client" error={invE.client}><select id="ic" className={`form-input ${invE.client?"error":""}`} value={invF.client} onChange={e=>setInvF(f=>({...f,client:e.target.value}))}><option value="">— Select —</option>{clients.filter(c=>c.type==="Client").map(c=><option key={c.id} value={c.name}>{c.name}</option>)}</select></FF>
        <FF id="im" label="MPO" error={invE.mpo}><select id="im" className={`form-input ${invE.mpo?"error":""}`} value={invF.mpo} onChange={e=>setInvF(f=>({...f,mpo:e.target.value}))}><option value="">— Select —</option>{mpos.map(m=><option key={m.id} value={m.id}>{m.id} · {m.client}</option>)}</select></FF>
        <div className="form-grid">
          <FF id="ia" label="Amount" error={invE.amount}><input id="ia" className={`form-input ${invE.amount?"error":""}`} type="number" min="0" value={invF.amount} onChange={e=>setInvF(f=>({...f,amount:e.target.value}))}/></FF>
          <FF id="iccy" label="Currency"><select id="iccy" className="form-input" value={invF.currency} onChange={e=>setInvF(f=>({...f,currency:e.target.value}))}>{Object.entries(CURRENCIES).map(([k,v])=><option key={k} value={k}>{v.flag} {k}</option>)}</select></FF>
        </div>
        <FF id="id2" label="Due Date" error={invE.due}><input id="id2" className={`form-input ${invE.due?"error":""}`} type="date" value={invF.due} onChange={e=>setInvF(f=>({...f,due:e.target.value}))}/></FF>
        {invF.amount&&!isNaN(invF.amount)&&<p style={{fontSize:12,color:"var(--text3)",marginBottom:12}}>Preview: {fmtCcy(Number(invF.amount),invF.currency,dCcy)}</p>}
        <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:8}}><button className="btn" onClick={()=>setShowInv(false)}>Cancel</button><button className="btn btn-primary" onClick={createInv}>Create</button></div>
      </Modal>)}
      {showPay&&(<Modal title="Record Payable" onClose={()=>setShowPay(false)}>
        <FF id="pv" label="Vendor" error={payE.vendor}><select id="pv" className={`form-input ${payE.vendor?"error":""}`} value={payF.vendor} onChange={e=>setPayF(f=>({...f,vendor:e.target.value}))}><option value="">— Select —</option>{clients.filter(c=>c.type==="Vendor").map(c=><option key={c.id} value={c.name}>{c.name}</option>)}</select></FF>
        <FF id="pm" label="MPO" error={payE.mpo}><select id="pm" className={`form-input ${payE.mpo?"error":""}`} value={payF.mpo} onChange={e=>setPayF(f=>({...f,mpo:e.target.value}))}><option value="">— Select —</option>{mpos.map(m=><option key={m.id} value={m.id}>{m.id} · {m.vendor}</option>)}</select></FF>
        <FF id="pd" label="Description"><input id="pd" className="form-input" value={payF.description} onChange={e=>setPayF(f=>({...f,description:e.target.value}))}/></FF>
        <div className="form-grid">
          <FF id="pa" label="Amount" error={payE.amount}><input id="pa" className={`form-input ${payE.amount?"error":""}`} type="number" min="0" value={payF.amount} onChange={e=>setPayF(f=>({...f,amount:e.target.value}))}/></FF>
          <FF id="pccy" label="Currency"><select id="pccy" className="form-input" value={payF.currency} onChange={e=>setPayF(f=>({...f,currency:e.target.value}))}>{Object.entries(CURRENCIES).map(([k,v])=><option key={k} value={k}>{v.flag} {k}</option>)}</select></FF>
        </div>
        <FF id="pdd" label="Due Date" error={payE.due}><input id="pdd" className={`form-input ${payE.due?"error":""}`} type="date" value={payF.due} onChange={e=>setPayF(f=>({...f,due:e.target.value}))}/></FF>
        <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:8}}><button className="btn" onClick={()=>setShowPay(false)}>Cancel</button><button className="btn btn-primary" onClick={createPay}>Record</button></div>
      </Modal>)}
      {commentsFor&&(<Modal title="Discussion" onClose={()=>setCommentsFor(null)} wide>
        <CommentsPanel entityId={commentsFor} entityLabel={`Invoice ${commentsFor} — ${lR.find(r=>r.id===commentsFor)?.client||""}`} comments={comments} currentUser={user} onAddComment={onAddComment}/>
      </Modal>)}
      {docsFor&&docInv&&(<Modal title={`Documents — ${docInv.id}`} onClose={()=>setDocsFor(null)}>
        <DocPanel entityId={docsFor} entityDocs={docInv.docs||[]} onSave={docs=>updateRecDocs(docsFor,docs)} canEdit={canEdit} workspaceId={user?.workspace_id} currentUser={user}/>
      </Modal>)}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:8}}>
        <div className="tabs" style={{marginBottom:0}}>
          <button className={`tab ${mainTab==="receivables"?"active":""}`} onClick={()=>{setMainTab("receivables");setSelected(new Set());}}>💰 Receivables</button>
          <button className={`tab ${mainTab==="payables"?"active":""}`} onClick={()=>{setMainTab("payables");setSelected(new Set());}}>🧾 Payables</button>
        </div>
        {canEdit&&(mainTab==="receivables"?<button className="btn btn-primary btn-sm" onClick={()=>setShowInv(true)}>+ New Invoice</button>:<button className="btn btn-sm" style={{background:"#FFF4E5",color:"#8B4500",borderColor:"#F5C97A"}} onClick={()=>setShowPay(true)}>+ Record Payable</button>)}
      </div>
      {dCcy!=="NGN"&&<div style={{fontSize:11,color:"var(--text3)",marginBottom:12}}>Values shown in {CURRENCIES[dCcy]?.flag} {dCcy} · Converted at indicative rates</div>}

      {mainTab==="receivables"&&(<div>
        {/* WF pipeline */}
        {user.permissions.includes("invoice-wf")&&(
          <div className="card" style={{marginBottom:16}}>
            <div className="card-header"><span className="card-title">Invoice Pipeline</span></div>
            <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
              {WF_STEPS.map(s=>{const count=lR.filter(r=>r.wfStatus===s).length;return(
                <div key={s} style={{flex:1,minWidth:80,background:"var(--bg3)",borderRadius:8,padding:"10px 14px",textAlign:"center"}}>
                  <div style={{fontSize:20,fontWeight:700}}>{count}</div><WFBadge s={s}/>
                </div>
              );})}
            </div>
          </div>
        )}
        <div className="stat-grid" style={{gridTemplateColumns:"repeat(4,1fr)"}}>
          {[{l:"Outstanding",v:fmtK(rOut,sym)},{l:"Collected",v:fmtK(rCol,sym)},{l:"Overdue",v:lR.filter(r=>r.status==="overdue").length},{l:"Rate",v:`${rRate}%`}].map(s=><div key={s.l} className="stat-card"><div className="stat-label">{s.l}</div><div className="stat-value">{s.v}</div></div>)}
        </div>
        <div className="card">
          <div className="card-header"><div className="tabs" style={{marginBottom:0}}>{["all","paid","partial","overdue","pending"].map(t=><button key={t} className={`tab ${recTab===t?"active":""}`} onClick={()=>setRecTab(t)}>{t}</button>)}</div></div>
          <div className="table-wrap"><table>
            <thead><tr><th><input type="checkbox" checked={selected.size===fR.length&&fR.length>0} onChange={toggleAll}/></th><th>Invoice</th><th>Client</th><th>Amount</th><th>CCY</th><th>Paid</th><th>Balance</th><th>Due</th><th>Status</th><th>Workflow</th><th></th></tr></thead>
            <tbody>{fR.length===0?<tr className="empty-row"><td colSpan={11}>No invoices</td></tr>
            :fR.map(r=>(
              <tr key={r.id} style={{background:selected.has(r.id)?"var(--brand-light)":""}}>
                <td><input type="checkbox" checked={selected.has(r.id)} onChange={()=>toggleSel(r.id)}/></td>
                <td style={{fontFamily:"monospace",fontSize:12,fontWeight:500}}>{r.id}</td>
                <td>{r.client}</td>
                <td style={{fontWeight:500}}>{fmtCcy(r.amount,r.currency||"NGN",dCcy)}</td>
                <td><span className="rate-tag">{r.currency||"NGN"}</span></td>
                <td style={{color:"var(--text2)"}}>{fmtCcy(r.paid,r.currency||"NGN",dCcy)}</td>
                <td style={{fontWeight:500,color:r.amount-r.paid>0?"#A32D2D":"#3B6D11"}}>{fmtCcy(r.amount-r.paid,r.currency||"NGN",dCcy)}</td>
                <td style={{fontSize:12,color:r.status==="overdue"?"#A32D2D":"var(--text2)"}}>{r.due}</td>
                <td><SBadge s={r.status}/></td>
                <td><WFBadge s={r.wfStatus||"draft"}/></td>
                <td><div className="action-row">
                  {r.status!=="paid"&&canEdit&&<button className="btn btn-sm" onClick={()=>openLog(r.id,"rec")}>Pay</button>}
                  {canEdit&&WF_NEXT[r.wfStatus]&&<button className="btn btn-sm btn-ghost" onClick={()=>advanceWf(r)}>→{WF_LABELS[WF_NEXT[r.wfStatus]]}</button>}
                  <button className="btn btn-sm btn-ghost" title={`Comments (${(comments[r.id]||[]).length})`} onClick={()=>setCommentsFor(r.id)}>💬{(comments[r.id]||[]).length>0&&<span className="collab-badge">{(comments[r.id]||[]).length}</span>}</button>
                  <button className="btn btn-sm btn-ghost" title={`Docs (${(r.docs||[]).length})`} onClick={()=>setDocsFor(r.id)}>📎{(r.docs||[]).length>0&&<span style={{fontSize:9}}>{(r.docs||[]).length}</span>}</button>
                  <button className="btn btn-sm btn-ghost" onClick={()=>printInvoice(r,settings)}>🖨</button>
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      </div>)}
      {mainTab==="payables"&&(<div>
        <div className="stat-grid" style={{gridTemplateColumns:"repeat(4,1fr)"}}>
          {[{l:"Owed",v:fmtK(pOwed,sym)},{l:"Settled",v:fmtK(pSet,sym)},{l:"Overdue",v:lP.filter(p=>p.status==="overdue").length},{l:"Rate",v:`${pOwed+pSet>0?Math.round(pSet/(pOwed+pSet)*100):0}%`}].map(s=><div key={s.l} className="stat-card" style={{borderLeft:"3px solid #F5C97A"}}><div className="stat-label">{s.l}</div><div className="stat-value" style={{color:"#8B4500"}}>{s.v}</div></div>)}
        </div>
        <div className="card">
          <div className="card-header"><div className="tabs" style={{marginBottom:0}}>{["all","paid","partial","overdue","pending"].map(t=><button key={t} className={`tab ${payTab===t?"active":""}`} onClick={()=>setPayTab(t)}>{t}</button>)}</div></div>
          <div className="table-wrap"><table>
            <thead><tr><th><input type="checkbox" checked={selected.size===fP.length&&fP.length>0} onChange={toggleAll}/></th><th>ID</th><th>Vendor</th><th>Desc</th><th>Amount</th><th>CCY</th><th>Paid</th><th>Balance</th><th>Due</th><th>Status</th><th></th></tr></thead>
            <tbody>{fP.length===0?<tr className="empty-row"><td colSpan={11}>No payables</td></tr>
            :fP.map(p=>(
              <tr key={p.id} style={{background:selected.has(p.id)?"#fff8ec":""}}>
                <td><input type="checkbox" checked={selected.has(p.id)} onChange={()=>toggleSel(p.id)}/></td>
                <td style={{fontFamily:"monospace",fontSize:12,fontWeight:500}}>{p.id}</td>
                <td>{p.vendor}</td><td style={{fontSize:12,color:"var(--text2)"}}>{p.description}</td>
                <td style={{fontWeight:500}}>{fmtCcy(p.amount,p.currency||"NGN",dCcy)}</td>
                <td><span className="rate-tag">{p.currency||"NGN"}</span></td>
                <td style={{color:"var(--text2)"}}>{fmtCcy(p.paid,p.currency||"NGN",dCcy)}</td>
                <td style={{fontWeight:500,color:p.amount-p.paid>0?"#8B4500":"#3B6D11"}}>{fmtCcy(p.amount-p.paid,p.currency||"NGN",dCcy)}</td>
                <td style={{fontSize:12,color:p.status==="overdue"?"#A32D2D":"var(--text2)"}}>{p.due}</td>
                <td><SBadge s={p.status}/></td>
                <td>{p.status!=="paid"&&canEdit&&<button className="btn btn-sm" style={{background:"#FFF4E5",color:"#8B4500",borderColor:"#F5C97A"}} onClick={()=>openLog(p.id,"pay")}>Mark paid</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      </div>)}
      {selected.size>0&&(<div className="bulk-bar"><span className="bulk-count">{selected.size}</span><span>selected</span><button className="btn btn-sm" style={{background:"#333",color:"#aaa",border:"0.5px solid #555"}} onClick={()=>{const src=mainTab==="receivables"?lR:lP;const rows=[["ID","Party","Amount","Currency","Due","Status"],...src.filter(r=>selected.has(r.id)).map(r=>[r.id,r.client||r.vendor,r.amount,r.currency||"NGN",r.due,r.status])];const csv=rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");const a=document.createElement("a");a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);a.download="finance.csv";a.click();toast("Exported","info");setSelected(new Set());}}>Export CSV</button><button className="btn btn-sm btn-ghost" style={{color:"#aaa",marginLeft:"auto"}} onClick={()=>setSelected(new Set())}>✕</button></div>)}
    </div>
  );
}

/* ═══ REPORTS ═══ */
function ReportsPage({mpos,receivables,payables,ros,settings}){
  const [tab,setTab]=useState("media-buy");const [from,setFrom]=useState("");const [to,setTo]=useState("");
  const [mbClient,setMbClient]=useState("");const [mbMpo,setMbMpo]=useState("");
  const [mbMonth,setMbMonth]=useState("");const [mbAgency,setMbAgency]=useState("");
  const dCcy=settings.defaultCurrency||"NGN";const sym=CURRENCIES[dCcy]?.symbol||"₦";
  const taxRate=Number(settings.taxRate)||7.5;
  const whtRate=Number(settings.whtRate)||5;
  const agencyName=settings.companyName||"MediaHub";
  const fM=mpos.filter(m=>(!from||m.start>=from)&&(!to||m.end<=to));
  const lR=receivables.map(r=>({...r,status:computeStatus(r)})).filter(r=>(!from||r.due>=from)&&(!to||r.due<=to));
  const lP=payables.map(p=>({...p,status:computeStatus(p)})).filter(p=>(!from||p.due>=from)&&(!to||p.due<=to));
  const tB=lR.reduce((a,r)=>a+convertAmt(r.amount,r.currency||"NGN",dCcy),0);
  const tPd=lR.reduce((a,r)=>a+convertAmt(r.paid,r.currency||"NGN",dCcy),0);
  const cPct=tB>0?Math.round(tPd/tB*100):0;
  const cSpend=Object.values(fM.reduce((acc,m)=>{acc[m.client]=acc[m.client]||{name:m.client,amount:0};acc[m.client].amount+=convertAmt(m.amount,m.currency||"NGN",dCcy);return acc;},{})).sort((a,b)=>b.amount-a.amount);
  const sDist=[{label:"Active",value:fM.filter(m=>m.status==="active").length,color:"#3B6D11"},{label:"Pending",value:fM.filter(m=>m.status==="pending").length,color:"#854F0B"},{label:"Completed",value:fM.filter(m=>m.status==="completed").length,color:"#185FA5"}].filter(d=>d.value>0);
  const rDonut=[{label:"Collected",value:tPd,color:"#3B6D11"},{label:"Outstanding",value:Math.max(0,tB-tPd),color:"#A32D2D"}].filter(d=>d.value>0);

  // ── Media Buy rows (one row per RO) ──────────────────────────────────────────
  const mbRows=useMemo(()=>{
    return (ros||[]).filter(ro=>{
      if(mbClient&&ro.client!==mbClient) return false;
      if(mbMpo&&ro.mpoId!==mbMpo) return false;
      if(mbMonth&&(ro.campaignMonth||ro.start?.slice(0,7))!==mbMonth) return false;
      if(from&&ro.start<from) return false;
      if(to&&ro.end>to) return false;
      return true;
    }).map(ro=>{
      const mpo=mpos.find(m=>m.id===ro.mpoId)||null;
      if(mbAgency&&(mpo?.agency||"")!==mbAgency) return null;
      const totalSpots=(ro.schedule||[]).reduce((a,s)=>a+Number(s.spots||0),0);
      // Use calcRoTotals for all amounts — consistent with the RO detail view and PDF
      const rTotals=calcRoTotals(ro,whtRate);
      const {gross,netTotal,amountPayable}=rTotals;
      const vatMult=1+(taxRate/100);
      // Base VAT on netTotal (after vol discount + agency comm) — not raw gross
      // ROs without discounts: netTotal === gross, so result is unchanged for them
      const roAmtLessVat=netTotal;
      const roAmtInclVat=netTotal*vatMult;
      const mpoAmtInclVat=mpo?mpo.amount*vatMult:0;
      const ratePerSpot=totalSpots>0?amountPayable/totalSpots:0;
      const monthLabel=ro.campaignMonth?new Date(ro.campaignMonth+"-01T12:00:00").toLocaleDateString("en-NG",{month:"long",year:"numeric"}):"—";
      return {ro,mpo,totalSpots,gross,roAmtLessVat,roAmtInclVat,mpoAmtInclVat,netAfterWht:amountPayable,ratePerSpot,monthLabel};
    }).filter(Boolean);
  },[ros,mpos,mbClient,mbMpo,mbMonth,mbAgency,from,to,whtRate,taxRate]);

  const mbClients=[...new Set((ros||[]).map(r=>r.client))].sort();
  const mbMpos=[...new Set((ros||[]).filter(r=>r.mpoId).map(r=>r.mpoId))].sort();

  const exportExcel=async()=>{
    const XLS=await import("xlsx-js-style");
    if(tab==="media-buy"){
      // ── helpers ──────────────────────────────────────────────────────────────
      const COLS=13;
      const numFmt="#,##0.00";
      const border={top:{style:"thin",color:{rgb:"BBBBBB"}},bottom:{style:"thin",color:{rgb:"BBBBBB"}},left:{style:"thin",color:{rgb:"BBBBBB"}},right:{style:"thin",color:{rgb:"BBBBBB"}}};
      const cell=(v,s={})=>({v,t:typeof v==="number"?"n":"s",...(s as any)});
      const num=(v,extra={})=>({v,t:"n",z:numFmt,s:{border,alignment:{horizontal:"right"},...extra}});

      // ── title ─────────────────────────────────────────────────────────────────
      // Build a period label from the filtered rows (first month found)
      const periodLabel=mbRows.length?mbRows[0].monthLabel.toUpperCase():"";
      const mbCompanyName=(settings as any)?.companyName||"MediaHub";
      const mbTagline=(settings as any)?.tagline||"Media Agency · Lagos, Nigeria";
      const logoRow=[{v:mbCompanyName,t:"s",s:{font:{bold:true,sz:15,color:{rgb:"1A2D5A"}},alignment:{horizontal:"left"}}},...Array(6).fill({v:"",t:"s",s:{}}),{v:mbTagline,t:"s",s:{font:{sz:9,italic:true,color:{rgb:"999999"}},alignment:{horizontal:"right"}}},...Array(COLS-8).fill({v:"",t:"s",s:{}})];
      const title=`${agencyName.toUpperCase()} MEDIA BUY REPORT — ${periodLabel}`;
      const titleCell={v:title,t:"s",s:{font:{bold:true,sz:13},alignment:{horizontal:"center",vertical:"center"},fill:{fgColor:{rgb:"FFFFFF"}}}};

      // ── column headers ────────────────────────────────────────────────────────
      const HEADERS=["Month","Agency Name","Client Name","Brand Name","Media Order Number","RO Number","Material Duration","MPO Amt (incl VAT)","RO Amt (incl VAT)","RO Amt less VAT","Net Amount less WHT NGN","Nos of Spot","Rate Per Spot"];
      const hdrStyle=(isYellow=false)=>({font:{bold:true,sz:10},fill:{fgColor:{rgb:isYellow?"FFFF00":"DCE6F1"}},border,alignment:{horizontal:"center",wrapText:true}});
      const hdrRow=HEADERS.map((h,i)=>({v:h,t:"s",s:hdrStyle(i===7)}));

      // ── data rows ─────────────────────────────────────────────────────────────
      const dataRows=mbRows.map(({ro,mpo,totalSpots,gross,roAmtLessVat,roAmtInclVat,mpoAmtInclVat,netAfterWht,ratePerSpot,monthLabel})=>[
        cell(monthLabel,{s:{border,alignment:{horizontal:"center"}}}),
        cell(mpo?.agency||agencyName,{s:{border}}),
        cell(ro.client,{s:{border}}),
        cell(ro.campaign,{s:{border}}),
        cell(shortId(ro.mpoId)||"—",{s:{border,font:{name:"Courier New",sz:9}}}),
        cell(ro.id,{s:{border,font:{name:"Courier New",sz:9}}}),
        cell(ro.materialDuration||mpo?.materialDuration||"",{s:{border}}),
        num(mpoAmtInclVat,{s:{border,fill:{fgColor:{rgb:"FFFF00"}},font:{bold:true},alignment:{horizontal:"right"},z:numFmt}}),
        num(roAmtInclVat),
        num(roAmtLessVat),
        num(netAfterWht,{s:{border,font:{bold:true,color:{rgb:"1F5C1F"}},alignment:{horizontal:"right"},z:numFmt}}),
        {v:totalSpots,t:"n",s:{border,alignment:{horizontal:"center"},font:{bold:true}}},
        num(ratePerSpot),
      ]);

      // ── totals ────────────────────────────────────────────────────────────────
      const totMpoVat=mbRows.reduce((a,r)=>a+r.mpoAmtInclVat,0);
      const totRoVat=mbRows.reduce((a,r)=>a+r.roAmtInclVat,0);
      const totRoLessVat=mbRows.reduce((a,r)=>a+r.roAmtLessVat,0);
      const totNet=mbRows.reduce((a,r)=>a+r.netAfterWht,0);
      const totSpots=mbRows.reduce((a,r)=>a+r.totalSpots,0);
      const totRate=totSpots>0?totNet/totSpots:0;
      const totStyle={font:{bold:true,sz:10},fill:{fgColor:{rgb:"E8E8E8"}},border};
      const totRow=[
        {v:"",t:"s",s:totStyle},{v:"",t:"s",s:totStyle},{v:"",t:"s",s:totStyle},
        {v:"",t:"s",s:totStyle},{v:"",t:"s",s:totStyle},{v:"",t:"s",s:totStyle},
        {v:"TOTALS",t:"s",s:{...totStyle,alignment:{horizontal:"right"}}},
        {v:totMpoVat,t:"n",z:numFmt,s:{...totStyle,fill:{fgColor:{rgb:"FFFF00"}},alignment:{horizontal:"right"}}},
        {v:totRoVat,t:"n",z:numFmt,s:{...totStyle,alignment:{horizontal:"right"}}},
        {v:totRoLessVat,t:"n",z:numFmt,s:{...totStyle,alignment:{horizontal:"right"}}},
        {v:totNet,t:"n",z:numFmt,s:{...totStyle,font:{bold:true,color:{rgb:"1F5C1F"}},alignment:{horizontal:"right"}}},
        {v:totSpots,t:"n",s:{...totStyle,alignment:{horizontal:"center"}}},
        {v:totRate,t:"n",z:numFmt,s:{...totStyle,alignment:{horizontal:"right"}}},
      ];

      // ── assemble sheet ────────────────────────────────────────────────────────
      const sheetData=[logoRow,[titleCell,...Array(COLS-1).fill({v:"",t:"s"})],hdrRow,...dataRows,totRow];
      const ws=XLS.utils.aoa_to_sheet(sheetData);

      // Merge title across all columns (rows 0 and 1)
      ws["!merges"]=[{s:{r:1,c:0},e:{r:1,c:COLS-1}}];

      // Column widths
      ws["!cols"]=[{wch:12},{wch:16},{wch:20},{wch:18},{wch:22},{wch:16},{wch:20},{wch:16},{wch:16},{wch:16},{wch:22},{wch:10},{wch:14}];

      // Row heights: logo row + title row taller
      ws["!rows"]=[{hpt:22},{hpt:24},{hpt:32}];

      const wb=XLS.utils.book_new();
      XLS.utils.book_append_sheet(wb,ws,"Media Buy");
      XLS.writeFile(wb,"media-buy-report.xlsx");
      return;
    }
    // ── other tabs: plain CSV ─────────────────────────────────────────────────
    const rows=[["Type","ID","Party","MPO","Amount","Currency","Paid","Balance","Due","Status"],...lR.map(r=>["Rec",r.id,r.client,r.mpo,r.amount,r.currency||"NGN",r.paid,r.amount-r.paid,r.due,r.status]),...lP.map(p=>["Pay",p.id,p.vendor,p.mpo,p.amount,p.currency||"NGN",p.paid,p.amount-p.paid,p.due,p.status])];
    const csv=rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");
    const a=document.createElement("a");a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);a.download="report.csv";a.click();
  };

  const TABS=["media-buy","summary","by-client","by-channel","cash-flow"];
  const TAB_LABELS={"media-buy":"Media Buy","summary":"Summary","by-client":"By Client","by-channel":"By Channel","cash-flow":"Cash Flow"};

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
        {tab==="media-buy"?(
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:12,color:"var(--text3)"}}>Month:</span>
            <input type="month" className="form-input" style={{width:"auto",fontSize:12,padding:"5px 8px"}} value={mbMonth} onChange={e=>setMbMonth(e.target.value)}/>
            <select className="form-input" style={{width:"auto",fontSize:12,padding:"5px 8px"}} value={mbAgency} onChange={e=>setMbAgency(e.target.value)}>
              <option value="">All Agencies</option>
              {[...new Set((mpos||[]).map(m=>m.agency).filter(Boolean))].sort().map(a=><option key={a} value={a}>{a}</option>)}
            </select>
            {(mbMonth||mbAgency)&&<button className="btn btn-sm btn-ghost" onClick={()=>{setMbMonth("");setMbAgency("");}}>Clear</button>}
          </div>
        ):(
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:12,color:"var(--text3)"}}>Period:</span>
            <input type="date" className="form-input" style={{width:"auto",fontSize:12,padding:"5px 8px"}} value={from} onChange={e=>setFrom(e.target.value)}/>
            <span style={{fontSize:12,color:"var(--text3)"}}>to</span>
            <input type="date" className="form-input" style={{width:"auto",fontSize:12,padding:"5px 8px"}} value={to} onChange={e=>setTo(e.target.value)}/>
            {(from||to)&&<button className="btn btn-sm btn-ghost" onClick={()=>{setFrom("");setTo("");}}>Clear</button>}
          </div>
        )}
        <button className="btn btn-primary" onClick={exportExcel}>{tab==="media-buy"?"Export Excel":"Export CSV"}</button>
      </div>
      <div className="tabs">{TABS.map(t=><button key={t} className={`tab ${tab===t?"active":""}`} onClick={()=>setTab(t)}>{TAB_LABELS[t]}</button>)}</div>

      {tab==="summary"&&(()=>{
        // ── derived summary stats ──────────────────────────────────────────────
        const totalMpoValue=fM.reduce((a,m)=>a+convertAmt(m.amount,m.currency||"NGN",dCcy),0);
        const activeMpos=fM.filter(m=>m.status==="active").length;
        const totalPayable=lP.reduce((a,p)=>a+convertAmt(p.amount,p.currency||"NGN",dCcy),0);
        const totalPaid=lP.reduce((a,p)=>a+convertAmt(p.paid,p.currency||"NGN",dCcy),0);
        const overdueRec=lR.filter(r=>r.status==="overdue");
        const overdueAmt=overdueRec.reduce((a,r)=>a+convertAmt(r.amount-r.paid,r.currency||"NGN",dCcy),0);
        const totalRos=(ros||[]).length;
        const totalSpots=(ros||[]).reduce((a,ro)=>a+(ro.schedule||[]).reduce((b,s)=>b+Number(s.spots||0),0),0);
        const netPos=tPd-totalPaid;

        // Top clients by MPO value
        const topClients=cSpend.slice(0,5);

        // Top vendors by payable
        const topVendors=Object.values(lP.reduce((acc,p)=>{
          const k=p.vendor;acc[k]=acc[k]||{name:k,amount:0,paid:0};
          acc[k].amount+=convertAmt(p.amount,p.currency||"NGN",dCcy);
          acc[k].paid+=convertAmt(p.paid,p.currency||"NGN",dCcy);
          return acc;
        },{})).sort((a:any,b:any)=>b.amount-a.amount).slice(0,5) as any[];

        // Invoice status breakdown
        const recByStatus={paid:lR.filter(r=>r.status==="paid").length,partial:lR.filter(r=>r.status==="partial").length,overdue:lR.filter(r=>r.status==="overdue").length,pending:lR.filter(r=>r.status==="pending").length};

        const KPIs=[
          {label:"Total MPO Value",  val:fmtK(totalMpoValue,sym), sub:`${fM.length} orders`,     color:"#534AB7"},
          {label:"Active Campaigns", val:activeMpos,              sub:`of ${fM.length} total`,    color:"#3B6D11"},
          {label:"Total Billed",     val:fmtK(tB,sym),           sub:`${cPct}% collected`,       color:"#185FA5"},
          {label:"Outstanding",      val:fmtK(Math.max(0,tB-tPd),sym), sub:`${overdueRec.length} overdue`, color:overdueRec.length>0?"#A32D2D":"#854F0B"},
          {label:"Total Payable",    val:fmtK(totalPayable,sym), sub:`${fmtK(totalPaid,sym)} settled`, color:"#854F0B"},
          {label:"Net Cash Position",val:fmtK(netPos,sym),       sub:netPos>=0?"Surplus":"Deficit", color:netPos>=0?"#3B6D11":"#A32D2D"},
          {label:"Total ROs",        val:totalRos,               sub:`${totalSpots} spots booked`, color:"#534AB7"},
          {label:"Overdue Amount",   val:fmtK(overdueAmt,sym),  sub:`${overdueRec.length} invoices`, color:overdueAmt>0?"#A32D2D":"#3B6D11"},
        ];

        return(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {/* KPI grid */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>
              {KPIs.map(k=>(
                <div key={k.label} className="card" style={{padding:"14px 16px",borderLeft:`4px solid ${k.color}`}}>
                  <div style={{fontSize:10,fontWeight:600,letterSpacing:".06em",textTransform:"uppercase",color:"var(--text3)",marginBottom:4}}>{k.label}</div>
                  <div style={{fontSize:20,fontWeight:800,color:"var(--text)",lineHeight:1.1}}>{k.val}</div>
                  <div style={{fontSize:10,color:"var(--text3)",marginTop:4}}>{k.sub}</div>
                </div>
              ))}
            </div>

            {/* Charts row */}
            <div className="grid2">
              <div className="card">
                <div className="card-header"><span className="card-title">MPO Status Distribution</span></div>
                {sDist.length>0?<DonutChart data={sDist} size={140}/>:<p style={{color:"var(--text3)",textAlign:"center",padding:20}}>No data</p>}
              </div>
              <div className="card">
                <div className="card-header"><span className="card-title">Receivables Collection</span></div>
                {rDonut.length>0?<DonutChart data={rDonut} size={140}/>:<p style={{color:"var(--text3)",textAlign:"center",padding:20}}>No data</p>}
                <div style={{marginTop:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--text2)",marginBottom:4}}><span>Collection rate</span><strong>{cPct}%</strong></div>
                  <div className="progress-bar"><div className="progress-fill" style={{width:`${cPct}%`}}/></div>
                </div>
              </div>
            </div>

            {/* Invoice status breakdown */}
            <div className="card">
              <div className="card-header"><span className="card-title">Invoice Status Breakdown</span></div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:0}}>
                {([["Paid",recByStatus.paid,"#3B6D11","#EAF3DE"],["Partial",recByStatus.partial,"#854F0B","#FAEEDA"],["Overdue",recByStatus.overdue,"#A32D2D","#FCEBEB"],["Pending",recByStatus.pending,"#185FA5","#E6F1FB"]] as [string,number,string,string][]).map(([label,count,color,bg])=>(
                  <div key={label} style={{padding:"14px 16px",background:bg,display:"flex",flexDirection:"column",gap:4,borderRight:"1px solid var(--border-c)"}}>
                    <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color}}>{label}</div>
                    <div style={{fontSize:26,fontWeight:800,color}}>{count}</div>
                    <div style={{fontSize:10,color:"var(--text3)"}}>invoice{count!==1?"s":""}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top clients + top vendors */}
            <div className="grid2">
              <div className="card">
                <div className="card-header"><span className="card-title">Top Clients by MPO Value</span></div>
                {topClients.length===0?<p style={{color:"var(--text3)",textAlign:"center",padding:16,fontSize:12}}>No data</p>:(
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead><tr>{["Client","MPO Value","Share"].map(h=><th key={h} style={{padding:"6px 8px",textAlign:"left",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".04em",color:"var(--text3)",borderBottom:"1px solid var(--border-c)"}}>{h}</th>)}</tr></thead>
                    <tbody>{topClients.map((c:any,i)=>{
                      const share=totalMpoValue>0?Math.round(c.amount/totalMpoValue*100):0;
                      return(
                        <tr key={c.name}>
                          <td style={{padding:"7px 8px",fontWeight:500,borderBottom:"1px solid var(--border-c)"}}><div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:6,height:6,borderRadius:"50%",background:["#534AB7","#185FA5","#3B6D11","#854F0B","#D85A30"][i],flexShrink:0}}/>{c.name}</div></td>
                          <td style={{padding:"7px 8px",fontWeight:700,borderBottom:"1px solid var(--border-c)"}}>{fmtK(c.amount,sym)}</td>
                          <td style={{padding:"7px 8px",borderBottom:"1px solid var(--border-c)"}}>
                            <div style={{display:"flex",alignItems:"center",gap:6}}>
                              <div style={{flex:1,height:5,background:"var(--bg3)",borderRadius:3}}><div style={{width:`${share}%`,height:"100%",background:["#534AB7","#185FA5","#3B6D11","#854F0B","#D85A30"][i],borderRadius:3}}/></div>
                              <span style={{fontSize:10,color:"var(--text3)",minWidth:28}}>{share}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                )}
              </div>
              <div className="card">
                <div className="card-header"><span className="card-title">Top Vendors by Payable</span></div>
                {topVendors.length===0?<p style={{color:"var(--text3)",textAlign:"center",padding:16,fontSize:12}}>No data</p>:(
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead><tr>{["Vendor","Total","Settled"].map(h=><th key={h} style={{padding:"6px 8px",textAlign:"left",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".04em",color:"var(--text3)",borderBottom:"1px solid var(--border-c)"}}>{h}</th>)}</tr></thead>
                    <tbody>{topVendors.map((v:any,i)=>{
                      const pct=v.amount>0?Math.round(v.paid/v.amount*100):0;
                      return(
                        <tr key={v.name}>
                          <td style={{padding:"7px 8px",fontWeight:500,borderBottom:"1px solid var(--border-c)"}}><div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:6,height:6,borderRadius:"50%",background:["#854F0B","#534AB7","#185FA5","#3B6D11","#D85A30"][i],flexShrink:0}}/>{v.name}</div></td>
                          <td style={{padding:"7px 8px",fontWeight:700,borderBottom:"1px solid var(--border-c)"}}>{fmtK(v.amount,sym)}</td>
                          <td style={{padding:"7px 8px",borderBottom:"1px solid var(--border-c)"}}>
                            <div style={{display:"flex",alignItems:"center",gap:6}}>
                              <div style={{flex:1,height:5,background:"var(--bg3)",borderRadius:3}}><div style={{width:`${pct}%`,height:"100%",background:"#3B6D11",borderRadius:3}}/></div>
                              <span style={{fontSize:10,color:"var(--text3)",minWidth:28}}>{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Overdue invoices list */}
            {overdueRec.length>0&&(
              <div className="card">
                <div className="card-header"><span className="card-title" style={{color:"#A32D2D"}}>Overdue Invoices</span><span className="badge badge-red">{overdueRec.length}</span></div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr>{["Invoice","Client","MPO","Due Date","Amount","Balance"].map(h=><th key={h} style={{padding:"6px 8px",textAlign:"left",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".04em",color:"var(--text3)",borderBottom:"1px solid var(--border-c)"}}>{h}</th>)}</tr></thead>
                  <tbody>{overdueRec.map(r=>{
                    const bal=convertAmt(r.amount-r.paid,r.currency||"NGN",dCcy);
                    return(
                      <tr key={r.id}>
                        <td style={{padding:"7px 8px",fontFamily:"monospace",fontSize:11,borderBottom:"1px solid var(--border-c)"}}>{r.id}</td>
                        <td style={{padding:"7px 8px",fontWeight:500,borderBottom:"1px solid var(--border-c)"}}>{r.client}</td>
                        <td style={{padding:"7px 8px",fontSize:11,color:"var(--text3)",borderBottom:"1px solid var(--border-c)"}}>{r.mpo||"—"}</td>
                        <td style={{padding:"7px 8px",color:"#A32D2D",fontWeight:600,borderBottom:"1px solid var(--border-c)"}}>{r.due}</td>
                        <td style={{padding:"7px 8px",borderBottom:"1px solid var(--border-c)"}}>{fmtK(convertAmt(r.amount,r.currency||"NGN",dCcy),sym)}</td>
                        <td style={{padding:"7px 8px",fontWeight:700,color:"#A32D2D",borderBottom:"1px solid var(--border-c)"}}>{fmtK(bal,sym)}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}
      {tab==="by-client"&&(<div className="card"><div className="card-header"><span className="card-title">MPO Value by Client</span></div>{cSpend.length===0?<p style={{color:"var(--text3)",textAlign:"center",padding:20}}>No data</p>:<BarChart data={cSpend.map(c=>({label:c.name.split(" ")[0],value:c.amount}))} height={180} colors={["#534AB7"]}/> }</div>)}
      {tab==="by-channel"&&(<div className="card"><div className="card-header"><span className="card-title">Spend by Channel</span></div><BarChart data={Object.values((mpos||[]).reduce((acc,m)=>{const ch=m.channel||"Other";if(!acc[ch])acc[ch]={label:ch,value:0};acc[ch].value+=Number(m.amount)||0;return acc;},{})).sort((a,b)=>b.value-a.value)} height={180} colors={["#534AB7","#3B6D11","#185FA5","#854F0B","#D85A30"]}/></div>)}
      {tab==="cash-flow"&&(<div className="grid2">
        <div className="card"><div className="card-header"><span className="card-title">Rec vs Pay</span></div><BarChart data={[{label:"Billed",values:[tB,0]},{label:"Collected",values:[tPd,0]},{label:"Payable",values:[0,lP.reduce((a,p)=>a+convertAmt(p.amount,p.currency||"NGN",dCcy),0)]},{label:"Settled",values:[0,lP.reduce((a,p)=>a+convertAmt(p.paid,p.currency||"NGN",dCcy),0)]}]} height={175} colors={["#534AB7","#D85A30"]}/></div>
        <div className="card"><div className="card-header"><span className="card-title">Net Position ({sym})</span></div>
          {[{l:"Total Billed",v:fmtK(tB,sym),c:"var(--text)"},{l:"Collected",v:fmtK(tPd,sym),c:"#3B6D11"},{l:"Total Payable",v:fmtK(lP.reduce((a,p)=>a+convertAmt(p.amount,p.currency||"NGN",dCcy),0),sym),c:"#8B4500"},{l:"Net Cash",v:fmtK(tPd-lP.reduce((a,p)=>a+convertAmt(p.paid,p.currency||"NGN",dCcy),0),sym),c:(tPd-lP.reduce((a,p)=>a+convertAmt(p.paid,p.currency||"NGN",dCcy),0))>=0?"#3B6D11":"#A32D2D"}].map(s=>(
            <div key={s.l} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"var(--border)"}}><span style={{fontSize:13,color:"var(--text2)"}}>{s.l}</span><span style={{fontSize:13,fontWeight:700,color:s.c}}>{s.v}</span></div>
          ))}
        </div>
      </div>)}

      {tab==="media-buy"&&(
        <div>
          {/* Filters */}
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12,alignItems:"center"}}>
            <select className="form-input" style={{width:"auto",fontSize:12}} value={mbClient} onChange={e=>setMbClient(e.target.value)}>
              <option value="">All Clients</option>
              {mbClients.map(c=><option key={c}>{c}</option>)}
            </select>
            <select className="form-input" style={{width:"auto",fontSize:12}} value={mbMpo} onChange={e=>setMbMpo(e.target.value)}>
              <option value="">All MPOs</option>
              {mbMpos.map(m=><option key={m}>{m}</option>)}
            </select>
            {(mbClient||mbMpo)&&<button className="btn btn-sm btn-ghost" onClick={()=>{setMbClient("");setMbMpo("");}}>Clear filters</button>}
            <span style={{marginLeft:"auto",fontSize:11,color:"var(--text3)"}}>{mbRows.length} RO{mbRows.length!==1?"s":""}</span>
          </div>

          <div className="card" style={{padding:0,overflow:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:900}}>
              <thead>
                <tr style={{background:"var(--bg3)"}}>
                  {["Agency Name","Client Name","Brand / Campaign","Month","Media Order No.","RO Number","Material / Duration","MPO Amt\n(incl VAT)","RO Amt\n(incl VAT)","RO Amt\nless VAT","Net Amt\nless WHT","No. of\nSpots","Rate\nPer Spot"].map(h=>(
                    <th key={h} style={{padding:"8px 10px",textAlign:"left",fontWeight:700,fontSize:10,letterSpacing:".04em",textTransform:"uppercase",color:"var(--text2)",borderBottom:"2px solid var(--border-c)",whiteSpace:"pre-line",lineHeight:1.2}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mbRows.length===0?(
                  <tr><td colSpan={12} style={{padding:"32px 16px",textAlign:"center",color:"var(--text3)",fontSize:12}}>No ROs found. Create Release Orders in the Scheduling page.</td></tr>
                ):mbRows.map(({ro,mpo,totalSpots,roAmtLessVat,roAmtInclVat,mpoAmtInclVat,netAfterWht,ratePerSpot,monthLabel},i)=>(
                  <tr key={ro.id} style={{background:i%2===0?"var(--bg1)":"var(--bg2)",borderBottom:"1px solid var(--border-c)"}}>
                    <td style={{padding:"7px 10px",fontWeight:500}}>{mpo?.agency||agencyName}</td>
                    <td style={{padding:"7px 10px"}}>{ro.client}</td>
                    <td style={{padding:"7px 10px"}}>{ro.campaign}</td>
                    <td style={{padding:"7px 10px",whiteSpace:"nowrap"}}>{monthLabel}</td>
                    <td style={{padding:"7px 10px",fontFamily:"monospace",fontSize:10}}>{shortId(ro.mpoId)||"—"}</td>
                    <td style={{padding:"7px 10px",fontFamily:"monospace",fontSize:10}}>{ro.id}</td>
                    <td style={{padding:"7px 10px",fontSize:11}}>{ro.materialDuration||mpo?.materialDuration||"—"}</td>
                    <td style={{padding:"7px 10px",fontWeight:600,background:"#fffde7",color:"#856404"}}>{sym}{mpoAmtInclVat.toLocaleString("en",{maximumFractionDigits:2})}</td>
                    <td style={{padding:"7px 10px",fontWeight:600}}>{sym}{roAmtInclVat.toLocaleString("en",{maximumFractionDigits:2})}</td>
                    <td style={{padding:"7px 10px"}}>{sym}{roAmtLessVat.toLocaleString("en",{maximumFractionDigits:2})}</td>
                    <td style={{padding:"7px 10px",fontWeight:600,color:"#3B6D11"}}>{sym}{netAfterWht.toLocaleString("en",{maximumFractionDigits:2})}</td>
                    <td style={{padding:"7px 10px",textAlign:"center",fontWeight:700}}>{totalSpots}</td>
                    <td style={{padding:"7px 10px",textAlign:"right"}}>{sym}{ratePerSpot.toLocaleString("en",{maximumFractionDigits:2})}</td>
                  </tr>
                ))}
              </tbody>
              {mbRows.length>0&&(()=>{
                const totMpoVat=mbRows.reduce((a,r)=>a+r.mpoAmtInclVat,0);
                const totRoVat=mbRows.reduce((a,r)=>a+r.roAmtInclVat,0);
                const totRoLessVat=mbRows.reduce((a,r)=>a+r.roAmtLessVat,0);
                const totNet=mbRows.reduce((a,r)=>a+r.netAfterWht,0);
                const totSpots=mbRows.reduce((a,r)=>a+r.totalSpots,0);
                return(
                  <tfoot>
                    <tr style={{background:"var(--bg3)",fontWeight:700,borderTop:"2px solid var(--border-c)"}}>
                      <td colSpan={7} style={{padding:"8px 10px",fontSize:11,color:"var(--text2)"}}>TOTALS ({mbRows.length} ROs)</td>
                      <td style={{padding:"8px 10px",background:"#fffde7",color:"#856404"}}>{sym}{totMpoVat.toLocaleString("en",{maximumFractionDigits:2})}</td>
                      <td style={{padding:"8px 10px"}}>{sym}{totRoVat.toLocaleString("en",{maximumFractionDigits:2})}</td>
                      <td style={{padding:"8px 10px"}}>{sym}{totRoLessVat.toLocaleString("en",{maximumFractionDigits:2})}</td>
                      <td style={{padding:"8px 10px",color:"#3B6D11"}}>{sym}{totNet.toLocaleString("en",{maximumFractionDigits:2})}</td>
                      <td style={{padding:"8px 10px",textAlign:"center"}}>{totSpots}</td>
                      <td style={{padding:"8px 10px",textAlign:"right"}}>{totSpots>0?sym+(totNet/totSpots).toLocaleString("en",{maximumFractionDigits:2}):"—"}</td>
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ ANALYTICS ═══ */
function AnalyticsPage({mpos,receivables,payables,user,settings}){
  return <RoleGuard user={user} require="analytics"><AnalyticsContent mpos={mpos} receivables={receivables} payables={payables} settings={settings}/></RoleGuard>;
}
function AnalyticsContent({mpos,receivables,payables,settings}){
  const lR=receivables.map(r=>({...r,status:computeStatus(r)}));
  const dCcy=settings.defaultCurrency||"NGN";const sym=CURRENCIES[dCcy]?.symbol||"₦";
  const KPI={revenue:Number(settings.revenueTarget)||25000000,collection:Number(settings.collectionTarget)||90,campaigns:Number(settings.campaignTarget)||8,newClients:Number(settings.newClientsTarget)||4};
  const actual={revenue:mpos.reduce((a,m)=>a+convertAmt(m.amount,m.currency||"NGN",dCcy),0),collection:lR.length?Math.round(lR.reduce((a,r)=>a+r.paid,0)/lR.reduce((a,r)=>a+r.amount,0)*100):0,campaigns:mpos.filter(m=>m.status==="active").length,newClients:0};
  const monthly=useMemo(()=>{const map={};(mpos||[]).forEach(m=>{if(!m.start)return;const k=m.start.slice(0,7);const lbl=new Date(k+"-01T12:00:00").toLocaleDateString("en-NG",{month:"short",year:"2-digit"});if(!map[k])map[k]={label:lbl,value:0};map[k].value+=Number(m.amount)||0;});return Object.entries(map).sort(([a],[b])=>a.localeCompare(b)).map(([,v])=>v);},[mpos]);
  const avg3=monthly.length>=3?monthly.slice(-3).reduce((a,m)=>a+m.value,0)/3:0;
  const forecast=avg3>0?[{label:"Forecast +1",value:Math.round(avg3*1.08)},{label:"Forecast +2",value:Math.round(avg3*1.14)},{label:"Forecast +3",value:Math.round(avg3*1.20)}]:[];
  const cShare=Object.values(mpos.reduce((acc,m)=>{acc[m.client]=acc[m.client]||{name:m.client,amount:0};acc[m.client].amount+=convertAmt(m.amount,m.currency||"NGN",dCcy);return acc;},{})).sort((a,b)=>b.amount-a.amount);
  const KPICard=({label,actual:a,target,unit})=>{const pct=Math.min(Math.round(a/target*100),100);const met=a>=target;return(
    <div className="kpi-card"><div className="kpi-target-line" style={{background:met?"#3B6D11":"#D85A30"}}/><div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>{label}</div><div style={{fontSize:22,fontWeight:700,color:met?"#3B6D11":"var(--text)"}}>{unit==="₦"?fmtK(a,sym):a}{unit!=="₦"&&unit}</div><div style={{fontSize:11,color:"var(--text3)",marginBottom:8}}>Target: {unit==="₦"?fmtK(target,sym):target}{unit!=="₦"&&unit}</div><div className="progress-bar"><div className="progress-fill" style={{width:`${pct}%`,background:met?"#3B6D11":"var(--brand)"}}/></div><div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--text3)",marginTop:4}}><span>{pct}%</span><span style={{color:met?"#3B6D11":"#854F0B"}}>{met?"✓ Met":"In progress"}</span></div></div>);};
  return(
    <div>
      <div className="grid2" style={{marginBottom:16}}>
        <KPICard label="Revenue Target" actual={actual.revenue} target={KPI.revenue} unit="₦"/>
        <KPICard label="Collection Rate" actual={actual.collection} target={KPI.collection} unit="%"/>
        <KPICard label="Active Campaigns" actual={actual.campaigns} target={KPI.campaigns} unit=""/>
        <KPICard label="New Clients" actual={actual.newClients} target={KPI.newClients} unit=""/>
      </div>
      {monthly.length>0&&<div className="grid2">
        <div className="card"><div className="card-header"><span className="card-title">Revenue & Forecast</span></div><BarChart data={[...monthly,...forecast]} height={155} colors={["#534AB7"]}/></div>
        {forecast.length>0&&<div className="card"><div className="card-header"><span className="card-title">Revenue Forecast</span></div>
          {forecast.map((f,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:"var(--border)",fontSize:13}}><span style={{color:"var(--text2)"}}>{f.label}</span><div style={{textAlign:"right"}}><div style={{fontWeight:600}}>{fmtK(f.value,sym)}</div><div style={{fontSize:11,color:"#3B6D11"}}>projected</div></div></div>)}
          <div style={{marginTop:16,padding:12,background:"var(--brand-light)",borderRadius:8}}><div style={{fontSize:11,color:"var(--brand)",fontWeight:600}}>3-Period Forecast Total</div><div style={{fontSize:20,fontWeight:700,color:"var(--brand)",marginTop:2}}>{fmtK(forecast.reduce((a,f)=>a+f.value,0),sym)}</div></div>
        </div>}
      </div>}
      <div className="grid2">
        <div className="card"><div className="card-header"><span className="card-title">Client Concentration</span></div><DonutChart data={cShare.slice(0,5).map((c,i)=>({label:c.name.split(" ")[0],value:c.amount,color:["#534AB7","#185FA5","#3B6D11","#854F0B","#D85A30"][i]}))} size={148}/></div>
        <div className="card"><div className="card-header"><span className="card-title">Channel Performance</span></div>
          {(()=>{const ch=Object.values(mpos.reduce((acc,m)=>{const c=m.channel||"Other";if(!acc[c])acc[c]={ch:c,rev:0};acc[c].rev+=convertAmt(Number(m.amount)||0,m.currency||"NGN",dCcy);return acc;},{})).sort((a,b)=>b.rev-a.rev);const maxRev=ch[0]?.rev||1;return ch.length===0?<div style={{padding:"20px 0",textAlign:"center",fontSize:12,color:"var(--text3)"}}>No data yet</div>:ch.map(r=>(
            <div key={r.ch} style={{marginBottom:14}}><div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}><span style={{fontWeight:500}}>{r.ch}</span><span style={{color:"var(--text3)"}}>{fmtK(r.rev,sym)}</span></div><div className="progress-bar" style={{height:8}}><div className="progress-fill" style={{width:`${Math.round(r.rev/maxRev*100)}%`}}/></div></div>
          ));})()}
        </div>
      </div>
    </div>
  );
}

/* ═══ REMINDERS ═══ */
function RemindersPage({receivables,payables,mpos,user,toast}){return <RoleGuard user={user} require="reminders"><RemContent receivables={receivables} payables={payables} mpos={mpos} toast={toast}/></RoleGuard>;}
function RemContent({receivables,payables,mpos,toast}){
  const [sent,setSent]=useState({});
  const lR=receivables.map(r=>({...r,status:computeStatus(r)}));
  const lP=payables.map(p=>({...p,status:computeStatus(p)}));
  const reminders=[...lR.filter(r=>r.status==="overdue"||(daysUntil(r.due)<=7&&r.status!=="paid")).map(r=>({key:`rec-${r.id}`,icon:"💰",title:`Invoice ${r.id} — ${r.client}`,detail:`Balance ${fmt(r.amount-r.paid)} due ${r.due}`,urgency:r.status==="overdue"?"overdue":"upcoming",id:r.id})),...lP.filter(p=>p.status==="overdue"||(daysUntil(p.due)<=7&&p.status!=="paid")).map(p=>({key:`pay-${p.id}`,icon:"🧾",title:`Payable ${p.id} — ${p.vendor}`,detail:`Balance ${fmt(p.amount-p.paid)} due ${p.due}`,urgency:p.status==="overdue"?"overdue":"upcoming",id:p.id})),...mpos.filter(m=>m.exec==="delayed").map(m=>({key:`mpo-${m.id}`,icon:"📋",title:`MPO ${m.id} Delayed`,detail:m.campaign,urgency:"overdue",id:m.id}))];
  const sendR=r=>{setSent(s=>({...s,[r.key]:{ts:new Date().toLocaleTimeString()}}));toast(`Reminder sent for ${r.id}`,"info");};
  const sendAll=()=>{const u=reminders.filter(r=>!sent[r.key]);if(!u.length){toast("All sent","info");return;}const ns={...sent};u.forEach(r=>{ns[r.key]={ts:new Date().toLocaleTimeString()};});setSent(ns);toast(`${u.length} reminders sent`);};
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div><div style={{fontWeight:500,marginBottom:2}}>Reminder Centre</div><div style={{fontSize:12,color:"var(--text3)"}}>{reminders.filter(r=>!sent[r.key]).length} pending</div></div>
        <div style={{display:"flex",gap:8}}><button className="btn" onClick={()=>setSent({})}>Clear log</button><button className="btn btn-primary" onClick={sendAll}>Send all pending</button></div>
      </div>
      {reminders.length===0&&<div className="card" style={{textAlign:"center",padding:48,color:"var(--text3)"}}><div style={{fontSize:32,marginBottom:12}}>🎉</div><div style={{fontWeight:500}}>No reminders needed</div></div>}
      {["overdue","upcoming"].map(urg=>{const items=reminders.filter(r=>r.urgency===urg);if(!items.length)return null;return(
        <div key={urg} className="card"><div className="card-header"><span className="card-title" style={{color:urg==="overdue"?"#A32D2D":"#854F0B"}}>{urg==="overdue"?"🔴 Overdue":"🟡 Due Soon"}</span></div>
          {items.map(r=><div key={r.key} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"12px 0",borderBottom:"var(--border)",opacity:sent[r.key]?.5:1}}>
            <div style={{width:30,height:30,borderRadius:8,background:urg==="overdue"?"#FCEBEB":"#FFF4E5",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>{r.icon}</div>
            <div style={{flex:1}}><div style={{fontSize:13,fontWeight:500}}>{r.title}</div><div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{r.detail}</div>{sent[r.key]&&<div style={{fontSize:10,color:"#3B6D11",marginTop:3}}>✓ {sent[r.key].ts}</div>}</div>
            <button className="btn btn-sm" style={{background:urg==="overdue"?"#FCEBEB":"#FFF4E5",color:urg==="overdue"?"#A32D2D":"#8B4500",borderColor:urg==="overdue"?"#f5c6c6":"#F5C97A"}} onClick={()=>sendR(r)} disabled={!!sent[r.key]}>{sent[r.key]?"Sent ✓":"Send"}</button>
          </div>)}
        </div>
      );})}
    </div>
  );
}

/* ═══ AUDIT ═══ */
function AuditPage({auditLog,user}){return <RoleGuard user={user} require="audit"><AuditContent auditLog={auditLog}/></RoleGuard>;}
function AuditContent({auditLog}){
  const [filter,setFilter]=useState("all");
  const tags=["all","create","workflow","payment","reminder","delete","update"];
  const filtered=filter==="all"?auditLog:auditLog.filter(a=>a.tag===filter);
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div><div style={{fontWeight:500,fontSize:15}}>Audit Log</div><div style={{fontSize:12,color:"var(--text3)"}}>{auditLog.length} events</div></div>
        <button className="btn btn-sm btn-ghost" onClick={()=>{const rows=[["Ts","User","Action","Entity","ID","Detail"],...auditLog.map(a=>[a.ts,a.userName,a.action,a.entity,a.entityId,a.detail])];const csv=rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");const a=document.createElement("a");a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);a.download="audit.csv";a.click();}}>Export CSV</button>
      </div>
      <div className="tabs" style={{marginBottom:16}}>{tags.map(t=><button key={t} className={`tab ${filter===t?"active":""}`} onClick={()=>setFilter(t)}>{t}</button>)}</div>
      <div className="card">
        {filtered.length===0?<div style={{textAlign:"center",padding:32,color:"var(--text3)"}}>No events</div>
        :filtered.map(a=>(
          <div key={a.id} className="audit-item">
            <div className="audit-avatar" style={{background:a.userColor}}>{a.initials}</div>
            <div style={{flex:1}}><div style={{fontSize:13}}><strong>{a.userName}</strong> {a.action} <strong>{a.entity} {a.entityId}</strong><span style={{display:"inline-block",padding:"1px 6px",borderRadius:4,fontSize:10,fontWeight:600,marginLeft:6,background:TAG_COLORS[a.tag]||"#eee",color:TAG_TEXT[a.tag]||"#555"}}>{a.tag}</span></div><div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{a.detail}</div></div>
            <div style={{fontSize:11,color:"var(--text3)",flexShrink:0,paddingTop:2}}>{a.ts}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══ USERS ═══ */
const ROLE_PERMISSIONS={
  admin:   ["dashboard","mpo","clients","finance","budgets","reports","calendar","analytics","reminders","users","audit","invoice-wf","settings","dataviz","feed","production"],
  manager: ["dashboard","mpo","clients","finance","budgets","reports","calendar","analytics","reminders","audit","invoice-wf","feed"],
  viewer:  ["dashboard","mpo","clients","calendar","feed"],
  client:  ["dashboard"],
};

function UsersPage({currentUser,toast}){return <RoleGuard user={currentUser} require="users"><UsersContent currentUser={currentUser} toast={toast}/></RoleGuard>;}
function UsersContent({currentUser,toast}){
  const rc={admin:"badge-purple",manager:"badge-blue",viewer:"badge-gray",client:"badge-gray"};
  const [profiles,setProfiles]=useState([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(null);
  const [inviteEmail,setInviteEmail]=useState("");
  const [inviteRole,setInviteRole]=useState("viewer");
  const [inviting,setInviting]=useState(false);
  const isAdmin=currentUser?.role==="admin";

  const load=()=>{
    if(!currentUser?.workspace_id) return;
    setLoading(true);
    supabase.from("profiles")
      .select("id,name,role,initials,color,permissions,workspace_id")
      .eq("workspace_id",currentUser.workspace_id)
      .order("created_at",{ascending:true})
      .then(({data})=>{ if(data) setProfiles(data); setLoading(false); });
  };
  useEffect(load,[currentUser?.workspace_id]);

  const changeRole=async(uid,newRole)=>{
    setSaving(uid);
    const {error}=await supabase.from("profiles").update({
      role:newRole,
      permissions:ROLE_PERMISSIONS[newRole]||ROLE_PERMISSIONS.viewer,
    }).eq("id",uid);
    if(error) toast("Failed to update role","error");
    else{ setProfiles(p=>p.map(u=>u.id===uid?{...u,role:newRole,permissions:ROLE_PERMISSIONS[newRole]}:u)); toast("Role updated","success"); }
    setSaving(null);
  };

  const removeUser=async(uid,name)=>{
    if(!confirm(`Remove ${name} from the workspace?`)) return;
    const {error}=await supabase.from("profiles").update({workspace_id:null}).eq("id",uid);
    if(error) toast("Failed to remove user","error");
    else{ setProfiles(p=>p.filter(u=>u.id!==uid)); toast(`${name} removed`,"info"); }
  };

  const sendInvite=async(e)=>{
    e.preventDefault();
    if(!inviteEmail.trim()) return;
    setInviting(true);
    try{
      const {data,error}=await supabase.functions.invoke("invite-user",{
        body:{email:inviteEmail.trim(),role:inviteRole,workspaceId:currentUser?.workspace_id},
      });
      if(error||data?.error){
        toast(data?.error||error?.message||"Failed to send invite","error");
      } else {
        toast(`Invite email sent to ${inviteEmail}`,"success");
        setInviteEmail("");
      }
    }catch(err){
      toast("Failed to send invite — check Edge Function deployment","error");
    }
    setInviting(false);
  };

  const team=profiles;
  return(
    <div>
      <div className="stat-grid" style={{gridTemplateColumns:"repeat(3,1fr)"}}>
        {[
          {l:"Total Members", v:team.length},
          {l:"Admins",        v:team.filter(u=>u.role==="admin").length},
          {l:"Managers",      v:team.filter(u=>u.role==="manager").length},
        ].map(s=>(
          <div key={s.l} className="stat-card">
            <div className="stat-label">{s.l}</div>
            <div className="stat-value">{loading?"…":s.v}</div>
          </div>
        ))}
      </div>

      {/* Invite panel — admin only */}
      {isAdmin&&(
        <div className="card" style={{marginBottom:16}}>
          <div className="card-header"><span className="card-title">Invite Team Member</span></div>
          <form onSubmit={sendInvite} style={{display:"flex",gap:8,flexWrap:"wrap",padding:"12px 0 4px"}}>
            <input className="form-input" style={{flex:1,minWidth:180}} type="email" placeholder="colleague@agency.com" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} required/>
            <select className="form-input" style={{width:120}} value={inviteRole} onChange={e=>setInviteRole(e.target.value)}>
              <option value="viewer">Viewer</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
            <button className="btn btn-primary btn-sm" type="submit" disabled={inviting}>{inviting?"Sending…":"Send invite"}</button>
          </form>
          <div style={{fontSize:11,color:"var(--text3)",paddingBottom:4}}>New signups are auto-assigned to this workspace as viewers. Promote them below.</div>
        </div>
      )}

      {/* Team list */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Team Members</span>
          <button className="btn btn-sm btn-ghost" onClick={load} style={{fontSize:11}}>↻ Refresh</button>
        </div>
        {loading
          ? <div style={{padding:"20px 0",textAlign:"center",color:"var(--text3)",fontSize:12}}>Loading…</div>
          : team.length===0
            ? <div style={{padding:"20px 0",textAlign:"center",color:"var(--text3)",fontSize:12}}>No team members yet.</div>
            : team.map(u=>(
              <div key={u.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:"var(--border)",flexWrap:"wrap"}}>
                <div style={{width:36,height:36,borderRadius:"50%",background:u.color||"#534AB7",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:12,flexShrink:0}}>{u.initials||"?"}</div>
                <div style={{flex:1,minWidth:120}}>
                  <div style={{fontSize:13,fontWeight:500}}>
                    {u.name||"(no name)"}
                    {u.id===currentUser.id&&<span style={{fontSize:10,color:"var(--brand)",marginLeft:6}}>← you</span>}
                  </div>
                  <div style={{fontSize:10,color:"var(--text3)",marginTop:1}}>{u.permissions?.length||0} permissions</div>
                </div>
                {isAdmin&&u.id!==currentUser.id?(
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <select
                      className="form-input"
                      style={{fontSize:11,padding:"3px 6px",width:100}}
                      value={u.role}
                      disabled={saving===u.id}
                      onChange={e=>changeRole(u.id,e.target.value)}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                      <option value="client">Client</option>
                    </select>
                    <button className="btn btn-sm btn-ghost" style={{color:"#A32D2D",fontSize:11}} onClick={()=>removeUser(u.id,u.name)}>Remove</button>
                  </div>
                ):(
                  <span className={`badge ${rc[u.role]||"badge-gray"}`}>{u.role}</span>
                )}
              </div>
            ))
        }
      </div>
    </div>
  );
}

/* ═══ CLIENT PORTAL ═══ */
function ClientPortal({user,receivables,mpos,onLogout}){
  const clientName=user.name;
  const myRec=receivables.map(r=>({...r,status:computeStatus(r)})).filter(r=>r.client===clientName);
  const myMpos=mpos.filter(m=>m.client===clientName);
  const tB=myRec.reduce((a,r)=>a+r.amount,0),tPd=myRec.reduce((a,r)=>a+r.paid,0);
  const [tab,setTab]=useState("overview");
  return(
    <div className="portal-wrap">
      <div className="portal-topbar"><div style={{display:"flex",alignItems:"center",gap:10}}><div className="logo-mark">MH</div><span style={{fontWeight:700,fontSize:15}}>MediaHub</span><span style={{color:"#aaa",fontSize:12}}>Client Portal</span></div><div style={{display:"flex",gap:8,alignItems:"center"}}><div style={{fontSize:12,color:"#666"}}>{user.name}</div><button className="btn btn-sm btn-ghost" onClick={onLogout}>Sign out</button></div></div>
      <div className="portal-content">
        <div className="portal-welcome"><div style={{fontSize:13,opacity:.8,marginBottom:4}}>Welcome back 👋</div><div style={{fontSize:22,fontWeight:700,marginBottom:4}}>{clientName}</div><div style={{fontSize:13,opacity:.8}}>{new Date().toLocaleDateString("en-NG",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div></div>
        <div className="stat-grid" style={{gridTemplateColumns:"repeat(3,1fr)"}}>
          <div className="portal-card"><div className="stat-label">Active Campaigns</div><div className="stat-value">{myMpos.filter(m=>m.status==="active").length}</div></div>
          <div className="portal-card"><div className="stat-label">Outstanding</div><div className="stat-value" style={{color:"#A32D2D"}}>{fmtK(tB-tPd)}</div></div>
          <div className="portal-card"><div className="stat-label">Total Paid</div><div className="stat-value" style={{color:"#3B6D11"}}>{fmtK(tPd)}</div></div>
        </div>
        <div className="tabs">{["overview","campaigns","invoices"].map(t=><button key={t} className={`tab ${tab===t?"active":""}`} onClick={()=>setTab(t)}>{t}</button>)}</div>
        {tab==="overview"&&<div className="portal-card"><div className="card-header"><span className="card-title">Payment Summary</span></div><div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#666",marginBottom:4}}><span>Progress</span><span>{tB>0?Math.round(tPd/tB*100):0}%</span></div><div className="progress-bar" style={{height:10}}><div className="progress-fill" style={{width:tB>0?`${Math.round(tPd/tB*100)}%`:"0%"}}/></div><div style={{display:"flex",justifyContent:"space-between",marginTop:16,fontSize:12}}><div><div style={{color:"#999"}}>Billed</div><div style={{fontWeight:600}}>{fmt(tB)}</div></div><div style={{textAlign:"center"}}><div style={{color:"#999"}}>Paid</div><div style={{fontWeight:600,color:"#3B6D11"}}>{fmt(tPd)}</div></div><div style={{textAlign:"right"}}><div style={{color:"#999"}}>Balance</div><div style={{fontWeight:600,color:"#A32D2D"}}>{fmt(tB-tPd)}</div></div></div></div>}
        {tab==="campaigns"&&<div className="portal-card"><div className="card-header"><span className="card-title">Campaigns</span></div>{myMpos.map(m=><div key={m.id} style={{padding:"12px 0",borderBottom:"0.5px solid #eee",display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}><div><div style={{fontWeight:500,fontSize:13}}>{m.campaign}</div><div style={{fontSize:11,color:"#888"}}>{m.start}→{m.end} · {m.vendor}</div></div><div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{fontWeight:600}}>{fmt(m.amount)}</span><SBadge s={m.status}/></div></div>)}</div>}
        {tab==="invoices"&&<div className="portal-card"><div className="card-header"><span className="card-title">Invoices</span></div><div style={{overflowX:"auto"}}><table style={{minWidth:400}}><thead><tr><th>Invoice</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Due</th><th>Status</th></tr></thead><tbody>{myRec.map(r=><tr key={r.id}><td style={{fontFamily:"monospace",fontWeight:500}}>{r.id}</td><td>{fmt(r.amount)}</td><td style={{color:"#3B6D11"}}>{fmt(r.paid)}</td><td style={{color:r.amount-r.paid>0?"#A32D2D":"#3B6D11",fontWeight:500}}>{fmt(r.amount-r.paid)}</td><td style={{fontSize:12,color:r.status==="overdue"?"#A32D2D":"inherit"}}>{r.due}</td><td><SBadge s={r.status}/></td></tr>)}</tbody></table></div></div>}
      </div>
    </div>
  );
}

/* ═══ GLOBAL SEARCH ═══ */
function GlobalSearch({mpos,clients,receivables,payables,onNavigate,onClose}){
  const [q,setQ]=useState("");const ref=useRef(null);
  useEffect(()=>{ref.current?.focus();},[]);
  useEffect(()=>{const h=e=>e.key==="Escape"&&onClose();document.addEventListener("keydown",h);return()=>document.removeEventListener("keydown",h);},[onClose]);
  const lR=receivables.map(r=>({...r,status:computeStatus(r)}));
  const results=useMemo(()=>{if(q.trim().length<2)return null;const lq=q.toLowerCase();return{mpos:mpos.filter(m=>`${m.id}${m.client}${m.campaign}`.toLowerCase().includes(lq)).slice(0,5),clients:clients.filter(c=>`${c.name}${c.contact}`.toLowerCase().includes(lq)).slice(0,4),invoices:lR.filter(r=>`${r.id}${r.client}`.toLowerCase().includes(lq)).slice(0,4)};},[q,mpos,clients,receivables]);
  const total=results?Object.values(results).reduce((a,v)=>a+v.length,0):0;
  const go=page=>{onNavigate(page);onClose();};
  return(
    <div className="gsearch-bg" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="gsearch-box">
        <div className="gsearch-input-wrap"><span style={{fontSize:18,color:"var(--text3)"}}>⌕</span><input ref={ref} className="gsearch-input" placeholder="Search MPOs, clients, invoices…" value={q} onChange={e=>setQ(e.target.value)}/><button className="btn btn-sm btn-ghost" onClick={onClose}>Esc</button></div>
        <div className="gsearch-results">
          {!results&&<div style={{padding:"16px 20px",fontSize:12,color:"var(--text3)",textAlign:"center"}}>Type at least 2 characters to search</div>}
          {results&&total===0&&<div style={{padding:"16px 20px",fontSize:12,color:"var(--text3)",textAlign:"center"}}>No results for "{q}"</div>}
          {results?.mpos?.length>0&&(<div style={{padding:"8px 0",borderBottom:"var(--border)"}}><div className="gsearch-section-label">MPOs</div>{results.mpos.map(m=><div key={m.id} className="gsearch-item" onClick={()=>go("mpo")}><div className="gsearch-icon" style={{background:"var(--brand-light)"}}>◈</div><div style={{flex:1}}><div style={{fontWeight:500,fontSize:13}}>{m.id} — {m.campaign}</div><div style={{fontSize:11,color:"var(--text3)"}}>{m.client} · {fmtK(m.amount)}</div></div><SBadge s={m.status}/></div>)}</div>)}
          {results?.clients?.length>0&&(<div style={{padding:"8px 0",borderBottom:"var(--border)"}}><div className="gsearch-section-label">Clients</div>{results.clients.map(c=><div key={c.id} className="gsearch-item" onClick={()=>go("clients")}><div className="gsearch-icon" style={{background:"#EEEDFE",fontSize:11,fontWeight:700,color:"#3C3489"}}>{c.name.slice(0,2)}</div><div style={{flex:1}}><div style={{fontWeight:500,fontSize:13}}>{c.name}</div><div style={{fontSize:11,color:"var(--text3)"}}>{c.industry}</div></div><span className={`badge ${c.type==="Client"?"badge-purple":"badge-blue"}`}>{c.type}</span></div>)}</div>)}
          {results?.invoices?.length>0&&(<div style={{padding:"8px 0"}}><div className="gsearch-section-label">Invoices</div>{results.invoices.map(r=><div key={r.id} className="gsearch-item" onClick={()=>go("finance")}><div className="gsearch-icon" style={{background:"#EAF3DE"}}>💰</div><div style={{flex:1}}><div style={{fontWeight:500,fontSize:13}}>{r.id} — {r.client}</div><div style={{fontSize:11,color:"var(--text3)"}}>{fmtK(r.amount)} · Due {r.due}</div></div><SBadge s={r.status}/></div>)}</div>)}
        </div>
        <div style={{padding:"10px 20px",borderTop:"var(--border)",display:"flex",gap:16,fontSize:11,color:"var(--text3)"}}><span>↵ navigate</span><span>Esc close</span>{total>0&&<span style={{marginLeft:"auto"}}>{total} result{total!==1?"s":""}</span>}</div>
      </div>
    </div>
  );
}

// LoginScreen removed — replaced by AuthScreen (Supabase email+password auth)

/* ══════════════════════════════════════════════════
   S6-3: MULTI-AGENCY WORKSPACES
══════════════════════════════════════════════════ */
const WORKSPACES = [
  { id:"ws1", name:"MediaHub Nigeria",   abbr:"MH", color:"#534AB7", plan:"Pro",    country:"🇳🇬", tagline:"Your primary workspace", mpos:6, clients:6, users:3 },
  { id:"ws2", name:"PanAfrica Media",    abbr:"PA", color:"#185FA5", plan:"Starter",country:"🇬🇭", tagline:"Ghana & West Africa campaigns", mpos:3, clients:4, users:2 },
  { id:"ws3", name:"East Africa Bureau", abbr:"EA", color:"#3B6D11", plan:"Starter",country:"🇰🇪", tagline:"Kenya, Uganda, Tanzania accounts", mpos:2, clients:3, users:2 },
];

function AgencySwitcher({ current, onSwitch, onClose, currentUserId }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(null);

  useEffect(()=>{
    supabase.from("workspaces").select("id,name,brand_color,plan")
      .then(({data})=>{ if(data) setWorkspaces(data); setLoading(false); });
  },[]);

  const switchTo = async(ws) => {
    if(ws.id === current) { onClose(); return; }
    setSwitching(ws.id);
    await supabase.from("profiles").update({workspace_id: ws.id}).eq("id", currentUserId);
    const abbr = ws.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
    onSwitch({ id:ws.id, name:ws.name, color:ws.brand_color||"#534AB7", abbr, plan:ws.plan });
    onClose();
    window.location.reload(); // reload so all table hooks re-fetch for new workspace
  };

  return (
    <div className="agency-switcher-bg" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="agency-switcher">
        <div className="agency-switcher-header">
          <div style={{fontWeight:700,fontSize:16,color:"var(--text)"}}>Switch Workspace</div>
          <div style={{fontSize:12,color:"var(--text3)",marginTop:3}}>Each workspace has isolated data, branding & users</div>
        </div>
        {loading
          ? <div style={{padding:"24px",textAlign:"center",color:"var(--text3)",fontSize:12}}>Loading workspaces…</div>
          : workspaces.map(ws=>{
              const abbr=ws.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
              const isCurrent=ws.id===current;
              return(
                <div key={ws.id} className={`agency-card ${isCurrent?"active":""}`}
                  onClick={()=>switchTo(ws)}
                  style={{opacity:switching&&switching!==ws.id?0.5:1}}>
                  <div className="agency-logo" style={{background:ws.brand_color||"#534AB7"}}>{abbr}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                      <span style={{fontWeight:600,fontSize:14,color:"var(--text)"}}>{ws.name}</span>
                      {isCurrent&&<span className="agency-badge">● Current</span>}
                    </div>
                    <div style={{display:"flex",gap:8,marginTop:4}}>
                      <span className={`badge ${ws.plan==="pro"?"badge-purple":"badge-blue"}`} style={{fontSize:9,padding:"1px 6px",textTransform:"capitalize"}}>{ws.plan||"free"}</span>
                    </div>
                  </div>
                  {switching===ws.id
                    ? <span style={{fontSize:12,color:"var(--text3)"}}>…</span>
                    : isCurrent
                      ? <span style={{fontSize:18,color:"var(--brand)"}}>✓</span>
                      : <span style={{fontSize:12,color:"var(--text3)"}}>Switch →</span>}
                </div>
              );
            })
        }
        <div style={{padding:"12px 20px",borderTop:"var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:11,color:"var(--text3)"}}>Workspaces are isolated — switching reloads the app</span>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   S6-1: COLLABORATION — COMMENTS & ACTIVITY FEED
══════════════════════════════════════════════════ */
const TEAM_NAMES = ["Amaka","Bolu","Chidi"];

function parseMentions(text) {
  // Replace @Name with styled span
  return text.split(/(@\w+)/g).map((part,i) =>
    part.startsWith("@")
      ? <span key={i} className="mention">{part}</span>
      : part
  );
}

function CommentsPanel({ entityId, entityLabel, comments, currentUser, onAddComment, onClose }) {
  const [text, setText] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const listRef = useRef(null);

  const entityComments = (comments[entityId] || []);

  useEffect(() => {
    if(listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [entityComments.length]);

  const handleInput = e => {
    const val = e.target.value;
    setText(val);
    const atIdx = val.lastIndexOf("@");
    if(atIdx >= 0 && atIdx === val.length - 1) { setShowMentions(true); setMentionFilter(""); }
    else if(atIdx >= 0 && !val.slice(atIdx+1).includes(" ")) { setShowMentions(true); setMentionFilter(val.slice(atIdx+1)); }
    else { setShowMentions(false); }
  };

  const insertMention = name => {
    const atIdx = text.lastIndexOf("@");
    setText(text.slice(0, atIdx) + "@" + name + " ");
    setShowMentions(false);
  };

  const submit = () => {
    if(!text.trim()) return;
    onAddComment(entityId, {
      id: `c${Date.now()}`,
      userId: currentUser.id,
      userName: currentUser.name,
      initials: currentUser.initials,
      color: currentUser.color,
      text: text.trim(),
      ts: tsNow(),
    });
    setText("");
  };

  const filteredMentions = TEAM_NAMES.filter(n =>
    n.toLowerCase().startsWith(mentionFilter.toLowerCase()) && n !== currentUser.name.split(" ")[0]
  );

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <div style={{fontWeight:600,fontSize:14,marginBottom:4,color:"var(--text)"}}>💬 {entityLabel}</div>
      <div style={{fontSize:11,color:"var(--text3)",marginBottom:14}}>{entityComments.length} comment{entityComments.length!==1?"s":""} · Type @Name to mention a teammate</div>
      <div ref={listRef} style={{flex:1,overflowY:"auto",minHeight:120,maxHeight:320}}>
        {entityComments.length===0 && (
          <div style={{textAlign:"center",padding:"28px 0",color:"var(--text3)",fontSize:12}}>
            <div style={{fontSize:28,marginBottom:8}}>💬</div>
            No comments yet. Start the conversation.
          </div>
        )}
        {entityComments.map(c=>(
          <div key={c.id} className="comment-item" style={{flexDirection:c.userId===currentUser.id?"row-reverse":"row"}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:c.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff",flexShrink:0}}>{c.initials}</div>
            <div style={{flex:1,maxWidth:"85%"}}>
              <div className={`comment-bubble ${c.userId===currentUser.id?"own":""}`}>
                {parseMentions(c.text)}
              </div>
              <div className="comment-meta" style={{textAlign:c.userId===currentUser.id?"right":"left"}}>{c.userName.split(" ")[0]} · {c.ts}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{position:"relative",paddingTop:12,borderTop:"var(--border)",marginTop:8}}>
        {showMentions && filteredMentions.length > 0 && (
          <div className="mention-list">
            {filteredMentions.map(n=>(
              <div key={n} className="mention-opt" onClick={()=>insertMention(n)}>
                <div style={{width:24,height:24,borderRadius:"50%",background:"var(--brand)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:10,fontWeight:700}}>{n[0]}</div>
                <span>@{n}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
          <textarea
            className="comment-input"
            placeholder="Add a comment… (@mention to notify)"
            value={text}
            onChange={handleInput}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();submit();}}}
            rows={1}
          />
          <button className="btn btn-primary btn-sm" onClick={submit} disabled={!text.trim()} style={{flexShrink:0,height:38}}>Post</button>
        </div>
        <div style={{fontSize:10,color:"var(--text3)",marginTop:4}}>Enter to post · Shift+Enter for new line</div>
      </div>
    </div>
  );
}

/* Activity feed page */
function ActivityFeedPage({ comments, mpos, receivables, auditLog, currentUser }) {
  const [filter, setFilter] = useState("all");

  // Flatten all comments into a feed
  const commentFeed = Object.entries(comments).flatMap(([entityId, list]) =>
    list.map(c => ({ ...c, type:"comment", entityId, sortTs: c.id }))
  );
  // Merge with recent audit entries (last 20)
  const auditFeed = auditLog.slice(0,20).map(a => ({ ...a, type:"audit", sortTs: a.id }));
  const feed = [...commentFeed, ...auditFeed].sort((a,b) => b.sortTs.localeCompare(a.sortTs));
  const filtered = filter==="all" ? feed : feed.filter(f=>f.type===filter);

  const entityLabel = id => {
    const mpo = mpos.find(m=>m.id===id);
    if(mpo) return `MPO ${id} — ${mpo.campaign}`;
    const rec = receivables.find(r=>r.id===id);
    if(rec) return `Invoice ${id} — ${rec.client}`;
    return id;
  };

  return (
    <div>
      <div style={{marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontWeight:500,fontSize:15}}>Activity Feed</div>
          <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>All comments and actions across your workspace</div>
        </div>
      </div>
      <div className="tabs">
        {["all","comment","audit"].map(t=><button key={t} className={`tab ${filter===t?"active":""}`} onClick={()=>setFilter(t)}>{t==="all"?"All":t==="comment"?"Comments":"System Events"}</button>)}
      </div>
      <div className="card">
        {filtered.length===0 && <div style={{textAlign:"center",padding:32,color:"var(--text3)"}}>No activity yet</div>}
        {filtered.map((item,i)=>(
          <div key={i} className="activity-feed-item">
            <div className="af-avatar" style={{background:item.userColor||item.color||"#999"}}>{item.initials}</div>
            <div style={{flex:1}}>
              {item.type==="comment" ? (
                <>
                  <span style={{fontWeight:500}}>{item.userName?.split(" ")[0]}</span>
                  <span style={{color:"var(--text2)"}}> commented on </span>
                  <span className="feed-badge" style={{background:"var(--brand-light)",color:"var(--brand)"}}>{item.entityId}</span>
                  <div style={{marginTop:4,fontSize:12,color:"var(--text)",background:"var(--bg3)",padding:"6px 10px",borderRadius:6,display:"inline-block",maxWidth:"100%"}}>{parseMentions(item.text)}</div>
                </>
              ) : (
                <>
                  <span style={{fontWeight:500}}>{item.userName?.split(" ")[0]}</span>
                  <span style={{color:"var(--text2)"}}> {item.action} </span>
                  <span className="feed-badge" style={{background:TAG_COLORS[item.tag]||"#eee",color:TAG_TEXT[item.tag]||"#555"}}>{item.entityId}</span>
                  <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{item.detail}</div>
                </>
              )}
              <div style={{fontSize:10,color:"var(--text3)",marginTop:3}}>{item.ts}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   S6-2: PWA — SERVICE WORKER + MANIFEST + INSTALL
══════════════════════════════════════════════════ */
function usePWA() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    // Offline detection
    const goOffline = () => setIsOffline(true);
    const goOnline  = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online",  goOnline);

    // Capture install prompt
    const handler = e => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);

    // Already installed?
    if(window.matchMedia("(display-mode: standalone)").matches) setIsInstalled(true);

    // Service worker is registered by vite-plugin-pwa (Workbox) at build time.
    // No inline blob SW needed here.

    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const install = async () => {
    if(!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if(outcome === "accepted") setIsInstalled(true);
    setInstallPrompt(null);
  };

  return { installPrompt, isInstalled, isOffline, install };
}

/* ══════════════════════════════════════════════════
   S7-1: BUDGET MANAGEMENT
══════════════════════════════════════════════════ */
function variantForPct(pct) {
  if(pct > 100) return {cls:"variance-over",  label:"Over budget",  barColor:"#A32D2D"};
  if(pct >= 85) return {cls:"variance-near",  label:"Near limit",   barColor:"#F5A050"};
  return            {cls:"variance-under", label:"On track",    barColor:"#3B6D11"};
}

function BudgetCard({budget, mpos, payables}) {
  const mpo = mpos.find(m => m.id === budget.mpoId);
  const spent = payables.filter(p => p.mpo === budget.mpoId).reduce((a,p) => a+p.paid, 0);
  const pct = budget.budget > 0 ? Math.round(spent / budget.budget * 100) : 0;
  const remaining = budget.budget - spent;
  const v = variantForPct(pct);
  const fillColor = v.barColor;
  return (
    <div className={`budget-card ${pct>100?"over-budget":pct<85?"on-track":""}`}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8,flexWrap:"wrap",gap:6}}>
        <div>
          <div style={{fontWeight:600,fontSize:13,color:"var(--text)"}}>{budget.label}</div>
          <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{mpo?.channel||"—"} · {mpo?.start||""} → {mpo?.end||""}</div>
        </div>
        <span className={`variance-badge ${v.cls}`}>{pct>100?"▲":"●"} {v.label}</span>
      </div>
      <div className="budget-bar-wrap">
        <div className="budget-bar-fill" style={{width:`${Math.min(pct,100)}%`, background:fillColor}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--text3)",marginBottom:10}}>
        <span>{pct}% spent</span>
        <span>Alert at {budget.alertPct}%</span>
      </div>
      <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
        {[
          {l:"Budget",v:fmtK(budget.budget)},
          {l:"Spent",v:fmtK(spent),col:pct>100?"#A32D2D":"var(--text)"},
          {l:"Remaining",v:fmtK(Math.abs(remaining)),col:remaining<0?"#A32D2D":"#3B6D11"},
          {l:"Utilisation",v:`${pct}%`},
        ].map(s=>(
          <div key={s.l} style={{minWidth:70}}>
            <div style={{fontSize:10,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".4px"}}>{s.l}</div>
            <div style={{fontSize:14,fontWeight:600,color:s.col||"var(--text)",marginTop:2}}>{s.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BudgetsPage({budgets,setBudgets,mpos,payables,toast,user,addAudit}) {
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({mpoId:"",budget:"",alertPct:80});
  const [errs,setErrs]=useState({});
  const canEdit = user.permissions.includes("mpo");

  // Compute global alerts
  const overBudget = budgets.filter(b => {
    const spent = payables.filter(p=>p.mpo===b.mpoId).reduce((a,p)=>a+p.paid,0);
    return spent > b.budget;
  });
  const nearLimit = budgets.filter(b => {
    const spent = payables.filter(p=>p.mpo===b.mpoId).reduce((a,p)=>a+p.paid,0);
    const pct = b.budget>0?spent/b.budget*100:0;
    return pct>=b.alertPct && pct<=100;
  });

  const totalBudget = budgets.reduce((a,b)=>a+b.budget,0);
  const totalSpent  = budgets.reduce((a,b)=>{
    const spent=payables.filter(p=>p.mpo===b.mpoId).reduce((s,p)=>s+p.paid,0);
    return a+spent;
  },0);
  const totalPct = totalBudget>0?Math.round(totalSpent/totalBudget*100):0;

  const val=()=>{const e={};if(!form.mpoId)e.mpoId="Required";if(!form.budget||isNaN(form.budget)||Number(form.budget)<=0)e.budget="Required";setErrs(e);return!Object.keys(e).length;};
  const save=()=>{
    if(!val())return;
    const mpo=mpos.find(m=>m.id===form.mpoId);
    const newB={id:`B${String(Date.now()).slice(-6)}`,mpoId:form.mpoId,label:`${mpo?.campaign||form.mpoId} — ${mpo?.client||""}`,budget:Number(form.budget),alertPct:Number(form.alertPct)||80};
    setBudgets(p=>[...p.filter(b=>b.mpoId!==form.mpoId),newB]);
    addAudit("set budget","Budget",newB.id,`Set ${fmtK(Number(form.budget))} budget for ${form.mpoId}`,"create");
    toast("Budget saved");setShowForm(false);setForm({mpoId:"",budget:"",alertPct:80});
  };
  const delBudget=id=>{if(!confirm("Remove budget?"))return;setBudgets(p=>p.filter(b=>b.id!==id));toast("Budget removed","error");};

  return (
    <div>
      {showForm&&(
        <div className="modal-bg" onClick={e=>e.target===e.currentTarget&&setShowForm(false)}>
          <div className="modal">
            <div className="modal-header"><span className="modal-title">Set Campaign Budget</span><button className="close-btn" onClick={()=>setShowForm(false)}>✕</button></div>
            <div className="form-row"><label className="form-label">MPO / Campaign</label>
              <select className={`form-input ${errs.mpoId?"error":""}`} value={form.mpoId} onChange={e=>setForm(f=>({...f,mpoId:e.target.value}))}>
                <option value="">— Select MPO —</option>
                {mpos.map(m=><option key={m.id} value={m.id}>{m.id} · {m.campaign} ({m.client})</option>)}
              </select>
              {errs.mpoId&&<div className="form-error">{errs.mpoId}</div>}
            </div>
            <div className="form-grid">
              <div className="form-row"><label className="form-label">Budget Amount (₦)</label>
                <input type="number" min="0" className={`form-input ${errs.budget?"error":""}`} value={form.budget} onChange={e=>setForm(f=>({...f,budget:e.target.value}))}/>
                {errs.budget&&<div className="form-error">{errs.budget}</div>}
              </div>
              <div className="form-row"><label className="form-label">Alert threshold (%)</label>
                <input type="number" min="1" max="100" className="form-input" value={form.alertPct} onChange={e=>setForm(f=>({...f,alertPct:e.target.value}))}/>
              </div>
            </div>
            {form.budget&&!isNaN(form.budget)&&<p style={{fontSize:12,color:"var(--text3)",marginBottom:12}}>Budget: {fmtK(Number(form.budget))} · Alert at {form.alertPct}% = {fmtK(Number(form.budget)*Number(form.alertPct)/100)}</p>}
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:8}}><button className="btn" onClick={()=>setShowForm(false)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save Budget</button></div>
          </div>
        </div>
      )}

      {overBudget.length>0&&(
        <div className="budget-alert-banner">
          <span style={{fontSize:16}}>⚠</span>
          <span><strong>{overBudget.length} campaign{overBudget.length!==1?"s":""} over budget:</strong> {overBudget.map(b=>b.label.split("—")[0].trim()).join(", ")}</span>
        </div>
      )}
      {nearLimit.length>0&&(
        <div style={{background:"#FAEEDA",border:"0.5px solid #F5C97A",borderRadius:"var(--radius-md)",padding:"10px 14px",display:"flex",alignItems:"center",gap:10,fontSize:12,color:"#854F0B",marginBottom:12}}>
          <span style={{fontSize:16}}>◉</span>
          <span><strong>{nearLimit.length} campaign{nearLimit.length!==1?"s":""} near limit:</strong> {nearLimit.map(b=>b.label.split("—")[0].trim()).join(", ")}</span>
        </div>
      )}

      <div className="stat-grid" style={{gridTemplateColumns:"repeat(4,1fr)",marginBottom:20}}>
        {[
          {l:"Total Budget",v:fmtK(totalBudget)},
          {l:"Total Spent",v:fmtK(totalSpent),col:totalPct>100?"#A32D2D":"var(--text)"},
          {l:"Remaining",v:fmtK(Math.abs(totalBudget-totalSpent)),col:totalBudget-totalSpent<0?"#A32D2D":"#3B6D11"},
          {l:"Utilisation",v:`${totalPct}%`,col:totalPct>100?"#A32D2D":totalPct>=85?"#854F0B":"#3B6D11"},
        ].map(s=><div key={s.l} className="stat-card"><div className="stat-label">{s.l}</div><div className="stat-value" style={{color:s.col||"var(--text)"}}>{s.v}</div></div>)}
      </div>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div style={{fontWeight:500,fontSize:14}}>{budgets.length} campaign budgets</div>
        {canEdit&&<button className="btn btn-primary" onClick={()=>setShowForm(true)}>+ Set Budget</button>}
      </div>

      {budgets.length===0&&(
        <div className="card" style={{textAlign:"center",padding:48,color:"var(--text3)"}}>
          <div style={{fontSize:40,marginBottom:12}}>📊</div>
          <div style={{fontWeight:500,marginBottom:4}}>No budgets set yet</div>
          <div style={{fontSize:12,marginBottom:16}}>Assign budgets to campaigns to track spend and get alerts</div>
          {canEdit&&<button className="btn btn-primary" onClick={()=>setShowForm(true)}>Set first budget</button>}
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:14}}>
        {budgets.map(b=>(
          <div key={b.id} style={{position:"relative"}}>
            <BudgetCard budget={b} mpos={mpos} payables={payables}/>
            {canEdit&&<button className="btn btn-sm btn-ghost" style={{position:"absolute",top:14,right:14,color:"var(--text3)",fontSize:11}} onClick={()=>delBudget(b.id)}>✕</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   S7-2: CLIENT ONBOARDING WIZARD
══════════════════════════════════════════════════ */
const WIZARD_STEPS = [
  {id:"client",  label:"Client"},
  {id:"campaign",label:"Campaign"},
  {id:"invoice", label:"Invoice"},
  {id:"review",  label:"Review"},
  {id:"done",    label:"Launch"},
];

function OnboardingWizard({onClose, onComplete, clients, mpos, settings, currentUser}) {
  const [step,setStep]=useState(0);
  const [launched,setLaunched]=useState(false);
  const dCcy = settings.defaultCurrency||"NGN";

  const [clientData,setClientData]=useState({name:"",industry:"",contact:"",email:"",phone:""});
  const [campaignData,setCampaignData]=useState({campaign:"",vendor:"",channel:"TV",amount:"",start:"",end:"",currency:dCcy});
  const [invoiceData,setInvoiceData]=useState({amount:"",due:"",sendNow:true});
  const [errs,setErrs]=useState({});

  const setC = (field,val) => setClientData(p=>({...p,[field]:val}));
  const setCamp = (field,val) => setCampaignData(p=>({...p,[field]:val}));
  const setInv = (field,val) => setInvoiceData(p=>({...p,[field]:val}));

  const validateStep = () => {
    const e={};
    if(step===0){if(!clientData.name.trim())e.name="Client name required";if(clientData.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientData.email))e.email="Invalid email";}
    if(step===1){if(!campaignData.campaign.trim())e.campaign="Campaign name required";if(!campaignData.vendor.trim())e.vendor="Vendor required";if(!campaignData.amount||isNaN(campaignData.amount)||Number(campaignData.amount)<=0)e.amount="Amount required";if(campaignData.start&&campaignData.end&&campaignData.start>campaignData.end)e.end="End must be after start";}
    if(step===2){if(invoiceData.amount&&(isNaN(invoiceData.amount)||Number(invoiceData.amount)<=0))e.invAmount="Invalid amount";}
    setErrs(e);
    return Object.keys(e).length===0;
  };

  const next=()=>{ if(validateStep()) setStep(s=>Math.min(s+1,4)); };
  const back=()=>{ setErrs({}); setStep(s=>Math.max(s-1,0)); };

  const launch=()=>{
    const newClientId = "C"+String(Math.max(0,...clients.filter(c=>c.id.startsWith("C")).map(c=>parseInt(c.id.slice(1))||0))+1).padStart(3,"0");
    const newMpoId = "MPO-"+String(Math.max(0,...mpos.map(m=>parseInt(m.id.replace("MPO-",""))||0))+1).padStart(3,"0");
    const newInvId = "INV-"+String(Date.now()).slice(-4);
    onComplete({
      client:{id:newClientId,...clientData,type:"Client",spend:Number(campaignData.amount)||0,status:"active"},
      mpo:{id:newMpoId,client:clientData.name,vendor:campaignData.vendor,campaign:campaignData.campaign,amount:Number(campaignData.amount),status:"active",start:campaignData.start||new Date().toISOString().slice(0,10),end:campaignData.end||"",exec:"on-track",channel:campaignData.channel,currency:campaignData.currency,docs:[]},
      invoice: invoiceData.amount ? {id:newInvId,client:clientData.name,mpo:newMpoId,amount:Number(invoiceData.amount),due:invoiceData.due||new Date(Date.now()+30*864e5).toISOString().slice(0,10),paid:0,wfStatus:"draft",currency:campaignData.currency,docs:[]} : null,
    });
    setLaunched(true);
    setStep(4);
  };

  const StepDots=()=>(
    <div className="wizard-steps">
      {WIZARD_STEPS.slice(0,4).map((s,i)=>(
        <Fragment key={s.id}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
            <div className={`wizard-step-dot ${i<step?"done":i===step?"active":"pending"}`}>{i<step?"✓":i+1}</div>
            <span style={{fontSize:9,color:i<=step?"var(--brand)":"var(--text3)",fontWeight:i===step?600:400}}>{s.label}</span>
          </div>
          {i<3&&<div className={`wizard-step-line ${i<step?"done":""}`}/>}
        </Fragment>
      ))}
    </div>
  );

  return (
    <div className="wizard-bg" onClick={e=>e.target===e.currentTarget&&!launched&&onClose()}>
      <div className="wizard">
        {!launched ? (
          <>
            <div className="wizard-header">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <div style={{fontWeight:700,fontSize:17,color:"var(--text)"}}>✦ Client Onboarding</div>
                <button className="close-btn" onClick={onClose}>✕</button>
              </div>
              <StepDots/>
            </div>
            <div className="wizard-body">

              {/* Step 0: Client details */}
              {step===0&&(
                <div>
                  <div className="wizard-section-title">Tell us about the client</div>
                  <div className="wizard-section-sub">Basic details — you can always update these later</div>
                  <div className="form-row"><label className="form-label">Company Name *</label><input className={`form-input ${errs.name?"error":""}`} value={clientData.name} onChange={e=>setC("name",e.target.value)} placeholder="e.g. Zenith Bank"/>{errs.name&&<div className="form-error">{errs.name}</div>}</div>
                  <div className="form-grid">
                    <div className="form-row"><label className="form-label">Industry</label><input className="form-input" value={clientData.industry} onChange={e=>setC("industry",e.target.value)} placeholder="Banking, Telecom…"/></div>
                    <div className="form-row"><label className="form-label">Contact Name</label><input className="form-input" value={clientData.contact} onChange={e=>setC("contact",e.target.value)} placeholder="Full name"/></div>
                  </div>
                  <div className="form-grid">
                    <div className="form-row"><label className="form-label">Email</label><input type="email" className={`form-input ${errs.email?"error":""}`} value={clientData.email} onChange={e=>setC("email",e.target.value)} placeholder="contact@company.com"/>{errs.email&&<div className="form-error">{errs.email}</div>}</div>
                    <div className="form-row"><label className="form-label">Phone</label><input className="form-input" value={clientData.phone} onChange={e=>setC("phone",e.target.value)} placeholder="+234 …"/></div>
                  </div>
                </div>
              )}

              {/* Step 1: Campaign */}
              {step===1&&(
                <div>
                  <div className="wizard-section-title">Set up the first campaign</div>
                  <div className="wizard-section-sub">Create an MPO for {clientData.name||"this client"}</div>
                  <div className="form-row"><label className="form-label">Campaign Name *</label><input className={`form-input ${errs.campaign?"error":""}`} value={campaignData.campaign} onChange={e=>setCamp("campaign",e.target.value)} placeholder="e.g. Q3 Brand Launch"/>{errs.campaign&&<div className="form-error">{errs.campaign}</div>}</div>
                  <div className="form-grid">
                    <div className="form-row"><label className="form-label">Vendor / Media House *</label><input className={`form-input ${errs.vendor?"error":""}`} value={campaignData.vendor} onChange={e=>setCamp("vendor",e.target.value)} placeholder="Channels TV…"/>{errs.vendor&&<div className="form-error">{errs.vendor}</div>}</div>
                    <div className="form-row"><label className="form-label">Channel</label><select className="form-input" value={campaignData.channel} onChange={e=>setCamp("channel",e.target.value)}><option>TV</option><option>Print</option><option>Radio</option><option>Digital</option></select></div>
                  </div>
                  <div className="form-grid">
                    <div className="form-row"><label className="form-label">Campaign Value *</label><input type="number" min="0" className={`form-input ${errs.amount?"error":""}`} value={campaignData.amount} onChange={e=>setCamp("amount",e.target.value)}/>{errs.amount&&<div className="form-error">{errs.amount}</div>}</div>
                    <div className="form-row"><label className="form-label">Currency</label><select className="form-input" value={campaignData.currency} onChange={e=>setCamp("currency",e.target.value)}>{Object.entries(CURRENCIES).map(([k,v])=><option key={k} value={k}>{v.flag} {k}</option>)}</select></div>
                  </div>
                  <div className="form-grid">
                    <div className="form-row"><label className="form-label">Start Date</label><input type="date" className="form-input" value={campaignData.start} onChange={e=>setCamp("start",e.target.value)}/></div>
                    <div className="form-row"><label className="form-label">End Date</label><input type="date" className={`form-input ${errs.end?"error":""}`} value={campaignData.end} onChange={e=>setCamp("end",e.target.value)}/>{errs.end&&<div className="form-error">{errs.end}</div>}</div>
                  </div>
                  {campaignData.amount&&!isNaN(campaignData.amount)&&<p style={{fontSize:12,color:"var(--text3)"}}>Value: {fmtCcy(Number(campaignData.amount),campaignData.currency,"NGN")}</p>}
                </div>
              )}

              {/* Step 2: Invoice */}
              {step===2&&(
                <div>
                  <div className="wizard-section-title">Create an opening invoice</div>
                  <div className="wizard-section-sub">Optional — skip if billing comes later</div>
                  <div className="form-row" style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"var(--border)"}}>
                    <div><div style={{fontSize:13,fontWeight:500,color:"var(--text)"}}>Generate invoice now</div><div style={{fontSize:11,color:"var(--text3)"}}>Creates a Draft invoice linked to this campaign</div></div>
                    <div className="toggle-pill" style={{background:invoiceData.sendNow?"var(--brand)":"var(--bg3)"}} onClick={()=>setInv("sendNow",!invoiceData.sendNow)}>
                      <div className="toggle-thumb" style={{left:invoiceData.sendNow?20:3}}/>
                    </div>
                  </div>
                  {invoiceData.sendNow&&(
                    <div style={{marginTop:16}}>
                      <div className="form-grid">
                        <div className="form-row"><label className="form-label">Invoice Amount</label><input type="number" min="0" className={`form-input ${errs.invAmount?"error":""}`} value={invoiceData.amount} placeholder={campaignData.amount} onChange={e=>setInv("amount",e.target.value)}/>{errs.invAmount&&<div className="form-error">{errs.invAmount}</div>}<div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>Leave blank to use campaign value</div></div>
                        <div className="form-row"><label className="form-label">Due Date</label><input type="date" className="form-input" value={invoiceData.due} onChange={e=>setInv("due",e.target.value)}/></div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Review */}
              {step===3&&(
                <div>
                  <div className="wizard-section-title">Review before launching</div>
                  <div className="wizard-section-sub">Everything looks good? Hit Launch to create all records.</div>
                  <div style={{background:"var(--bg3)",borderRadius:"var(--radius-lg)",padding:"14px 16px",marginBottom:12}}>
                    <div style={{fontSize:11,color:"var(--brand)",fontWeight:700,textTransform:"uppercase",letterSpacing:".5px",marginBottom:10}}>Client</div>
                    {[["Name",clientData.name],["Industry",clientData.industry||"—"],["Contact",clientData.contact||"—"],["Email",clientData.email||"—"]].map(([l,v])=><div key={l} className="review-row"><span className="review-label">{l}</span><span className="review-value">{v}</span></div>)}
                  </div>
                  <div style={{background:"var(--bg3)",borderRadius:"var(--radius-lg)",padding:"14px 16px",marginBottom:12}}>
                    <div style={{fontSize:11,color:"var(--brand)",fontWeight:700,textTransform:"uppercase",letterSpacing:".5px",marginBottom:10}}>Campaign MPO</div>
                    {[["Campaign",campaignData.campaign],["Vendor",campaignData.vendor],["Channel",campaignData.channel],["Value",`${fmtCcy(Number(campaignData.amount)||0,campaignData.currency,"NGN")} (${campaignData.currency})`],["Period",`${campaignData.start||"TBD"} → ${campaignData.end||"TBD"}`]].map(([l,v])=><div key={l} className="review-row"><span className="review-label">{l}</span><span className="review-value">{v}</span></div>)}
                  </div>
                  {invoiceData.sendNow&&(
                    <div style={{background:"var(--bg3)",borderRadius:"var(--radius-lg)",padding:"14px 16px"}}>
                      <div style={{fontSize:11,color:"var(--brand)",fontWeight:700,textTransform:"uppercase",letterSpacing:".5px",marginBottom:10}}>Invoice (Draft)</div>
                      {[["Amount",fmtCcy(Number(invoiceData.amount||campaignData.amount)||0,campaignData.currency,"NGN")],["Due",invoiceData.due||"Net 30 from today"],["Status","Draft — advance to send"]].map(([l,v])=><div key={l} className="review-row"><span className="review-label">{l}</span><span className="review-value">{v}</span></div>)}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="wizard-footer">
              {step>0?<button className="btn btn-ghost" onClick={back}>← Back</button>:<button className="btn btn-ghost" onClick={onClose}>Cancel</button>}
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:11,color:"var(--text3)"}}>Step {step+1} of 4</span>
                {step<3
                  ? <button className="btn btn-primary" onClick={next}>Next →</button>
                  : <button className="btn btn-primary" style={{background:"#3B6D11",borderColor:"#3B6D11"}} onClick={launch}>🚀 Launch Client</button>
                }
              </div>
            </div>
          </>
        ) : (
          <div className="wizard-body">
            <div className="launch-success">
              <div className="launch-icon">🚀</div>
              <div style={{fontSize:20,fontWeight:700,color:"var(--text)",marginBottom:8}}>Client launched!</div>
              <div style={{fontSize:13,color:"var(--text3)",marginBottom:24}}>
                <strong>{clientData.name}</strong> is now live in MediaHub.
                {invoiceData.sendNow&&" Draft invoice created and ready to advance."}
              </div>
              <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
                <button className="btn btn-primary" onClick={onClose}>Go to Clients</button>
                <button className="btn" onClick={onClose}>Done</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   S7-3: PRODUCTION READINESS PAGE
══════════════════════════════════════════════════ */
function ProductionPage({user}) {
  return <RoleGuard user={user} require="settings"><ProductionContent/></RoleGuard>;
}
function ProductionContent() {
  const downloadReadme = () => {
    const md = `# MediaHub - Media Agency Management Platform

## Overview
MediaHub is a full-featured media agency management platform covering:
- Media Purchase Order (MPO) scheduling and tracking
- Client and vendor management
- Finance: receivables, payables, invoice workflows
- Multi-currency support (NGN, USD, GBP, EUR, GHS, KES)
- Campaign calendar and analytics
- Team collaboration with @mentions
- Multi-agency workspaces
- Budget management and variance alerts
- Client onboarding wizard
- PWA install prompts and offline awareness UI

## Current Stack
- React 18 + TypeScript
- Vite production build
- Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- CSS custom properties for theming
- Vercel-ready SPA deploy config

## Recommended Production Stack
\`\`\`
Frontend:   React 18 + TypeScript + Vite
Styling:    CSS custom properties (current) or Tailwind if desired
State:      React hooks + targeted data hooks
Backend:    Supabase (PostgreSQL + Auth + Realtime + Storage)
Deploy:     Vercel or Netlify (frontend) + Supabase (backend)
Auth:       Supabase Auth (email/password, magic link, OAuth)
PWA:        Vite PWA plugin (Workbox)
Files:      Supabase Storage signed URLs
AI:         Server-side proxy or Supabase Edge Function
\`\`\`

## Current Priorities
1. Add and deploy the AI Edge Function or API proxy
2. Wire \`vite-plugin-pwa\` into \`vite.config.ts\`
3. Add production CORS restrictions for API routes and functions
4. Split heavy bundles such as \`xlsx-js-style\`
5. Verify production environment variables in Vercel and Supabase

## Environment Variables
\`\`\`
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
# Server-side only:
ANTHROPIC_API_KEY=sk-ant-...
\`\`\`

## Database Schema (Supabase)
Tables: workspaces, profiles, clients, mpos, invoices, payables, budgets, comments, audit_log, notifications, documents

## Security Notes
- Never expose ANTHROPIC_API_KEY on the client; use an Edge Function or API route
- Keep Row Level Security (RLS) enabled on all multi-tenant tables
- Scope reads and writes by workspace_id for tenant isolation

---
Generated by MediaHub production readiness page | ${new Date().toLocaleDateString()}
`;
    const a = document.createElement("a");
    a.href = "data:text/markdown;charset=utf-8," + encodeURIComponent(md);
    a.download = "MEDIAHUB_README.md";
    a.click();
  };

  const checks = [
    {status:"done", title:"Component architecture", desc:"All UI is split into focused, reusable components with clear prop interfaces"},
    {status:"done", title:"Supabase-backed persistence", desc:"Core app data is loaded through Supabase tables instead of browser-only storage"},
    {status:"done", title:"Role-based access control", desc:"RoleGuard in the UI is backed by Supabase profiles, permissions, and workspace-aware queries"},
    {status:"done", title:"Authentication flow", desc:"Supabase Auth sign-in, sign-up, password reset, and invite-based onboarding are already wired"},
    {status:"done", title:"Workspace isolation model", desc:"Records carry workspace_id and the app scopes reads and writes to the active workspace"},
    {status:"done", title:"Vite + TypeScript build", desc:"The app builds successfully through Vite and TypeScript for production deployment"},
    {status:"warn", title:"AI backend still missing", desc:"There is no deployed ai-chat function or API proxy yet, so AI features are not production-ready"},
    {status:"warn", title:"PWA plugin not configured", desc:"Manifest and install UI exist, but vite-plugin-pwa is not yet wired into vite.config.ts"},
    {status:"warn", title:"Large production bundles", desc:"The current build emits oversized JS chunks, especially the xlsx export bundle, and needs code-splitting"},
    {status:"info", title:"RLS policies are in place", desc:"Supabase migrations already enable row level security for the main multi-tenant tables"},
    {status:"info", title:"Deployment config exists", desc:"The repo already includes a Vercel SPA config with rewrite and cache headers"},
    {status:"info", title:"Theme system is production-friendly", desc:"CSS custom properties already support consistent theming without a styling migration"},
  ];
  const iconMap = {done:"✓", warn:"!", info:"i"};
  const classMap = {done:"prod-check-done", warn:"prod-check-warn", info:"prod-check-info"};

  return (
    <div style={{maxWidth:720}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontWeight:600,fontSize:16,color:"var(--text)"}}>Production Readiness</div>
          <div style={{fontSize:12,color:"var(--text3)",marginTop:3}}>What's ready to ship vs what needs attention before going live</div>
        </div>
        <button className="btn btn-primary" onClick={downloadReadme}>↓ Download README.md</button>
      </div>

      <div className="prod-card">
        <div className="prod-section-title">✦ Recommended Production Stack</div>
        <div style={{marginBottom:12,flexWrap:"wrap",display:"flex",gap:6}}>
          {[
            {label:"React 18 + TypeScript",color:"#E6F1FB"},
            {label:"Vite",color:"#EAF3DE"},
            {label:"Supabase",color:"#E6F1FB"},
            {label:"CSS Tokens",color:"#EEEDFE"},
            {label:"Vercel",color:"#F1EFE8"},
            {label:"Vite PWA",color:"#EAF3DE"},
            {label:"Edge Functions",color:"#f0effe"},
          ].map(s=><span key={s.label} className="stack-chip" style={{background:s.color}}>{s.label}</span>)}
        </div>
        <div className="code-block">{`# Current production tasks
npm run build

# Backend
cd packages/supabase
npm run db:push
npm run functions:deploy

# Frontend
cd ../web
npm run build`}</div>
      </div>

      <div className="prod-card">
        <div className="prod-section-title">📋 Readiness Checklist</div>
        {checks.map((c,i)=>(
          <div key={i} className="prod-check">
            <div className={`prod-check-icon ${classMap[c.status]}`}>{iconMap[c.status]}</div>
            <div>
              <div style={{fontSize:13,fontWeight:500,color:"var(--text)"}}>{c.title}</div>
              <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{c.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="prod-card">
        <div className="prod-section-title">🗄️ Supabase Schema (copy-paste)</div>
        <div className="code-block">{`-- Core tables (add workspace_id FK to each)
create table workspaces (id uuid primary key, name text, brand_color text, plan text);
create table clients   (id uuid primary key, workspace_id uuid references workspaces, name text, type text, industry text, contact text, email text);
create table mpos      (id uuid primary key, workspace_id uuid references workspaces, client text, vendor text, campaign text, amount numeric, currency text, status text, start_date date, end_date date, exec_status text, channel text);
create table invoices  (id uuid primary key, workspace_id uuid references workspaces, client text, mpo_id uuid references mpos, amount numeric, paid numeric default 0, due_date date, wf_status text, currency text);
create table budgets   (id uuid primary key, workspace_id uuid references workspaces, mpo_id uuid references mpos, budget_amount numeric, alert_pct int);
create table comments  (id uuid primary key, entity_id text, user_id uuid, text text, created_at timestamptz default now());
create table audit_log (id uuid primary key, workspace_id uuid references workspaces, user_id uuid, action text, entity text, entity_id text, detail text, tag text, created_at timestamptz default now());

-- Enable RLS on every table
alter table mpos enable row level security;
-- Policy: users only see their workspace
create policy "workspace_isolation" on mpos using (workspace_id = auth.jwt()->>'workspace_id');`}</div>
      </div>

      <div className="prod-card">
        <div className="prod-section-title">🔒 Security Checklist</div>
        {[
          {s:"warn",t:"Server-side AI proxy required",d:"Keep Anthropic keys off the client by routing AI requests through an Edge Function or API route"},
          {s:"done",t:"Supabase RLS enabled",d:"Workspace-aware row level security is already defined in the Supabase migrations"},
          {s:"done",t:"Supabase Auth in use",d:"The live auth flow already uses Supabase sessions, profiles, sign-in, sign-up, and reset flows"},
          {s:"warn",t:"Restrict production origins",d:"Lock down CORS and allowed origins for any deployed functions and production domains"},
        ].map((c,i)=>(
          <div key={i} className="prod-check">
            <div className={`prod-check-icon ${classMap[c.s]}`}>{iconMap[c.s]}</div>
            <div><div style={{fontSize:13,fontWeight:500,color:"var(--text)"}}>{c.t}</div><div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{c.d}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   APP ROOT
══════════════════════════════════════════════════ */
const NAV=[
  {id:"dashboard",label:"Dashboard",   icon:"■", section:"overview"},
  {id:"mpo",      label:"Scheduling",  icon:"◈", section:"operations"},
  {id:"clients",  label:"Partners",    icon:"◉", section:"operations"},
  {id:"calendar", label:"Calendar",    icon:"▦", section:"operations"},
  {id:"finance",  label:"Finance",     icon:"◎", section:"finance"},
  {id:"budgets",  label:"Budgets",     icon:"◐", section:"finance"},
  {id:"reports",  label:"Reports",     icon:"▧", section:"finance"},
  {id:"analytics",label:"Analytics",   icon:"◑", section:"finance"},
  {id:"dataviz",  label:"Data Viz",    icon:"◍", section:"finance"},
  {id:"reminders",label:"Reminders",   icon:"◷", section:"tools"},
  {id:"audit",    label:"Audit Log",   icon:"◫", section:"tools"},
  {id:"users",    label:"Users",       icon:"◉", section:"tools"},
  {id:"settings", label:"Settings",    icon:"⚙", section:"tools"},
  {id:"feed",     label:"Activity Feed",icon:"◌",section:"tools"},
  {id:"production",label:"Production", icon:"⬡", section:"tools"},
];
const SECTIONS={overview:"Overview",operations:"Operations",finance:"Finance",tools:"Tools"};
const PTITLES={dashboard:"Dashboard",mpo:"Media Scheduling",clients:"Clients & Vendors",calendar:"Campaign Calendar",finance:"Finance",budgets:"Budget Management",reports:"Reports",analytics:"Analytics",dataviz:"Data Visualisation",reminders:"Reminders",audit:"Audit Log",users:"Users",settings:"Settings",feed:"Activity Feed",production:"Production Readiness"};
const MOBILE_NAV=[{id:"dashboard",label:"Home",icon:"■"},{id:"mpo",label:"MPOs",icon:"◈"},{id:"budgets",label:"Budgets",icon:"◐"},{id:"finance",label:"Finance",icon:"◎"},{id:"feed",label:"Feed",icon:"◌"}];

// ── Column transform helpers ─────────────────────────────────────────────────
// DB snake_case → app camelCase (and back)
// Client mapper — converts between camelCase app model and snake_case DB columns
const toClient = r => r ? ({
  id: r.id, name: r.name, type: r.type, industry: r.industry||"",
  contact: r.contact||"", email: r.email||"", phone: r.phone||"",
  spend: r.spend||0, status: r.status||"active",
  address: r.address||"", regNumber: r.reg_number||"",
  contactPerson: r.contact_person||"", contactRole: r.contact_role||"",
  website: r.website||"", brands: r.brands||[],
  workspace_id: r.workspace_id,
}) : null;
const fromClient = c => ({
  name: c.name, type: c.type, industry: c.industry||"",
  contact: c.contact||"", email: c.email||"", phone: c.phone||"",
  spend: c.spend||0, status: c.status||"active",
  address: c.address||"", reg_number: c.regNumber||"",
  contact_person: c.contactPerson||"", contact_role: c.contactRole||"",
  website: c.website||"", brands: c.brands||[],
});

const toMpo = r => r ? ({
  id: r.id, client: r.client, vendor: r.vendor, campaign: r.campaign,
  agency: r.agency || "", spots: r.spots || 0, rate: r.rate || 0,
  discount: r.volume_discount || 0, agencyCommission: r.agency_commission || 0,
  gross: r.gross || 0, net: r.net || 0, vat: r.vat || 0, total: r.total || 0, vatRate: r.vat_rate || 7.5,
  materialDuration: r.material_duration || 30,
  amount: r.amount, status: r.status, start: r.start_date, end: r.end_date,
  exec: r.exec_status, channel: r.channel, currency: r.currency,
  docs: r.docs || [], workspace_id: r.workspace_id,
}) : null;
const fromMpo = m => ({
  client: m.client, vendor: m.vendor, campaign: m.campaign,
  agency: m.agency || "",
  spots: m.spots || 0, rate: m.rate || 0,
  volume_discount: m.discount || 0, agency_commission: m.agencyCommission || 0,
  gross: m.gross || 0, net: m.net || 0, vat: m.vat || 0, total: m.total || 0, vat_rate: m.vatRate || 7.5,
  material_duration: m.materialDuration || 30,
  amount: m.amount, status: m.status, start_date: m.start, end_date: m.end,
  exec_status: m.exec, channel: m.channel, currency: m.currency || "NGN",
  docs: m.docs || [],
});

const toInvoice = r => r ? ({
  id: r.id, client: r.client, mpo: r.mpo_ref, amount: r.amount, paid: r.paid,
  due: r.due_date, wfStatus: r.wf_status, currency: r.currency,
  docs: r.docs || [], workspace_id: r.workspace_id,
}) : null;
const fromInvoice = inv => ({
  client: inv.client, mpo_ref: inv.mpo, amount: inv.amount, paid: inv.paid,
  due_date: inv.due, wf_status: inv.wfStatus || "draft", currency: inv.currency || "NGN",
  docs: inv.docs || [],
});

const toPayable = r => r ? ({
  id: r.id, vendor: r.vendor, mpo: r.mpo_ref, amount: r.amount, paid: r.paid,
  due: r.due_date, description: r.description, currency: r.currency,
  workspace_id: r.workspace_id,
}) : null;
const fromPayable = p => ({
  vendor: p.vendor, mpo_ref: p.mpo, amount: p.amount, paid: p.paid,
  due_date: p.due, description: p.description, currency: p.currency || "NGN",
});

const toBudget = r => r ? ({
  id: r.id, mpoId: r.mpo_id, budget: r.budget_amount, spent: r.spent_amount,
  alertPct: r.alert_pct, period: r.period, workspace_id: r.workspace_id,
}) : null;
const fromBudget = b => ({
  mpo_id: b.mpoId, budget_amount: b.budget, spent_amount: b.spent,
  alert_pct: b.alertPct, period: b.period,
});

const toAudit = r => r ? ({
  id: r.id, userId: r.user_id, userName: r.user_name, userColor: r.user_color,
  initials: r.initials, action: r.action, entity: r.entity, entityId: r.entity_id,
  detail: r.detail, tag: r.tag, ts: r.ts, workspace_id: r.workspace_id,
}) : null;

const toRo = r => r ? ({
  id: r.id, mpoId: r.mpo_id||"", client: r.client, vendor: r.vendor,
  campaign: r.campaign, channel: r.channel||"TV",
  programme: r.programme||"", materialTitle: r.material_title||"", materialDuration: r.material_duration||"",
  campaignMonth: r.campaign_month || (r.start_date ? String(r.start_date).slice(0,7) : ""),
  start: r.start_date, end: r.end_date,
  status: r.status||"draft", currency: r.currency||"NGN",
  rate: r.rate ?? (r.schedule||[]).find(s=>Number(s?.rate)>0)?.rate ?? 0,
  timeSlot: r.time_slot ?? (r.schedule||[]).find(s=>s?.timeSlot)?.timeSlot ?? "",
  volumeDiscount: r.volume_discount ?? 0,
  agencyCommission: r.agency_commission ?? 0,
  schedule: r.schedule||[], docs: r.docs||[], workspace_id: r.workspace_id,
}) : null;
const fromRo = ro => ({
  id: ro.id,
  mpo_id: ro.mpoId||null, client: ro.client, vendor: ro.vendor,
  campaign: ro.campaign, channel: ro.channel||"TV",
  programme: ro.programme||"", material_title: ro.materialTitle||"", material_duration: ro.materialDuration||"",
  campaign_month: ro.campaignMonth || (ro.start ? String(ro.start).slice(0,7) : null),
  start_date: ro.start, end_date: ro.end,
  status: ro.status||"draft", currency: ro.currency||"NGN",
  rate: Number(ro.rate)||0,
  time_slot: ro.timeSlot || "",
  volume_discount: Number(ro.volumeDiscount)||0,
  agency_commission: Number(ro.agencyCommission)||0,
  schedule: ro.schedule||[], docs: ro.docs||[],
});

// ── makeArraySetter ───────────────────────────────────────────────────────────
// Returns a React-compatible setter (accepts value or prev=>next) that also
// dispatches Supabase mutations by diffing old vs new array.
function makeArraySetter(getLocal, insertFn, updateFn, removeFn, fromRow, workspaceId) {
  return function(updater) {
    getLocal(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      // Detect added items
      const prevIds = new Set(prev.map(x => x.id));
      const nextIds = new Set(next.map(x => x.id));
      next.forEach(item => {
        if (!prevIds.has(item.id)) {
          // new item — insert (never pass local non-UUID IDs; let Supabase auto-generate)
          const row = fromRow(item);
          if (workspaceId) row.workspace_id = workspaceId;
          insertFn(row).catch(e => console.error("Supabase insert failed", e));
        } else {
          // existing — check if changed
          const old = prev.find(x => x.id === item.id);
          if (old && JSON.stringify(old) !== JSON.stringify(item)) {
            updateFn(item.id, fromRow(item)).catch(e => console.error("Supabase update failed", e));
          }
        }
      });
      prev.forEach(item => {
        if (!nextIds.has(item.id)) {
          removeFn(item.id).catch(e => console.error("Supabase remove failed", e));
        }
      });
      return next;
    });
  };
}

function App(){
  // ── Auth ────────────────────────────────────────────────────────────────────
  const { session, profile, loading: authLoading, signOut } = useAuth();
  const workspaceId = profile?.workspace_id ?? null;
  const currentUser = profile ? {
    ...profile,
    permissions: profile.permissions || [],
  } : null;

  // ── Supabase tables ─────────────────────────────────────────────────────────
  const mposTable       = useSupabaseTable("mpos",       workspaceId);
  const clientsTable    = useSupabaseTable("clients",    workspaceId);
  const invoicesTable   = useSupabaseTable("invoices",   workspaceId);
  const payablesTable   = useSupabaseTable("payables",   workspaceId);
  const budgetsTable    = useSupabaseTable("budgets",    workspaceId);
  const auditTable      = useSupabaseTable("audit_log",  workspaceId);
  const notifTable      = useSupabaseTable("notifications", workspaceId);
  const rosTable        = useSupabaseTable("ros",        workspaceId);

  // ── Local state (optimistic, seeded from DB) ────────────────────────────────
  const [mpos,        _setMpos]        = useState([]);
  const [clients,     _setClients]     = useState([]);
  const [receivables, _setReceivables] = useState([]);
  const [payables,    _setPayables]    = useState([]);
  const [budgets,     _setBudgets]     = useState([]);
  const [auditLog,    _setAuditLog]    = useState([]);
  const [notifications, _setNotifications] = useState([]);
  const [ros,         _setRos]         = useState([]);

  // Seed local state from DB whenever DB rows change
  useEffect(()=>{ if(mposTable.data)      _setMpos(mposTable.data.map(toMpo).filter(Boolean));           },[mposTable.data]);
  useEffect(()=>{ if(clientsTable.data)   _setClients(clientsTable.data.map(toClient).filter(Boolean));  },[clientsTable.data]);
  useEffect(()=>{ if(invoicesTable.data)  _setReceivables(invoicesTable.data.map(toInvoice).filter(Boolean)); },[invoicesTable.data]);
  useEffect(()=>{ if(payablesTable.data)  _setPayables(payablesTable.data.map(toPayable).filter(Boolean));    },[payablesTable.data]);
  useEffect(()=>{ if(budgetsTable.data)   _setBudgets(budgetsTable.data.map(toBudget).filter(Boolean));       },[budgetsTable.data]);
  useEffect(()=>{ if(auditTable.data)     _setAuditLog(auditTable.data.map(toAudit).filter(Boolean));         },[auditTable.data]);
  useEffect(()=>{ if(notifTable.data)     _setNotifications(notifTable.data);                             },[notifTable.data]);
  useEffect(()=>{ if(rosTable.data)       _setRos(rosTable.data.map(toRo).filter(Boolean));               },[rosTable.data]);

  // ── Compatibility setters (work like usePersisted setters) ──────────────────
  const setMpos        = makeArraySetter(_setMpos,        mposTable.insert,     mposTable.update,     mposTable.remove,     fromMpo,     workspaceId);
  const setClients     = makeArraySetter(_setClients,     clientsTable.insert,  clientsTable.update,  clientsTable.remove,  fromClient,  workspaceId);
  const setReceivables = makeArraySetter(_setReceivables, invoicesTable.insert, invoicesTable.update, invoicesTable.remove, fromInvoice, workspaceId);
  const setPayables    = makeArraySetter(_setPayables,    payablesTable.insert, payablesTable.update, payablesTable.remove, fromPayable, workspaceId);
  const setBudgets     = makeArraySetter(_setBudgets,     budgetsTable.insert,  budgetsTable.update,  budgetsTable.remove,  fromBudget,  workspaceId);
  const setRos         = makeArraySetter(_setRos,         rosTable.insert,      rosTable.update,      rosTable.remove,      fromRo,      workspaceId);
  const setAuditLog    = (updater) => {
    _setAuditLog(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const prevIds = new Set(prev.map(x=>x.id));
      next.forEach(item => {
        if(!prevIds.has(item.id)){
          const row = {
            user_id: item.userId || null, user_name: item.userName,
            user_color: item.userColor, initials: item.initials,
            action: item.action, entity: item.entity, entity_id: item.entityId,
            detail: item.detail, tag: item.tag, ts: item.ts,
            workspace_id: workspaceId,
          };
          auditTable.insert(row).catch(e=>console.error("audit insert failed",e));
        }
      });
      return next;
    });
  };
  const setNotifications = (updater) => {
    _setNotifications(prev => typeof updater === "function" ? updater(prev) : updater);
  };

  // ── Other persisted state ───────────────────────────────────────────────────
  const [darkMode,  setDarkMode]  = useState(()=>{ try{ return JSON.parse(localStorage.getItem("mh_dark")||"false"); }catch{ return false; } });
  const [settings,  setSettings]  = useState(()=>{ try{ return JSON.parse(localStorage.getItem("mh_settings")||"null")||DEFAULT_SETTINGS; }catch{ return DEFAULT_SETTINGS; } });
  const [comments,  setComments]  = useState({});

  // Persist dark mode and settings locally
  useEffect(()=>{ localStorage.setItem("mh_dark",JSON.stringify(darkMode)); },[darkMode]);
  useEffect(()=>{ localStorage.setItem("mh_settings",JSON.stringify(settings)); },[settings]);

  // Load comments from Supabase (keyed by entity_id)
  useEffect(()=>{
    if(!workspaceId) return;
    supabase.from("comments").select("*").eq("workspace_id",workspaceId).order("created_at",{ascending:true})
      .then(({data})=>{
        if(!data) return;
        const grouped={};
        data.forEach(row=>{
          const c={id:row.id,userId:row.user_id,userName:row.user_name,userColor:row.user_color,initials:row.user_initials,text:row.text,ts:row.created_at};
          if(!grouped[row.entity_id]) grouped[row.entity_id]=[];
          grouped[row.entity_id].push(c);
        });
        setComments(grouped);
      });
  },[workspaceId]);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [wizardOpen,setWizardOpen]=useState(false);
  const [page,setPage]=useState("dashboard");
  const [sOpen,setSOpen]=useState(false);
  const [aOpen,setAOpen]=useState(false);
  const [notifOpen,setNotifOpen]=useState(false);
  const [searchOpen,setSearchOpen]=useState(false);
  const [agencyOpen,setAgencyOpen]=useState(false);
  const [profileOpen,setProfileOpen]=useState(false);
  const [workspace,setWorkspace]=useState(WORKSPACES[0]);
  const {ts,show:toast}=useToast();
  const { installPrompt, isInstalled, isOffline, install } = usePWA();
  const [pwaBannerDismissed,setPwaBannerDismissed]=useState(false);

  // Fetch real workspace from Supabase and seed settings from it
  useEffect(()=>{
    if(!workspaceId) return;
    supabase.from("workspaces").select("*").eq("id",workspaceId).single()
      .then(({data})=>{
        if(!data) return;
        const abbr = data.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
        setWorkspace({
          id:   data.id,
          name: data.name,
          color: data.brand_color || "#534AB7",
          abbr,
          plan: data.plan || "free",
        });
        // Seed settings from workspace (DB wins over localStorage)
        if(data.settings && Object.keys(data.settings).length > 0){
          setSettings(s=>({...DEFAULT_SETTINGS,...data.settings}));
        }
      });
  },[workspaceId]);

  useEffect(()=>{ document.documentElement.setAttribute("data-theme",darkMode?"dark":"light"); },[darkMode]);

  useEffect(()=>{
    if(settings.brandColor){ document.documentElement.style.setProperty("--brand",settings.brandColor); document.documentElement.style.setProperty("--brand-dark",settings.brandColor+"cc"); }
  },[settings.brandColor]);

  useEffect(()=>{
    const h=e=>{if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();setSearchOpen(o=>!o);}};
    document.addEventListener("keydown",h);return()=>document.removeEventListener("keydown",h);
  },[]);

  // Build and refresh notifications from live data
  useEffect(()=>{
    const fresh=buildNotifications(receivables,payables,mpos);
    setNotifications(prev=>{
      const existingIds=new Set(prev.map(n=>n.id));
      const merged=[...prev];
      fresh.forEach(n=>{if(!existingIds.has(n.id))merged.unshift(n);});
      return merged.slice(0,50);
    });
  },[receivables,payables,mpos]);

  // ── Auth gates ──────────────────────────────────────────────────────────────
  if(authLoading) return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",flexDirection:"column",gap:16,background:"var(--bg)"}}>
      <div style={{width:40,height:40,borderRadius:"50%",border:"3px solid var(--brand)",borderTopColor:"transparent",animation:"spin 0.8s linear infinite"}}/>
      <div style={{fontSize:13,color:"var(--text3)"}}>Loading MediaHub…</div>
    </div>
  );

  if(!session) return <AuthScreen onSuccess={()=>toast("Welcome back!","info")}/>;
  if(!currentUser) return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",flexDirection:"column",gap:16,background:"var(--bg)"}}>
      <div style={{width:40,height:40,borderRadius:"50%",border:"3px solid var(--brand)",borderTopColor:"transparent",animation:"spin 0.8s linear infinite"}}/>
      <div style={{fontSize:13,color:"var(--text3)"}}>Setting up your profile…</div>
    </div>
  );
  if(currentUser.role==="client") return <ClientPortal user={currentUser} receivables={receivables} mpos={mpos} onLogout={signOut}/>;

  const addAudit=(action,entity,entityId,detail,tag)=>{
    const entry={id:`a${Date.now()}`,userId:currentUser.id,userName:currentUser.name,userColor:currentUser.color,initials:currentUser.initials,action,entity,entityId,detail,ts:tsNow(),tag};
    setAuditLog(l=>[entry,...l].slice(0,200));
  };

  const lR=receivables.map(r=>({...r,status:computeStatus(r)}));
  const lP=payables.map(p=>({...p,status:computeStatus(p)}));
  const unreadCount=notifications.filter(n=>!n.read).length;
  const alerts=[...lR.filter(r=>r.status==="overdue").map(r=>({c:"#A32D2D",t:`Invoice ${r.id} overdue — ${r.client}`})),...lP.filter(p=>p.status==="overdue").map(p=>({c:"#D85A30",t:`Payable ${p.id} overdue — ${p.vendor}`})),...mpos.filter(m=>m.exec==="delayed").map(m=>({c:"#854F0B",t:`MPO ${m.id} delayed`}))];

  const readNotif=id=>setNotifications(p=>p.map(n=>n.id===id?{...n,read:true}:n));
  const readAllNotifs=()=>setNotifications(p=>p.map(n=>({...n,read:true})));

  const visibleNav=NAV.filter(n=>currentUser.permissions.includes(n.id));
  const sections=[...new Set(visibleNav.map(n=>n.section))];
  const nav=id=>{setPage(id);setSOpen(false);};
  const logout=()=>{signOut();setPage("dashboard");};

  const addComment=(entityId, comment)=>{
    // Optimistic local update
    setComments(prev=>({...prev,[entityId]:[...(prev[entityId]||[]),comment]}));
    // Persist to Supabase
    supabase.from("comments").insert({
      workspace_id: workspaceId,
      entity_id: entityId,
      user_id: currentUser.id,
      user_name: currentUser.name,
      user_color: currentUser.color,
      user_initials: currentUser.initials,
      text: comment.text,
    }).catch(e=>console.error("comment insert failed",e));
    const mentions=[...comment.text.matchAll(/@(\w+)/g)].map(m=>m[1]);
    if(mentions.length) toast(`Notified: ${mentions.map(m=>"@"+m).join(", ")}`,"info");
  };

  const handleOnboardingComplete=({client,mpo,invoice})=>{
    setClients(p=>[...p,client]);
    setMpos(p=>[...p,mpo]);
    if(invoice) setReceivables(p=>[...p,{...invoice,status:computeStatus(invoice)}]);
    addAudit("onboarded","Client",client.id,`Onboarded ${client.name} with ${mpo.id}`,"create");
    toast(`${client.name} launched!`,"success");
    setTimeout(()=>setPage("clients"),1800);
  };

  return(
    <div className="app">
      {isOffline&&<div className="offline-bar">You're offline — MediaHub is running from cache</div>}

      {agencyOpen&&<AgencySwitcher current={workspace.id} onSwitch={ws=>{setWorkspace(ws);toast(`Switched to ${ws.name}`,"info");}} onClose={()=>setAgencyOpen(false)}/>}

      {installPrompt&&!isInstalled&&!pwaBannerDismissed&&(
        <div className="pwa-banner">
          <div className="pwa-banner-icon">📱</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:600,marginBottom:2}}>Install MediaHub</div>
            <div style={{fontSize:11,opacity:.7}}>Add to home screen for offline access</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={install}>Install</button>
          <button className="btn btn-sm btn-ghost" style={{color:"#aaa"}} onClick={()=>setPwaBannerDismissed(true)}>✕</button>
        </div>
      )}

      {wizardOpen&&<OnboardingWizard onClose={()=>setWizardOpen(false)} onComplete={handleOnboardingComplete} clients={clients} mpos={mpos} settings={settings} currentUser={currentUser}/>}

      {profileOpen&&<ProfileModal user={currentUser} onClose={()=>setProfileOpen(false)} toast={toast}/>}

      {searchOpen&&<GlobalSearch mpos={mpos} clients={clients} receivables={receivables} payables={payables} onNavigate={nav} onClose={()=>setSearchOpen(false)}/>}
      <div className={`sidebar-overlay ${sOpen?"open":""}`} onClick={()=>setSOpen(false)} style={{display:sOpen?"block":"none"}}/>

      <aside className={`sidebar ${sOpen?"open":""}`} aria-label="Navigation">
        <div className="sidebar-logo" style={{cursor:"pointer"}} onClick={()=>setAgencyOpen(true)} title="Switch workspace">
          <div className="logo-mark" style={{background:workspace.color}}>{workspace.abbr}</div>
          <div style={{flex:1,minWidth:0}}>
            <div className="logo-text" style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{workspace.name}</div>
            <div style={{fontSize:9,color:"var(--text3)",marginTop:1}}>Click to switch workspace</div>
          </div>
          <span style={{fontSize:10,color:"var(--text3)"}}>⇅</span>
        </div>
        <nav className="sidebar-nav">
          {sections.map(sec=>(
            <div key={sec}>
              <div className="nav-section">{SECTIONS[sec]}</div>
              {visibleNav.filter(n=>n.section===sec).map(item=>(
                <button key={item.id} className={`nav-item ${page===item.id?"active":""}`} onClick={()=>nav(item.id)} aria-current={page===item.id?"page":undefined}>
                  <span className="nav-icon">{item.icon}</span>{item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button onClick={()=>setProfileOpen(true)} style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,background:"none",border:"none",cursor:"pointer",padding:"4px 6px",borderRadius:8,width:"100%",textAlign:"left",transition:"background .15s"}}
            onMouseEnter={e=>(e.currentTarget.style.background="var(--bg3)")} onMouseLeave={e=>(e.currentTarget.style.background="none")}
            title="Edit profile">
            <div style={{width:28,height:28,borderRadius:"50%",background:currentUser.color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:11,flexShrink:0}}>{currentUser.initials}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:500,fontSize:12,color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{currentUser.name.split(" ")[0]}</div>
              <div style={{fontSize:10,color:"var(--text3)",textTransform:"capitalize"}}>{currentUser.role}</div>
            </div>
            <span style={{fontSize:10,color:"var(--text3)",flexShrink:0}}>✎</span>
          </button>
          <div className="dark-toggle" style={{marginBottom:8,width:"100%",justifyContent:"space-between"}} onClick={()=>setDarkMode(d=>!d)}>
            <span>{darkMode?"☀️ Light mode":"🌙 Dark mode"}</span>
            <div style={{width:32,height:18,borderRadius:99,background:darkMode?"var(--brand)":"#ddd",position:"relative",transition:"background .2s",flexShrink:0}}><div style={{position:"absolute",top:2,left:darkMode?14:2,width:14,height:14,background:"#fff",borderRadius:"50%",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/></div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button className="btn btn-ghost btn-sm" style={{fontSize:11,color:"var(--text3)",flex:1,justifyContent:"center"}} onClick={logout}>Sign out</button>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:"var(--text3)",marginTop:8}}><span style={{width:6,height:6,borderRadius:"50%",background:"#3B6D11",display:"inline-block"}}/>Synced to Supabase</div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="hamburger" onClick={()=>setSOpen(o=>!o)}>☰</button>
            <span className="topbar-title">{PTITLES[page]}</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,position:"relative"}}>
            {(currentUser.role==="admin"||currentUser.role==="manager")&&(
              <button className="btn btn-sm btn-primary" onClick={()=>setWizardOpen(true)} title="Onboard new client" style={{gap:5}}>
                <span>+</span><span style={{display:"none"}}>Onboard</span>
              </button>
            )}
            <button className="ws-pill" onClick={()=>setAgencyOpen(true)} title="Switch workspace">
              <div className="ws-dot" style={{background:workspace.color}}/>
              <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{workspace.name}</span>
              <span style={{fontSize:10,flexShrink:0}}>⇅</span>
            </button>
            <button className="btn btn-sm btn-ghost" onClick={()=>setSearchOpen(true)} title="Search ⌘K">⌕</button>
            <button className="btn btn-sm btn-ghost" onClick={()=>setDarkMode(d=>!d)} title="Dark mode">{darkMode?"☀️":"🌙"}</button>
            <div style={{position:"relative"}}>
              <button className="btn btn-sm" onClick={()=>{setNotifOpen(o=>!o);setAOpen(false);}}>
                🔔
                {unreadCount>0&&<span style={{position:"absolute",top:-4,right:-4,width:16,height:16,background:"#534AB7",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff",fontWeight:700}}>{unreadCount}</span>}
              </button>
              {notifOpen&&<NotificationPanel notifications={notifications} onRead={readNotif} onReadAll={readAllNotifs} onClose={()=>setNotifOpen(false)}/>}
            </div>
            <div style={{position:"relative"}}>
              <button className="btn btn-sm" onClick={()=>{setAOpen(o=>!o);setNotifOpen(false);}}>
                ⚠
                {alerts.length>0&&<span style={{position:"absolute",top:-4,right:-4,width:16,height:16,background:"#D85A30",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff",fontWeight:700}}>{alerts.length}</span>}
              </button>
              {aOpen&&(
                <div className="alerts-panel">
                  <div className="alerts-header">Alerts <button className="btn btn-sm btn-ghost" style={{float:"right",marginTop:-2}} onClick={()=>setAOpen(false)}>✕</button></div>
                  {alerts.length===0?<div style={{padding:"20px 16px",fontSize:12,color:"var(--text3)",textAlign:"center"}}>All clear 🎉</div>
                  :alerts.map((a,i)=><div key={i} style={{padding:"12px 16px",borderBottom:"var(--border)",fontSize:12,display:"flex",gap:10}}><div style={{width:7,height:7,borderRadius:"50%",background:a.c,flexShrink:0,marginTop:3}}/>{a.t}</div>)}
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="content">
          {page==="dashboard"&&currentUser.role!=="viewer"&&(
            <AIPanel mpos={mpos} receivables={receivables} payables={payables} clients={clients} toast={toast} currency={settings.defaultCurrency||"NGN"}/>
          )}
          {page==="dashboard" &&<Dashboard mpos={mpos} receivables={lR} payables={lP} setPage={setPage} currency={settings.defaultCurrency||"NGN"} settings={settings} toast={toast} onOnboard={()=>setWizardOpen(true)} budgets={budgets} payables2={payables}/>}
          {page==="mpo"       &&<MPOPage mpos={mpos} setMpos={setMpos} ros={ros} setRos={setRos} clients={clients} toast={toast} user={currentUser} addAudit={addAudit} settings={settings} comments={comments} onAddComment={addComment}/>}
          {page==="clients"   &&<ClientsPage clients={clients} setClients={setClients} toast={toast} user={currentUser} addAudit={addAudit} onOnboard={()=>setWizardOpen(true)}/>}
          {page==="calendar"  &&<CalendarPage mpos={mpos} ros={ros} settings={settings}/>}
          {page==="finance"   &&<FinancePage receivables={receivables} setReceivables={setReceivables} payables={payables} setPayables={setPayables} mpos={mpos} clients={clients} toast={toast} user={currentUser} addAudit={addAudit} settings={settings} comments={comments} onAddComment={addComment}/>}
          {page==="budgets"   &&<BudgetsPage budgets={budgets} setBudgets={setBudgets} mpos={mpos} payables={payables} toast={toast} user={currentUser} addAudit={addAudit}/>}
          {page==="reports"   &&<ReportsPage mpos={mpos} receivables={receivables} payables={payables} ros={ros} settings={settings}/>}
          {page==="analytics" &&<AnalyticsPage mpos={mpos} receivables={receivables} payables={payables} user={currentUser} settings={settings}/>}
          {page==="dataviz"   &&<DataVizPage mpos={mpos} receivables={receivables} payables={payables} user={currentUser}/>}
          {page==="reminders" &&<RemindersPage receivables={receivables} payables={payables} mpos={mpos} user={currentUser} toast={toast}/>}
          {page==="audit"     &&<AuditPage auditLog={auditLog} user={currentUser}/>}
          {page==="users"     &&<UsersPage currentUser={currentUser} toast={toast}/>}
          {page==="settings"  &&<SettingsPage settings={settings} setSettings={setSettings} user={currentUser} toast={toast}/>}
          {page==="feed"      &&<ActivityFeedPage comments={comments} mpos={mpos} receivables={receivables} auditLog={auditLog} currentUser={currentUser}/>}
          {page==="production"&&<ProductionPage user={currentUser}/>}
        </div>
      </div>

      <nav className="bottom-nav">
        {MOBILE_NAV.map(item=>(
          <button key={item.id} className={`bn-item ${page===item.id?"active":""}`} onClick={()=>nav(item.id)}>
            <span className="bn-icon">{item.icon}</span><span className="bn-label">{item.label}</span>
          </button>
        ))}
        <button className="bn-item" onClick={()=>setSearchOpen(true)}>
          <span className="bn-icon">⌕</span><span className="bn-label">Search</span>
        </button>
      </nav>
      <Toasts ts={ts}/>
    </div>
  );
}


export default App
