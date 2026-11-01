// Optical small-size artwork. These are original project adaptations of the
// 2020 genre rules, not traced Apple paths or a claim of pixel equivalence.
// At 16 px the symbol loses secondary lines and gains structural weight.
const colors = {
  blue: ["#68c9fc", "#147bdb"], violet: ["#c19cf6", "#714ac5"],
  gold: ["#f5d881", "#c78b32"], green: ["#81d997", "#34894d"],
  red: ["#f58f89", "#c64250"], steel: ["#e9edf0", "#a6b1bb"],
  paper: ["#fffef9", "#dddfe3"], rainbow: ["#a6dbfa", "#6487cf"],
  gray: ["#cdd1d6", "#7e858e"],
};
const rect = (x,y,w,h,fill,r=0,extra="") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
const circle = (x,y,r,fill,extra="") => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;
const path = (d,fill="none",extra="") => `<path d="${d}" fill="${fill}" ${extra}/>`;
const stroke = (color,w=5) => `stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
function gear(cx,cy,r,n=12) {
  const pts=[];for(let i=0;i<n*4;i++){const a=i*Math.PI*2/(n*4);const rr=r*(i%4<2?1:.83);pts.push(`${cx+Math.cos(a)*rr},${cy+Math.sin(a)*rr}`);}
  return `<polygon points="${pts.join(" ")}" fill="#505b68"/>`+circle(cx,cy,r*.58,"url(#metal)")+circle(cx,cy,r*.29,"#4b5662");
}
export function compactArtwork(spec, size=32) {
  const tiny=size<=16, w=tiny?7:4.5, ink="#304458", pale="#fffefa";
  const [top,bottom]=colors[spec.tone]||colors.blue;
  const line=(d,c=ink,width=w)=>path(d,"none",stroke(c,width));
  const app=["application","utility","accessory"].includes(spec.genre);
  const page=(x=29,y=23,width=69,height=84,fold=17)=>path(`M${x} ${y}h${width-fold}l${fold} ${fold}v${height-fold}H${x}Z`,"url(#paper)",`stroke="#b3bac2" stroke-width="2"`)+path(`M${x+width-fold} ${y}v${fold}h${fold}`,"#d4dce5");
  const lines=(x=40,y=52)=>line(`M${x} ${y}h43M${x} ${y+14}h34${tiny?"":`M${x} ${y+28}h40`}`,"#8794a2",tiny?6:4);
  const lens=(cx=66,cy=53)=>circle(cx,cy,23,"#c9eaff",`fill-opacity=".72" stroke="#516477" stroke-width="7"`)+line(`M${cx+17} ${cy+18}l22 25`,"#354454",10);
  const folder=(symbol="")=>path("M12 36Q12 29 20 29h29l13 12h45q8 0 8 9v49q0 9-9 9H21q-9 0-9-9Z","#178fcf")+path("M13 49q0-6 8-6h86q8 0 8 7v48q0 9-9 9H22q-9 0-9-9Z","url(#folder)")+line("M19 99h89","#44a8d7",2)+symbol;
  const note=()=>line("M55 81V42l27-5v37",ink,tiny?7:5)+circle(48,81,10,ink)+circle(75,74,10,ink);
  const book=()=>path("M29 27h59q10 0 10 10v64H36q-9 0-9-10V38q0-11 10-11Z","#f8f3df",`stroke="#55687d" stroke-width="3"`)+rect(29,28,12,72,"#586e9b",3)+line("M49 49h34M49 62h30","#79899a",tiny?6:4);
  const pencil=()=>`<g transform="rotate(36 75 61)">${rect(71,19,9,73,"#525e6b",2)}${rect(71,19,9,13,"#c6d0d9",2)}${path("M71 92l4.5 12L80 92Z","#ddbb88")}${path("M73 99l2.5 6 2.5-6Z",ink)}</g>`;
  let body="";
  if(app) body=rect(12,12,104,104,"url(#tile)",23,`stroke="${bottom}" stroke-width="1"`);
  switch(spec.body) {
    case "finder": case "finderPair": {
      const face=rect(12,12,104,104,"url(#finderBlue)",23)+path("M70 12h22q24 0 24 24v56q0 24-24 24H74L68 76H60q-7 0-5-8Z","#edf4fa")+line("M39 47v9M88 47v9",ink,tiny?5:3.4)+path("M34 79q27 23 58-1","none",stroke(ink,tiny?4.8:3));
      body=spec.body==="finderPair"?`<g transform="translate(22 -3) scale(.82)">${face}</g><g transform="translate(-3 18) scale(.83)">${face}</g>`:face;break;
    }
    case "folder": {
      let symbol="";
      if(spec.id!=="folder") {
        const c="#2087b7";
        if(spec.id==="applications")symbol=path("M42 91l27-39 7 5-27 39Z M58 56l7-5 29 41-7 5Z","#299ccd")+line("M46 80h41","#299ccd",tiny?7:5)+(tiny?"":line("M64 62l4 3M72 73l4 3","#7ad0ec",2));
        else if(spec.id==="helpFolder")symbol=path("M55 63q0-9 11-9q13 0 12 10q0 7-12 13v5","none",stroke(c,6))+circle(66,94,3,c);
        else if(spec.id==="systemFolder")symbol=`<g transform="translate(16 28) scale(.74)">${gear(64,64,29,8)}</g>`;
        else symbol=path("M53 59h18l12 12v24H53Z","none",stroke(c,5));
      }body=folder(symbol);break;
    }
    case "drive":
      body=path("M34 15h61l9 88q1 10-10 10H31q-10 0-9-10Z","url(#metal)",`stroke="#85909c" stroke-width="2"`)+rect(24,94,78,17,"#bcc8d1",7)+line("M33 100h48","#768995",2)+circle(94,102,3,"#65ba48");
      if(spec.id==="startupDisk")body+=circle(65,62,12,"#5b6b7b")+path("M63 53v9h7","none",stroke("#f8fbff",3));
      if(spec.id==="projectDisk")body+=rect(44,55,41,24,"#579cc9",3)+line("M52 64h24M52 72h17","#deedf8",3);break;
    case "floppy":body=path("M25 14h71l10 11v87H23V17Z","#424c5b",`stroke="#283743" stroke-width="3"`)+rect(40,15,45,32,"url(#metal)",2)+rect(64,18,11,24,"#5b6877",1)+rect(36,64,58,47,"#f4f3ed",2)+line("M45 77h36M45 88h28","#82909c",tiny?6:4);break;
    case "disc":body=rect(17,31,76,78,"#f1f2e9",4)+circle(72,62,44,"url(#disc)",`stroke="#8f9ead" stroke-width="2"`)+circle(72,62,11,"#e6e9e9",`stroke="#8193a3" stroke-width="2"`)+circle(72,62,5,"#7691a6")+rect(20,86,43,16,"#80b0d3",2);break;
    case "trash":body=path("M29 30h70l-8 74q-1 13-26 13t-27-13Z","url(#bin)",`stroke="#b8c3cd" stroke-width="2"`)+`<ellipse cx="64" cy="31" rx="35" ry="10" fill="#aebdca" stroke="#eef5fa" stroke-width="4"/>`;
      if(spec.id==="trashFull")body=path("M35 38l-3-16 14-8 16 10 14-13 18 12-2 18Z","#f8f5ed",`stroke="#aeb9c3" stroke-width="2"`)+body+path("M43 29l5-11 16 8 12-10 13 17-16 7Z","#fbfaf6",`stroke="#aeb9c3" stroke-width="2"`);break;
    case "paper": case "paperStack": case "cards": case "manuscript":
      if(spec.body==="paperStack"||spec.body==="manuscript")body=page(20,17,70,87)+page(26,22,70,87);else body="";
      body+=page()+lines();
      if(spec.id==="quickDraft")body+=pencil();
      if(spec.id==="questionSheet")body+=rect(39,43,44,49,"#fffefa",3)+path("M47 51q1-11 16-11q19 0 18 14q0 10-17 16v9","none",stroke("#397ba9",7))+circle(64,91,4,"#397ba9");
      if(spec.id==="outline")body=page()+line("M43 49h37M51 65h29M58 81h22","#547e9b",tiny?7:5)+circle(39,49,3,ink)+circle(47,65,3,ink)+circle(54,81,3,ink);
      if(spec.id==="alias")body+=path("M38 98V85h13v-9l14 15-14 14v-9H44v10Z",ink);
      if(spec.id==="systemFile")body+=`<g transform="translate(24 38) scale(.6)">${gear(64,64,29,9)}</g>`;
      if(spec.id==="writingDemo")body+=path("M62 70l20 12-20 12Z","#3e88b9");
      if(spec.id==="chatFile")body+=rect(40,74,41,24,"#69b4df",6)+path("M47 93v10l13-10Z","#69b4df");break;
    case "correspondence":body+=rect(28,32,52,49,"#e6f6ff",6)+rect(48,56,54,45,"#fffdf4",6)+line("M37 45h30M37 57h24","#4a99c5",tiny?7:5)+path("M57 91h10m7 0h10m7 0h4","none",stroke("#5589b2",tiny?5:3.5));break;
    case "typewriter":body+=rect(41,22,47,47,"#fffaf0",2)+path("M31 51h65l14 47H19Z","#485461",`stroke="#243c52" stroke-width="2"`)+rect(27,82,74,12,"#eff2f1",2)+line("M38 66h50M33 75h61","#dce6e9",tiny?5:3);break;
    case "server": {
      const offline=spec.id==="cloudModelOff", status=offline?"#a0a9b2":"#9aeeff";
      body+=rect(26,68,76,35,"url(#metal)",4)+rect(31,72,66,12,"#35414c",2)+rect(31,87,66,11,"#35414c",2)
        +circle(88,78,2.5,status)+circle(88,92,2.5,status)
        +path("M43 60q-15 0-15-13q0-13 15-13q4-18 22-15q14 0 19 13q17 1 17 14q0 14-16 14Z",offline?"#c7d1dc":"#d8f7ff",`stroke="${offline?"#e4eaf0":"#9ceaff"}" stroke-width="2"`)
        +line("M47 56v13M65 54v15M83 56v13",status,tiny?4:2.5);
      if(!tiny)body+=line("M37 78h40M37 92h40","#687786",2);
      if(offline)body+=path("M102 94q12 13-9 17","none",stroke("#303c48",tiny?5:3))+rect(82,106,13,8,"#d0d8df",2)+line("M82 107h-5M82 111h-5","#8194a3",tiny?3:2);break;
    }
    case "search":body+=page(32,28,58,72)+lines(39,48)+lens(64,54);break;
    case "review":body+=page(30,22,62,80)+line("M40 45h33M40 57h25","#83949f",3)+lens(67,63)+line("M39 84l7 8 13-18","#c94850",6);break;
    case "paperPen":
      body=rect(12,12,104,104,"url(#paper)",22,`stroke="#c0c9d2" stroke-width="2"`)
        +line(`M25 39h73M25 58h73M25 77h61${tiny?"":"M25 96h52"}`,"#b2cddd",tiny?4:2.5);
      if(!tiny)body+=line("M34 18v92","#e6b5b6",2);
      body+=`<g transform="rotate(43 75 61)">${rect(68,6,14,84,"#36434f",3)}${rect(68,6,14,18,"url(#metal)",3)}${line("M71 28v57","#8d9ca7",2)}${path("M68 90l7 20 7-20Z","#d8bd94")}${path("M72 101l3 9 3-9Z",ink)}</g>`;break;
    case "book":
      if(spec.id==="systemHelp") {
        body=rect(26,19,78,92,"#253c5b",6)+rect(29,91,71,15,"#d9d4bb",3)+rect(25,15,78,83,"#207aca",5)
          +rect(31,17,7,79,"#174c8c",2)+path("M50 40q0-16 17-16q18 0 18 15q0 10-14 17v9","none",stroke("#edf2ec",tiny?9:7))+circle(70,80,5,"#edf2ec")
          +path("M36 98h12v15l-6-5-6 5Z","#df5747");break;
      }
      body+=path("M20 37q22-10 44 1q22-11 44-1v62q-23-8-44 3q-21-11-44-3Z","#16629e",`stroke="#114d81" stroke-width="3"`)
        +path("M23 31q23-7 41 6q20-13 41-6v61q-23-6-41 7q-20-13-41-7Z","url(#paper)")
        +line("M64 39v57","#b2c6d5",tiny?4:2.5)+rect(80,49,17,tiny?9:6,"#efd78c",1);
      if(!tiny)body+=line("M30 46l25 5M30 58l25 5M30 70l25 5M73 65l24-5M73 77l24-5","#c2ced3",2)+path("M90 32v24l-4-4-4 5V34Z","#248bc1");break;
    case "album":
      body=rect(13,13,102,102,"#8d542d",16,`stroke="#674329" stroke-width="2"`)+rect(32,20,75,88,"#dfcaa5",8)
        +rect(36,23,69,82,"#f5ead4",5)+rect(15,17,18,94,"#724527",5)
        +rect(44,40,53,48,"#fffaf0",2)+rect(49,45,43,38,"#9bcce1",1)
        +path("M49 82V73l12-15 12 15 8-10 11 19Z","#5a7c51");
      if(!tiny)body+=circle(80,54,5,"#f4dcad")+line("M29 23v81","#b17f50",2)+path("M43 39h11L43 50ZM98 39H87l11 11ZM43 89h11L43 78ZM98 89H87l11-11Z","#fff8e5");break;
    case "dictionary":body+=book()+path("M54 78l11-31 11 31M58 67h15","none",stroke("#937a4d",tiny?6:4));break;
    case "clock": {
      if(!tiny)body+=rect(26,27,67,69,"#6e7981",6)+rect(33,36,53,20,"#d6b580",3)+rect(28,49,63,18,"#f7ead0",2)+rect(26,62,67,34,"url(#metal)",3)+rect(38,70,23,5,"#7e8d98",2);
      const cx=tiny?64:79, cy=tiny?66:78, r=tiny?34:29;
      body+=circle(cx,cy,r,"#f5f5ee",`stroke="#657e87" stroke-width="5"`)+line(`M${cx} ${cy-20}v20l13 8`,"#455b62",tiny?7:4)
        +path(`M${cx-21} ${cy-27}h14v14`,"none",stroke("#678f9e",tiny?6:4));break;
    }
    case "map":body+=line("M64 57v20M29 91V77h70v14M64 77v14","#d1edfb",tiny?6:4)
      +page(44,22,40,39,11)+line(`M51 38h18${tiny?"":"M51 47h23"}`,"#8da6b9",tiny?4:2.5)
      +rect(19,88,22,17,"#c0e5f6",4)+rect(53,88,22,17,"#dceef8",4)+rect(87,88,22,17,"#b6def3",4);break;
    case "stage":body+=rect(20,23,88,78,"#184472",7)+rect(36,36,58,45,"url(#paper)",2)
      +path("M21 27h21q-1 30-18 47l6 22H21ZM107 27H91q0 30 14 47l-6 22h8Z","#2080c6")
      +rect(21,95,86,9,"#94603e",2);
      if(!tiny)body+=line("M27 33l3 26M101 33l-2 26","#51b2e7",2)+rect(30,80,15,18,"#795133",1)+rect(27,77,21,5,"#c39b6b",1)+rect(58,27,12,4,"#d9f4ff",2);break;
    case "easel":body+=rect(23,24,83,60,"#edf2f2",4)+line("M64 85v18M45 107h38","#496474",6)+rect(35,57,13,17,"#5398bb",1)+rect(55,43,13,31,"#75b4c5",1)+rect(75,34,13,40,"#d48a62",1);break;
    case "cover":
      if(!tiny)body+=rect(40,22,58,34,"#b4e0f8",6,`fill-opacity=".42" stroke="#c2eaff" stroke-width="2"`)+path("M62 28l14 9-14 9Z","#edfaff");
      // Outlined letterforms keep Aa independent of installed SVG fonts.
      body+=path("M26 77l17-43h9l17 43H58l-3-10H39l-3 10ZM42 58h10l-5-15Z","#e3f5ff",`fill-rule="evenodd"`)
        +path("M73 51q18-8 24 5v21h-8v-4q-15 10-19-3q-3-13 19-14q-3-5-14-1ZM89 62q-13 0-11 7q3 5 11-1Z","#c9eaff",`fill-rule="evenodd"`)
        +rect(23,86,83,20,"#13549c",5,`stroke="#83c9f0" stroke-width="2"`)+rect(28,91,29,9,"#68cce5",2)+rect(60,91,37,9,"#ac9ae8",2)+line("M72 84v22","#f2fbff",tiny?4:2.5);break;
    case "swatches":body+=`<g transform="rotate(-22 60 89)">${rect(31,26,27,74,"#e58d7c",3)}</g>`+rect(50,23,27,77,"#e3c37c",3)+`<g transform="rotate(22 63 90)">${rect(64,25,27,77,"#78b4c9",3)}</g>`+circle(63,92,5,"#e7e9e8");break;
    case "speaker":body+=rect(39,24,51,81,"#4b4858",7)+circle(64,79,17,"#8491a1",`stroke="#273443" stroke-width="5"`)+circle(64,43,9,"#c9ced4")+circle(64,79,7,"#303b49");break;
    case "inbox":body+=path("M29 66h70l12 35H17Z","#dce9ee",`stroke="#5686a0" stroke-width="3"`)+path("M50 76h29l7 14H44Z","#7eafc7")+line("M64 29v39m-15-13 15 15 15-15","#f6fbff",9);break;
    case "controlBoard":
      if(spec.id==="controlPanel")body+=gear(64,64,42,tiny?10:16);
      else {
        body=rect(12,12,104,104,"url(#metal)",18,`stroke="#5d6265" stroke-width="3"`)
          +circle(41,50,18,"#d6dde0",`stroke="#555e63" stroke-width="3"`)+circle(87,50,18,"#d6dde0",`stroke="#555e63" stroke-width="3"`)
          +line("M41 49l-3-13M87 49l5-12","#515b60",tiny?5:3)
          +circle(64,88,9,"#535954")+line("M64 89V75","#cdd4d3",tiny?5:4)+circle(94,91,4,"#e79725");
        if(!tiny)body+=circle(23,23,3,"#65716f")+circle(105,23,3,"#65716f")+circle(23,105,3,"#65716f")+circle(105,105,3,"#65716f");
      }break;
    case "network":
      body+=path("M49 68q16 30 25 0","none",stroke("#d0ecfa",tiny?4:2.5))
        +rect(21,54,34,24,"url(#metal)",4)+rect(74,54,34,24,"url(#metal)",4)
        +rect(74,51,34,29,"none",5,`stroke="#bfe6fc" stroke-width="3"`)
        +line("M31 59h12M84 59h12","#788793",tiny?3:2)
        +path("M99 72v23l6-6 5 8 5-3-5-8h9Z","#f3faff",`stroke="#30495c" stroke-width="2"`);break;
    case "dependencies":body+=line("M48 41h15v44H48M63 63h18","#e9f8ff",tiny?6:4)+rect(23,29,28,24,"#f6faf6",4)+rect(23,74,28,24,"#f6faf6",4)+rect(80,51,28,24,"#dfeaf7",4)+line("M29 39l4 5 9-10","#d77968",tiny?4:3);break;
    case "monitor":body+=rect(23,25,83,65,"#d6e0e5",6)+rect(30,32,69,49,"#344c62",3)+line("M64 91v13M43 108h42","#c6d3df",6)+line("M38 65l10-12 12 17 13-26 12 13h9","#88cbae",tiny?5:3);break;
    case "indexBox":body+=rect(29,31,59,48,"#faf7e8",4)+rect(36,23,17,12,"#efdfbc",3)+rect(22,56,86,48,"#cca568",7)+rect(43,69,43,15,"#f9f1db",2)+line("M50 76h28","#947542",tiny?4:2);break;
    case "press":body+=page(33,24,61,69)+rect(22,52,84,21,"#5a6a79",5)+rect(33,88,64,15,"#9caebe",4)+line("M27 52v41M100 52v41","#52677a",8);break;
    case "stamp":body+=rect(26,83,79,20,"#8a4d49",4)+path("M44 84l8-24q-6-8-5-17q1-20 18-20t18 20q0 9-7 17l9 24Z","#ece3d4",`stroke="#734f50" stroke-width="3"`);break;
    case "terminal":body+=rect(24,29,81,71,"#263c39",6)+path("M36 47l14 12-14 12M61 78h23","none",stroke("#b2e2c5",tiny?7:4.5));break;
    case "briefcase":
      body+=path("M34 29l62 8-9 68-64-9Z","#339bea",`stroke="#8dc9f8" stroke-width="2"`)
        +line("M38 48l48 6M34 69l49 6M45 38l-7 49M68 42l-7 49","#8bcafa",tiny?2:1.5)
        +path("M38 98l29-59 10 5-28 60Z","#36404a",`stroke="#6a7d8d" stroke-width="2"`)
        +path("M53 24l15 2q12-16 29 4l7 15-18-10-14 5-10-7-12-1Z","url(#metal)",`stroke="#556c81" stroke-width="2"`)
        +path("M77 101l23-52 7 3-24 52-10 5Z","#f5c14f")+path("M73 109l3-11 7 6Z","#c4a77d");break;
    case "bell":
      body+=`<ellipse cx="64" cy="90" rx="39" ry="16" fill="#604025"/>`
        +path("M28 84q3-38 36-38t36 38q-35 14-72 0Z","url(#brass)",`stroke="#8b6326" stroke-width="3"`)
        +line("M64 47V34","#946c29",tiny?6:4)+`<ellipse cx="64" cy="32" rx="11" ry="4" fill="#e7c16a" stroke="#9c772f" stroke-width="2"/>`
        +rect(50,88,29,12,"#d6b460",4);
      if(!tiny)body+=path("M65 90l5 4-5 5-5-5Z","#795a2c")+line("M40 76q4-15 14-18","#fff0bb",3);break;
    case "chip":body+=rect(37,38,53,53,"#43545f",6)+rect(48,49,31,31,"#8dafac",2)+line("M47 28v10M65 28v10M81 28v10M47 91v10M65 91v10M81 91v10M27 47h10M27 65h10M27 81h10M90 47h10M90 65h10M90 81h10","#d0dcdf",tiny?6:4);break;
    case "strip":body+=rect(23,45,84,38,"#e3e8ec",6)+line("M46 49v30M75 49v30","#92a5b6",tiny?4:2)+circle(35,64,6,"#649bbb")+circle(60,64,6,"#83a888")+circle(91,64,6,"#b59a6c");break;
    case "palette":body+=path("M62 27q37-4 41 23q4 16-13 20q-13 2-8 15q5 17-15 17q-43 0-43-35q0-35 38-40Z","#f5e6bb",`stroke="#bfa26c" stroke-width="2"`)+circle(44,48,9,"#e57a61")+circle(67,41,8,"#d0b346")+circle(87,53,8,"#4fa6ba")+circle(44,75,8,"#6f92ac")+path("M66 91l30-67 7 3-28 69Z","#615247")+path("M67 86l10 5-5 16-13 3Z","#3d5264");break;
    case "musicCard":body+=rect(24,27,62,75,"#ccb7e4",5)+rect(40,20,65,83,"#fbf4ff",5)+rect(40,20,9,83,"#a980c9",3)+note();break;
    default:throw new Error(`Missing optical artwork ${spec.id}/${spec.body}`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128"><defs><linearGradient id="tile" x2="0" y2="1"><stop stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><linearGradient id="paper" x2="0" y2="1"><stop stop-color="#fffef9"/><stop offset="1" stop-color="#e5e9ec"/></linearGradient><linearGradient id="metal" x2="0" y2="1"><stop stop-color="#edf1f3"/><stop offset=".52" stop-color="#c5ced5"/><stop offset="1" stop-color="#96a7b5"/></linearGradient><linearGradient id="bin"><stop stop-color="#d8e1e7"/><stop offset=".4" stop-color="#f8faf9"/><stop offset="1" stop-color="#c3d0db"/></linearGradient><linearGradient id="folder" x2="0" y2="1"><stop stop-color="#64c6f1"/><stop offset="1" stop-color="#46b2e2"/></linearGradient><linearGradient id="finderBlue" x2="0" y2="1"><stop stop-color="#4dcaff"/><stop offset="1" stop-color="#078bee"/></linearGradient><linearGradient id="brass"><stop stop-color="#a3752b"/><stop offset=".35" stop-color="#fff1b4"/><stop offset=".67" stop-color="#cda44a"/><stop offset="1" stop-color="#936225"/></linearGradient><linearGradient id="disc"><stop stop-color="#dce5ed"/><stop offset=".25" stop-color="#bbe2cd"/><stop offset=".5" stop-color="#b6ceef"/><stop offset=".72" stop-color="#f1d2cf"/><stop offset="1" stop-color="#dce5ed"/></linearGradient></defs>${body}</svg>`;
}
