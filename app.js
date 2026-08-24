const KEY="kta_ocr_high_accuracy_v3";
let rows=JSON.parse(localStorage.getItem(KEY)||"[]"),stream=null,worker=null,busy=false;
const $=id=>document.getElementById(id),video=$("video"),work=$("work"),crop=$("crop");

function toast(s){const t=$("toast");t.textContent=s;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2300)}
function persist(){localStorage.setItem(KEY,JSON.stringify(rows));render()}
function today(){return new Date().toISOString().slice(0,10)}
function now(){return new Date().toLocaleString("id-ID",{dateStyle:"short",timeStyle:"short"})}
function clean(s){return String(s||"").toUpperCase().replace(/[^A-ZÀ-ÿ0-9 .'-]/g," ").replace(/\s+/g," ").trim()}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

function validName(s){
  s=clean(s);
  const bad=["BLOK","PEMUDA","TOKO","SHIFT","DP","JALAN","JL","PEMERINTAH","KOTA","MAGELANG","KARTU","TANDA","ANGGOTA","PETUGAS","PARKIR","PENGGANTI"];
  if(s.length<7||s.length>45)return false;
  if(bad.some(x=>s===x||s.includes(" "+x+" ")))return false;
  const w=s.split(" ").filter(Boolean);
  return w.length>=2 && w.every(x=>/[A-ZÀ-ÿ]{2,}/.test(x));
}
function normalizeRoman(s){
  s=clean(s).replace(/[|]/g,"I").replace(/Y/g,"V");
  s=s.replace(/\bB[LO0]K\b/g,"BLOK").replace(/\b1\b/g,"I");
  const m=s.match(/(?:BLOK\s*)?([IVXLCDM]{1,8})\b/);
  return m?m[1]:"";
}
function nameScore(s){
  s=clean(s);let score=0;
  if(validName(s))score+=50;
  score+=Math.min(s.length,30);
  if(/\bBLOK\b/.test(s))score-=80;
  if(/\b(JL|JALAN|DP|SHIFT|TOKO)\b/.test(s))score-=30;
  return score;
}
function chooseName(texts){
  let candidates=[];
  for(const text of texts){
    for(const line of text.split(/\n+/)){
      let s=clean(line);
      if(!s)continue;
      s=s.replace(/\bBLOK\b.*$/,"").trim();
      if(validName(s))candidates.push(s);
    }
  }
  if(!candidates.length)return "";
  const count={};
  candidates.forEach(s=>count[s]=(count[s]||0)+1);
  candidates.sort((a,b)=>(count[b]-count[a])||(nameScore(b)-nameScore(a)));
  return candidates[0];
}
function chooseBlock(texts){
  let vals=[];
  for(const text of texts){
    const b=normalizeRoman(text);
    if(b)vals.push(b);
  }
  if(!vals.length)return "";
  const count={};vals.forEach(x=>count[x]=(count[x]||0)+1);
  return vals.sort((a,b)=>count[b]-count[a])[0];
}

async function initWorker(){
  if(worker)return;
  $("status").textContent="Menyiapkan mesin OCR...";
  worker=await Tesseract.createWorker("eng",1,{
    logger:m=>{
      if(m.status==="recognizing text")$("status").textContent=`OCR: ${Math.round((m.progress||0)*100)}%`;
    }
  });
}

function preprocess(source,sx,sy,sw,sh,variant){
  const scale=4;
  crop.width=Math.max(700,Math.round(sw*scale));
  crop.height=Math.max(140,Math.round(sh*scale));
  const c=crop.getContext("2d",{willReadFrequently:true});
  c.clearRect(0,0,crop.width,crop.height);
  c.filter=variant==="soft"?"contrast(145%) brightness(108%)":
           variant==="sharp"?"contrast(175%) brightness(105%)":"grayscale(100%) contrast(160%) brightness(112%)";
  c.drawImage(source,sx,sy,sw,sh,0,0,crop.width,crop.height);
  c.filter="none";
  const img=c.getImageData(0,0,crop.width,crop.height),d=img.data;
  // Sharpen + threshold ringan, lebih aman daripada threshold keras untuk teks buram.
  const copy=new Uint8ClampedArray(d);
  for(let y=1;y<crop.height-1;y++){
    for(let x=1;x<crop.width-1;x++){
      const i=(y*crop.width+x)*4;
      const g=.299*copy[i]+.587*copy[i+1]+.114*copy[i+2];
      const n=.299*copy[i-4]+.587*copy[i-3]+.114*copy[i-2];
      const s=.299*copy[i+4]+.587*copy[i+5]+.114*copy[i+6];
      const up=.299*copy[i-crop.width*4]+.587*copy[i-crop.width*4+1]+.114*copy[i-crop.width*4+2];
      const dn=.299*copy[i+crop.width*4]+.587*copy[i+crop.width*4+1]+.114*copy[i+crop.width*4+2];
      const sharp=Math.max(0,Math.min(255,g*1.7-(n+s+up+dn)*.175));
      d[i]=d[i+1]=d[i+2]=sharp;d[i+3]=255;
    }
  }
  c.putImageData(img,0,0);
  return crop;
}

async function recognizeCanvas(cv,mode){
  const p=mode==="block"?
    {tessedit_pageseg_mode:"7",tessedit_char_whitelist:"BLOKIVXLCDM1234567890"}:
    {tessedit_pageseg_mode:"7"};
  await worker.setParameters(p);
  const r=await worker.recognize(cv);
  return {text:r.data.text,confidence:r.data.confidence||0};
}

async function getFrame(){
  const w=video.videoWidth,h=video.videoHeight;
  work.width=w;work.height=h;
  const c=work.getContext("2d",{willReadFrequently:true});
  c.drawImage(video,0,0,w,h);
  return {w,h};
}

async function scanOnce(){
  const {w,h}=await getFrame();
  const ny=+$("nameY").value/100,by=+$("blockY").value/100;
  // KTA contoh: nama besar berada sekitar 62-72%, blok kiri sekitar 72-83%.
  const nameX=w*.13,nameY=h*ny,nameW=w*.74,nameH=h*.115;
  const blockX=w*.055,blockY=h*by,blockW=w*.47,blockH=h*.12;
  const nameTexts=[],blockTexts=[];let conf=[];
  for(const variant of ["soft","sharp","normal"]){
    const nc=preprocess(work,nameX,nameY,nameW,nameH,variant);
    const bc=preprocess(work,blockX,blockY,blockW,blockH,variant);
    const [nr,br]=await Promise.all([recognizeCanvas(nc,"name"),recognizeCanvas(bc,"block")]);
    nameTexts.push(nr.text);blockTexts.push(br.text);conf.push((nr.confidence+br.confidence)/2);
  }
  return {name:chooseName(nameTexts),block:chooseBlock(blockTexts),confidence:Math.round(conf.reduce((a,b)=>a+b,0)/conf.length)};
}

$("start").onclick=async()=>{
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error("no camera");
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:2560}},audio:false});
    video.srcObject=stream;
    $("start").disabled=true;$("scan").disabled=false;$("stop").disabled=false;
    $("cameraState").textContent="Aktif";$("cameraState").className="badge-ok";$("cameraText").style.display="none";
    await initWorker();toast("Kamera siap.");
  }catch(e){console.error(e);toast("Kamera gagal. Pastikan HTTPS dan izin kamera aktif.")}
};
$("stop").onclick=()=>{
  if(stream)stream.getTracks().forEach(t=>t.stop());
  stream=null;video.srcObject=null;$("start").disabled=false;$("scan").disabled=true;$("stop").disabled=true;
  $("cameraState").textContent="Belum aktif";$("cameraState").className="";$("cameraText").style.display="block";
};
$("scan").onclick=async()=>{
  if(busy||!stream)return;busy=true;$("scan").disabled=true;$("save").disabled=true;
  try{
    await initWorker();
    const results=[];
    for(let i=0;i<3;i++){
      $("status").textContent=`Mengambil frame ${i+1}/3...`;
      await new Promise(r=>setTimeout(r,i?450:100));
      results.push(await scanOnce());
    }
    const names=results.map(x=>x.name).filter(Boolean),blocks=results.map(x=>x.block).filter(Boolean);
    const name=chooseName(names),block=chooseBlock(blocks);
    const confidence=Math.round(results.reduce((a,b)=>a+b.confidence,0)/results.length);
    $("name").value=name;$("block").value=block;$("confidence").textContent=`Keyakinan OCR ±${confidence}%`;
    $("save").disabled=!(validName(name)&&block);
    $("status").textContent=(validName(name)&&block)?"Hasil konsisten. Periksa sebelum simpan.":"Hasil belum cukup jelas — ubah posisi KTA / pencahayaan lalu scan lagi.";
    toast((validName(name)&&block)?"Berhasil membaca KTA":"OCR belum yakin");
  }catch(e){console.error(e);toast("OCR gagal. Coba kartu lebih dekat dan stabil.");$("status").textContent="OCR gagal."}
  finally{busy=false;$("scan").disabled=false}
};

$("save").onclick=()=>{
  const name=clean($("name").value),block=normalizeRoman($("block").value);
  if(!validName(name)||!block){toast("Nama atau blok belum valid.");return}
  if(rows.some(x=>x.name===name&&x.block===block)){toast("Data ini sudah tercatat.");return}
  rows.unshift({name,block,time:now(),date:today(),stamp:Date.now()});persist();
  $("name").value="";$("block").value="";$("save").disabled=true;$("confidence").textContent="—";toast("Data tersimpan.");
};

$("export").onclick=()=>{
  if(!rows.length){toast("Belum ada data.");return}
  let txt="DATA PENDATAAN KTA PETUGAS PARKIR\n====================================\n";
  txt+=`Export: ${now()}\nTotal: ${rows.length}\n\n`;
  rows.slice().reverse().forEach((x,i)=>txt+=`${i+1}. Nama: ${x.name}\n   Blok: ${x.block}\n   Waktu: ${x.time}\n\n`);
  const c={};rows.forEach(x=>c[x.block]=(c[x.block]||0)+1);
  txt+="REKAP BLOK\n===========\n";Object.entries(c).sort().forEach(([b,n])=>txt+=`Blok ${b}: ${n} orang\n`);
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([txt],{type:"text/plain;charset=utf-8"}));a.download=`data-kta-${today()}.txt`;a.click();URL.revokeObjectURL(a.href);
};
$("clearAll").onclick=()=>{if(confirm("Hapus semua data?")){rows=[];persist();toast("Semua data dihapus.")}};
$("nameY").oninput=e=>{e.target.title=e.target.value+"%";};
$("blockY").oninput=e=>{e.target.title=e.target.value+"%";};
$("resetCrop").onclick=()=>{$("nameY").value=62;$("blockY").value=72;toast("Posisi crop dikembalikan.")};
$("search").oninput=render;
window.removeRow=stamp=>{if(confirm("Hapus data ini?")){rows=rows.filter(x=>x.stamp!==stamp);persist()}};

function render(){
  const q=$("search").value.toLowerCase();
  const r=rows.filter(x=>(x.name+" "+x.block+" "+x.time).toLowerCase().includes(q));
  $("tbody").innerHTML=r.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.name)}</td><td>${esc(x.block)}</td><td>${esc(x.time)}</td><td><button class="del" onclick="removeRow(${x.stamp})">Hapus</button></td></tr>`).join("");
  $("empty").style.display=r.length?"none":"block";
  $("total").textContent=rows.length;$("today").textContent=rows.filter(x=>x.date===today()).length;$("blockTotal").textContent=new Set(rows.map(x=>x.block)).size;
}
render();
window.addEventListener("beforeunload",()=>{if(worker)worker.terminate();if(stream)stream.getTracks().forEach(t=>t.stop())});
