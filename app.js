const KEY="kta_ocr_data_v2";
let data=JSON.parse(localStorage.getItem(KEY)||"[]");
let stream=null, worker=null, busy=false, autoTimer=null;

const $=id=>document.getElementById(id);
const video=$("video"),canvas=$("canvas"),ctx=canvas.getContext("2d",{willReadFrequently:true});

function save(){localStorage.setItem(KEY,JSON.stringify(data));render()}
function dateKey(){return new Date().toISOString().slice(0,10)}
function timeText(){return new Date().toLocaleString("id-ID",{dateStyle:"short",timeStyle:"short"})}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function toast(s){const t=$("toast");t.textContent=s;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2500)}

function render(){
  const q=$("search").value.toLowerCase().trim();
  const list=data.filter(x=>(x.name+" "+x.block+" "+x.time).toLowerCase().includes(q));
  $("rows").innerHTML=list.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.name)}</td><td>${esc(x.block)}</td><td>${esc(x.time)}</td><td><button class="del" onclick="removeItem(${x.stamp})">Hapus</button></td></tr>`).join("");
  $("empty").style.display=list.length?"none":"block";
  $("total").textContent=data.length;
  $("today").textContent=data.filter(x=>x.date===dateKey()).length;
  $("blocks").textContent=new Set(data.map(x=>x.block)).size;
  const c={};data.forEach(x=>c[x.block]=(c[x.block]||0)+1);
  $("recap").innerHTML=Object.entries(c).sort().map(([b,n])=>`<div><b>${n}</b><span>Blok ${esc(b)}</span></div>`).join("")||'<div class="empty">Belum ada rekap.</div>';
}
window.removeItem=stamp=>{if(confirm("Hapus data ini?")){data=data.filter(x=>x.stamp!==stamp);save()}};
$("search").addEventListener("input",render);

async function openCamera(){
  if(stream)return;
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:1920}},audio:false});
    video.srcObject=stream;
    $("cameraBtn").textContent="Tutup Kamera";
    $("scanBtn").disabled=false;
    $("status").textContent="Kamera aktif";$("status").classList.add("on");
    toast("Kamera aktif. Sistem akan scan otomatis.");
    startAutoScan();
  }catch(e){toast("Kamera tidak bisa dibuka. Izinkan kamera dan gunakan HTTPS.")}
}
function closeCamera(){
  if(autoTimer){clearInterval(autoTimer);autoTimer=null}
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}
  $("cameraBtn").textContent="Buka Kamera";$("scanBtn").disabled=true;
  $("status").textContent="Kamera mati";$("status").classList.remove("on");
}
$("cameraBtn").onclick=()=>stream?closeCamera():openCamera();

function normalize(s){
  return s.replace(/[|]/g,"I").replace(/\s+/g," ").trim();
}
function extractBlock(text){
  const m=text.match(/\bBLOK\s*[:\-]?\s*([IVXLCDM]{1,6}|[A-Z0-9][A-Z0-9-]*)\b/i);
  return m?m[1].toUpperCase():"";
}
function cleanName(s){
  return s.replace(/[^A-Za-zÀ-ÿ'. -]/g," ").replace(/\s+/g," ").trim();
}
function extractName(text){
  const raw=text.split(/\n+/).map(x=>normalize(x)).filter(Boolean);
  const blockIndex=raw.findIndex(x=>/\bBLOK\b/i.test(x));
  const candidates=[];
  raw.forEach((line,i)=>{
    const c=cleanName(line);
    const words=c.split(/\s+/).filter(Boolean);
    if(words.length>=2&&words.length<=5&&/[A-Za-z]/.test(c)){
      const upper=(line===line.toUpperCase());
      const forbidden=/PEMERINTAH|KOTA MAGELANG|KARTU|TANDA|ANGGOTA|PETUGAS|PARKIR|PENGGANTI|JL\.?|TOKO|BAJA|SHIFT|SIANG|SORE|BLOK|https|www/i;
      if(!forbidden.test(c)) candidates.push({c,i,score:(upper?4:0)+(blockIndex>i?3:0)+(i>3?2:0)});
    }
  });
  candidates.sort((a,b)=>b.score-a.score);
  return candidates[0]?.c||"";
}

function captureCrop(){
  const vw=video.videoWidth,vh=video.videoHeight;
  // OCR seluruh frame dengan sedikit margin; lebih toleran jika kartu tidak persis memenuhi guide.
  const maxW=1000;
  const scale=Math.min(1,maxW/vw);
  canvas.width=Math.round(vw*scale);canvas.height=Math.round(vh*scale);
  ctx.drawImage(video,0,0,canvas.width,canvas.height);
  return canvas.toDataURL("image/jpeg",.92);
}

async function getWorker(){
  if(worker)return worker;
  $("message").textContent="Menyiapkan mesin OCR untuk pertama kali...";
  worker=await Tesseract.createWorker("eng");
  await worker.setParameters({tessedit_pageseg_mode:"6",preserve_interword_spaces:"1"});
  return worker;
}

async function scan(){
  if(!stream||busy)return;
  busy=true;$("scanBtn").disabled=true;$("cameraBtn").disabled=true;
  $("progress").classList.remove("hidden");$("bar").style.width="8%";
  $("message").textContent="Sedang membaca tulisan pada KTA...";
  try{
    const w=await getWorker();$("bar").style.width="30%";
    const img=captureCrop();$("bar").style.width="45%";
    const result=await w.recognize(img);
    $("bar").style.width="80%";
    const text=result.data.text||"";
    const name=extractName(text),block=extractBlock(text);
    console.log("OCR:",text,"=>",name,block);

    if(!name||!block){
      $("message").textContent="Nama/blok belum terbaca. Dekatkan KTA, pastikan terang, lalu scan lagi.";
      toast("Belum berhasil membaca nama dan blok.");
      $("bar").style.width="100%";
      setTimeout(()=>$("bar").style.width="0",500);
    }else{
      $("resultCard").classList.remove("hidden");
      $("resultName").textContent=name;$("resultBlock").textContent=block;
      const duplicate=data.some(x=>x.name.toLowerCase()===name.toLowerCase()&&x.block===block);
      if(duplicate){toast("Data ini sudah tercatat.");$("message").textContent="KTA sudah pernah tercatat."}
      else{
        data.unshift({name,block,time:timeText(),date:dateKey(),stamp:Date.now()});
        save();toast(`Tercatat: ${name} — Blok ${block}`);
        $("message").textContent="Berhasil dicatat otomatis. Siap scan KTA berikutnya.";
      }
    }
  }catch(e){
    console.error(e);toast("OCR gagal. Coba lagi dengan posisi KTA lebih jelas.");
  }finally{
    busy=false;$("scanBtn").disabled=!stream;$("cameraBtn").disabled=false;
    setTimeout(()=>{$("progress").classList.add("hidden");$("bar").style.width="0"},700);
  }
}
$("scanBtn").onclick=scan;
function startAutoScan(){
  if(autoTimer)clearInterval(autoTimer);
  autoTimer=setInterval(()=>{ if(stream&&!busy) scan(); },4000);
  setTimeout(()=>{ if(stream&&!busy) scan(); },1200);
}

$("exportBtn").onclick=()=>{
  if(!data.length){toast("Belum ada data.");return}
  let out="DATA PENDATAAN KTA PETUGAS PARKIR\n================================\n";
  out+=`Tanggal export: ${timeText()}\nTotal data: ${data.length}\n\n`;
  data.slice().reverse().forEach((x,i)=>out+=`${i+1}. ${x.name} | Blok ${x.block} | ${x.time}\n`);
  out+="\nREKAP BLOK\n==========\n";
  const c={};data.forEach(x=>c[x.block]=(c[x.block]||0)+1);
  Object.entries(c).sort().forEach(([b,n])=>out+=`Blok ${b}: ${n} orang\n`);
  const blob=new Blob([out],{type:"text/plain;charset=utf-8"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`data-kta-${dateKey()}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};
$("clearBtn").onclick=()=>{
  if(confirm("Hapus seluruh data yang tersimpan di HP ini?")){data=[];save();$("resultCard").classList.add("hidden");toast("Semua data dihapus.")}
};
window.addEventListener("pagehide",closeCamera);
render();
