import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createCanvas, loadImage } from "canvas";
import { compactArtwork } from "./lib/big-sur-compact-art.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const specPath = "tooling/icon-generation/big-sur-specs.json";
const specs = JSON.parse(readFileSync(join(root, specPath))).icons;
const evidence = join(root, "internal/evidence/drafts/big-sur-icons");
const target = join(root, "apps/desktop/assets/themes/big-sur");
const sizes = [16, 32, 64, 128];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const json = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const direct = new Set(["finderApp", "folder", "document", "trash", "trashFull", "applications", "systemFolder", "helpFolder", "documents", "hardDisk", "startupDisk", "controlPanel", "daHandler", "systemFile"]);
const analog = new Set(["teachText", "searcher", "reviewDesk", "scrapbook", "projectDisk", "projectDisc", "dictionary", "reader", "timeMachine"]);
const sources = {
  appHig: "https://web.archive.org/web/20201223123443/https://developer.apple.com/design/human-interface-guidelines/macos/icons-and-images/app-icon",
  documentHig: "https://web.archive.org/web/20201223162058/https://developer.apple.com/design/human-interface-guidelines/macos/icons-and-images/document-icons/",
  nativeCapture: "https://512pixels.net/projects/aqua-screenshot-library/macos-11-0-big-sur/",
  appleRelease: "https://www.apple.com/newsroom/2020/11/macos-big-sur-is-here/",
};

// Only crop/scale/color-management operations are used on generated masters.
// Geometry corrections are made in the source image tool, never by stretching.
export async function normalizedMaster(file, size, spec) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left=info.width, top=info.height, right=-1, bottom=-1;
  for (let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) {
    if(data[(y*info.width+x)*4+3]<192)continue;
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  if(right<left)throw new Error(`${spec.id}: no opaque foreground`);
  const app=["application","utility","accessory"].includes(spec.genre);
  const targetSpan=(app?104:112)*size/128;
  const scale=targetSpan/Math.max(right-left+1,bottom-top+1);
  const width=Math.max(1,Math.round(info.width*scale)),height=Math.max(1,Math.round(info.height*scale));
  const centerX=(left+right+1)/2*scale,centerY=(top+bottom+1)/2*scale;
  const x=Math.round(size/2-centerX),y=Math.round(size/2-centerY);
  const image=await sharp(file).resize(width,height,{kernel:"lanczos3"}).png().toBuffer();
  // Composite onto an oversize staging canvas then extract to preserve margins
  // even when a generated master has asymmetric transparent padding.
  const margin=size;
  const staging=await sharp({create:{width:size*3,height:size*3,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite([{input:image,left:margin+x,top:margin+y}]).png().toBuffer();
  return sharp(staging).extract({left:margin,top:margin,width:size,height:size})
    .toColourspace("srgb").withIccProfile("srgb").png({compressionLevel:9}).toBuffer();
}

export async function buildBigSurIcons({ partial=false }={}) {
  mkdirSync(join(target,"icons"),{recursive:true});mkdirSync(join(evidence,"optical-sources"),{recursive:true});
  const reviewPath=join(evidence,"historical-review.json");
  const reviews=existsSync(reviewPath)?JSON.parse(readFileSync(reviewPath)):{};
  const manifest={},icons={};
  for(const spec of specs) {
    const source=join(evidence,"masters",`${spec.id}.png`);
    if(!existsSync(source)) {if(partial)continue;throw new Error(`Missing Big Sur master ${spec.id}`);}
    const sizeFiles={},hashes={};
    for(const size of sizes) {
      let png;
      if(size<=32) {
        const svg=compactArtwork(spec,size);
        writeFileSync(join(evidence,"optical-sources",`${spec.id}-${size}.svg`),svg);
        png=await sharp(Buffer.from(svg)).toColourspace("srgb").withIccProfile("srgb").png({compressionLevel:9}).toBuffer();
      } else png=await normalizedMaster(source,size,spec);
      const relative=`icons/${spec.id}-${size}.png`;writeFileSync(join(target,relative),png);sizeFiles[size]=relative;hashes[size]=hash(png);
    }
    manifest[spec.id]=sizeFiles[128];
    icons[spec.id]={genre:spec.genre,semanticIdentity:spec.label,physicalMetaphor:spec.subject,
      provenanceClass:reviews[spec.id]?.provenanceClass||(direct.has(spec.id)?"A":analog.has(spec.id)?"B":"C"),
      nativePrototype:reviews[spec.id]?.nativePrototype||null,nearestPeriodAnalog:reviews[spec.id]?.nearestPeriodAnalog||null,
      identityAnchors:reviews[spec.id]?.identityAnchors||[spec.body],exactPixelReplica:false,eraGrammarReview:reviews[spec.id]?.eraGrammarReview||"pending",
      authoringMethod:"built-in image generation (64/128) and independent optical SVG construction (16/32)",
      sourceKind:"original-generated-era-illustration",generationStatus:"technically-clean",
      historicalReviewStatus:reviews[spec.id]?.status||"pending",reviewStatus:"technically-clean",
      sourceNote:reviews[spec.id]?.note||"Original era adaptation; historical review has not been claimed.",
      sourceReferences:reviews[spec.id]?.sources||(spec.genre==="document"?[sources.documentHig]:[sources.appHig,sources.nativeCapture]),
      sizes:sizeFiles,runtimeAsset:true,sourceSha256:hash(readFileSync(source)),runtimeSha256:hashes,
      nativeSizePolicy:"16/32 independently simplified optical artwork; 64/128 uniformly normalized from retained generated master",
      intentionalAnachronism:spec.id==="fileFloppy",
    };
  }
  json(join(target,"big-sur-icon-manifest.json"),manifest);
  json(join(target,"big-sur-icon-family.json"),{schemaVersion:1,target:"macOS 11 Big Sur (2020)",generatedBy:"tooling/build-big-sur-icons.mjs",completeFamily:Object.keys(icons).length===59,sharedGeometryAcrossEras:false,runtimeAsset:true,runtimeSize:32,runtimeSizesByContext:{compactMenuList:16,ordinary:32,desktopLargeRetina:128},compatibilityManifest:"big-sur-icon-manifest.json",runtimeDispatch:"apps/desktop/app/core/system-icons.js",sourceBoundary:"Native screenshots and Apple artwork are evidence-only; generated masters and optical constructions are original project assets.",sizePolicy:"16/32 independently authored optical artwork, 64/128 derivatives",sources,icons});
  await bigSurBoard(Object.keys(icons));
  console.log(`Big Sur: ${Object.keys(icons).length}/59 objects, ${Object.keys(icons).length*4} PNG files`);
}

async function bigSurBoard(ids) {
  const cols=6,cellW=208,cellH=230,header=54;
  const canvas=createCanvas(cols*cellW,header+Math.ceil(ids.length/cols)*cellH);const ctx=canvas.getContext("2d");
  ctx.fillStyle="#eceff3";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle="#263745";ctx.font="bold 22px sans-serif";ctx.fillText("Big Sur · original family / optical sizes",20,33);
  for(let i=0;i<ids.length;i++) {
    const id=ids[i],x=i%cols*cellW,y=header+Math.floor(i/cols)*cellH;
    ctx.fillStyle=i%2?"#e7ebef":"#f8f9fa";ctx.fillRect(x+4,y+3,cellW-8,cellH-6);
    ctx.fillStyle="#263745";ctx.font="13px sans-serif";ctx.fillText(id,x+12,y+22);
    const big=await loadImage(join(target,`icons/${id}-128.png`));ctx.drawImage(big,x+40,y+25,128,128);
    for(const [size,dx]of [[16,18],[32,58],[64,120]]) {const img=await loadImage(join(target,`icons/${id}-${size}.png`));ctx.drawImage(img,x+dx,y+154,size,size);}
  }
  writeFileSync(join(evidence,"family-board.png"),canvas.toBuffer("image/png"));
  const proof=createCanvas(1180,Math.ceil(ids.length/10)*96*2+60),p=proof.getContext("2d");
  for(let row=0;row<2;row++) {const top=30+row*Math.ceil(ids.length/10)*96;p.fillStyle=row?"#20262f":"#f5f6f8";p.fillRect(0,top,proof.width,Math.ceil(ids.length/10)*96);for(let i=0;i<ids.length;i++){const x=i%10*118,y=top+Math.floor(i/10)*96;p.fillStyle=row?"#e8edf2":"#293747";p.font="10px sans-serif";p.fillText(ids[i],x+4,y+14);for(const [size,dx]of [[16,8],[32,37]])p.drawImage(await loadImage(join(target,`icons/${ids[i]}-${size}.png`)),x+dx,y+30,size,size);}}
  writeFileSync(join(evidence,"actual-size-light-dark.png"),proof.toBuffer("image/png"));
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildBigSurIcons({partial:process.argv.includes("--partial")});
