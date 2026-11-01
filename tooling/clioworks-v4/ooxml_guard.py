"""Strict preservation sentinel for a declared OOXML edit.
Not an OOXML schema validator, editor, cryptographic signature verifier or Office renderer.
No external downloads. Unknown byte changes fail closed. Reviewed per-field rules only.
Usage: python tools/ooxml_guard.py original.docx candidate.docx --contract contract.json
"""
from __future__ import annotations
from pathlib import Path
import argparse,copy,hashlib,json,posixpath,re,sys,zipfile
from urllib.parse import unquote,urlsplit
import xml.etree.ElementTree as ET
MAX_PARTS=10000;MAX_BYTES=128*1024*1024;MAX_PART=32*1024*1024
R='http://schemas.openxmlformats.org/package/2006/relationships'
CT='http://schemas.openxmlformats.org/package/2006/content-types'
class GuardError(Exception): pass
def package(path):
 out={};total=0
 with zipfile.ZipFile(path) as z:
  if len(z.infolist())>MAX_PARTS:raise GuardError('too many ZIP entries')
  for info in z.infolist():
   name=info.filename
   if info.is_dir():continue
   if not name or name.startswith('/') or '\\' in name or '\x00' in name or any(x in ('..','.') for x in name.split('/')) or posixpath.normpath(name)!=name:raise GuardError('unsafe ZIP name: '+repr(name))
   if name in out:raise GuardError('duplicate ZIP name: '+name)
   total+=info.file_size
   if info.file_size>MAX_PART or total>MAX_BYTES:raise GuardError('expanded ZIP limit exceeded')
   with z.open(info) as f:data=f.read(MAX_PART+1)
   if len(data)!=info.file_size or len(data)>MAX_PART:raise GuardError('ZIP size mismatch')
   out[name]=data
 if '[Content_Types].xml' not in out or '_rels/.rels' not in out:raise GuardError('not an OPC package')
 return out
def xml(data):
 if re.search(br'<!\s*(DOCTYPE|ENTITY)',data,re.I):raise GuardError('DTD/entity declaration is forbidden')
 try:return ET.fromstring(data)
 except ET.ParseError as e:raise GuardError('XML parse failed: '+str(e)) from e
def signature(node):
 # Attribute order and namespace prefix spelling are not document semantics.
 # Child order and all text are intentionally retained, including whitespace.
 return (node.tag,tuple(sorted(node.attrib.items())),node.text or '',node.tail or '',tuple(signature(c) for c in node))
def rel_source(name):
 if name=='_rels/.rels':return ''
 parent,leaf=posixpath.split(name)
 if not parent.endswith('/_rels') or not leaf.endswith('.rels'):raise GuardError('unexpected relationships part '+name)
 return posixpath.join(parent[:-6],leaf[:-5])
def check_graph(parts):
 problems=[];external=[]
 for name,data in parts.items():
  if not name.endswith('.rels'):continue
  try:
   doc=xml(data);source=rel_source(name);seen=set()
   if doc.tag!='{'+R+'}Relationships':raise GuardError('incorrect relationship namespace')
   if source and source not in parts:problems.append({'part':name,'code':'MISSING_REL_SOURCE','target':source})
   for rel in doc:
    rid=rel.get('Id');target=rel.get('Target','');mode=rel.get('TargetMode','Internal')
    if not rid or rid in seen:problems.append({'part':name,'code':'DUPLICATE_REL_ID','id':rid})
    seen.add(rid)
    if mode=='External':external.append({'part':name,'id':rid,'target':target});continue
    u=urlsplit(target)
    if mode!='Internal' or u.scheme or u.netloc or u.query:problems.append({'part':name,'code':'BAD_INTERNAL_URI','target':target});continue
    path=unquote(u.path)
    if '\\' in path or not path:problems.append({'part':name,'code':'BAD_TARGET','target':target});continue
    absolute=posixpath.normpath(path.lstrip('/') if path.startswith('/') else posixpath.join(posixpath.dirname(source),path))
    if absolute=='..' or absolute.startswith('../') or absolute not in parts:problems.append({'part':name,'code':'MISSING_TARGET','target':absolute})
  except GuardError as e:problems.append({'part':name,'code':'REL_PARSE','message':str(e)})
 try:
  c=xml(parts['[Content_Types].xml']);defaults={};overrides={}
  if c.tag!='{'+CT+'}Types':raise GuardError('incorrect content-types namespace')
  for n in c:
   if n.tag=='{'+CT+'}Default':
    key=n.get('Extension','').lower()
    if key in defaults:problems.append({'part':'[Content_Types].xml','code':'DUPLICATE_DEFAULT','extension':key})
    defaults[key]=n.get('ContentType')
   elif n.tag=='{'+CT+'}Override':
    key=unquote(n.get('PartName','')).lstrip('/')
    if key in overrides:problems.append({'part':'[Content_Types].xml','code':'DUPLICATE_OVERRIDE','target':key})
    overrides[key]=n.get('ContentType')
    if key not in parts:problems.append({'part':'[Content_Types].xml','code':'MISSING_TYPED_PART','target':key})
  for name in parts:
   if name=='[Content_Types].xml':continue
   if name not in overrides and name.rsplit('.',1)[-1].lower() not in defaults:problems.append({'part':name,'code':'NO_CONTENT_TYPE'})
 except GuardError as e:problems.append({'part':'[Content_Types].xml','code':'TYPE_PARSE','message':str(e)})
 return problems,external
def expected_tree(before,rules):
 tree=xml(before)
 for rule in rules:
  if set(rule)-{'xpath','namespace','attribute','before','after'}:raise GuardError('unknown edit-rule field')
  hits=tree.findall(rule['xpath'],rule.get('namespace',{}))
  if len(hits)!=1:raise GuardError('edit XPath must match exactly one node: '+rule['xpath'])
  node=hits[0];attr=rule.get('attribute');value=node.get(attr) if attr else node.text
  if value!=rule['before']:raise GuardError('declared before-value differs from original')
  if attr:
   if rule['after'] is None:node.attrib.pop(attr,None)
   else:node.set(attr,rule['after'])
  else:node.text=rule['after']
 return tree
def compare(original,candidate,contract):
 before=package(original);after=package(candidate);issues=[];changed=[];preserved=[]
 allowed=contract.get('xmlEdits',{})
 if contract.get('schema')!=1 or set(contract)-{'schema','description','xmlEdits','originalSha256'}:raise GuardError('invalid or unsupported contract')
 if contract.get('originalSha256')!=hashlib.sha256(Path(original).read_bytes()).hexdigest():raise GuardError('contract is not bound to these original bytes')
 for name in sorted(set(before)|set(after)):
  if name not in before:issues.append({'part':name,'code':'UNDECLARED_ADDITION'});continue
  if name not in after:issues.append({'part':name,'code':'PART_DROPPED'});continue
  if before[name]==after[name]:
   if name in allowed:issues.append({'part':name,'code':'DECLARED_EDIT_NOT_APPLIED'})
   else:preserved.append(name)
   continue
  changed.append(name)
  if name not in allowed:issues.append({'part':name,'code':'UNDECLARED_BYTE_CHANGE'});continue
  try:
   if signature(expected_tree(before[name],allowed[name]))!=signature(xml(after[name])):issues.append({'part':name,'code':'UNDECLARED_XML_CHANGE'})
  except GuardError as e:issues.append({'part':name,'code':'RULE_FAILED','message':str(e)})
 for name in allowed:
  if name not in before:issues.append({'part':name,'code':'RULE_PART_MISSING'})
 old_graph,old_ext=check_graph(before);new_graph,new_ext=check_graph(after)
 # We report original defects separately but do not approve a broken candidate.
 issues.extend(new_graph)
 if old_ext!=new_ext:issues.append({'code':'EXTERNAL_RELATIONSHIP_CHANGED'})
 return {'schema':1,'status':'passed' if not issues else 'failed','scope':'strict declared-edit preservation sentinel; NOT Office acceptance','originalSha256':hashlib.sha256(Path(original).read_bytes()).hexdigest(),'candidateSha256':hashlib.sha256(Path(candidate).read_bytes()).hexdigest(),'originalParts':len(before),'candidateParts':len(after),'bytePreservedParts':preserved,'changedParts':changed,'issues':issues,'originalGraphIssues':old_graph,'externalRelationshipsNotFetched':len(new_ext)}
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('original');p.add_argument('candidate');p.add_argument('--contract',required=True);p.add_argument('--out');args=p.parse_args()
 try:report=compare(args.original,args.candidate,json.loads(Path(args.contract).read_text()))
 except (GuardError,zipfile.BadZipFile,OSError,ValueError) as e:report={'status':'failed','code':'INPUT_REJECTED','message':str(e)}
 text=json.dumps(report,ensure_ascii=False,indent=2)
 if args.out:Path(args.out).write_text(text)
 print(text);return 0 if report['status']=='passed' else 1
if __name__=='__main__':sys.exit(main())
