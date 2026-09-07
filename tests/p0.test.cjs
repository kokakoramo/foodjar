const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const source=name=>fs.readFileSync(path.join(root,name),'utf8');

function application(legacy){
  const nodes=new Map();
  const node=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{value:'',textContent:'',disabled:false,style:{},classList:{add(){},remove(){},toggle(){}},focus(){}});
    return nodes.get(selector);
  };
  let stored,fail=false;
  const sandbox={console,Date,URL,URLSearchParams,structuredClone,Blob,setTimeout:()=>0,clearTimeout(){},
    document:{querySelector:node},localStorage:{getItem:()=>legacy||null},navigator:{},
    window:{FoodJarStorage:{write:async value=>{if(fail)throw new Error('QUOTA');stored=structuredClone(value)}}}};
  const code=source('app.js').replace('  boot();',`  window.test={normalizeState,loadState,monthBudget,saveMeal,
    getState:()=>state,setMonth:(y,m)=>selectedMonth=new Date(y,m-1,1),
    setReady:()=>storageReady=true};
    renderAll=()=>{};closeMealModal=()=>{};`);
  vm.runInNewContext(code,sandbox);
  return {api:sandbox.window.test,node,getStored:()=>stored,setFail:()=>fail=true};
}
test('new personal jar is empty; existing v6 meals survive migration',()=>{
  assert.equal(application().api.getState().meals.length,0);
  const original={profile:{jarName:'舊罐子',budget:6200},meals:[{id:'old',date:'2026-09-01',price:123,image:'assets/demo-sticker.png'}]};
  const state=application(JSON.stringify(original)).api.getState();
  assert.equal(state.meals[0].price,123);assert.equal(state.profile.jarName,'舊罐子');assert.equal(state.meals[0].image,'');
});
test('monthly budgets do not alter other months and retain the legacy default',()=>{
  const {api}=application();api.getState().budgets={'2026-09':5000,'2026-10':7000};
  api.setMonth(2026,9);assert.equal(api.monthBudget(),5000);
  api.setMonth(2026,10);assert.equal(api.monthBudget(),7000);
  api.setMonth(2026,11);assert.equal(api.monthBudget(),8000);
});
test('backup keeps embedded photos and rejects duplicate IDs or impossible dates',()=>{
  const {api}=application();const data={profile:{},meals:[{id:'one',date:'2026-09-01',price:120,type:'午餐',image:'data:image/png;base64,AAAA'}],budgets:{'2026-09':4500}};
  assert.equal(api.normalizeState(data).meals[0].image,data.meals[0].image);
  assert.equal(api.normalizeState(data).budgets['2026-09'],4500);
  assert.throws(()=>api.normalizeState({...data,meals:[...data.meals,...data.meals]}));
  assert.throws(()=>api.normalizeState({...data,meals:[{...data.meals[0],date:'2026-02-30'}]}));
});
test('save waits for storage; quota failure retains the form and rolls back the record',async()=>{
  const app=application();app.api.setReady();
  for(const [id,value] of Object.entries({priceInput:'120',dateInput:'2026-09-06',typeInput:'午餐',titleInput:'便當',paymentInput:'現金',noteInput:''}))app.node('#'+id).value=value;
  await app.api.saveMeal();assert.equal(app.getStored().meals.length,1);assert.equal(app.getStored().meals[0].price,120);
  app.setFail();app.node('#priceInput').value='200';await app.api.saveMeal();
  assert.equal(app.api.getState().meals.length,1);assert.equal(app.node('#priceInput').value,'200');assert.equal(app.node('#saveMealBtn').disabled,false);
});
test('all HTML local assets and manifest icons exist at the requested dimensions',()=>{
  for(const match of source('index.html').matchAll(/(?:src|href)="([^"#]+)"/g)){
    if(!/^(https?:|data:)/.test(match[1]))assert.ok(fs.existsSync(path.join(root,match[1])),match[1]);
  }
  for(const icon of JSON.parse(source('manifest.webmanifest')).icons){
    const png=fs.readFileSync(path.join(root,icon.src));
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`,icon.sizes);
  }
  const html=source('index.html');
  for(const match of source('app.js').matchAll(/\$\('#([\w-]+)'\)/g))assert.ok(html.includes(`id="${match[1]}"`),match[1]);
});
test('SW optional asset failure still installs; cleanup is scoped; private requests bypass cache',async()=>{
  const handlers={},deleted=[];let added;
  const cache={addAll:async requests=>{added=requests},add:async()=>{throw Error('404')},match:async()=>new Response('cached')};
  const scope='https://example.test/foodjar/';
  vm.runInNewContext(source('sw.js'),{URL,Request,Response,Set,Promise,
    self:{registration:{scope},location:{origin:'https://example.test'},clients:{claim:async()=>{}},addEventListener:(name,fn)=>handlers[name]=fn},
    caches:{open:async()=>cache,keys:async()=>['other-app','food-jar-v6'],delete:async key=>deleted.push(key)},fetch:async()=>new Response('network')});
  let completion;handlers.install({waitUntil:p=>completion=p});await completion;
  assert.ok(added.every(request=>fs.existsSync(path.join(root,new URL(request.url).pathname.replace('/foodjar/','')||'index.html'))));
  handlers.activate({waitUntil:p=>completion=p});await completion;assert.deepEqual(deleted,['food-jar-v6']);
  for(const url of ['https://private.supabase.co/photo?token=secret',scope+'?code=secret',scope+'missing.png']){
    let intercepted=false;handlers.fetch({request:new Request(url),respondWith:()=>intercepted=true});assert.equal(intercepted,false,url);
  }
  let reply;handlers.fetch({request:new Request(scope+'app.js'),respondWith:p=>reply=p});assert.equal(await(await reply).text(),'cached');
});
