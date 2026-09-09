(() => {
  'use strict';
  const $ = (s,root=document) => root.querySelector(s);
  const $$ = (s,root=document) => [...root.querySelectorAll(s)];
  const money = n => 'NT$' + Math.round(Number(n||0)).toLocaleString('zh-TW');
  const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const typeEmoji={早餐:'🥐',午餐:'🍱',晚餐:'🍜',飲料:'🥤',甜點:'🍰',宵夜:'🌙'};
  const LS_KEY='foodjar_v6_state';
  const PREVIEW_KEY='foodjar_v6_preview';
  const now = new Date();

  const defaultState = () => ({
    profile:{jarName:'我的飯飯罐',budget:8000,theme:'blush',avatar:'🍓',email:'preview@foodjar.local'},
    meals:[
      {id:'demo-1',date:'2026-09-05',title:'雞腿便當',type:'午餐',price:120,payment:'現金',note:'今天的雞腿很香 ♡',emoji:'🍱',sticker:true},
      {id:'demo-2',date:'2026-09-04',title:'無糖豆漿',type:'早餐',price:35,payment:'行動支付',note:'',emoji:'🥛',sticker:true},
      {id:'demo-3',date:'2026-09-04',title:'鮭魚飯糰',type:'早餐',price:49,payment:'行動支付',note:'',emoji:'🍙',sticker:true},
      {id:'demo-4',date:'2026-09-03',title:'冰拿鐵',type:'飲料',price:75,payment:'信用卡',note:'下午需要一點咖啡。',emoji:'☕',sticker:true},
      {id:'demo-5',date:'2026-09-02',title:'雞肉沙拉',type:'晚餐',price:135,payment:'現金',note:'',emoji:'🥗',sticker:true},
      {id:'demo-6',date:'2026-09-01',title:'草莓優格',type:'甜點',price:90,payment:'行動支付',note:'',emoji:'🍓',sticker:true}
    ]
  });

  let state = loadState();
  let storageReady=false;
  let saving=false;
  let photoRequest=0;
  let pendingDrop=null;
  let celebratingId=null;
  let selectedMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  let activeFilter='全部';
  let editingId=null;
  let detailId=null;
  let photoData='';
  let stickerOn=true;
  let session=null;
  let deferredInstall=null;

  function safeLSGet(k){try{return localStorage.getItem(k)}catch{return null}}
  function safeLSSet(k,v){try{localStorage.setItem(k,v);return true}catch{return false}}
  function safeLSRemove(k){try{localStorage.removeItem(k)}catch{}}
  function loadState(){
    try{const raw=safeLSGet(LS_KEY);if(raw){const parsed=JSON.parse(raw);if(parsed?.profile&&Array.isArray(parsed.meals)){for(const meal of parsed.meals){if(meal.image==='assets/demo-sticker.png'){meal.image='';meal.emoji='🍱'}}return parsed}}}catch{}
    const fresh=defaultState();fresh.meals=[];fresh.profile.email='';return fresh;
  }
  async function persist(){
    if(!storageReady){toast('儲存空間未就緒，請重新開啟網站後再試');return false}
    try{await window.FoodJarStorage.write(state);updateStorageStatus();navigator.storage?.persist?.().catch(()=>{});return true}
    catch(error){toast(error?.message==='STALE_STATE'?'其他分頁已更新紀錄，請重新整理後再操作':'無法儲存，請檢查瀏覽器空間或匯出備份');return false}
  }
  function updateStorageStatus(){
    const el=$('#storageStatus');if(!el)return;
    el.textContent=storageReady?`已保存 ${state.meals.length} 餐於此瀏覽器`+(window.FoodJarStorage.status?.mirror?' · 復原副本已更新':' · 請匯出備份保護照片'):'紀錄讀取失敗，請重新讀取；目前已停用儲存，避免覆蓋原資料';
    $('#retryStorage').classList.toggle('hidden',storageReady);
  }
  async function readRecords(){
    storageReady=false;
    try{const saved=await window.FoodJarStorage.read();if(saved)state=saved;
      if(!saved&&state.meals.length)await window.FoodJarStorage.write(state);
      storageReady=true;
      if(window.FoodJarStorage.status?.recovered)toast('已從本機復原副本找回紀錄');
    }catch{toast('紀錄讀取失敗，沒有清除你的資料，請按重新讀取')}
    state.budgets??={};updateStorageStatus();
  }
  function normalizeState(value){
    if(!value?.profile||!Array.isArray(value.meals))throw new Error('備份格式不正確');
    const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
    const ids=new Set();
    const meals=value.meals.map(m=>{
      if(typeof m.id!=='string'||ids.has(m.id)||!validDate(m.date)||!Number.isFinite(Number(m.price))||Number(m.price)<0)throw new Error('餐點資料不正確');
      ids.add(m.id);
      const image=typeof m.image==='string'&&(/^(data:image\/(png|jpeg|webp);base64,|https:\/\/)/.test(m.image))?m.image:'';
      return {id:m.id,date:m.date,title:String(m.title||'').slice(0,40),type:Object.hasOwn(typeEmoji,m.type)?m.type:'午餐',price:Number(m.price),payment:String(m.payment||''),note:String(m.note||'').slice(0,80),image,emoji:Object.values(typeEmoji).includes(m.emoji)?m.emoji:undefined,sticker:m.sticker!==false};
    });
    const profile={...defaultState().profile,...value.profile};
    profile.jarName=String(profile.jarName||'我的飯飯罐').slice(0,24);
    profile.avatar=['🍓','🍒','🧸','🌷','🍮'].includes(profile.avatar)?profile.avatar:'🍓';
    profile.theme=['blush','mint','lavender'].includes(profile.theme)?profile.theme:'blush';
    profile.budget=Number.isFinite(Number(profile.budget))&&Number(profile.budget)>=100?Number(profile.budget):8000;
    profile.email='';
    const budgets={};for(const [month,budget] of Object.entries(value.budgets||{})){if(/^\d{4}-(0[1-9]|1[0-2])$/.test(month)&&Number.isFinite(Number(budget))&&Number(budget)>=100)budgets[month]=Number(budget)}
    return {profile,meals,budgets};
  }
  function monthBudget(){return Number(state.budgets?.[ym()]??state.profile.budget)||8000}

  function hash(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}return Math.abs(h)}
  function ym(d=selectedMonth){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
  function mealsForMonth(){const prefix=ym();return state.meals.filter(m=>m.date?.startsWith(prefix)).sort((a,b)=>b.date.localeCompare(a.date))}
  function monthTotal(){return mealsForMonth().reduce((s,m)=>s+Number(m.price||0),0)}
  function daysInMonth(){return new Date(selectedMonth.getFullYear(),selectedMonth.getMonth()+1,0).getDate()}
  function isCurrentMonth(){return selectedMonth.getFullYear()===now.getFullYear()&&selectedMonth.getMonth()===now.getMonth()}
  function todayISO(){return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`}
  function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.remove('hidden');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.add('hidden'),2300)}
  function fmtDate(iso){const d=new Date(iso+'T12:00:00');return `${d.getMonth()+1}/${d.getDate()}`}
  function weekday(iso){return ['日','一','二','三','四','五','六'][new Date(iso+'T12:00:00').getDay()]}
  function monthLabel(){return `${monthNames[selectedMonth.getMonth()]} ${selectedMonth.getFullYear()}`}

  async function boot(){
    await readRecords();
    bindEvents();
    $('#retryStorage').onclick=async()=>{await readRecords();renderAll()};
    window.FoodJarPhysics?.setupSound($('#jarSound'));
    if('serviceWorker' in navigator && location.protocol.startsWith('http')){
      navigator.serviceWorker.register('sw.js').then(()=>navigator.serviceWorker.ready).then(()=>{$('#offlineStatus').textContent='離線已準備好，沒有網路也能記帳'}).catch(()=>{$('#offlineStatus').textContent='離線功能尚未就緒，請連網後重新開啟'});
    }else $('#offlineStatus').textContent='此瀏覽器目前未啟用離線功能';
    if(window.FOOD_JAR_CONFIG?.LOCAL_ONLY!==false){showApp();return}
    const cloud=window.FoodJarCloud;
    if(cloud?.configured){
      try{session=await cloud.getSession();if(session){await hydrateCloud();showApp();return}}catch(e){console.warn(e)}
    }
    if(new URLSearchParams(location.search).get('preview')==='1'){safeLSSet(PREVIEW_KEY,'1');showApp();return;}
    if(safeLSGet(PREVIEW_KEY)==='1') showApp(); else showAuth();
  }

  function showAuth(){ $('#authView').classList.remove('hidden');$('#appView').classList.add('hidden'); }
  function showApp(){ $('#authView').classList.add('hidden');$('#appView').classList.remove('hidden');renderAll(); }

  async function hydrateCloud(){
    if(!session) return;
    try{
      const remote=await window.FoodJarCloud.loadCloudState(session.user.id);
      if(remote){
        state.meals=(remote.meals||[]).map(r=>({id:r.id,date:r.date,title:r.title||'',type:r.type||'午餐',price:Number(r.price||0),payment:r.payment||'',note:r.note||'',image:r.resolved_image_url||r.image_url||'',imagePath:r.image_path||'',sticker:r.sticker!==false}));
        if(remote.profile) state.profile={...state.profile,jarName:remote.profile.jar_name||state.profile.jarName,budget:Number(remote.profile.budget||8000),theme:remote.profile.theme||'blush',avatar:remote.profile.avatar||'🍓'};
        state.profile.email=session.user.email||''; persist();
      }
    }catch(e){console.warn('cloud hydrate',e);toast('雲端同步暫時失敗，先使用本機資料')}
  }

  function renderAll(){
    document.body.dataset.theme=state.profile.theme||'blush';
    $('#avatarEmoji').textContent=state.profile.avatar;$('#bigAvatar').textContent=state.profile.avatar;
    $('#profileName').textContent=state.profile.jarName;$('#jarNameHeading').textContent=state.profile.jarName;$('#jarLabelText').textContent=state.profile.jarName.length>10?'my food jar':state.profile.jarName;
    $('#profileEmail').textContent=session?.user?.email||'我的飲食日記';
    $('#jarNameInput').value=state.profile.jarName;$('#budgetInput').value=monthBudget();$('#budgetMonthLabel').textContent=ym()+' 餐飲預算';
    $$('.theme-dot').forEach(b=>b.classList.toggle('active',b.dataset.themeValue===state.profile.theme));
    $$('.avatar-option').forEach(b=>b.classList.toggle('active',b.textContent.trim()===state.profile.avatar));
    $('#desktopMonthTitle').textContent=monthLabel();$('#monthLabel').textContent=monthLabel();$('#monthPicker').value=ym();
    $('#monthSubLabel').textContent=isCurrentMonth()?'this month':'archive jar';
    $('#diaryEyebrow').textContent=`${monthNames[selectedMonth.getMonth()].toUpperCase()} DIARY`;
    $('#recapMonth').textContent=`${monthNames[selectedMonth.getMonth()].toUpperCase()} ${selectedMonth.getFullYear()}`;
    $('#dayStamp').textContent=`${monthNames[now.getMonth()].slice(0,3).toUpperCase()} ${String(now.getDate()).padStart(2,'0')}`;
    renderHome();renderDiary();renderRecap();renderProfile();renderAccountMode();
  }

  function renderHome(){
    const ms=mealsForMonth(), total=monthTotal(), budget=monthBudget(), pct=Math.min(100,total/budget*100), avg=ms.length?total/ms.length:0;
    $('#monthTotal').textContent=money(total);$('#homeAvg').textContent=money(avg);$('#homeRemaining').textContent=money(Math.max(0,budget-total));$('#jarCount').textContent=`${ms.length} meals`;
    $('#budgetHint').textContent=`${money(total)} / ${money(budget)}`;$('#budgetProgress').style.width=`${pct}%`;$('#budgetWash').style.height=`${Math.min(88,pct*.88)}%`;
    const elapsed=isCurrentMonth()?now.getDate():daysInMonth(), pacePct=elapsed/daysInMonth()*100;$('#paceMarker').style.left=`${pacePct}%`;
    $('#pacePercent').textContent=`${Math.round(pct)}%`;$('.pace-ring').style.setProperty('--ring',`${pct}%`);
    const remDays=Math.max(1,daysInMonth()-elapsed+1), remaining=Math.max(0,budget-total);$('#dailyAllowance').textContent=money(remaining/remDays);
    const forecast=elapsed?total/elapsed*daysInMonth():0;$('#forecastSpend').textContent=money(forecast);
    const todayCount=state.meals.filter(m=>m.date===todayISO()).length;$('#todayMeals').textContent=`${todayCount} 餐`;
    let badge='還有很多空間 ✿', title='慢慢裝滿就好 ♡', copy='目前的花費節奏很舒服，繼續記錄就能看到更準確的月底預估。';
    if(pct>=100){badge='罐子滿出來了！';title='這個月已超過預算';copy='先看看哪些大顆糖果最常出現，不用責怪自己，當作下個月的線索。'} else if(pct>pacePct+10){badge='稍微比進度快一些';title='花費跑在月份前面';copy='接下來幾天可以稍微留意飲料、甜點或較大的餐費。'} else if(pct>70){badge='罐子快滿囉 ♡';title='已經來到後半段';copy='剩下的預算可以留給真正想吃的東西。'}
    $('#budgetBadge').textContent=badge;$('#paceTitle').textContent=title;$('#paceCopy').textContent=copy;
    $('#monthDelta').textContent=ms.length?`已經收進 ${ms.length} 餐，每一顆都是這個月的生活。`:'這個月還是空罐子，從第一餐開始吧 ♡';
    renderJar(ms);renderRecent(ms.slice(0,4));
  }

  function renderJar(ms){
    const root=$('#jarItems');
    if(window.FoodJarPhysics){
      const shown=ms.filter(m=>m.id!==celebratingId).slice(0,14);
      if(pendingDrop&&!shown.some(m=>m.id===pendingDrop)){const incoming=ms.find(m=>m.id===pendingDrop);if(incoming){shown.pop();shown.push(incoming)}}
      window.FoodJarPhysics.render(root,shown,ym(),pendingDrop,openDetail);pendingDrop=null;
      const over=$('#overflowItems');over.classList.toggle('hidden',ms.length<=shown.length);over.textContent=`+${ms.length-shown.length}`;over.onclick=()=>goPage('diaryPage');return;
    }
    root.innerHTML='';
    const shown=ms.slice(0,14);
    shown.forEach((m,i)=>{
      const seed=hash(m.id), price=Number(m.price||0);const size=Math.max(48,Math.min(83,48+Math.sqrt(price)*2.2));
      const x=8+(seed%72), row=Math.floor(i/4), y=10+row*22+((seed>>5)%8);const rot=(seed%31)-15;
      const b=document.createElement('button');b.type='button';b.className='jar-item'+(!m.image?' emoji':'');b.style.cssText=`width:${size}px;height:${size}px;left:${Math.min(82,x)}%;bottom:${Math.min(73,y)}%;transform:translateX(-50%) rotate(${rot}deg)`;b.title=`${m.title||m.type} ${money(m.price)}`;b.addEventListener('click',()=>openDetail(m.id));
      if(m.image){const img=document.createElement('img');img.src=m.image;img.alt=m.title||m.type;b.appendChild(img)}else{b.textContent=m.emoji||typeEmoji[m.type]||'🍬'}
      root.appendChild(b);
    });
    const over=$('#overflowItems');if(ms.length>shown.length){over.classList.remove('hidden');over.textContent=`+${ms.length-shown.length}`;over.onclick=()=>goPage('diaryPage')}else over.classList.add('hidden');
  }
  function renderRecent(ms){const root=$('#recentMeals');root.innerHTML='';if(!ms.length){root.innerHTML='<div class="empty-state" style="grid-column:1/-1"><span>🍬</span><h3>第一顆糖果還在路上</h3><p>新增一餐後，它會出現在這裡。</p></div>';return}ms.forEach(m=>{const c=document.createElement('button');c.type='button';c.className='recent-card';c.style.textAlign='left';c.style.cursor='pointer';c.innerHTML=`<div class="recent-photo">${m.image?`<img src="${escapeAttr(m.image)}" alt="">`:`<span style="font-size:44px">${m.emoji||typeEmoji[m.type]||'🍬'}</span>`}</div><b>${escapeHtml(m.title||m.type)}</b><span>${fmtDate(m.date)} · ${escapeHtml(m.type)} <strong>${money(m.price)}</strong></span>`;c.onclick=()=>openDetail(m.id);root.appendChild(c)})}

  function renderDiary(){
    const ms=mealsForMonth(), total=monthTotal(), avg=ms.length?total/ms.length:0;$('#diaryCountBig').textContent=ms.length;$('#diarySpendBig').textContent=money(total);$('#diaryAvgBig').textContent=money(avg);
    const q=($('#diarySearch')?.value||'').trim().toLowerCase();const filtered=ms.filter(m=>(activeFilter==='全部'||m.type===activeFilter)&&(!q||`${m.title} ${m.note} ${m.payment} ${m.type}`.toLowerCase().includes(q)));
    const root=$('#diaryList');root.innerHTML='';if(!filtered.length){root.innerHTML='<div class="empty-state"><span>📖</span><h3>找不到這些餐點</h3><p>換個分類或搜尋詞看看。</p></div>';return}
    const groups={};filtered.forEach(m=>(groups[m.date]??=[]).push(m));Object.keys(groups).sort((a,b)=>b.localeCompare(a)).forEach(date=>{
      const day=document.createElement('section');day.className='diary-day';const dayTotal=groups[date].reduce((s,m)=>s+Number(m.price||0),0);day.innerHTML=`<div class="diary-day-head"><b>${fmtDate(date)} 星期${weekday(date)}</b><span>${groups[date].length} 餐 · ${money(dayTotal)}</span></div>`;
      groups[date].forEach(m=>{const row=document.createElement('button');row.type='button';row.className='meal-row';row.style.width='100%';row.style.borderLeft='0';row.style.borderRight='0';row.style.borderBottom='0';row.style.background='transparent';row.style.textAlign='left';row.innerHTML=`<div class="meal-thumb">${m.image?`<img src="${escapeAttr(m.image)}" alt="">`:`<span style="font-size:32px">${m.emoji||typeEmoji[m.type]||'🍬'}</span>`}</div><div class="meal-copy"><b>${escapeHtml(m.title||m.type)}</b><p>${escapeHtml(m.note||m.payment||'沒有備註')}</p></div><div class="meal-price"><b>${money(m.price)}</b><span>${escapeHtml(m.type)}</span></div>`;row.onclick=()=>openDetail(m.id);day.appendChild(row)});root.appendChild(day)
    });
  }

  function renderRecap(){
    const ms=mealsForMonth(),total=monthTotal(),avg=ms.length?total/ms.length:0,max=ms.length?Math.max(...ms.map(m=>Number(m.price||0))):0,budget=monthBudget();
    $('#recapTotal').textContent=money(total);$('#budgetText').textContent=`本月預算 ${money(budget)} · 已使用 ${budget?Math.round(total/budget*100):0}%`;
    $('#statMeals').textContent=ms.length;$('#statAvg').textContent=money(avg);$('#statMax').textContent=money(max);$('#statTreats').textContent=ms.filter(m=>['飲料','甜點'].includes(m.type)).length;
    renderWeekBars(ms);renderCategoryBars(ms);renderCalendar(ms);
  }
  function renderWeekBars(ms){const weeks=[0,0,0,0,0];ms.forEach(m=>{const d=Number(m.date.slice(-2));weeks[Math.min(4,Math.floor((d-1)/7))]+=Number(m.price||0)});const max=Math.max(1,...weeks),peak=Math.max(...weeks),pi=weeks.indexOf(peak);$('#weekPeak').textContent=peak?`第 ${pi+1} 週最多`:'尚無資料';const root=$('#weekBars');root.innerHTML='';weeks.forEach((v,i)=>{const el=document.createElement('div');el.className='week-bar';el.innerHTML=`<b>${v?money(v):'—'}</b><i style="height:${Math.max(4,v/max*120)}px"></i><span>W${i+1}</span>`;root.appendChild(el)})}
  function renderCategoryBars(ms){const types=['早餐','午餐','晚餐','飲料','甜點','宵夜'];const count=Object.fromEntries(types.map(t=>[t,0]));ms.forEach(m=>count[m.type]=(count[m.type]||0)+1);const max=Math.max(1,...Object.values(count));const top=types.sort((a,b)=>count[b]-count[a])[0];$('#topCategory').textContent=ms.length?`${top}最多`:'尚無資料';const root=$('#categoryBars');root.innerHTML='';types.forEach(t=>{const el=document.createElement('div');el.className='category-row';el.innerHTML=`<span>${t}</span><div class="category-track"><i style="width:${count[t]/max*100}%"></i></div><b>${count[t]}</b>`;root.appendChild(el)})}
  function renderCalendar(ms){const y=selectedMonth.getFullYear(),m=selectedMonth.getMonth(),first=new Date(y,m,1),dim=daysInMonth();let start=(first.getDay()+6)%7;const spend={};ms.forEach(x=>spend[Number(x.date.slice(-2))]=(spend[Number(x.date.slice(-2))]||0)+Number(x.price||0));const vals=Object.values(spend),mx=Math.max(1,...vals);$('#activeDays').textContent=`${Object.keys(spend).length} days`;const root=$('#spendCalendar');root.innerHTML='';for(let i=0;i<start;i++){const c=document.createElement('div');c.className='calendar-cell blank';root.appendChild(c)}for(let d=1;d<=dim;d++){const v=spend[d]||0,level=v?Math.max(1,Math.ceil(v/mx*4)):0,c=document.createElement('div');c.className='calendar-cell';if(level)c.dataset.level=level;c.textContent=d;c.title=v?`${d} 日 ${money(v)}`:`${d} 日`;if(v)c.innerHTML+=`<i></i>`;root.appendChild(c)}}
  function renderProfile(){const months=new Set(state.meals.map(m=>m.date?.slice(0,7)).filter(Boolean));$('#profileMeals').textContent=state.meals.length;$('#profileMonths').textContent=Math.max(1,months.size)}
  function renderAccountMode(){const cloud=Boolean(session);$('#syncText').textContent=cloud?'email account':'儲存在此裝置';$('#accountModeText').textContent=cloud?'Email Magic Link 已登入':'不需登入，紀錄保留在此瀏覽器';$('#accountTitle').textContent=cloud?'Email account':'本機保存';$('#accountMeta').textContent=cloud?(session.user.email||'已登入'):'資料儲存在這個瀏覽器';$('#accountDot').style.background=cloud?'#7fc38a':'#f0b65b'}

  function goPage(id){window.FoodJarPhysics?.setActive(id==='jarPage');$$('.page').forEach(p=>p.classList.toggle('active',p.id===id));$$('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===id));window.scrollTo({top:0,behavior:'smooth'});if(id==='diaryPage')renderDiary();if(id==='recapPage')renderRecap()}

  function openMealModal(id=null){photoRequest++;$('#saveMealBtn').disabled=false;editingId=id;photoData='';stickerOn=true;$('#stickerToggle').classList.add('active');$('#photoStage').classList.remove('sticker');
    if(id){const m=state.meals.find(x=>x.id===id);if(!m)return;$('#mealModalTitle').textContent='編輯這顆糖果 ♡';$('#priceInput').value=m.price;$('#typeInput').value=m.type;$('#titleInput').value=m.title||'';$('#dateInput').value=m.date;$('#paymentInput').value=m.payment||'';$('#noteInput').value=m.note||'';photoData=m.image||'';stickerOn=m.sticker!==false;if(photoData)showPhoto(photoData);else resetPhoto();}
    else{$('#mealModalTitle').textContent='餵一顆糖果給罐子 🍬';$('#priceInput').value='';$('#typeInput').value='午餐';$('#titleInput').value='';$('#dateInput').value=todayISO();$('#paymentInput').value='';$('#noteInput').value='';resetPhoto()}
    syncTypeChips();$('#mealModal').classList.remove('hidden');document.body.style.overflow='hidden';
  }
  function closeMealModal(){photoRequest++;  $('#mealModal').classList.add('hidden');document.body.style.overflow='';editingId=null }
  function syncTypeChips(){$$('[data-meal-type]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mealType===$('#typeInput').value)))}
  function resetPhoto(){photoData='';$('#uploadPrompt').classList.remove('hidden');$('#photoStage').classList.add('hidden');$('#photoActions').classList.add('hidden');$('#photoInput').value=''}
  function showPhoto(src){$('#uploadPrompt').classList.add('hidden');$('#photoStage').classList.remove('hidden');$('#photoActions').classList.remove('hidden');$('#photoPreview').src=src;$('#photoStage').classList.toggle('sticker',stickerOn)}

  async function handlePhoto(file){
    if(!file)return;const request=++photoRequest;$('#saveMealBtn').disabled=true;
    try{
      const compressed=await compressImage(file,900,.84);if(request!==photoRequest)return;
      photoData=compressed;showPhoto(photoData);$('#photoStatus').textContent='✦ 照片已準備好';
      const endpoint=window.FOOD_JAR_CONFIG?.REMOVE_BG_ENDPOINT;
      if(endpoint){
        $('#photoStatus').textContent='⋆ AI 去背中…';
        try{const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:compressed})});
          if(!res.ok)throw new Error('去背失敗');const data=await res.json();if(request!==photoRequest)return;
          if(typeof data.image!=='string'||!data.image.startsWith('data:image/png;base64,'))throw new Error('無效圖片');
          photoData=data.image;showPhoto(photoData);$('#photoStatus').textContent='✦ AI 去背完成';
        }catch{if(request===photoRequest)$('#photoStatus').textContent='✦ 使用原圖貼紙'}
      }
    }catch{if(request===photoRequest)toast('照片讀取失敗，請換一張試試')}
    finally{if(request===photoRequest)$('#saveMealBtn').disabled=false}
  }
  function compressImage(file,max=900,quality=.84){return new Promise((resolve,reject)=>{const fr=new FileReader();fr.onerror=reject;fr.onload=()=>{const img=new Image();img.onerror=reject;img.onload=()=>{let w=img.width,h=img.height;if(Math.max(w,h)>max){const r=max/Math.max(w,h);w=Math.round(w*r);h=Math.round(h*r)}const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.drawImage(img,0,0,w,h);resolve(c.toDataURL(file.type==='image/png'?'image/png':'image/jpeg',quality))};img.src=fr.result};fr.readAsDataURL(file)})}

  async function saveMeal(){if(saving)return;window.FoodJarPhysics?.unlock();const wasEditing=Boolean(editingId);const price=Number($('#priceInput').value);if(!Number.isFinite(price)||price<=0){toast('先填上這餐的價格 ♡');$('#priceInput').focus();return}const date=$('#dateInput').value||todayISO();const existing=editingId?state.meals.find(m=>m.id===editingId):null;const meal={id:editingId||`meal-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,date,title:$('#titleInput').value.trim()||$('#typeInput').value,type:$('#typeInput').value,price,payment:$('#paymentInput').value,note:$('#noteInput').value.trim(),image:photoData||existing?.image||'',imagePath:existing?.imagePath||'',emoji:existing?.emoji||(!photoData?typeEmoji[$('#typeInput').value]:''),sticker:stickerOn};
    const before=structuredClone(state);saving=true;$('#saveMealBtn').disabled=true;
    if(editingId){const idx=state.meals.findIndex(m=>m.id===editingId);state.meals[idx]=meal}else state.meals.push(meal);const stored=await persist();saving=false;$('#saveMealBtn').disabled=false;if(!stored){state=before;return}if(session){window.FoodJarCloud.upsertMeal(session.user.id,meal).then(remote=>{const i=state.meals.findIndex(x=>x.id===meal.id);if(i>=0){state.meals[i]=remote;persist();renderAll()}}).catch(()=>toast('已存在本機，雲端同步失敗，請先匯出備份'))}selectedMonth=new Date(Number(date.slice(0,4)),Number(date.slice(5,7))-1,1);closeMealModal();if(!wasEditing){celebratingId=meal.id;goPage('jarPage');renderAll();$('#jarItems').scrollIntoView({block:'center',behavior:'instant'});
      const drop=()=>{celebratingId=null;pendingDrop=meal.id;renderAll()};
      if(window.FoodJarCelebration){saving=true;await window.FoodJarCelebration.play(meal,monthTotal()-meal.price,monthTotal(),drop);saving=false}else drop();
    }else renderAll();toast(wasEditing?'已更新這顆糖果 ♡':'已放進糖果罐 🍬')}

  function openDetail(id){detailId=id;const m=state.meals.find(x=>x.id===id);if(!m)return;$('.detail-emoji')?.remove();const img=$('#detailImage');if(m.image){img.src=m.image;img.style.display='block'}else{img.removeAttribute('src');img.style.display='none';const emoji=document.createElement('span');emoji.className='detail-emoji';emoji.style.fontSize='76px';emoji.textContent=m.emoji||typeEmoji[m.type]||'🍬';$('.detail-photo').append(emoji)}$('#detailDate').textContent=`${m.date} · 星期${weekday(m.date)}`;$('#detailTitle').textContent=m.title||m.type;$('#detailType').textContent=m.type;$('#detailPrice').textContent=money(m.price);$('#detailMeta').textContent=[m.payment,`記錄於 ${fmtDate(m.date)}`].filter(Boolean).join(' · ');const note=$('#detailNote');note.textContent=m.note||'';note.classList.toggle('hidden',!m.note);$('#detailModal').classList.remove('hidden');document.body.style.overflow='hidden'}
  function closeDetail(){const wrap=$('.detail-photo');if(!wrap.querySelector('img'))wrap.innerHTML='<img id="detailImage" alt="餐點">';$('#detailModal').classList.add('hidden');document.body.style.overflow='';detailId=null}
  async function deleteDetail(){if(!detailId)return;if(!confirm('要刪掉這筆餐點嗎？'))return;const id=detailId;const doomed=state.meals.find(m=>m.id===id);const before=structuredClone(state);state.meals=state.meals.filter(m=>m.id!==id);if(!await persist()){state=before;return}if(session)window.FoodJarCloud.deleteMeal(session.user.id,id,doomed?.imagePath).catch(()=>{});closeDetail();renderAll();toast('已刪除這筆紀錄')}

  async function saveSettings(){const before=structuredClone(state);state.profile.jarName=$('#jarNameInput').value.trim()||'我的飯飯罐';const budget=Number($('#budgetInput').value);if(!Number.isFinite(budget)||budget<100){state=before;toast('預算請填 100 以上的金額');return}state.budgets[ym()]=budget;if(!await persist()){state=before;return}if(session)window.FoodJarCloud.saveProfile(session.user.id,state.profile).catch(()=>toast('設定同步失敗，請稍後再按儲存'));renderAll();toast('設定已儲存 ♡')}

  async function shareCard(){const ms=mealsForMonth(),c=$('#shareCanvas'),ctx=c.getContext('2d');ctx.fillStyle='#fff7f8';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#ef8eaa';for(let x=55;x<c.width;x+=55)for(let y=60;y<c.height;y+=55){ctx.globalAlpha=.13;ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1;ctx.fillStyle='#5a454b';ctx.textAlign='center';ctx.font='700 42px Arial';ctx.fillText(monthLabel().toUpperCase(),540,210);ctx.font='700 78px Arial';ctx.fillText('My Food Jar ♡',540,315);ctx.fillStyle='#fff';roundRect(ctx,120,410,840,980,68);ctx.fill();ctx.strokeStyle='#b9dfe0';ctx.lineWidth=18;ctx.stroke();ctx.fillStyle='#f097b2';roundRect(ctx,245,350,590,130,55);ctx.fill();ctx.textAlign='left';const emojis=ms.slice(0,16).map(m=>m.emoji||typeEmoji[m.type]||'🍬');ctx.font='64px Arial';emojis.forEach((e,i)=>ctx.fillText(e,190+(i%4)*180,1260-Math.floor(i/4)*155));ctx.textAlign='center';ctx.fillStyle='#5a454b';ctx.font='700 86px Arial';ctx.fillText(money(monthTotal()),540,1530);ctx.font='34px Arial';ctx.fillStyle='#8f7880';ctx.fillText(`${ms.length} meals · budget ${money(monthBudget())}`,540,1600);ctx.fillStyle='#d87896';ctx.font='700 34px Arial';ctx.fillText('little meals, little memories.',540,1760);const blob=await new Promise(r=>c.toBlob(r,'image/png'));const file=new File([blob],`food-jar-${ym()}.png`,{type:'image/png'});if(navigator.share&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'My Food Jar'});return}catch{}}const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);toast('分享卡已產生 ♡')}
  function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect?ctx.roundRect(x,y,w,h,r):ctx.rect(x,y,w,h)}

  function exportData(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`food-jar-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

  function openMonthPicker(){
    const picker=$('#monthPicker');
    try{if(typeof picker.showPicker==='function'){picker.showPicker();return}}catch{}
    picker.classList.remove('visually-hidden');picker.focus();picker.click();
  }

  function bindEvents(){
    $$('[data-meal-type]').forEach(b=>b.onclick=()=>{$('#typeInput').value=b.dataset.mealType;syncTypeChips()});
    $('#emailForm').addEventListener('submit',async e=>{e.preventDefault();const email=$('#emailInput').value.trim();if(!email)return;const btn=$('#emailLoginBtn');btn.disabled=true;btn.textContent='寄送中…';try{if(!window.FoodJarCloud?.configured)throw new Error('CLOUD_NOT_CONFIGURED');await window.FoodJarCloud.sendMagicLink(email);$('#emailSent').classList.remove('hidden');$('#emailSentText').textContent=`已寄到 ${email}，請點信中的登入連結。`}catch(err){if(err.message==='CLOUD_NOT_CONFIGURED'){toast('這份是預覽版；正式部署接上 Supabase 後即可寄登入信。')}else toast('登入信暫時寄不出去，請稍後再試')}finally{btn.disabled=false;btn.innerHTML='寄送登入連結 <span>→</span>'}});
    $('#previewBtn').onclick=()=>{safeLSSet(PREVIEW_KEY,'1');showApp()};
    $('#brandHome').onclick=()=>goPage('jarPage');$('#avatarBtn').onclick=()=>goPage('profilePage');$('#topAddBtn').onclick=()=>openMealModal();$('#feedBtn').onclick=()=>openMealModal();$('#diaryAdd').onclick=()=>openMealModal();$('#seeAllDiary').onclick=()=>goPage('diaryPage');
    $$('.nav-item').forEach(n=>n.onclick=()=>goPage(n.dataset.page));
    $('#prevMonth').onclick=()=>{selectedMonth=new Date(selectedMonth.getFullYear(),selectedMonth.getMonth()-1,1);renderAll()};$('#nextMonth').onclick=()=>{selectedMonth=new Date(selectedMonth.getFullYear(),selectedMonth.getMonth()+1,1);renderAll()};$('#monthPickerBtn').onclick=()=>openMonthPicker();$('#monthPicker').onchange=e=>{$('#monthPicker').classList.add('visually-hidden');if(!e.target.value)return;const [y,m]=e.target.value.split('-').map(Number);selectedMonth=new Date(y,m-1,1);renderAll()};
    $('#closeMealModal').onclick=closeMealModal;$('[data-close-modal]').onclick=closeMealModal;$('#photoInput').onchange=e=>handlePhoto(e.target.files?.[0]);$('#replacePhoto').onclick=()=>$('#photoInput').click();$('#stickerToggle').onclick=()=>{stickerOn=!stickerOn;$('#stickerToggle').classList.toggle('active',stickerOn);$('#photoStage').classList.toggle('sticker',stickerOn)};$('#saveMealBtn').onclick=saveMeal;
    $('#closeDetailModal').onclick=closeDetail;$('[data-close-detail]').onclick=closeDetail;$('#editMealBtn').onclick=()=>{const id=detailId;closeDetail();openMealModal(id)};$('#deleteMealBtn').onclick=deleteDetail;
    $$('.filter-pill').forEach(b=>b.onclick=()=>{activeFilter=b.dataset.filter;$$('.filter-pill').forEach(x=>x.classList.toggle('active',x===b));renderDiary()});$('#diarySearch').addEventListener('input',renderDiary);
    $$('.theme-dot').forEach(b=>b.onclick=()=>{state.profile.theme=b.dataset.themeValue;document.body.dataset.theme=state.profile.theme;$$('.theme-dot').forEach(x=>x.classList.toggle('active',x===b))});$$('.avatar-option').forEach(b=>b.onclick=()=>{state.profile.avatar=b.textContent.trim();$$('.avatar-option').forEach(x=>x.classList.toggle('active',x===b));$('#bigAvatar').textContent=state.profile.avatar;$('#avatarEmoji').textContent=state.profile.avatar});$('#saveSettings').onclick=saveSettings;
    $('#importBtn').onclick=()=>$('#importInput').click();
    $('#importInput').onchange=async e=>{
      const file=e.target.files?.[0];if(!file)return;
      try{const restored=normalizeState(JSON.parse(await file.text()));
        if(!confirm('這會以備份取代目前紀錄，建議先匯出目前資料。要繼續嗎？'))return;
        const before=state;state=restored;if(!await persist()){state=before;return}renderAll();toast('備份已還原');
      }catch{toast('無法匯入，請選擇有效的 Food Jar JSON 備份')}finally{e.target.value=''}
    };
    $('#shareCardBtn').onclick=shareCard;$('#exportBtn').onclick=exportData;$('#logoutBtn').classList.toggle('hidden',window.FOOD_JAR_CONFIG?.LOCAL_ONLY!==false);$('#logoutBtn').onclick=async()=>{if(session)await window.FoodJarCloud.signOut().catch(()=>{});session=null;safeLSRemove(PREVIEW_KEY);showAuth();toast('已登出')};
    window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;$('#installBtn').classList.remove('hidden')});$('#installBtn').onclick=async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$('#installBtn').classList.add('hidden')};
  }

  function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}function escapeAttr(s=''){return escapeHtml(s)}
  boot();
})();
