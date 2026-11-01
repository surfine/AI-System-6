"""ClioWorks v4 production OOXML preservation guard (V4-01).

Compares an original OOXML package against a REAL editor output under a
production preservation map (JSON, see tests/fixtures/clioworks-v4/*.production-map.json):

- Parts not listed in the map must be byte-identical (opaque carry). A missing
  part is a hard failure; an added part must be listed in allowAdditions.
- For mapped parts, XML is compared semantically: for every locked xpath the
  element must still exist in the output (or be the declared edit), and every
  locked attribute value / locked child element / locked text must be equal.
  Attribute ORDER, child ORDER, namespace prefix spelling and declarations,
  XML declaration bytes, ZIP container layout and shared-string reference
  rewrites are NOT semantics and are ignored.
- The declared edit (edit part/xpath/before/after) must be present exactly
  once in the output.

This is a product preservation contract, not the kit's synthetic single-part
sentinel. It does not validate the full OOXML schema, rendering, or Microsoft
Office acceptance (that stays not_run without Office).
Usage: python ooxml_semantic_guard.py original candidate --map map.json [--out report.json]
Exit 0 when the report status is passed.
"""
from __future__ import annotations

from pathlib import Path
import argparse
import hashlib
import json
import posixpath
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

MAX_PARTS = 10000
MAX_BYTES = 128 * 1024 * 1024
MAX_PART = 32 * 1024 * 1024

PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
CT = 'http://schemas.openxmlformats.org/package/2006/content-types'


class GuardError(Exception):
    pass


def read_package(path: Path) -> dict[str, bytes]:
    out: dict[str, bytes] = {}
    total = 0
    with zipfile.ZipFile(path) as z:
        if len(z.infolist()) > MAX_PARTS:
            raise GuardError('too many ZIP entries')
        for info in z.infolist():
            name = info.filename
            if info.is_dir():
                continue
            if (not name or name.startswith('/') or '\\' in name or '\x00' in name
                    or any(x in ('..', '.') for x in name.split('/'))
                    or posixpath.normpath(name) != name):
                raise GuardError('unsafe ZIP name: ' + repr(name))
            if name in out:
                raise GuardError('duplicate ZIP name: ' + name)
            total += info.file_size
            if info.file_size > MAX_PART or total > MAX_BYTES:
                raise GuardError('expanded ZIP limit exceeded')
            with z.open(info) as f:
                data = f.read(MAX_PART + 1)
            if len(data) != info.file_size or len(data) > MAX_PART:
                raise GuardError('ZIP size mismatch')
            out[name] = data
    if '[Content_Types].xml' not in out or '_rels/.rels' not in out:
        raise GuardError('not an OPC package')
    return out


def parse_xml(data: bytes) -> ET.Element:
    if re.search(br'<!\s*(DOCTYPE|ENTITY)', data, re.I):
        raise GuardError('DTD/entity declaration is forbidden')
    try:
        return ET.fromstring(data)
    except ET.ParseError as e:
        raise GuardError('XML parse failed: ' + str(e)) from e


def local_name(tag: str) -> str:
    return tag.split('}', 1)[1] if tag.startswith('{') else tag


def attr_local(name: str) -> str:
    return name.split('}', 1)[1] if name.startswith('{') else name


def split_steps(path: str) -> list[str]:
    """Split an XPath on '/', honouring {uri} braces and [] predicates."""
    steps: list[str] = []
    current: list[str] = []
    braces = 0
    brackets = 0
    for ch in path:
        if ch == '{':
            braces += 1
        elif ch == '}':
            braces -= 1
        elif ch == '[':
            brackets += 1
        elif ch == ']':
            brackets -= 1
        if ch == '/' and braces == 0 and brackets == 0:
            steps.append(''.join(current))
            current = []
        else:
            current.append(ch)
    steps.append(''.join(current))
    return steps


def resolve_xpath_ns(xpath: str, ns_map: dict[str, str]) -> str:
    """ElementTree accepts {uri}local directly; rewrite s:foo prefixes.
    Namespace prefixes inside attribute predicates [@r:id='…'] are left as-is;
    attribute lookup resolves those through attr_local() at compare time."""
    def repl(match: re.Match) -> str:
        prefix, local = match.group(1), match.group(2)
        uri = ns_map.get(prefix)
        if uri is None:
            raise GuardError(f'unknown namespace prefix {prefix!r} in {xpath!r}')
        return '{%s}%s' % (uri, local)
    # Split on '/' but keep the separators; rewrite only element steps that
    # carry a namespace prefix. Attribute predicates and '.', '..' pass through.
    pieces = split_steps(xpath)
    rewritten = []
    for piece in pieces:
        if piece in ('', '.', '..') or piece.startswith('['):
            rewritten.append(piece)
            continue
        m = re.fullmatch(r"([A-Za-z_][\w.-]*):([A-Za-z_][\w.-]*)((?:\[[^\]]*\])?)", piece)
        if m and not piece.startswith('@'):
            prefix, local, suffix = m.group(1), m.group(2), m.group(3)
            uri = ns_map.get(prefix)
            if uri is None:
                raise GuardError(f'unknown namespace prefix {prefix!r} in {xpath!r}')
            rewritten.append('{%s}%s%s' % (uri, local, suffix))
        else:
            rewritten.append(piece)
    return '/'.join(rewritten)


def step_matches(el: ET.Element, step: str, ns_map: dict[str, str]) -> bool:
    """One path step: tag, optional [n] position handled by the caller, optional
    [@attr='v'] / [@ns:attr='v'] predicate. Positional predicates [n] are left
    attached and evaluated by the caller."""
    tag = step
    attr_name = want = None
    if step.endswith(']'):
        # split off ONE trailing [@attr='v'] predicate; [n] positions were
        # already removed by the caller's bare-step strip.
        m = re.match(r"^(.*?)(?:\[(@[\w:.-]+)=['\"]([^'\"]*)['\"])?\]$", step)
        if m:
            tag = m.group(1)
            attr_name, want = m.group(2), m.group(3)
    if tag not in ('*',) and el.tag != tag:
        # allow namespace-agnostic local match for tags written without prefix
        if local_name(el.tag) != tag or '}' in tag:
            return False
    if attr_name is not None:
        bare_attr = attr_name.lstrip('@')
        if ':' in bare_attr:
            prefix, local = bare_attr.split(':', 1)
            uri = ns_map.get(prefix)
            ok = False
            for k, v in el.attrib.items():
                if attr_local(k) == local and v == want and (uri is None or k == '{%s}%s' % (uri, local) or not k.startswith('{')):
                    ok = True
                    break
            if not ok:
                return False
        elif el.attrib.get(bare_attr) != want:
            return False
    return True


def parse_step(step: str):
    """→ (tag, position|None, predicate|None) with predicate left in tag."""
    m = re.match(r"^(.*?)(?:\[(\d+)\])?$", step)
    return m.group(1), (int(m.group(2)) if m.group(2) else None)


def match_xpath(root: ET.Element, xpath: str, ns_map: dict[str, str],
                cache: dict | None = None) -> list[ET.Element]:
    """Minimal XPath subset: './/' or '//' descent, '/' child steps, [n]
    positions, [@attr='v'] / [@ns:attr='v'] predicates. Namespace prefixes on
    element steps resolve through ns_map. The root itself matches './/tag'."""
    resolved = resolve_xpath_ns(xpath, ns_map)
    descendant = resolved.startswith('.//') or resolved.startswith('//')
    body = resolved[3:] if resolved.startswith('.//') else (resolved[2:] if resolved.startswith('//') else resolved.lstrip('./'))
    steps = [s for s in split_steps(body) if s]

    def descendants(el: ET.Element):
        yield el
        for child in list(el):
            yield from descendants(child)

    parent_of: dict[int, ET.Element] = {}

    def descendants(el: ET.Element):
        yield el
        for child in list(el):
            parent_of[id(child)] = el
            yield from descendants(child)

    current = [root]
    for index, step in enumerate(steps):
        positional = re.search(r"\[(\d+)\]$", step)
        pos = int(positional.group(1)) if positional else None
        if pos is not None:
            bare = re.sub(r"\[(\d+)\]$", "", step)
        else:
            bare = step
        next_level: list[ET.Element] = []
        for el in current:
            if cache is not None:
                key = (id(el), descendant and index == 0, bare)
                matched = cache.get(key)
                if matched is None:
                    pool = list(descendants(el)) if (descendant and index == 0) else list(el)
                    matched = [c for c in pool if step_matches(c, bare, ns_map)]
                    cache[key] = matched
            else:
                pool = list(descendants(el)) if (descendant and index == 0) else list(el)
                matched = [c for c in pool if step_matches(c, bare, ns_map)]
            if pos is not None:
                chosen = matched[pos - 1] if 0 < pos <= len(matched) else None
                if chosen is not None:
                    next_level.append(chosen)
            else:
                next_level.extend(matched)
        current = next_level
    return current


def attr_key(name: str, aliases: dict[str, str]) -> str:
    if name in aliases:
        return aliases[name]
    return name


def locked_attr_value(el: ET.Element, attr: str, ns_map: dict[str, str], aliases: dict[str, str]):
    """Find attribute by local/qualified name, honouring aliases."""
    candidates = [attr]
    if ':' in attr:
        prefix, local = attr.split(':', 1)
        uri = ns_map.get(prefix)
        if uri:
            candidates.append('{%s}%s' % (uri, local))
    for want in candidates:
        want = attr_key(want, aliases)
        for have, value in el.attrib.items():
            if attr_key(have, aliases) == want:
                return value, True
    return None, False


def child_set(el: ET.Element) -> list[str]:
    return sorted(local_name(c.tag) for c in list(el))


def resolve_reference(part: str, value: str, roots: dict[str, ET.Element], mapping: dict) -> str:
    """Shared-string style reference: <c ...><v>INDEX</v> into xl/sharedStrings.xml si text.
    Any other value resolves to itself."""
    sst = roots.get('xl/sharedStrings.xml')
    if sst is None or value is None or not re.fullmatch(r'\d+', str(value)):
        return value
    ns_map = mapping.get('namespaces', {})
    try:
        items = sst.findall(resolve_xpath_ns('.//s:si', ns_map))
    except GuardError:
        return value
    index = int(value)
    if index < 0 or index >= len(items):
        return value
    return ''.join(items[index].itertext())


def compare_mapped(part: str, original_root: ET.Element, candidate_root: ET.Element,
                   rules: list[dict], ns_map: dict[str, str], aliases: dict[str, str],
                   edit: dict | None, before_roots: dict, after_roots: dict, mapping: dict,
                   match_cache: dict | None = None) -> list[dict]:
    issues: list[dict] = []
    for rule in rules:
        xpath = rule.get('xpath')
        if not isinstance(xpath, str) or not xpath:
            issues.append({'part': part, 'code': 'MAP_ERROR', 'message': 'rule missing xpath'})
            continue
        before_hits = match_xpath(original_root, xpath, ns_map, match_cache)
        if len(before_hits) != 1:
            issues.append({'part': part, 'code': 'MAP_ERROR', 'message': f'map xpath must match exactly one original node: {xpath} (got {len(before_hits)})'})
            continue
        before_el = before_hits[0]
        after_hits = match_xpath(candidate_root, xpath, ns_map, match_cache)
        is_edit = bool(edit) and edit.get('part') == part and edit.get('xpath') == xpath
        if len(after_hits) == 0:
            issues.append({'part': part, 'code': 'LOCKED_ELEMENT_DROPPED', 'xpath': xpath})
            continue
        if len(after_hits) > 1:
            issues.append({'part': part, 'code': 'LOCKED_ELEMENT_DUPLICATED', 'xpath': xpath, 'count': len(after_hits)})
            continue
        after_el = after_hits[0]
        if local_name(before_el.tag) != local_name(after_el.tag):
            issues.append({'part': part, 'code': 'LOCKED_TAG_CHANGED', 'xpath': xpath,
                           'before': local_name(before_el.tag), 'after': local_name(after_el.tag)})
            continue
        for attr in rule.get('keepAttrs', []):
            before_value, _ = locked_attr_value(before_el, attr, ns_map, aliases)
            after_value, found = locked_attr_value(after_el, attr, ns_map, aliases)
            if not found:
                issues.append({'part': part, 'code': 'LOCKED_ATTR_DROPPED', 'xpath': xpath, 'attribute': attr,
                               'before': before_value})
            elif before_value != after_value:
                # attrSuperset (e.g. mc:Ignorable): the writer may EXTEND the
                # value with further namespace prefixes, never shrink it.
                if attr in rule.get('attrSuperset', []):
                    before_tokens = set((before_value or '').split())
                    after_tokens = set((after_value or '').split())
                    if before_tokens and before_tokens <= after_tokens:
                        continue
                # A text reference (shared-string index, relationship id) may
                # be rewritten when the referenced text is identical, or is the
                # declared edit's before/after pair.
                if rule.get('reference'):
                    before_resolved = resolve_reference(part, before_value, before_roots, mapping) if before_value is not None else None
                    after_resolved = resolve_reference(part, after_value, after_roots, mapping) if after_value is not None else None
                    if before_resolved == after_resolved:
                        continue
                    if edit and before_resolved == edit.get('before') and after_resolved == edit.get('after'):
                        continue
                issues.append({'part': part, 'code': 'LOCKED_ATTR_CHANGED', 'xpath': xpath, 'attribute': attr,
                               'before': before_value, 'after': after_value})
        locked_children = sorted(rule.get('keepChildren', []))
        if locked_children:
            actual = child_set(after_el)
            for want in locked_children:
                if want not in actual:
                    issues.append({'part': part, 'code': 'LOCKED_CHILD_DROPPED', 'xpath': xpath, 'child': want})
            # children the map never mentions may be added by the writer only
            # when the rule explicitly allows additions — either any child
            # (allowAddedChildren) or a named whitelist (allowAddedChildNames)
            allow_any = bool(rule.get('allowAddedChildren'))
            allow_names = set(rule.get('allowAddedChildNames', []))
            if not allow_any and allow_names:
                before_actual = child_set(before_el)
                for have in actual:
                    if have not in before_actual and have not in allow_names:
                        issues.append({'part': part, 'code': 'UNDECLARED_CHILD_ADDED', 'xpath': xpath, 'child': have})
            elif not allow_any:
                before_actual = child_set(before_el)
                for have in actual:
                    if have not in before_actual:
                        issues.append({'part': part, 'code': 'UNDECLARED_CHILD_ADDED', 'xpath': xpath, 'child': have})
        if rule.get('keepText') and not is_edit:
            before_text = (before_el.text or '')
            after_text = (after_el.text or '')
            if before_text != after_text:
                if rule.get('reference'):
                    before_resolved = resolve_reference(part, before_text, before_roots, mapping)
                    after_resolved = resolve_reference(part, after_text, after_roots, mapping)
                    if before_resolved == after_resolved:
                        continue
                    if edit and before_resolved == edit.get('before') and after_resolved == edit.get('after'):
                        continue
                issues.append({'part': part, 'code': 'LOCKED_TEXT_CHANGED', 'xpath': xpath,
                               'before': before_text[:120], 'after': after_text[:120]})
    return issues


def check_declared_edit(part: str, candidate_root: ET.Element, edit: dict,
                        ns_map: dict[str, str], aliases: dict[str, str],
                        before_root: ET.Element | None,
                        match_cache: dict | None = None) -> list[dict]:
    issues: list[dict] = []
    resolved = resolve_xpath_ns(edit['xpath'], ns_map)
    hits = match_xpath(candidate_root, edit['xpath'], ns_map, match_cache)
    if edit.get('match') == 'any':
        values = [hit.text or '' for hit in hits] if 'attribute' not in edit else [
            locked_attr_value(hit, edit['attribute'], ns_map, aliases)[0] for hit in hits]
        if edit['after'] not in values:
            issues.append({'part': part, 'code': 'EDIT_NOT_APPLIED', 'xpath': edit['xpath'],
                           'expected': edit['after'], 'actual': values[:8]})
        if edit.get('before') in values:
            issues.append({'part': part, 'code': 'EDIT_INCOMPLETE', 'xpath': edit['xpath'],
                           'before': edit['before']})
        return issues
    if len(hits) != 1:
        return [{'part': part, 'code': 'EDIT_NOT_APPLIED', 'xpath': edit['xpath'], 'matches': len(hits)}]
    el = hits[0]
    if before_root is not None:
        before_hits = match_xpath(before_root, edit['xpath'], ns_map, match_cache)
        if len(before_hits) == 1 and 'attribute' not in edit:
            if (before_hits[0].text or '') != edit.get('before'):
                issues.append({'part': part, 'code': 'EDIT_BEFORE_MISMATCH', 'xpath': edit['xpath'],
                               'expected': edit.get('before'), 'actual': (before_hits[0].text or '')[:120]})
    if 'attribute' in edit:
        value, found = locked_attr_value(el, edit['attribute'], ns_map, aliases)
        if not found or value != edit['after']:
            issues.append({'part': part, 'code': 'EDIT_NOT_APPLIED', 'xpath': edit['xpath'],
                           'attribute': edit['attribute'], 'expected': edit['after'], 'actual': value if found else None})
    else:
        if (el.text or '') != edit['after']:
            issues.append({'part': part, 'code': 'EDIT_NOT_APPLIED', 'xpath': edit['xpath'],
                           'expected': edit['after'], 'actual': (el.text or '')[:120]})
    return issues


def compare(original_path: Path, candidate_path: Path, mapping: dict) -> dict:
    if mapping.get('schema') != 1:
        raise GuardError('unsupported preservation map schema')
    ns_map = mapping.get('namespaces', {})
    aliases = mapping.get('attrAliases', {})
    parts_map: dict[str, list[dict]] = mapping.get('parts', {})
    allow_additions = set(mapping.get('allowAdditions', []))
    edit = mapping.get('edit')

    before = read_package(original_path)
    after = read_package(candidate_path)
    issues: list[dict] = []
    match_cache: dict = {}
    opaque_preserved: list[str] = []
    mapped_parts: list[str] = []
    before_roots: dict[str, ET.Element] = {}
    after_roots: dict[str, ET.Element] = {}
    for name in set(before) & set(after):
        if name in parts_map or name == (edit or {}).get('part'):
            try:
                before_roots[name] = parse_xml(before[name])
                after_roots[name] = parse_xml(after[name])
            except GuardError:
                pass

    for name in sorted(set(before) | set(after)):
        if name not in before:
            if name not in allow_additions:
                issues.append({'part': name, 'code': 'UNDECLARED_ADDITION'})
            continue
        if name not in after:
            issues.append({'part': name, 'code': 'PART_DROPPED'})
            continue
        if name not in parts_map:
            if before[name] == after[name]:
                opaque_preserved.append(name)
            else:
                issues.append({'part': name, 'code': 'OPAQUE_BYTE_CHANGE'})
            continue
        mapped_parts.append(name)
        # relationships parts keep target/id/type semantics; XML parts use rules
        try:
            before_root = before_roots.get(name) or parse_xml(before[name])
            after_root = after_roots.get(name) or parse_xml(after[name])
        except GuardError as e:
            issues.append({'part': name, 'code': 'XML_REJECTED', 'message': str(e)})
            continue
        issues.extend(compare_mapped(name, before_root, after_root, parts_map[name], ns_map, aliases, edit, before_roots, after_roots, mapping, match_cache))
        if edit and edit.get('part') == name:
            issues.extend(check_declared_edit(name, after_root, edit, ns_map, aliases, before_root, match_cache))

    if edit and edit.get('part') not in parts_map:
        issues.append({'part': edit.get('part'), 'code': 'MAP_ERROR', 'message': 'edit part has no preservation rules'})

    return {
        'schema': 1,
        'status': 'passed' if not issues else 'failed',
        'scope': 'production preservation map: opaque byte-carry + declared XML semantics; NOT Office acceptance',
        'originalSha256': hashlib.sha256(Path(original_path).read_bytes()).hexdigest(),
        'candidateSha256': hashlib.sha256(Path(candidate_path).read_bytes()).hexdigest(),
        'originalParts': len(before),
        'candidateParts': len(after),
        'opaqueBytePreservedParts': opaque_preserved,
        'mappedParts': mapped_parts,
        'issues': issues,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('original')
    parser.add_argument('candidate')
    parser.add_argument('--map', required=True, dest='map_path')
    parser.add_argument('--out')
    args = parser.parse_args()
    try:
        mapping = json.loads(Path(args.map_path).read_text())
        report = compare(Path(args.original), Path(args.candidate), mapping)
    except (GuardError, zipfile.BadZipFile, OSError, ValueError) as e:
        report = {'status': 'failed', 'code': 'INPUT_REJECTED', 'message': str(e)}
    text = json.dumps(report, ensure_ascii=False, indent=2)
    if args.out:
        Path(args.out).write_text(text)
    print(text)
    return 0 if report['status'] == 'passed' else 1


if __name__ == '__main__':
    sys.exit(main())
