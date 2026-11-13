import React, {useEffect,useMemo,useRef,useState,Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import {useTexture} from '@react-three/drei';
import * as THREE from 'three';
import './style.css';
const NAMES=['front','angle','side','back'];
const IMAGES=NAMES.map(n=>`${import.meta.env.BASE_URL}images/${n}.png`);
const SHADOWS=NAMES.map(n=>`${import.meta.env.BASE_URL}images/${n}-shadow.png`);
const ASPECT=[410/467,414/475,448/488,391/486]; // 컷아웃 PNG의 가로/세로 비율
const TYPE_CYCLE=[0,1,2,3,1,0]; // 정면·45도 비중을 조금 높이고 후면은 줄임
// PDF의 '재희 언니' 관련 기록에서 발췌한 기억 기반 표현. 녹취록이나 검증된 직접 인용이 아님.
// 제3자의 민감한 정보는 의도적으로 제외함.
const DEFAULT_QUOTES=[
 '그래그래~ 너 말 맞아',
 '어 그래, OO이 성숙해~',
 '참아주지 마!!!',
 '나는 도와주는 기쁨을 느껴!',
 '그래애!!!!!!',
 '하나님이 네 상처를 치료해주실거야!',
 '언니 과거를 거울로 보는 느낌이었어ㅠㅠ',
 '판단하려고 한건 아니었어ㅠㅠ',
 '그런 거 영적 공격일 수도 있어~?',
 '그래그래!!',
 '내가 네 상황을 100% 알 수는 없어ㅠㅠ',
 'OO이는 편하게 해주니까.'
];
// ── 문구 저장소 ─────────────────────────────────────────────────────────
// v3 형식: {base:[저장 당시의 기본 문구], quotes:[사용자가 저장한 문구]}
// DEFAULT_QUOTES만 고치면 됨(버전 숫자를 따로 올릴 필요 없음). 불러올 때 base와 현재 기본 문구를 비교해
// 기본 문구가 바뀌었으면 새 기본 문구를 적용하고, 사용자가 직접 추가한 문구/직접 지운 문구는 그대로 반영함.
const STORE='grae-grae-potato-quotes-v3';
const LEGACY_STORE='grae-grae-potato-quotes-v2'; // 예전 형식(문구 배열만 저장)
const LEGACY_DEFAULTS=['그래그래~ 너 말 맞아','어 그래, 진샘이 성숙해~','솔직히 네가 더 아까웠어ㅋㅋ','그런 거 영적 공격일 수도 있어~?','그래그래!!','내가 네 상황을 100% 알 수는 없어ㅠㅠ','OO이는 편하게 해주니까.'];
const isList=a=>Array.isArray(a)&&a.every(x=>typeof x==='string');
const same=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
// 3-way 병합: 새 기본 문구 − 사용자가 지운 것 + 사용자가 추가한 것
function mergeQuotes(base,saved,defaults){
 const added=saved.filter(q=>!base.includes(q)),removed=base.filter(q=>!saved.includes(q));
 const out=[...defaults.filter(q=>!removed.includes(q)),...added.filter(q=>!defaults.includes(q))];
 return out.length?out:[...defaults];
}
const storage={get:k=>{try{return JSON.parse(localStorage.getItem(k))}catch{return null}},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}},del:k=>{try{localStorage.removeItem(k)}catch{}}};
function loadQuotes(){
 let rec=storage.get(STORE);
 if(!(rec&&isList(rec.base)&&isList(rec.quotes))){ // v3 기록이 없으면 예전(v2) 기록을 옮겨옴
  const legacy=storage.get(LEGACY_STORE);storage.del(LEGACY_STORE);
  rec=isList(legacy)&&legacy.length?{base:LEGACY_DEFAULTS,quotes:legacy}:null;
 }
 if(!rec||!rec.quotes.length){storage.del(STORE);return {quotes:DEFAULT_QUOTES,custom:false}}
 const quotes=same(rec.base,DEFAULT_QUOTES)?rec.quotes:mergeQuotes(rec.base,rec.quotes,DEFAULT_QUOTES);
 if(same(quotes,DEFAULT_QUOTES)){storage.del(STORE);return {quotes:DEFAULT_QUOTES,custom:false}} // 직접 편집한 내용이 없으면 저장하지 않음
 storage.set(STORE,{base:DEFAULT_QUOTES,quotes});
 return {quotes,custom:true};
}
const CAM_Z=13,Z_FAR=-3,Z_NEAR=2.2;
const rand=(a,b)=>a+Math.random()*(b-a);
// u,v: 화면 안 위치(0~1). 지정하지 않으면 완전 랜덤(ADD CHAOS용)
const makeHead=(i,u=Math.random(),v=Math.random())=>({id:`h-${Date.now()}-${i}-${Math.random().toString(36).slice(2,7)}`,type:TYPE_CYCLE[Math.floor(Math.random()*TYPE_CYCLE.length)],u,v,z:rand(Z_FAR,Z_NEAR),scale:rand(.78,1.28),tilt:rand(-.38,.38),phase:rand(0,Math.PI*2),flip:Math.random()<.5,speed:rand(.7,1.3)});
// 흐트러뜨린 격자(jittered grid): 화면 전체를 빈틈 없이, 하지만 불규칙하게 채움
function makeCrowd(n){
 const aspect=Math.max(.4,window.innerWidth/Math.max(1,window.innerHeight*.66));
 const cols=Math.max(1,Math.round(Math.sqrt(n*aspect))),rows=Math.ceil(n/cols);
 const cells=[];for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)cells.push([c,r]);
 for(let k=cells.length-1;k>0;k--){const j=Math.floor(Math.random()*(k+1));[cells[k],cells[j]]=[cells[j],cells[k]]}
 return cells.slice(0,n).map(([c,r],i)=>makeHead(i,(c+.5+rand(-.48,.48))/cols,(r+.5+rand(-.48,.48))/rows));
}
function countForWidth(w){return w<600?30:w<1000?55:80}
const smooth={x:0,y:0}; // 부드럽게 따라오는 포인터(패럴랙스용)
const alphaCache=new Map();
// 클릭 지점이 사진의 투명 영역인지 확인(투명하면 뒤의 머리로 클릭을 넘김)
function isOpaque(tex,uv){
 if(!uv||!tex.image)return true;
 let m=alphaCache.get(tex.uuid);
 if(!m){try{const w=96,h=Math.round(96*tex.image.height/tex.image.width),c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(tex.image,0,0,w,h);m={w,h,d:g.getImageData(0,0,w,h).data}}catch{m={w:0}}alphaCache.set(tex.uuid,m)}
 if(!m.w)return true;
 const x=Math.min(m.w-1,Math.max(0,Math.floor(uv.x*m.w))),y=Math.min(m.h-1,Math.max(0,Math.floor((1-uv.y)*m.h)));
 return m.d[(y*m.w+x)*4+3]>60;
}
const FAR_TINT=new THREE.Color('#b4c2c0'),WHITE=new THREE.Color('#ffffff');
// 2.5D 사진 컷아웃: 실제 머리 윤곽 PNG 평면 + 흐린 그림자. 구체/도형 메시는 사용하지 않음.
function Head({data,reduce,onPick,count}){
 const group=useRef();
 const [tex,shadow]=useTexture([IMAGES[data.type],SHADOWS[data.type]]);
 const {viewport}=useThree();
 useEffect(()=>{tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;tex.needsUpdate=true},[tex]);
 const depth=(data.z-Z_FAR)/(Z_NEAR-Z_FAR); // 0=멀다, 1=가깝다
 const persp=(CAM_Z-data.z)/CAM_Z; // 깊이가 달라도 화면상의 위치가 유지되도록 보정
 const size=data.scale*2.1*Math.sqrt(viewport.width*viewport.height/Math.max(count,1));
 const w=size*ASPECT[data.type],order=Math.round(depth*1000)*2;
 const tint=useMemo(()=>FAR_TINT.clone().lerp(WHITE,Math.min(1,depth*1.25)),[depth]);
 useFrame(({clock})=>{
  const g=group.current;if(!g)return;
  const t=clock.elapsedTime*data.speed,px=reduce?0:smooth.x,py=reduce?0:smooth.y,k=.25+depth*1.1;
  g.position.x=((data.u*2-1)*viewport.width*.54)*persp+px*k*.55;
  g.position.y=((1-data.v*2)*viewport.height*.56)*persp+py*k*.4+(reduce?0:Math.sin(t*.8+data.phase)*size*.035);
  g.position.z=data.z;
  g.rotation.z=data.tilt+(reduce?0:Math.sin(t*.6+data.phase)*.06);
  g.rotation.y=reduce?0:Math.sin(t*.45+data.phase*1.7)*.2+px*.22;
  g.rotation.x=reduce?0:Math.sin(t*.38+data.phase*.6)*.08-py*.14;
 });
 return <group ref={group}>
  <mesh position={[size*.05,-size*.075,-.02]} scale={[data.flip?-w*1.03:w*1.03,size*1.03,1]} renderOrder={order} raycast={()=>null}>
   <planeGeometry/><meshBasicMaterial toneMapped={false} map={shadow} color="#03181c" transparent opacity={.5} depthWrite={false} depthTest={false} side={THREE.DoubleSide}/>
  </mesh>
  <mesh scale={[data.flip?-w:w,size,1]} renderOrder={order+1} onClick={e=>{if(!isOpaque(tex,e.uv))return;e.stopPropagation();onPick(data)}}>
   <planeGeometry/><meshBasicMaterial toneMapped={false} map={tex} color={tint} transparent alphaTest={.02} depthWrite={false} depthTest={false} side={THREE.DoubleSide}/>
  </mesh>
 </group>
}
function Crowd({heads,reduce,onPick}){
 useFrame(({pointer},dt)=>{const a=Math.min(1,dt*3.5);smooth.x+=(pointer.x-smooth.x)*a;smooth.y+=(pointer.y-smooth.y)*a});
 return <Suspense fallback={null}>{heads.map(h=><Head key={h.id} data={h} reduce={reduce} onPick={onPick} count={heads.length}/>)}</Suspense>
}
function App(){
 const [width,setWidth]=useState(window.innerWidth);
 const [heads,setHeads]=useState(()=>makeCrowd(countForWidth(window.innerWidth)));
 const [reduce,setReduce]=useState(()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false);
 const [initial]=useState(loadQuotes);
 const [quotes,setQuotes]=useState(initial.quotes),[custom,setCustom]=useState(initial.custom);
 const [editor,setEditor]=useState(false),[draft,setDraft]=useState(''),[selected,setSelected]=useState(null),[last,setLast]=useState(-1);
 const [bubble,setBubble]=useState(false);
 useEffect(()=>{const fn=()=>setWidth(window.innerWidth);window.addEventListener('resize',fn);return()=>window.removeEventListener('resize',fn)},[]);
 useEffect(()=>{const id=setInterval(()=>{if(!reduce)setBubble(b=>!b)},4200);return()=>clearInterval(id)},[reduce]);
 useEffect(()=>{const esc=e=>{if(e.key==='Escape'){setSelected(null);setEditor(false)}};window.addEventListener('keydown',esc);return()=>window.removeEventListener('keydown',esc)},[]);
 const pick=()=>{let n=Math.floor(Math.random()*quotes.length);if(quotes.length>1&&n===last)n=(n+1+Math.floor(Math.random()*(quotes.length-1)))%quotes.length;setLast(n);setSelected({quote:quotes[n],index:n})};
 const save=()=>{const a=draft.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,500);if(!a.length)return;const c=!same(a,DEFAULT_QUOTES);setQuotes(a);setCustom(c);setLast(-1);if(c)storage.set(STORE,{base:DEFAULT_QUOTES,quotes:a});else storage.del(STORE);setEditor(false)};
 const resetQuotes=()=>{if(custom&&!window.confirm('직접 편집한 문구를 지우고 기본 문구로 되돌릴까?'))return;storage.del(STORE);storage.del(LEGACY_STORE);setQuotes(DEFAULT_QUOTES);setCustom(false);setLast(-1);setDraft(DEFAULT_QUOTES.join('\n'))};
 const exportJson=()=>{const blob=new Blob([JSON.stringify(quotes,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='grae-quotes.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 const importJson=async(e)=>{const f=e.target.files?.[0];if(!f)return;try{const v=JSON.parse(await f.text());if(!Array.isArray(v)||!v.every(x=>typeof x==='string'))throw Error();setDraft(v.join('\n'))}catch{alert('문자열 배열 형태의 JSON 파일을 선택해 줘.')}e.target.value=''};
 return <main className="app">
  <header className="top"><div><div className="eyebrow">PRIVATE INTERACTIVE ART · LOCAL ONLY</div><h1>GRAE GRAE <em>POTATO</em></h1></div><span className="count">HEADS <strong>{heads.length}</strong></span></header>
  <section className="scene" aria-label="머리 컷아웃 콜라주"><Canvas style={{position:'absolute',inset:0}} dpr={[1,Math.min(1.5,window.devicePixelRatio||1)]} camera={{position:[0,0,CAM_Z],fov:48}} gl={{alpha:true,antialias:true}}><Crowd heads={heads} reduce={reduce} onPick={pick}/></Canvas><div className={`shout ${bubble&&!reduce?'visible':''}`} aria-hidden="true">그래그래!!!!!!!</div><div className="scene-label">CLICK A HEAD / RANDOM QUOTE</div></section>
  <nav className="controls"><button onClick={()=>setHeads(h=>[...h,...Array.from({length:Math.min(10,150-h.length)},(_,i)=>makeHead(i+h.length))])} disabled={heads.length>=150}>+ ADD CHAOS</button><button onClick={()=>setHeads(makeCrowd(countForWidth(width)))}>RESET</button><button onClick={()=>{setDraft(quotes.join('\n'));setEditor(true)}}>EDIT QUOTES</button><label className="motion"><input type="checkbox" checked={reduce} onChange={e=>setReduce(e.target.checked)}/> 움직임 줄이기</label></nav>
  <footer>4 ANGLES · 2.5D PHOTO CUTOUT COLLAGE · NO UPLOADS</footer>
  {selected&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><article className="dialog quote" role="dialog" aria-modal="true" aria-label="랜덤 문구"><button className="close" onClick={()=>setSelected(null)}>✕</button><div className="eyebrow">RANDOM QUOTE #{String(selected.index+1).padStart(2,'0')}</div><p>{selected.quote}</p><button onClick={pick}>ANOTHER QUOTE ↻</button></article></div>}
  {editor&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setEditor(false)}}><article className="dialog edit" role="dialog" aria-modal="true" aria-label="문구 편집"><button className="close" onClick={()=>setEditor(false)}>✕</button><h2>EDIT QUOTES</h2><p className="hint">한 줄에 하나씩 입력해. 기본 문구는 PDF에 기록된 기억 기반 표현이야(정확한 녹취 아님). 내용은 이 브라우저에만 저장돼. <span className="state">{custom?'현재: 직접 편집한 문구 사용 중':'현재: 기본 문구 사용 중'}</span></p><textarea value={draft} onChange={e=>setDraft(e.target.value)} spellCheck={false}/><div className="editbuttons"><button onClick={save}>SAVE</button><button onClick={exportJson}>EXPORT JSON</button><button className="ghost" onClick={resetQuotes}>기본 문구로 초기화</button><label className="import">IMPORT JSON<input type="file" accept="application/json,.json" onChange={importJson} hidden/></label></div></article></div>}
 </main>
}

createRoot(document.getElementById('root')).render(<App/>);
