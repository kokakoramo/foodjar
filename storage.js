(() => {
  'use strict';
  const CHECKPOINT='foodjar_v6_checkpoint';
  let connection,revision=0;
  const status={recovered:false,mirror:false};
  const valid=value=>value&&value.profile&&Array.isArray(value.meals);
  function checkpoint(){
    const raw=localStorage.getItem(CHECKPOINT);if(!raw)return null;
    const saved=JSON.parse(raw);
    if(saved.unavailable)throw new Error('CHECKPOINT_UNAVAILABLE');
    if(!valid(saved.value))throw new Error('INVALID_CHECKPOINT');
    return saved.value;
  }
  function mirror(value){
    try{localStorage.setItem(CHECKPOINT,JSON.stringify({value,updatedAt:Date.now()}));status.mirror=true}
    catch{status.mirror=false;try{localStorage.setItem(CHECKPOINT,JSON.stringify({unavailable:true}))}catch{}}
  }
  async function open(){
    if(!connection)connection=new Promise((resolve,reject)=>{
      const request=indexedDB.open('foodjar',1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('state'))request.result.createObjectStore('state')};
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();connection=null};resolve(db)};
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error('請關閉其他 Food Jar 分頁後重試'));
    });
    try{return await connection}catch(error){connection=null;throw error}
  }
  async function read(){
    const db=await open();
    const saved=await new Promise((resolve,reject)=>{
      const tx=db.transaction('state','readonly');const request=tx.objectStore('state').get('local');
      tx.oncomplete=()=>resolve(request.result);
      tx.onerror=tx.onabort=()=>reject(tx.error);
    });
    revision=saved?.revision||0;
    if(saved){const value=saved.value||saved;if(!valid(value))throw new Error('INVALID_DATABASE');mirror(value);return value}
    // Only an absent record can use the checkpoint. A read error must never become an empty jar.
    const backup=checkpoint();if(backup){await write(backup);status.recovered=true;return backup}
    return null;
  }
  async function write(value){
    const snapshot=structuredClone(value);if(!valid(snapshot))throw new Error('INVALID_STATE');
    const db=await open();
    await new Promise((resolve,reject)=>{
      let tx;try{tx=db.transaction('state','readwrite',{durability:'strict'})}catch{tx=db.transaction('state','readwrite')}
      const store=tx.objectStore('state'),current=store.get('local');let conflict=false;
      current.onsuccess=()=>{if((current.result?.revision||0)!==revision){conflict=true;tx.abort();return}store.put({revision:revision+1,value:snapshot},'local')};
      tx.oncomplete=()=>{revision++;resolve()};
      tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(conflict?new Error('STALE_STATE'):tx.error);
    });
    // A secondary-copy failure cannot turn a successful database transaction into a failed save.
    mirror(snapshot);return true;
  }
  window.FoodJarStorage={read,write,status};
})();
