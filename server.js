const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000,ROOT=__dirname,DBF=path.join(process.env.DATA_DIR||ROOT,'data.json');
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'change-me-123';
const PAY_NUMBER=process.env.PAY_NUMBER||'01XXXXXXXXX';
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon'};
const PRIVATE=['server.js','package.json','data.json','data.json.tmp'];
let db={users:[],orders:[],deposits:[],sessions:{},settings:{}};
try{db=Object.assign(db,JSON.parse(fs.readFileSync(DBF,'utf8')))}catch(e){}
db.settings=db.settings||{};const DATA=process.env.DATA_DIR||ROOT,UP=path.join(DATA,'uploads');try{fs.mkdirSync(UP,{recursive:true})}catch(e){}
const save=()=>{fs.writeFileSync(DBF+'.tmp',JSON.stringify(db));fs.renameSync(DBF+'.tmp',DBF)};
const adm=new Set(),tries={};
const rnd=n=>crypto.randomBytes(n||24).toString('hex');
const hash=(p,s)=>crypto.scryptSync(String(p),s,32).toString('hex');
const same=(a,b)=>{a=Buffer.from(a);b=Buffer.from(b);return a.length===b.length&&crypto.timingSafeEqual(a,b)};
const limited=ip=>{const t=tries[ip]=(tries[ip]||[]).filter(x=>Date.now()-x<6e5);t.push(Date.now());return t.length>20};
const send=(res,code,obj,h)=>{res.writeHead(code,Object.assign({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},h||{}));res.end(JSON.stringify(obj))};
const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').map(c=>c.trim().split('=')).filter(a=>a[0]));
const body=(req,max)=>new Promise(r=>{let b='';req.on('data',c=>{b+=c;if(b.length>(max||1e4))req.destroy()});req.on('end',()=>{try{r(JSON.parse(b||'{}'))}catch(e){r({})}})});
const userOf=req=>{const s=db.sessions[cookies(req).sid];return s&&s.exp>Date.now()?db.users.find(u=>u.id===s.uid)||null:null};
const pub=u=>({name:u.name,phone:u.phone||u.email||'',balance:u.balance});
const ERR=(res,m,c)=>send(res,c||400,{error:m});
// দাম সবসময় index.html থেকে পড়া হয় (ক্লায়েন্টের পাঠানো দাম বিশ্বাস করা হয় না)
const esc=x=>String(x).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const DEFB=['banner1.svg','banner2.svg','banner3.svg','banner4.svg'];
const S=()=>Object.assign({siteName:'Ghop Ghop Topup',notice:'সবথেকে কম দামে গেম টপ-আপ করার সেরা ওয়েবসাইট\n১০০% বিশ্বস্ত ও দ্রুত ডেলিভারিতে\nঅর্ডার করুন নিশ্চিন্তে ♥️',telegram:'',group:'',youtube:'',bkash:PAY_NUMBER,nagad:PAY_NUMBER,googleClientId:process.env.GOOGLE_CLIENT_ID||'',banners:null,prices:{}},db.settings);
const RAW=()=>fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
function pkMap(h,fn){const u=h.indexOf('id="uidPkGrid"');return h.replace(/<button[^>]*class="pk"[^>]*>[\s\S]*?<\/button>/g,(m,off)=>{const n=/data-name="([^"]*)"/.exec(m),p=/data-price="([^"]*)"/.exec(m);if(!n||!p)return m;return fn(m,u>=0&&off>u?'uid':'ff',n[1].replace(/&amp;/g,'&'),+p[1])})}
function renderIndex(){
  const st=S();let h=pkMap(RAW(),(m,g,n)=>{const o=st.prices[g+'|'+n];if(!o)return m;if(o.off)return '';if(o.price>0)m=m.replace(/data-price="[^"]*"/,'data-price="'+o.price+'"').replace(/<b>BDT [^<]*<\/b>/,'<b>BDT '+o.price+'</b>');return m});
  const bl=st.banners&&st.banners.length?st.banners:DEFB;
  const tr='<div class="track" id="track">'+bl.map((x,i)=>'<div class="slide"><img src="'+esc(x)+'" alt="Banner '+(i+1)+'" draggable="false" decoding="async"></div>').join('')+'</div>\n    <div class="dots" id="dots">'+bl.map((x,i)=>i?'<i></i>':'<i class="on"></i>').join('')+'</div>';
  return h.replace(/<div class="track" id="track">[\s\S]*?<\/div>\s*<\/div>\s*<div class="dots" id="dots">[\s\S]*?<\/i><\/div>/,()=>tr);
}
function catalog(){const out=[];pkMap(renderIndex(),(m,g,n,p)=>{out.push({game:g,name:n,price:p});return m});return out}
async function api(req,res,url,ip){
  if(url==='/logout'){delete db.sessions[cookies(req).sid];save();res.writeHead(302,{Location:'/','Set-Cookie':'sid=; Path=/; Max-Age=0'});return res.end()}
  const b=req.method==='POST'?await body(req,url==='/api/admin/upload'&&adm.has(cookies(req).adm)?3e6:1e4):{},u=userOf(req);
  const start=user=>{const t=rnd();db.sessions[t]={uid:user.id,exp:Date.now()+2592e6};save();return{'Set-Cookie':'sid='+t+'; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000'}};
  if(url==='/api/me')return send(res,200,{user:u?pub(u):null});
  if(url==='/api/config'){const st=S();return send(res,200,{payNumber:st.bkash,bkash:st.bkash,nagad:st.nagad,googleClientId:st.googleClientId})}
  if(url==='/api/catalog')return send(res,200,catalog());
  if(url==='/api/register'){
    if(limited(ip))return ERR(res,'অনেকবার চেষ্টা হয়েছে, পরে চেষ্টা করুন',429);
    const name=String(b.name||'').trim().slice(0,30),phone=String(b.phone||'').trim(),pw=String(b.password||'');
    if(!name)return ERR(res,'নাম লিখুন');
    if(!/^01\d{9}$/.test(phone))return ERR(res,'সঠিক ১১ digit মোবাইল নম্বর দিন');
    if(pw.length<6||pw.length>64)return ERR(res,'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে');
    if(db.users.some(x=>x.phone===phone))return ERR(res,'এই নম্বরে আগেই অ্যাকাউন্ট আছে');
    const salt=rnd(8),user={id:rnd(8),name,phone,salt,hash:hash(pw,salt),balance:0,at:new Date().toISOString()};
    db.users.push(user);return send(res,200,{user:pub(user)},start(user));
  }
  if(url==='/api/google'){
    const st=S();if(!st.googleClientId)return ERR(res,'Google login চালু নেই');
    if(limited(ip))return ERR(res,'অনেকবার চেষ্টা হয়েছে, পরে চেষ্টা করুন',429);
    let r,t;try{r=await fetch('https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(String(b.credential||'')));t=await r.json()}catch(e){return ERR(res,'Google সার্ভারে সংযোগ হয়নি, আবার চেষ্টা করুন',502)}
    if(!r.ok||t.aud!==st.googleClientId||String(t.email_verified)!=='true'||!t.email)return ERR(res,'Google লগইন ব্যর্থ হয়েছে',401);
    let user=db.users.find(x=>x.email===t.email);
    if(!user){user={id:rnd(8),name:String(t.name||t.email.split('@')[0]).slice(0,30),phone:'',email:t.email,salt:'',hash:'',balance:0,at:new Date().toISOString()};db.users.push(user)}
    return send(res,200,{user:pub(user)},start(user));
  }
  if(url==='/api/login'){
    if(limited(ip))return ERR(res,'অনেকবার চেষ্টা হয়েছে, পরে চেষ্টা করুন',429);
    const user=db.users.find(x=>x.phone===String(b.phone||'').trim());
    if(!user||!same(user.hash,hash(b.password||'',user.salt)))return ERR(res,'নম্বর বা পাসওয়ার্ড ভুল',401);
    return send(res,200,{user:pub(user)},start(user));
  }
  if(url.indexOf('/api/admin/')===0){
    if(url==='/api/admin/login'){
      if(limited(ip))return ERR(res,'অনেকবার চেষ্টা হয়েছে, পরে চেষ্টা করুন',429);
      if(!same(hash(b.password||'','a'),hash(ADMIN_PASSWORD,'a')))return ERR(res,'পাসওয়ার্ড ভুল',401);
      const t=rnd();adm.add(t);return send(res,200,{ok:1},{'Set-Cookie':'adm='+t+'; HttpOnly; Path=/; SameSite=Strict; Max-Age=86400'});
    }
    if(!adm.has(cookies(req).adm))return ERR(res,'লগইন করুন',401);
    if(url==='/api/admin/data'){
      const st=S(),pk=[];pkMap(RAW(),(m,g,n,p)=>{const k=g+'|'+n;pk.push({key:k,game:g,name:n,price:p,o:st.prices[k]||null});return m});
      return send(res,200,{settings:st,defb:DEFB,pk,count:db.users.length,users:db.users.slice(-200).reverse().map(x=>({id:x.id,name:x.name,phone:x.phone||x.email,balance:x.balance})),orders:db.orders.slice(-100).reverse(),deposits:db.deposits.slice(-100).reverse()});
    }
    if(url==='/api/admin/settings'){
      ['siteName','notice','telegram','group','youtube','bkash','nagad','googleClientId'].forEach(k=>{if(typeof b[k]==='string')db.settings[k]=b[k].trim().slice(0,600)});
      save();return send(res,200,{ok:1});
    }
    if(url==='/api/admin/upload'){
      const m=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+\/=]+)$/.exec(String(b.data||'')),buf=m&&Buffer.from(m[2],'base64');
      if(!buf||buf.length>2.5e6)return ERR(res,'ছবি ঠিক নেই বা বেশি বড় (২.৫MB এর মধ্যে দিন)');
      const f='b'+Date.now()+'.'+(m[1]==='jpeg'?'jpg':m[1]);fs.writeFileSync(path.join(UP,f),buf);
      db.settings.banners=(S().banners||DEFB).concat('/uploads/'+f);save();return send(res,200,{ok:1});
    }
    if(url==='/api/admin/banners'){
      const cur=S().banners||DEFB,list=(Array.isArray(b.list)?b.list:[]).filter(x=>cur.includes(x));
      cur.filter(x=>!list.includes(x)&&x.indexOf('/uploads/')===0).forEach(x=>{try{fs.unlinkSync(path.join(UP,path.basename(x)))}catch(e){}});
      db.settings.banners=list;save();return send(res,200,{ok:1});
    }
    if(url==='/api/admin/price'){
      const pr=db.settings.prices=db.settings.prices||{};pr[String(b.key).slice(0,200)]={price:Math.max(0,+b.price||0),off:!!b.off};save();return send(res,200,{ok:1});
    }
    if(url==='/api/admin/balance'){
      const c=db.users.find(x=>x.id===b.id),a=+b.amount;if(!c||!isFinite(a)||Math.abs(a)>1e6)return ERR(res,'ভুল তথ্য');
      c.balance=Math.max(0,Math.round((c.balance+a)*100)/100);save();return send(res,200,{ok:1});
    }
    if(url==='/api/admin/order'){
      const o=db.orders.find(x=>x.id===b.id);if(!o||o.status!=='pending')return ERR(res,'অর্ডার পাওয়া যায়নি বা আগেই হয়ে গেছে');
      if(b.status==='done')o.status='done';
      else if(b.status==='cancelled'){o.status='cancelled';const c=db.users.find(x=>x.id===o.user);if(c)c.balance+=o.price}
      else return ERR(res,'ভুল অনুরোধ');
      save();return send(res,200,{ok:1});
    }
    if(url==='/api/admin/deposit'){
      const d=db.deposits.find(x=>x.id===b.id);if(!d||d.status!=='pending')return ERR(res,'রিকোয়েস্ট পাওয়া যায়নি বা আগেই হয়ে গেছে');
      if(b.status==='approved'){d.status='approved';const c=db.users.find(x=>x.id===d.user);if(c)c.balance+=d.amount}
      else if(b.status==='rejected')d.status='rejected';else return ERR(res,'ভুল অনুরোধ');
      save();return send(res,200,{ok:1});
    }
    return ERR(res,'Not found',404);
  }
  if(!u)return ERR(res,'আগে লগইন করুন',401);
  if(url==='/api/my')return send(res,200,{user:pub(u),orders:db.orders.filter(x=>x.user===u.id).slice(-50).reverse(),deposits:db.deposits.filter(x=>x.user===u.id).slice(-50).reverse()});
  if(url==='/api/order'){
    const item=catalog().find(x=>x.game===b.game&&x.name===b.name),pid=String(b.uid||'');
    if(!item)return ERR(res,'প্যাকেজ পাওয়া যায়নি');
    if(!/^\d{6,15}$/.test(pid))return ERR(res,'সঠিক প্লেয়ার আইডি দিন');
    if(u.balance<item.price)return ERR(res,'ব্যালেন্স কম। আগে Add Money করুন');
    u.balance-=item.price;
    const o={id:'O'+(db.orders.length+1),user:u.id,phone:u.phone||u.email,game:item.game,pack:item.name,price:item.price,playerId:pid,status:'pending',at:new Date().toISOString()};
    db.orders.push(o);save();return send(res,200,{order:o,balance:u.balance});
  }
  if(url==='/api/deposit'){
    const trx=String(b.trxid||'').trim().toUpperCase(),amt=Math.round(+b.amount*100)/100,method=b.method==='Nagad'?'Nagad':'bKash';
    if(!/^[A-Z0-9]{6,20}$/.test(trx))return ERR(res,'সঠিক Transaction ID দিন');
    if(!(amt>=10&&amt<=50000))return ERR(res,'টাকার পরিমাণ ১০ থেকে ৫০০০০ এর মধ্যে দিন');
    if(db.deposits.some(x=>x.trxid===trx&&x.status!=='rejected'))return ERR(res,'এই Transaction ID আগেই জমা দেওয়া হয়েছে');
    if(db.deposits.filter(x=>x.user===u.id&&x.status==='pending').length>=5)return ERR(res,'আগের রিকোয়েস্ট অনুমোদনের অপেক্ষা করুন');
    const d={id:'D'+(db.deposits.length+1),user:u.id,phone:u.phone||u.email,method,trxid:trx,amount:amt,status:'pending',at:new Date().toISOString()};
    db.deposits.push(d);save();return send(res,200,{deposit:d});
  }
  return ERR(res,'Not found',404);
}
http.createServer((req,res)=>{
  let url;try{url=decodeURI(req.url.split('?')[0])}catch(e){res.writeHead(400);return res.end()}
  if(url.indexOf('/api/')===0||url==='/logout')return api(req,res,url,req.socket.remoteAddress).catch(()=>ERR(res,'সার্ভারে সমস্যা',500));
  if(url==='/'||url==='/index.html'){res.writeHead(200,{'Content-Type':MIME['.html'],'Cache-Control':'no-cache'});return res.end(renderIndex())}
  if(url==='/account.js'){const st=S(),J=JSON.stringify;res.writeHead(200,{'Content-Type':MIME['.js'],'Cache-Control':'no-cache'});
    return res.end('var website_name='+J(st.siteName)+';var telegram_channel_link='+J(st.telegram||'#')+';var telegram_group_link='+J(st.group||'#')+';var youtube_channel_link='+J(st.youtube||'#')+';var notification_text='+J(st.notice)+';')}
  if(url.indexOf('/uploads/')===0){const f=path.join(UP,path.basename(url)),ext=path.extname(f).toLowerCase();
    return fs.readFile(f,(e,d)=>{if(e||!MIME[ext]){res.writeHead(404);return res.end('404')}res.writeHead(200,{'Content-Type':MIME[ext],'Cache-Control':'public, max-age=86400'});res.end(d)})}
  const fp=path.normalize(path.join(ROOT,url==='/'?'/index.html':url)),base=path.basename(fp);
  if(fp.indexOf(ROOT+path.sep)!==0||PRIVATE.includes(base)||base[0]==='.'){res.writeHead(404);return res.end('404')}
  fs.stat(fp,(e,s)=>{
    if(e||!s.isFile()){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('404 Not Found')}
    const ext=path.extname(fp).toLowerCase();
    res.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream','Cache-Control':ext==='.html'||ext==='.js'?'no-cache':'public, max-age=3600'});
    fs.createReadStream(fp).pipe(res);
  });
}).listen(PORT,'0.0.0.0',()=>console.log('Ghop Ghop Topup running on port '+PORT));
