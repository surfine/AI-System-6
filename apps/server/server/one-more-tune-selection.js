// Whole-round selection for the two text editions (presenter relay, keynote
// line). Shared by both authorities so the exclusion rule is one rule.
//
// Provenance: copied verbatim from one_more_tune_improvement_20260922
// (modules/one-more-tune-selection.js, 2026-09-22), which the 2026-09-23 era
// package instructs this desk to adopt together with the 41 questions. Its own
// words: quotas are editorial policy, not measured test validity; the search is
// bounded and a timeout is NOT reported as proof of infeasibility.
//
// The rule it enforces in one place:
//   * one question per shared-evidence component, transitive (a bridged item
//     keeps A -> B -> C a conflict even when it is itself outside the round);
//   * per-event and per-answer caps, so a round is not one afternoon;
//   * at least minEras era buckets and minOld historical questions.
// It fails with a SelectionError carrying a code rather than quietly shrinking
// the round, and the route turns that into an unavailable response without the
// bank's contents or a stack.
"use strict";

const { randomInt } = require('node:crypto');

class SelectionError extends Error {
  constructor(code, detail) { super(detail); this.name = 'SelectionError'; this.code = code; }
}
function eraOf(item) {
  const year = Number(String(item.event?.date || '').slice(0, 4));
  if (!Number.isInteger(year) || year < 1976 || year > 2100) return null;
  if (year < 2007) return 'before-2007';
  if (year <= 2011) return '2007-2011';
  if (year <= 2015) return '2012-2015';
  if (year <= 2019) return '2016-2019';
  if (year <= 2022) return '2020-2022';
  return '2023-plus';
}
function textEligible(item) {
  return !!item && typeof item.id === 'string' && !!item.event?.id && !!eraOf(item)
    && item.review?.choicesReviewed === true && item.review?.textDemoEnabled !== false
    && item.review?.quarantined !== true;
}
function conflictComponents(items) {
  const ids = new Set(); const parent = new Map();
  for (const item of items) {
    if (ids.has(item.id)) throw new SelectionError('duplicate_id', item.id);
    ids.add(item.id); parent.set(item.id, item.id);
  }
  function root(id) { let n = id; while (parent.get(n) !== n) n = parent.get(n);
    while (parent.get(id) !== id) { const next = parent.get(id); parent.set(id, n); id = next; } return n; }
  function union(a,b) { const ra = root(a), rb = root(b); if (ra !== rb) parent.set(rb,ra); }
  const owner = new Map();
  for (const item of items) {
    const keys = [];
    if (item.sharedGroup) keys.push(`group:${item.sharedGroup}`);
    for (const key of item.spoilerGroups || []) if (key) keys.push(`group:${key}`);
    // Existing bank's phraseNote reveals the other use; conservative until edited.
    if (item.phrase?.id) keys.push(`phrase:${item.phrase.id}`);
    for (const key of keys) { if (owner.has(key)) union(item.id,owner.get(key)); else owner.set(key,item.id); }
    for (const other of item.revealsQuestionIds || []) {
      if (!ids.has(other)) throw new SelectionError('dangling_spoiler_reference', `${item.id} -> ${other}`);
      union(item.id,other);
    }
  }
  return new Map(items.map(item => [item.id,root(item.id)]));
}
function shuffled(values, rng) {
  const a = [...values]; for (let i = a.length-1;i>0;i--) { const j = rng(i+1);
    if (!Number.isInteger(j) || j<0 || j>i) throw new TypeError('rng must return an integer below its bound');
    [a[i],a[j]]=[a[j],a[i]];
  } return a;
}
/**
 * Select a whole round. Quotas are editorial policy, not measured test validity.
 * Fails explicitly rather than quietly shrinking the round or dropping a quota.
 * The search is bounded; a timeout is NOT reported as proof of infeasibility.
 */
function pickDiverseItems(allItems, options = {}) {
  const {size=10,maxPerEvent=2,minEras=3,minOld=4,maxPerAnswer=2,
    oldYear=2019,maxNodes=50000,rng=randomInt} = options;
  for (const [name,n] of Object.entries({size,maxPerEvent,minEras,minOld,maxPerAnswer,oldYear,maxNodes}))
    if (!Number.isInteger(n) || n<0) throw new TypeError(`Invalid ${name}`);
  if (size<1 || maxPerEvent<1 || maxPerAnswer<1 || minOld>size || minEras>size || maxNodes<1)
    throw new TypeError('Inconsistent round constraints');
  if (!Array.isArray(allItems)) throw new TypeError('items must be an array');
  // Build on ALL items, including quarantined bridges, so A -> B -> C remains a conflict.
  const groups = conflictComponents(allItems);
  const items = shuffled(allItems.filter(textEligible),rng);
  if (new Set(items.map(i=>groups.get(i.id))).size<size)
    throw new SelectionError('insufficient_independent_groups','Not enough reviewed independent text groups');
  if (new Set(items.map(eraOf)).size<minEras)
    throw new SelectionError('insufficient_eras','Not enough reviewed eras');
  const old = i => Number(i.event.date.slice(0,4))<=oldYear;
  if (new Set(items.filter(old).map(i=>groups.get(i.id))).size<minOld)
    throw new SelectionError('insufficient_historical_groups','Not enough reviewed historical groups');
  const picked=[], used=new Set(), events=new Map(), eras=new Map(), answers=new Map();
  let visited=0, exhausted=false, oldCount=0;
  function walk() {
    if (++visited>maxNodes) { exhausted=true; return false; }
    if (picked.length===size) return eras.size>=minEras && oldCount>=minOld;
    const need=size-picked.length;
    let candidates=items.filter(i=>!used.has(groups.get(i.id)) && (events.get(i.event.id)||0)<maxPerEvent
      && (!i.answer || (answers.get(i.answer)||0)<maxPerAnswer));
    if (new Set(candidates.map(i=>groups.get(i.id))).size<need) return false;
    const possibleEras=new Set([...eras.keys(),...candidates.map(eraOf)]);
    if(possibleEras.size<minEras || eras.size+need<minEras) return false;
    if(oldCount+Math.min(need,new Set(candidates.filter(old).map(i=>groups.get(i.id))).size)<minOld) return false;
    // Stable tie order was shuffled once; prioritize unsatisfied coverage requirements.
    const priority=i=>(eras.size<minEras && !eras.has(eraOf(i))?4:0)+(oldCount<minOld && old(i)?2:0);
    candidates.sort((a,b)=>priority(b)-priority(a));
    for(const item of candidates) {
      const g=groups.get(item.id), e=item.event.id, er=eraOf(item), a=item.answer;
      used.add(g);picked.push(item);events.set(e,(events.get(e)||0)+1);eras.set(er,(eras.get(er)||0)+1);
      if(a) answers.set(a,(answers.get(a)||0)+1);if(old(item))oldCount++;
      if(walk())return true;
      used.delete(g);picked.pop();
      for(const [map,key] of [[events,e],[eras,er],...(a?[[answers,a]]:[])]) { const n=map.get(key)-1;if(n)map.set(key,n);else map.delete(key); }
      if(old(item))oldCount--;
      if(exhausted)return false;
    }
    return false;
  }
  if(!walk())throw new SelectionError(exhausted?'selection_search_limit':'no_round_satisfies_constraints',
    exhausted?'Search budget exceeded; constraints were not relaxed':'No selection meets the editorial constraints');
  // Coverage selection order is not presentation order.
  return shuffled(picked,rng);
}
module.exports={pickDiverseItems,conflictComponents,eraOf,textEligible,SelectionError};
