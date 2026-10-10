/** Proposed v4 ports. No claim that these names are existing AI System 6 APIs.
 * v3 host owns persistence, authority, UI and native editor model. */
export type Outcome<T> = {status:'ok'; value:T} | {status:'cancelled'} |
 {status:'blocked'|'failed';code:string;message:string;locations?:Location[]};
export type Identity = {documentId:string;generation:number};
export type Stamp = Identity & {revision:number;editRevision:number};
export type Snapshot = Stamp & {snapshotRef:string;assetRefs:readonly string[];scopeId:string};
export type OffsetUnit = 'utf16'|'utf8-byte'|'grapheme';
export type Location = Identity & {kind:'text'|'cell-range'|'slide-shape'|'pdf-region'|'media-range';
 objectId?:string;sheetId?:string;range?:string;pageId?:string;
 quote?:{exact:string;prefix:string;suffix:string;offset:number;unit:OffsetUnit};
 rect?:{x:number;y:number;width:number;height:number;unit:'pdf-point'|'document-point'};
 time?:{startMs:number;endMs:number;basis:'source'|'recorded'|'aligned'}};
export type Selection = Stamp & {selectionEpoch:number;location:Location;bookmark:unknown};
export type Feature = {id:string;objectId?:string;place:string;
 display:'exact'|'approximate'|'not-displayed';edit:'native'|'outer-only'|'none';
 save:'editable'|'preserve'|'convert'|'unsupported'|'unknown';evidenceIds:readonly string[]};
export type NativePatch = {id:string;target:Stamp;modelKind:string;
 operationRef:string;candidateDigest:string;assetRefs:readonly string[];
 losses:readonly {featureId:string;place:string;message:string}[]};
export type Prepared = {id:string;scopeId:string;reads:readonly Stamp[];
 patches:readonly NativePatch[];candidateDigest:string;expiresAt:number};
/** Unforgeable in-host authority, not serialized actor:'user'/confirmed:true. */
declare const authority:unique symbol;
export type Approval = {[authority]:true};
export type Artifact = {path:string;documentId:string;generation:number;revision:number;
 bytesRef:string;sha256:string;mime:string;verificationRef:string;privacyReportRef:string};
export interface CreatorPorts {
 documents:{capture(ids:readonly string[],signal?:AbortSignal):Promise<Outcome<readonly Snapshot[]>>};
 editors:{selection(id:string):Outcome<Selection>;
  previewPatch(input:Snapshot,change:unknown,signal:AbortSignal):Promise<Outcome<NativePatch>>};
 confirmation:{request(prepared:Prepared,signal:AbortSignal):Promise<Outcome<Approval>>};
 coordinator:{commit(prepared:Prepared,approval:Approval,signal:AbortSignal):Promise<Outcome<{
  operationId:string;committed:readonly Stamp[];receiptRef:string}>>};
 locate:{open(location:Location):Promise<Outcome<{resolution:'exact'|'lost'|'ambiguous'}>>};
 interop:{inspect(input:Snapshot):Promise<Outcome<readonly Feature[]>>;
  encode(input:Snapshot,profileRef:string,signal:AbortSignal):Promise<Outcome<Artifact>>;
  verify(artifact:Artifact,contractRef:string):Promise<Outcome<Artifact>>};
 delivery:{publish(captured:readonly Snapshot[],artifacts:readonly Artifact[],approval:Approval):
  Promise<Outcome<{releaseId:string;receiptRef:string}>>};
 dispose():void;
}
/** Production values are native snapshots/refs. src/integration.js uses small JSON fixtures
 * only to express policy; it must not become a universal editable Office AST. */
