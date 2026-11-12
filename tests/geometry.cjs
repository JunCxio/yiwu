const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||__dirname+'/../index.html','utf8'),box=vm.createContext({});
vm.runInContext([...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)][0][1],box);
const E=box.Yiwu,{inside,between,at,palace,crossed}=E;
// 保留调整前的合法性判断，独立对照优化后的拒绝顺序。
function reference(s,p,x,y,capture){
  if(!p||!inside(x,y)||(x===p.x&&y===p.y))return false;
  const dx=x-p.x,dy=y-p.y,ax=Math.abs(dx),ay=Math.abs(dy);
  if(p.kind==='rook')return (dx===0||dy===0)&&between(s,p,x,y).length===0;
  if(p.kind==='cannon')return (dx===0||dy===0)&&between(s,p,x,y).length===(capture?1:0);
  if(p.kind==='horse')return ((ax===2&&ay===1)&&!at(s,p.x+Math.sign(dx),p.y))||((ax===1&&ay===2)&&!at(s,p.x,p.y+Math.sign(dy)));
  if(p.kind==='elephant')return ax===2&&ay===2&&(p.side==='red'?y>=5:y<=4)&&!at(s,p.x+dx/2,p.y+dy/2);
  if(p.kind==='guard')return ax===1&&ay===1&&palace(p,x,y);
  if(p.kind==='pawn')return (dx===0&&dy===(p.side==='red'?-1:1))||(crossed(p)&&ay===0&&ax===1);
  if(p.kind==='king'){
    const target=at(s,x,y);
    if(capture&&dx===0&&target&&target.kind==='king'&&target.side!==p.side&&between(s,p,x,y).length===0)return true;
    return ax+ay===1&&palace(p,x,y);
  }
  return false;
}
let checks=0;
function verify(s,p,x,y,capture){
  assert.equal(E.geometry(s,p,x,y,capture),reference(s,p,x,y,capture),[p?.side,p?.kind,p?.x,p?.y,String(x),String(y),capture].join(','));checks++;
}
const invalid=[-1,9,10,.5,NaN,Infinity,-Infinity,'4',null,undefined,{},[],true,1n,Symbol('coordinate')];
for(const side of ['red','black'])for(const kind of Object.keys(E.NAMES[side]))for(let py=0;py<10;py++)for(let px=0;px<9;px++){
  const p=E.piece('subject',side,kind,px,py);
  for(const blocked of [false,true]){
    const s={pieces:[p,E.piece('opponent',E.OTHER[side],'king',px,py<5?9:0)]};
    if(blocked)for(let y=0;y<10;y++)for(let x=0;x<9;x++)if((x!==px||y!==py)&&!E.at(s,x,y)&&(x*7+y*11+px*3+py)%5===0)s.pieces.push(E.piece('block-'+x+'-'+y,(x+y)%2?side:E.OTHER[side],'pawn',x,y));
    const before=JSON.stringify(s);
    for(let y=0;y<10;y++)for(let x=0;x<9;x++)for(const capture of [false,true])verify(s,p,x,y,capture);
    for(const coord of invalid)for(const capture of [false,true]){verify(s,p,coord,py,capture);verify(s,p,px,coord,capture);}
    assert.equal(JSON.stringify(s),before);
  }
}
for(const p of [null,undefined,E.piece('unknown','red','unknown',4,4)])for(const x of [...invalid,4])for(const y of [...invalid,4])verify({pieces:[]},p,x,y,true);
console.log('通过：'+checks+' 次走法形状、坐标边界、输入类型和状态隔离检查');
