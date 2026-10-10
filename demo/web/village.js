// Original procedural pixel art. All coordinates are logical pixels; no external assets.
const HOUSES=[
  {id:'P-001',x:126,y:115,color:'#c88361',roof:'#a96d52',label:'HEATH ROAD'},
  {id:'P-002',x:300,y:85,color:'#d6b478',roof:'#8b9970',label:'RICHMOND ROAD'},
  {id:'P-003',x:510,y:120,color:'#cfad83',roof:'#9b7968',label:'SHEEN LANE'},
  {id:'P-004',x:127,y:293,color:'#c4b595',roof:'#839182',label:'KEW ROAD'},
  {id:'P-005',x:300,y:365,color:'#d8b88a',roof:'#b48066',label:'CHURCH STREET'},
  {id:'P-006',x:511,y:303,color:'#c6aaa0',roof:'#8c818d',label:'CASTELNAU'},
];
const destinations={agency:{x:367,y:253},operator:{x:400,y:255},landlord:{x:666,y:157},contractor:{x:673,y:371}};
const palette={grass:'#dce4bb',grassDark:'#b8ce96',path:'#e8dcb4',pathEdge:'#d4c89e',tree:'#8ba36d',trunk:'#9b8561'};
function random(seed){let a=seed;return()=>{a=(a*1664525+1013904223)>>>0;return a/4294967296;};}

export class Village {
  constructor(canvas,onSelect){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.onSelect=onSelect;this.selected=null;this.tickets=[];this.particles=[];this.clock=0;
    this.reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.background=document.createElement('canvas');this.background.width=768;this.background.height=480;
    this.drawTerrain(this.background.getContext('2d'));
    canvas.addEventListener('click',event=>{const r=canvas.getBoundingClientRect();const x=(event.clientX-r.left)*768/r.width,y=(event.clientY-r.top)*480/r.height;const house=HOUSES.find(h=>Math.abs(x-h.x)<55 && y>h.y-55 && y<h.y+57);if(house)onSelect(house.id);});
    canvas.addEventListener('keydown',e=>{if(e.key==='Enter')onSelect(this.selected?.property || 'P-001');});
    this.last=performance.now();requestAnimationFrame(t=>this.frame(t));
  }
  rect(ctx,x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),w,h);}
  label(ctx,text,x,y,bg='#f7f3dd',color='#667552'){
    ctx.font='8px monospace';ctx.textAlign='center';const width=ctx.measureText(text).width+12;
    this.rect(ctx,x-width/2,y-8,width,14,bg);this.rect(ctx,x-width/2,y+6,width,2,'#a1ae7e33');ctx.fillStyle=color;ctx.fillText(text,x,y+2);
  }
  tree(ctx,x,y,size=1){
    ctx.save();ctx.translate(x,y);ctx.scale(size,size);
    this.rect(ctx,-12,8,27,7,'#82966420');this.rect(ctx,-2,0,5,13,palette.trunk);
    this.rect(ctx,-11,-16,23,23,'#829b66');this.rect(ctx,-15,-11,30,13,'#91aa70');this.rect(ctx,-8,-22,16,29,'#a0b77c');
    this.rect(ctx,-9,-18,17,14,'#a9bd81');this.rect(ctx,-12,-11,7,11,'#9fb779');this.rect(ctx,6,-9,7,12,'#7e9960');
    this.rect(ctx,-5,-20,7,3,'#bccb92');this.rect(ctx,-7,-9,4,3,'#b5c787');ctx.restore();
  }
  bush(ctx,x,y){this.rect(ctx,x-7,y,17,6,'#a3b578');this.rect(ctx,x-4,y-4,12,8,'#a8bd7e');this.rect(ctx,x,y-6,6,8,'#b0c487');}
  fence(ctx,x,y,w){for(let i=0;i<w;i+=8){this.rect(ctx,x+i,y,3,15,'#c9ba90');this.rect(ctx,x+i,y,2,12,'#f2e8c5');}this.rect(ctx,x,y+5,w,2,'#eee3bb');this.rect(ctx,x,y+10,w,2,'#ded0a5');}
  drawTerrain(ctx){
    const r=random(713);this.rect(ctx,0,0,768,480,palette.grass);
    // Gentle variations in the meadow, with sparse grass pixels and wildflowers.
    for(let i=0;i<180;i++){const x=Math.floor(r()*192)*4,y=Math.floor(r()*120)*4;this.rect(ctx,x,y,8+Math.floor(r()*15),4,'#c7d8a22d');}
    for(let i=0;i<1100;i++){const x=r()*768,y=r()*480;this.rect(ctx,x,y,2,1,r()>.4?'#b7c99a66':'#f1efcf66');}
    // The lane is a continuous connected loop through the neighbourhood.
    const path=(x,y,w,h)=>{this.rect(ctx,x-2,y-2,w+4,h+4,palette.pathEdge);this.rect(ctx,x,y,w,h,palette.path);};
    path(63,193,654,22);path(195,74,22,342);path(431,74,22,342);path(195,398,410,22);path(591,192,22,227);
    path(123,164,14,29);path(298,139,14,54);path(506,173,14,20);path(123,214,14,31);path(298,310,14,36);path(506,214,14,42);
    path(651,160,15,35);path(651,214,15,87);path(214,300,217,15);
    this.rect(ctx,217,190,214,119,'#e9dfbc');this.rect(ctx,236,218,175,67,'#e5d9b2');
    // Cobblestone pattern in the village square.
    for(let y=207;y<298;y+=9)for(let x=231+(y%2)*4;x<425;x+=12){this.rect(ctx,x,y,8,1,'#cebd933d');this.rect(ctx,x+9,y-3,1,4,'#cdbd932b');}
    // Garden plots, flower beds and fences.
    HOUSES.forEach(h=>{
      this.rect(ctx,h.x-48,h.y-46,98,92,'#cfddae');this.rect(ctx,h.x-46,h.y-44,94,88,'#d6e2b6');
      this.fence(ctx,h.x-48,h.y+37,38);this.fence(ctx,h.x+14,h.y+37,36);
      this.bush(ctx,h.x-41,h.y+22);this.bush(ctx,h.x+42,h.y+21);
      for(let i=0;i<6;i++){this.rect(ctx,h.x-41+i*4,h.y+30,2,3,'#7f9a61');this.rect(ctx,h.x-41+i*4,h.y+28,3,2,i%2?'#e8c48c':'#c49484');}
      this.rect(ctx,h.x-5,h.y+17,12,26,'#ecdfb5');
    });
    // Landlord's garden and the contractor yard.
    this.rect(ctx,617,60,104,120,'#cad8ad');this.fence(ctx,619,164,103);this.rect(ctx,623,309,102,102,'#c9c7a6');this.rect(ctx,627,313,94,94,'#d3ceb1');
    // A pond, lily pads and a tiny bridge.
    this.rect(ctx,38,379,90,60,'#c8d6ac');this.rect(ctx,45,383,82,49,'#a8c4b7');this.rect(ctx,53,378,60,59,'#a8c4b7');
    this.rect(ctx,53,384,64,44,'#b0ccc0');this.rect(ctx,48,393,75,28,'#b0ccc0');
    for(let i=0;i<12;i++)this.rect(ctx,51+r()*60,389+r()*36,7,1,'#d3e4d0');
    this.rect(ctx,55,400,9,3,'#8faf85');this.rect(ctx,98,417,8,3,'#8faf85');this.rect(ctx,58,398,2,2,'#ede2aa');
    for(let y=410;y<451;y+=5){this.rect(ctx,114,y,22,4,'#bcaa7d');this.rect(ctx,115,y,22,1,'#d9c798');}this.rect(ctx,113,408,2,45,'#a6966d');this.rect(ctx,135,408,2,45,'#a6966d');
    // Village furniture.
    this.rect(ctx,251,268,29,5,'#baa077');this.rect(ctx,253,274,3,5,'#7b8260');this.rect(ctx,274,274,3,5,'#7b8260');this.rect(ctx,251,262,29,3,'#c4ad81');
    this.rect(ctx,400,275,21,4,'#baa077');this.rect(ctx,402,279,2,6,'#7b8260');this.rect(ctx,417,279,2,6,'#7b8260');
    this.rect(ctx,404,171,3,24,'#929575');this.rect(ctx,400,168,11,8,'#e8dcb2');this.rect(ctx,399,168,13,2,'#82906c');
    this.rect(ctx,63,264,2,25,'#a0916a');this.rect(ctx,47,263,34,13,'#f1e5bd');ctx.font='6px monospace';ctx.fillStyle='#869470';ctx.textAlign='center';ctx.fillText('RICHMOND',64,272);
    // Trees frame the scene without obscuring buildings or roads.
    [[33,77,1.1],[71,100,.75],[37,163,.8],[29,227,1.1],[62,337,1.15],[27,364,.8],[31,457,.95],[161,451,1.1],[175,46,.85],[241,39,.85],[367,65,1.05],[397,117,.8],[571,59,1.1],[744,76,1],[744,174,1.2],[746,269,.8],[735,449,1.2],[652,449,.9],[575,447,1.1],[397,451,.8],[405,365,.75],[552,370,.7]].forEach(a=>this.tree(ctx,...a));
    for(let i=0;i<28;i++)this.bush(ctx,r()*760,455+r()*20);
    this.label(ctx,'THE VILLAGE GREEN',330,289,'#e9dfbc','#a0916c');
  }
  window(ctx,x,y,w=10){this.rect(ctx,x-2,y-2,w+4,15,'#eee1bb');this.rect(ctx,x,y,w,10,'#7f9b94');this.rect(ctx,x,y,w,3,'#6f8882');this.rect(ctx,x+w/2-1,y,2,11,'#e9dbb5');this.rect(ctx,x,y+5,w,2,'#e9dbb5');this.rect(ctx,x-3,y+11,w+6,2,'#c4aa7b');}
  house(ctx,h,active){
    const {x,y,color,roof}=h;
    if(active){this.rect(ctx,x-49,y+36,98,3,'#adbe7d');this.rect(ctx,x-49,y+32,3,7,'#adbe7d');this.rect(ctx,x+46,y+32,3,7,'#adbe7d');}
    this.rect(ctx,x-36,y+27,82,8,'#7f8f6020');this.rect(ctx,x-34,y-9,69,37,color);this.rect(ctx,x+24,y-9,11,37,'#574c3620');
    this.rect(ctx,x-31,y-9,60,3,'#725e4b2b');
    // Stepped pitched roof, with tile highlights.
    for(let row=0;row<9;row++)this.rect(ctx,x-38+row*3,y-13-row*3,76-row*6,3,roof);
    this.rect(ctx,x-40,y-13,80,4,'#736b5460');this.rect(ctx,x-37,y-14,74,2,roof);
    for(let row=0;row<7;row++)for(let j=0;j<5;j++){let xx=x-29+row*3+j*11;if(xx<x+30-row*3)this.rect(ctx,xx,y-16-row*3,7,1,'#fff2d325');}
    this.rect(ctx,x+20,y-43,7,18,'#b29a7a');this.rect(ctx,x+19,y-45,9,3,'#ccb696');
    this.window(ctx,x-24,y-2,11);this.window(ctx,x+14,y-2,11);
    this.rect(ctx,x-7,y+4,14,25,'#eee0b6');this.rect(ctx,x-5,y+5,10,23,'#8a9473');this.rect(ctx,x-3,y+7,6,8,'#b2c1a4');this.rect(ctx,x+2,y+19,2,2,'#e7d4a0');
    this.rect(ctx,x-9,y+28,18,3,'#c4b695');this.rect(ctx,x-33,y+27,20,2,'#e5d6ad');
    this.label(ctx,h.id,x,y+56,active?'#f6f2d6':'#e9efd4',active?'#586d45':'#82926a');
    if(h.id==='P-005'){this.rect(ctx,x+40,y-30,9,9,'#ecddb1');ctx.fillStyle='#a8874d';ctx.font='8px monospace';ctx.fillText('+',x+44,y-23);}
  }
  agency(ctx,t){
    const x=358,y=197;
    this.rect(ctx,x-48,y+48,102,8,'#77845724');this.rect(ctx,x-44,y-8,91,56,'#eddfb4');this.rect(ctx,x+35,y-8,12,56,'#d9c797');
    for(let i=0;i<8;i++)this.rect(ctx,x-49+i*3,y-8-i*3,100-i*6,3,i%2?'#7f9270':'#849775');
    this.rect(ctx,x+24,y-39,8,20,'#a3a581');this.rect(ctx,x+22,y-41,12,3,'#b9bba0');
    this.rect(ctx,x-36,y+5,75,14,'#617b59');this.rect(ctx,x-35,y+6,73,1,'#91a077');ctx.font='bold 9px monospace';ctx.fillStyle='#f5efd2';ctx.textAlign='center';ctx.fillText('dwelly',x+1,y+15);
    this.window(ctx,x-30,y+25,15);this.window(ctx,x+18,y+25,15);this.rect(ctx,x-7,y+23,16,25,'#a1ae8c');this.rect(ctx,x-4,y+25,10,14,'#cfdbc0');
    this.rect(ctx,x-9,y+48,21,4,'#c8b78d');this.rect(ctx,x-6,y+38,3,2,'#e8d6a6');
    const thinking=this.tickets.some(tk=>!tk.ended&&tk.owner==='agency');
    if(thinking){this.rect(ctx,x-27,y+28,10,7,Math.sin(t/240)>0?'#ecd99e':'#e5c783');this.bubble(ctx,'···',x,y-43,'#faf6df');}
    this.label(ctx,'DWELLY OFFICE',x,y+67,'#f8f1d9','#73845c');
  }
  estate(ctx){
    const x=669,y=110;this.rect(ctx,x-43,y+40,91,7,'#82976520');this.rect(ctx,x-40,y-11,80,52,'#c3b7ba');this.rect(ctx,x+29,y-10,11,51,'#b0a4ac');
    for(let i=0;i<8;i++)this.rect(ctx,x-44+i*3,y-12-i*3,88-i*6,3,'#8e8694');this.rect(ctx,x-36,y+13,73,3,'#ede1c9');
    for(const xx of [-28,17]){this.window(ctx,x+xx,y-3);this.window(ctx,x+xx,y+23);}
    this.rect(ctx,x-6,y+20,14,21,'#8a8290');this.rect(ctx,x-3,y+21,8,8,'#c6c1b4');this.label(ctx,'LANDLORDS',x,y+74,'#f2e9e4','#94808f');
  }
  yard(ctx){
    const x=674,y=329;this.rect(ctx,x-40,y-17,78,34,'#b2c4c0');this.rect(ctx,x-44,y-23,86,8,'#7c9290');this.rect(ctx,x-42,y-25,82,3,'#9cae9e');
    this.rect(ctx,x-30,y-8,24,25,'#8b9d94');this.rect(ctx,x+2,y-8,24,25,'#8b9d94');for(let i=0;i<5;i++){this.rect(ctx,x-29,y-5+i*4,22,1,'#a3b4a6');this.rect(ctx,x+3,y-5+i*4,22,1,'#a3b4a6');}
    this.label(ctx,'CONTRACTOR YARD',x,y+88,'#e6ece2','#748b81');
    this.rect(ctx,x+34,y+11,7,12,'#b1a17c');this.rect(ctx,x+28,y+14,6,9,'#beaf8d');
  }
  person(ctx,x,y,index,moving=false,highlight=false){
    x=Math.round(x);y=Math.round(y);const clothes=['#c89163','#819b9a','#b6a46d','#ae8992','#7c936a','#aa9a78'];const skin=['#d9b18a','#ba8d68','#8f6953','#e0bd99'];
    if(highlight){ctx.strokeStyle='#f4f0c2';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x+1,y+9,10,5,0,0,Math.PI*2);ctx.stroke();}
    this.rect(ctx,x-4,y+9,10,3,'#64744f25');this.rect(ctx,x-3,y-7,7,7,skin[index%4]);this.rect(ctx,x-4,y-9,8,4,index%3===0?'#766a51':'#68594d');
    this.rect(ctx,x-3,y,7,7,clothes[index%6]);this.rect(ctx,x-5,y+1,2,5,skin[index%4]);this.rect(ctx,x+4,y+1,2,5,skin[index%4]);
    const step=moving?Math.round(Math.sin(this.clock/120+index)):0;this.rect(ctx,x-2,y+7,2,4+step,'#626e5f');this.rect(ctx,x+2,y+7,2,4-step,'#626e5f');
    if(index%4===1){this.rect(ctx,x-4,y-9,9,3,'#d9c68f');this.rect(ctx,x-2,y-11,5,3,'#c8b377');}
  }
  van(ctx,x,y){
    this.rect(ctx,x-17,y+9,40,5,'#6c79522b');this.rect(ctx,x-16,y-6,25,16,'#f5edcc');this.rect(ctx,x+9,y-2,12,12,'#f5edcc');this.rect(ctx,x+10,y-3,8,7,'#9aafb0');this.rect(ctx,x-16,y+4,36,4,'#7d9b8f');
    this.rect(ctx,x-11,y+8,6,6,'#6d7564');this.rect(ctx,x+12,y+8,6,6,'#6d7564');this.rect(ctx,x-9,y+10,2,2,'#b9c0a6');this.rect(ctx,x+14,y+10,2,2,'#b9c0a6');this.rect(ctx,x+20,y+2,2,3,'#ead999');
    this.rect(ctx,x-6,y-2,5,2,'#88a697');this.rect(ctx,x-4,y-4,2,6,'#88a697');
  }
  bubble(ctx,text,x,y,color='#f8f3df'){
    ctx.font='bold 10px monospace';const w=ctx.measureText(text).width+12;this.rect(ctx,x-w/2,y-10,w,17,'#9aaa7a');this.rect(ctx,x-w/2+1,y-11,w-2,16,color);this.rect(ctx,x-2,y+5,4,3,color);ctx.textAlign='center';ctx.fillStyle='#657b55';ctx.fillText(text,x,y+1);
  }
  event(event,ticket){
    if(event.deduplicated)return;
    const house=HOUSES.find(h=>h.id===ticket.property)||HOUSES[0];let source=destinations.agency,target={x:house.x,y:house.y+38},kind='letter';
    if(event.t==='actor_message'){source=event.role==='tenant'?target:destinations[event.role]||target;target=destinations.agency;}
    else if(event.t==='effect'){
      if(event.op==='create_work_order'){source=destinations.contractor;kind='van';}
      else target=event.to_role==='tenant'?target:destinations[event.to_role]||destinations.agency;
    }else return;
    this.particles.push({source,target,kind,start:performance.now(),duration:kind==='van'?4000:2000});
  }
  update(tickets,selected){this.tickets=tickets;this.selected=selected;}
  frame(now){
    this.clock=now;const ctx=this.ctx;ctx.clearRect(0,0,768,480);ctx.drawImage(this.background,0,0);
    HOUSES.forEach(h=>this.house(ctx,h,this.selected?.property===h.id));this.agency(ctx,now);this.estate(ctx);this.yard(ctx);
    const owner=this.selected?.owner;
    HOUSES.forEach((h,i)=>{let dx=this.reduceMotion?0:Math.sin(now/2800+i)*9;this.person(ctx,h.x-20+dx,h.y+32,i,true,owner==='tenant'&&this.selected?.property===h.id);});
    for(let i=0;i<4;i++)this.person(ctx,639+i*18,153+(i%2)*8,i+6,false,owner==='landlord');
    for(let i=0;i<7;i++)this.person(ctx,635+(i%4)*21,370+Math.floor(i/4)*19,i+10,false,owner==='contractor');
    for(let i=0;i<4;i++)this.person(ctx,322+i*22,257+(i%2)*5,i+18,false,owner==='agency'||owner==='operator');
    if(!this.particles.some(p=>p.kind==='van'))this.van(ctx,670,347);
    for(const h of HOUSES){const active=this.tickets.filter(t=>t.property===h.id&&!t.ended);if(active.length)this.bubble(ctx,String(active.length),h.x-28,h.y-51);}
    for(const p of this.particles){const fraction=Math.min(1,(now-p.start)/p.duration);const x=p.source.x+(p.target.x-p.source.x)*fraction,y=p.source.y+(p.target.y-p.source.y)*fraction-Math.sin(fraction*Math.PI)*(p.kind==='van'?0:35);
      if(p.kind==='van')this.van(ctx,x,y);else{this.rect(ctx,x-6,y-4,12,8,'#fffbdf');this.rect(ctx,x-6,y-4,12,1,'#b69b63');this.rect(ctx,x-5,y-3,2,2,'#cbb484');this.rect(ctx,x+3,y-3,2,2,'#cbb484');this.rect(ctx,x-3,y-1,6,1,'#cbb484');}}
    this.particles=this.particles.filter(p=>now-p.start<p.duration);
    const simTime=this.selected?.events.at(-1)?.sim_time;
    if(simTime){const hour=new Date(simTime).getUTCHours();if(hour<6||hour>=19){ctx.fillStyle='#35466c22';ctx.fillRect(0,0,768,480);}}
    requestAnimationFrame(t=>this.frame(t));
  }
}
