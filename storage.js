(() => {
  'use strict';
  let connection;
  let revision=0;
  function open(){
    if(connection) return connection;
    connection=new Promise((resolve,reject)=>{
      const request=indexedDB.open('foodjar',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('state');
      request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();connection=null};resolve(request.result)};
      request.onerror=()=>{connection=null;reject(request.error)};
      request.onblocked=()=>{connection=null;reject(new Error('請關閉其他 Food Jar 分頁後重試'))};
    });
    return connection;
  }
  async function read(){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('state','readonly');
      const request=tx.objectStore('state').get('local');
      tx.oncomplete=()=>{revision=request.result?.revision||0;resolve(request.result?.value||request.result||null)};
      tx.onerror=()=>reject(tx.error);
      tx.onabort=()=>reject(tx.error);
    });
  }
  async function write(value){
    // Capture this revision before awaiting the database connection.
    const snapshot=structuredClone(value);
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('state','readwrite');
      const store=tx.objectStore('state');
      const current=store.get('local');
      let conflict=false;
      current.onsuccess=()=>{
        if((current.result?.revision||0)!==revision){conflict=true;tx.abort();return}
        store.put({revision:revision+1,value:snapshot},'local');
      };
      tx.oncomplete=()=>{revision++;resolve(true)};
      tx.onerror=()=>reject(tx.error);
      tx.onabort=()=>reject(conflict?new Error('STALE_STATE'):tx.error);
    });
  }
  window.FoodJarStorage={read,write};
})();
