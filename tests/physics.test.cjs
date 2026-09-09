const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const Matter=require('../vendor/matter.min.js');
function scene(){
 let engine,raf;
 const element=()=>({style:{},dataset:{},classList:{add(){},remove(){}},children:[],setAttribute(){},append(n){this.children.push(n)},replaceChildren(){this.children=[]},setPointerCapture(){},getBoundingClientRect(){return {left:10,top:20,width:131,height:152}}});
 const win={Matter:{...Matter,Engine:{...Matter.Engine,create:options=>(engine=Matter.Engine.create(options))}}},root=element();
 const context={window:win,document:{hidden:false,createElement:element,addEventListener(){},querySelector:()=>null},matchMedia:()=>({matches:false}),localStorage:{getItem(){return 'off'}},requestAnimationFrame:fn=>(raf=fn,1),cancelAnimationFrame(){},console};
 win.addEventListener=()=>{};
 vm.runInNewContext(fs.readFileSync('jar-physics.js','utf8'),context);
 return {api:win.FoodJarPhysics,root,engine:()=>engine,frame:t=>raf(t)};
}
const meals=n=>Array.from({length:n},(_,i)=>({id:String(i),price:120+i*30,title:'測試餐'+i,emoji:'🍱'}));
test('14 food bodies settle inside jar without material overlap',()=>{
 const s=scene();s.api.render(s.root,meals(14),'2026-09',null,()=>{});
 for(let i=0;i<300;i++)Matter.Engine.update(s.engine(),1000/60);
 const bodies=Matter.Composite.allBodies(s.engine().world).filter(b=>!b.isStatic);
 assert.equal(bodies.length,14);
 for(const b of bodies){assert.ok(b.bounds.min.x>-.5);assert.ok(b.bounds.max.x<302.5);assert.ok(b.bounds.max.y<384.5);assert.ok(b.bounds.min.y>=0)}
 for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){const c=Matter.Collision.collides(bodies[i],bodies[j]);assert.ok(!c||c.depth<1)}
});
test('only newly saved food starts above mouth; drag uses scaled coordinates and does not open detail',()=>{
 const s=scene();let opened=0;s.api.render(s.root,meals(2),'2026-09',null,()=>opened++);
 s.api.render(s.root,meals(3),'2026-09','2',()=>opened++);
 const body=Matter.Composite.allBodies(s.engine().world).filter(b=>!b.isStatic).at(-1);
 assert.ok(body.position.y<0);
 for(let i=0;i<90;i++)Matter.Engine.update(s.engine(),1000/60);
 assert.ok(body.position.y>100);
 const el=s.root.children[2];el.onpointerdown({isPrimary:true,button:0,pointerId:1,clientX:75,clientY:140});
 el.onpointermove({pointerId:1,clientX:100,clientY:70});
 const constraint=Matter.Composite.allConstraints(s.engine().world)[0];assert.ok(Math.abs(constraint.pointA.x-207.4809)<.01);assert.ok(Math.abs(constraint.pointA.y-(50*376/152))<.01);
 el.onpointerup({pointerId:1});el.onclick({preventDefault(){}});assert.equal(opened,0);assert.equal(Matter.Composite.allConstraints(s.engine().world).length,0);
 el.onclick({});assert.equal(opened,1);
 s.api.render(s.root,meals(1),'2026-10',null,()=>{});assert.equal(Matter.Composite.allBodies(s.engine().world).filter(b=>!b.isStatic).length,1);
});
