// node blogs/artifacts/gluon-layouts/render-diagrams.cjs [05-repeat|07-wave-tiles|10-slice-layout|layout-overview|linear-layouts|linear-binary|swizzled-shared|padded-shared|padded-start|memory-instructions]
// Original diagrams; Rough.js and the unmodified Virgil font are vendored in ../mi300x.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const shared = path.join(__dirname, '../mi300x');
const context = {};
vm.runInNewContext(fs.readFileSync(path.join(shared, 'vendor/rough.js'), 'utf8'), context);
const font = fs.readFileSync(path.join(shared, 'fonts/Virgil.woff2')).toString('base64');
const license = fs.readFileSync(path.join(shared, 'fonts/LICENSE.md'), 'utf8').replaceAll('--', '—');
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const C = ['#d0ebff', '#ffe3e3', '#d3f9d8', '#e5dbff'];
class Sketch {
  constructor(name, height, title, description) {
    this.name=name; this.height=height; this.seed=1100; this.gen=context.rough.generator();
    this.parts=[`<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${height}" viewBox="0 0 1100 ${height}" role="img" aria-labelledby="title desc"><title id="title">${esc(title)}</title><desc id="desc">${esc(description)}</desc>`,
      `<!-- Unmodified Virgil font: https://github.com/excalidraw/virgil\n${license}\n-->`,
      `<defs><style>@font-face{font-family:Virgil;src:url(data:font/woff2;base64,${font}) format('woff2')}text{font-family:Virgil,cursive;font-weight:400}</style></defs><rect width="1100" height="${height}" fill="#fffaf3"/>`];
    this.text(40,55,31,title);
  }
  draw(shape) { for(const p of this.gen.toPaths(shape))this.parts.push(`<path d="${p.d}" fill="${p.fill||'none'}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`); }
  rect(x,y,w,h,fill='none',stroke='#675447') {this.draw(this.gen.rectangle(x,y,w,h,{fill,fillStyle:'solid',stroke,strokeWidth:1.7,roughness:.9,seed:this.seed++}));}
  line(x,y,a,b,color='#8b6c57') {this.draw(this.gen.line(x,y,a,b,{stroke:color,strokeWidth:1.8,roughness:.7,seed:this.seed++}));}
  arrow(x,y,a,b) {this.line(x,y,a,b);const t=Math.atan2(b-y,a-x);for(const d of [-.5,.5])this.line(a,b,a-12*Math.cos(t+d),b-12*Math.sin(t+d));}
  text(x,y,size,value,color='#332c26',anchor='start') {this.parts.push(`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="${anchor}">${esc(value)}</text>`);}
  center(x,y,size,value,color) {this.text(x,y,size,value,color,'middle');}
  grid(x,y,rows,cols,cw,ch,label,fill,fontsize=22) {
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      this.parts.push(`<rect x="${x+c*cw}" y="${y+r*ch}" width="${cw}" height="${ch}" fill="${fill(r,c)}" stroke="#bdad9c" stroke-width=".8"/>`);
      const value=label(r,c);if(value!=='' && value!==undefined)this.center(x+(c+.5)*cw,y+(r+.5)*ch+fontsize*.34,fontsize,value);
    }
    this.rect(x,y,cols*cw,rows*ch);
  }
  card(x,y,w,h,color,title,lines) {this.rect(x,y,w,h,color);this.center(x+w/2,y+39,25,title);lines.forEach((v,i)=>this.center(x+w/2,y+83+i*35,23,v));}
  save(){fs.writeFileSync(path.join(__dirname,`${this.name}.svg`),this.parts.join('\n')+'\n</svg>\n');}
}

function ownership(){
 const s=new Sketch('01-ownership',470,'A layout tells us who owns each value','The first eight elements of a larger vector. With size_per_thread=[2], lane 0 owns x[0] and x[1], lane 1 owns x[2] and x[3], and so on. Only four lanes are shown.');
 s.text(40,104,22,'The first 8 values of our vector');
 s.grid(70,135,1,8,120,62,(_,c)=>`x[${c}]`,(_,c)=>C[Math.floor(c/2)]);
 for(let l=0;l<4;l++){const x=40+l*265;s.arrow(190+l*240,203,x+115,260);s.card(x,280,225,140,C[l],`Lane ${l}`,[`x[${2*l}], x[${2*l+1}]`]);}
 s.save();
}
function memory(){
 const s=new Sketch('02-memory-and-ownership',510,'The address and the owner answer different questions','A four-by-four corner of a sixteen-by-thirty-two row-major tensor. Addresses use row stride 32. Ownership follows BlockedLayout([1,2],[8,8],[2,2],[1,0]). The logical tensor is unchanged.');
 s.center(280,118,25,'Offsets from the base pointer');s.center(815,118,25,'Lane that owns each value');
 s.grid(70,150,4,4,105,65,(r,c)=>r*32+c,()=>C[0]);
 s.grid(605,150,4,4,105,65,(r,c)=>`L${r*8+Math.floor(c/2)}`,(r,c)=>C[Math.floor(c/2)]);
 s.center(280,460,22,'offset = row × 32 + column');s.center(815,460,22,'A 4 × 4 corner, all in wave 0');s.save();
}
function baseline(){
 const s=new Sketch('03-four-waves',530,'256 values, 256 threads, one value each','BlockedLayout([1],[64],[4],[0]) for a vector of shape [256]. Each wave owns 64 consecutive logical elements.');
 for(let w=0;w<4;w++){
  const y=108+w*99;s.rect(40,y,1020,80,C[w]);s.text(58,y+32,25,`Wave ${w}`);s.text(58,y+61,18,'64 lanes');
  for(let l=0;l<4;l++)s.center(325+l*128,y+49,26,`x[${w*64+l}]`);
  s.center(835,y+48,30,'…');s.center(967,y+48,26,`x[${w*64+63}]`);
 }s.save();
}
function size(){
 const s=new Sketch('04-size-per-thread',500,'Two values per thread means two neighbors at a time','The first eight vector positions. size_per_thread one assigns adjacent elements to different lanes; size_per_thread two assigns pairs to each lane. The full base tile grows from 256 to 512 values.');
 for(let row=0;row<2;row++){
  const y=145+row*190, size=row+1;s.text(40,y-30,25,`size_per_thread = [${size}]`);
  s.grid(40,y,1,8,127,75,(_,i)=>`x[${i}]`,(_,i)=>C[Math.floor(i/size)%4]);
  for(let i=0;i<8;i++)s.center(40+(i+.5)*127,y+112,21,`Lane ${Math.floor(i/size)}`);
 }s.save();
}
function repeat(){
 const s=new Sketch('05-repeat',865,'256 threads share 1,024 values','One 1024-element vector is drawn as four consecutive 256-element chunks. Columns identify the same threads across all four chunks. Thread 0, wave 0 lane 0, owns x[0], x[256], x[512], and x[768]. Thread 1 owns x[1], x[257], x[513], and x[769]. Thread 255, wave 3 lane 63, owns x[255], x[511], x[767], and x[1023]. The layout has size_per_thread one, sixty-four lanes per wave, and four waves.');
 s.text(40,106,24,'One 1D vector, drawn in four chunks of 256 values.');
 const threads=[0,1,2,null,255], fills=[C[0],C[1],C[2],'#fffaf3',C[3]];
 for(let col=0;col<5;col++){
  const x=190+col*174;
  s.center(x+87,170,25,threads[col]===null?'…':`Thread ${threads[col]}`);
  if(threads[col]!==null)s.center(x+87,204,18,`wave ${Math.floor(threads[col]/64)}, lane ${threads[col]%64}`);
 }
 for(let chunk=0;chunk<4;chunk++){
  const y=235+chunk*90;
  s.text(40,y+29,21,'Indices');s.text(40,y+57,23,`${chunk*256}–${chunk*256+255}`);
  s.grid(190,y,1,5,174,72,(_,col)=>threads[col]===null?'…':`x[${chunk*256+threads[col]}]`,(_,col)=>fills[col],27);
 }
 s.rect(185,230,184,352,'none','#9a3412');
 s.arrow(277,590,277,643);
 s.rect(40,660,1020,100,C[0]);s.center(550,701,27,'Read down the blue column: all four values belong to thread 0.');
 s.center(550,740,28,'x[0], x[256], x[512], x[768]');
 s.center(550,816,27,'1,024 values ÷ 256 threads = 4 values per thread');s.save();
}
function hierarchy(){
 const s=new Sketch('06-build-a-tile',640,'Build a tile from the inside out','A lane owns one by two values. Sixty-four lanes arranged eight by eight form an eight-by-sixteen wave tile. Four waves arranged two by two form a sixteen-by-thirty-two workgroup tile.');
 s.card(40,125,280,190,C[0],'One lane',['1 × 2 values','size_per_thread']);
 s.card(410,125,280,190,C[1],'One wave',['8 × 8 lanes','8 × 16 values']);
 s.card(780,125,280,190,C[2],'One workgroup',['2 × 2 waves','16 × 32 values']);
 s.arrow(330,218,393,218);s.arrow(700,218,763,218);
 s.rect(40,375,1020,180,'#fff3bf');s.center(550,422,29,'[1, 2] × [8, 8] × [2, 2] = [16, 32]');
 s.center(550,470,25,'512 values ÷ 256 threads = 2 values per thread');
 s.center(550,516,23,'Multiply each dimension separately.');s.save();
}
function waveTiles(matrix,owners){
 const patch=new Sketch('07-thread-patch',880,'size_per_thread = [1, 2]','One thread owns one row and two neighboring columns: two tensor values. Both cells belong to the same thread.');
 patch.text(40,112,25,'Start with the values owned by ONE thread.');
 patch.center(505,229,29,'2 columns');
 patch.line(310,247,700,247);patch.line(310,239,310,255);patch.line(700,239,700,255);
 patch.center(169,345,29,'1 row');
 patch.line(277,270,277,410);patch.line(269,270,285,270);patch.line(269,410,285,410);
 patch.grid(310,270,1,2,195,140,(_,c)=>`x[0,${c}]`,()=>C[0],31);
 patch.rect(230,520,640,155,C[0]);patch.center(550,571,30,'One thread owns BOTH values.');
 patch.center(550,625,29,'1 row × 2 columns = 2 values');
 patch.center(550,789,25,'Next: arrange 64 of these two-value patches into one wave.');patch.save();

 const lanes=new Sketch('07-wave-patches',880,'threads_per_warp = [8, 8]','One wave contains eight rows and eight columns of lanes. Each outlined lane contains two small value cells. The sixty-four lanes cover an eight-by-sixteen tensor tile, or one hundred twenty-eight values. Lane seventeen is at lane-grid row two column one.');
 lanes.text(40,110,25,'8 rows × 8 columns of LANES. Each lane still owns 2 values.');
 lanes.center(579,156,24,'8 columns of lanes');
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){
  const lane=r*8+c,x=145+c*108,y=183+r*62,active=lane===17;
  lanes.parts.push(`<g data-lane="${lane}"><title>Lane ${lane}: row ${r}, columns ${2*c} and ${2*c+1}</title>`);
  lanes.rect(x,y,102,56,active?'#fff3bf':'#f2f8fc',active?'#9a3412':'#8a7663');
  lanes.center(x+51,y+20,18,`L${lane}`);
  for(let slot=0;slot<2;slot++)lanes.parts.push(`<rect data-value="${slot}" x="${x+7+slot*47}" y="${y+27}" width="41" height="23" fill="${active?'#9a3412':C[0]}" stroke="#8e7964" stroke-width=".8"/>`);
  lanes.parts.push('</g>');
 }
 lanes.center(85,390,27,'8');lanes.center(85,426,24,'rows');
 lanes.center(550,733,24,'Each outlined box is ONE lane; its two small cells are values.');
 lanes.center(550,785,29,'[1,2] × [8,8] = [8,16] values in one wave');
 lanes.center(550,836,24,'64 lanes × 2 values = 128 values');lanes.save();

 const s=new Sketch('07-wave-tiles',880,'warps_per_cta = [2, 2]','Four waves form two rows and two columns of wave tiles. Each wave covers eight rows and sixteen columns of values. Every outlined pair of adjacent cells belongs to one lane. The complete workgroup tile is sixteen by thirty-two values, with two hundred fifty-six threads and five hundred twelve values. Wave three lane seventeen owns row ten columns eighteen and nineteen.');
 const map=owners(matrix), x=102,y=202,cw=28,ch=28;
 s.text(40,110,25,'2 rows × 2 columns of WAVES. Each wave covers 8 × 16 values.');
 s.grid(x,y,16,32,cw,ch,()=>'',(r,c)=>C[map.get(`${r},${c}`)[0].wave]);
 for(let r=0;r<16;r++)for(let c=0;c<32;c+=2)s.rect(x+c*cw,y+r*ch,2*cw,ch,'none','#a38a72');
 for(let w=0;w<4;w++){
  const wx=x+(w%2)*448,wy=y+Math.floor(w/2)*224;
  s.draw(s.gen.rectangle(wx,wy,448,224,{stroke:'#51453b',strokeWidth:3.4,roughness:.7,seed:s.seed++}));
  s.center(wx+224,w<2?180:690,29,`Wave ${w}`);
 }
 for(const [r,c] of [[10,18],[10,19]])s.rect(x+c*cw,y+r*ch,cw,ch,'#9a3412','#9a3412');
 s.center(46,304,24,'8');s.center(46,337,21,'rows');s.center(46,532,24,'8');s.center(46,565,21,'rows');
 s.center(550,754,31,'[1,2] × [8,8] × [2,2] = [16,32]');
 s.center(550,802,24,'Outlined pairs = lanes. Thick borders = waves.');
 s.center(550,845,24,'256 threads × 2 values = 512 values in this base tile');s.save();
}
function order(){
 const s=new Sketch('08-order',525,'Which dimension gets the next lane?','A four-by-four corner of an eight-by-eight lane grid. With order one zero, lane IDs advance along columns. With order zero one, they advance along rows. Each lane still owns one by two values.');
 s.center(280,116,27,'order = [1, 0]');s.center(815,116,27,'order = [0, 1]');
 s.grid(70,150,4,4,105,65,(r,c)=>`L${r*8+c}`,(_,c)=>C[c]);
 s.grid(605,150,4,4,105,65,(r,c)=>`L${c*8+r}`,(r)=>C[r]);
 s.center(280,461,23,'Columns advance first');s.center(815,461,23,'Rows advance first');
 s.center(550,503,19,'Each box is one lane’s 1 × 2 patch. Only the first 4 × 4 patches are shown.');s.save();
}
function trace(){
 const s=new Sketch('09-trace-lane17',625,'Let’s find wave 3, lane 17 by hand','For the sixteen-by-thirty-two example, lane 17 maps to lane-grid row 2 column 1, wave 3 maps to wave-grid row 1 column 1. Multiplying by tile extents gives output row 10 and columns 18 and 19.');
 s.card(40,120,490,170,C[0],'Lane 17 in an 8 × 8 lane grid',['17 // 8 = 2 rows down','17 % 8 = 1 column across']);
 s.card(570,120,490,170,C[1],'Wave 3 in a 2 × 2 wave grid',['3 // 2 = 1 row down','3 % 2 = 1 column across']);
 s.arrow(285,295,285,342);s.arrow(815,295,815,342);
 s.rect(40,365,1020,190,C[2]);s.center(550,412,27,'row = 1 × 8 + 2 = 10');s.center(550,460,27,'column = 1 × 16 + 1 × 2 = 18');s.center(550,513,30,'Two values: x[10,18], x[10,19]');s.save();
}
function slice(model){
 const s=new Sketch('10-slice-layout',800,'Give each lane the indices for its own values','Three lanes in wave three of the sixteen-by-thirty-two parent layout all need row index ten. Lane sixteen needs columns sixteen and seventeen, lane seventeen needs eighteen and nineteen, and lane eighteen needs twenty and twenty-one. SliceLayout one derives the repeated row ownership; SliceLayout zero derives the column ownership. These are distributions of indices, not matrix data slices.');
 s.text(40,108,24,'Target: our 16 × 32 parent layout. Here are three lanes in wave 3.');
 for(let i=0;i<3;i++){
  const lane=16+i, coords=model.elements(model.matrix,3,lane), row=coords[0][0];
  s.card(40+i*350,150,320,255,i===1?'#fff3bf':C[i],`Lane ${lane}`,[
   `row index: ${row}`, `columns: ${coords.map(c=>c[1]).join(', ')}`,
   ...coords.map(([r,c])=>`x[${r},${c}]`)]);
 }
 s.center(550,464,27,'Same row index. Different column indices.');
 s.card(40,510,490,190,C[0],'Rows: shape [16]',[
  'SliceLayout(1, parent)', 'Drop the column dimension', 'Row 10 is available in all three lanes']);
 s.card(570,510,490,190,C[1],'Columns: shape [32]',[
  'SliceLayout(0, parent)', 'Drop the row dimension', 'Each lane gets its own column pair']);
 s.center(550,762,24,'The index vectors follow the ownership of the chosen 2D layout.');s.save();
}
function coalescing(){
 const s=new Sketch('11-memory-access',560,'The addresses issued together matter','Two possible lane mappings for a row-major float32 matrix with 256 columns. The first eight lanes in one access group can request consecutive columns, or values separated by a 256-element row stride. This illustrates address locality, not measured transaction counts.');
 s.text(40,110,23,'Row-major FP32 matrix: address = base + (row × 256 + col) × 4');
 for(let p=0;p<2;p++){
  const y=185+p*175;s.text(40,y-25,25,p===0?'Lanes advance across columns':'Lanes advance down rows');
  s.grid(40,y,1,8,127,65,(_,i)=>p===0?`${i*4} B`:`${i*1024} B`,()=>p===0?C[2]:C[1]);
  s.text(40,y+108,21,p===0?'Byte offsets for lanes 0–7: adjacent values':'Byte offsets for lanes 0–7: one row apart');
 }s.save();
}
function memoryInstructions(model){
 const examples=[
  {name:'Coalesced',color:C[2],shape:[64,64],size:[1,1],threads:[1,64],warps:[4,1],order:[1,0]},
  {name:'Uncoalesced',color:C[1],shape:[64,64],size:[1,1],threads:[64,1],warps:[1,4],order:[0,1]},
 ];
 const requests=examples.map(layout=>Array.from({length:64},(_,lane)=>{
  const [row,col]=model.elements(layout,0,lane)[0];return {lane,row,col,bytes:(row*64+col)*4};
 }));
 const a=new Sketch('33-memory-lane-addresses',820,'Which addresses do the lanes ask for?','Wave zero\'s first load from a 64 by 64 FP32 tile. An eight by eight corner highlights the first eight lanes across row zero for the coalesced layout and down column zero for the uncoalesced layout. The lane address examples show 4-byte steps across columns and 256-byte steps down rows, reaching offsets 252 and 16128 for lane 63.');
 a.text(40,107,23,'First load, wave 0. Byte offset = (row × 64 + column) × 4');
 a.text(40,143,21,'An 8 × 8 corner is shown; the full tile is 64 × 64.');
 for(let p=0;p<2;p++){
  const cx=p===0?285:815,gx=p===0?125:655,rs=requests[p];
  a.center(cx,180,24,p===0?'Coalesced: lanes across columns':'Uncoalesced: lanes down rows');
  for(const n of [0,1,7]){
   a.center(gx+(n+.5)*36,209,18,n);a.text(gx-23,244+n*36,18,n);
  }
  const lookup=new Map(rs.map(r=>[`${r.row},${r.col}`,r.lane]));
  a.grid(gx,222,8,8,36,36,(r,c)=>lookup.has(`${r},${c}`)?`L${lookup.get(`${r},${c}`)}`:'',(r,c)=>lookup.has(`${r},${c}`)?examples[p].color:'#f4eee6',17);
  const x=p===0?40:570;
  a.rect(x,539,490,192,examples[p].color);
  [0,1,2,63].forEach((lane,i)=>{
   const r=rs[lane];a.text(x+22,574+i*39,23,`L${lane} → (${r.row},${r.col}) → ${r.bytes} B`);
  });
 }
 a.center(550,785,25,'Across columns: 4-byte steps. Down rows: 256-byte steps.');a.save();

 const b=new Sketch('34-global-load-instruction',740,'One global load, 64 per-lane addresses','Annotated global_load_dword v13, v0, s[2:3]. The opcode loads four bytes per active lane, v13 receives each lane\'s result, v0 supplies each lane\'s byte offset, and s[2:3] supplies the wave\'s shared 64-bit source base. For the first coalesced load in wave zero, lanes 0, 1, 2, and 63 supply offsets 0, 4, 8, and 252.');
 b.text(40,108,23,'Actual first load from the coalesced MI300X listing');
 const tokens=[{x:40,w:420,text:'global_load_dword',color:C[0]},{x:480,w:120,text:'v13',color:C[2]},{x:620,w:120,text:'v0',color:C[1]},{x:760,w:300,text:'s[2:3]',color:C[3]}];
 for(const t of tokens)b.rect(t.x,157,t.w,63,t.color);
 for(const t of tokens)b.center(t.x+t.w/2,198,28,t.text);
 b.arrow(250,229,250,270);b.center(250,306,24,'4 bytes / active lane');
 b.arrow(540,229,540,270);b.center(540,306,23,'result');
 b.arrow(680,229,680,313);b.center(680,347,23,'byte offset');
 b.arrow(910,229,910,270);b.center(910,306,22,'shared 64-bit base');
 b.rect(40,383,1020,66,'#fff3bf');b.center(550,426,28,'address for lane L = source base + v0[L]');
 b.text(40,492,23,'For this first load in wave 0:');
 const lanes=[0,1,2,63];
 for(let i=0;i<lanes.length;i++)b.center(40+(i+.5)*255,532,24,`Lane ${lanes[i]}`);
 b.grid(40,551,1,4,255,63,(_,i)=>`v0 = ${requests[0][lanes[i]].bytes} B`,()=>C[1],25);
 b.center(550,665,26,'Each lane receives its own loaded value in v13.');
 b.center(550,714,24,'64 active lanes × 4 bytes = 256 bytes of useful data');b.save();

 const c=new Sketch('35-memory-address-regions',900,'Same useful data, different address footprints','Each row represents one aligned 64-byte address region with sixteen 4-byte cells. The first coalesced load fills four regions with lanes zero through sixty-three. The uncoalesced load requests only one cell in each of sixty-four regions; regions starting at byte offsets zero, two hundred fifty-six, five hundred twelve, and sixteen thousand one hundred twenty-eight are shown. Both loads request two hundred fifty-six useful bytes. These are address-footprint counts for one wave instruction.');
 c.text(40,107,23,'First load, wave 0; 64-byte-aligned base. One cell = 4 bytes.');
 const regions=requests.map(rs=>{
  const map=new Map();for(const r of rs){const id=Math.floor(r.bytes/64);if(!map.has(id))map.set(id,new Map());map.get(id).set((r.bytes%64)/4,r.lane);}return map;
 });
 const drawRegion=(y,id,map,color)=>{
  c.text(40,y+29,21,`${id*64}–${id*64+63} B`);
  c.grid(260,y,1,16,49,44,(_,cell)=>map.has(cell)?`L${map.get(cell)}`:'',(_,cell)=>map.has(cell)?color:'#f4eee6',17);
 };
 c.text(40,164,26,`Coalesced: 64 lanes touch ${regions[0].size} regions`);
 [...regions[0]].forEach(([id,map],i)=>drawRegion(195+i*55,id,map,C[2]));
 c.text(40,476,26,`Uncoalesced: 64 lanes touch ${regions[1].size} regions`);
 [0,1,2,63].forEach((lane,i)=>{
  const id=Math.floor(requests[1][lane].bytes/64);drawRegion([510,565,620,735][i],id,regions[1].get(id),C[1]);
 });
 c.center(650,704,23,'… 60 more requested regions omitted …');
 c.center(550,840,23,'Colored cells are requested FP32 values. Gray cells are unrequested here.');
 c.center(550,881,22,'Counts describe this instruction\'s address footprint; cache reuse comes later.');c.save();
}
function conversion(){
 const s=new Sketch('12-convert-layout',570,'Same values. Different threads holding them.','The first eight positions of a 512-element vector before and after converting BlockedLayout one to BlockedLayout two, with sixty-four lanes and four waves. Value x one moves from lane one to lane zero. Logical values and tensor shape stay the same.');
 s.text(40,112,25,'Before: size_per_thread = [1]');
 s.grid(40,145,1,8,127,70,(_,i)=>`x[${i}]`,(_,i)=>C[i%4]);
 for(let i=0;i<8;i++)s.center(40+(i+.5)*127,250,21,`Lane ${i}`);
 s.arrow(40+1.5*127,263,40+1.5*127,327);s.text(285,303,22,'x[1]: lane 1 → lane 0');
 s.grid(40,345,1,8,127,70,(_,i)=>`x[${i}]`,(_,i)=>C[Math.floor(i/2)]);
 for(let i=0;i<8;i++)s.center(40+(i+.5)*127,450,21,`Lane ${Math.floor(i/2)}`);
 s.text(40,509,25,'After: size_per_thread = [2]');s.save();
}
function costs(){
 const s=new Sketch('13-conversion-cost',400,'How far do the values have to travel?','A layout conversion may need no communication when owners do not change, wave-local exchange when values move between lanes of the same wave, or shared memory and synchronization for exchanges across waves. Exact code depends on layouts and target.');
 s.card(40,120,320,220,C[2],'Same thread',['Reinterpret or reorder','No exchange needed']);
 s.card(390,120,320,220,C[0],'Within a wave',['Exchange lane values','Wave-level operations']);
 s.card(740,120,320,220,C[1],'Across waves',['May stage through LDS','Plus synchronization']);s.save();
}
function gemm(model){
 const s=new Sketch('14-gemm-loads',725,'Now read the layouts from our GEMM','With BLOCK_K thirty-two, A uses size one eight, lanes sixteen four, waves four one, order one zero. B uses size eight one, lanes four sixteen, waves one four, order zero one. Wave two lane seventeen owns A row thirty-six K eight through fifteen, and B K eight through fifteen column thirty-six.');
 const A=model.owners(model.loadA),B=model.owners(model.loadB);
 s.center(280,115,28,'A tile [64,32]');s.center(815,115,28,'B tile [32,64]');
 s.grid(140,150,64,32,8,6,()=>'',(r,c)=>{const o=A.get(`${r},${c}`)[0];return o.wave===2&&o.lane===17?'#9a3412':C[o.wave];});
 s.grid(570,235,32,64,7.6,8,()=>'',(r,c)=>{const o=B.get(`${r},${c}`)[0];return o.wave===2&&o.lane===17?'#9a3412':C[o.wave];});
 s.center(280,580,26,'A[36, 8:16]');s.center(815,580,26,'B[8:16, 36]');
 s.center(550,632,24,'Dark cells belong to wave 2, lane 17.');s.center(550,682,22,'Each lane owns 8 values per input tile. The upper endpoint is excluded.');s.save();
}
function mfma(){
 const s=new Sketch('15-mfma-path',540,'Load ownership and matrix-instruction ownership can differ','A and B are loaded with blocked layouts, converted to operand layouts whose parent is the MFMA accumulator layout, and multiplied with the AMD CDNA3 MFMA operation. A layout conversion preserves logical values.');
 for(let row=0;row<2;row++){
  const y=130+row*155;s.card(40,y,300,120,C[row],row===0?'A: blocked load':'B: blocked load',[]);
  s.arrow(350,y+55,420,y+55);s.card(435,y,340,120,C[3],`DotOperandLayout(${row}, …)`,[]);
 }
 s.arrow(784,185,865,260);s.arrow(784,340,865,280);s.card(880,205,180,135,C[2],'MFMA',['FP32 acc']);
 s.center(550,485,26,'gl.convert_layout prepares the operands; MFMA does the matrix math.');s.save();
}
function tail(){
 const s=new Sketch('16-masked-tail',540,'A mask handles the tail without changing the layout','Vector addition for N seven hundred and block size five hundred twelve. The second program starts at five hundred twelve. Wave one lane twenty-nine owns indices six hundred ninety-eight and six hundred ninety-nine. Lane thirty owns seven hundred and seven hundred one, both masked.');
 s.rect(40,115,1020,85,C[0]);s.center(550,150,27,'Program 1: indices 512–1023');s.center(550,183,22,'Same layout: 4 waves × 64 lanes × 2 values');
 s.grid(40,250,1,8,127,70,(_,i)=>696+i,(_,i)=>i<4?C[2]:'#eee4d9');
 s.card(40,370,490,125,C[2],'Wave 1, lane 29',['698 and 699: load, add, store']);
 s.card(570,370,490,125,'#eee4d9','Wave 1, lane 30',['700 and 701: masked out']);s.save();
}
function layoutMap(){
 const s=new Sketch('17-layout-map',640,'Seven layouts, two kinds of mapping','Five distributed layout classes describe thread ownership: BlockedLayout, SliceLayout, DistributedLinearLayout, AMDMFMALayout, and DotOperandLayout. Two shared layout classes describe LDS placement: SwizzledSharedLayout and PaddedSharedLayout.');
 s.card(40,120,490,435,C[0],'Distributed layouts',[
  'Which thread holds a value?', 'BlockedLayout', 'SliceLayout', 'DistributedLinearLayout', 'AMDMFMALayout', 'DotOperandLayout']);
 s.card(570,120,490,435,C[2],'Shared-memory layouts',[
  'Where does a value sit in LDS?', 'SwizzledSharedLayout', 'PaddedSharedLayout']);
 s.center(550,607,25,'A shared-memory load connects LDS placement to thread ownership.');s.save();
}
function linearBits(){
 const s=new Sketch('18-linear-bits',1050,'All the bits that produce A[38,9]','The complete input IDs are slot nine as 001001, lane seventeen as 010001, and wave two as 10. Their set bits select R0=[0,1], R3=[4,0], L0=[0,8], L4=[32,0], and W1=[2,0]. All five row masks are shown with eight bits and column masks with six bits. XOR gives row 00100110, decimal 38, and column 001001, decimal 9.');
 s.text(40,108,24,'R = slot bit, L = lane bit, W = wave bit. Select their basis masks.');
 const inputs=[['Slot 9',9,6,C[0]],['Lane 17',17,6,C[1]],['Wave 2',2,2,C[3]]];
 inputs.forEach(([label,value,width,color],i)=>{
  const x=40+i*350;s.rect(x,145,320,190,'#fffdf9');s.center(x+160,184,25,label);
  const bx=x+(320-width*40)/2;
  bitLabels(s,bx,215,width,40);bitRow(s,bx,230,value,width,color,40,46);
  s.center(x+160,312,21,`${width} input bits`);
 });
 s.text(40,397,22,'Selected basis');s.center(456,397,23,'Row mask: 8 bits');s.center(882,397,23,'Column mask: 6 bits');
 bitLabels(s,240,436,8,54);bitLabels(s,720,436,6,54);
 const selected=[['R0 [0,1]',0,1,C[0]],['R3 [4,0]',4,0,C[0]],['L0 [0,8]',0,8,C[1]],['L4 [32,0]',32,0,C[1]],['W1 [2,0]',2,0,C[3]]];
 selected.forEach(([label,row,col,color],i)=>{
  const y=452+i*71;s.text(40,y+32,23,label);
  bitRow(s,240,y,row,8,color,54,44);bitRow(s,720,y,col,6,color,54,44);
 });
 s.line(35,824,1055,824);s.text(40,873,23,'XOR 5 masks');
 bitRow(s,240,844,38,8,C[2],54,48);bitRow(s,720,844,9,6,C[2],54,48);
 s.center(456,947,28,'00100110 = 38');s.center(882,947,28,'001001 = 9');
 s.center(550,1011,28,'The value belongs to A[38,9].');s.save();
}
function bitLabels(s,x,y,width,cw){
 for(let i=0;i<width;i++)s.center(x+(i+.5)*cw,y,16,`b${width-1-i}`);
}
function bitRow(s,x,y,value,width,color,cw=52,ch=42){
 const bits=value.toString(2).padStart(width,'0');
 s.grid(x,y,1,width,cw,ch,(_,c)=>bits[c],(_,c)=>bits[c]==='1'?color:'#f4eee6',25);
}
function linearLookup(){
 const s=new Sketch('27-linear-lookup',910,'Lane 5, with all six input bits shown','Lane five is 000101 across all six lane-ID bits, ordered bit five to bit zero. Bits five four three and one are zero and contribute nine-bit zero masks. Bit two selects basis entry two, eight, mask 000001000. Bit zero selects entry zero, two, mask 000000010. XOR of all six contributions is 000001010, decimal ten. This is only the lane contribution; slot and wave contributions are combined later.');
 s.text(40,108,24,'Compute just the lane contribution first. Bits run from b5 to b0.');
 s.text(40,202,26,'Lane 5');bitLabels(s,270,152,6,120);bitRow(s,270,168,5,6,C[1],120,52);
 for(let c=0;c<6;c++)s.center(270+(c+.5)*120,253,22,`weight ${2**(5-c)}`);
 s.text(40,307,24,'State = 1: include this basis. State = 0: contribute zeros.');
 s.text(40,354,22,'Input bit');s.text(165,354,22,'State');s.text(270,354,22,'lane_bases entry');s.center(774,354,22,'Output contribution: 9 bits');
 bitLabels(s,540,376,9,52);
 for(let i=0;i<6;i++){
  const bit=5-i,on=(5>>bit)&1,mask=on?2**(bit+1):0,y=382+i*55;
  s.text(40,y+29,24,`b${bit}`);s.center(190,y+29,26,on);
  s.text(270,y+29,22,`[${bit}] = [${2**(bit+1)}]`);bitRow(s,540,y,mask,9,C[1],52,40);
 }
 s.line(40,735,1060,735);s.text(40,792,25,'XOR the six contributions');bitRow(s,540,759,10,9,C[2],52,45);
 s.center(550,861,28,'Lane contribution: 000001010 = 8 + 2 = 10');s.save();
}
function xorReason(){
 const s=new Sketch('28-why-xor',850,'XOR combines bits without a carry','With the changed lane bases two and six, lane three has input bits zero and one set. Their nine-bit masks are 000000010 and 000000110. XOR cancels the shared one in bit one, leaving 000000100, decimal four. Ordinary addition carries that shared bit and produces 000001000, decimal eight. The table of one-bit XOR results is zero XOR zero equals zero, zero XOR one equals one, one XOR zero equals one, one XOR one equals zero.');
 s.text(40,110,24,'Change lane_bases[1] to [6]; the other bases stay the same.');
 s.text(40,144,22,'Lane 3 = 000011: only input bits b1 and b0 are set.');
 const labels=['basis [0] = 2','basis [1] = 6','XOR result = 4','Ordinary sum = 8'];
 const values=[2,6,4,8];
 bitLabels(s,405,165,9,66);
 values.forEach((value,i)=>{const y=188+i*77;s.text(40,y+34,25,labels[i]);bitRow(s,405,y,value,9,i===2?C[2]:i===3?C[3]:C[1],66,48);});
 s.rect(40,546,1020,115,'#fff3bf');s.center(550,590,27,'The shared 1 in b1: 1 XOR 1 = 0.');
 s.center(550,633,26,'Addition carries into b2, then b3. XOR makes no carry.');
 s.center(550,719,25,'One-bit XOR: 0^0=0    0^1=1    1^0=1    1^1=0');
 s.center(550,797,25,'The bases define a binary-linear ownership map.');s.save();
}
function packedBinary(){
 const s=new Sketch('29-complete-1d-binary',720,'Put all three ID contributions together','For the regular one-dimensional layout, wave two is 10, lane five is 000101, and slot one is 1. Non-overlapping output masks place those bits in nine output positions: W1 W0 L5 L4 L3 L2 L1 L0 R0. The result is 100001011, decimal two hundred sixty-seven.');
 s.text(40,109,24,'For the original bases: wave 2 = 10, lane 5 = 000101, slot 1 = 1.');
 const groups=[{x:40,w:250,label:'Wave 2',value:2,bits:2,color:C[3]},
  {x:320,w:490,label:'Lane 5',value:5,bits:6,color:C[1]},
  {x:840,w:220,label:'Slot 1',value:1,bits:1,color:C[0]}];
 groups.forEach(g=>{s.rect(g.x,150,g.w,170,'#fffdf9');s.center(g.x+g.w/2,190,26,g.label);
  bitRow(s,g.x+(g.w-g.bits*60)/2,221,g.value,g.bits,g.color,60,52);});
 const sources=['wave b1','wave b0','lane b5','lane b4','lane b3','lane b2','lane b1','lane b0','slot b0'];
 const bits=(267).toString(2).padStart(9,'0');
 for(let i=0;i<9;i++){
  const x=100+i*100,color=i<2?C[3]:i<8?C[1]:C[0];
  s.center(x+50,389,19,sources[i]);s.grid(x,410,1,1,100,65,()=>bits[i],()=>color,32);
  s.center(x+50,514,20,`b${8-i}`);s.center(x+50,549,20,2**(8-i));
 }
 s.center(550,615,31,'100001011 = 256 + 8 + 2 + 1 = 267');
 s.center(550,679,23,'These particular bases place the input groups in separate output-bit columns.');s.save();
}
function linearInterleave(){
 const s=new Sketch('19-interleaved-bits',500,'The bases interleave register, lane, and wave bits','For this A layout, the row bits from low to high come from wave zero, wave one, register three, register four, lane three, lane four, lane five, register five. The K bits come from register zero one two and lane zero one two.');
 s.text(40,120,25,'M coordinate: bits from lowest to highest');
 const m=['W0','W1','R3','R4','L3','L4','L5','R5'];
 const color=v=>v[0]==='W'?C[3]:v[0]==='R'?C[0]:C[1];
 s.grid(40,150,1,8,127,70,(_,i)=>m[i],(_,i)=>color(m[i]));
 for(let i=0;i<8;i++)s.center(40+(i+.5)*127,255,21,`weight ${2**i}`);
 s.text(40,320,25,'K coordinate: bits from lowest to highest');
 const k=['R0','R1','R2','L0','L1','L2'];
 s.grid(40,350,1,6,127,70,(_,i)=>k[i],(_,i)=>color(k[i]));
 s.center(550,475,22,'R = logical register-slot bit, L = lane bit, W = wave bit');s.save();
}
function swizzle(){
 const s=new Sketch('20-swizzled-shared',735,'Swizzling moves groups while keeping each group together','For A with vec eight, per_phase two, max_phase eight, each cell holds eight consecutive K values. The swizzle phase is row divided by two modulo eight. The physical group index is the logical group XOR the phase.');
 s.text(40,112,23,'A: vec=8, per_phase=2, max_phase=8, order=[1,0]');
 s.text(275,155,22,'Physical group slots across a 64-element K row');
 for(let row=0;row<8;row++){
  s.text(40,218+row*52,22,`row ${row*2}, phase ${row}`);
  s.grid(275,183+row*52,1,8,95,52,(_,p)=>`G${p^row}`,(_,p)=>C[(p^row)%4],25);
 }
 s.center(550,651,25,'Each G contains 8 values. G0 = K[0:8], G1 = K[8:16], …');
 s.center(550,701,24,'At row 2, G0 and G1 trade places. Their internal order stays intact.');s.save();
}
function swizzleWalkthrough(){
 const s=new Sketch('30-swizzle-walkthrough',720,'Two groups exchange places in shared memory','The first sixteen storage positions of row 2, before and after swapping two eight-value groups. Labels a0 through a15 identify the original A values. Highlighted a3, meaning A[2,3], moves from storage position 3 to position 11, keeping its place within its group.');
 s.text(40,106,24,'Only row 2, first 16 values. Here a3 means A[2,3].');
 s.rect(40,133,1020,65,'#fff3bf');
 s.center(550,174,25,'vec=8 keeps 8 values together. Row 2 uses phase 1: swap the groups.');
 const x=40,cw=63.75;
 const drawRow=(y,swapped)=>{
  for(let pos=0;pos<16;pos++)s.center(x+(pos+.5)*cw,y-13,19,pos);
  s.grid(x,y,1,16,cw,65,(_,pos)=>`a${swapped?pos^8:pos}`,(_,pos)=>{
   const value=swapped?pos^8:pos;return value===3?C[2]:value<8?C[0]:C[1];
  },26);
  s.rect(x,y,8*cw,65);s.rect(x+8*cw,y,8*cw,65);
 };
 s.text(40,232,24,'Before — storage positions within the row');drawRow(268,false);
 s.arrow(295,343,805,443);s.arrow(805,343,295,443);
 s.text(40,461,24,'After — the positions stay; the values move');drawRow(497,true);
 s.center(550,611,25,'a3 stays fourth in its group. The group now starts at position 8.');
 s.rect(40,642,1020,57,C[2]);
 s.center(550,681,29,'A[2,3] is stored at position 8 + 3 = 11');s.save();
}
function padding(){
 const s=new Sketch('21-padded-shared',590,'Padding inserts gaps between data intervals','The exact padding pair five hundred twelve sixteen inserts sixteen elements after every five hundred twelve unpadded element positions. The physical offset is q plus sixteen times floor q over five hundred twelve. This is measured in elements.');
 s.rect(40,125,450,100,C[0]);s.center(265,167,27,'512 data elements');s.center(265,204,23,'q = 0…511');
 s.rect(500,125,105,100,'#eee4d9');s.center(552,165,23,'16');s.center(552,200,20,'padding');
 s.rect(615,125,445,100,C[2]);s.center(837,167,27,'Next 512 data elements');s.center(837,204,23,'q = 512…1023');
 s.center(550,288,28,'physical = q + 16 × (q // 512)');
 const qs=[0,511,512,1023,1024];
 s.text(40,347,22,'Unpadded q');s.text(40,420,22,'Physical slot');
 s.grid(230,310,1,5,164,65,(_,i)=>qs[i],()=>C[0]);
 s.grid(230,385,1,5,164,65,(_,i)=>qs[i]+16*Math.floor(qs[i]/512),()=>C[2]);
 s.center(550,516,24,'FP16: 16 padding elements occupy 32 bytes.');s.save();
}
function paddedFirstSlots(){
 const s=new Sketch('31-padded-first-slots',1110,'Follow slots 0, 1, and 65 into A','All fourteen bits of each q are shown. Slot zero selects no bases and gives A[0,0]. Slot one selects entry zero, [0,1], giving A[0,1]. Slot sixty-five has bits b6 and b0 set. Arrows connect those bits to entries six, [16,0], and zero, [0,1]. XOR of these pairs gives [16,1], so slot sixty-five holds A[16,1].');
 s.text(40,106,24,'Start at [row, column] = [0,0]. Each 1 bit selects one basis.');
 s.rect(40,133,1020,220,'#fffaf3');
 s.text(65,222,29,'q = 0');bitLabels(s,280,172,14,54);bitRow(s,280,188,0,14,C[2],54,48);
 s.center(550,283,26,'No 1 bits → no entries selected');
 s.center(550,328,29,'Row and column stay [0,0] → A[0,0]');
 s.rect(40,385,1020,275,'#fffaf3');
 s.text(65,478,29,'q = 1');bitLabels(s,280,425,14,54);bitRow(s,280,441,1,14,C[2],54,48);
 s.arrow(1009,497,960,524);
 s.text(100,570,25,'Only b0 is 1 → select entry 0:');
 s.rect(735,536,300,52,C[2]);s.center(885,572,29,'[0,1]');
 s.center(550,628,29,'Row 0, column 1 → A[0,1]');
 s.rect(40,692,1020,342,'#fffaf3');
 s.text(65,784,29,'q = 65');bitLabels(s,280,732,14,54);
 const bits=(65).toString(2).padStart(14,'0');
 s.grid(280,748,1,14,54,48,(_,i)=>bits[i],(_,i)=>bits[i]==='0'?'#f4eee6':i===7?C[0]:C[2],25);
 s.arrow(685,804,600,833);s.arrow(1009,804,960,833);
 s.text(65,881,23,'Select entries 6 and 0:');
 s.rect(380,845,260,54,C[0]);s.center(510,881,24,'entry 6: [16,0]');
 s.rect(735,845,300,54,C[2]);s.center(885,881,24,'entry 0: [0,1]');
 s.center(550,954,27,'[16,0] XOR [0,1] = [16,1] → A[16,1]');
 s.center(550,1000,24,'Row: 16 XOR 0 = 16. Column: 0 XOR 1 = 1.');
 s.center(550,1084,24,'Each panel starts at [0,0] and uses its own slot number q.');s.save();
}
function paddedFirstRow(){
 const s=new Sketch('32-padded-first-row',810,'Six bits cover all 64 columns of row 0','For data slots zero through sixty-three, bits b13 through b6 are zero. The low six bits select bases [0,32], [0,16], [0,8], [0,4], [0,2], and [0,1]. Every selected basis has row contribution zero. Slot three, binary 000011, selects [0,2] and [0,1], whose XOR is [0,3], giving A[0,3]. Slot sixty-three selects all six bases, giving column sixty-three. Thus data slots zero through sixty-three contain A row zero in order.');
 s.text(40,106,24,'For q=0…63, the upper bits b13…b6 all stay 0.');
 bitLabels(s,40,151,6,170);
 s.grid(40,172,1,6,170,62,(_,c)=>`[0,${2**(5-c)}]`,()=>C[0],28);
 s.center(550,280,25,'Every pair has row contribution 0 → the row stays 0.');
 s.rect(40,319,1020,210,'#fffaf3');
 s.center(550,360,26,'Example: q=3 is 000011 → select b1 and b0');
 s.rect(80,385,330,62,C[0]);s.center(245,425,26,'[0,2] XOR [0,1]');
 s.arrow(423,416,519,416);
 s.rect(535,385,490,62,C[2]);s.center(780,425,28,'[0,3] → A[0,3]');
 s.center(550,496,22,'q=63 is 111111 → column 32 XOR 16 XOR 8 XOR 4 XOR 2 XOR 1 = 63');
 s.center(550,584,25,'The first 64 data slots hold A row 0, from left to right:');
 const columns=[0,1,2,null,61,62,63],cw=1020/7;
 s.grid(40,619,1,7,cw,65,(_,c)=>columns[c]===null?'…':`A[0,${columns[c]}]`,()=>C[0],23);
 for(let c=0;c<7;c++)s.center(40+(c+.5)*cw,726,22,columns[c]===null?'…':`q=${columns[c]}`);
 s.center(550,782,24,'In this range, q equals the column. The row-selecting bits are 0.');s.save();
}
function offsetOrder(){
 const s=new Sketch('22-padded-row-order',880,'Choose the value, then add the padding','Selected data slots before padding, the A values assigned by the offset bases, and their actual LDS slots after padding. Slot 0 holds A[0,0], slot 1 A[0,1], slot 63 A[0,63], slot 64 A[16,0], slot 65 A[16,1], and slot 511 A[112,63]. These positions do not shift. Sixteen empty LDS slots, 512 through 527, precede data slot 512, which holds A[1,0] at actual LDS slot 528. Data slot 513 holds A[1,1] at actual slot 529.');
 s.text(40,105,23,'Selected slots from our A tile. Each slot holds one element.');
 s.center(140,143,24,'Data slot q');s.center(140,166,18,'before padding');
 s.center(480,143,24,'offset_bases');s.center(480,166,18,'chooses this A value');
 s.center(890,143,24,'Actual LDS slot');s.center(890,166,18,'after padding');
 const qs=[0,1,63,64,65,511,512,513];
 const coords=[[0,0],[0,1],[0,63],[16,0],[16,1],[112,63],[1,0],[1,1]];
 for(let i=0;i<qs.length;i++){
  const q=qs[i],y=180+i*62+(i>=6?70:0),[m,k]=coords[i];
  const color=m===0?C[0]:m===16?C[1]:m===112?C[3]:C[2];
  s.rect(40,y,200,54,C[0]);s.center(140,y+36,27,q);
  s.rect(260,y,440,54,color);s.center(480,y+36,27,`A[${m},${k}]`);
  s.rect(720,y,340,54,q<512?'#fffaf3':C[2]);s.center(890,y+36,27,q+16*Math.floor(q/512));
 }
 s.rect(40,562,1020,45,'#eee4d9');s.center(550,592,24,'16 empty LDS slots: 512–527');
 s.center(550,797,26,'Read across: q=512 → A[1,0] → LDS slot 528');
 s.center(550,848,23,'All offsets count elements. An FP16 element uses 2 bytes.');s.save();
}
function accumulator(advanced){
 const s=new Sketch('23-mfma-accumulator',650,'The MFMA layout describes the accumulator','For version three, instruction shape sixteen sixteen sixteen and transposed true, lane seventeen owns row one columns four through seven in the first sixteen-by-sixteen output tile of wave zero. The full two-hundred-fifty-six-square accumulator has two hundred fifty-six values per thread across four waves.');
 s.text(40,112,24,'version=3, instr_shape=[16,16,16], transposed=True');
 const selected=new Set(advanced.mfmaOutputs(0,17,32,32).map(coord=>coord.join(',')));
 s.grid(85,165,16,16,22,22,()=>'',(r,c)=>selected.has(`${r},${c}`)?'#9a3412':C[0]);
 s.card(510,165,550,210,C[2],'First output tile: 16 × 16',[
  '256 FP32 outputs ÷ 64 lanes = 4 per lane', 'Lane 17: row 1, columns 4–7']);
 s.card(510,415,550,160,C[3],'Full accumulator: 256 × 256',[
  '65,536 outputs ÷ 256 threads', '= 256 logical FP32 values per thread']);s.save();
}
function operandWidths(){
 const s=new Sketch('24-dot-operand-width',600,'k_width groups consecutive K values within a lane','For the version-three sixteen-square MFMA parent, wave zero lane seventeen owns a base A fragment at row one K four through seven when k_width is four, or K eight through fifteen when k_width is eight. B uses the corresponding K positions at column one. These are base patches rather than the full operand tensor.');
 s.card(40,125,490,170,C[0],'k_width = 4',['A[1, 4:8]','B[4:8, 1]']);
 s.card(570,125,490,170,C[1],'k_width = 8',['A[1, 8:16]','B[8:16, 1]']);
 s.grid(90,345,1,4,100,65,(_,i)=>`K${4+i}`,()=>C[0]);
 s.grid(610,345,1,8,51,65,(_,i)=>8+i,()=>C[1]);
 s.center(550,469,24,'Shown: the first base patch of wave 0, lane 17.');
 s.center(550,519,24,'Larger operand tiles repeat the pattern and may replicate values across waves.');
 s.center(550,565,23,'The parent still uses instr_shape=[16,16,16].');s.save();
}
function buffers(){
 const s=new Sketch('25-buffer-views',600,'A buffer index selects a tile; its inner layout stays the same','The prefetch kernels allocate A storage with shape two by BLOCK_M by BLOCK_K and the same two-dimensional padded shared layout. Index zero and index one select distinct tile views. Loading either view with DotOperandLayout returns register fragments in that distributed layout.');
 s.card(40,120,490,175,C[0],'smemA.index(0)',['Buffer 0: one padded A tile','shape [BLOCK_M, BLOCK_K]']);
 s.card(570,120,490,175,C[1],'smemA.index(1)',['Buffer 1: one padded A tile','shape [BLOCK_M, BLOCK_K]']);
 s.arrow(285,305,450,375);s.arrow(815,305,650,375);
 s.rect(180,400,740,120,C[2]);s.center(550,447,27,'selected_view.load(dotOpLayoutA)');s.center(550,488,24,'Register fragments in the requested operand layout');s.save();
}
function storeLayout(){
 const s=new Sketch('26-output-store',700,'The final store can use another blocked layout','The output layout in the loop-unroll kernel is BlockedLayout one eight, two thirty-two, four one, order one zero. The base tile is eight by two hundred fifty-six, with each cell in this diagram representing eight consecutive columns. Wave two lane seventeen owns row four columns one hundred thirty-six through one hundred forty-three in the first base tile.');
 s.text(40,112,23,'BlockedLayout([1,8], [2,32], [4,1], [1,0])');
 for(const c of [0,64,128,192])s.text(90+c/8*28,156,20,`col ${c}`);
 s.grid(90,180,8,32,28,38,()=>'',(r,c)=>r===4&&c===17?'#9a3412':C[Math.floor(r/2)]);
 for(let r=0;r<8;r++)s.text(50,205+r*38,20,r);
 s.center(550,536,25,'Each cell is an 8-value patch. The base tile covers [8,256].');
 s.center(550,586,25,'Dark cell: wave 2, lane 17 → C[4,136:144]');
 s.center(550,638,24,'Repeat down M to cover [256,256]: 256 logical values per thread.');s.save();
}
(async()=>{
 if(process.argv[2]==='05-repeat'){repeat();console.log('Rendered the repeated-layout diagram.');return;}
 const model=await import(pathToFileURL(path.join(__dirname,'layout-model.mjs')).href);
 if(process.argv[2]==='07-wave-tiles'){waveTiles(model.matrix,model.owners);console.log('Rendered the thread, wave, and workgroup views.');return;}
 if(process.argv[2]==='10-slice-layout'){slice(model);console.log('Rendered the index-ownership diagram.');return;}
 if(process.argv[2]==='layout-overview'){layoutMap();linearInterleave();console.log('Rendered the standalone layout overview and bit mapping.');return;}
 if(process.argv[2]==='linear-layouts'){linearLookup();linearBits();linearInterleave();console.log('Rendered the linear-layout lookup and 2D examples.');return;}
 if(process.argv[2]==='linear-binary'){linearLookup();xorReason();packedBinary();linearBits();console.log('Rendered the complete binary lookup, XOR explanation, and 1D/2D calculations.');return;}
 if(process.argv[2]==='swizzled-shared'){swizzle();swizzleWalkthrough();console.log('Rendered the swizzle patterns and single-value walkthrough.');return;}
 if(process.argv[2]==='padded-start'){paddedFirstSlots();paddedFirstRow();console.log('Rendered the slot-zero/one selection and first-row coverage diagrams.');return;}
 if(process.argv[2]==='memory-instructions'){memoryInstructions(model);console.log('Rendered lane addresses, the load instruction, and per-instruction address regions.');return;}
 if(process.argv[2]==='padded-shared'){padding();paddedFirstSlots();paddedFirstRow();offsetOrder();console.log('Rendered padding, bit selection, and the data-slot, value, and storage-position mapping.');return;}
 const advanced=await import(pathToFileURL(path.join(__dirname,'advanced-model.mjs')).href);
 ownership();memory();baseline();size();repeat();hierarchy();waveTiles(model.matrix,model.owners);order();trace();slice(model);coalescing();memoryInstructions(model);conversion();costs();gemm(model);mfma();tail();
 layoutMap();linearLookup();xorReason();packedBinary();linearBits();linearInterleave();swizzle();swizzleWalkthrough();padding();paddedFirstSlots();paddedFirstRow();offsetOrder();accumulator(advanced);operandWidths();buffers();storeLayout();
 console.log('Rendered the original diagrams and step-through views, with seeded sketch strokes and embedded Virgil.');
})().catch(error=>{console.error(error);process.exitCode=1;});
