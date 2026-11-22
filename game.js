'use strict';
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d',{alpha:false});
const frameImage = ctx.createImageData(768,720), pixels = new Uint32Array(frameImage.data.buffer);
const modeButtons = [...document.querySelectorAll('[data-mode]')];
let nes, rom, running=false, initializing=false, stopped=false, muted=false, audio, audioNode, touchPort=1, mode=1;
const ringSize=16384, left=new Float32Array(ringSize),right=new Float32Array(ringSize);
let written=0,read=0;
function initAudio(){
  if(muted)return;
  if(!audio)try{
    audio=new (window.AudioContext||window.webkitAudioContext)({sampleRate:44100});
    audioNode=audio.createScriptProcessor(1024,0,2);
    audioNode.onaudioprocess=e=>{
      const l=e.outputBuffer.getChannelData(0),r=e.outputBuffer.getChannelData(1);
      for(let i=0;i<l.length;i++){if(read<written){const pos=read++%ringSize;l[i]=left[pos];r[i]=right[pos]}else{l[i]=r[i]=0}}
    };
    audioNode.connect(audio.destination);
  }catch{audio=null}
  if(audio?.state==='suspended')audio.resume().catch(()=>{});
}
function sample(l,r){if(!audio||muted||initializing||stopped)return;left[written%ringSize]=l;right[written%ringSize]=r;written++;if(written-read>4096)read=written-2048}
// Preserve NES sprite priority and clipping. Only visible face pixels carry
// a detail-patch index in the emulator's final frame.
const faceRGB = atob(contraFaces.rgb);
const facePixels = new Uint32Array(faceRGB.length / 3);
for(let i=0;i<facePixels.length;i++){
  const k=i*3;
  facePixels[i]=0xff000000|faceRGB.charCodeAt(k)|faceRGB.charCodeAt(k+1)<<8|faceRGB.charCodeAt(k+2)<<16;
}
const faceColumns = new Uint16Array(256);
function render(buffer){
  if(initializing)return;
  for(let y=0;y<240;y++){
    const row=y*3*768;
    let details=0;
    for(let x=0;x<256;x++){
      const color=buffer[y*256+x], dest=row+x*3;
      if(color>=0x1000000)faceColumns[details++]=x;
      pixels[dest]=pixels[dest+1]=pixels[dest+2]=0xff000000|color;
    }
    pixels.copyWithin(row+768,row,row+768);
    pixels.copyWithin(row+1536,row,row+768);
    for(let i=0;i<details;i++){
      const x=faceColumns[i];
      let src=(buffer[y*256+x]-0x1000000)*9;
      for(let r=0;r<3;r++){
        const dest=row+x*3+r*768;
        pixels[dest]=facePixels[src++];pixels[dest+1]=facePixels[src++];pixels[dest+2]=facePixels[src++];
      }
    }
  }
  ctx.putImageData(frameImage,0,0);
}
function frames(count){for(let i=0;i<count;i++)nes.frame()}
function bootTap(button){nes.buttonDown(1,button);frames(2);nes.buttonUp(1,button);frames(2)}
function showTitle(){
  releaseAll();running=false;stopped=false;$('title').hidden=false;$('pause').disabled=true;$('pause').textContent='Пауза';$('touchPlayer').hidden=true;read=written;
}
function begin(players){
  if(!rom||running)return;
  initAudio();initializing=true;mode=players;touchPort=1;$('touchPlayer').textContent='Игрок 1';
  try{
    nes=new jsnes.NES({onFrame:render,onAudioSample:sample,sampleRate:audio?.sampleRate||44100});
    nes.loadROM(rom);window.applyPlayers(nes);window.applyRussian(nes);
    frames(25);bootTap(3);frames(8);
    if(players===2)bootTap(2);
    bootTap(3);
    // The cartridge flashes its original title until the intro music finishes.
    for(let i=0;i<480 && nes.cpu.mem[0x18]!==5;i++)nes.frame();
    frames(8);
    $('title').hidden=true;$('touchPlayer').hidden=players!==2;$('pause').disabled=false;
    running=true;stopped=false;last=performance.now();accumulator=0;
  }catch(err){console.error(err);$('status').textContent='Не удалось запустить игру. Обновите страницу.'}finally{initializing=false}
}
const held=new Map();
function press(source,port,button){
  if(!running||stopped||held.has(source))return;
  held.set(source,[port,button]);nes.buttonDown(port,button);
}
function release(source){
  const pair=held.get(source);if(!pair)return;held.delete(source);
  if(![...held.values()].some(v=>v[0]===pair[0]&&v[1]===pair[1]))nes.buttonUp(...pair);
}
function releaseAll(){for(const key of [...held.keys()])release(key);document.querySelectorAll('.active').forEach(b=>b.classList.remove('active'))}
function suspend(value){if(!running)return;releaseAll();stopped=value;$('pause').textContent=stopped?'Продолжить':'Пауза';read=written;last=performance.now();accumulator=0}
const keys={ArrowUp:[1,4],ArrowDown:[1,5],ArrowLeft:[1,6],ArrowRight:[1,7],KeyZ:[1,1],KeyX:[1,0],ShiftLeft:[1,2],ShiftRight:[1,2],Enter:[1,3],KeyW:[2,4],KeyS:[2,5],KeyA:[2,6],KeyD:[2,7],KeyF:[2,1],KeyG:[2,0]};
window.addEventListener('keydown',e=>{
  if($('keys').open)return;
  if(!running){if(rom&&['ArrowDown','ArrowUp','ShiftLeft','ShiftRight'].includes(e.code)){e.preventDefault();modeButtons[document.activeElement===modeButtons[0]?1:0].focus()}else if(e.code==='Enter'&&!e.repeat&&(document.activeElement===document.body||document.activeElement===canvas)){e.preventDefault();begin(1)}return}
  const binding=keys[e.code];if(!binding)return;e.preventDefault();if(e.repeat)return;
  if(stopped&&e.code==='Enter'){suspend(false);return}initAudio();press(e.code,...binding);
});
window.addEventListener('keyup',e=>release(e.code));
window.addEventListener('blur',()=>suspend(true));
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend(true)});
modeButtons.forEach(b=>b.onclick=()=>{b.blur();begin(Number(b.dataset.mode))});
$('pause').onclick=e=>{e.currentTarget.blur();suspend(!stopped)};
$('audio').onclick=e=>{muted=!muted;read=written;if(muted)audio?.suspend();else initAudio();e.currentTarget.textContent=muted?'Звук выкл.':'Звук вкл.';e.currentTarget.setAttribute('aria-pressed',String(!muted));e.currentTarget.blur()};
$('help').onclick=()=>{suspend(true);$('keys').showModal()};$('close').onclick=()=>$('keys').close();
if(!document.fullscreenEnabled)$('full').hidden=true;
$('full').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else $('shell').requestFullscreen().catch(()=>{})};
$('touchPlayer').onclick=()=>{releaseAll();touchPort=3-touchPort;$('touchPlayer').textContent='Игрок '+touchPort};
function wireButton(el,btn,port){
  el.onpointerdown=e=>{e.preventDefault();el.setPointerCapture(e.pointerId);
    if(!running){if(el===$('start'))begin(document.activeElement===modeButtons[1]?2:1);else if(el===$('select'))modeButtons[document.activeElement===modeButtons[0]?1:0].focus();return}
    if(stopped&&el===$('start')){suspend(false);return}
    initAudio();press('p'+e.pointerId,port(),btn);el.classList.add('active')};
  el.onlostpointercapture=e=>{release('p'+e.pointerId);el.classList.remove('active')};
}
document.querySelectorAll('[data-action]').forEach(b=>wireButton(b,+b.dataset.action,()=>touchPort));
wireButton($('select'),2,()=>1);wireButton($('start'),3,()=>1);
const cross=document.querySelector('.cross');
function direction(e){
  const r=cross.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*2-1,y=(e.clientY-r.top)/r.height*2-1;
  const dirs=[y<-.29,y>.29,x<-.29,x>.29];
  dirs.forEach((on,i)=>{const k='dir'+e.pointerId+'-'+i;if(on)press(k,touchPort,4+i);else release(k);cross.querySelector('[data-dir="'+(4+i)+'"]').classList.toggle('active',on)});
}
cross.onpointerdown=e=>{e.preventDefault();cross.setPointerCapture(e.pointerId);direction(e)};
cross.onpointermove=e=>{if(cross.hasPointerCapture(e.pointerId))direction(e)};
cross.onlostpointercapture=e=>{for(let i=0;i<4;i++)release('dir'+e.pointerId+'-'+i);cross.querySelectorAll('.active').forEach(b=>b.classList.remove('active'))};
let last=0,accumulator=0;
function loop(now){
  if(running&&!stopped){accumulator+=Math.min(80,now-last);while(accumulator>=1000/60){nes.frame();accumulator-=1000/60;if(nes.cpu.mem[0x18]===1){showTitle();break}}}
  last=now;requestAnimationFrame(loop);
}
(async()=>{try{const r=await fetch('game.nes');if(!r.ok)throw Error();const bytes=new Uint8Array(await r.arrayBuffer());rom=Array.from(bytes,b=>String.fromCharCode(b)).join('');modeButtons.forEach(b=>b.disabled=false);$('status').textContent='';requestAnimationFrame(loop)}catch{$('status').textContent='Не удалось загрузить картридж. Обновите страницу.'}})();
