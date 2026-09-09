(() => {
  'use strict';
  let running=false;
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function play(meal,before,after,drop){
    if(running){drop();return}running=true;
    const overlay=document.createElement('div');overlay.className='jar-celebration';overlay.setAttribute('role','status');
    const card=document.createElement('div');card.className='celebration-card';
    const caption=document.createElement('p');caption.textContent='又收好一餐了 ♡';
    const food=document.createElement(meal.image?'img':'span');food.className='celebration-food';
    if(meal.image){food.src=meal.image;food.alt=meal.title||meal.type}else food.textContent=meal.emoji||'🍱';
    const equation=document.createElement('div');equation.className='celebration-equation';
    const count=document.createElement('strong'),addition=document.createElement('span');addition.textContent='＋'+Math.round(meal.price).toLocaleString('zh-TW');
    const format=n=>'NT$'+Math.round(n).toLocaleString('zh-TW');count.textContent=format(before);equation.append(count,addition);
    card.append(caption,food,equation);overlay.append(card);document.body.append(overlay);
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    try{
      window.FoodJarPhysics?.cue('appear');
      if(!reduced)await card.animate([{opacity:0,transform:'scale(.86)'},{opacity:1,transform:'scale(1)'}],{duration:250,easing:'ease-out',fill:'both'}).finished;
      if(meal.image)await Promise.race([food.decode().catch(()=>{}),delay(500)]);
      await delay(reduced?200:450);
      window.FoodJarPhysics?.cue('count');
      if(reduced)count.textContent=format(after);
      else await new Promise(resolve=>{const begin=performance.now();function tick(t){const p=Math.min(1,(t-begin)/650);count.textContent=format(before+(after-before)*(1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(tick);else resolve()}requestAnimationFrame(tick)});
      addition.classList.add('counted');await delay(reduced?200:300);
      window.FoodJarPhysics?.cue('drop');
      if(!reduced){const target=document.querySelector('#jarItems').getBoundingClientRect(),from=food.getBoundingClientRect();
        await food.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${target.left+target.width/2-from.left-from.width/2}px,${target.top-from.top}px) scale(.45) rotate(12deg)`,opacity:.3}],{duration:450,easing:'ease-in',fill:'forwards'}).finished;
      }
    }catch{}finally{overlay.remove();running=false;drop()}
  }
  window.FoodJarCelebration={play};
})();
