import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createCanvas, loadImage } from "canvas";
import { addedAppArtwork } from "./lib/added-app-compact-art.mjs";
import { ADDED_APP_ICON_IDS, ADDED_APP_ICON_ERAS } from "./lib/added-app-icon-inventory.mjs";
import { inkBox, shapeClass } from "./lib/icon-grid.mjs";
import { ICON_SPECS } from "./lib/icon-family-inventory.mjs";
import { runtimePixelMetrics } from "./lib/icon-pixel-metrics.mjs";
import { normalizedMaster } from "./build-big-sur-icons.mjs";

const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const evidence=join(root,"internal/evidence/drafts/added-app-era-icons");
const themes=join(root,"apps/desktop/assets/themes");
const labels={clioPaint:"Drawing palette and brush",clioProject:"Task cards and dependency links",oneMoreTune:"Music knowledge study cards and note"};
const hash=b=>createHash("sha256").update(b).digest("hex");
const json=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2)+"\n");
const readJson=(p)=>existsSync(p)?JSON.parse(readFileSync(p)):{};

async function artworkContext(content, size) {
  const image=await loadImage(content),ctx=createCanvas(size,size).getContext("2d");
  ctx.drawImage(image,0,0,size,size);return ctx;
}
function pixelBounds(ctx,size,monochrome=false) {
  const data=ctx.getImageData(0,0,size,size).data;
  let pixels=0,minX=size,minY=size,maxX=-1,maxY=-1;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const i=(y*size+x)*4,alpha=data[i+3]/255;
    const lum=(data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722)/255;
    if(monochrome?alpha*(1-lum)<(size===16?.32:.24):alpha<=40/255)continue;
    pixels++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
  }
  return {pixels,bbox:{minX,minY,maxX,maxY}};
}

export async function buildAddedAppIcons({eras=ADDED_APP_ICON_ERAS,partial=false}={}) {
  mkdirSync(evidence,{recursive:true});
  for(const era of eras) {
    if(!ADDED_APP_ICON_ERAS.includes(era))throw new Error(`Unknown added-app era ${era}`);
    // The complete Big Sur builder owns these three alongside its other 56.
    if(era==="big-sur")continue;
    const dir=join(themes,era);mkdirSync(join(dir,"icons"),{recursive:true});
    const ledgerDir=era==="classic"?join(dir,"icons"):dir;
    const familyPath=join(ledgerDir,`${era}-icon-family.json`),manifestPath=join(ledgerDir,`${era}-icon-manifest.json`);
    const family=readJson(familyPath),manifest=readJson(manifestPath),added={};
    family.icons ||= {};
    for(const id of ADDED_APP_ICON_IDS) {
      const master=join(evidence,"masters",era,`${id}.png`);
      const generated=["aqua","snow-leopard","yosemite","liquid-glass"].includes(era);
      if(generated&&!existsSync(master)){if(partial)continue;throw new Error(`Missing era master ${era}/${id}`);}
      const tiers=era==="classic"?[16,32]:era==="platinum"?[16,32,42,64,128]:era==="snow-leopard"?[16,32,64,128,512]:[16,32,64,128];
      const variants=era==="liquid-glass"?["default","dark","clear"]:["default"];
      const sizes={},appearanceSizes={},hashes={},metrics={};
      let grid,quality;
      for(const size of tiers)for(const appearance of variants) {
        const svg=addedAppArtwork(id,era,size,appearance);
        const ext=era==="classic"?"svg":"png";
        const rel=`icons/${id}-${size}${era==="liquid-glass"?`-${appearance}`:""}.${ext}`;
        let content;
        if(ext==="svg")content=Buffer.from(svg);
        else if(size>32&&generated) {
          const materialMaster=appearance==="default"?master:master.replace(/\.png$/,`-${appearance}.png`);
          if(!existsSync(materialMaster))throw new Error(`Missing appearance master ${era}/${id}/${appearance}`);
          content=await normalizedMaster(materialMaster,size,{id,genre:"application"});
        }
        else content=await sharp(Buffer.from(svg)).toColourspace("srgb").withIccProfile("srgb").png({compressionLevel:9}).toBuffer();
        writeFileSync(join(dir,rel),content);hashes[`${size}-${appearance}`]=hash(content);
        if(appearance==="default")sizes[size]=era==="classic"?rel.slice(6):rel;
        if(era==="liquid-glass")appearanceSizes[`${size}-${appearance}`]=rel;
        if(era==="classic") {
          // A black alpha silhouette under the reversed artwork preserves the
          // existing Classic selection/reversal contract, including inner gaps.
          const mask=svg.replace(/(?:fill|stroke)="(?!none")[^"]*"/g,match=>match.startsWith("fill")?'fill="#000000"':'stroke="#000000"');
          writeFileSync(join(dir,`icons/${id}-mask-${size}.svg`),mask);
          const art=pixelBounds(await artworkContext(content,size),size,true);
          const maskBounds=pixelBounds(await artworkContext(Buffer.from(mask),size),size);
          metrics[size]={art,mask:maskBounds,inkPixels:art.pixels,inkCoverage:Number((art.pixels/(size*size)).toFixed(4))};
        } else {
          const ctx=await artworkContext(content,size),ink=inkBox(ctx,size);
          const key=era==="liquid-glass"?`${size}-${appearance}`:size;
          metrics[key]={...pixelBounds(ctx,size),sha256:hash(content),ink,gridShape:shapeClass(ink)};
          if(size===128&&appearance==="default") {
            grid={canvas:128,shape:shapeClass(ink),fitted:Math.max(ink.width,ink.height)/128,method:"measured-output-no-resampling"};
            quality=runtimePixelMetrics(ctx,128);
          }
        }
      }
      manifest[id]=sizes[["classic","platinum","aqua","snow-leopard","yosemite"].includes(era)?32:128];
      const item={genre:"application",semanticIdentity:labels[id],physicalMetaphor:labels[id],provenanceClass:"C",sourceKind:generated?"original-generated-era-illustration":"original-code-native-period-adaptation",authoringMethod:generated?"built-in image generation for large tiers and appearances; independently authored compact artwork":"independently authored era-specific SVG construction",generationStatus:"technically-clean",historicalReviewStatus:"pending",eraGrammarReview:"original-period-adaptation-reviewed",reviewStatus:"technically-clean",runtimeAsset:true,nativeReplica:false,referenceValidated:false,sourceNote:"Original AI System 6 application. Period grammar is adapted; no historical native counterpart is claimed.",sourceReferences:["apps/desktop/assets/themes/era-icon-reference.json"],sizes,runtimeSha256:hashes,sizePolicy:"16 and 32 px have independent compact compositions with reduced detail; large default tiers use material masters where applicable."};
      item.label=id;item.metrics=metrics;
      if(grid)item.grid=grid;
      if(quality)item.runtimePixelMetrics=quality;
      if(era==="classic")item.masks=Object.fromEntries([16,32].map(size=>[size,`${id}-mask-${size}.svg`]));
      if(generated){item.master=master.slice(root.length+1);item.masterSha256=hash(readFileSync(master));}
      if(era==="liquid-glass"){item.appearanceSizes=appearanceSizes;item.appearancePolicy="Dark and clear 64/128 variants are image-tool edits preserving the default composition; 16/32 variants have independent compact constructions.";}
      family.icons[id]=item;added[id]=item;
    }
    family.schemaVersion ||= 1;family.target ||= era;family.supplementalBuilder="tooling/build-added-app-icons.mjs";
    family.supplementalIconIds=ADDED_APP_ICON_IDS;family.compatibilityManifest=`${era}-icon-manifest.json`;
    if(era==="nextstep") {
      // Derived, not typed: this builder owns the applications, and
      // build-nextstep-core-icons.mjs owns the objects. The note is the number
      // both ledgers can support, so re-running either builder cannot leave a
      // coverage claim behind that the files contradict.
      family.completeFamily=false;
      const owned=Object.keys(family.icons).length;
      family.coverageNote=`${owned-ADDED_APP_ICON_IDS.length} applications and `
        +`${(family.coreIconIds||[]).length} core objects own NeXTSTEP artwork; the other `
        +`${ICON_SPECS.length-owned} semantic objects use Classic.`;
    }
    json(familyPath,family);json(manifestPath,manifest);json(join(evidence,`${era}-additions.json`),added);
    console.log(`${era}: ${Object.keys(added).length} added applications`);
  }
  await addedAppBoard();
}

async function addedAppBoard(){
  const canvas=createCanvas(8*188,3*242+42),ctx=canvas.getContext("2d");ctx.fillStyle="#edf0f3";ctx.fillRect(0,0,canvas.width,canvas.height);
  for(let col=0;col<ADDED_APP_ICON_ERAS.length;col++){
    const era=ADDED_APP_ICON_ERAS[col],x=col*188;ctx.fillStyle="#273444";ctx.font="15px sans-serif";ctx.fillText(era,x+10,26);
    for(let row=0;row<3;row++){
      const id=ADDED_APP_ICON_IDS[row],y=row*242+42;ctx.fillStyle="#263545";ctx.font="13px sans-serif";ctx.fillText(id,x+10,y+18);
      for(const [size,dx,dy,render]of [[128,28,28,128],[16,16,181,16],[32,48,177,32],[64,103,166,64]]){
        const tier=era==="classic"?Math.min(size,32):size;
        const file=join(themes,era,`icons/${id}-${tier}${era==="liquid-glass"?"-default":""}.${era==="classic"?"svg":"png"}`);
        if(!existsSync(file))continue;
        const buffer=era==="classic"?await sharp(readFileSync(file)).resize(render,render).png().toBuffer():readFileSync(file);
        const img=await loadImage(buffer);ctx.drawImage(img,x+dx,y+dy,render,render);
      }
    }
  }
  writeFileSync(join(evidence,"era-comparison.png"),canvas.toBuffer("image/png"));
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildAddedAppIcons({partial:process.argv.includes("--partial")});
