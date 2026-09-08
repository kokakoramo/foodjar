/* Food Jar interaction layer. Meal data is owned exclusively by app.js. */
(() => {
  'use strict';
  const M=window.Matter;
  if(!M)return;
  const {Engine,Bodies,Body,Composite,Constraint,Events,Sleeping}=M;
  const W=262,H=304,STEP=1000/60;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let engine,root,entries=[],month='',signature='',frame=0,last=0,accumulator=0,active=true,drag=null;
  let audio,sound=true,lastSound=0,silent=true;
  try{sound=localStorage.getItem('foodjar_sound')!=='off'}catch{}
  function unlock(){
    if(!sound)return;
    try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
      audio??=new Audio();if(audio.state!=='running')audio.resume().catch(()=>{});
    }catch{}
  }
  function chime(speed){
    if(silent||!sound||!audio||audio.state!=='running'||speed<1.5)return;
    const t=audio.currentTime;if(t-lastSound<.085)return;lastSound=t;
    const oscillator=audio.createOscillator(),gain=audio.createGain();
    oscillator.type='sine';const note=[392,440,523.25,587.33,659.25][Math.floor(Math.random()*5)];
    oscillator.frequency.setValueAtTime(note,t);oscillator.frequency.exponentialRampToValueAtTime(note*.65,t+.13);
    gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(Math.min(.045,speed*.003),t+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,t+.22);
    oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(t);oscillator.stop(t+.24);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect()};
  }
  function createWorld(){
    const e=Engine.create({enableSleeping:true,positionIterations:10,constraintIterations:4});
    const wall={isStatic:true,friction:.35,restitution:.25};
    Composite.add(e.world,[Bodies.rectangle(-20,H/2,40,H+200,wall),Bodies.rectangle(W+20,H/2,40,H+200,wall),Bodies.rectangle(W/2,H+15,W+80,30,wall),Bodies.rectangle(W/2,-60,W+80,30,wall),
      // Sloping shoulders and base approximate the existing rounded glass.
      Bodies.rectangle(9,H-8,45,24,{...wall,angle:Math.PI/4}),Bodies.rectangle(W-9,H-8,45,24,{...wall,angle:-Math.PI/4})]);
    return e;
  }
  function paint(){for(const {body,el,size} of entries)el.style.transform=`translate(${body.position.x-size/2}px,${body.position.y-size/2}px) rotate(${body.angle}rad)`}
  function start(){if(!frame&&active&&!document.hidden){last=0;frame=requestAnimationFrame(tick)}}
  function tick(t){
    frame=0;if(!active||document.hidden||!engine)return;
    accumulator+=last?Math.min(t-last,50):STEP;last=t;
    while(accumulator>=STEP){
      for(const {body} of entries){if(body.speed>12)Body.setVelocity(body,{x:body.velocity.x*12/body.speed,y:body.velocity.y*12/body.speed})}
      Engine.update(engine,STEP);accumulator-=STEP;
    }
    paint();if(drag||entries.some(x=>!x.body.isSleeping))frame=requestAnimationFrame(tick);
  }
  function point(event){const r=root.getBoundingClientRect();return {x:(event.clientX-r.left)*W/r.width,y:(event.clientY-r.top)*H/r.height}}
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function release(){if(!drag)return;Composite.remove(engine.world,drag.constraint);drag.el.classList.remove('dragging');drag=null;start()}
  function attach(entry,onOpen){
    const {el,body,size}=entry;let suppress=false;
    el.onpointerdown=e=>{
      if(drag||!e.isPrimary||e.button!==0)return;unlock();const p=point(e);Sleeping.set(body,false);
      const constraint=Constraint.create({pointA:p,bodyB:body,pointB:{x:p.x-body.position.x,y:p.y-body.position.y},length:0,stiffness:.12,damping:.15});
      Composite.add(engine.world,constraint);drag={constraint,el,body,start:p,moved:false,pointer:e.pointerId};suppress=false;
      el.setPointerCapture(e.pointerId);el.classList.add('dragging');start();
    };
    el.onpointermove=e=>{if(!drag||drag.el!==el||drag.pointer!==e.pointerId)return;
      const p=point(e);if(Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>6)drag.moved=true;
      drag.constraint.pointA={x:clamp(p.x,size/2+5,W-size/2-5),y:clamp(p.y,size/2+3,H-size/2-10)};
      Sleeping.set(body,false);start();
    };
    el.onpointerup=e=>{if(drag?.el!==el||drag.pointer!==e.pointerId)return;suppress=drag.moved;release()};
    el.onpointercancel=el.onlostpointercapture=()=>{if(drag?.el===el){suppress=true;release()}};
    el.onclick=e=>{if(suppress){suppress=false;e.preventDefault();return}onOpen(entry.id)};
    el.onkeydown=e=>{const delta={ArrowLeft:[-15,0],ArrowRight:[15,0],ArrowUp:[0,-22],ArrowDown:[0,15]}[e.key];if(!delta)return;
      e.preventDefault();unlock();Sleeping.set(body,false);Body.setPosition(body,{x:clamp(body.position.x+delta[0],size/2+5,W-size/2-5),y:clamp(body.position.y+delta[1],size/2+3,H-size/2-10)});Body.setVelocity(body,{x:0,y:0});start();
    };
  }
  function render(node,meals,key,dropId,onOpen){
    const next=JSON.stringify(meals.map(m=>[m.id,m.price,m.image,m.title,m.emoji]));
    if(key===month&&next===signature&&!dropId){start();return}
    const previous=new Map(key===month?entries.map(e=>[e.id,{position:{...e.body.position},angle:e.body.angle}]):[]);
    release();cancelAnimationFrame(frame);frame=0;if(engine){Events.off(engine);Composite.clear(engine.world,false);Engine.clear(engine)}
    engine=createWorld();root=node;month=key;signature=next;root.replaceChildren();root.classList.add('physics-items');entries=[];accumulator=0;
    const raw=meals.map(m=>Math.max(48,Math.min(83,48+Math.sqrt(Number(m.price)||0)*2.2)));
    const scale=Math.min(1,Math.sqrt(W*H*.52/(raw.reduce((a,s)=>a+s*s,0)||1)));
    meals.forEach((m,i)=>{
      const size=raw[i]*scale,old=previous.get(m.id),dropping=m.id===dropId&&!reduced.matches;
      const columns=meals.length>9?4:3;
      const x=old?.position.x??((i%columns+.5)*W/columns),y=old?.position.y??((Math.floor(i/columns)+.5)*H/Math.ceil(meals.length/columns));
      const body=Bodies.rectangle(dropping?W/2:x,dropping?-size/2:y,size,size,{chamfer:{radius:size*.18},restitution:.32,friction:.5,frictionAir:.018,sleepThreshold:45});
      Body.setAngle(body,old?.angle??(i%3-1)*.12);
      const el=document.createElement('button');el.type='button';el.className='jar-item physics-item'+(!m.image?' emoji':'');el.style.width=el.style.height=size+'px';
      el.title=`${m.title||m.type} · NT$${m.price}`;el.setAttribute('aria-label',el.title+'；可拖曳，或用方向鍵移動');el.dataset.mealId=m.id;
      if(m.image){const img=document.createElement('img');img.src=m.image;img.alt=m.title||m.type;img.draggable=false;el.append(img)}else el.textContent=m.emoji||'🍬';
      const entry={id:m.id,body,el,size};entries.push(entry);root.append(el);attach(entry,onOpen);
      if(!dropping)Composite.add(engine.world,body);
    });
    silent=true;for(let i=0;i<180;i++)Engine.update(engine,STEP);
    const dropped=entries.find(e=>e.id===dropId);
    if(dropped&&!reduced.matches){Composite.add(engine.world,dropped.body);Body.setAngularVelocity(dropped.body,.025);
      const lid=document.querySelector('.jar-lid');lid?.animate([{transform:'translateY(0)'},{transform:'translateY(-22px) rotate(-7deg)',offset:.2},{transform:'translateY(0)'}],{duration:650});
    }
    silent=false;Events.on(engine,'collisionStart',event=>{let strength=0;for(const pair of event.pairs)strength=Math.max(strength,Math.hypot(pair.bodyA.velocity.x-pair.bodyB.velocity.x,pair.bodyA.velocity.y-pair.bodyB.velocity.y));chime(strength)});
    paint();start();
  }
  function setActive(value){active=value;if(!active){release();cancelAnimationFrame(frame);frame=0}else start()}
  document.addEventListener('visibilitychange',()=>{if(document.hidden){release();cancelAnimationFrame(frame);frame=0}else start()});
  window.addEventListener('blur',release);
  function setupSound(button){
    const label=()=>{button.textContent=sound?'♫ 音效開':'♫ 音效關';button.setAttribute('aria-pressed',String(sound))};label();
    button.onclick=()=>{sound=!sound;try{localStorage.setItem('foodjar_sound',sound?'on':'off')}catch{}label();if(sound){unlock();if(audio)audio.resume().then(()=>chime(5)).catch(()=>{})}else audio?.suspend().catch(()=>{})};
  }
  window.FoodJarPhysics={render,setActive,unlock,setupSound,createWorld};
})();
