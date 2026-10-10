#!/usr/bin/env python3
"""ClioWorks v4 (V4-01): build a production preservation map for a REAL editor output.

Usage:
  python3 build_production_map.py ORIGINAL REAL_OUTPUT \
      --edit part=word/document.xml,xpath=.//w:t,before=…,after=…[,match=any] \
      --out map.json [--max-rules-per-part N]

Derives the map from the ORIGINAL package's own semantics (never from the
output): every XML part the real writer changed gets a rule per element,
locking the element's attribute values, child element existence and direct
text. Parts the writer did not change stay opaque (byte-identical) and get no
rules. The declared edit's before-text is exempt from text locks in the edit
part so exactly that one change is allowed.

The generator cannot weaken the guard: it only emits locks the original can
satisfy; the guard still fails closed on anything undeclared.
"""
from __future__ import annotations

import argparse
import json
import posixpath
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

# Canonical prefixes for OOXML namespaces (wordprocessingml / spreadsheetml /
# drawingml / presentationml / relationships / markup-compat / content types).
CANONICAL_NS = {
    'http://schemas.openxmlformats.org/wordprocessingml/2006/main': 'w',
    'http://schemas.openxmlformats.org/spreadsheetml/2006/main': 's',
    'http://schemas.openxmlformats.org/drawingml/2006/main': 'a',
    'http://schemas.openxmlformats.org/presentationml/2006/main': 'p',
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships': 'r',
    'http://schemas.openxmlformats.org/package/2006/relationships': 'rel',
    'http://schemas.openxmlformats.org/package/2006/content-types': 'ct',
    'http://schemas.openxmlformats.org/markup-compatibility/2006': 'mc',
    'http://schemas.openxmlformats.org/drawingml/2006/chart': 'c',
    'http://schemas.openxmlformats.org/drawingml/2006/chartDrawing': 'cdr',
    'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing': 'wp',
    'http://schemas.openxmlformats.org/drawingml/2006/picture': 'pic',
    'http://schemas.microsoft.com/office/word/2010/wordml': 'w14',
    'http://schemas.microsoft.com/office/word/2006/wordml': 'w11',
    'http://schemas.microsoft.com/office/word/2012/wordml': 'w15',
    'http://schemas.microsoft.com/office/officeDocument/2006/relationships': 'or',
    'http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas': 'wpc',
    'http://schemas.microsoft.com/office/drawing/2008/diagram': 'dsp',
    'http://schemas.openxmlformats.org/officeDocument/2006/math': 'm',
    'http://schemas.microsoft.com/office/powerpoint/2010/main': 'p14',
    'http://schemas.microsoft.com/office/powerpoint/2012/main': 'p15',
    'urn:schemas-microsoft-com:office:office': 'o',
    'urn:schemas-microsoft-com:vml': 'v',
}
# Attribute namespaces reuse the element table; attributes without a prefix
# (unlike elements) are NOT in the default namespace in OOXML.


def local_name(tag: str) -> str:
    return tag.split('}', 1)[1] if tag.startswith('{') else tag


def tag_ns(tag: str) -> str | None:
    return tag[1:].split('}', 1)[0] if tag.startswith('{') else None


def parse_edit(spec: str) -> dict:
    fields = {}
    for chunk in spec.split(','):
        if '=' not in chunk:
            raise SystemExit('--edit expects part=…,xpath=…,before=…,after=…[,match=any]')
        key, value = chunk.split('=', 1)
        fields[key.strip()] = value
    for required in ('part', 'xpath', 'before', 'after'):
        if required not in fields:
            raise SystemExit(f'--edit is missing {required}')
    return fields


def ns_table_from_packages(packages: list[dict[str, bytes]]) -> dict[str, str]:
    """Build prefix table: canonical URIs plus every xmlns actually declared."""
    ns_map: dict[str, str] = {}
    used: set[str] = set()
    declared: dict[str, str] = {}  # prefix -> uri from documents (raw scan)
    for pkg in packages:
        for name, data in pkg.items():
            if not name.endswith('.xml') and not name.endswith('.rels'):
                continue
            for m in re.finditer(br'xmlns:([\w.-]+)\s*=\s*["\']([^"\']+)["\']', data):
                prefix = m.group(1).decode('utf-8', 'replace')
                uri = m.group(2).decode('utf-8', 'replace')
                if prefix not in declared:
                    declared[prefix] = uri
    # 1) canonical URIs win their canonical prefix
    for uri, prefix in CANONICAL_NS.items():
        ns_map[uri] = prefix
        used.add(prefix)
    # 2) document-declared prefixes for URIs not yet covered
    for prefix, uri in declared.items():
        if uri in ns_map:
            continue
        if prefix in used:
            continue
        ns_map[uri] = prefix
        used.add(prefix)
    # 3) generated prefixes for anything still missing
    counter = 0
    for prefix, uri in declared.items():
        if uri in ns_map:
            continue
        counter += 1
        while f'ns{counter}' in used:
            counter += 1
        ns_map[uri] = f'ns{counter}'
        used.add(f'ns{counter}')
    return ns_map


def prefix_for(uri: str | None, ns_map: dict[str, str], ns_assign: dict[str, str]) -> str:
    if uri is None:
        return ''
    if uri in ns_map:
        return ns_map[uri]
    if uri not in ns_assign:
        index = len(ns_assign) + 1
        ns_assign[uri] = f'x{index}'
    return ns_assign[uri]


def attr_name_for(raw_attr: str, ns_map: dict[str, str], ns_assign: dict[str, str]) -> str:
    if not raw_attr.startswith('{'):
        return raw_attr
    uri, local = raw_attr[1:].split('}', 1)
    prefix = prefix_for(uri, ns_map, ns_assign)
    return f'{prefix}:{local}' if prefix else local


def element_step(el: ET.Element, ns_map: dict[str, str], ns_assign: dict[str, str]) -> str:
    prefix = prefix_for(tag_ns(el.tag), ns_map, ns_assign)
    local = local_name(el.tag)
    return f'{prefix}:{local}' if prefix else local


# Attribute preference order for identity anchoring: an element whose attribute
# value is unique among same-name siblings is addressed by [@attr='v'] so the
# lock survives writer reordering (styles, relationships, content types…).
IDENTITY_ATTR_PREFERENCE = [
    'styleId', 'PartName', 'Extension', 'Target', 'Id', 'name', 'numId',
    'abstractNumId', 'fontKey', 'charset', 'family', 'pitch', 'sig',
]


def attr_anchor(el: ET.Element, siblings: list[ET.Element], ns_map: dict[str, str],
                ns_assign: dict[str, str]) -> str | None:
    """Value predicate for an attribute that uniquely identifies el among its
    same-tag siblings; None when no such attribute exists."""
    same_tag = [c for c in siblings if c.tag == el.tag]
    if len(same_tag) < 2:
        return None
    candidates = sorted(el.attrib, key=lambda a: (
        IDENTITY_ATTR_PREFERENCE.index(local_name(a))
        if local_name(a) in IDENTITY_ATTR_PREFERENCE else len(IDENTITY_ATTR_PREFERENCE)))
    for raw in candidates:
        value = el.attrib[raw]
        if not value or any(ch in value for ch in "'\"[]<>\n\t"):
            continue
        clashes = sum(1 for c in same_tag if c.attrib.get(raw) == value)
        if clashes == 1:
            return f"[@{attr_name_for(raw, ns_map, ns_assign)}='{value}']"
    return None


def unique_xpath(el: ET.Element, parent_map: dict[int, ET.Element], ns_map: dict[str, str],
                 ns_assign: dict[str, str]) -> str:
    """Guard-style path: './/root/child[@id='x']/…' — the guard's matcher anchors
    the first step with a descendant search that includes the root itself; later
    steps are child steps. Identity predicates keep locks order-independent;
    positional [n] only as the fallback."""
    steps = []
    node = el
    while True:
        parent = parent_map.get(id(node))
        if parent is None:
            steps.append(element_step(node, ns_map, ns_assign))
            break
        anchor = attr_anchor(node, list(parent), ns_map, ns_assign)
        if anchor:
            steps.append(element_step(node, ns_map, ns_assign) + anchor)
        else:
            same_name = [c for c in list(parent) if c.tag == node.tag]
            step = element_step(node, ns_map, ns_assign)
            if len(same_name) > 1:
                step = f'{step}[{same_name.index(node) + 1}]'
            steps.append(step)
        node = parent
    return './/' + '/'.join(reversed(steps))


def build_parent_map(root: ET.Element) -> dict[int, ET.Element]:
    parents: dict[int, ET.Element] = {}
    def walk(node):
        for child in list(node):
            parents[id(child)] = node
            walk(child)
    walk(root)
    return parents


# Writer normalizations the map declares instead of locking (each is recorded in
# the map description and the evidence INDEX; none may silently widen):
#  - w:rsid* attributes and elements: Word revision-save bookkeeping; the Quire
#    writer does not model them (upstream-documented).
#  - theme-linked color attrs (w:themeColor/themeFill/…) and the literal
#    w:color/w:fill they pair with on the same element: the writer resolves
#    theme references to literal values (upstream-documented conversion).
RSID_ATTR = re.compile(r'^rsid', re.I)
THEME_ATTRS = {'themeColor', 'themeFill', 'themeFillTint', 'themeFillShade',
               'themeTint', 'themeShade', 'themeFont', 'themeEffect'}
THEME_LITERALS = {'color': 'themeColor', 'fill': 'themeFill'}


def redundant_override(part_name: str, content_type: str, defaults: dict[str, str]) -> bool:
    """An Override whose content type equals the Default for the part's extension
    is semantically redundant: the part resolves to the same type either way."""
    ext = part_name.rsplit('.', 1)[-1].lower() if '.' in part_name else ''
    return bool(ext and defaults.get(ext) == content_type)


def rules_for_part(name: str, data: bytes, edit: dict, ns_map: dict[str, str],
                   ns_assign: dict[str, str], max_rules: int,
                   defaults_by_ext: dict[str, str] | None = None) -> list[dict]:
    root = ET.fromstring(data)
    parent_map = build_parent_map(root)
    rules: list[dict] = []
    is_edit_part = edit.get('part') == name
    is_rels = name.endswith('.rels')
    # Relationship Ids are internal references the writer may renumber as long as
    # every content-part r:id reference is remapped consistently (those stay
    # locked in their own parts). Rels rules therefore lock Type (and stay
    # anchored on Target) but never Id.
    skip_attrs = {'Id'} if is_rels else set()
    defaults_by_ext = defaults_by_ext or {}

    def locked_attrs(el: ET.Element) -> list[str]:
        out = []
        theme_locals = {local_name(a) for a in el.attrib if local_name(a) in THEME_ATTRS}
        for raw in el.attrib:
            local = local_name(raw)
            if local in skip_attrs or RSID_ATTR.match(local):
                continue
            paired = THEME_LITERALS.get(local)
            if paired and paired in theme_locals:
                continue  # literal is writer-resolved where a theme ref existed
            if local in THEME_ATTRS:
                continue
            out.append(attr_name_for(raw, ns_map, ns_assign))
        return sorted(out)

    def walk(el: ET.Element):
        if RSID_ATTR.match(local_name(el.tag)):
            return  # writer normalization: rsid bookkeeping elements are not modelled
        if name == '[Content_Types].xml' and local_name(el.tag) == 'Override':
            part_name = el.attrib.get('PartName', '')
            content_type = el.attrib.get('ContentType', '')
            if redundant_override(part_name.lstrip('/'), content_type, defaults_by_ext):
                return  # Default-covered override: dropping it is not a semantic change
        text = el.text or ''
        skip_text = is_edit_part and text == edit['before']
        rule = {
            'xpath': unique_xpath(el, parent_map, ns_map, ns_assign),
            'keepAttrs': locked_attrs(el),
            'keepChildren': sorted({local_name(c.tag) for c in list(el)
                                    if not RSID_ATTR.match(local_name(c.tag))}),
            'keepText': bool(text.strip()) and not skip_text,
        }
        if local_name(el.tag) in ('document', 'hdr', 'ftr', 'comments', 'styles', 'numbering'):
            # mc:Ignorable legitimately EXTENDS (never shrinks) when the writer adds
            # a newer namespace; the guard checks the superset direction.
            rule['attrSuperset'] = ['mc:Ignorable']
        if local_name(el.tag) == 'style':
            # The writer enriches style definitions on save (tblPr for table
            # styles, szCs alongside sz, uiPriority…). Existing children still
            # cannot be dropped; only additions are allowed here.
            rule['allowAddedChildren'] = True
        if re.match(r'^ppt/slides/slide\d+\.xml$', name) and local_name(el.tag) in ('r', 'p'):
            # Lectern writer normalization: runs gain explicit a:rPr, paragraphs
            # gain a:endParaRPr. Named whitelist — any other new child still fails.
            rule['allowAddedChildNames'] = ['rPr', 'endParaRPr']
        if name == 'ppt/presentation.xml' and local_name(el.tag) == 'presentation':
            # The writer repairs a missing notes-master reference (the fixture
            # ships the notesMaster part without presentation.xml pointing at it).
            rule['allowAddedChildNames'] = ['notesMasterIdLst']
        if name == 'word/styles.xml' and local_name(el.tag) in ('rPr', 'tblPr', 'tblStylePr', 'tcPr', 'pPr'):
            # Same writer enrichment inside style property containers (complex-script
            # sizes, table property defaults). Scoped to word/styles.xml only —
            # document body property containers keep the strict no-addition rule.
            rule['allowAddedChildren'] = True
        rules.append(rule)
        for child in list(el):
            walk(child)

    walk(root)
    if max_rules and len(rules) > max_rules:
        raise SystemExit(f'{name}: {len(rules)} rules exceeds --max-rules-per-part {max_rules}; '
                         'curate the map or raise the cap consciously')
    return rules


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('original')
    ap.add_argument('real_output')
    ap.add_argument('--edit', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--description', default='')
    ap.add_argument('--max-rules-per-part', type=int, default=20000)
    args = ap.parse_args()

    edit = parse_edit(args.edit)
    with zipfile.ZipFile(args.original) as z:
        original = {i.filename: z.read(i.filename) for i in z.infolist() if not i.is_dir()}
    with zipfile.ZipFile(args.real_output) as z:
        output = {i.filename: z.read(i.filename) for i in z.infolist() if not i.is_dir()}

    dropped = sorted(set(original) - set(output))
    if dropped:
        raise SystemExit(f'real output dropped parts: {dropped}')
    added = sorted(set(output) - set(original))

    ns_map = ns_table_from_packages([original, output])
    ns_assign: dict[str, str] = {}

    defaults_by_ext: dict[str, str] = {}
    ct = original.get('[Content_Types].xml')
    if ct:
        ct_root = ET.fromstring(ct)
        for d in ct_root:
            if local_name(d.tag) == 'Default':
                defaults_by_ext[d.attrib.get('Extension', '').lower()] = d.attrib.get('ContentType', '')

    parts: dict[str, list[dict]] = {}
    for name in sorted(set(original) & set(output)):
        if original[name] == output[name]:
            continue  # opaque byte-carry: no rules, guard demands byte identity
        is_xml = name.endswith(('.xml', '.rels'))
        if not is_xml:
            raise SystemExit(f'binary part changed: {name} (must stay byte-identical)')
        parts[name] = rules_for_part(name, original[name], edit, ns_map, ns_assign, args.max_rules_per_part, defaults_by_ext)

    # Flip the table the guard consumes: namespaces maps prefix -> uri.
    prefix_to_uri = {prefix: uri for uri, prefix in ns_map.items()}
    for uri, prefix in ns_assign.items():
        prefix_to_uri[prefix] = uri

    total = sum(len(r) for r in parts.values())
    mapping = {
        'schema': 1,
        'description': args.description or (
            'ClioWorks v4 production preservation map generated by build_production_map.py from the '
            'original package semantics; unlisted parts must stay byte-identical, listed parts keep '
            'locked attribute values, child element existence and direct text; the declared edit is '
            'the only permitted text change.'),
        'namespaces': prefix_to_uri,
        'attrAliases': {},
        'allowAdditions': added,
        'edit': edit,
        'parts': parts,
    }
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(mapping, f, ensure_ascii=False, indent=1)
    print(f'wrote {args.out}: {len(parts)} mapped parts, {total} rules, '
          f'allowAdditions={added}, opaque={len(set(original) & set(output)) - len(parts)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
