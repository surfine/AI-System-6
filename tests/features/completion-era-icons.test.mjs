// Exercise the public painter and the packaged bytes, not just the authored list.
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import sharp from 'sharp';
import {createFeatureTest,read,exists,resolveProjectPath} from '../helpers/feature-test-harness.mjs';
import {themeLabPackagedAssetReport} from '../../tooling/lib/generated-era-runtime-assets.mjs';
const test=createFeatureTest('completion-era-icons');
const sandbox={window:{devicePixelRatio:2},document:{body:null,querySelectorAll:()=>[]}};
vm.createContext(sandbox);
vm.runInContext(read('app/core/theme-registry.js'),sandbox);
vm.runInContext(read('app/core/system-icons.js'),sandbox);
const api=sandbox.window.AISystem6Theme;
const ids=Array.from(sandbox.window.AISystem6SystemIcons.ids);
const families={classic:'classic','system-7':'system-7',platinum:'platinum','drawing-board':'platinum',aqua:'aqua',tiger:'aqua','snow-leopard':'snow-leopard',lion:'snow-leopard',yosemite:'yosemite','big-sur':'big-sur','liquid-glass':'liquid-glass',nextstep:'nextstep'};
const appIds=[...read('app/core/app-admissions.js').matchAll(/appIcon:\s*"([^"]+)"/g)].map(m=>m[1]);
for(const id of appIds) test.assert(ids.includes(id),`admitted application ${id} is in the full artwork inventory`);
for(const [era,family] of Object.entries(families)) {
  api.applyTheme(era,{persist:false,announce:false});
  for(const id of ids) for(const size of [16,32]) {
    const svg=sandbox.systemIconSvg(id,{sourceSize:size,platinumSourceSize:size,modernSourceSize:size});
    const layer=family==='classic'?'classic':family==='platinum'?'platinum-core':family==='liquid-glass'?'liquid':family;
    const content=svg.split(`class="sys-icon-${layer}">`)[1]?.split('</g>')[0]||'';
    const urls=[...content.matchAll(/href="([^"?]+)(?:\?[^" ]*)?"/g)].map(m=>m[1]);
    test.assert(urls.length>0,`${era}/${id}/${size} has asset-backed artwork`);
    for(const url of urls) test.assert(url.startsWith(`assets/themes/${family}/`)&&exists(url),`${era}/${id}/${size} resolves its own family's real file`);
  }
}
const ledger=JSON.parse(read('assets/themes/completion-icon-extension.json'));
test.assert(ledger.engine==='built-in Image Gen'&&ledger.complete===true,'every completion icon is backed by a finished Image Gen source');
test.assert(ledger.nativeReplica===false&&ledger.referenceValidated===false,'original artwork does not claim historical certification');
test.assert(createHash('sha256').update(read(ledger.source)).digest('hex')===ledger.sourceSha256,'provenance names the current artwork source');
const packaged=new Set(themeLabPackagedAssetReport().flatMap(e=>e.files.map(f=>f.relativePath)));
for(const [era,{icons}] of Object.entries(ledger.eras)) for(const [id,entry] of Object.entries(icons)) {
  const hashes=new Set();
  for(const source of Object.values(entry.sources || {})) {
    test.assert(exists(source.file)&&exists(source.prompt),`${era}/${id} retains its generated master and prompt`);
    test.assert(createHash('sha256').update(readFileSync(resolveProjectPath(source.file))).digest('hex')===source.sha256,`${era}/${id} pins its actual generated master`);
  }
  for(const [file,asset] of Object.entries(entry.assets)) {
    const relative=`assets/themes/${era}/${file}`,bytes=readFileSync(resolveProjectPath(relative));
    test.assert(createHash('sha256').update(bytes).digest('hex')===asset.sha256,`${era}/${file} matches its source ledger`);
    const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    test.assert(info.width===asset.width&&info.height===asset.height,`${era}/${file} retains the authored dimensions`);
    let visible=0,transparent=0;for(let i=3;i<data.length;i+=4){if(data[i]>0)visible++;else transparent++;}
    test.assert(visible>0&&transparent>0,`${era}/${file} has real artwork and a transparent surround`);
    if(era!=='classic'&&era!=='platinum') test.assert(packaged.has(relative),`${era}/${file} is covered by the release consumer`);
    if(file.includes('-128-')) hashes.add(asset.sha256);
  }
  if(era==='liquid-glass') test.assert(hashes.size===3,`${id} has distinct default/dark/clear appearances`);
}
test.finish();
