(() => {
  const cfg = window.FOOD_JAR_CONFIG || {};
  let client = null;
  const configured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  const BUCKET='meal-images';

  async function init(){
    if(!configured) return null;
    if(client) return client;
    try{
      const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      client = mod.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
      });
      return client;
    }catch(err){ console.warn('Supabase init failed', err); return null; }
  }

  async function getSession(){
    const c = await init(); if(!c) return null;
    const {data,error} = await c.auth.getSession();
    if(error) throw error;
    return data.session || null;
  }

  async function sendMagicLink(email){
    const c = await init(); if(!c) throw new Error('CLOUD_NOT_CONFIGURED');
    const redirectTo = location.protocol.startsWith('http') ? location.origin + location.pathname : undefined;
    const {error} = await c.auth.signInWithOtp({email,options:{emailRedirectTo:redirectTo,shouldCreateUser:true}});
    if(error) throw error;
    return true;
  }

  async function signOut(){ const c=await init(); if(c) await c.auth.signOut(); }

  async function signedUrl(path){
    if(!path) return '';
    const c=await init(); if(!c) return '';
    const {data,error}=await c.storage.from(BUCKET).createSignedUrl(path,60*60*24);
    if(error) return '';
    return data.signedUrl || '';
  }

  async function loadCloudState(userId){
    const c=await init(); if(!c || !userId) return null;
    const [mealRes, profileRes] = await Promise.all([
      c.from('meals').select('*').eq('user_id',userId).order('date',{ascending:false}),
      c.from('profiles').select('*').eq('id',userId).maybeSingle()
    ]);
    if(mealRes.error) throw mealRes.error;
    if(profileRes.error) throw profileRes.error;
    const meals = await Promise.all((mealRes.data||[]).map(async r=>({
      ...r,
      resolved_image_url:r.image_path ? await signedUrl(r.image_path) : (r.image_url||'')
    })));
    return {meals, profile: profileRes.data || null};
  }

  function dataUrlToBlob(dataUrl){
    const [head,body]=dataUrl.split(',');
    const mime=(head.match(/data:([^;]+)/)||[])[1]||'image/jpeg';
    const bin=atob(body);const bytes=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
    return new Blob([bytes],{type:mime});
  }

  async function uploadMealImage(userId,meal){
    const c=await init(); if(!c || !meal.image?.startsWith('data:image/')) return {path:meal.imagePath||null,url:meal.image||''};
    const blob=dataUrlToBlob(meal.image);
    const ext=blob.type.includes('png')?'png':'jpg';
    const path=`${userId}/${meal.id}.${ext}`;
    const {error}=await c.storage.from(BUCKET).upload(path,blob,{upsert:true,contentType:blob.type,cacheControl:'3600'});
    if(error) throw error;
    return {path,url:await signedUrl(path)};
  }

  async function upsertMeal(userId, meal){
    const c=await init(); if(!c) return meal;
    let imagePath=meal.imagePath||null, imageUrl=meal.image||null;
    if(meal.image?.startsWith('data:image/')){
      const uploaded=await uploadMealImage(userId,meal);imagePath=uploaded.path;imageUrl=uploaded.url;
    }
    const row={id:meal.id,user_id:userId,date:meal.date,title:meal.title,type:meal.type,price:meal.price,payment:meal.payment||null,note:meal.note||null,image_path:imagePath,image_url:imagePath?null:(imageUrl||null),sticker:meal.sticker!==false,updated_at:new Date().toISOString()};
    const {error}=await c.from('meals').upsert(row); if(error) throw error;
    return {...meal,image:imageUrl||'',imagePath};
  }
  async function deleteMeal(userId,id,imagePath){
    const c=await init(); if(!c)return;
    const {error}=await c.from('meals').delete().eq('id',id).eq('user_id',userId); if(error) throw error;
    if(imagePath) await c.storage.from(BUCKET).remove([imagePath]).catch(()=>{});
  }
  async function saveProfile(userId,p){ const c=await init(); if(!c)return; const {error}=await c.from('profiles').upsert({id:userId,jar_name:p.jarName,budget:p.budget,theme:p.theme,avatar:p.avatar,updated_at:new Date().toISOString()}); if(error) throw error; }

  window.FoodJarCloud={configured,init,getSession,sendMagicLink,signOut,loadCloudState,upsertMeal,deleteMeal,saveProfile};
})();
